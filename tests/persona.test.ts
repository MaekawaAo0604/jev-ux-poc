import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parsePersona,parseCharter,filterCandidates,experimentDecider} from '../jev/persona.js';
import {candidatesFor,type State} from '../jev/types.js';

const charterInput=JSON.parse(await readFile('experiments/persona/charter.json','utf8'));
const personaInput=JSON.parse(await readFile('experiments/persona/persona-a.json','utf8'));
const screen={title:'設定',text:[],elements:[{id:'e1',type:'button' as const,text:'停止する'}],canScrollUp:false,canScrollDown:false};

test('independent inputs reject unsupported targets and unlimited actions',()=>{
 assert.equal(parsePersona(personaInput).id,'A');
 assert.equal(parseCharter(charterInput).id,'notifications-bad');
 assert.throws(()=>parsePersona({...personaInput,knowledge:[]}));
 assert.throws(()=>parsePersona({...personaInput,id:'../escape'}));
 assert.throws(()=>parseCharter({...charterInput,maxActions:0}));
 assert.throws(()=>parseCharter({...charterInput,targetWebsite:'https://example.com'}));
 assert.throws(()=>parseCharter({...charterInput,oracle:'unknown'}));
});

test('charter bans remove executable candidates while preserving stop choices',()=>{
 const charter=parseCharter({...charterInput,prohibitedActions:{actionTypes:['back'],controlTexts:['停止する'],downloads:true}});
 const candidates=filterCandidates(candidatesFor(screen,true),screen,charter);
 assert.deepEqual(Object.keys(candidates),['done','stuck']);
});

test('Jev receives independent persona hypotheses and reports its reason category',async()=>{
 const charter=parseCharter(charterInput),persona=parsePersona(personaInput);
 const state:State={goal:charter.goal,currentDate:charter.initialState.currentDate,screen,history:[],exploration:{persona,charter}};
 const calls:any[]=[];
 const decide=experimentDecider(async(input,questions)=>{
  calls.push({input,questions});
  return {model:'TEST',answers:Object.fromEntries(Object.entries(questions).map(([id,q])=>{
   const choice=id==='decisionBasis'?'confirmation':'e1';
   return [id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k===choice?1:0]))}];
  }))};
 });
 const decision=await decide(state,candidatesFor(screen,false));
 assert.equal(decision.choice,'e1');
 assert.equal(decision.decisionReason?.kind,'model-reported-category');
 if(decision.decisionReason?.kind==='model-reported-category')assert.equal(decision.decisionReason.category,'confirmation');
 assert.equal(calls[0].input.exploration.persona.id,'A');
 assert.ok(calls[0].questions.nextAction.instructions.includes('hypotheses'));
 assert.ok(!JSON.stringify(calls[0].input).includes('oracle'));
});

test('prohibited downloads are excluded before action selection on the bundled local UI',()=>{
 const screen={title:'請求書',text:[],elements:[{id:'e1',type:'button' as const,text:'2026-08 の請求書をPDFで保存'}],canScrollUp:false,canScrollDown:false};
 const charter=parseCharter(charterInput),candidates=candidatesFor(screen,false);
 assert.ok(!filterCandidates(candidates,screen,charter).e1);
 assert.ok(filterCandidates(candidates,screen,{...charter,prohibitedActions:{...charter.prohibitedActions,downloads:false}}).e1);
});
