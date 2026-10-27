import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {VisualDecisionContext} from '../../jev/visual-context.js';
import {ImageJudgmentMemory} from '../../jev/image-judgments.js';
import {requestFor} from '../../jev/decide.js';
import {chooseFrontier} from '../../jev/frontier.js';
import {safeRequestFailure,safeProviderType} from '../../jev/client.js';

// Reconstruct saved model state without navigation. Never log headers or raw errors.
try{process.loadEnvFile('.env');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
const root=resolve(process.argv[2]),saved=JSON.parse(await readFile(join(root,'exploration/result.json'),'utf8')),step=saved.steps.at(-1);
const output=resolve('reports',`request-diagnostic-${new Date().toISOString().replaceAll(':','-')}`);await mkdir(output,{recursive:true});
const context=new VisualDecisionContext(undefined,true,true),memory=new ImageJudgmentMemory(),record=step.visualContext.imageJudgments;
// Restore the exact saved ledger; this diagnostic adapter never enters production.
Object.assign(memory,{goal:saved.goalText,requirements:structuredClone(record.requirements),routes:new Map(record.routes.map((r:any)=>[r.targetId,structuredClone(r)])),accepted:new Set(record.requirements.flatMap((r:any)=>r.records.map((v:any)=>v.source.id)))});
(context as any).judgments=memory;
for(const s of saved.steps)if(s.recordedAction)(context as any).imageOnlyInput.record(s.decision.action,{step:s.number,pageId:s.state.screen.pageId});
context.capture(await readFile(join(root,'exploration',step.screenshot)),{...step.visualObservation,pageId:step.state.screen.pageId,viewport:step.state.screen.viewport},step.state.screen,step.frontier);
const original=globalThis.fetch,diagnostic:any={source:root,step:step.number};
const failed=step.visualContext.requests.filter((r:any)=>r.status==='error').at(-1),questionIds=failed?.questionIds??['nextAction'];
diagnostic.questionIds=questionIds;
const questions=questionIds.includes('completionCoverage')?{completionCoverage:{type:'choice' as const,instructions:'',criteria:{complete:'complete',incomplete:'incomplete',uncertain:'uncertain'}}}:requestFor(step.state,step.candidates,'').questions;
globalThis.fetch=async(url,init)=>{
 const body=JSON.parse(String(init?.body));diagnostic.request={bytes:Buffer.byteLength(String(init?.body)),questions:Object.keys(body.questions).length,stateBytes:Buffer.byteLength(JSON.stringify(body.state)),imageCount:Object.keys(body.assets??{}).length};
 const response=await original(url,init);diagnostic.status=response.status;
 if(!response.ok){
  const raw=await response.clone().text();
  diagnostic.errorMarkers=['per_question_context','per_request_context','context_length_exceeded','context','tokens','token','exceed','limit','maximum','too long'].filter(v=>raw.toLowerCase().includes(v));
  try{const error=JSON.parse(raw);diagnostic.providerType=safeProviderType(error?.error?.type??error?.type);}catch{}
 }
 return response;
};
const run=async(input:any,q:any)=>{const result=await context.evaluate(input,q,{maxAttempts:1,maxElapsedMs:30000});diagnostic.usage=result.usage;diagnostic.answers=Object.fromEntries(Object.entries(result.answers).map(([id,v])=>[id,v.choice]));return result;};
try{
 if(step.decisionReview?.stage==='recovery'){
  diagnostic.mode='first-frontier-group';
  await chooseFrontier(step.state,step.candidates,step.frontier,[saved.goalText],async(input,q)=>{await run(input,q);throw new Error('DIAGNOSTIC_STOP');});
 }else await run(step.state,questions);
}
catch(error){if(!(error instanceof Error&&error.message==='DIAGNOSTIC_STOP'))diagnostic.failure=safeRequestFailure(error);}
finally{globalThis.fetch=original;await context.close();await writeFile(join(output,'diagnostic.json'),JSON.stringify(diagnostic,null,2));console.log(JSON.stringify({output,...diagnostic}));}
