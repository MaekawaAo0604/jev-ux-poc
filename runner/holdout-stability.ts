import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {runHumanJev} from './human-jev-experiment.js';
import {analyzeHoldoutRuns,type HoldoutRunRecord} from './holdout-analysis.js';
import {holdoutQuery,type HoldoutTask,type HoldoutVariant} from '../app/holdout-fixture.js';
import {sourceIdentity} from './virtual-beta-source.js';
import {sha} from './virtual-beta-core.js';
import {replayDirectory} from './virtual-beta-replay.js';

type Options={out:string;mock:boolean;envFile?:string;limit?:number};
export function validateHoldoutBatchOptions(options:Options){
 if(typeof options.out!=='string'||!options.out.trim())throw new Error('NEW_OUTPUT_DIRECTORY_REQUIRED');
 if(typeof options.mock!=='boolean')throw new Error('EXPLICIT_EXECUTION_KIND_REQUIRED');
 if(!Number.isInteger(options.limit??24)||(options.limit??24)<1||(options.limit??24)>24)throw new Error('TRIAL_LIMIT_1_TO_24');
 if(!options.mock&&!options.envFile)throw new Error('EXPLICIT_ENV_FILE_REQUIRED');
}
export function holdoutSchedule(){
 const result:{id:string;task:HoldoutTask;variant:HoldoutVariant;replicate:number;condition:'control'|'policy'}[]=[];
 for(const replicate of [1,2])for(const [pair,assignment] of (['switch','revisit','direct'] as const).flatMap(task=>(['alpha','beta'] as const).map(variant=>({task,variant}))).entries()){
  const order:('control'|'policy')[]=(pair+replicate)%2===1?['control','policy']:['policy','control'];
  for(const condition of order)result.push({id:assignment.task+'-'+assignment.variant+'-r'+replicate+'-'+condition,...assignment,replicate,condition});
 }
 return result;
}
async function json(path:string){return JSON.parse(await readFile(path,'utf8'));}
async function oldLedgers(){
 let paths:string[]=[];
 try{paths=(await json('reports/temporary-deferral-2026-10-28/prior-ledgers-before.json')).map((e:{path:string})=>e.path);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 paths.push('reports/temporary-deferral-2026-10-28/api-budget-control.json','reports/temporary-deferral-2026-10-28/api-budget-policy.json');
 const result:{path:string;sha256:string}[]=[];
 for(const path of [...new Set(paths)])try{result.push({path,sha256:sha(await readFile(path))});}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 return result;
}
/** Fixed policy, actual normal runner, fresh browser/context/ledger per trial. No saved-input API replay. */
export async function runHoldoutStability(options:Options){
 validateHoldoutBatchOptions(options);
 const root=resolve(options.out);await mkdir(dirname(root),{recursive:true});await mkdir(root);
 const code=await sourceIdentity(),prior=await oldLedgers(),schedule=holdoutSchedule().slice(0,options.limit??24);
 const started=Date.now(),deadlineEpochMs=started+20*60*1000;
 const manifest={schemaVersion:1,phase:'holdout-stability-2026-10-28',...code,mock:options.mock,model:options.mock?'MOCK_SCRIPTED_FIXTURE':'jev-1.14.0',schedule,limits:{trials:schedule.length,maxRequests:schedule.length*24,maxRequestsPerTrial:24,maxJudgmentsPerTrial:12,maxRunMs:180000,phaseMs:20*60*1000,parallel:1},fixedPolicy:{capacity:8,weight:0.01,minAlternativeProbability:0.01},humanInputsRead:false,startedAtUTC:new Date(started).toISOString(),priorLedgers:prior,records:[] as {id:string;task:HoldoutTask;variant:HoldoutVariant;replicate:number;condition:'control'|'policy';dir:string;initialImageSha256:string;requests:number}[],status:'RUNNING'};
 const save=()=>writeFile(join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');await save();
 const records:HoldoutRunRecord[]=[];
 try{
  for(const slot of schedule){
   if(Date.now()>=deadlineEpochMs){manifest.status='PHASE_TIME_LIMIT';break;}
   const fixture={task:slot.task,variant:slot.variant},dir=join(root,slot.id),ledger=join(root,slot.id+'-budget.json');
   if(!options.mock)await writeFile(ledger,JSON.stringify({schemaVersion:1,status:'APPROVED',phase:'holdout-stability-'+slot.id,newMaximum:24,perRunMaximum:12,used:0,attempts:[]},null,2)+'\n',{flag:'wx'});
   const saved=await runHumanJev({out:dir,mock:options.mock,mode:slot.condition==='control'?'experience-basis':'experience-defer',longContext:true,holdoutFixture:fixture,runId:slot.id,deadlineEpochMs,...(!options.mock?{phaseBudget:ledger,envFile:options.envFile}:{})});
   if(saved.result.code?.sourceHash!==code.sourceHash||saved.result.code.revision!==code.revision)throw new Error('SOURCE_CHANGED_DURING_BATCH');
   const initialImageSha256=sha(await readFile(join(dir,'initial-product.png')));
   records.push({...slot,initialImageSha256,result:saved.result});
   manifest.records.push({...slot,dir:slot.id,initialImageSha256,requests:options.mock?0:saved.result.apiCalls});
   const replay=await replayDirectory(join(dir,'exploration'));
   await writeFile(join(dir,'offline-replay.json'),JSON.stringify(replay,null,2)+'\n');
   const summary=analyzeHoldoutRuns(records);
   await writeFile(join(root,'summary.json'),JSON.stringify(summary,null,2)+'\n');await save();
   if(summary.pairs.some(pair=>pair.status==='paired'&&!pair.consistent))throw new Error('PAIRED_INITIAL_OR_CONFIG_INTEGRITY_FAILED');
   const total=manifest.records.reduce((n,r)=>n+r.requests,0);if(total>manifest.limits.maxRequests)throw new Error('BATCH_REQUEST_ACCOUNTING_EXCEEDED');
   console.log(JSON.stringify({slot:manifest.records.length,total:schedule.length,id:slot.id,query:holdoutQuery(fixture),requests:manifest.records.at(-1)!.requests,totalRequests:total,objective:saved.result.objectiveAssessment.value,termination:saved.result.termination,uiActions:saved.result.uiActions,decisions:saved.result.decisions,policyChanges:summary.runs.at(-1)!.metrics.policyChanges}));
  }
  if(manifest.status==='RUNNING')manifest.status=manifest.records.length===schedule.length?'COMPLETED':'INCOMPLETE';
 }catch(error){manifest.status='BATCH_ERROR';throw error;}
 finally{
  let preserved=true;for(const item of prior)if(sha(await readFile(item.path))!==item.sha256)preserved=false;
  await writeFile(join(root,'prior-ledger-check.json'),JSON.stringify({unchanged:preserved,checked:prior.length},null,2)+'\n');
  await save();if(!preserved)throw new Error('PRIOR_LEDGER_CHANGED');
 }
 return {root,status:manifest.status,trials:records.length,requests:manifest.records.reduce((n,r)=>n+r.requests,0)};
}
async function main(){
 const args=process.argv.slice(2);const options:Options={out:'',mock:false};
 for(let i=0;i<args.length;i++){const key=args[i];if(key==='--mock'){options.mock=true;continue;}if(!['--out','--env-file','--limit'].includes(key)||!args[i+1]||args[i+1].startsWith('--'))throw new Error('INVALID_OPTION');const value=args[++i];if(key==='--out')options.out=value;if(key==='--env-file')options.envFile=value;if(key==='--limit')options.limit=Number(value);}
 console.log(JSON.stringify(await runHoldoutStability(options)));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
