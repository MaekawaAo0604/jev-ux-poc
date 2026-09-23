import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assessGoal} from '../jev/goal-status.js';
import type {State} from '../jev/types.js';

import {createEvidenceSession as session} from '../jev/evidence-session.js';
const state:State={goal:'Student conditions and hours',currentDate:'2026-09-21',history:[],screen:{title:'Student',pageId:'p1',text:['Students','Hours 10–17'],regions:[{id:'r1',source:'dom',text:'Students',bbox:{x0:0,y0:0,x1:10,y1:10},context:{landmark:'main',section:'s1',headings:['Students']}},{id:'r2',source:'dom',text:'Hours 10–17',bbox:{x0:0,y0:10,x1:10,y1:20},context:{landmark:'main',section:'s1',headings:['Students']}}],elements:[],canScrollUp:false,canScrollDown:true}};
const checks=['conditions','hours'];
async function provider(run:(calls:any[])=>Promise<void>,fail?:(input:any)=>boolean){
 const previous=globalThis.AI_SDK_DEFAULT_PROVIDER,key=process.env.AI_GATEWAY_API_KEY,calls:any[]=[];
 globalThis.AI_SDK_DEFAULT_PROVIDER={evaluationModel:()=>({specificationVersion:'v4',provider:'TEST',modelId:'TEST',supportedQuestionTypes:['choice'],async doEvaluate(input:any){calls.push(input);if(fail?.(input))throw Object.assign(new Error('SECRET_RAW_ERROR'),{statusCode:401});return {answers:Object.fromEntries(Object.entries(input.questions).map(([id,q]:[string,any])=>{const choice=id==='coverage'?'complete':id.startsWith('intent_')?'general':id.includes('screen_')?'relevant':id.includes('evidence_')?'direct':id.startsWith('scope_')?'match':'present';return [id,{type:'choice',choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k===choice?1:0]))}];})),warnings:[]};}})} as any;
 process.env.AI_GATEWAY_API_KEY='LOCAL_TEST_ONLY';
 try{await run(calls);}finally{globalThis.AI_SDK_DEFAULT_PROVIDER=previous;if(key===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=key;}
}
const assess=(s:State,cache:any)=>(assessGoal as any)(s,checks,cache);

test('unchanged contexts reuse native work without changing exact quotes or earlier assessments',async()=>{
 await provider(async calls=>{
  const cache=await session();const first=await assess(state,cache),before=JSON.stringify(first),count=calls.length;
  const again=await assess(state,cache);assert.equal(calls.length,count,'unchanged immutable state must make no new native calls');
  assert.deepEqual(again.grounding.checks[0].evidence,first.grounding.checks[0].evidence);
  const changed=structuredClone(state);changed.screen.text.push('Exception: students excluded on weekends');
  await assess(changed,cache);assert.ok(calls.length>count,'fresh exception must invalidate final assessment');
  assert.equal(JSON.stringify(first),before,'session growth must not mutate a returned assessment');
 });
});

test('same words on another page or heading require fresh work, but cached quotes map to current source steps',async()=>{
 await provider(async calls=>{
  const cache=await session();await assess(state,cache);const count=calls.length;
  const repeated=structuredClone(state);repeated.history=[{screen:'Earlier',action:'back',result:'returned',observedText:['Unrelated']}];
  const result=await assess(repeated,cache);assert.ok(result.grounding.checks[0].evidence.some((e:any)=>e.id==='s2-t2'&&e.text==='Hours 10–17'));
  const after=calls.length;
  const changed=structuredClone(state);changed.screen.pageId='p2';changed.screen.regions!.forEach(r=>r.context!.headings=['General members']);
  await assess(changed,cache);assert.ok(calls.length>after);assert.ok(after>=count);
 });
});

test('checkpoint restore resumes only missing work and never stores raw failures',async()=>{
 let fail=true,saved:any;
 await provider(async calls=>{
  const cache=await session({checkpoint:async(snapshot:any)=>{saved=structuredClone(snapshot);}});
  await assert.rejects(assess(state,cache));assert.ok(saved,'successful intermediate calls must be checkpointed');
  const before=calls.length,previous=structuredClone(calls.slice(0,-1));
  const snapshot=JSON.parse(JSON.stringify(cache.snapshot()));assert.doesNotMatch(JSON.stringify(snapshot),/SECRET_RAW_ERROR|LOCAL_TEST_ONLY/);
  assert.ok(snapshot.requests.every((r:any)=>Number.isFinite(r.elapsedMs)&&r.elapsedMs>=0&&r.inputBytes>0),'both successful and failed requests need timing and input-size diagnostics');
  fail=false;const restored=await session({snapshot});await assess(state,restored);
  const resumed=calls.slice(before);assert.ok(resumed.length>0);for(const input of resumed)assert.ok(!previous.some(old=>JSON.stringify(old)===JSON.stringify(input)),'successful request repeated after restore');
  assert.ok(restored.snapshot().accounting.failures>=1);
  assert.ok(restored.snapshot().requests.some(r=>r.status==='failed'&&r.failures[0].statusCode===401));
 },input=>fail&&Object.keys(input.questions).some(id=>id.startsWith('grounded_')));
});

test('changed namespace and malformed snapshots cannot reuse previous successes',async()=>{
 await provider(async calls=>{
  const original=await session();await assess(state,original);const snapshot=original.snapshot();
  for(const changed of [{...state,goal:'Different Student conditions and hours'},{...state,currentDate:'2026-09-22'}]){
   const restored=await session({snapshot}),before=calls.length;await assess(changed,restored);assert.ok(calls.length>before);
  }
  const corrupt=await session({snapshot:{version:1,entries:[{answers:{SECRET:'raw'}}]}}),before=calls.length;
  await assess(state,corrupt);assert.ok(calls.length>before);
  const changedChecks=session({snapshot}),beforeChecks=calls.length;await assessGoal(state,['hours'],changedChecks);assert.ok(calls.length>beforeChecks);
  const oldModel=process.env.JEV_GATEWAY_MODEL;
  try{process.env.JEV_GATEWAY_MODEL='different-test-model';const changed=session({snapshot}),before=calls.length;await assess(state,changed);assert.ok(calls.length>before);}finally{if(oldModel===undefined)delete process.env.JEV_GATEWAY_MODEL;else process.env.JEV_GATEWAY_MODEL=oldModel;}
 });
});

test('cached batch inputs stay unchanged when history grows and quotes carry no stale source ids',async()=>{
 await provider(async calls=>{
  const cache=session();await assess(state,cache);const original=calls.length;
  const changed=structuredClone(state);changed.history=[{screen:'Student',action:'scroll',result:'observed',pageId:'p1',observedText:state.screen.text,observedRegions:state.screen.regions}];
  changed.screen.text=['Exception'];changed.screen.regions=[];
  await assess(changed,cache);
  const newCalls=calls.slice(original);
  assert.ok(newCalls.some(c=>Object.keys(c.questions).some(id=>id.startsWith('grounded_'))));
  assert.ok(!newCalls.some(c=>Object.keys(c.questions).some(id=>id.startsWith('evidence_'))&&c.state.quote==='Hours 10–17'),'unchanged content should reuse its prior request');
  assert.doesNotMatch(JSON.stringify(cache.snapshot().entries),/s1-t1|s2-t1/);
 });
});
