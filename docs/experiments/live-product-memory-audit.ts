import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(process.argv[2]),priorRoot=resolve(process.argv[3]??'reports/persona-svgomg-back-fixed-2026-10-26');
const json=async(p:string)=>JSON.parse(await readFile(p,'utf8'));
const manifest=await json(join(root,'manifest.json')),runs=await json(join(root,'results.json')),priorManifest=await json(join(priorRoot,'manifest.json')),priorRuns=await json(join(priorRoot,'results.json'));
const failures:string[]=[],check=(ok:boolean,message:string)=>{if(!ok)failures.push(message);},digest=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
check(manifest.completionEvidenceMode==='retained-hash-verified-frames','completion mode');
check(JSON.stringify(manifest.plan)===JSON.stringify(priorManifest.plan),'same planned order');
check(JSON.stringify(manifest.inputs)===JSON.stringify(priorManifest.inputs),'same goal/charter/personas');
check(JSON.stringify(manifest.viewport)===JSON.stringify(priorManifest.viewport)&&manifest.locale===priorManifest.locale&&manifest.timezoneId===priorManifest.timezoneId,'same viewport/locale/timezone');
const unchangedCore=['jev/persona.ts','jev/decide.ts','jev/visual-context.ts','pages/LocalExplorationPage.ts','pages/ClientToolPage.ts','pages/AutoPage.ts','runner/exploration-memory.ts'];
for(const file of unchangedCore)check(manifest.sourceHashes[file]===priorManifest.sourceHashes[file],'unchanged core '+file);
for(const [file,archive] of Object.entries(manifest.sourceArchives??{}))check(digest(await readFile(join(root,archive as string)))===manifest.sourceHashes[file],'archived source '+file);
check(runs.length===manifest.plan.length,'all planned runs present');
let verifiedFrames=0,verifiedProofs=0,verifiedReferences=0,recordedProofErrors=0;
for(const run of runs){
 check(manifest.plan.filter((p:any)=>p.condition===run.condition&&p.repeat===run.repeat).length===1,'planned identity '+run.dir);
 check(runs.filter((r:any)=>r.dir===run.dir).length===1,'unique run '+run.dir);
 check(run.actionCount===run.steps.filter((s:any)=>s.result==='OK').length,'action count '+run.dir);
 check(run.objectiveSuccess===null&&run.completionFrames.objectiveVerified===false,'independent success unknown '+run.dir);
 for(const step of run.steps){
  check(JSON.stringify(await json(join(root,run.dir,'step-'+step.number+'.json')))===JSON.stringify(step),'step JSON '+run.dir+'/'+step.number);
  const source=step.visualObservation;
  check(source?.hashSource==='capture'&&source.step===step.number&&source.file===step.screenshot,'capture provenance '+run.dir+'/'+step.number);
  check(digest(await readFile(join(root,run.dir,step.screenshot)))===source.sha256,'captured hash '+run.dir+'/'+step.number);verifiedFrames++;
  const proof=step.completionFrames?.requests.at(-1)??run.completionFrames.requests.find((p:any)=>p.sources.at(-1)?.step===step.number);
  check(proof?.sources.length===step.number,'proof includes every captured frame '+run.dir+'/'+step.number);
  if(proof.status==='error'){recordedProofErrors++;check(step.result==='DECISION_ERROR','proof error is explicit '+run.dir+'/'+step.number);}else check(proof.imageCount===step.number,'proof image count '+run.dir+'/'+step.number);
  if(proof.status==='recorded')check(proof.assessment===step.decision?.completionCheck?.assessment,'decision uses proof verdict '+run.dir+'/'+step.number);
  for(const [index,s] of proof.sources.entries()){
   check(JSON.stringify(s)===JSON.stringify(run.steps[index].visualObservation),'proof source provenance '+run.dir+'/'+step.number+'/'+index);verifiedReferences++;
  }
  if(proof.status==='recorded')verifiedProofs++;
 }
 if(run.reason==='JEV_DONE'){const last=run.steps.at(-1);check(last.decision.completionCheck?.assessment==='complete'&&last.decision.completionCheck?.evidenceGuard?.supported===true,'done has whole-goal verdict '+run.dir);}
}
const summary={status:failures.length?'FAIL':'PASS',failures,verifiedFrames,verifiedProofs,verifiedReferences,recordedProofErrors,unchangedCore,objectiveVerified:false,comparison:{before:{runs:priorRuns.length,done:priorRuns.filter((r:any)=>r.perceivedSuccess).length,actionLimit:priorRuns.filter((r:any)=>r.reason==='ACTION_LIMIT').length,errors:priorRuns.filter((r:any)=>['DECISION_ERROR','ACTION_ERROR','PAGE_ERROR'].includes(r.reason)).length},after:{runs:runs.length,done:runs.filter((r:any)=>r.perceivedSuccess).length,actionLimit:runs.filter((r:any)=>r.reason==='ACTION_LIMIT').length,errors:runs.filter((r:any)=>['DECISION_ERROR','ACTION_ERROR','PAGE_ERROR'].includes(r.reason)).length}},caveat:'Observed treatment includes retained images plus eager whole-goal review. This is not an isolated estimate of image retention, objective completion, persona effect, or human validity.'};
await writeFile(join(root,'memory-audit.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));if(failures.length)process.exitCode=1;
