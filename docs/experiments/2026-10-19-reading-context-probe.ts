import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {VisualDecisionContext} from '../../jev/visual-context.js';
import {jevDecide} from '../../jev/decide.js';
import {evaluateChoices,safeRequestFailure} from '../../jev/client.js';

process.loadEnvFile('.env');
const root=resolve('reports',`reading-context-${new Date().toISOString().replaceAll(':','-')}`);await mkdir(root,{recursive:true});
const source=resolve('reports/2026-10-19T12-27-16.233Z-public/exploration/result.json'),raw=await readFile(source),run=JSON.parse(raw.toString());
const context=new VisualDecisionContext(undefined,true,true,file=>readFile(join(run.dir,file)));
const original=globalThis.fetch;let step:any,pending:any[]=[],captured:any;
globalThis.fetch=async(_url,init)=>{
 const body=JSON.parse(String(init?.body)),keys=Object.keys(body.questions).sort();
 const index=pending.findIndex(r=>JSON.stringify(Object.keys(r.answers).sort())===JSON.stringify(keys));
 assert.ok(index>=0,`no historical response matching step ${step.number}`);
 const record=pending.splice(index,1)[0];
 if(step.number===25&&body.questions.image_check_1)captured=structuredClone(body);
 return Response.json({model:record.model,answers:record.answers});
};
try{
 for(step of run.steps.slice(0,25)){
  pending=step.visualContext.requests.filter((r:any)=>r.step===step.number&&r.status==='recorded');
  const image=await readFile(join(run.dir,step.screenshot));
  assert.equal(createHash('sha256').update(image).digest('hex'),step.visualObservation.sha256);
  context.capture(image,{...step.visualObservation,pageId:step.state.screen.pageId,viewport:step.state.screen.viewport},step.state.screen,step.frontier);
  const result=await jevDecide(step.state,step.candidates,{verifyCompletion:true,preserveTransit:true,frontier:step.frontier,completionEvidence:()=>context.completionEvidence()},(s,q)=>context.evaluate(s,q));
  assert.equal(result.choice,step.decision.choice);assert.equal(pending.length,0);
  if(step.result==='OK')context.recordAction(result.action);
 }
}finally{globalThis.fetch=original;await context.close();}
assert.ok(captured);assert.equal(Object.keys(captured.assets).length,1);
assert.doesNotMatch(JSON.stringify(captured.state),/https?:|accessibleName|observedText|pageTitle/);
const requests:any[]=[],responses:any[]=[];
const variants=['full-batch','checks-only','no-judgment-memory','no-executed-history','current-image-only'];
for(let repeat=1;repeat<=5;repeat++)for(const name of (repeat%2?variants:[...variants].reverse())){
 const state=structuredClone(captured.state),questions=structuredClone(captured.questions);
 if(['checks-only','current-image-only'].includes(name))delete questions.nextAction;
 if(['no-judgment-memory','current-image-only'].includes(name))delete state.context.imageJudgments;
 if(['no-executed-history','current-image-only'].includes(name))state.context.history=[];
 const images=Object.fromEntries(Object.entries(captured.assets).map(([id,i]:[string,any])=>[id,{mediaType:'image/png' as const,data:i.data_base64}]));
 requests.push({name,repeat,state,questions,imageSha256:run.steps[24].visualObservation.sha256});
 try{const response=await evaluateChoices(state,questions,{maxAttempts:1,maxElapsedMs:30000},{images});responses.push({name,repeat,status:'RECORDED',response});
  console.log(JSON.stringify({name,repeat,repair:response.answers.image_check_1.choice,confidence:response.answers.image_check_1.confidence}));
 }catch(error){responses.push({name,repeat,status:'ERROR',error:safeRequestFailure(error)});}
 await writeFile(join(root,'probe.json'),JSON.stringify({source,sourceSha256:createHash('sha256').update(raw).digest('hex'),method:'Reconstruct production image-only request by replaying saved responses through production decision code for steps 1-25; then ablate only specified inputs on the same step-25 PNG. No public-site requests or oracle in model inputs.',requests,responses},null,2));
}
const groups=variants.map(name=>({name,valid:responses.filter(r=>r.name===name&&r.status==='RECORDED').length,observed:responses.filter(r=>r.name===name&&r.response?.answers.image_check_1.choice==='observed').length}));
assert.deepEqual(await readFile(source),raw);console.log(JSON.stringify({root,groups}));
