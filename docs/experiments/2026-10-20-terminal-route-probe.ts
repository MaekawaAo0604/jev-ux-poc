import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {VisualDecisionContext} from '../../jev/visual-context.js';
import {jevDecide} from '../../jev/decide.js';
import {evaluateChoices,safeRequestFailure} from '../../jev/client.js';

// Replay archived responses to reconstruct actual wire requests. Only the
// final frozen image is sent to live Jev; no browser or public-site access.
process.loadEnvFile('.env');
const source=resolve('reports/2026-10-19T13-27-02.965Z-public/exploration/result.json');
const sourceBytes=await readFile(source),run=JSON.parse(sourceBytes.toString());
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const root=resolve('reports',`terminal-route-${new Date().toISOString().replaceAll(':','-')}`);
await mkdir(root,{recursive:true});
const original=globalThis.fetch,context=new VisualDecisionContext(undefined,true,true,file=>readFile(join(run.dir,file)));
const wires:any[]=[],controlWires:any[]=[];let step:any,queue:any[]=[];
globalThis.fetch=async(_url,init)=>{
 const body=JSON.parse(String(init?.body)),record=queue.shift();assert.ok(record,'unexpected replay call');
 assert.deepEqual(Object.keys(body.questions),record.questionIds);
 if(step.number===25)wires.push(body);
 if(step.number===20)controlWires.push(body);
 return Response.json({model:record.model,answers:record.answers});
};
try{
 for(step of run.steps){
  const image=await readFile(join(run.dir,step.screenshot));assert.equal(hash(image),step.visualObservation.sha256);
  context.capture(image,{...step.visualObservation,pageId:step.state.screen.pageId,viewport:step.state.screen.viewport},step.state.screen,step.frontier);
  queue=step.visualContext.requests.filter((q:any)=>q.step===step.number);
  const decision=await jevDecide(step.state,step.candidates,{verifyCompletion:true,preserveTransit:true,frontier:step.frontier,completionEvidence:()=>context.completionEvidence()},(s,q)=>context.evaluate(s,q));
  assert.equal(queue.length,0);assert.equal(decision.choice,step.decision.choice);
  if(step.result==='OK')context.recordAction(decision.action);
 }
}finally{globalThis.fetch=original;await context.close();}
assert.equal(wires.length,3);const action=wires[1],frontier=wires[2];
assert.equal(Object.keys(action.assets).length,1);assert.deepEqual(action.assets,frontier.assets);
const noRouteJudgments=structuredClone(frontier);noRouteJudgments.state.context.imageJudgments.routes=[];
const removeCoverage=(value:any):any=>Array.isArray(value)?value.map(removeCoverage):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([k])=>k!=='scrollCoverage').map(([k,v])=>[k,removeCoverage(v)])):value;
const noCoverage={...frontier,state:removeCoverage(frontier.state)};
assert.equal(controlWires.length,3);
assert.equal(run.steps[19].visualObservation.sha256,run.steps[24].visualObservation.sha256);
const variants=process.argv.includes('--control-only')?[{name:'earlier-frontier',body:controlWires[2]}]:[{name:'current-action',body:action},{name:'frontier',body:frontier},{name:'frontier-no-route-judgments',body:noRouteJudgments},{name:'frontier-no-coverage',body:noCoverage}];
const results:any[]=[];
const checkpoint=()=>writeFile(join(root,'probe.json'),JSON.stringify({source,sourceSha256:hash(sourceBytes),root,
 method:'Exact sequential replay of all 25 recorded production decisions. Default: four final-frame frozen-wire conditions, five repeats each, rotating condition order. --control-only: five repeats of the actual earlier step-20 frontier request over identical pixels, with its original history and still-promising target. Ablations are diagnostics, not proposed fixes. No browser actions, expected answers, DOM labels or past images supplied.',
 imageSha256:run.steps.at(-1).visualObservation.sha256,requests:variants.map(v=>({name:v.name,state:v.body.state,questions:v.body.questions,assetIds:Object.keys(v.body.assets)})),results},null,2));
await checkpoint();
for(let repeat=1;repeat<=5;repeat++)for(let offset=0;offset<variants.length;offset++){
 const {name,body}=variants[(offset+repeat-1)%variants.length],started=performance.now();
 try{
  const response=await evaluateChoices(body.state,body.questions,{maxAttempts:1,maxElapsedMs:30000},{images:Object.fromEntries(Object.entries(body.assets).map(([id,v]:[string,any])=>[id,{mediaType:'image/png',data:v.data_base64}]))});
  results.push({name,repeat,status:'RECORDED',elapsedMs:performance.now()-started,response});
  console.log(JSON.stringify({name,repeat,choice:response.answers.nextAction.choice}));
 }catch(error){results.push({name,repeat,status:'ERROR',elapsedMs:performance.now()-started,error:safeRequestFailure(error)});}
 await checkpoint();
}
assert.deepEqual(await readFile(source),sourceBytes);
const summary=variants.map(({name})=>({name,counts:results.filter(r=>r.name===name).reduce((a,r)=>{const k=r.status==='RECORDED'?r.response.answers.nextAction.choice:'ERROR';a[k]=(a[k]??0)+1;return a;},{} as Record<string,number>)}));
await writeFile(join(root,'summary.json'),JSON.stringify({root,summary,sourceUnchanged:true},null,2));
console.log(JSON.stringify({root,summary}));
