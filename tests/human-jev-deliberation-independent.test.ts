import {normalizeJevImageWire,currentJevImage} from './jev-image-wire.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PNG} from 'pngjs';
import {runHumanJev} from '../runner/human-jev-experiment.js';

const json=async(path:string)=>JSON.parse(await readFile(path,'utf8'));
async function fixture(maximum=24,used=0){
 const dir=await mkdtemp(join(tmpdir(),'human-delib-independent-')),ledger=join(dir,'ledger.json');
 const attempts=Array.from({length:used},(_,i)=>({id:'LOCAL_PRIOR_'+i,ordinal:i+1,status:'OK',runKey:'LOCAL_PRIOR_'+i,condition:'LOCAL_FIXTURE',revision:'LOCAL',sourceHash:'LOCAL',metadata:{attempts:1}}));
 await writeFile(ledger,JSON.stringify({schemaVersion:1,status:'APPROVED',phase:'INDEPENDENT_LOCAL_ONLY',newMaximum:maximum,perRunMaximum:12,used,attempts}));return {dir,ledger};
}
function response(body:any,next='wait'){
 const current=body.state.observation.id;
 return new Response(JSON.stringify({model:'jev-1.14.0',answers:Object.fromEntries(Object.entries(body.questions as Record<string,{criteria:Record<string,string>}>).map(([id,q])=>{
  const choice=id==='knowledge'?'insufficient':id==='goal'?'unsatisfied':id==='goalEvidence'||id.startsWith('evidence_')?current:id.startsWith('effect_')?'conflicts':id==='nextAction'?next:id==='decisionBasis'?'uncertainty':'none';
  assert.ok(Object.hasOwn(q.criteria,choice),`No invented response choice for ${id}`);
  return [id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k===choice?1:0]))}];
 }))}),{status:200});
}
async function localHTTP(fn:(body:any)=>Response|Promise<Response>,run:()=>Promise<void>){
 const oldFetch=globalThis.fetch,oldKey=process.env.AI_GATEWAY_API_KEY;process.env.AI_GATEWAY_API_KEY='LOCAL_TEST_ONLY';
 globalThis.fetch=async(url,options)=>{assert.equal(String(url),'https://ai-gateway.vercel.sh/typesafe/v1/systemone');const body=JSON.parse(String(options!.body));normalizeJevImageWire(body);return fn(body);};
 try{await run();}finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=oldKey;}
}

test('independent deliberation wrapper: twelve assessment/action pairs keep every candidate and revisit available within 24 real-adapter reservations',async(t)=>{
 const {dir,ledger}=await fixture();let assessments=0,actions=0;const stages:string[]=[];let assessmentState:any,assessmentImage='';
 t.mock.method(process,'loadEnvFile',()=>{throw new Error('ENV_FILE_MUST_NOT_BE_READ');});
 await localHTTP(body=>{
  assert.doesNotMatch(JSON.stringify({state:body.state,questions:body.questions}),/participant-feedback|selfAttested|reportedOutcome|通知設定だから設定|文字小さかった/);
  const state=normalizeJevImageWire(body).state;assert.equal(state.observation.screen,undefined);assert.equal(state.exploration.persona,undefined);assert.equal(state.exploration.charter.oracle,undefined);assert.ok(state.userState.memory.every((m:any)=>m.visibleText.length===0));
  const png=PNG.sync.read(Buffer.from(currentJevImage(body).data_base64,'base64'));assert.equal(png.width,1280);assert.equal(png.height,900);
  if(body.questions.knowledge){
   assessments++;stages.push('assessment');assessmentState=structuredClone(state);assessmentImage=currentJevImage(body).data_base64;
   assert.equal(body.questions.nextAction,undefined);return response(body);
  }
  assert.ok(body.questions.nextAction,'No separate UX review is admitted in the 24-request profile');actions++;stages.push('action');assert.equal(assessments,actions);
  assert.equal(currentJevImage(body).data_base64,assessmentImage);assert.deepEqual(state.observation,assessmentState.observation);
  assert.deepEqual(Object.keys(body.questions.nextAction.criteria),state.observation.candidateIds);
  const current=state.userState.deliberation.assessments.at(-1);assert.equal(current.observationId,state.observation.id);assert.equal(current.knowledge,'insufficient');assert.equal(current.goal,'unsatisfied');assert.equal(current.kind,'model-assessment-not-fact');
  for(const id of state.observation.candidateIds.filter((id:string)=>/^e\d+$/.test(id))){assert.equal(current.effects[id].prediction,'conflicts');assert.match(body.questions.nextAction.criteria[id],new RegExp('^\\['+id+'\\] '));assert.match(body.questions.nextAction.criteria[id],/effect=conflicts/);}
  assert.ok(body.questions.nextAction.criteria.done);assert.match(body.questions.nextAction.criteria.done,/goal=unsatisfied/);assert.ok(body.questions.nextAction.criteria.look_0);assert.ok(body.questions.nextAction.criteria.wait);
  return response(body,actions%2?'e4':'back');
 },async()=>{
  const saved=await runHumanJev({out:join(dir,'run'),mock:false,phaseBudget:ledger,mode:'deliberation'}),r=saved.result,l=await json(ledger),m=await json(join(saved.root,'manifest.json'));
  assert.equal(assessments,12);assert.equal(actions,12);assert.deepEqual(stages,Array.from({length:12},()=>['assessment','action']).flat());assert.equal(m.actualAPIRequests,24);assert.equal(m.totalEvaluatorCalls,24);assert.equal(m.reviewMaximum,0);assert.equal(l.used,24);assert.equal(l.remaining,0);assert.ok(l.attempts.every((a:any)=>a.status==='OK'&&a.metadata.attempts===1));
  assert.equal(l.attempts.filter((a:any)=>a.runKey.endsWith('/assessment')).length,12);assert.equal(l.attempts.filter((a:any)=>a.runKey.endsWith('/action')).length,12);assert.equal(l.attempts.filter((a:any)=>a.runKey.endsWith('/review')).length,0);
  assert.equal(r.apiCalls,24);assert.equal(r.decisions,12);assert.equal(r.uiActions,12);assert.equal(r.looks,0);assert.equal(r.termination,'DECISION_LIMIT');assert.equal(r.objectiveSuccess,false);assert.equal(r.validForComparison,true);assert.equal(r.perceivedDone,false);
  assert.deepEqual(saved.review,{status:'NOT_RUN',reason:'PROFILE_DISABLED'});assert.equal(existsSync(join(saved.root,'review-input.json')),false);
  for(const step of r.steps){assert.equal(step.deliberation!.apiCalls,1);assert.deepEqual(step.selection!.adjustments,[]);assert.equal(step.selection!.raw[step.selection!.selected],1);assert.equal(step.selection!.filtered[step.selection!.selected],1);}
 });
});

test('independent deliberation wrapper: baseline ledger is rejected untouched and the final phase slot cannot admit an action after its assessment',async()=>{
 const old=await fixture(13),before=await readFile(old.ledger);let calls=0;
 await localHTTP(body=>{calls++;return response(body);},async()=>{
  await assert.rejects(runHumanJev({out:join(old.dir,'refused'),mock:false,phaseBudget:old.ledger,mode:'deliberation'}),/EXPECTED_APPROVED_24_REQUEST_PHASE/);
  assert.equal(calls,0);assert.deepEqual(await readFile(old.ledger),before);assert.equal(existsSync(join(old.dir,'refused')),false);assert.equal(existsSync(old.ledger+'.lock'),false);
 });
 const last=await fixture(24,23);
 await localHTTP(body=>{calls++;assert.ok(body.questions.knowledge);return response(body);},async()=>{
  const saved=await runHumanJev({out:join(last.dir,'last-slot'),mock:false,phaseBudget:last.ledger,mode:'deliberation'}),l=await json(last.ledger);
  assert.equal(calls,1);assert.equal(l.used,24);assert.equal(l.remaining,0);assert.equal(saved.result.apiCalls,1);assert.equal(saved.result.steps[0].deliberation!.apiCalls,1);assert.equal(saved.result.steps[0].response,undefined);assert.equal(saved.result.termination,'API_LIMIT');assert.equal(saved.result.uiActions,0);assert.equal(saved.result.perceivedDone,false);assert.deepEqual(saved.review,{status:'NOT_RUN',reason:'PROFILE_DISABLED'});assert.equal((await json(join(saved.root,'manifest.json'))).actualAPIRequests,1);
 });
});

test('independent deliberation wrapper: assessment/action HTTP failures are infrastructure errors without user action or an extra UX call',async()=>{
 for(const failedStage of ['assessment','action']){
  const {dir,ledger}=await fixture();let calls=0;
  await localHTTP(body=>{calls++;const stage=body.questions.knowledge?'assessment':body.questions.nextAction?'action':'UNEXPECTED_UX';assert.notEqual(stage,'UNEXPECTED_UX');return stage===failedStage?new Response('',{status:503}):response(body);},async()=>{
   const saved=await runHumanJev({out:join(dir,'run'),mock:false,phaseBudget:ledger,mode:'deliberation'}),expected=failedStage==='assessment'?1:2,l=await json(ledger);
   assert.equal(calls,expected);assert.equal(saved.result.apiCalls,expected);assert.equal(l.used,expected);assert.equal(l.attempts.at(-1).status,'ERROR');assert.equal(l.attempts.at(-1).metadata.failureCode,'HTTP_ERROR');assert.equal(saved.result.termination,'API_ERROR');assert.equal(saved.result.validForComparison,false);assert.equal(saved.result.perceivedDone,false);assert.equal(saved.result.uiActions,0);assert.equal(saved.result.looks,0);assert.deepEqual(saved.review,{status:'NOT_RUN',reason:'PROFILE_DISABLED'});assert.equal((await json(join(saved.root,'manifest.json'))).actualAPIRequests,expected);
  });
 }
});

test('independent deliberation wrapper: unsatisfied goal and conflicting predictions do not block a subjective done choice',async()=>{
 const {dir,ledger}=await fixture();let calls=0;
 await localHTTP(body=>{calls++;return response(body,'done');},async()=>{
  const saved=await runHumanJev({out:join(dir,'run'),mock:false,phaseBudget:ledger,mode:'deliberation'});
  assert.equal(calls,2);assert.equal(saved.result.apiCalls,2);assert.equal(saved.result.termination,'SUBJECTIVE_DONE');assert.equal(saved.result.perceivedDone,true);assert.equal(saved.result.objectiveSuccess,false);assert.equal(saved.result.uiActions,0);assert.equal(saved.result.looks,0);assert.equal(saved.result.steps[0].selection!.raw.done,1);assert.equal(saved.result.steps[0].selection!.filtered.done,1);assert.deepEqual(saved.result.steps[0].selection!.adjustments,[]);assert.deepEqual(saved.review,{status:'NOT_RUN',reason:'PROFILE_DISABLED'});
 });
});

test('independent deliberation wrapper: long-context is explicit on both stages, defaults absent, and never adds a retry or changes body/budget',async()=>{
 const captures:Array<Array<{body:any;header:string|null}>>=[[],[]];
 for(const [index,longContext] of [false,true].entries()){
  const {dir,ledger}=await fixture(),oldFetch=globalThis.fetch,oldKey=process.env.AI_GATEWAY_API_KEY;process.env.AI_GATEWAY_API_KEY='LOCAL_TEST_ONLY';
  globalThis.fetch=async(url,options)=>{assert.equal(String(url),'https://ai-gateway.vercel.sh/typesafe/v1/systemone');const body=JSON.parse(String(options!.body)),header=new Headers(options!.headers).get('TypeSafe-Danger-Zone-Long-Context');captures[index].push({body,header});assert.ok(body.questions.knowledge||body.questions.nextAction,'No UX review in this profile');return response(body,'done');};
  try{
   const saved=await runHumanJev({out:join(dir,'run'),mock:false,phaseBudget:ledger,mode:'deliberation',...(longContext?{longContext:true}:{})} as any),l=await json(ledger);
   assert.equal(saved.result.termination,'SUBJECTIVE_DONE');assert.equal(saved.result.apiCalls,2);assert.equal(l.used,2);assert.equal(l.remaining,22);assert.equal(l.attempts.length,2);assert.ok(l.attempts.every((a:any)=>a.metadata.attempts===1));assert.deepEqual(l.attempts.map((a:any)=>a.runKey.split('/').at(-1)),['assessment','action']);assert.equal((await json(join(saved.root,'manifest.json'))).actualAPIRequests,2);assert.deepEqual(saved.review,{status:'NOT_RUN',reason:'PROFILE_DISABLED'});
  }finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=oldKey;}
 }
 assert.equal(captures[0].length,2);assert.equal(captures[1].length,2);assert.ok(captures[0].every(c=>c.header===null),'Existing default must keep the header absent');assert.ok(captures[1].every(c=>c.header==='true'),'Explicit opt-in must reach assessment and action requests');assert.deepEqual(captures[1].map(c=>normalizeJevImageWire(c.body)),captures[0].map(c=>normalizeJevImageWire(c.body)),'Only the header opt-in changes; model body and images stay identical');
});
