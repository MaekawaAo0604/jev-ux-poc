import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {jevDecide} from '../../jev/decide.js';
import {ImageOnlyInput} from '../../jev/image-only-input.js';
import {ImageJudgmentMemory} from '../../jev/image-judgments.js';
import {evaluateChoices,safeRequestFailure} from '../../jev/client.js';
import {SCROLL_VIEWPORT_FRACTION} from '../../jev/types.js';

process.loadEnvFile('.env');
const source='reports/2026-10-19T10-13-03.265Z-public/exploration';
const historyOnly=process.argv.includes('--history');
const geometryOnly=process.argv.includes('--geometry');
const root=resolve('reports',`decision-isolation-${new Date().toISOString().replaceAll(':','-')}`);await mkdir(root,{recursive:true});
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const steps=[];for(let n=1;n<=23;n++)steps.push(JSON.parse(await readFile(join(source,`step-${n}.json`),'utf8')));
const pinFiles=['jev/decide.ts','jev/frontier.ts','jev/image-only-input.ts','jev/image-judgments.ts','jev/types.ts'];
const codeSha256=Object.fromEntries(await Promise.all(pinFiles.map(async file=>[file,hash(await readFile(file))])));
const replay=[];
for(const [n,frontier] of [[23,false],[23,true],[4,true]] as const){
 const s=steps[n-1],records=s.visualContext.requests.filter((r:any)=>r.step===n&&r.answers?.nextAction);
 let calls=0;const questions:any[]=[];
 const result=await jevDecide(s.state,s.candidates,{verifyCompletion:false,preserveTransit:true,...(frontier?{frontier:s.frontier}:{})},async(_input,q)=>{
  const r=records[calls++];assert.ok(r,'unexpected inference call');questions.push(Object.keys(q.nextAction.criteria));
  assert.deepEqual(Object.keys(r.answers.nextAction.probabilities).sort(),Object.keys(q.nextAction.criteria).sort());
  return {model:r.model,answers:r.answers};
 });
 replay.push({step:n,frontier,firstChoice:records[0].answers.nextAction.choice,finalChoice:result.choice,calls,questions,method:'Recorded replies held fixed; code-path replay only, no new model evidence'});
}
assert.equal(replay[0].finalChoice,'scroll_up');assert.equal(replay[1].finalChoice,'stuck');assert.equal(replay[2].finalChoice,'e1');assert.equal(replay[2].calls,1);
const s23=steps[22],v=s23.state.screen.viewport;
const projectedTop=Math.max(0,v.top-v.height*SCROLL_VIEWPORT_FRACTION);
const alreadyVisited=steps.slice(0,22).filter(s=>s.state.screen.pageId===s23.state.screen.pageId&&s.state.screen.viewport?.top===projectedTop).map(s=>s.number);
assert.deepEqual(alreadyVisited,[15,17]);

const compact=(memory:any)=>({...memory,requirements:memory.requirements.map((r:any)=>({...r,recordCount:r.records.length,records:r.records.length?[[...r.records].reverse().find((v:any)=>v.assessment===r.status)]:[]}))});
const responses:any[]=[],requests:any[]=[];
const checkpoint=async()=>writeFile(join(root,'isolation.json'),JSON.stringify({source,root,phase:geometryOnly?'position-and-wrapper':historyOnly?'history-control':'memory-action',codeSha256,replay,scrollProjection:{fromStep:23,projectedTop,alreadyVisitedSteps:alreadyVisited,interpretation:'Deterministic position projection, not an executed browser action. Returning could support rereading but is not new spatial coverage.'},method:geometryOnly?'Empty history, no prior judgments and no action selection. Remove coverage, then all positional fields, then flatten the context wrapper, over the same pixels and questions.':historyOnly?'Current pixels, goal, geometry, questions and past positional coverage held fixed. No prior judgments or action question. Full, empty or geometry-only executed history compared.':'2x2 saved-image experiment: prior image judgments present/absent and action selection asked/not asked. Executed history retained in all conditions. No DOM, OCR, answer text or route supplied. Reconstructed, not exact original requests.',requests,responses},null,2));
await checkpoint();
// Alternate the four conditions by repetition. No condition receives a result
// from another repetition; the only prior judgments are the frozen old trace.
for(const n of (historyOnly||geometryOnly?[]:[3,23,6]))for(let repeat=1;repeat<=3;repeat++)for(const [withMemory,joint] of (repeat%2?[[false,false],[true,true],[false,true],[true,false]]:[[true,false],[false,true],[true,true],[false,false]])){
 const s=steps[n-1],previous=steps[n-2],bytes=await readFile(join(source,s.screenshot));assert.equal(hash(bytes),s.visualObservation.sha256);
 const history=new ImageOnlyInput();
 for(const past of steps.slice(0,n-1))if(past.result==='OK')history.record(past.decision.action,{step:past.number,pageId:past.state.screen.pageId,viewport:past.state.screen.viewport});
 const q={nextAction:{type:'choice' as const,instructions:'',criteria:Object.fromEntries(Object.keys(s.candidates).map(k=>[k,k]))}};
 const wire=history.request(s.state,q,{step:n,pageId:s.state.screen.pageId,viewport:s.state.screen.viewport},withMemory?compact(previous.visualContext.imageJudgments):undefined);
 if(!joint)delete (wire.questions as any).nextAction;
 const judgments=new ImageJudgmentMemory();judgments.bind(s.state.goal);
 Object.assign(wire.questions,judgments.questions({id:`v${n}`,step:n,sha256:s.visualObservation.sha256},[]));
 const state={context:wire.context,screenshot:'current',observations:[{...wire.frame,current:true,screenshot:'current'}]};
 assert.doesNotMatch(JSON.stringify(state),/https?:|regions|observedText|accessibleName|placeholder/);
 const condition={step:n,repeat,withMemory,joint};requests.push({...condition,state,questions:wire.questions,imageSha256:s.visualObservation.sha256});
 try{
  const response=await evaluateChoices(state,wire.questions,{maxAttempts:2,maxElapsedMs:30000,retryDelaysMs:[1000]},{images:{current:{mediaType:'image/png',data:bytes.toString('base64')}}});
  responses.push({...condition,status:'RECORDED',response});console.log(JSON.stringify({...condition,password:response.answers.image_check_0.choice,repair:response.answers.image_check_1.choice,action:response.answers.nextAction?.choice}));
 }catch(error){const failure=safeRequestFailure(error);responses.push({...condition,status:'ERROR',failure});console.log(JSON.stringify({...condition,failure}));}
 await checkpoint();
}
if(geometryOnly)for(const n of [23,6])for(let repeat=1;repeat<=3;repeat++)for(const variant of (repeat%2?['no-coverage','no-position','flat-context']:['flat-context','no-position','no-coverage'])){
 const s=steps[n-1],bytes=await readFile(join(source,s.screenshot));assert.equal(hash(bytes),s.visualObservation.sha256);
 const history=new ImageOnlyInput();
 for(const past of steps.slice(0,n-1))if(past.result==='OK')history.record(past.decision.action,{step:past.number,pageId:past.state.screen.pageId,viewport:past.state.screen.viewport});
 const wire=history.request(s.state,{nextAction:{type:'choice',instructions:'',criteria:{stuck:'stuck'}}},{step:n,pageId:s.state.screen.pageId,viewport:s.state.screen.viewport});
 wire.context.history=[];delete wire.context.screen.scrollCoverage;
 const observation:any={...wire.frame,current:true,screenshot:'current'};
 if(variant!=='no-coverage'){delete wire.context.screen.viewport;delete observation.viewport;}
 const judgments=new ImageJudgmentMemory();judgments.bind(s.state.goal);
 const questions=judgments.questions({id:`v${n}`,step:n,sha256:s.visualObservation.sha256},[]);
 const state=variant==='flat-context'?{...wire.context,screenshot:'current',observations:[observation]}:{context:wire.context,screenshot:'current',observations:[observation]};
 assert.doesNotMatch(JSON.stringify(state),/https?:|regions|observedText|accessibleName|placeholder/);
 const condition={step:n,repeat,geometryVariant:variant};requests.push({...condition,state,questions,imageSha256:s.visualObservation.sha256});
 try{
  const response=await evaluateChoices(state,questions,{maxAttempts:2,maxElapsedMs:30000,retryDelaysMs:[1000]},{images:{current:{mediaType:'image/png',data:bytes.toString('base64')}}});
  responses.push({...condition,status:'RECORDED',response});console.log(JSON.stringify({...condition,password:response.answers.image_check_0.choice,repair:response.answers.image_check_1.choice}));
 }catch(error){const failure=safeRequestFailure(error);responses.push({...condition,status:'ERROR',failure});console.log(JSON.stringify({...condition,failure}));}
 await checkpoint();
}
if(historyOnly)for(const n of [23,6])for(let repeat=1;repeat<=3;repeat++)for(const variant of (repeat%2?['full','empty','geometry-only']:['geometry-only','empty','full'])){
 const s=steps[n-1],bytes=await readFile(join(source,s.screenshot));assert.equal(hash(bytes),s.visualObservation.sha256);
 const history=new ImageOnlyInput();
 for(const past of steps.slice(0,n-1))if(past.result==='OK')history.record(past.decision.action,{step:past.number,pageId:past.state.screen.pageId,viewport:past.state.screen.viewport});
 const wire=history.request(s.state,{nextAction:{type:'choice',instructions:'',criteria:{stuck:'stuck'}}},{step:n,pageId:s.state.screen.pageId,viewport:s.state.screen.viewport});
 if(variant==='empty')wire.context.history=[];
 if(variant==='geometry-only')(wire.context as any).history=wire.context.history.map(({step,pageId,viewport})=>({step,pageId,viewport}));
 const judgments=new ImageJudgmentMemory();judgments.bind(s.state.goal);
 const questions=judgments.questions({id:`v${n}`,step:n,sha256:s.visualObservation.sha256},[]);
 const state={context:wire.context,screenshot:'current',observations:[{...wire.frame,current:true,screenshot:'current'}]};
 assert.doesNotMatch(JSON.stringify(state),/https?:|regions|observedText|accessibleName|placeholder/);
 const condition={step:n,repeat,historyVariant:variant};requests.push({...condition,state,questions,imageSha256:s.visualObservation.sha256});
 try{
  const response=await evaluateChoices(state,questions,{maxAttempts:2,maxElapsedMs:30000,retryDelaysMs:[1000]},{images:{current:{mediaType:'image/png',data:bytes.toString('base64')}}});
  responses.push({...condition,status:'RECORDED',response});console.log(JSON.stringify({...condition,password:response.answers.image_check_0.choice,repair:response.answers.image_check_1.choice}));
 }catch(error){const failure=safeRequestFailure(error);responses.push({...condition,status:'ERROR',failure});console.log(JSON.stringify({...condition,failure}));}
 await checkpoint();
}
console.log(JSON.stringify({root,replay,projectedTop,alreadyVisited,errors:responses.filter(r=>r.status==='ERROR').length}));
