import {test} from 'node:test';
import assert from 'node:assert/strict';
import {jevDecide} from '../jev/decide.js';
import type {ChoiceEvaluator} from '../jev/client.js';
import type {Candidate,State} from '../jev/types.js';
import type {FrontierOffer} from '../jev/frontier-types.js';
import {chooseFrontier} from '../jev/frontier.js';

const state:State={goal:'再入館の条件を知りたい。購入はしない。',currentDate:'2026-09-23',history:[],screen:{title:'案内',text:['案内'],elements:[],canScrollUp:false,canScrollDown:false}};
const candidates:Record<string,Candidate>={e7:{label:'案内へ',action:{type:'click',elementId:'e7'}},back:{label:'戻る',action:{type:'back'}},stuck:{label:'不明',action:{type:'stuck'}}};
const frontier:FrontierOffer={targets:{f1:{label:'詳細を見る',pageTitle:'案内',context:{headings:['入退場について'],section:'opaque',landmark:'main'},kind:'click',travelSteps:2,nextChoice:'e7'}}};
function evaluator(calls:{input:any;questions:any}[],pick='f1'):ChoiceEvaluator{return async(input,questions)=>{
 calls.push({input,questions});
 return {model:'TEST',answers:Object.fromEntries(Object.entries(questions).map(([id,q])=>{
  const choice=id==='nextAction'?(q.criteria[pick]?pick:Object.keys(q.criteria)[0]):id==='coverage'?'complete':id.startsWith('screen_')?'relevant':id.startsWith('intent_')?'general':'absent';
  return [id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,Number(k===choice)]))}];
 }))};
};}

test('goal-check navigation asks about the untried target, preserves its context and resolves the actual first hop',async()=>{
 const calls:{input:any;questions:any}[]=[];
 const s={...state,history:Array.from({length:80},()=>({screen:'OLD',action:'Scroll',result:'OLD',observedText:['IRRELEVANT_OLD_TEXT']}))};
 const original=structuredClone(s);
 const decision=await jevDecide(s,candidates,{goalChecks:['再入館の条件'],frontier},evaluator(calls));
 const action=calls.find(c=>c.questions.nextAction)!;
 assert.ok(action.input.targets,'target selection must replace full-history action selection');
 assert.doesNotMatch(JSON.stringify(action.input),/IRRELEVANT_OLD_TEXT|observationId|explorationProgress|nextChoice/);
 assert.deepEqual(action.input.targets.f1.headings,['入退場について']);
 assert.deepEqual(decision.action,{type:'click',elementId:'e7'});
 assert.equal(decision.choice,'e7');assert.equal(decision.frontier?.targetId,'f1');
 assert.deepEqual(s,original,'full evidence is retained without modification');
});

test('a committed route continues without action inference but still performs goal checks',async()=>{
 const calls:{input:any;questions:any}[]=[];
 const focus=JSON.stringify(['再入館の条件']);
 const decision=await jevDecide(state,candidates,{goalChecks:['再入館の条件'],frontier:{...frontier,continuation:{targetId:'f1',focus}}},evaluator(calls));
 assert.ok(calls.some(c=>c.questions.coverage));
 assert.equal(calls.filter(c=>c.questions.nextAction).length,0,'known route must not be re-selected at each hop');
 assert.equal(decision.frontier?.mode,'continue');assert.equal(decision.choice,'e7');
});

test('a changed unresolved goal invalidates continuation and asks Jev for a new target',async()=>{
 const calls:{input:any;questions:any}[]=[];
 const decision=await jevDecide(state,candidates,{goalChecks:['再入館の条件'],frontier:{...frontier,continuation:{targetId:'f1',focus:JSON.stringify(['料金'])}}},evaluator(calls));
 assert.equal(calls.filter(c=>c.questions.nextAction).length,1);
 assert.equal(decision.frontier?.mode,'select');
});

test('frontier inference failures propagate without falling back to an arbitrary action',async()=>{
 const calls:{input:any;questions:any}[]=[];
 const base=evaluator(calls);
 await assert.rejects(()=>jevDecide(state,candidates,{goalChecks:['再入館の条件'],frontier},async(input,questions)=>{
  if(questions.nextAction)throw new Error('test inference unavailable');return base(input,questions);
 }));
});

test('large frontiers are compared in bounded groups without dropping late candidates',async()=>{
 const targets=Object.fromEntries(Array.from({length:140},(_,i)=>[`f${i+1}`,{...frontier.targets.f1,label:`対象${i+1}`}])) as FrontierOffer['targets'];
 const seen=new Set<string>();let requests=0;
 const decision=await chooseFrontier(state,candidates,{targets},['再入館の条件'],async(input:any,questions)=>{
  requests++;const keys=Object.keys(input.targets);keys.forEach(k=>seen.add(k));
  assert.ok(keys.length<=64,'request width is bounded independently of total exploration size');
  const choice=keys.includes('f140')?'f140':keys.at(-1)!;
  return {model:'TEST',answers:{nextAction:{choice,probabilities:Object.fromEntries(Object.keys(questions.nextAction.criteria).map(k=>[k,Number(k===choice)]))}}};
 });
 assert.equal(seen.size,140);assert.equal(decision.frontier?.targetId,'f140');assert.equal(requests,4);
});
