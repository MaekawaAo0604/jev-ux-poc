import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {runHumanJev} from './human-jev-experiment.js';
import {sourceIdentity} from './virtual-beta-source.js';
import {sha,type BetaResult} from './virtual-beta-core.js';
import {replayDirectory} from './virtual-beta-replay.js';
import type {HoldoutFixture} from '../app/holdout-fixture.js';

type Options={out:string;mock:boolean;envFile?:string;limit?:number};
export type ReasonSlot={id:string;scenario:'notifications'|'revisit-alpha'|'revisit-beta';replicate:1|2;condition:'old'|'reason'};
type RunRecord=ReasonSlot&{initialImageSha256:string;result:BetaResult};
const modes={old:'experience-defer',reason:'experience-reason'} as const;
const object=(value:unknown):Record<string,unknown>|undefined=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:undefined;
const sum=(values:number[])=>values.reduce((a,b)=>a+b,0);
const mean=(values:number[])=>values.length?sum(values)/values.length:null;
const faults=new Set(['API_ERROR','INVALID_DISTRIBUTION','ACTION_ERROR','OBSERVATION_ERROR','SAFETY_STOP']);
export function validateReasonExperimentOptions(options:Options){
 if(typeof options.out!=='string'||!options.out.trim())throw new Error('NEW_OUTPUT_DIRECTORY_REQUIRED');
 if(typeof options.mock!=='boolean')throw new Error('EXPLICIT_EXECUTION_KIND_REQUIRED');
 if(!Number.isInteger(options.limit??12)||(options.limit??12)<1||(options.limit??12)>12)throw new Error('TRIAL_LIMIT_1_TO_12');
 if(!options.mock&&(typeof options.envFile!=='string'||!options.envFile.trim()))throw new Error('EXPLICIT_ENV_FILE_REQUIRED');
}
/** Fixed before results: scenario order is unchanged; paired condition order alternates and reverses. */
export function reasonSchedule():ReasonSlot[]{
 const slots:ReasonSlot[]=[];
 for(const replicate of [1,2] as const)for(const [index,scenario] of (['notifications','revisit-alpha','revisit-beta'] as const).entries()){
  const order:ReasonSlot['condition'][]=(index+replicate)%2===1?['old','reason']:['reason','old'];
  for(const condition of order)slots.push({id:scenario+'-r'+replicate+'-'+condition,scenario,replicate,condition});
 }
 return slots;
}
async function json(path:string){return JSON.parse(await readFile(path,'utf8'));}
async function priorLedgers(){
 const manifestPath='reports/holdout-stability-2026-10-28/live/manifest.json';let paths:string[]=[];
 try{
  const manifest=await json(manifestPath);
  paths=(manifest.priorLedgers??[]).map((item:{path:string})=>item.path);
  paths.push(...(manifest.records??[]).map((item:{id:string})=>join(dirname(manifestPath),item.id+'-budget.json')));
 }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 const result:{path:string;sha256:string}[]=[];
 for(const path of [...new Set(paths)])try{result.push({path:path.replaceAll('\\','/'),sha256:sha(await readFile(path))});}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 return result;
}
function localURL(value:string|undefined){
 if(!value)return null;
 try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)?url.pathname+url.search+url.hash:null;}catch{return null;}
}
function comparableConfig(config:BetaResult['config']){const {id:_id,...rest}=config;delete (rest as Record<string,unknown>).deferralReason;return rest;}
function runSummary(record:RunRecord){
 const r=record.result;
 const fault=faults.has(r.termination)||r.objectiveAssessment.status!=='OK'||r.terminalObservation.status!=='RECORDED';
 const valid=r.validForComparison&&!fault&&typeof r.objectiveAssessment.value==='boolean'&&r.objectiveSuccess===r.objectiveAssessment.value;
 const policySelections=r.steps.flatMap(step=>{
  const selection=step.selection,policy=selection?.policy;if(!selection||!policy)return [];
  const ordered=Object.keys(policy.before).sort(),maximum=Math.max(...ordered.map(key=>policy.before[key])),before=ordered.find(key=>policy.before[key]===maximum&&maximum>0)??null;
  return [{step:step.number,beforeArgmax:before,selected:selection.selected,changed:before!==null&&before!==selection.selected,raw:selection.raw,policy}];
 });
 const edges=r.steps.flatMap((step,index)=>{
  if(!step.action||!['click','back','scroll'].includes(step.action.type))return [];
  const from=localURL(step.audit?.url),to=step.outcome==='UI_PERFORMED'?localURL(r.steps[index+1]?.audit?.url):null;
  return [{step:step.number,action:step.action,from,to,status:step.outcome==='UI_PERFORMED'?(from!==null&&to!==null?'observed':'unknown'):'failed'}];
 });
 const reasonRecords:({step:number}&Record<string,unknown>)[]=r.steps.flatMap(step=>{
  const value=object((step as unknown as Record<string,unknown>).deferralReason);return value?[{step:step.number,...value}]:[];
 });
 const reasonDetails=reasonRecords.map(value=>object(value.record)).filter((value):value is Record<string,unknown>=>value!==undefined);
 const captures=reasonDetails.flatMap(value=>object(value.capture)?[object(value.capture)!]:[]),reviews=reasonDetails.flatMap(value=>Array.isArray(value.reviews)?value.reviews.map(object).filter((entry):entry is Record<string,unknown>=>entry!==undefined):[]);
 const reasonMetrics={reasonCaptures:captures.length,admittedReasonCaptures:captures.filter(value=>value.admitted===true).length,reasonReviews:reviews.length,reasonBasisChangedReports:reviews.filter(value=>value.status==='basis_changed').length,actualReasonReleases:reviews.filter(value=>value.released===true).length};
 const deferralDecisions=r.steps.flatMap(step=>step.deferral?.decision?[{step:step.number,...step.deferral.decision}]:[]);
 return {id:record.id,scenario:record.scenario,replicate:record.replicate,condition:record.condition,valid,fault,objectiveAssessment:r.objectiveAssessment,success:valid&&r.objectiveAssessment.value===true,falseDone:valid&&r.perceivedDone&&r.objectiveAssessment.value===false,termination:r.termination,perceivedDone:r.perceivedDone,uiActions:r.uiActions,decisions:r.decisions,looks:r.looks,requests:r.apiCalls,timing:{apiMs:r.apiMs,uiMs:r.uiMs,elapsedMs:r.elapsedMs,humanTimeMs:null},policyChanges:policySelections.filter(s=>s.changed).length,policySelections,deferralDecisions,reasonRecords,...reasonMetrics,temporaryAlternativeExhaustionSteps:deferralDecisions.filter(d=>d.reason==='ALTERNATIVES_EXHAUSTED').length,route:{identity:'actual-audited-local-pathname-search-hash; no semantic aliases',edges},sameObservationEvidence:r.steps.flatMap(step=>{
  const context=object(step.modelInput?.experienceContext);return context?.returnedRoutes?[{step:step.number,observationId:step.observationId,returnedRoutes:context.returnedRoutes}]:[];
 })};
}
/** Descriptive only: model reasons are saved self-reports; route changes do not establish recovery. */
export function analyzeReasonRuns(records:RunRecord[]){
 const runs=records.map(runSummary),pairs=[];
 for(const scenario of ['notifications','revisit-alpha','revisit-beta'])for(const replicate of [1,2]){
  const group=records.filter(r=>r.scenario===scenario&&r.replicate===replicate);if(!group.length)continue;
  const old=group.filter(r=>r.condition==='old'),reason=group.filter(r=>r.condition==='reason'),errors:string[]=[];
  const status=old.length>1||reason.length>1?'ambiguous':old.length===0||reason.length===0?'missing-condition':'paired';
  if(status==='paired'){
   const a=old[0],b=reason[0];
   if(!a.result.code?.sourceHash||a.result.code.sourceHash!==b.result.code?.sourceHash)errors.push('SOURCE_HASH_MISMATCH');
   if(!a.result.code?.revision||a.result.code.revision!==b.result.code?.revision)errors.push('REVISION_MISMATCH');
   if(a.initialImageSha256!==b.initialImageSha256)errors.push('INITIAL_IMAGE_MISMATCH');
   if(!isDeepStrictEqual(comparableConfig(a.result.config),comparableConfig(b.result.config)))errors.push('CONFIG_MISMATCH');
   if(!isDeepStrictEqual(a.result.input.charter,b.result.input.charter))errors.push('CHARTER_MISMATCH');
   if(!isDeepStrictEqual(a.result.input.persona,b.result.input.persona))errors.push('PERSONA_MISMATCH');
   if(group.some(r=>r.id!==r.result.runId))errors.push('RUN_ID_MISMATCH');
  }
  pairs.push({scenario,replicate,status,consistent:status==='paired'&&errors.length===0,errors,ids:group.map(r=>r.id)});
 }
 const cells=[];
 for(const scenario of ['notifications','revisit-alpha','revisit-beta'])for(const condition of ['old','reason']){
  const group=runs.filter(r=>r.scenario===scenario&&r.condition===condition);if(!group.length)continue;
  const valid=group.filter(r=>r.valid);
  cells.push({scenario,condition,n:group.length,valid:valid.length,successes:valid.filter(r=>r.success).length,faults:group.filter(r=>r.fault).length,falseDone:valid.filter(r=>r.falseDone).length,meanUIActions:mean(valid.map(r=>r.uiActions)),meanDecisions:mean(valid.map(r=>r.decisions)),policyChanges:sum(valid.map(r=>r.policyChanges)),reasonRecordSteps:sum(valid.map(r=>r.reasonRecords.length)),reasonCaptures:sum(valid.map(r=>r.reasonCaptures)),admittedReasonCaptures:sum(valid.map(r=>r.admittedReasonCaptures)),reasonReviews:sum(valid.map(r=>r.reasonReviews)),reasonBasisChangedReports:sum(valid.map(r=>r.reasonBasisChangedReports)),actualReasonReleases:sum(valid.map(r=>r.actualReasonReleases)),temporaryAlternativeExhaustionSteps:sum(valid.map(r=>r.temporaryAlternativeExhaustionSteps))});
 }
 return {schemaVersion:1,kind:'offline-deferral-reason-descriptive-comparison',expectedTrials:12,received:records.length,runs,cells,pairs,limitations:['Two replicates per scenario and condition are descriptive, with no reliability or generalization estimate.','Model reason captures and reviews are self-reports. Actual release records and actual selected actions remain separate.','Images establish input equality only, not semantic identity or goal equivalence.','Only a subsequent audited observation establishes a performed action destination.','Mock scripted done output is a connectivity check and supplies no performance evidence.','Source, initial image, goal, persona, and config are paired with only config id and the declared deferralReason component excluded.']};
}
/** Uses the ordinary wrapper; never resends old inputs, changes prior ledgers, or adds an API stage. */
export async function runDeferralReasonExperiment(options:Options){
 validateReasonExperimentOptions(options);
 const root=resolve(options.out);await mkdir(dirname(root),{recursive:true});await mkdir(root);
 const code=await sourceIdentity(),prior=await priorLedgers(),fullSchedule=reasonSchedule(),schedule=fullSchedule.slice(0,options.limit??12);
 const started=Date.now(),deadlineEpochMs=started+20*60*1000;
 const manifest={schemaVersion:1,phase:'deferral-reason-comparison',...code,mock:options.mock,performanceEvidence:!options.mock,model:options.mock?'MOCK_SCRIPTED_DONE':'jev-1.14.0',modes,fullSchedule,schedule,limits:{trials:schedule.length,maxRequests:schedule.length*24,phaseMaximumRequests:288,maxRequestsPerTrial:24,maxJudgmentsPerTrial:12,maxUIActionsPerTrial:15,maxLooksPerTrial:3,maxRunMs:180000,phaseMs:20*60*1000,parallel:1},fixedPolicy:{capacity:8,weight:0.01,minAlternativeProbability:0.01},inputComponents:{shared:{fullViewport:true,recencyImages:3,experienceCapacity:8,longContext:true,additionalAPIStages:0},old:{mode:modes.old,fixedTemporaryDeferral:true,maxUniqueImages:3},reason:{mode:modes.reason,memoryCapacity:8,maxOriginalReasonImages:1,maxUniqueImages:4,declaredDifference:'Reason memory, source evidence image when needed, and capture/review questions within the existing assessment'}},humanInputsRead:false,oldSourceInputsReplayed:false,startedAtUTC:new Date(started).toISOString(),deadlineEpochMs,priorLedgers:prior,budgetLedgers:[] as {id:string;path:string;used:number}[],requestAccounting:{used:0,maximum:schedule.length*24,source:options.mock?'mock-zero':'fresh-trial-ledgers-including-incomplete'},records:[] as (ReasonSlot&{dir:string;resultPath:string;initialImageSha256:string;requests:number;replayPath:string})[],status:'RUNNING'};
 const save=()=>writeFile(join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');await save();
 const records:RunRecord[]=[];
 try{
  for(const slot of schedule){
   if(Date.now()>=deadlineEpochMs){manifest.status='PHASE_TIME_LIMIT';break;}
   const current=await sourceIdentity();if(current.sourceHash!==code.sourceHash||current.revision!==code.revision)throw new Error('SOURCE_CHANGED_DURING_BATCH');
   const fixture:HoldoutFixture|undefined=slot.scenario==='notifications'?undefined:{task:'revisit',variant:slot.scenario==='revisit-alpha'?'alpha':'beta'};
   const dir=join(root,slot.id),ledger=join(root,slot.id+'-budget.json');
   if(!options.mock){
    await writeFile(ledger,JSON.stringify({schemaVersion:1,status:'APPROVED',phase:'deferral-reason-'+slot.id,newMaximum:24,perRunMaximum:12,used:0,attempts:[]},null,2)+'\n',{flag:'wx'});
    manifest.budgetLedgers.push({id:slot.id,path:slot.id+'-budget.json',used:0});await save();
   }
   const saved=await runHumanJev({out:dir,mock:options.mock,mode:modes[slot.condition],longContext:true,...(fixture?{holdoutFixture:fixture}:{}),runId:slot.id,deadlineEpochMs,...(!options.mock?{phaseBudget:ledger,envFile:options.envFile}:{})});
   if(saved.result.code?.sourceHash!==code.sourceHash||saved.result.code.revision!==code.revision)throw new Error('SOURCE_CHANGED_DURING_BATCH');
   const after=await sourceIdentity();if(after.sourceHash!==code.sourceHash||after.revision!==code.revision)throw new Error('SOURCE_CHANGED_DURING_BATCH');
   const initialImageSha256=sha(await readFile(join(dir,'initial-product.png'))),trialManifest=await json(join(dir,'manifest.json'));
   const requests=options.mock?0:trialManifest.actualAPIRequests;
   if(!Number.isInteger(requests)||requests<0||requests>24)throw new Error('TRIAL_REQUEST_ACCOUNTING_INVALID');
   records.push({...slot,initialImageSha256,result:saved.result});
   manifest.records.push({...slot,dir:slot.id,resultPath:slot.id+'/exploration/result.json',initialImageSha256,requests,replayPath:slot.id+'/offline-replay.json'});
   await save();
   const replay=await replayDirectory(join(dir,'exploration'));await writeFile(join(dir,'offline-replay.json'),JSON.stringify(replay,null,2)+'\n');
   const summary=analyzeReasonRuns(records);await writeFile(join(root,'summary.json'),JSON.stringify(summary,null,2)+'\n');
   if(summary.pairs.some(pair=>pair.status==='paired'&&!pair.consistent))throw new Error('PAIRED_INITIAL_OR_CONFIG_INTEGRITY_FAILED');
   const total=sum(manifest.records.map(r=>r.requests));if(total>manifest.limits.maxRequests)throw new Error('BATCH_REQUEST_ACCOUNTING_EXCEEDED');
   console.log(JSON.stringify({slot:manifest.records.length,total:schedule.length,id:slot.id,requests,totalRequests:total,objective:saved.result.objectiveAssessment.value,termination:saved.result.termination,uiActions:saved.result.uiActions,decisions:saved.result.decisions}));
  }
  if(manifest.status==='RUNNING')manifest.status=manifest.records.length===schedule.length?'COMPLETED':'INCOMPLETE';
 }catch(error){manifest.status='BATCH_ERROR';throw error;}
 finally{
  let accountingValid=true;
  for(const item of manifest.budgetLedgers){const ledger=await json(join(root,item.path));item.used=ledger.used;if(!Number.isInteger(item.used)||item.used<0||item.used>24)accountingValid=false;}
  manifest.requestAccounting.used=sum(manifest.budgetLedgers.map(item=>item.used));
  if(manifest.requestAccounting.used>manifest.limits.maxRequests)accountingValid=false;
  const checks=await Promise.all(prior.map(async item=>{try{return {...item,unchanged:sha(await readFile(item.path))===item.sha256};}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return {...item,unchanged:false};throw error;}}));
  const unchanged=checks.every(c=>c.unchanged);await writeFile(join(root,'prior-ledger-check.json'),JSON.stringify({unchanged,checked:checks.length,ledgers:checks},null,2)+'\n');await save();if(!unchanged)throw new Error('PRIOR_LEDGER_CHANGED');if(!accountingValid)throw new Error('BATCH_REQUEST_ACCOUNTING_INVALID');
 }
 return {root,status:manifest.status,trials:records.length,requests:manifest.requestAccounting.used};
}
async function main(){
 const args=process.argv.slice(2),options:Options={out:'',mock:false};
 for(let i=0;i<args.length;i++){const key=args[i];if(key==='--mock'){options.mock=true;continue;}if(!['--out','--env-file','--limit'].includes(key)||!args[i+1]||args[i+1].startsWith('--'))throw new Error('INVALID_OPTION');const value=args[++i];if(key==='--out')options.out=value;if(key==='--env-file')options.envFile=value;if(key==='--limit')options.limit=Number(value);}
 console.log(JSON.stringify(await runDeferralReasonExperiment(options)));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();



