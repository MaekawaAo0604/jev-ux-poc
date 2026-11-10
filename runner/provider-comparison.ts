import {readFile,writeFile,mkdir,lstat} from 'node:fs/promises';
import {resolve,join,dirname,relative,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {runHumanJev} from './human-jev-experiment.js';
import {humanJevProfile} from './human-jev-profiles.js';
import {recoverySchedule} from './recovery-evaluation.js';
import {analyzeProviderComparison,type ProviderRunRecord,type DecisionProvider} from './provider-comparison-analysis.js';
import {decisionBackendInfo} from './decision-backend.js';
import {sourceIdentity} from './virtual-beta-source.js';
import {replayDirectory} from './virtual-beta-replay.js';
import {verifyTransferFrames,transferFailureCategories} from './transfer-analysis.js';
import {readTransferLedger} from './transfer-evaluation.js';
import {safeRequestFailure} from '../jev/client.js';

const sha=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
const mode='experience-goal-search-grounded' as const;
const providers:DecisionProvider[]=['jev','openai-decisions'];
const protocolFile='experiments/virtual-beta/provider-comparison.json';
export const providerLimits={trials:24,maxRequests:576,maxRequestsPerTrial:24,maxJudgmentsPerTrial:12,maxUIActionsPerTrial:15,maxLooksPerTrial:3,maxRunMsPerTrial:180000,phaseMs:2400000,parallel:2};
export type ProviderComparisonOptions={out:string;mock:boolean;priorSnapshot:string;envFile?:string;limit?:number};
export const providerSchedule=recoverySchedule;
export function validateProviderComparisonOptions(o:ProviderComparisonOptions){
 if(typeof o.out!=='string'||!o.out.trim()||typeof o.mock!=='boolean')throw Error('EXPLICIT_OUTPUT_AND_KIND_REQUIRED');
 if(typeof o.priorSnapshot!=='string'||!isAbsolute(o.priorSnapshot))throw Error('ABSOLUTE_PRIOR_SNAPSHOT_REQUIRED');
 if(!Number.isInteger(o.limit??12)||(o.limit??12)<1||(o.limit??12)>12)throw Error('PAIR_LIMIT_1_TO_12');
 if(o.mock&&o.envFile!==undefined)throw Error('MOCK_MUST_NOT_READ_ENV');
 if(!o.mock){
  if(typeof o.envFile!=='string'||!isAbsolute(o.envFile))throw Error('EXTERNAL_ENV_REQUIRED');
  const r=relative(process.cwd(),o.envFile);if(!isAbsolute(r)&&r!=='..'&&!r.startsWith('../')&&!r.startsWith('..\\'))throw Error('EXTERNAL_ENV_REQUIRED');
 }
}
export function providerStopReason(value:unknown):'PROVIDER_UNAVAILABLE'|'BUDGET_ACCOUNTING_FAILURE'|null{
 if(!value||typeof value!=='object')return null;
 const v=value as Record<string,unknown>;
 if(['BUDGET_ADMISSION_ERROR','BUDGET_SETTLEMENT_AFTER_REQUEST','LEDGER_ACCOUNTING_UNAVAILABLE'].includes(v.code as string))return 'BUDGET_ACCOUNTING_FAILURE';
 const children=Object.values(v).map(providerStopReason);
 if(children.includes('BUDGET_ACCOUNTING_FAILURE'))return 'BUDGET_ACCOUNTING_FAILURE';
 if([401,402,403,404,429].includes(v.statusCode as number)||children.includes('PROVIDER_UNAVAILABLE'))return 'PROVIDER_UNAVAILABLE';
 return null;
}
async function assertNewOutput(out:string){
 try{await lstat(out);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return;throw e;}
 throw Object.assign(Error('OUTPUT_ALREADY_EXISTS'),{code:'EEXIST'});
}
type Prior={count:number;files:{path:string;sha256:string}[];sha256:string};
async function loadPrior(file:string):Promise<Prior>{
 const bytes=await readFile(file),p=JSON.parse(bytes.toString('utf8'));
 if(!Number.isInteger(p.count)||p.count<1||!Array.isArray(p.files)||p.files.length!==p.count||new Set(p.files.map((f:any)=>f.path)).size!==p.count)throw Error('INVALID_PRIOR_SNAPSHOT');
 for(const f of p.files){const r=typeof f.path==='string'?relative(resolve('reports'),f.path):'..';if(!isAbsolute(f.path)||isAbsolute(r)||r==='..'||r.startsWith('../')||r.startsWith('..\\')||/(^|[\\/])(?:\.env(?:\.|$)|credentials(?:\.|$))/i.test(f.path)||!/^[a-f0-9]{64}$/.test(f.sha256))throw Error('UNSAFE_PRIOR_PATH');}
 return {...p,sha256:sha(bytes)};
}
async function preserve(prior:Prior){
 const changed:string[]=[];
 for(const f of prior.files){try{if(sha(await readFile(f.path))!==f.sha256)changed.push(f.path);}catch{changed.push(f.path);}}
 return {unchanged:changed.length===0,checked:prior.files.length,changed};
}
function safeError(error:unknown){
 const code=(error as {code?:unknown}|null)?.code;
 if(code==='BUDGET_ADMISSION_ERROR'||code==='BUDGET_SETTLEMENT_AFTER_REQUEST')return {code};
 const f=safeRequestFailure(error);return {code:f.code,...(f.statusCode?{statusCode:f.statusCode}:{})};
}
function initialEvidence(record:ProviderRunRecord){
 const s=record.result?.steps[0],d=s?.deliberation;
 if(!d?.modelInput||!d.questions||!d.assetFiles?.current||!record.initialImageSha256)return null;
 return {product:record.initialImageSha256,input:d.modelInput,questions:d.questions,assets:Object.fromEntries(Object.entries(d.assetFiles).map(([id,a])=>[id,a.sha256]))};
}
export async function runProviderComparison(options:ProviderComparisonOptions){
 validateProviderComparisonOptions(options);const out=resolve(options.out);await assertNewOutput(out);
 const protocolBytes=await readFile(protocolFile),protocol=JSON.parse(protocolBytes.toString('utf8'));
 if(!isDeepStrictEqual(protocol.limits,providerLimits)||protocol.mode!==mode||!isDeepStrictEqual(protocol.providers,providers)||protocol.persona!==null||protocol.repeats!==2||protocol.actorChangesAllowed!==false)throw Error('PROTOCOL_MISMATCH');
 const prior=await loadPrior(options.priorSnapshot),before=await preserve(prior);if(!before.unchanged)throw Error('ORIGINAL_CHANGED_BEFORE_BATCH');
 if(!options.mock){process.loadEnvFile(options.envFile!);for(const provider of providers)if(!process.env[decisionBackendInfo[provider].credential])throw Error('MISSING_PROVIDER_CREDENTIALS');}
 const code=await sourceIdentity(),profile=humanJevProfile(mode),charterSha256=sha(await readFile('experiments/persona/charter.json'));
 const batchId=randomUUID(),started=Date.now(),deadlineEpochMs=started+providerLimits.phaseMs,schedule=providerSchedule(),records:ProviderRunRecord[]=[];
 const manifest:any={schemaVersion:1,phase:'provider-comparison-2026-10-29',batchId,mock:options.mock,...code,providers:providers.map(id=>({id,model:options.mock?'MOCK_SCRIPTED_FIXTURE':decisionBackendInfo[id].model,endpoint:decisionBackendInfo[id].endpoint})),protocol:{file:protocolFile,sha256:sha(protocolBytes)},charterSha256,method:{mode,profile,persona:null,longContext:true,maxAttemptsPerRequest:1},configSha256:sha(JSON.stringify(profile.config)),schedule,executionPairLimit:options.limit??12,limits:providerLimits,initialState:protocol.initialState,humanInputsRead:false,startedAtUTC:new Date(started).toISOString(),deadlineEpochMs,priorSnapshot:options.priorSnapshot,priorSnapshotSha256:prior.sha256,preservationBefore:before,preservationAfter:null,records,totalRequests:0,status:'RUNNING',error:null};
 const assertFrozen=async()=>{if(!isDeepStrictEqual(await sourceIdentity(),code)||sha(await readFile(protocolFile))!==sha(protocolBytes)||sha(await readFile('experiments/persona/charter.json'))!==charterSha256||!isDeepStrictEqual(humanJevProfile(mode),profile)||sha(await readFile(options.priorSnapshot))!==prior.sha256)throw Error('FROZEN_SOURCE_OR_PROTOCOL_CHANGED');};
 await mkdir(dirname(out),{recursive:true});await mkdir(out);
 let queue=Promise.resolve();
 const save=()=>{
  manifest.totalRequests=records.reduce((n,r)=>n+r.requests,0);
  const snapshot=structuredClone(manifest),summary=analyzeProviderComparison(snapshot.records,{mock:options.mock});
  queue=queue.then(async()=>{await writeFile(join(out,'manifest.json'),JSON.stringify(snapshot,null,2)+'\n');await writeFile(join(out,'summary.json'),JSON.stringify(summary,null,2)+'\n');});return queue;
 };
 await writeFile(join(out,'frozen-source.json'),JSON.stringify({code,protocol:manifest.protocol,profile,charterSha256},null,2));await save();
 const consecutive:Record<DecisionProvider,number>={jev:0,'openai-decisions':0};
 try{
  for(const slot of schedule.slice(0,options.limit??12)){
   if(Date.now()>=deadlineEpochMs){manifest.status='PHASE_TIME_LIMIT';break;}
   if(manifest.totalRequests+48>providerLimits.maxRequests){manifest.status='BATCH_REQUEST_LIMIT';break;}
   await assertFrozen();
   const pair=providers.map(provider=>{
    const dir=join(out,slot.id+'-'+provider);
    const r:ProviderRunRecord={...slot,provider,runId:batchId+'-'+slot.id+'-'+provider,status:'ATTEMPTING',dir,ledger:options.mock?null:dir+'-budget.json',resultPath:join(dir,'exploration/result.json'),requests:0,initialImageSha256:null};records.push(r);return r;
   });
   for(const r of pair)if(r.ledger)await writeFile(r.ledger,JSON.stringify({schemaVersion:1,status:'APPROVED',phase:'provider-'+r.provider+'-'+r.id,newMaximum:24,perRunMaximum:12,used:0,attempts:[]},null,2)+'\n',{flag:'wx'});
   await save();
   const settled=await Promise.allSettled(pair.map(async record=>{
    let fatal:unknown;
    try{
     const saved=await runHumanJev({out:record.dir,mock:options.mock,mode,longContext:true,recoveryFixture:record.fixture,runId:record.runId,decisionBackend:record.provider,deadlineEpochMs:Math.min(deadlineEpochMs,Date.now()+providerLimits.maxRunMsPerTrial),...(!options.mock?{phaseBudget:record.ledger!}:{})});
     record.result=saved.result;record.status='RESULT';const r=saved.result;record.requests=options.mock?0:r.apiCalls;
     if(!isDeepStrictEqual(r.config,profile.config)||r.input.persona!==undefined&&r.input.persona!==null||r.runId!==record.runId||!isDeepStrictEqual(r.code,{revision:code.revision,sourceHash:code.sourceHash})||!isDeepStrictEqual(r.recovery?.fixture,record.fixture))throw Error('TRIAL_FROZEN_IDENTITY_MISMATCH');
     if(r.apiCalls>24||r.decisions>12||r.uiActions>15||r.looks>3)throw Error('TRIAL_CAP_EXCEEDED');
     record.initialImageSha256=sha(await readFile(join(record.dir,'exploration/initial-product.png')));
     if(record.initialImageSha256!==r.recovery!.initialProductImage.sha256||record.initialImageSha256!==sha(await readFile(join(record.dir,'initial-product.png'))))throw Error('INITIAL_PRODUCT_MISMATCH');
     try{const replay=await replayDirectory(join(record.dir,'exploration'));await writeFile(join(record.dir,'offline-replay.json'),JSON.stringify(replay,null,2));record.replay={status:'OK'};}catch{record.replay={status:'ERROR',code:'OFFLINE_REPLAY_FAILED'};throw Error('OFFLINE_REPLAY_FAILED');}
     record.frameChecks=await verifyTransferFrames(r,join(record.dir,'exploration'));await writeFile(join(record.dir,'delivered-current-frames.json'),JSON.stringify(record.frameChecks,null,2));
    }catch(error){
     record.error=safeError(error);
     if(!record.result){record.status='FAILED';try{const r=JSON.parse(await readFile(record.resultPath,'utf8'));if(r.schemaVersion===1&&r.runId===record.runId&&Array.isArray(r.steps)){record.result=r;record.requests=options.mock?0:r.apiCalls;record.initialImageSha256=r.recovery?.initialProductImage?.sha256??null;}}catch{/* Invalid/missing results stay attempted failures. */}}
     if(error instanceof Error&&['TRIAL_FROZEN_IDENTITY_MISMATCH','TRIAL_CAP_EXCEEDED','INITIAL_PRODUCT_MISMATCH','OFFLINE_REPLAY_FAILED'].includes(error.message))fatal=error;
    }finally{
     if(record.ledger)try{const evidence=await readTransferLedger(record.ledger);record.requests=Math.max(record.requests,evidence.used);record.ledgerEvidence=evidence;}catch(error){record.error={code:'LEDGER_ACCOUNTING_UNAVAILABLE'};fatal=error;}
     await save();
    }
    if(fatal)throw fatal;
   }));
   await assertFrozen();
   const fatal=settled.find((s):s is PromiseRejectedResult=>s.status==='rejected');if(fatal)throw fatal.reason;
   if(manifest.totalRequests>providerLimits.maxRequests)throw Error('BATCH_REQUEST_LIMIT_EXCEEDED');
   const evidence=pair.map(initialEvidence);if(evidence.every(Boolean)&&!isDeepStrictEqual(evidence[0],evidence[1])){manifest.status='PAIR_INITIAL_EVIDENCE_MISMATCH';break;}
   console.log(JSON.stringify({slotId:slot.id,attempted:records.length,planned:24,totalRequests:manifest.totalRequests,runs:pair.map(r=>({provider:r.provider,requests:r.requests,objective:r.result?.objectiveAssessment.value,termination:r.result?.termination,error:r.error??null}))}));
   const stop=pair.map(providerStopReason).find(Boolean);if(stop){manifest.status=stop;break;}
   for(const r of pair)consecutive[r.provider]=transferFailureCategories(r).infrastructure?consecutive[r.provider]+1:0;
   if(Object.values(consecutive).some(n=>n>=2)){manifest.status='CONSECUTIVE_INFRASTRUCTURE_FAILURES';break;}
  }
  if(manifest.status==='RUNNING')manifest.status=records.length===24&&records.every(r=>r.status==='RESULT')?'COMPLETED':'INCOMPLETE';
 }catch(error){manifest.status='BATCH_ERROR';manifest.error=safeError(error);throw error;}
 finally{manifest.preservationAfter=await preserve(prior);if(!manifest.preservationAfter.unchanged){manifest.status='BATCH_ERROR';manifest.error={code:'ORIGINAL_CHANGED_DURING_BATCH'};}await save();if(!manifest.preservationAfter.unchanged)throw Error('ORIGINAL_CHANGED_DURING_BATCH');}
 return {root:out,status:manifest.status,trials:records.length,requests:manifest.totalRequests};
}
async function main(){
 const options:any={mock:false},args=process.argv.slice(2),names:Record<string,string>={'--out':'out','--env-file':'envFile','--prior-snapshot':'priorSnapshot','--limit':'limit'};
 for(let i=0;i<args.length;i++){const key=args[i];if(key==='--mock'){options.mock=true;continue;}if(!names[key]||!args[i+1]||args[i+1].startsWith('--'))throw Error('INVALID_OPTION');options[names[key]]=key==='--limit'?Number(args[++i]):args[++i];}
 console.log(JSON.stringify(await runProviderComparison(options)));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{await main();}catch{console.error(JSON.stringify({status:'ERROR',code:'PROVIDER_BATCH_FAILED_CHECK_MANIFEST'}));process.exitCode=1;}}
