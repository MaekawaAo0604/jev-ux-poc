import {chromium} from 'playwright';
import {createServer} from 'vite';
import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import type {BetaConfig} from '../jev/virtual-beta/contracts.js';
import {replayDirectory} from './virtual-beta-replay.js';
import {parseCharter,parsePersona} from '../jev/persona.js';
import {ChoiceRequestError} from '../jev/client.js';
import {comparisonUIs,roiSelectors} from '../app/virtual-beta-ui.js';
import {parseControlledComparisonPlan,scheduleControlledComparison,type ControlledTrial} from './controlled-comparison-plan.js';
import {PhaseBudget} from './virtual-beta-budget.js';
import {BudgetPersistenceError,persistBudgetSnapshot} from './budget-persistence.js';
import {sourceIdentity} from './virtual-beta-source.js';
import {evaluateBetaRequest} from './virtual-beta-evaluator.js';
import {analyzeRun} from './virtual-beta-analysis.js';
import {runBeta,sha,BetaBudgetError,BetaAdmissionError,BetaSettlementError,BetaResponseError,type BetaEvaluator,type BetaResult} from './virtual-beta-core.js';
import {comparisonHTML,mockEvaluator} from './virtual-beta.js';

export type ControlledComparisonOptions={plan:unknown;out:string;mock:boolean;envFile?:string;charterFile?:string;personaFile?:string;phaseBudgetFile?:string;headed?:boolean};
export type TrialStatus='planned'|'attempted'|'completed'|'invalid'|'censored'|'missing';
export type ControlledTrialRecord=ControlledTrial&{perTrialAPICap:number;status:TrialStatus;statusHistory:{status:TrialStatus;at:string}[];termination:string|null;reason:string|null;actualAPIRequests:number|null;simulatedAPIRequests:number;reservedAPIRequests:number;costUSD:number|null;modelWaitingMs:number|null;modeledUserMs:number|null;humanTaskMs:null;domainCollectionCostUSD:null;initialFingerprint:string|null;runtimeMaxRunMs:number|null;runtimeConfigHash:string|null;rawSha256:string|null;artifactHashes:Record<string,string>;replay:{status:'OK'|'ERROR';code?:string}|null};
export type ControlledRequestRecord={ordinal:number;runId:string;reservationId:string|null;status:'reserved'|'in-flight'|'ok'|'error'|'not-dispatched';actualAPIRequests:number|null;simulatedAPIRequests:number;costUSD:number|null;failureCode:string|null;apiMs:number;at:string};
const now=()=>new Date().toISOString();
const budgets=new Set(['API_LIMIT','TIME_LIMIT','UI_ACTION_LIMIT','LOOK_LIMIT','DECISION_LIMIT']);
class ComparisonFailure extends Error{constructor(readonly code:string){super(code);}}
const requestTrace=(error:unknown)=>error instanceof ChoiceRequestError?error.request:error instanceof BetaResponseError?error.response.request:undefined;
const failureCode=(error:unknown)=>error instanceof ChoiceRequestError?error.failure.code:error instanceof BetaResponseError?error.code:error instanceof BetaAdmissionError||error instanceof BetaSettlementError?error.code:error instanceof BetaBudgetError?error.kind:error instanceof ComparisonFailure?error.code:'REQUEST_FAILED';
const costTotal=(values:(number|null)[])=>values.length>0&&values.every(v=>v!==null)?values.reduce<number>((s,v)=>s+v!,0):null;
const escapeHTML=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const csv=(value:unknown)=>'"'+String(value??'').replaceAll('"','""')+'"';

/** Trustworthy model-invalid streaks exclude corrupt observations and infrastructure errors. */
export function classifyControlledTrial(result:BetaResult,options:{fatalStopReason?:string|null;requestFailureCodes?:string[]}={}):{status:'completed'|'censored'|'invalid';reason:string|null;stopReason:string|null;trustworthyModelInvalid:boolean}{
 const analysis=analyzeRun(result),reasons=analysis.classification.reasons;
 if(options.fatalStopReason)return {status:'invalid',reason:options.fatalStopReason,stopReason:options.fatalStopReason,trustworthyModelInvalid:false};
 if(options.requestFailureCodes?.includes('TIMEOUT'))return {status:'invalid',reason:'INFRASTRUCTURE_TIMEOUT',stopReason:'INFRASTRUCTURE_TIMEOUT',trustworthyModelInvalid:false};
 const auditInvalid=reasons.some(reason=>!['INFRASTRUCTURE_TERMINATION','RUN_REPORTED_INVALID'].includes(reason));
 if(auditInvalid||analysis.classification.artifactValidity==='unknown')return {status:'invalid',reason:'AUDIT_INVALID',stopReason:'AUDIT_INVALID',trustworthyModelInvalid:false};
 if(result.termination==='INVALID_DISTRIBUTION')return {status:'invalid',reason:'INVALID_DISTRIBUTION',stopReason:null,trustworthyModelInvalid:true};
 if(analysis.classification.artifactValidity!=='artifact-valid')return {status:'invalid',reason:result.termination,stopReason:result.termination,trustworthyModelInvalid:false};
 return {status:budgets.has(result.termination)?'censored':'completed',reason:null,stopReason:null,trustworthyModelInvalid:false};
}

/** Bind retained raw bytes to the frozen trial identity before ordinary saved-input replay. */
export async function auditControlledTrialArtifacts(directory:string,expected:{runId:string;condition:string;config:BetaConfig;code:{revision:string;sourceHash:string}},result:BetaResult){
 const bytes=await readFile(join(directory,'result.json')),raw=JSON.parse(bytes.toString()) as BetaResult;
 if(!isDeepStrictEqual(raw,JSON.parse(JSON.stringify(result))))throw new ComparisonFailure('TRIAL_RESULT_BYTES_MISMATCH');
 if(raw.runId!==expected.runId||raw.condition!==expected.condition)throw new ComparisonFailure('TRIAL_IDENTITY_MISMATCH');
 if(!isDeepStrictEqual(raw.config,expected.config))throw new ComparisonFailure('TRIAL_CONFIG_MISMATCH');
 if(!isDeepStrictEqual(raw.code,expected.code))throw new ComparisonFailure('TRIAL_CODE_MISMATCH');
 await replayDirectory(directory);
 return {rawSha256:sha(bytes),replay:{status:'OK' as const}};
}

/** The optional evaluator factory is a test fixture restricted to API-zero mock runs. */
export async function runControlledComparison(options:ControlledComparisonOptions,injectedEvaluatorFactory?:()=>BetaEvaluator){
 const plan=parseControlledComparisonPlan(options.plan),schedule=scheduleControlledComparison(plan),root=resolve(options.out);
 if(injectedEvaluatorFactory&&!options.mock)throw Error('INJECTED_EVALUATOR_REQUIRES_MOCK');
 if(options.mock&&options.phaseBudgetFile)throw Error('MOCK_MUST_NOT_CONSUME_REAL_BUDGET');
 if(!options.mock&&!options.phaseBudgetFile)throw Error('PHASE_BUDGET_REQUIRED');
 if(existsSync(root))throw Error('OUTPUT_EXISTS');
 // Ledger validation and full allocation admission precede even credential loading.
 const phaseBudget=options.phaseBudgetFile?await PhaseBudget.open(options.phaseBudgetFile):undefined;
 try{
  if(phaseBudget&&(phaseBudget.remaining<plan.allocatedAPIRequests||phaseBudget.snapshot().perRunMaximum<Math.max(...plan.configs.map(c=>c.maxAPICalls))))throw Error('UNDERFUNDED_COMPARISON_PHASE');
  if(!options.mock){const env=options.envFile??'.env';if(existsSync(env))process.loadEnvFile(env);if(!process.env.AI_GATEWAY_API_KEY)throw Error('AI_GATEWAY_API_KEY required (or use --mock)');}
  const charter=parseCharter(JSON.parse(await readFile(options.charterFile??'experiments/persona/charter-good.json','utf8'))),persona=parsePersona(JSON.parse(await readFile(options.personaFile??'experiments/persona/persona-a.json','utf8')));
  if(charter.oracle!=='notifications'||charter.targetWebsite!=='local:good')throw Error('COMPARISON_REQUIRES_LOCAL_NOTIFICATION_FIXTURE');
  const code=await sourceIdentity(),planHash=sha(JSON.stringify(plan)),uiVersion={...comparisonUIs.reference,definitionHash:sha(JSON.stringify(comparisonUIs.reference))};
  await mkdir(dirname(root),{recursive:true});try{await mkdir(root);}catch(error){if((error as NodeJS.ErrnoException).code==='EEXIST')throw Error('OUTPUT_EXISTS');throw error;}
  const records:ControlledTrialRecord[]=schedule.map(trial=>({...trial,perTrialAPICap:trial.config.maxAPICalls,status:'planned',statusHistory:[{status:'planned',at:now()}],termination:null,reason:null,actualAPIRequests:0,simulatedAPIRequests:0,reservedAPIRequests:0,costUSD:null,modelWaitingMs:null,modeledUserMs:null,humanTaskMs:null,domainCollectionCostUSD:null,initialFingerprint:null,runtimeMaxRunMs:null,runtimeConfigHash:null,rawSha256:null,artifactHashes:{},replay:null}));
  const requests:ControlledRequestRecord[]=[],results:BetaResult[]=[];
  let stopReason:string|null=null,consecutiveModelInvalid=0,fatalStopReason:string|null=null,executionFinished=false;
  const started=performance.now(),deadline=started+plan.maxDurationMs;
  const manifest={schemaVersion:1,kind:'controlled-comparison',createdAt:now(),...code,mock:options.mock,model:options.mock?'MOCK_SCRIPTED_FIXTURE':'jev-1.14.0',plan,planHash,configs:plan.configs,allConfigs:plan.configs,scenarios:schedule,schedule:schedule.map(t=>({...t,id:t.runId})),status:'RUNNING',stopReason:null as string|null,totalRequests:0 as number|null,records:[] as object[],charter,persona,uiVariants:[uiVersion],repeat:plan.seeds.length,maxTotalAPI:plan.maxTotalAPI,allocatedAPIRequests:plan.allocatedAPIRequests,phaseBudget:phaseBudget?{file:resolve(options.phaseBudgetFile!),before:phaseBudget.snapshot()}:null,viewport:{width:1280,height:900},locale:'ja-JP',timezoneId:'Asia/Tokyo',concurrency:1,retry:0,modelSeedAvailable:false,seedInterpretation:'Distinct seeds initialize fresh local action samplers; external model determinism is not claimed.',budgetScope:'Each condition x replicate has its own config.maxAPICalls. Allocations are admitted in full before execution.',humanValidity:'UNVERIFIED',probabilitiesAreHumanFrequencies:false};
  await writeFile(join(root,'manifest.json'),JSON.stringify(manifest,null,2));
  const transition=(row:ControlledTrialRecord,status:TrialStatus,reason:string|null=null)=>{row.status=status;row.reason=reason;row.statusHistory.push({status,at:now()});};
  const checkpoint=async()=>{
   manifest.status=executionFinished?(stopReason?'STOPPED':'COMPLETED'):'RUNNING';manifest.stopReason=stopReason;
   manifest.records=records.filter(row=>row.statusHistory.some(s=>s.status==='attempted')).map(row=>({id:row.runId,runId:row.runId,condition:row.condition,replicate:row.replicate,seed:row.seed,position:row.position,persona,status:row.status==='attempted'?'ATTEMPTING':row.rawSha256?'RESULT':'FAILED',trialStatus:row.status,dir:join(root,row.runId),resultPath:join(root,row.runId,'result.json'),requests:options.mock?0:row.actualAPIRequests,reservedAPIRequests:row.reservedAPIRequests,simulatedAPIRequests:row.simulatedAPIRequests,rawSha256:row.rawSha256,artifactHashes:row.artifactHashes,replay:row.replay,runtimeMaxRunMs:row.runtimeMaxRunMs,runtimeConfigHash:row.runtimeConfigHash,...(row.status==='invalid'?{error:{code:row.reason??'TRIAL_INVALID'}}:{})}));
   manifest.totalRequests=records.every(r=>r.actualAPIRequests!==null)?records.reduce((sum,r)=>sum+r.actualAPIRequests!,0):null;
   await persistBudgetSnapshot(join(root,'checkpoint.json'),{schemaVersion:1,planHash,updatedAt:now(),stopReason,trials:records,requests});
   await persistBudgetSnapshot(join(root,'manifest.json'),manifest);
  };
  await checkpoint();
  const refreshAccounting=(row:ControlledTrialRecord)=>{
   const entries=requests.filter(r=>r.runId===row.runId);
   row.actualAPIRequests=entries.every(r=>r.actualAPIRequests!==null)?entries.reduce((sum,r)=>sum+r.actualAPIRequests!,0):null;
   row.costUSD=costTotal(entries.map(r=>r.costUSD));
   row.modelWaitingMs=entries.length?entries.reduce((sum,r)=>sum+r.apiMs,0):null;
  };
  const assertFrozen=async()=>{
   if(sha(JSON.stringify(plan))!==planHash)throw new ComparisonFailure('PLAN_CHANGED');
   let current:Awaited<ReturnType<typeof sourceIdentity>>;try{current=await sourceIdentity();}catch{throw new ComparisonFailure('SOURCE_AUDIT_FAILED');}
   if(current.sourceHash!==code.sourceHash||current.revision!==code.revision)throw new ComparisonFailure('SOURCE_CHANGED');
  };
  let server:Awaited<ReturnType<typeof createServer>>|undefined,browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
  try{
   server=await createServer({server:{host:'127.0.0.1',port:0}});await server.listen();const address=server.httpServer!.address();if(!address||typeof address==='string')throw new ComparisonFailure('NO_LOCAL_PORT');const baseURL='http://127.0.0.1:'+address.port;
   browser=await chromium.launch({headless:!options.headed});
   for(const row of records){
    if(performance.now()>=deadline){stopReason='PHASE_TIME_LIMIT';break;}
    await assertFrozen();transition(row,'attempted');await checkpoint();
    const dir=join(root,row.runId);await mkdir(dir);
    const context=await browser.newContext({viewport:manifest.viewport,locale:manifest.locale,timezoneId:manifest.timezoneId,acceptDownloads:false});let safety=false,result:BetaResult|undefined;
    try{
     await context.route('**/*',route=>{const request=route.request(),url=new URL(request.url());if(url.hostname==='fonts.googleapis.com'&&request.resourceType()==='stylesheet')return route.fulfill({contentType:'text/css',body:''});if(url.origin===baseURL&&['GET','HEAD'].includes(request.method()))return route.continue();safety=true;return route.abort();});
     const page=await context.newPage();page.on('download',download=>{safety=true;void download.cancel();});await context.tracing.start({screenshots:true,snapshots:true,sources:false});
     const fake=(injectedEvaluatorFactory??mockEvaluator)();
     const evaluate:BetaEvaluator=async request=>{
      if(row.simulatedAPIRequests+row.reservedAPIRequests>=row.config.maxAPICalls)throw new BetaBudgetError('API_LIMIT');
      if(performance.now()>=deadline)throw new BetaBudgetError('TIME_LIMIT');
      try{await assertFrozen();}catch(error){fatalStopReason=failureCode(error);throw error;}
      const entry:ControlledRequestRecord={ordinal:requests.length+1,runId:row.runId,reservationId:null,status:'reserved',actualAPIRequests:0,simulatedAPIRequests:0,costUSD:null,failureCode:null,apiMs:0,at:now()};
      const dispatchDeadline=Math.min(deadline,performance.now()+request.timeoutMs);
      if(phaseBudget){try{entry.reservationId=await phaseBudget.reserve({runKey:root+'/'+row.runId,condition:row.condition,revision:code.revision,sourceHash:code.sourceHash,uiVersion:'reference'});row.reservedAPIRequests++;}catch(error){fatalStopReason='BUDGET_ADMISSION_ERROR';throw error;}}
      requests.push(entry);await checkpoint();
      const remaining=Math.floor(dispatchDeadline-performance.now());
      if(remaining<=0){entry.status='not-dispatched';entry.failureCode='DEADLINE_BEFORE_REQUEST';if(phaseBudget&&entry.reservationId)try{await phaseBudget.settle(entry.reservationId,'ERROR',{attempts:0,failureCode:entry.failureCode});}catch(error){fatalStopReason='BUDGET_SETTLEMENT_AFTER_REQUEST';throw new BetaAdmissionError(error instanceof BudgetPersistenceError?error.details:undefined,'deadline-settlement');}await checkpoint();throw new BetaBudgetError('TIME_LIMIT');}
      entry.status='in-flight';if(!options.mock)entry.actualAPIRequests=null;refreshAccounting(row);await checkpoint();
      const callStarted=performance.now();let response:Awaited<ReturnType<BetaEvaluator>>;
      try{
       if(options.mock){entry.simulatedAPIRequests=1;row.simulatedAPIRequests++;response=await fake({...request,timeoutMs:remaining});}
       else response=await evaluateBetaRequest({...request,timeoutMs:remaining});
      }catch(error){
       entry.apiMs=performance.now()-callStarted;entry.status='error';entry.failureCode=failureCode(error);
       if(!options.mock){const trace=requestTrace(error);entry.actualAPIRequests=trace?.attempts??null;refreshAccounting(row);if(error instanceof BetaResponseError)entry.costUSD=error.response.costUSD??null;if(entry.actualAPIRequests===null||entry.actualAPIRequests>1)fatalStopReason='REQUEST_ACCOUNTING_ERROR';}
       if(phaseBudget&&entry.reservationId)try{await phaseBudget.settle(entry.reservationId,'ERROR',{...(entry.actualAPIRequests===null?{}:{attempts:entry.actualAPIRequests}),failureCode:entry.failureCode});}catch(persistenceError){fatalStopReason='BUDGET_SETTLEMENT_AFTER_REQUEST';throw new BetaSettlementError(persistenceError instanceof BudgetPersistenceError?persistenceError.details:undefined,'error');}
       refreshAccounting(row);await checkpoint();throw error;
      }
      entry.apiMs=performance.now()-callStarted;entry.status='ok';entry.costUSD=options.mock?null:response.costUSD??null;
      if(!options.mock){entry.actualAPIRequests=response.request?.attempts??null;refreshAccounting(row);}
      if(phaseBudget&&entry.reservationId)try{await phaseBudget.settle(entry.reservationId,'OK',entry.actualAPIRequests===null?{}:{attempts:entry.actualAPIRequests});}catch(error){fatalStopReason='BUDGET_SETTLEMENT_AFTER_REQUEST';throw new BetaSettlementError(error instanceof BudgetPersistenceError?error.details:undefined,'response');}
      if(!options.mock&&entry.actualAPIRequests!==1){fatalStopReason='REQUEST_ACCOUNTING_ERROR';await checkpoint();throw new ComparisonFailure('REQUEST_ACCOUNTING_ERROR');}
      refreshAccounting(row);await checkpoint();return response;
     };
     // Cap the ordinary runner's clock to the predetermined remaining phase time.
     const config={...row.config,maxRunMs:Math.max(1,Math.min(row.config.maxRunMs,Math.floor(deadline-performance.now())))};
     row.runtimeMaxRunMs=config.maxRunMs;row.runtimeConfigHash=sha(JSON.stringify(config));await checkpoint();
     result=await runBeta(page,{runId:row.runId,dir,baseURL,charter,persona,config,evaluate,uiVersion,roiSelectors,code:{revision:code.revision,sourceHash:code.sourceHash},isSafetyStopped:()=>safety});
     results.push(result);row.termination=result.termination;refreshAccounting(row);row.modeledUserMs=result.modeledUserMs;row.initialFingerprint=result.initialFingerprint;row.costUSD=costTotal(requests.filter(r=>r.runId===row.runId).map(r=>r.costUSD));
     try{
      row.rawSha256=sha(await readFile(join(dir,'result.json')));
      const audit=await auditControlledTrialArtifacts(dir,{runId:row.runId,condition:row.condition,config,code:{revision:code.revision,sourceHash:code.sourceHash}},result);row.replay=audit.replay;
     }catch(error){fatalStopReason=error instanceof ComparisonFailure?error.code:'TRIAL_REPLAY_ERROR';row.replay={status:'ERROR',code:fatalStopReason};}
     const analysis=analyzeRun(result);await writeFile(join(dir,'analysis.json'),JSON.stringify(analysis,null,2));
     try{await assertFrozen();}catch(error){fatalStopReason=failureCode(error);}
     const classification=classifyControlledTrial(result,{fatalStopReason,requestFailureCodes:requests.filter(r=>r.runId===row.runId&&r.failureCode!==null).map(r=>r.failureCode!)});
     transition(row,classification.status,classification.reason);
     consecutiveModelInvalid=classification.trustworthyModelInvalid?consecutiveModelInvalid+1:0;
     stopReason=classification.stopReason??(consecutiveModelInvalid>=3?'THREE_CONSECUTIVE_MODEL_INVALID':null);
    }finally{
     try{await context.tracing.stop({path:join(dir,'trace.zip')});}catch{stopReason='TRACE_AUDIT_ERROR';transition(row,'invalid','TRACE_AUDIT_ERROR');}
     await context.close();
     try{for(const file of await readdir(dir))if(/\.(json|png|zip)$/.test(file))row.artifactHashes[file]=sha(await readFile(join(dir,file)));}catch{stopReason='ARTIFACT_HASH_ERROR';transition(row,'invalid','ARTIFACT_HASH_ERROR');}
     await checkpoint();
    }
    if(stopReason)break;
   }
  }catch(error){
   stopReason=error instanceof ComparisonFailure?error.code:'RUNNER_INFRASTRUCTURE_ERROR';
   for(const row of records)if(row.status==='attempted')transition(row,'invalid',stopReason);
  }finally{
   try{await browser?.close();}catch{stopReason??='BROWSER_CLOSE_ERROR';}
   try{await server?.close();}catch{stopReason??='SERVER_CLOSE_ERROR';}
   for(const row of records)if(row.status==='planned')transition(row,'missing',stopReason??'NOT_ATTEMPTED');
   for(const row of records)refreshAccounting(row);
   executionFinished=true;await checkpoint();if(phaseBudget)await writeFile(join(root,'phase-budget-after.json'),JSON.stringify(phaseBudget.snapshot(),null,2));
  }
  const attempted=records.filter(r=>r.statusHistory.some(s=>s.status==='attempted'));
  const actualAPIRequests=records.every(r=>r.actualAPIRequests!==null)?records.reduce((s,r)=>s+r.actualAPIRequests!,0):null;
  const analyses=results.map(analyzeRun),initialStateGroups=[{uiVersion:'reference',count:results.length,fingerprints:[...new Set(results.map(r=>r.initialFingerprint))],match:results.length>0&&results.every(r=>!!r.initialFingerprint)&&new Set(results.map(r=>r.initialFingerprint)).size===1}];
  const summary={schemaVersion:1,kind:'controlled-comparison',mock:options.mock,dataSource:options.mock?'SCRIPTED_FIXTURE_NOT_MODEL_PERFORMANCE':'REAL_JEV',sourceHash:code.sourceHash,model:manifest.model,planHash,plan,trials:records,requests,stopReason,plannedTrials:records.length,attemptedTrials:attempted.length,completedTrials:records.filter(r=>r.status==='completed').length,validTrials:records.filter(r=>r.status==='completed'||r.status==='censored').length,invalidTrials:records.filter(r=>r.status==='invalid').length,censoredTrials:records.filter(r=>r.status==='censored').length,missingTrials:records.filter(r=>r.status==='missing').length,allocatedAPIRequests:plan.allocatedAPIRequests,actualAPIRequests,simulatedAPIRequests:records.reduce((s,r)=>s+r.simulatedAPIRequests,0),reservedAPIRequests:records.reduce((s,r)=>s+r.reservedAPIRequests,0),costUSD:costTotal(requests.map(r=>r.costUSD)),domainCollectionCostUSD:null,humanTaskMs:null,modelWaitingMs:requests.reduce((s,r)=>s+r.apiMs,0),modeledUserMs:results.length&&results.every(r=>r.modeledUserMs!==null)?results.reduce((s,r)=>s+r.modeledUserMs!,0):null,elapsedMs:performance.now()-started,totalCalls:options.mock?records.reduce((s,r)=>s+r.simulatedAPIRequests,0):actualAPIRequests,analyses,initialStateGroups,initialStatesMatch:initialStateGroups.every(g=>g.match),crossUIFingerprintMatchRequired:false,runs:results.map(({steps,...r})=>r),humanValidity:'UNVERIFIED',probabilitiesAreHumanFrequencies:false};
  await writeFile(join(root,'comparison.json'),JSON.stringify(summary,null,2));
  const columns=['runId','condition','replicate','seed','position','perTrialAPICap','status','reason','termination','actualAPIRequests','simulatedAPIRequests','reservedAPIRequests','costUSD','modelWaitingMs','modeledUserMs','humanTaskMs','domainCollectionCostUSD'] as const;
  await writeFile(join(root,'comparison.csv'),columns.join(',')+'\n'+records.map(r=>columns.map(c=>csv(r[c])).join(',')).join('\n')+'\n');
  const table='<section><h2>Controlled trial budget ledger</h2><p>Planned '+records.length+'; attempted '+attempted.length+'; completed '+summary.completedTrials+'; censored '+summary.censoredTrials+'; invalid '+summary.invalidTrials+'; missing '+summary.missingTrials+'. Each trial has its own API cap. Fixed seed controls only the local sampler. Human validity is unverified.</p><table><tr>'+['Trial','Seed','Position','Per-trial cap','Status','Termination','Actual HTTP','Simulated'].map(h=>'<th>'+h+'</th>').join('')+'</tr>'+records.map(r=>'<tr>'+[r.runId,r.seed,r.position,r.config.maxAPICalls,r.status,r.termination??r.reason,r.actualAPIRequests,r.simulatedAPIRequests].map(v=>'<td>'+escapeHTML(v)+'</td>').join('')+'</tr>').join('')+'</table></section>';
  await writeFile(join(root,'comparison.html'),comparisonHTML(results).replace('</html>',table+'</html>'));
  return {root,results,summary};
 }finally{await phaseBudget?.close();}
}
