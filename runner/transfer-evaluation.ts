import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join,dirname,relative,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {randomUUID} from 'node:crypto';
import {transferFixtures,type TransferFixture} from '../app/transfer-fixture.js';
import {runHumanJev} from './human-jev-experiment.js';
import {humanJevProfile} from './human-jev-profiles.js';
import {sourceIdentity} from './virtual-beta-source.js';
import {sha} from './virtual-beta-core.js';
import {safeRequestFailure} from '../jev/client.js';
import {replayDirectory} from './virtual-beta-replay.js';
import {analyzeTransferRuns,verifyTransferFrames,transferFailureCategories,type TransferSlot,type TransferRunRecord} from './transfer-analysis.js';

export type TransferEvaluationOptions={out:string;mock:boolean;envFile?:string;limit?:number;priorSnapshot?:string};
type TrialOptions=Parameters<typeof runHumanJev>[0]&{transferFixture?:TransferFixture};
type MockTrial=(options:TrialOptions)=>ReturnType<typeof runHumanJev>;
const mode='experience-goal-search-grounded' as const;
const limits={trials:21,novelTrials:18,sentinelTrials:3,maxRequests:504,maxRequestsPerTrial:24,maxJudgmentsPerTrial:12,maxUIActionsPerTrial:15,maxLooksPerTrial:3,maxRunMsPerTrial:180000,phaseMs:2700000,parallel:1};
const protocolFile='experiments/virtual-beta/transfer-evaluation.json';
export function validateTransferBatchOptions(o:TransferEvaluationOptions){
 if(typeof o.out!=='string'||!o.out.trim())throw Error('NEW_OUTPUT_DIRECTORY_REQUIRED');
 if(typeof o.mock!=='boolean')throw Error('EXPLICIT_EXECUTION_KIND_REQUIRED');
 if(!Number.isInteger(o.limit??21)||(o.limit??21)<1||(o.limit??21)>21)throw Error('TRIAL_LIMIT_1_TO_21');
 if(o.mock&&o.envFile!==undefined)throw Error('MOCK_MUST_NOT_READ_ENV_FILE');
 if(!o.mock){if(typeof o.envFile!=='string'||!o.envFile.trim())throw Error('EXPLICIT_ENV_FILE_REQUIRED');const rel=relative(process.cwd(),resolve(o.envFile));if(!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..\\')&&!rel.startsWith('../'))throw Error('EXTERNAL_ENV_FILE_REQUIRED');}
 if(o.priorSnapshot!==undefined&&(typeof o.priorSnapshot!=='string'||!o.priorSnapshot.trim()))throw Error('INVALID_PRIOR_SNAPSHOT');
}
export function transferSchedule():TransferSlot[]{
 const fixtures=transferFixtures(),schedule:TransferSlot[]=[];
 for(const replicate of [1,2,3]){
  schedule.push({id:`transfer-sentinel-direct-alpha-r${replicate}`,replicate,kind:'sentinel',fixture:{task:'direct',variant:'alpha'}});
  const offset=(replicate-1)*2;
  for(const fixture of [...fixtures.slice(offset),...fixtures.slice(0,offset)])schedule.push({id:`transfer-${fixture.task}-${fixture.variant}-r${replicate}`,replicate,kind:'novel',fixture});
 }
 return schedule;
}
async function json(file:string){return JSON.parse(await readFile(file,'utf8'));}
function safeError(error:unknown){const f=safeRequestFailure(error);return {code:f.code,...(f.statusCode?{statusCode:f.statusCode}:{})};}
function has402(value:unknown):boolean{if(!value||typeof value!=='object')return false;if(Array.isArray(value))return value.some(has402);const obj=value as Record<string,unknown>;return obj.statusCode===402||Object.values(obj).some(has402);}
type Prior={path:string;sha256:string};
async function readPrior(snapshot:string|undefined):Promise<{entries:Prior[];reason:string|null;snapshotSha256:string|null}>{
 if(!snapshot)return {entries:[],reason:'NO_PRIOR_SNAPSHOT_SUPPLIED',snapshotSha256:null};
 let bytes:Buffer;try{bytes=await readFile(snapshot);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return {entries:[],reason:'PRIOR_SNAPSHOT_ABSENT',snapshotSha256:null};throw error;}
 let data:any;try{data=JSON.parse(bytes.toString('utf8'));}catch{throw Error('INVALID_PRIOR_SNAPSHOT');}
 const hash=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
 if(!data||typeof data!=='object'||!data.hashes||typeof data.hashes!=='object'||Array.isArray(data.hashes)||!Array.isArray(data.ledgers))throw Error('INVALID_PRIOR_SNAPSHOT');
 const entries:Prior[]=[];
 const add=(path:unknown,sha256:unknown)=>{
  if(typeof path!=='string'||!path||!hash(sha256))throw Error('INVALID_PRIOR_SNAPSHOT');
  const absolute=resolve(path),rel=relative(process.cwd(),absolute);
  if(isAbsolute(rel)||rel==='..'||rel.startsWith('..\\')||rel.startsWith('../')||/(^|[\\/])(?:\.env(?:\.|$)|credentials(?:\.|$))/i.test(rel))throw Error('INVALID_PRIOR_SNAPSHOT_PATH');
  const previous=entries.find(item=>item.path===absolute);if(previous&&previous.sha256!==sha256)throw Error('INVALID_PRIOR_SNAPSHOT');if(!previous)entries.push({path:absolute,sha256:sha256 as string});
 };
 for(const [path,hash] of Object.entries(data.hashes))add(path,hash);
 for(const entry of data.ledgers){if(!entry||typeof entry!=='object')throw Error('INVALID_PRIOR_SNAPSHOT');add(entry.path,entry.sha256);}
 return {entries,reason:entries.length?null:'PRIOR_SNAPSHOT_EMPTY',snapshotSha256:sha(bytes)};
}
async function verifyPrior(prior:Awaited<ReturnType<typeof readPrior>>){const changed:string[]=[];for(const item of prior.entries){try{if(sha(await readFile(item.path))!==item.sha256)changed.push(item.path);}catch{changed.push(item.path);}}return {unchanged:changed.length===0,checked:prior.entries.length,reason:prior.reason,changed};}
/** Durable reservations are charged even when settlement failed. Never mutate or reset a ledger here. */
export async function readTransferLedger(file:string){
 const bytes=await readFile(file),data=JSON.parse(bytes.toString('utf8'));
 if(data.schemaVersion!==1||data.newMaximum!==24||data.perRunMaximum!==12||!Array.isArray(data.attempts)||!Number.isInteger(data.used)||data.used!==data.attempts.length||data.used<0||data.used>24||data.attempts.some((a:any,i:number)=>a.ordinal!==i+1||!['RESERVED','OK','ERROR'].includes(a.status)))throw Error('INVALID_TRANSFER_LEDGER');
 return {used:data.used,sha256:sha(bytes),reserved:data.attempts.filter((a:any)=>a.status==='RESERVED').length,ok:data.attempts.filter((a:any)=>a.status==='OK').length,errors:data.attempts.filter((a:any)=>a.status==='ERROR').length};
}
function csvCell(v:unknown){return '"'+String(v??'').replaceAll('"','""')+'"';}
async function saveSummary(root:string,records:TransferRunRecord[]){
 const summary=analyzeTransferRuns(records);await writeFile(join(root,'summary.json'),JSON.stringify(summary,null,2)+'\n');
 const columns=['id','kind','task','variant','replicate','status','valid','objective','subjectiveDone','termination','requests','uiActions','looks','apiMs','dir','ledger','initialImageSha256'];
 const rows=summary.runs.map(r=>[r.id,r.kind,r.task,r.variant,r.replicate,r.status,r.validity.valid,r.objectiveAssessment?.value,r.perceivedDone,r.termination,r.requests,r.metrics.uiActions,r.metrics.looks,r.timing.apiMs,r.dir,r.ledger,r.initialImageSha256]);
 await writeFile(join(root,'summary.csv'),[columns,...rows].map(row=>row.map(csvCell).join(',')).join('\n')+'\n');return summary;
}
/** Every actual trial calls the ordinary frozen runHumanJev. Injection exists only for mock unit simulations. */
export async function runTransferEvaluation(options:TransferEvaluationOptions,mockTrial?:MockTrial){
 if(mockTrial&&!options.mock)throw Error('INJECTED_TRIAL_MOCK_ONLY');
 validateTransferBatchOptions(options);
 const profile=humanJevProfile(mode),code=await sourceIdentity(),protocolBytes=await readFile(protocolFile),protocol=JSON.parse(protocolBytes.toString('utf8')),protocolHash=sha(protocolBytes),charterHash=sha(await readFile('experiments/persona/charter.json'));
 if(protocol.mode!==mode||!isDeepStrictEqual(protocol.profile,profile)||!isDeepStrictEqual(protocol.limits,limits)||protocol.persona!==null||!isDeepStrictEqual(protocol.transport,{longContext:true,maxAttemptsPerRequest:1})||protocol.stop?.http402!==true||protocol.stop?.consecutiveInfrastructureFailures!==2)throw Error('PROTOCOL_METHOD_OR_LIMIT_MISMATCH');
 for(const [file,hash] of Object.entries(protocol.unchangedBaselineFiles??{}))if(code.sourceHashes[file]!==hash)throw Error('BASELINE_SOURCE_CHANGED');
 const prior=await readPrior(options.priorSnapshot),priorCheckBefore=await verifyPrior(prior);if(!priorCheckBefore.unchanged)throw Error('PRIOR_ORIGINAL_CHANGED_BEFORE_BATCH');
 const root=resolve(options.out);await mkdir(dirname(root),{recursive:true});await mkdir(root);
 const batchId=randomUUID(),started=Date.now(),deadlineEpochMs=started+limits.phaseMs,schedule=transferSchedule(),records:TransferRunRecord[]=[];
 const manifest={schemaVersion:1,phase:'transfer-evaluation-2026-10-29',batchId,mock:options.mock,model:options.mock?'MOCK_SCRIPTED_FIXTURE':'jev-1.14.0',...code,protocol:{file:protocolFile,sha256:protocolHash},charterSha256:charterHash,method:{mode,profile,persona:null,longContext:true,maxAttemptsPerRequest:1},configSha256:sha(JSON.stringify(profile.config)),schedule,executionLimit:options.limit??21,limits,startedAtUTC:new Date(started).toISOString(),deadlineEpochMs,humanInputsRead:false,priorSnapshot:options.priorSnapshot??null,priorSnapshotSha256:prior.snapshotSha256,priorCheckBefore,priorCheckAfter:null as Awaited<ReturnType<typeof verifyPrior>>|null,records,status:'RUNNING',error:null as {code:string;statusCode?:number}|null,requestCountBasis:options.mock?'mock-no-gateway-requests':'durable-reservations-including-ERROR-and-RESERVED',totalRequests:0};
 const save=async()=>{manifest.totalRequests=records.reduce((n,r)=>n+r.requests,0);await writeFile(join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');await saveSummary(root,records);};
 const assertFrozen=async()=>{
  const current=await sourceIdentity();if(!isDeepStrictEqual(current,code))throw Error('SOURCE_CHANGED_DURING_BATCH');
  if(sha(await readFile(protocolFile))!==protocolHash||sha(await readFile('experiments/persona/charter.json'))!==charterHash||!isDeepStrictEqual(humanJevProfile(mode),profile))throw Error('PROTOCOL_OR_METHOD_CHANGED_DURING_BATCH');
 };
 await writeFile(join(root,'frozen-source.json'),JSON.stringify({code,protocolSha256:protocolHash,profile,configSha256:manifest.configSha256,charterSha256:charterHash},null,2)+'\n');await save();
 let consecutiveInfrastructure=0;
 try{
  for(const slot of schedule.slice(0,options.limit??21)){
   if(Date.now()>=deadlineEpochMs){manifest.status='PHASE_TIME_LIMIT';break;}
   if(manifest.totalRequests+24>limits.maxRequests){manifest.status='BATCH_REQUEST_LIMIT';break;}
   await assertFrozen();
   const dir=join(root,slot.id),ledger=options.mock?null:join(root,slot.id+'-budget.json');
   const record:TransferRunRecord={...slot,slotId:slot.id,runId:batchId+'-'+slot.id,resultPath:join(dir,'exploration','result.json'),status:'ATTEMPTING',dir,ledger,initialImageSha256:null,requests:0};records.push(record);await save();
   let fatal:unknown;
   try{
    if(ledger)await writeFile(ledger,JSON.stringify({schemaVersion:1,status:'APPROVED',phase:'transfer-evaluation-'+slot.id,newMaximum:24,perRunMaximum:12,used:0,attempts:[]},null,2)+'\n',{flag:'wx'});
    const trialOptions:TrialOptions={out:dir,mock:options.mock,mode,longContext:true,runId:record.runId!,deadlineEpochMs:Math.min(deadlineEpochMs,Date.now()+limits.maxRunMsPerTrial),...(slot.kind==='novel'?{transferFixture:slot.fixture}:{holdoutFixture:slot.fixture}),...(!options.mock?{phaseBudget:ledger!,envFile:options.envFile}:{})};
    const saved=await (mockTrial??runHumanJev)(trialOptions);record.result=saved.result;record.status='RESULT';record.requests=options.mock?0:saved.result.apiCalls;
    record.preparatoryInitialImageSha256=sha(await readFile(join(dir,'initial-product.png')));
    if(mockTrial)record.initialImageSha256=record.preparatoryInitialImageSha256;
    else{const metadata=slot.kind==='novel'?saved.result.transfer:saved.result.holdout;if(!metadata||!isDeepStrictEqual(metadata.fixture,slot.fixture)||metadata.initialProductImage.file!=='initial-product.png')throw Error('FIXTURE_INITIAL_IDENTITY_MISMATCH');const actual=sha(await readFile(join(dir,'exploration',metadata.initialProductImage.file)));if(actual!==metadata.initialProductImage.sha256)throw Error('FIXTURE_INITIAL_IDENTITY_MISMATCH');record.initialImageSha256=actual;}
    if(!isDeepStrictEqual(saved.result.config,profile.config))throw Error('FROZEN_CONFIG_CHANGED');
    if(saved.result.input.persona!==undefined&&saved.result.input.persona!==null)throw Error('FROZEN_PERSONA_CHANGED');
    if(saved.result.runId!==record.runId)throw Error('RUN_ID_MISMATCH');
    if(saved.result.code?.revision!==code.revision||saved.result.code?.sourceHash!==code.sourceHash)throw Error('SOURCE_CHANGED_DURING_BATCH');
    if(saved.result.apiCalls>24||saved.result.decisions>12||saved.result.uiActions>15||saved.result.looks>3)throw Error('TRIAL_CAP_EXCEEDED');
    if(mockTrial)record.replay={status:'MOCK_INJECTION'};
    else{
     try{const replay=await replayDirectory(join(dir,'exploration'));await writeFile(join(dir,'offline-replay.json'),JSON.stringify(replay,null,2)+'\n');record.replay={status:'OK'};}catch{record.replay={status:'ERROR',code:'OFFLINE_REPLAY_FAILED'};throw Error('OFFLINE_REPLAY_FAILED');}
     record.frameChecks=await verifyTransferFrames(saved.result,join(dir,'exploration'));
     await writeFile(join(dir,'delivered-current-frames.json'),JSON.stringify(record.frameChecks,null,2)+'\n');
    }
   }catch(error){record.error=safeError(error);if(!record.result){record.status='FAILED';try{const partial=await json(record.resultPath!);if(partial.schemaVersion===1&&partial.runId===record.runId&&Array.isArray(partial.steps)){record.result=partial;record.requests=options.mock?0:partial.apiCalls;}}catch{/* An absent or malformed partial result stays a failed attempted slot. */}}if(error instanceof Error&&['FROZEN_CONFIG_CHANGED','FROZEN_PERSONA_CHANGED','RUN_ID_MISMATCH','SOURCE_CHANGED_DURING_BATCH','TRIAL_CAP_EXCEEDED','OFFLINE_REPLAY_FAILED','FIXTURE_INITIAL_IDENTITY_MISMATCH'].includes(error.message))fatal=error;}
   finally{
    if(ledger){try{record.budgetAfterEvidence=await readTransferLedger(join(dir,'phase-budget-after.json'));record.requests=Math.max(record.requests,record.budgetAfterEvidence.used);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT'){record.error={code:'BUDGET_SNAPSHOT_ACCOUNTING_UNAVAILABLE'};fatal=error;}}try{record.ledgerEvidence=await readTransferLedger(ledger);record.requests=Math.max(record.requests,record.ledgerEvidence.used);}catch(error){record.error={code:'LEDGER_ACCOUNTING_UNAVAILABLE'};fatal=error;}}
    await save();
   }
   await assertFrozen();if(fatal)throw fatal;
   if(manifest.totalRequests>limits.maxRequests)throw Error('BATCH_REQUEST_ACCOUNTING_EXCEEDED');
   if(has402(record.error)||has402(record.result)){manifest.status='HTTP_402';break;}
   consecutiveInfrastructure=transferFailureCategories(record).infrastructure?consecutiveInfrastructure+1:0;
   if(consecutiveInfrastructure>=2){manifest.status='CONSECUTIVE_INFRASTRUCTURE_FAILURES';break;}
   console.log(JSON.stringify({id:slot.id,kind:slot.kind,attempted:records.length,planned:21,status:record.status,requests:record.requests,totalRequests:manifest.totalRequests,objective:record.result?.objectiveAssessment.value??null,termination:record.result?.termination??null}));
  }
  if(manifest.status==='RUNNING')manifest.status=records.length===21&&records.every(r=>r.status==='RESULT')?'COMPLETED':'INCOMPLETE';
 }catch(error){manifest.status='BATCH_ERROR';manifest.error=safeError(error);throw error;}
 finally{
  manifest.priorCheckAfter=await verifyPrior(prior);await writeFile(join(root,'prior-original-check.json'),JSON.stringify({before:priorCheckBefore,after:manifest.priorCheckAfter},null,2)+'\n');
  if(!manifest.priorCheckAfter.unchanged){manifest.status='BATCH_ERROR';manifest.error={code:'PRIOR_ORIGINAL_CHANGED'};}
  await save();if(!manifest.priorCheckAfter.unchanged)throw Error('PRIOR_ORIGINAL_CHANGED');
 }
 return {root,status:manifest.status,trials:records.length,requests:manifest.totalRequests};
}
async function main(){
 const args=process.argv.slice(2),options:TransferEvaluationOptions={out:'',mock:false};
 for(let i=0;i<args.length;i++){const key=args[i];if(key==='--mock'){options.mock=true;continue;}if(!['--out','--env-file','--limit','--prior-snapshot'].includes(key)||!args[i+1]||args[i+1].startsWith('--'))throw Error('INVALID_OPTION');const value=args[++i];if(key==='--out')options.out=value;if(key==='--env-file')options.envFile=value;if(key==='--limit')options.limit=Number(value);if(key==='--prior-snapshot')options.priorSnapshot=value;}
 console.log(JSON.stringify(await runTransferEvaluation(options)));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();



