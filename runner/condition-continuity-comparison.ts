import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join,isAbsolute,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {isDeepStrictEqual as eq} from 'node:util';
import {runHumanJev} from './human-jev-experiment.js';
import {humanJevProfile} from './human-jev-profiles.js';
import {sourceIdentity} from './virtual-beta-source.js';
import {recoverySchedule} from './recovery-evaluation.js';
import {analyzeRecoveryRuns} from './recovery-analysis.js';
import {readTransferLedger} from './transfer-evaluation.js';
import {verifyTransferFrames,transferFailureCategories} from './transfer-analysis.js';
import {visualConditionsStopReason,visualRequestMeasurements} from './visual-conditions-comparison.js';
import {replayDirectory} from './virtual-beta-replay.js';
import {safeRequestFailure} from '../jev/client.js';
import type {RecoveryRunRecord} from './recovery-contracts.js';
export const continuityActors=['experience-visual-conditions','experience-visual-conditions-continuity'] as const;
export const retentionActors=['experience-visual-conditions-continuity','experience-visual-conditions-retention'] as const;
export const checkActors=['experience-visual-conditions-retention','experience-visual-conditions-checks'] as const;
export const priorLinkActors=['experience-visual-conditions-checks','experience-visual-conditions-prior-links'] as const;
export const outcomeActors=['experience-working-inquiry','experience-inquiry-outcome'] as const;
export const inquiryActors=['experience-visual-conditions-prior-links','experience-working-inquiry'] as const;
export const comparisonActors=(retention=false,checks=false,priorLinks=false,inquiry=false,outcome=false)=>outcome?outcomeActors:inquiry?inquiryActors:priorLinks?priorLinkActors:checks?checkActors:retention?retentionActors:continuityActors;
export type ContinuityRun=RecoveryRunRecord&{actor:typeof continuityActors[number]|typeof retentionActors[number]|typeof checkActors[number]|typeof priorLinkActors[number]|typeof inquiryActors[number]|typeof outcomeActors[number];sequence:number};
export type ContinuityOptions={out:string;mock:boolean;priorSnapshot:string;envFile?:string;limit?:number;maxRequests?:number;retention?:boolean;checks?:boolean;trialMs?:180000|300000;visualRequestMs?:30000|60000;priorLinks?:boolean;inquiry?:boolean;outcome?:boolean};
export const continuityLimits={trials:8,maxRequests:288,parallel:1,retry:0,phaseMs:1800000,maxTrialMs:180000,maxJudgments:12,maxUIActions:15,maxLooks:3,maxRequestsPerTrial:36};
export const retentionLimits={...continuityLimits,trials:4,maxRequests:144,phaseMs:1200000};
function runtimeLimits(o:ContinuityOptions){const base=o.outcome?{...continuityLimits,phaseMs:2520000}:o.retention||o.checks||o.priorLinks||o.inquiry?retentionLimits:continuityLimits,maxTrialMs=o.trialMs??base.maxTrialMs;return {...base,maxTrialMs,...(o.visualRequestMs===undefined?{}:{maxVisualRequestMs:o.visualRequestMs}),phaseMs:Math.max(base.phaseMs,maxTrialMs*base.trials+60000)};}
const sha=(b:string|Buffer)=>createHash('sha256').update(b).digest('hex');
const inside=(parent:string,file:string)=>{const r=relative(parent,file);return r===''||!isAbsolute(r)&&r!=='..'&&!r.startsWith('../')&&!r.startsWith('..\\');};
export function continuitySchedule(retention=false,checks=false,priorLinks=false,inquiry=false,outcome=false){const names=comparisonActors(retention,checks,priorLinks,inquiry,outcome);return recoverySchedule().filter(s=>s.replicate===1&&(outcome?s.fixture.condition!=='switch':retention||checks||priorLinks||inquiry?s.fixture.condition==='unchanged':s.fixture.condition!=='switch')).flatMap((s,n)=>{const order=(n+1)%2?[...names].reverse():[...names];return order.map((actor,i)=>({...s,actor,sequence:n*2+i+1}));});}
export function validateContinuityOptions(o:ContinuityOptions){
 if(o.outcome!==undefined&&typeof o.outcome!=='boolean')throw Error('INVALID_INQUIRY_OUTCOME_OPTION');
 if(o.outcome&&(o.trialMs!==300000||o.visualRequestMs!==60000))throw Error('OUTCOME_EXPLICIT_COMMON_RUNTIME_REQUIRED');
 if(o.inquiry!==undefined&&typeof o.inquiry!=='boolean')throw Error('INVALID_WORKING_INQUIRY_OPTION');
 if(o.inquiry&&(o.trialMs!==300000||o.visualRequestMs!==60000))throw Error('INQUIRY_EXPLICIT_COMMON_RUNTIME_REQUIRED');
 if(o.priorLinks!==undefined&&typeof o.priorLinks!=='boolean'||[o.retention,o.checks,o.priorLinks,o.inquiry,o.outcome].filter(Boolean).length>1)throw Error('CONFLICTING_COMPARISON_OPTIONS');
 if(o.visualRequestMs!==undefined&&o.visualRequestMs!==30000&&o.visualRequestMs!==60000)throw Error('INVALID_VISUAL_REQUEST_TIMEOUT');
 if(o.priorLinks&&(o.trialMs!==300000||o.visualRequestMs!==60000))throw Error('PRIOR_LINKS_EXPLICIT_COMMON_RUNTIME_REQUIRED');
 if(o.trialMs!==undefined&&o.trialMs!==180000&&o.trialMs!==300000)throw Error('INVALID_TRIAL_RUNTIME');
 if(o.checks!==undefined&&typeof o.checks!=='boolean'||o.checks&&o.retention)throw Error('INVALID_CHECKS_OPTION');
 if(o.retention!==undefined&&typeof o.retention!=='boolean')throw Error('INVALID_RETENTION_OPTION');const limits=o.retention||o.checks||o.priorLinks||o.inquiry?retentionLimits:continuityLimits;
 if(typeof o.out!=='string'||!o.out.trim()||!inside(resolve('reports'),resolve(o.out))||typeof o.mock!=='boolean'||typeof o.priorSnapshot!=='string'||!isAbsolute(o.priorSnapshot))throw Error('EXPLICIT_REPORT_OUTPUT_AND_ABSOLUTE_PRIOR_REQUIRED');
 if(!Number.isInteger(o.limit??limits.trials)||(o.limit??limits.trials)<1||(o.limit??limits.trials)>limits.trials)throw Error(o.retention?'RETENTION_LIMIT_1_TO_4':'LIMIT_1_TO_8');
 if(o.maxRequests!==undefined&&(!Number.isInteger(o.maxRequests)||o.maxRequests<1||o.maxRequests>limits.maxRequests))throw Error(o.retention?'RETENTION_REQUEST_CAP_1_TO_144':'REQUEST_CAP_1_TO_288');
 if(o.mock&&o.envFile!==undefined)throw Error('MOCK_MUST_NOT_READ_ENV');
 if(!o.mock&&(typeof o.envFile!=='string'||!isAbsolute(o.envFile)||inside(process.cwd(),o.envFile)))throw Error('EXTERNAL_ENV_REQUIRED');
}
export function compareContinuityInitial(records:ContinuityRun[],retention=false,checks=false,priorLinks=false,inquiry=false,outcome=false){
 const reasons:string[]=[],items=comparisonActors(retention,checks,priorLinks,inquiry,outcome).map(actor=>records.filter(r=>r.actor===actor));
 if(items.some(a=>a.length!==1))return {present:false,evidenceAvailable:false,matched:false,reasons:['MISSING_OR_DUPLICATE_ACTOR']};
 const pair=items.map(a=>a[0]),v=pair.map(r=>r.result?.steps[0]?.visualHypotheses);
 if(v.some(x=>!x||!x.request||!x.assetFiles?.current))return {present:true,evidenceAvailable:false,matched:false,reasons:['MISSING_INITIAL_EXTRACTION_INPUT']};
 const clean=(x:any)=>{const c=structuredClone(x);if(priorLinks)delete c.priorConditionLinks;if(retention){if(c.conditionContinuity)delete c.conditionContinuity.retentionPolicy;}else if(!checks&&!priorLinks&&!inquiry&&!outcome)delete c.conditionContinuity;return c;};
 if(!pair[0].initialImageSha256||pair[0].initialImageSha256!==pair[1].initialImageSha256)reasons.push('INITIAL_PRODUCT_MISMATCH');
 if(!eq(pair[0].fixture,pair[1].fixture)||!eq(clean(v[0]!.request),clean(v[1]!.request)))reasons.push('UNDECLARED_INITIAL_REQUEST_CHANGE');
 const assets=(x:NonNullable<typeof v[number]>)=>Object.fromEntries(Object.entries(x.assetFiles).map(([k,a])=>[k,a.sha256]));
 if(!eq(assets(v[0]!),assets(v[1]!)))reasons.push('INITIAL_IMAGE_ASSET_MISMATCH');
 if(priorLinks&&(v[0]!.request.priorConditionLinks!==undefined||v[1]!.request.priorConditionLinks!==true))reasons.push('INITIAL_PRIOR_LINK_CONTRACT_MISMATCH');
 if((inquiry||outcome)&&v.some(x=>x!.request.priorConditionLinks!==true))reasons.push('INITIAL_INQUIRY_NATIVE_CONTRACT_MISMATCH');
 if(checks||priorLinks||inquiry||outcome){for(const record of pair){const context=record.result!.steps[0].visualHypotheses!.request.conditionContinuity;if(!context||context.retentionPolicy!=='grounded-unresolved'||context.memory.entries.length)reasons.push('INITIAL_CHECKS_STATE_MISMATCH');}}
 else if(retention){const a=v[0]!.request.conditionContinuity,b=v[1]!.request.conditionContinuity;if(!a||!b||a.retentionPolicy!==undefined||b.retentionPolicy!=='grounded-unresolved'||a.memory.entries.length||b.memory.entries.length)reasons.push('INITIAL_RETENTION_STATE_MISMATCH');}
 else if(v[0]!.request.conditionContinuity!==undefined||!v[1]!.request.conditionContinuity||v[1]!.request.conditionContinuity.memory.entries.length!==0)reasons.push('INITIAL_CONTINUITY_STATE_MISMATCH');
 return {present:true,evidenceAvailable:true,matched:reasons.length===0,reasons};
}
function knownReceipts(record:ContinuityRun,mock:boolean){
 if(mock)return 0;let received=0;
 for(const step of record.result?.steps??[]){const prior=[step.visualHypotheses,step.deliberation].filter(Boolean);const mirrored=!step.response&&prior.some(stage=>stage?.error!==undefined&&eq(stage.error,step.error));
  for(const stage of [...prior,...(!mirrored?[step]:[])] as any[]){const response=stage.response,error=stage.error,trace=response?.request??error?.request??error;
   if(trace?.httpReceived===true||response&&typeof response.model==='string'&&response.answers||[error,error?.failure,...(Array.isArray(trace?.failures)?trace.failures:[])].some(v=>v&&Number.isInteger(v.statusCode)&&v.statusCode>=400&&v.statusCode<=599))received++;
  }
 }return received;
}
export function analyzeContinuityRecords(records:ContinuityRun[],mock=false,retention=false,checks=false,trialMs?:180000|300000,priorLinks=false,visualRequestMs?:30000|60000,inquiry=false,outcome=false){
 const names=comparisonActors(retention,checks,priorLinks,inquiry,outcome),schedule=continuitySchedule(retention,checks,priorLinks,inquiry,outcome),fixtures=schedule.filter((_,n)=>n%2===0).map(s=>s.fixture);
 const malformed=records.filter(r=>r.result&&(!r.result.steps[0]?.visualHypotheses?.request||!r.result.steps[0]?.visualHypotheses?.assetFiles?.current));
 const checked=records.map(r=>malformed.includes(r)?{...r,error:{code:'MISSING_INITIAL_EXTRACTION_INPUT'}}:r);
 const actors=Object.fromEntries(names.map(actor=>[actor,analyzeRecoveryRuns(checked.filter(r=>r.actor===actor),{mode:actor,replicates:1,fixtures,maxRunMs:trialMs,visualRequestMs})]));
 const pairs=fixtures.map(fixture=>({fixture,...compareContinuityInitial(records.filter(r=>eq(r.fixture,fixture)),retention,checks,priorLinks,inquiry,outcome)}));
 const missing=schedule.filter(s=>!records.some(r=>r.actor===s.actor&&r.id===s.id&&eq(r.fixture,s.fixture)));
 const valid=Object.values(actors).reduce((n,a)=>n+a.totals.valid,0),errors=Object.values(actors).flatMap(a=>a.integrity.errors);
 const ids=records.map(r=>r.runId);if(new Set(ids).size!==ids.length)errors.push({code:'DUPLICATE_RUN_ID',ids});
 if(records.some(r=>!schedule.some(s=>s.actor===r.actor&&s.id===r.id&&eq(s.fixture,r.fixture))))errors.push({code:'UNPLANNED_SLOT',ids});
 for(const p of pairs)if(p.present&&!p.matched)errors.push({code:'INITIAL_PAIR_MISMATCH',ids});
 const requestEvidence=records.map(record=>({...visualRequestMeasurements(record,mock),knownHTTPReceipts:knownReceipts(record,mock)}));
 const measurements={chargedRequests:requestEvidence.reduce((n,r)=>n+r.chargedRequests,0),knownHTTPAttempts:requestEvidence.reduce((n,r)=>n+r.knownHTTPAttempts,0),knownHTTPReceipts:requestEvidence.reduce((n,r)=>n+r.knownHTTPReceipts,0),receiptUnconfirmedChargedRequests:requestEvidence.reduce((n,r)=>n+Math.max(0,r.chargedRequests-r.knownHTTPReceipts),0),httpAttemptCountsComplete:requestEvidence.every(r=>r.httpAttemptCountsComplete),costUSD:requestEvidence.every(r=>r.costUSD!==null)?requestEvidence.reduce((n,r)=>n+r.costUSD!,0):null,humanTimeMs:null};
 return {schemaVersion:1,kind:outcome?(mock?'MOCK_INQUIRY_OUTCOME_INTEGRATION_ONLY':'ACTUAL_INQUIRY_OUTCOME_DESCRIPTIVE'):inquiry?(mock?'MOCK_WORKING_INQUIRY_INTEGRATION_ONLY':'ACTUAL_WORKING_INQUIRY_DESCRIPTIVE'):priorLinks?(mock?'MOCK_PRIOR_LINKS_INTEGRATION_ONLY':'ACTUAL_PRIOR_LINKS_DESCRIPTIVE'):checks?(mock?'MOCK_ACTION_CHECKS_INTEGRATION_ONLY':'ACTUAL_ACTION_CHECKS_DESCRIPTIVE'):retention?(mock?'MOCK_RETENTION_INTEGRATION_ONLY':'ACTUAL_RETENTION_DESCRIPTIVE'):(mock?'MOCK_CONTINUITY_INTEGRATION_ONLY':'ACTUAL_CONTINUITY_DESCRIPTIVE'),planned:schedule.length,attempted:records.length,notAttempted:missing.length,valid,invalid:records.length-valid,complete:records.length===schedule.length&&missing.length===0,missing:missing.map(s=>({id:s.id,actor:s.actor})),measurements,requestEvidence,integrity:{ok:errors.length===0,errors},actors,pairs,limitations:['One trial per mode/task/condition; no statistical, causal or human-reproduction claim.',outcome?'Only bounded previous working condition/check/executed operation, current-image model outcome assessment, admitted memory3 and action guidance differ. No extra API stage/native schema/UI/sampler/weight changes; revisit remains available.':inquiry?'Only three working-inquiry assessment questions and their bounded condition context, admitted choices and candidate-local decision guidance differ. Native body/schema, UI, sampler, weights, models and common300s/native60s caps remain unchanged.':priorLinks?'Only explicit model-derived current-control to recalled unresolved-condition references, their bounded sidecar and guidance differ; native60s cap is common to both actors. Initial image/goal/memory match; enabled output relation schema and instructions deliberately differ. No weights, roles, UI or sampler change.':checks?'Only candidate-local tuples from already admitted visual conditions and indirect-progress effect/action guidance differ; no extra native request or schema, UI, sampler or action weights change.':retention?'Only explicit grounded-unresolved retention policy and its audit trace differ; common client timeout measurement is not model input. Model, native output schema/instructions, UI, effort and action weights remain unchanged.':'Explicit native continuity context/schema/instructions and decision guidance form one declared intervention; model, image transport, UI and effort are unchanged.','Grounded quotations remain model-transcribed-unverified. Current uncertainty and historical evidence are distinct.','Infrastructure failures, API waiting and unattempted slots are not user confusion, human thought time or abandonment.','Models choose condition mappings and actions; no correct route or revisit ban is registered.']};
}
export async function runContinuityComparison(options:ContinuityOptions){
 validateContinuityOptions(options);const limits=runtimeLimits(options),names=comparisonActors(options.retention,options.checks,options.priorLinks,options.inquiry,options.outcome),schedule=continuitySchedule(options.retention,options.checks,options.priorLinks,options.inquiry,options.outcome),protocolFile=options.outcome?'experiments/virtual-beta/inquiry-outcome-comparison.json':options.inquiry?'experiments/virtual-beta/working-inquiry-comparison.json':options.priorLinks?'experiments/virtual-beta/visual-prior-links-comparison.json':options.checks?'experiments/virtual-beta/visual-action-checks-comparison.json':options.retention?'experiments/virtual-beta/condition-retention-comparison.json':'experiments/virtual-beta/condition-continuity-comparison.json';const out=resolve(options.out),code=await sourceIdentity(),protocolBytes=await readFile(protocolFile),charter=await readFile('experiments/persona/charter.json'),priorBytes=await readFile(options.priorSnapshot),prior=JSON.parse(priorBytes.toString('utf8'));
 if(!Number.isInteger(prior.count)||prior.count!==prior.files?.length||new Set(prior.files.map((f:any)=>f.path)).size!==prior.count||prior.files.some((f:any)=>!isAbsolute(f.path)||!f.path.includes('reports')||!/^[a-f0-9]{64}$/.test(f.sha256)))throw Error('INVALID_PRIOR_SNAPSHOT');
 const preserve=async()=>{for(const f of prior.files)if(sha(await readFile(f.path))!==f.sha256)throw Error('PRIOR_RAW_CHANGED');};await preserve();
 const profiles=Object.fromEntries(names.map(a=>[a,humanJevProfile(a,options.trialMs,options.visualRequestMs)])),batchId=randomUUID(),started=Date.now(),records:ContinuityRun[]=[],deadline=started+limits.phaseMs;
 const manifest:any={schemaVersion:1,phase:options.outcome?'inquiry-outcome-2026-10-31':options.inquiry?'working-inquiry-2026-10-30':options.priorLinks?'visual-prior-links-2026-10-30':options.checks?'visual-action-checks-2026-10-30':options.retention?'condition-retention-2026-10-30':'condition-continuity-2026-10-30',...(options.outcome?{outcome:true}:{}),...(options.inquiry?{inquiry:true}:{}),...(options.priorLinks?{priorLinks:true}:{}),...(options.retention?{retention:true}:{}),...(options.checks?{checks:true}:{}),batchId,...code,mock:options.mock,profiles,limits,schedule,executionTrialLimit:options.limit??limits.trials,executionMaximumRequests:options.maxRequests??limits.maxRequests,actorOrderOffset:1,protocolSha256:sha(protocolBytes),charterSha256:sha(charter),priorSnapshotSha256:sha(priorBytes),priorCount:prior.count,humanInputsRead:false,startedAt:new Date(started).toISOString(),records,status:'RUNNING',totalRequests:0,preservationBefore:true,preservationAfter:false,error:null};
 const frozen=async()=>{if(!eq(code,await sourceIdentity())||sha(await readFile(protocolFile))!==sha(protocolBytes)||sha(await readFile('experiments/persona/charter.json'))!==sha(charter)||sha(await readFile(options.priorSnapshot))!==sha(priorBytes)||!eq(profiles,Object.fromEntries(names.map(a=>[a,humanJevProfile(a,options.trialMs,options.visualRequestMs)]))))throw Error('FROZEN_SOURCE_CHANGED');await preserve();};
 const save=async()=>{manifest.totalRequests=records.reduce((n,r)=>n+r.requests,0);await writeFile(join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');const summary=analyzeContinuityRecords(records,options.mock,options.retention,options.checks,options.trialMs,options.priorLinks,options.visualRequestMs,options.inquiry,options.outcome);await writeFile(join(out,'summary.json'),JSON.stringify(summary,null,2)+'\n');};
 await mkdir(resolve(out,'..'),{recursive:true});await mkdir(out);await writeFile(join(out,'protocol.json'),protocolBytes);await writeFile(join(out,'source.json'),JSON.stringify(code,null,2));await save();let consecutiveInfrastructure=0;
 try{
  for(const slot of schedule.slice(0,options.limit??limits.trials)){
   if(Date.now()>=deadline){manifest.status='PHASE_TIME_LIMIT';break;}if(manifest.totalRequests+36>manifest.executionMaximumRequests){manifest.status='REQUEST_LIMIT';break;}await frozen();
   const dir=join(out,slot.id+'-'+slot.actor),ledger=options.mock?null:dir+'-budget.json',record:ContinuityRun={...slot,runId:batchId+'-'+slot.sequence,status:'ATTEMPTING',dir,ledger,resultPath:join(dir,'exploration/result.json'),requests:0,initialImageSha256:null};records.push(record);await save();
   try{
    if(ledger)await writeFile(ledger,JSON.stringify({schemaVersion:1,status:'APPROVED',phase:'condition-continuity-'+slot.sequence,newMaximum:36,perRunMaximum:12,used:0,attempts:[]},null,2),{flag:'wx'});
    const saved=await runHumanJev({out:dir,mock:options.mock,mode:slot.actor,longContext:true,recoveryFixture:slot.fixture,runId:record.runId,deadlineEpochMs:Math.min(deadline,Date.now()+limits.maxTrialMs),maxRunMs:options.trialMs,visualRequestMs:options.visualRequestMs,...(!options.mock?{envFile:options.envFile,phaseBudget:ledger!}:{})});
    record.result=saved.result;record.status='RESULT';record.requests=options.mock?0:saved.result.apiCalls;
    if(!eq(record.result.code,{revision:code.revision,sourceHash:code.sourceHash})||!eq(record.result.config,profiles[slot.actor].config)||!options.mock&&!eq(record.result.transport,{jevImageReferences:'opaque-v1'}))throw Error('TRIAL_IDENTITY_MISMATCH');
    if((options.retention||options.checks||options.priorLinks||options.inquiry||options.outcome)&&!eq(record.result.measurement,{visualDispatch:'client-timeout-v1',...(!options.mock?{visualHTTP:'final-timeout-v1'}:{})}))throw Error('MISSING_CLIENT_TIMEOUT_MEASUREMENT');
    record.initialImageSha256=sha(await readFile(join(dir,'exploration/initial-product.png')));
    await replayDirectory(join(dir,'exploration'),{finalVisualHTTP:!options.mock});record.replay={status:'OK'};record.frameChecks=await verifyTransferFrames(record.result,join(dir,'exploration'));
   }catch(error){const safe=safeRequestFailure(error);record.error={code:error instanceof Error&&/^[A-Z_]+$/.test(error.message)?error.message:safe.code,...(safe.statusCode?{statusCode:safe.statusCode}:{})};if(!record.result){record.status='FAILED';try{record.result=JSON.parse(await readFile(record.resultPath,'utf8'));record.requests=options.mock?0:record.result!.apiCalls;}catch{}}}
   finally{if(ledger){try{record.ledgerEvidence=await readTransferLedger(ledger,36);record.requests=Math.max(record.requests,record.ledgerEvidence.used);if(record.ledgerEvidence.reserved)record.error={code:'LEDGER_ACCOUNTING_UNAVAILABLE'};}catch{record.error={code:'LEDGER_ACCOUNTING_UNAVAILABLE'};}}await save();}
   await frozen();const stop=visualConditionsStopReason(record);if(stop){manifest.status=stop;break;}if(record.error){manifest.status='TRIAL_AUDIT_ERROR';break;}
   const pair=compareContinuityInitial(records.filter(r=>eq(r.fixture,slot.fixture)),options.retention,options.checks,options.priorLinks,options.inquiry,options.outcome);if(pair.present&&!pair.matched){manifest.status='PAIR_MISMATCH';break;}
   console.log(JSON.stringify({slot:slot.sequence,actor:slot.actor,task:slot.fixture.task,condition:slot.fixture.condition,requests:record.requests,totalRequests:manifest.totalRequests,termination:record.result?.termination,objective:record.result?.objectiveAssessment}));
   consecutiveInfrastructure=transferFailureCategories(record).infrastructure?consecutiveInfrastructure+1:0;if(consecutiveInfrastructure>=2){manifest.status='CONSECUTIVE_INFRASTRUCTURE_FAILURES';break;}
  }
  if(manifest.status==='RUNNING')manifest.status=records.length===schedule.length?'COMPLETED':'INCOMPLETE';
 }catch(error){manifest.status='BATCH_ERROR';manifest.error={code:error instanceof Error&&/^[A-Z_]+$/.test(error.message)?error.message:'BATCH_FAILED'};throw error;}
 finally{try{await preserve();manifest.preservationAfter=true;}finally{await save();}}
 return {out,status:manifest.status,attempted:records.length,requests:manifest.totalRequests};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const o:any={mock:false};try{for(let i=2;i<process.argv.length;i++){const k=process.argv[i];if(k==='--mock'){o.mock=true;continue;}if(k==='--retention'){o.retention=true;continue;}if(k==='--checks'){o.checks=true;continue;}if(k==='--prior-links'){o.priorLinks=true;continue;}if(k==='--inquiry'){o.inquiry=true;continue;}if(k==='--outcome'){o.outcome=true;continue;}const key=({'--out':'out','--env-file':'envFile','--prior-snapshot':'priorSnapshot','--limit':'limit','--max-requests':'maxRequests','--trial-ms':'trialMs','--visual-request-ms':'visualRequestMs'} as Record<string,string>)[k],value=process.argv[++i];if(!key||!value||value.startsWith('--'))throw Error('INVALID_OPTION');o[key]=key==='limit'||key==='maxRequests'||key==='trialMs'||key==='visualRequestMs'?Number(value):value;}console.log(JSON.stringify(await runContinuityComparison(o)));}catch{console.error('CONTINUITY_COMPARISON_FAILED_CHECK_MANIFEST');process.exitCode=1;}}
