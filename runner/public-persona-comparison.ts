import {readFile,writeFile,mkdir,rename,rm,open,realpath,lstat} from 'node:fs/promises';
import {resolve,join,relative,isAbsolute,dirname,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {isDeepStrictEqual as eq} from 'node:util';
import {parsePersona,type Persona} from '../jev/persona.js';
import {safeRequestFailure} from '../jev/client.js';
import {parsePublicCharter} from './public-persona-spec.js';
import type {BetaPublicSiteSpec} from './beta-public-contracts.js';
import {personaBetaActors} from './persona-beta-contracts.js';
import {loadPublicPersonaSet,validatePublicPersonaActors,validatePublicPersonaSetSelection} from './public-persona-set.js';
import {personaInputBindings} from './persona-beta-comparison.js';
import {humanJevProfile} from './human-jev-profiles.js';
import {runHumanJev} from './human-jev-experiment.js';
import {sourceIdentity} from './virtual-beta-source.js';
import {readTransferLedger} from './transfer-evaluation.js';
import {alignmentLedgerMismatch} from './inquiry-alignment-comparison.js';
import type {BetaResult} from './virtual-beta-core.js';

export type PublicPersonaOptions={out:string;siteSpec:string;charter:string;priorSnapshot:string;envFile?:string;repeats?:number;maxRequests?:number;maxPhaseMs?:number;personaSet?:string;maxDecisions?:number;mock:boolean;resume?:boolean};
type Slot={id:string;actor:string;replicate:number;position:number;sequence:number};
type Failure={code:string;statusCode?:number};
type Row=Slot&{runId:string;status:'ATTEMPTING'|'RESULT'|'FAILED'|'INTERRUPTED';dir:string;ledger:string|null;resultPath:string;resultSha256:string|null;requests:number;personaSha256:string|null;source:{revision:string;sourceHash:string};valid:boolean;summary?:ReturnType<typeof summarize>;initialInputs?:ReturnType<typeof initialInputs>;personaDelivery?:ReturnType<typeof personaInputBindings>;error?:Failure;ledgerEvidence?:Awaited<ReturnType<typeof readTransferLedger>>;fatal?:string|null;modelInvalid?:boolean};
type Trial=(options:Parameters<typeof runHumanJev>[0])=>Promise<{root:string;result:BetaResult;review:unknown}>;
const sha=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
const protocolFile='experiments/virtual-beta/public-persona-comparison.json';
const mode='experience-persona-unweighted' as const;
const inside=(root:string,path:string)=>{const p=relative(root,path);return p!==''&&p!=='..'&&!p.startsWith('..'+sep)&&!isAbsolute(p);};
const json=(v:unknown)=>JSON.stringify(v);
const knownFailures=new Set(['TRIAL_IDENTITY_MISMATCH','PUBLIC_OBJECTIVE_MUST_REMAIN_UNVERIFIED','TRIAL_CAP_EXCEEDED','RESULT_FILE_MISSING','PERSONA_BINDING_MISMATCH','FROZEN_SOURCE_CHANGED','PRIOR_RAW_CHANGED','SNAPSHOT_CHANGED','LEDGER_ACCOUNTING_UNAVAILABLE','RESULT_FILE_UNSAFE','INVALID_DISTRIBUTION','INVALID_RESPONSE','MODEL_MISMATCH','MISSING_CREDENTIALS','BUDGET_ADMISSION_ERROR','BUDGET_SETTLEMENT_AFTER_REQUEST','BUDGET_PERSISTENCE_ERROR']);
function safeFailure(error:unknown):Failure{const f=safeRequestFailure(error),message=error instanceof Error?error.message:'';return {code:knownFailures.has(message)||/^SITE_SNAPSHOT_[A-Z_]+$/.test(message)?message:f.code,...(f.statusCode?{statusCode:f.statusCode}:{})};}

export function publicPersonaSchedule(repeats:number,actors:readonly string[]=personaBetaActors):Slot[]{
 if(!Number.isSafeInteger(repeats)||repeats<1||repeats>100)throw Error('REPEATS_1_TO_100');
 validatePublicPersonaActors(actors);
 return Array.from({length:repeats},(_,r)=>Array.from({length:actors.length},(_,position)=>{const actor=actors[(r+position)%actors.length];return {id:`public-persona-${actor}-r${r+1}`,actor,replicate:r+1,position:position+1,sequence:r*actors.length+position+1};})).flat();
}
export function validatePublicPersonaOptions(o:PublicPersonaOptions){
 if(!o||typeof o.out!=='string'||!inside(resolve('reports'),resolve(o.out))||typeof o.mock!=='boolean'||typeof o.siteSpec!=='string'||!o.siteSpec||typeof o.charter!=='string'||!o.charter||typeof o.priorSnapshot!=='string'||!isAbsolute(o.priorSnapshot))throw Error('EXPLICIT_REPORT_AND_INPUT_FILES_REQUIRED');
 publicPersonaSchedule(o.repeats??1);
 if(o.personaSet!==undefined)validatePublicPersonaSetSelection(o.personaSet);
 if(o.maxRequests!==undefined&&(!Number.isSafeInteger(o.maxRequests)||o.maxRequests<1||o.maxRequests>14400))throw Error('INVALID_MAX_REQUESTS');
 if(!Number.isSafeInteger(o.maxDecisions??12)||(o.maxDecisions??12)<1||(o.maxDecisions??12)>12)throw Error('MAX_DECISIONS_1_TO_12');
 if(!Number.isSafeInteger(o.maxPhaseMs??7200000)||(o.maxPhaseMs??7200000)<1||(o.maxPhaseMs??7200000)>172800000)throw Error('INVALID_MAX_PHASE_MS');
 if(o.resume!==undefined&&typeof o.resume!=='boolean')throw Error('INVALID_RESUME');
 if(o.mock&&o.envFile!==undefined)throw Error('MOCK_MUST_NOT_READ_ENV');
 if(!o.mock&&(typeof o.envFile!=='string'||!isAbsolute(o.envFile)||inside(process.cwd(),resolve(o.envFile))))throw Error('EXTERNAL_ENV_REQUIRED');
}
export function parsePublicPersonaOptions(args:string[]):PublicPersonaOptions{
 const o:any={mock:false},names:Record<string,string>={'--out':'out','--site-spec':'siteSpec','--charter':'charter','--prior-snapshot':'priorSnapshot','--env-file':'envFile','--repeats':'repeats','--max-requests':'maxRequests','--max-phase-ms':'maxPhaseMs','--persona-set':'personaSet','--max-decisions':'maxDecisions'};const seen=new Set<string>();
 for(let i=0;i<args.length;i++){const key=args[i];if(seen.has(key))throw Error('DUPLICATE_OPTION');seen.add(key);if(key==='--mock'||key==='--resume'){o[key.slice(2)]=true;continue;}if(!names[key]||!args[i+1]||args[i+1].startsWith('--'))throw Error('INVALID_OPTION');const v=args[++i];o[names[key]]=['--repeats','--max-requests','--max-phase-ms','--max-decisions'].includes(key)?Number(v):v;}
 validatePublicPersonaOptions(o);return o;
}
function summarize(r:BetaResult){return {termination:r.termination,objectiveSuccess:r.objectiveSuccess,objectiveAssessment:r.objectiveAssessment,perceivedDone:r.perceivedDone,validForComparison:r.validForComparison,decisions:r.decisions,uiActions:r.uiActions,looks:r.looks,apiCalls:r.apiCalls,apiMs:r.apiMs,uiMs:r.uiMs,elapsedMs:r.elapsedMs,modeledUserMs:r.modeledUserMs,terminalObservation:r.terminalObservation};}
function initialInputs(r:BetaResult,productSha256:string|null){
 const first=r.steps[0],v=first?.visualHypotheses;let nativeNonpersonaSha256:string|null=null;
 if(v){const {persona,...request}=v.request;nativeNonpersonaSha256=sha(json({request,assets:v.assetFiles}));}
 return {measured:!!v,productSha256,initialFingerprint:r.initialFingerprint,currentImageSha256:first?.assetFiles?.current?.sha256??null,nativeNonpersonaSha256,firstObservationId:first?.observationId??null,nativeInputSha256:v?.inputSha256??null,actionInputSha256:first?.inputSha256??null,removedPaths:['visualHypotheses.request.persona'],comparison:'deferred-to-postanalysis' as const};
}
export function publicPersonaStopReason(value:unknown,consecutiveModelInvalid=0):string|null{
 const codes=new Set<string>(),statuses=new Set<number>();let safety=false;
 const visit=(v:unknown)=>{if(!v||typeof v!=='object')return;const x=v as any;if(typeof x.code==='string')codes.add(x.code);if(typeof x.statusCode==='number')statuses.add(x.statusCode);if(x.termination==='SAFETY_STOP')safety=true;for(const child of Object.values(x))visit(child);};visit(value);
 if([...codes].some(c=>/LEDGER|BUDGET_ADMISSION|BUDGET_SETTLEMENT/.test(c)))return 'BUDGET_ACCOUNTING_FAILURE';
 if([...codes].some(c=>/SOURCE|SNAPSHOT|PRIOR_RAW/.test(c)))return 'FROZEN_SOURCE_CHANGED';
 if(codes.has('TRIAL_IDENTITY_MISMATCH')||codes.has('PERSONA_BINDING_MISMATCH'))return 'TRIAL_IDENTITY_MISMATCH';
 if(codes.has('PUBLIC_OBJECTIVE_MUST_REMAIN_UNVERIFIED'))return 'PUBLIC_OBJECTIVE_MUST_REMAIN_UNVERIFIED';
 if(codes.has('TRIAL_CAP_EXCEEDED'))return 'TRIAL_CAP_EXCEEDED';
 if(codes.has('MISSING_CREDENTIALS')||[400,401,402,403,404,429].some(s=>statuses.has(s)))return 'PROVIDER_UNAVAILABLE';
 if(safety)return 'SAFETY_STOP';
 return consecutiveModelInvalid>=3?'CONSECUTIVE_INVALID_TRIALS':null;
}
async function optionalProtocol(){try{return await readFile(protocolFile);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}}
async function atomicJSON(path:string,data:unknown){const temp=path+'.'+randomUUID()+'.tmp';try{await writeFile(temp,json(data)+'\n',{flag:'wx'});await rename(temp,path);}finally{await rm(temp,{force:true});}}
async function safeResult(path:string,out:string){
 try{const real=await realpath(path),stat=await lstat(path);if(stat.isSymbolicLink()||!stat.isFile()||!inside(await realpath(out),real)||real.toLowerCase()!==resolve(path).toLowerCase())throw Error('RESULT_FILE_UNSAFE');return await readFile(path);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}
}
async function lockBatch(out:string){
 const path=join(out,'.public-persona.lock');let handle;
 try{handle=await open(path,'wx');}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;let owner:any;try{owner=JSON.parse(await readFile(path,'utf8'));}catch{throw Error('BATCH_LOCK_UNREADABLE');}if(!Number.isSafeInteger(owner.pid)||owner.pid<1)throw Error('BATCH_LOCK_UNREADABLE');try{process.kill(owner.pid,0);throw Error('BATCH_ALREADY_RUNNING');}catch(e){if((e as NodeJS.ErrnoException).code!=='ESRCH')throw e;}await rm(path);handle=await open(path,'wx');}
 await handle.writeFile(json({pid:process.pid}));await handle.close();return ()=>rm(path,{force:true});
}
/** Fixed bounded schedule; durable attempted slots are never retried or replaced. */
export async function runPublicPersonaComparison(options:PublicPersonaOptions,mockTrial?:Trial){
 if(mockTrial&&!options.mock)throw Error('INJECTION_MOCK_ONLY');validatePublicPersonaOptions(options);
 const selectedSet=options.personaSet?await loadPublicPersonaSet(options.personaSet):null,actors=selectedSet?.actors??personaBetaActors;
 const out=resolve(options.out),schedule=publicPersonaSchedule(options.repeats??1,actors),maxRequests=options.maxRequests??Math.min(14400,schedule.length*36),maxPhaseMs=options.maxPhaseMs??7200000,maxDecisions=options.maxDecisions??12;
 const code=await sourceIdentity(),profile=humanJevProfile(mode,300000,60000,maxDecisions),specBytes=await readFile(resolve(options.siteSpec)),spec=JSON.parse(specBytes.toString()) as BetaPublicSiteSpec,charterBytes=await readFile(resolve(options.charter)),charter=parsePublicCharter(JSON.parse(charterBytes.toString()),spec.startURL),priorBytes=await readFile(options.priorSnapshot),prior=JSON.parse(priorBytes.toString()),protocol=await optionalProtocol();
 if(prior.count!==prior.files?.length||!Number.isSafeInteger(prior.count)||prior.count<0||new Set(prior.files.map((f:any)=>f.path)).size!==prior.count||prior.files.some((f:any)=>typeof f.path!=='string'||!isAbsolute(f.path)||!/(^|[\\/])reports[\\/]/i.test(f.path)||/(^|[\\/])(?:\.env(?:\.|$)|credentials(?:\.|$))/i.test(f.path)||!/^[a-f0-9]{64}$/.test(f.sha256)))throw Error('INVALID_PRIOR_SNAPSHOT');
 if(!spec.harPath||!isAbsolute(spec.harPath)||!/^[a-f0-9]{64}$/i.test(spec.harSha256)||sha(await readFile(spec.harPath))!==spec.harSha256.toLowerCase())throw Error('SNAPSHOT_CHANGED');
 const personas:Record<string,Persona|null>=selectedSet?.personas??{baseline:null,A:null,B:null,C:null},personaFiles:{file:string;sha256:string;actor?:string}[]=selectedSet?.personaFiles??[];
 if(!selectedSet)for(const actor of personaBetaActors.filter(a=>a!=='baseline')){const file=resolve(`experiments/persona/persona-${actor.toLowerCase()}.json`),bytes=await readFile(file),persona=parsePersona(JSON.parse(bytes.toString()));if(persona.id!==actor)throw Error('PERSONA_FILE_ID_MISMATCH');personas[actor]=persona;personaFiles.push({file,sha256:sha(bytes)});}
 const limits={trials:schedule.length,maxRequests,perTrialRequests:36,judgments:maxDecisions,uiActions:15,looks:3,trialMs:300000,nativeRequestMs:60000,phaseMs:maxPhaseMs,parallel:1,retry:0};
 const identity={source:{revision:code.revision,sourceHash:code.sourceHash},configSha256:sha(json(profile.config)),profileSha256:sha(json(profile)),siteSpecPath:resolve(options.siteSpec),siteSpecSha256:sha(specBytes),harPath:spec.harPath,harSha256:spec.harSha256,charterPath:resolve(options.charter),charterSha256:sha(charterBytes),priorSnapshotPath:resolve(options.priorSnapshot),priorSnapshotSha256:sha(priorBytes),personaFiles,...(selectedSet?{personaSet:selectedSet.personaSet}:{}),personasSha256:sha(json(personas)),protocol:protocol?{file:protocolFile,sha256:sha(protocol)}:null,mock:options.mock,repeats:options.repeats??1,maxRequests,maxPhaseMs,scheduleSha256:sha(json(schedule))};
 const assertFrozen=async()=>{if(!eq(await sourceIdentity(),code)||sha(await readFile(identity.siteSpecPath))!==identity.siteSpecSha256||sha(await readFile(identity.charterPath))!==identity.charterSha256||sha(await readFile(identity.priorSnapshotPath))!==identity.priorSnapshotSha256||sha(json(humanJevProfile(mode,300000,60000,maxDecisions)))!==identity.profileSha256||!eq(await optionalProtocol(),protocol))throw Error('FROZEN_SOURCE_CHANGED');if(sha(await readFile(spec.harPath))!==spec.harSha256.toLowerCase())throw Error('SNAPSHOT_CHANGED');try{for(const p of personaFiles)if(sha(await readFile(p.file))!==p.sha256)throw Error('FROZEN_SOURCE_CHANGED');if(selectedSet){if(!eq(await loadPublicPersonaSet(selectedSet.personaSet.selection),selectedSet))throw Error('FROZEN_SOURCE_CHANGED');}}catch{throw Error('FROZEN_SOURCE_CHANGED');}};
 const preservePrior=async()=>{for(const f of prior.files)if(sha(await readFile(f.path))!==f.sha256)throw Error('PRIOR_RAW_CHANGED');};
 await preservePrior();await assertFrozen();
 let manifest:any;
 if(options.resume){manifest=JSON.parse(await readFile(join(out,'manifest.json'),'utf8'));if(manifest.schemaVersion!==1||manifest.phase!=='public-persona-comparison'||!eq(manifest.identity,identity)||!eq(manifest.schedule,schedule)||!eq(manifest.profile,profile)||!eq(manifest.spec,spec)||!eq(manifest.charter,charter)||!eq(manifest.personas,personas)||!eq(manifest.personaFiles,personaFiles)||!eq(manifest.personaSet??null,selectedSet?.personaSet??null)||!eq(manifest.limits,limits)||!Array.isArray(manifest.records)||typeof manifest.batchId!=='string'||!Number.isSafeInteger(manifest.deadlineEpochMs)||manifest.deadlineEpochMs!==manifest.startedEpochMs+maxPhaseMs)throw Error('RESUME_IDENTITY_MISMATCH');}
 else{await mkdir(dirname(out),{recursive:true});await mkdir(out);const startedEpochMs=Date.now();manifest={schemaVersion:1,phase:'public-persona-comparison',batchId:randomUUID(),identity,...code,profile,spec,charter,personas,personaFiles,...(selectedSet?{personaSet:selectedSet.personaSet}:{}),schedule,records:[],limits,startedEpochMs,startedAtUTC:new Date(startedEpochMs).toISOString(),deadlineEpochMs:startedEpochMs+maxPhaseMs,totalRequests:0,status:'RUNNING',preservationBefore:true,preservationAfter:false,priorCount:prior.count,humanInputsRead:false,savedInputResends:0};}
 const unlock=await lockBatch(out),records=manifest.records as Row[];
 const save=async()=>{manifest.totalRequests=records.reduce((sum,r)=>sum+r.requests,0);await atomicJSON(join(out,'manifest.json'),manifest);await atomicJSON(join(out,'summary.json'),{schemaVersion:1,status:manifest.status,batchId:manifest.batchId,planned:schedule.length,attempted:records.length,valid:records.filter(r=>r.valid).length,pending:records.filter(r=>r.status==='ATTEMPTING').length,invalid:records.filter(r=>['RESULT','FAILED','INTERRUPTED'].includes(r.status)&&!r.valid).length,missing:schedule.filter(s=>!records.some(r=>r.sequence===s.sequence)).map(s=>s.id),requests:manifest.totalRequests,objective:'UNVERIFIED',objectiveSuccess:null,byActor:Object.fromEntries(actors.map(actor=>[actor,{planned:options.repeats??1,attempted:records.filter(r=>r.actor===actor).length,valid:records.filter(r=>r.actor===actor&&r.valid).length,pending:records.filter(r=>r.actor===actor&&r.status==='ATTEMPTING').length,invalid:records.filter(r=>r.actor===actor&&['RESULT','FAILED','INTERRUPTED'].includes(r.status)&&!r.valid).length}]))});};
 const validateResult=(r:BetaResult,row:Row)=>{
  if(r.runId!==row.runId||!eq(r.code,identity.source)||!eq(r.config,profile.config)||!eq(r.input?.persona??null,personas[row.actor])||!eq(r.input?.charter,charter)||!eq(r.publicSite?.spec,spec)||r.publicSite?.networkMode!=='frozen-har-no-fallback')throw Error('TRIAL_IDENTITY_MISMATCH');
  if(r.objectiveSuccess!==null||r.objectiveAssessment?.status!=='UNVERIFIED'||r.objectiveAssessment.value!==null)throw Error('PUBLIC_OBJECTIVE_MUST_REMAIN_UNVERIFIED');
  if(!Number.isSafeInteger(r.apiCalls)||r.apiCalls<0||r.apiCalls>36||!Number.isSafeInteger(r.decisions)||r.decisions<0||r.decisions>profile.config.maxDecisions||r.uiActions>15||r.looks>3||r.elapsedMs>300000+1000)throw Error('TRIAL_CAP_EXCEEDED');
  const bindings=personaInputBindings({persona:personas[row.actor],result:r});if(bindings.errors.length)throw Error('PERSONA_BINDING_MISMATCH');return bindings;
 };
 const capture=async(row:Row,interrupted=false)=>{
  let result:BetaResult|undefined;
  try{
   const bytes=await safeResult(row.resultPath,out);
   if(bytes){
    row.resultSha256=sha(bytes);result=JSON.parse(bytes.toString());row.summary=summarize(result!);
    row.requests=options.mock?0:Number.isSafeInteger(result!.apiCalls)&&result!.apiCalls>=0?result!.apiCalls:0;
    row.modelInvalid||=result!.termination==='INVALID_DISTRIBUTION'||result!.termination==='API_ERROR'&&result!.steps.some(step=>
     [step.error,step.visualHypotheses?.error,step.deliberation?.error].some(error=>!!error&&typeof error==='object'&&['INVALID_DISTRIBUTION','INVALID_RESPONSE','MODEL_MISMATCH','INVALID_VISUAL_HYPOTHESES'].includes((error as {code?:string}).code??'')));
    row.personaDelivery=validateResult(result!,row);
    const product=await readFile(join(row.dir,'initial-product.png')).catch(()=>null);row.initialInputs=initialInputs(result!,product?sha(product):null);
    row.valid=!interrupted&&!row.error&&result!.validForComparison;row.fatal=publicPersonaStopReason(result);
   }else if(!row.error){row.error={code:'RESULT_FILE_MISSING'};row.valid=false;}
  }catch(error){row.error=safeFailure(error);row.valid=false;row.fatal=publicPersonaStopReason(row);}
  // Always consult durable accounting, including malformed/missing partial results.
  if(row.ledger)try{const ledger=await readTransferLedger(row.ledger,36);row.ledgerEvidence=ledger;row.requests=Math.max(row.requests,ledger.used);if(alignmentLedgerMismatch(ledger.used,ledger.reserved,result))throw Error('LEDGER_ACCOUNTING_UNAVAILABLE');}catch{row.error={code:'LEDGER_ACCOUNTING_UNAVAILABLE'};row.valid=false;row.fatal='BUDGET_ACCOUNTING_FAILURE';}
  row.fatal??=publicPersonaStopReason(row);return result;
 }; try{
  if(options.resume){
   const sequences=new Set<number>();let total=0;
   if(records.reduce((sum,r)=>sum+r.requests,0)!==manifest.totalRequests)throw Error('RESUME_ACCOUNTING_MISMATCH');
   for(const row of records){const slot=schedule.find(s=>s.sequence===row.sequence),dir=slot?join(out,slot.id):'';
    if(!slot||sequences.has(row.sequence)||!eq(Object.fromEntries(Object.keys(slot).map(k=>[k,(row as any)[k]])),slot)||row.runId!==manifest.batchId+'-'+row.sequence||row.dir!==dir||row.resultPath!==join(dir,'exploration/result.json')||row.ledger!==(options.mock?null:dir+'-budget.json')||Object.hasOwn(row,'result')||!eq(row.source,identity.source)||row.personaSha256!==(personas[row.actor]?sha(json(personas[row.actor])):null)||!Number.isSafeInteger(row.requests)||row.requests<0||!['ATTEMPTING','RESULT','FAILED','INTERRUPTED'].includes(row.status))throw Error('RESUME_RECORD_MISMATCH');sequences.add(row.sequence);
    const wasInterrupted=row.status==='ATTEMPTING';const bytes=await safeResult(row.resultPath,out);if(row.resultSha256&&(!bytes||sha(bytes)!==row.resultSha256))throw Error('RESUME_RESULT_HASH_MISMATCH');
    if(row.status==='ATTEMPTING'){row.status='INTERRUPTED';row.valid=false;row.error={code:'INTERRUPTED_ATTEMPT'};await capture(row,true);}
    else if(bytes){if(!row.resultSha256)throw Error('RESUME_RESULT_HASH_MISMATCH');const result=JSON.parse(bytes.toString()) as BetaResult;validateResult(result,row);if(!eq(row.summary,summarize(result)))throw Error('RESUME_RECORD_MISMATCH');}
    if(row.ledger&&!wasInterrupted){const ledger=await readTransferLedger(row.ledger,36);if(!eq(ledger,row.ledgerEvidence)||row.requests!==ledger.used||alignmentLedgerMismatch(ledger.used,ledger.reserved,bytes?JSON.parse(bytes.toString()):undefined))throw Error('RESUME_LEDGER_MISMATCH');}if(options.mock&&row.requests!==0)throw Error('RESUME_ACCOUNTING_MISMATCH');
    total+=row.requests;
   }
   if(total>maxRequests)throw Error('RESUME_ACCOUNTING_MISMATCH');
  }
  await save();
  if(options.resume&&!['RUNNING','INCOMPLETE'].includes(manifest.status))return manifest;
  manifest.status='RUNNING';let invalidStreak=0;for(const r of records)invalidStreak=r.modelInvalid?invalidStreak+1:0;
  const priorFatal=records.find(r=>r.fatal)?.fatal;if(priorFatal)manifest.status=priorFatal;
  if(invalidStreak>=3)manifest.status='CONSECUTIVE_INVALID_TRIALS';
  for(const slot of schedule){
   if(manifest.status!=='RUNNING')break;if(records.some(r=>r.sequence===slot.sequence))continue;
   if(Date.now()>=manifest.deadlineEpochMs){manifest.status='PHASE_TIME_LIMIT';break;}
   if(!options.mock&&manifest.totalRequests+36>maxRequests){manifest.status='REQUEST_LIMIT';break;}
   await assertFrozen();const dir=join(out,slot.id),persona=personas[slot.actor],row:Row={...slot,runId:manifest.batchId+'-'+slot.sequence,status:'ATTEMPTING',dir,ledger:options.mock?null:dir+'-budget.json',resultPath:join(dir,'exploration/result.json'),resultSha256:null,requests:0,personaSha256:persona?sha(json(persona)):null,source:identity.source,valid:false};records.push(row);await save();
   try{
    if(row.ledger)await writeFile(row.ledger,json({schemaVersion:1,status:'APPROVED',phase:'public-persona-'+slot.sequence,newMaximum:36,perRunMaximum:12,used:0,attempts:[]}),{flag:'wx'});
    await(mockTrial??runHumanJev)({out:dir,mock:options.mock,publicSite:{spec:structuredClone(spec),charter:structuredClone(charter)},...(persona?{persona:structuredClone(persona)}:{}),mode,longContext:true,maximumRequests:36,maxRunMs:300000,visualRequestMs:60000,...(options.maxDecisions!==undefined?{maxDecisions}:{}),runId:row.runId,deadlineEpochMs:Math.min(manifest.deadlineEpochMs,Date.now()+300000),...(!options.mock?{phaseBudget:row.ledger!,envFile:options.envFile}:{})});row.status='RESULT';
   }catch(error){row.status='FAILED';row.error=safeFailure(error);row.fatal=publicPersonaStopReason(row);row.modelInvalid=['INVALID_DISTRIBUTION','INVALID_RESPONSE','MODEL_MISMATCH'].includes(row.error.code);}
   await capture(row);await save();await assertFrozen();invalidStreak=row.modelInvalid?invalidStreak+1:0;
   const stop=row.fatal??publicPersonaStopReason(row,invalidStreak);if(stop){manifest.status=stop;break;}
  }
  if(manifest.status==='RUNNING')manifest.status=records.length===schedule.length?'COMPLETED':'INCOMPLETE';
 }catch(error){if(options.resume&&error instanceof Error&&/^RESUME_/.test(error.message))throw error;manifest.status=safeFailure(error).code;manifest.error={code:manifest.status};}
 finally{try{await assertFrozen();await preservePrior();manifest.preservationAfter=true;}catch(error){manifest.preservationAfter=false;manifest.status=safeFailure(error).code;}await save();await unlock();}
 return manifest;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const m=await runPublicPersonaComparison(parsePublicPersonaOptions(process.argv.slice(2)));console.log(json({status:m.status,attempted:m.records.length,requests:m.totalRequests}));if(m.status!=='COMPLETED')process.exitCode=1;}


