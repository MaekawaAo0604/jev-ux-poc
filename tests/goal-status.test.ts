import {test} from 'node:test';
import assert from 'node:assert/strict';
import {jevDecide} from '../jev/decide.js';
import {candidatesFor,type State} from '../jev/types.js';
import {pendingGoalChecks} from '../jev/goal-status.js';

const state:State={goal:'条件と時間を知りたい。登録はしない。',currentDate:'2026-09-20',history:[{screen:'案内',action:'下にスクロール',result:'次の画面',observedText:['会員の子どもが対象'],observedWarnings:['PARTIAL_TEXT']}],screen:{title:'利用案内',text:['平日10時から17時'],warnings:[],elements:[],canScrollDown:true,canScrollUp:true}};
const choices=candidatesFor(state.screen,true);
async function withProvider(run:()=>Promise<void>,respond:(input:any)=>Promise<any>){
 const previous=globalThis.AI_SDK_DEFAULT_PROVIDER,key=process.env.AI_GATEWAY_API_KEY;
 globalThis.AI_SDK_DEFAULT_PROVIDER={evaluationModel:()=>({specificationVersion:'v4',provider:'TEST',modelId:'TEST',supportedQuestionTypes:['choice'],doEvaluate:respond})} as any;
 process.env.AI_GATEWAY_API_KEY='LOCAL_TEST_ONLY';
 try{await run();}finally{globalThis.AI_SDK_DEFAULT_PROVIDER=previous;if(key===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=key;}
}
function answers(questions:any,select:(id:string)=>string){const pick=(id:string)=>id.startsWith('intent_')?'general':id.startsWith('screen_')?'relevant':id.startsWith('scope_')?'match':id.startsWith('evidence_')?'direct':select(id);return {answers:Object.fromEntries(Object.entries(questions).map(([id,q]:[string,any])=>[id,{type:'choice',choice:pick(id),probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k===pick(id)?1:0]))}])),warnings:[]};}
const decide=(s=state,checks=['条件','時間'])=>jevDecide(s,choices,{goalChecks:checks});

test('navigation prioritizes missing observations without declaring ungrounded observations complete',async()=>{
 for(const missing of ['absent','uncertain'])await withProvider(async()=>{
  const decision=await decide();
  assert.equal(decision.action.type,'scroll');
  assert.deepEqual(pendingGoalChecks(decision.goalAssessment!),['条件','時間']);
  assert.deepEqual((decision as any).navigationFocus,{priorityGoalChecks:['時間'],verificationPendingGoalChecks:['条件']});
 },async({state:input,questions})=>{
  if(questions.nextAction){
   assert.deepEqual(input.remainingGoalChecks,['条件','時間']);
   assert.deepEqual(input.priorityGoalChecks,['時間']);
   assert.deepEqual(input.verificationPendingGoalChecks,['条件']);
   assert.ok(!questions.nextAction.criteria.done);
   assert.match(questions.nextAction.instructions,/priorityGoalChecks/);
  }
  const r=answers(questions,id=>id==='nextAction'?'scroll_down':id==='coverage'?'complete':id==='check_1'?missing:'present');
  for(const [id,a] of Object.entries(r.answers) as [string,any][])if(id.startsWith('evidence_')){a.choice='uncertain';a.probabilities={direct:.4,related:0,uncertain:.6};}
  return r;
 });
});

test('when observations exist but grounding fails navigation must return to the unverified items',async()=>{
 await withProvider(async()=>{
  const decision=await decide();assert.equal(decision.action.type,'scroll');
  assert.deepEqual(pendingGoalChecks(decision.goalAssessment!),['条件','時間']);
 },async({state:input,questions})=>{
  if(questions.nextAction){
   assert.deepEqual(input.priorityGoalChecks,['条件','時間']);
   assert.deepEqual(input.verificationPendingGoalChecks,['条件','時間']);
   assert.ok(!questions.nextAction.criteria.done);
  }
  const r=answers(questions,id=>id==='nextAction'?'scroll_down':id==='coverage'?'complete':'present');
  for(const [id,a] of Object.entries(r.answers) as [string,any][])if(id.startsWith('evidence_')){a.choice='uncertain';a.probabilities={direct:.4,related:0,uncertain:.6};}
  return r;
 });
});

test('action selection omits duplicate region bodies but preserves observed text, warnings and navigation history',async()=>{
 const region=(text:string)=>({id:'r1',source:'dom' as const,text,bbox:{x0:0,y0:0,x1:100,y1:20},context:{landmark:'main' as const,section:'local-section',headings:[]}});
 const original:State={...state,screen:{...state.screen,regions:[region(state.screen.text[0])]},history:state.history.map(h=>({...h,observedRegions:[region(h.observedText![0])]}))};
 const copy=structuredClone(original);let actionInputs=0,input:any;
 await withProvider(async()=>{
  assert.equal((await decide(original)).action.type,'scroll');
  assert.equal(actionInputs,1);assert.deepEqual(original,copy,'evidence provenance must remain unchanged');
   assert.equal(input.screen.regions,undefined);
   assert.ok(input.history.every((h:any)=>!Object.hasOwn(h,'observedRegions')));
   assert.deepEqual(input.screen.text,copy.screen.text);
   assert.deepEqual(input.screen.elements,copy.screen.elements);
   assert.ok(Array.isArray(input.observations));
   const decoded=input.history.map(({observationId,...entry}:any)=>{
    const observation=input.observations.find((o:any)=>o.id===observationId);
    assert.ok(observation,'every action must resolve to its preserved observation');
    const {id,...payload}=observation;
    return {...entry,...payload};
   });
   assert.deepEqual(decoded,copy.history.map(({observedRegions,...entry})=>entry));
   assert.equal(input.goal,copy.goal);assert.equal(input.currentDate,copy.currentDate);
   assert.deepEqual(input.remainingGoalChecks,['時間']);
 },async({state:received,questions})=>{
  if(questions.nextAction){actionInputs++;input=received;}
  return answers(questions,id=>id==='nextAction'?'scroll_down':id==='coverage'?'complete':id==='check_1'?'absent':'present');
 });
});

test('all covered goal checks end exploration without asking for another action',async()=>{
 let actionRequests=0;
 await withProvider(async()=>{
  const decision=await decide();
  assert.equal(decision.action.type,'done');assert.equal(actionRequests,0);
  assert.ok(decision.goalAssessment?.request);
  assert.deepEqual(decision.probabilities,{},'do not manufacture an action probability for the separate goal judgment');
  assert.deepEqual(decision.goalAssessment.checks.map((c:any)=>[c.text,c.choice]),[['条件','present'],['時間','present']]);
  assert.equal(decision.goalAssessment.request.attempts,1);
 },async({questions})=>{
  if(questions.nextAction)actionRequests++;
  return answers(questions,id=>id==='nextAction'?'scroll_down':id==='coverage'?'complete':'present');
 });
});

test('missing or uncertain checks continue and cannot be bypassed by an action-level done',async()=>{
 for(const status of ['absent','uncertain'])await withProvider(async()=>{
  const decision=await decide();assert.equal(decision.action.type,'scroll');
  assert.ok(decision.goalAssessment);
  assert.equal(decision.goalAssessment.checks[1].choice,status);
  assert.ok(!Object.hasOwn(decision.probabilities,'done'));
 },async({state:input,questions})=>{
  if(questions.nextAction){
   assert.ok(!Object.hasOwn(questions.nextAction.criteria,'done'));
   assert.deepEqual(input.remainingGoalChecks,['時間']);
   assert.deepEqual(input.screen,state.screen);
  }
  return answers(questions,id=>id==='nextAction'?'scroll_down':id==='coverage'?'complete':id==='check_1'?status:'present');
 });
});

test('an incomplete checklist stops before navigation instead of falsely completing',async()=>{
 await withProvider(async()=>{
  await assert.rejects(decide(),(e:any)=>{assert.equal(e.code,'GOAL_CHECKS_INCOMPLETE');assert.equal(e.goalAssessment.coverage.choice,'incomplete');return true;});
 },async({questions})=>{
  assert.ok(!questions.nextAction,'must not request navigation with invalid goal coverage');
  return answers(questions,id=>id==='coverage'?'incomplete':'present');
 });
});

test('goal judgments retain observed warnings and omit raw selectors or oracle-only fields',async()=>{
 const augmented={...state,referenceAnswer:'ORACLE',targetURL:'PRIVATE',screen:{...state.screen,selector:'INTERNAL'}};
 await withProvider(async()=>{assert.equal((await decide(augmented)).action.type,'done');},async({state:input,questions})=>{
  assert.ok(!questions.nextAction);
  if(!Object.keys(questions).some(id=>id.startsWith('evidence_')))assert.equal(input.goal,state.goal);
  if(input.goalChecks)assert.deepEqual(input.goalChecks,['条件','時間']);
  if(input.observations){
   assert.deepEqual(input.observations[0],{text:['会員の子どもが対象'],warnings:['PARTIAL_TEXT'],omitted:false});
   assert.deepEqual(input.observations[1].text,['平日10時から17時']);
  }else if(input.checks?.[0])assert.equal(input.checks[0].evidence[0].text,'会員の子どもが対象');
  assert.doesNotMatch(JSON.stringify(input),/ORACLE|PRIVATE|INTERNAL/);
  return answers(questions,id=>id==='coverage'?'complete':'present');
 });
});

test('a failed action selection retains the preceding goal assessment and safe failure metadata',async()=>{
 await withProvider(async()=>{
  await assert.rejects(decide(),(e:any)=>{assert.equal(e.stage,'action-selection');assert.equal(e.goalAssessment.checks[1].choice,'absent');assert.equal(e.failure.statusCode,401);assert.doesNotMatch(JSON.stringify(e),/SECRET/);return true;});
 },async({questions})=>{
  if(questions.nextAction)throw Object.assign(new Error('SECRET'),{statusCode:401});
  return answers(questions,id=>id==='coverage'?'complete':id==='check_1'?'absent':'present');
 });
});
