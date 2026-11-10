import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {VisualDecisionContext} from '../../jev/visual-context.js';
import {jevDecide,requestFor} from '../../jev/decide.js';
import {evaluateChoices,safeRequestFailure} from '../../jev/client.js';

// Real Jev over saved pixels, not browser navigation. Replay old responses only
// to reconstruct identical pre-frame history; never send reference labels.
process.loadEnvFile('.env');
const root=resolve('reports',`reading-isolation-${new Date().toISOString().replaceAll(':','-')}`);await mkdir(root,{recursive:true});
const source=resolve('reports/2026-10-19T12-27-16.233Z-public/exploration/result.json'),bytes=await readFile(source),run=JSON.parse(bytes.toString());
const oldProbeFile=resolve('reports/reading-context-2026-10-19T12-49-05.744Z/probe.json'),oldProbeBytes=await readFile(oldProbeFile),oldProbe=JSON.parse(oldProbeBytes.toString());
const original=globalThis.fetch,hash=(v:Buffer|string)=>createHash('sha256').update(v).digest('hex');
const fixtures=[{step:25,expectedRepair:'not_shown'},{step:6,expectedRepair:'observed'},{step:3,expectedRepair:'not_shown'}];
const requests:any[]=[],responses:any[]=[],codeHashes=await Promise.all(['jev/visual-context.ts','jev/image-judgments.ts','jev/image-only-input.ts'].map(async file=>({file,sha256:hash(await readFile(file))})));
const checkpoint=()=>writeFile(join(root,'benchmark.json'),JSON.stringify({root,source,sourceSha256:hash(bytes),oldProbeFile,oldProbeSha256:hash(oldProbeBytes),codeHashes,
 method:'Paired serial comparison on fixed screenshots, Goal, candidate order and pre-frame historical judgments. Old mode reconstructs the joint request; new mode invokes production VisualDecisionContext. Alternating order, five repetitions per frame. This is not end-to-end browsing.',fixtures,requests,responses},null,2));
async function prepare(n:number,captureOnly=false){
 const context=new VisualDecisionContext(undefined,true,true,file=>readFile(join(run.dir,file)));let step:any;
 globalThis.fetch=async(_url,init)=>{
  const body=JSON.parse(String(init?.body)),keys=Object.keys(body.questions);
  const recorded=step.visualContext.requests.find((r:any)=>r.step===step.number&&r.status==='recorded'&&keys.every(k=>r.answers[k]));
  assert.ok(recorded,`No saved answer for ${step.number}: ${keys}`);
  return Response.json({model:recorded.model,answers:Object.fromEntries(keys.map(k=>[k,recorded.answers[k]]))});
 };
 try{
  for(step of run.steps.slice(0,n-1)){
   const image=await readFile(join(run.dir,step.screenshot));assert.equal(hash(image),step.visualObservation.sha256);
   context.capture(image,{...step.visualObservation,pageId:step.state.screen.pageId,viewport:step.state.screen.viewport},step.state.screen,step.frontier);
   const result=await jevDecide(step.state,step.candidates,{verifyCompletion:true,preserveTransit:true,frontier:step.frontier,completionEvidence:()=>context.completionEvidence()},(s,q)=>context.evaluate(s,q));
   assert.equal(result.choice,step.decision.choice);if(step.result==='OK')context.recordAction(result.action);
  }
  step=run.steps[n-1];const image=await readFile(join(run.dir,step.screenshot));assert.equal(hash(image),step.visualObservation.sha256);
  context.capture(image,{...step.visualObservation,pageId:step.state.screen.pageId,viewport:step.state.screen.viewport},step.state.screen,step.frontier);
  if(captureOnly){
   const wires:any[]=[],previous=globalThis.fetch;
   globalThis.fetch=async(url,init)=>{wires.push(JSON.parse(String(init?.body)));return previous(url,init);};
   await context.evaluate(step.state,requestFor(step.state,step.candidates,'').questions);
   assert.equal(wires.length,2);assert.ok(wires[0].questions.image_check_1);assert.ok(wires[1].questions.nextAction);
   const action=wires[1],reading=wires[0],{nextAction,...routes}=action.questions;
   const joint={state:action.state,questions:{nextAction,...reading.questions,...routes},assets:action.assets};
   assert.deepEqual(Object.keys(reading.assets),Object.keys(action.assets));
   return {context,joint};
  }
  return {context};
 }catch(error){await context.close();throw error;}
 finally{globalThis.fetch=original;}
}
const plans=new Map<number,any>();
for(const fixture of fixtures){
 const {context,joint}=await prepare(fixture.step,true);await context.close();assert.ok(joint);plans.set(fixture.step,joint);
 if(fixture.step===25){
  const saved=oldProbe.requests.find((r:any)=>r.name==='full-batch');
  const canonical=(state:any,refs:string[])=>{let text=JSON.stringify(state);for(const ref of refs)text=text.replaceAll(ref,'[CURRENT_IMAGE]');return JSON.parse(text);};
  assert.deepEqual(canonical(joint.state,Object.keys(joint.assets)),canonical(saved.state,[saved.state.screenshot]));
  assert.deepEqual(joint.questions,saved.questions,'reconstructed old request must retain original wording, keys and order');
 }
}
await checkpoint();
for(const fixture of fixtures)for(let repeat=1;repeat<=5;repeat++)for(const mode of (repeat%2?['joint','isolated']:['isolated','joint'])){
 const started=performance.now(),calls:any[]=[],plan=plans.get(fixture.step),step=run.steps[fixture.step-1];
 let context:VisualDecisionContext|undefined;
 try{
  if(mode==='isolated')context=(await prepare(fixture.step)).context;
  globalThis.fetch=async(url,init)=>{
   const body=JSON.parse(String(init?.body));requests.push({step:fixture.step,repeat,mode,state:body.state,questions:body.questions,imageSha256:step.visualObservation.sha256});
   const start=performance.now(),response=await original(url,init),record=await response.clone().json() as any;
   calls.push({elapsedMs:performance.now()-start,model:record.model,status:response.status,questionIds:Object.keys(body.questions),answers:record.answers,usage:record.usage});return response;
  };
  const inferenceStarted=performance.now();
  if(mode==='joint')await evaluateChoices(plan.state,plan.questions,{maxAttempts:1,maxElapsedMs:30000},{images:Object.fromEntries(Object.entries(plan.assets).map(([id,i]:[string,any])=>[id,{mediaType:'image/png',data:i.data_base64}]))});
  else await context!.evaluate(step.state,requestFor(step.state,step.candidates,'').questions,{maxAttempts:1,maxElapsedMs:30000});
  const reading=calls.find(c=>c.answers?.image_check_1);
  assert.ok(reading);assert.equal(calls.length,mode==='joint'?1:2);
  responses.push({step:fixture.step,repeat,mode,status:'RECORDED',inferenceMs:performance.now()-inferenceStarted,wallIncludingLocalReplayMs:performance.now()-started,repair:reading.answers.image_check_1.choice,calls});
  console.log(JSON.stringify({step:fixture.step,repeat,mode,repair:reading.answers.image_check_1.choice,inferenceMs:responses.at(-1).inferenceMs}));
 }catch(error){responses.push({step:fixture.step,repeat,mode,status:'ERROR',error:safeRequestFailure(error),calls});}
 finally{globalThis.fetch=original;await context?.close();await checkpoint();}
}
const groups=fixtures.flatMap(f=>(['joint','isolated'] as const).map(mode=>{const draws=responses.filter(r=>r.step===f.step&&r.mode===mode&&r.status==='RECORDED'),times=draws.map(r=>r.inferenceMs).sort((a,b)=>a-b);return {step:f.step,mode,expectedRepair:f.expectedRepair,valid:draws.length,observed:draws.filter(r=>r.repair==='observed').length,matches:draws.filter(r=>r.repair===f.expectedRepair).length,medianInferenceMs:times[Math.floor(times.length/2)],totalApiCalls:draws.reduce((n,r)=>n+r.calls.length,0)};}));
for(const file of codeHashes)assert.equal(hash(await readFile(file.file)),file.sha256);
assert.deepEqual(await readFile(source),bytes);assert.deepEqual(await readFile(oldProbeFile),oldProbeBytes);
await writeFile(join(root,'summary.json'),JSON.stringify({root,groups,errors:responses.filter(r=>r.status==='ERROR').length,sourceFilesUnchanged:true},null,2));
console.log(JSON.stringify({root,groups}));
