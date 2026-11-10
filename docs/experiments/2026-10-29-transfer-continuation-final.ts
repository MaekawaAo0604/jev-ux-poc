/** Continue only the seven untouched slots after two immutable stopped phases of the immutable stopped transfer batch.
 * This audit orchestrator lives outside sourceIdentity's product trees. It never
 * supplies an evaluator or replays a saved request to the model.
 */
import {readFile,writeFile,mkdir,readdir,lstat} from 'node:fs/promises';
import {resolve,join,dirname,relative,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {isDeepStrictEqual} from 'node:util';
import type {TransferSlot,TransferRunRecord} from '../../runner/transfer-analysis.js';
import type {BetaResult} from '../../runner/virtual-beta-core.js';

const revision='73b1ff3603b84c0019332970590b1f0d1406dc91';
const sourceHash='8a5bc5c03daaf99df38795fd218dc5e19e0ed916d390620e602286955c6ee3d7';
const previousHash='db9857b740a995ea208bd5f4e9111c493bc00851c31e9ea88255a7856e87cf93';
const continuationHash='df163bbfb4ac7d53e5c61ca72059fb4a2633f9a02bb082fe71b9a620f339fb4e';
const phase2RawDigest='fa77da9f860e8284dbedff54dec01d5010372955422eeb8614a8e6f1526c5ef4';
const protocolHash='ae65d167928aa0990acc17c9e27944f28c9f2133c537f2436c28f0d3f883163b';
const protocolFile='experiments/virtual-beta/transfer-evaluation.json';
const mode='experience-goal-search-grounded';
const limits={trials:7,maxRequests:168,maxRequestsPerTrial:24,maxJudgmentsPerTrial:12,maxUIActionsPerTrial:15,maxLooksPerTrial:3,maxRunMsPerTrial:180000,phaseMs:1440000,parallel:1};
const scriptPath=fileURLToPath(import.meta.url),mainRoot=resolve(dirname(scriptPath),'../..');
const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const hash=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const object=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const inside=(root:string,path:string)=>{const rel=relative(resolve(root),resolve(path));return !isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..\\')&&!rel.startsWith('../');};
function safePath(root:string,path:string){if(!path||isAbsolute(path)||!inside(root,join(root,path))||/(^|[\\/])(?:\.env(?:\.|$)|credentials(?:\.|$))/i.test(path))throw Error('UNSAFE_PIN_PATH');return resolve(root,path);}
export type ContinuationOptions={previous:string;continuation:string;pending:string;priorSnapshot:string;frozenRoot:string;out:string;mock:boolean;envFile?:string};
export function validateContinuationOptions(o:ContinuationOptions){
 for(const key of ['previous','continuation','pending','priorSnapshot','frozenRoot','out'] as const)if(typeof o[key]!=='string'||!o[key].trim()||!isAbsolute(o[key]))throw Error('EXPLICIT_ABSOLUTE_PATH_REQUIRED');
 if(typeof o.mock!=='boolean')throw Error('EXPLICIT_EXECUTION_KIND_REQUIRED');
 if(o.mock&&o.envFile!==undefined)throw Error('MOCK_MUST_NOT_READ_ENV_FILE');
 if(!o.mock&&(typeof o.envFile!=='string'||!isAbsolute(o.envFile)||inside(o.frozenRoot,o.envFile)))throw Error('EXPLICIT_EXTERNAL_ENV_FILE_REQUIRED');
 if(inside(dirname(o.previous),o.out)||inside(dirname(o.continuation),o.out)||inside(o.frozenRoot,o.out))throw Error('OUTPUT_MUST_NOT_OVERLAP_ORIGINALS_OR_FROZEN_ROOT');
}
/** The orchestrator computes previousSha256 from the very bytes parsed as previous. */
export function planTransferContinuation(input:{previous:Record<string,any>;continuation:Record<string,any>;pending:Record<string,any>;canonical:TransferSlot[];previousSha256:string;continuationSha256:string}){
 const {previous:p,continuation:q,pending:n,canonical,previousSha256,continuationSha256}=input;
 if(previousSha256!==previousHash||n.stoppedManifestSha256!==previousHash||continuationSha256!==continuationHash||n.continuationManifestSha256!==continuationHash)throw Error('PREVIOUS_MANIFEST_HASH_MISMATCH');
 if(p.status!=='HTTP_402'||p.mock!==false||p.revision!==revision||p.sourceHash!==sourceHash||p.protocol?.sha256!==protocolHash||p.protocol?.file!==protocolFile)throw Error('PREVIOUS_PRODUCER_OR_STATUS_MISMATCH');
 if(!object(p.sourceHashes)||Object.keys(p.sourceHashes).length!==129||!Object.values(p.sourceHashes).every(hash)||sha(JSON.stringify(p.sourceHashes))!==sourceHash)throw Error('PREVIOUS_SOURCE_HASH_MAP_MISMATCH');
 if(!hash(p.charterSha256)||p.method?.mode!==mode||p.method.persona!==null||p.method.longContext!==true||p.method.maxAttemptsPerRequest!==1)throw Error('PREVIOUS_METHOD_MISMATCH');
 if(!isDeepStrictEqual(n.producer,{revision,sourceHash,protocol:p.protocol,method:p.method})||n.attempted!==14||n.requestsCharged!==93||n.remainingTrialLimit!==7||n.remainingRequestLimit!==168||n.combinedRequestUpperBound!==261||n.retryFailedSlot!==false||n.stoppedStatus!=='HTTP_402')throw Error('PENDING_PRODUCER_OR_LIMIT_MISMATCH');
 if(!Array.isArray(canonical)||canonical.length!==21||new Set(canonical.map(s=>s.id)).size!==21||!isDeepStrictEqual(p.schedule,canonical))throw Error('CANONICAL_SCHEDULE_MISMATCH');
 if(!Array.isArray(p.records)||p.records.length!==13||new Set(p.records.map((r:any)=>r.id)).size!==13||new Set(p.records.map((r:any)=>r.runId)).size!==13)throw Error('PREVIOUS_PREFIX_OR_DUPLICATE_MISMATCH');
 const priorIds=new Set<string>();
 for(const [i,r] of p.records.entries()){
  const slot={id:r.id,replicate:r.replicate,kind:r.kind,fixture:r.fixture};
  if(r.slotId!==r.id||!isDeepStrictEqual(slot,canonical[i])||!Number.isInteger(r.requests)||r.requests<0||r.requests>24)throw Error('PREVIOUS_PREFIX_MISMATCH');priorIds.add(r.id);
 }
 if(p.totalRequests!==92||p.records.reduce((n:number,r:any)=>n+r.requests,0)!==92)throw Error('PREVIOUS_REQUEST_ACCOUNTING_MISMATCH');
 if(q.status!=='HTTP_402'||q.mock!==false||q.revision!==revision||q.sourceHash!==sourceHash||!isDeepStrictEqual(q.sourceHashes,p.sourceHashes)||!isDeepStrictEqual(q.method,p.method)||!isDeepStrictEqual(q.protocol,p.protocol)||!isDeepStrictEqual(q.schedule,canonical)||!isDeepStrictEqual(q.continuationSchedule,canonical.slice(13))||q.origin?.previousSha256!==previousHash||q.origin.previousRequests!==92||q.origin.previousAttempted!==13||q.totalRequests!==1||q.combinedRequests!==93||!Array.isArray(q.records)||q.records.length!==1)throw Error('PHASE2_PRODUCER_OR_ACCOUNTING_MISMATCH');
 const r=q.records[0],slot={id:r.id,replicate:r.replicate,kind:r.kind,fixture:r.fixture};
 if(r.slotId!==r.id||!isDeepStrictEqual(slot,canonical[13])||r.requests!==1||!r.runId||p.records.some((old:any)=>old.runId===r.runId)||priorIds.has(r.id))throw Error('PHASE2_PREFIX_MISMATCH');priorIds.add(r.id);
 if(!object(n.phase2Raw?.hashes)||Object.keys(n.phase2Raw.hashes).length!==20||n.phase2Raw.files!==20||n.phase2Raw.digest!==phase2RawDigest||sha(JSON.stringify(n.phase2Raw.hashes))!==phase2RawDigest)throw Error('PHASE2_RAW_HASH_MAP_MISMATCH');
 if(!Array.isArray(n.remainingSlots)||n.remainingSlots.length!==7||new Set(n.remainingSlots.map((s:any)=>s.id)).size!==7)throw Error('PENDING_DUPLICATE_OR_SIZE_MISMATCH');
 for(const next of n.remainingSlots)if(priorIds.has(next.id)||!canonical.some(s=>s.id===next.id))throw Error('PENDING_OVERLAP_OR_UNKNOWN_SLOT');
 if(!isDeepStrictEqual(n.remainingSlots,canonical.slice(14)))throw Error('PENDING_SUFFIX_MISMATCH');
 if(93+limits.maxRequests>p.limits?.maxRequests||p.limits.maxRequests!==504)throw Error('COMBINED_REQUEST_LIMIT_EXCEEDED');
 return {schedule:structuredClone(canonical),continuationSchedule:structuredClone(canonical.slice(14)),previousRequests:93,combinedRequestUpperBound:261,limits:{...limits}};
}
async function json(file:string){return JSON.parse(await readFile(file,'utf8'));}
async function requireNewOutput(out:string){try{await lstat(out);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return;throw error;}throw Object.assign(Error('OUTPUT_ALREADY_EXISTS'),{code:'EEXIST'});}
function has402(v:unknown):boolean{if(!v||typeof v!=='object')return false;return (v as Record<string,unknown>).statusCode===402||Object.values(v).some(has402);}
type Preserved={path:string;sha256:string};
async function captureOriginals(options:ContinuationOptions){
 const snapshotBytes=await readFile(options.priorSnapshot),snapshot=JSON.parse(snapshotBytes.toString('utf8'));
 if(!object(snapshot.hashes)||Object.keys(snapshot.hashes).length!==1939||!Array.isArray(snapshot.ledgers)||snapshot.ledgers.length!==142)throw Error('INVALID_OR_INCOMPLETE_PRIOR_SNAPSHOT');
 const entries=new Map<string,Preserved>();
 const add=(file:string,expected:unknown)=>{const path=safePath(mainRoot,file);if(!hash(expected))throw Error('INVALID_PRIOR_HASH');const previous=entries.get(path);if(previous&&previous.sha256!==expected)throw Error('CONFLICTING_PRIOR_HASH');entries.set(path,{path,sha256:expected});};
 for(const [file,digest] of Object.entries(snapshot.hashes))add(file,digest);
 for(const ledger of snapshot.ledgers){if(!object(ledger)||typeof ledger.path!=='string')throw Error('INVALID_PRIOR_LEDGER');add(ledger.path,ledger.sha256);}
 const liveRoot=dirname(options.previous),live:Preserved[]=[];
 async function walk(dir:string){for(const entry of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const path=join(dir,entry.name);if(entry.isSymbolicLink())throw Error('ORIGINAL_SYMLINK_REJECTED');if(entry.isDirectory())await walk(path);else if(entry.isFile()){if(/(^|[\\/])(?:\.env(?:\.|$)|credentials(?:\.|$))/i.test(path))throw Error('CREDENTIAL_FILE_IN_ORIGINALS');live.push({path,sha256:sha(await readFile(path))});}}}
 await walk(liveRoot);if(live.length!==299)throw Error('STOPPED_LIVE_FILE_COUNT_MISMATCH');
 for(const item of live){const previous=entries.get(item.path);if(previous&&previous.sha256!==item.sha256)throw Error('PRIOR_AND_LIVE_HASH_MISMATCH');entries.set(item.path,item);}
 const pending=await json(options.pending),phase2Root=dirname(options.continuation),phase2:Preserved[]=[];
 for(const [file,digest] of Object.entries(pending.phase2Raw.hashes)){
  const path=safePath(mainRoot,file);if(!inside(phase2Root,path)||!hash(digest)||sha(await readFile(path))!==digest)throw Error('PHASE2_RAW_CHANGED');const item={path,sha256:digest};phase2.push(item);entries.set(path,item);
 }
 const stoppedOriginals=await json(join(phase2Root,'original-hashes-before.json'));
 if(!Array.isArray(stoppedOriginals.entries)||stoppedOriginals.entries.length!==2238)throw Error('PHASE2_PRESERVED_ORIGINALS_MISMATCH');
 for(const item of stoppedOriginals.entries){if(!object(item)||typeof item.path!=='string'||!inside(mainRoot,item.path)||!hash(item.sha256))throw Error('UNSAFE_PRESERVED_ORIGINAL');const known=entries.get(item.path);if(!known||known.sha256!==item.sha256)throw Error('ORIGINAL_CHANGED_SINCE_PHASE2');}
 const data={entries:[...entries.values()],live,liveRoot,phase2,phase2Root,priorHashFiles:1939,priorLedgerReferences:142,snapshotSha256:sha(snapshotBytes)};
 const before=await verifyOriginals(data);if(!before.unchanged)throw Error('ORIGINAL_CHANGED_BEFORE_CONTINUATION');return {...data,before};
}
async function verifyOriginals(snapshot:{entries:Preserved[];live:Preserved[];liveRoot:string;phase2:Preserved[];phase2Root:string}){
 const changed:string[]=[];for(const item of snapshot.entries)try{if(sha(await readFile(item.path))!==item.sha256)changed.push(item.path);}catch{changed.push(item.path);}
 const current:string[]=[];async function walk(dir:string){for(const entry of await readdir(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory())await walk(path);else current.push(path);}}
 try{await walk(snapshot.liveRoot);}catch{changed.push(snapshot.liveRoot);}
 if(!isDeepStrictEqual(current.sort(),snapshot.live.map(i=>i.path).sort()))changed.push('STOPPED_LIVE_INVENTORY_CHANGED');
 current.length=0;try{await walk(snapshot.phase2Root);}catch{changed.push(snapshot.phase2Root);}if(!isDeepStrictEqual(current.sort(),snapshot.phase2.map(i=>i.path).sort()))changed.push('PHASE2_INVENTORY_CHANGED');
 return {unchanged:changed.length===0,checked:snapshot.entries.length,liveFiles:snapshot.live.length,phase2Files:snapshot.phase2.length,changed};
}
type MockTrial=(options:any)=>Promise<{result:BetaResult;root?:string;review?:unknown}>;
/** No evaluator substitution: production always calls runHumanJev from the pinned original root. */
export async function runTransferContinuation(options:ContinuationOptions,mockTrial?:MockTrial){
 if(mockTrial&&!options.mock)throw Error('INJECTED_TRIAL_MOCK_ONLY');
 validateContinuationOptions(options);await requireNewOutput(options.out);
 const previousBytes=await readFile(options.previous),previous=JSON.parse(previousBytes.toString('utf8')),continuationBytes=await readFile(options.continuation),continuation=JSON.parse(continuationBytes.toString('utf8')),pendingBytes=await readFile(options.pending),pending=JSON.parse(pendingBytes.toString('utf8'));
 // Validate authenticated input and the complete source map before executing any imported code.
 planTransferContinuation({previous,continuation,pending,continuationSha256:sha(continuationBytes),canonical:previous.schedule,previousSha256:sha(previousBytes)});
 const initialScriptHash=sha(await readFile(scriptPath)),pendingHash=sha(pendingBytes);
 const identity={revision,sourceHash,sourceHashes:previous.sourceHashes};
 const assertFiles=async()=>{
  if(execFileSync('git',['-C',options.frozenRoot,'rev-parse','HEAD'],{encoding:'utf8'}).trim()!==revision)throw Error('FROZEN_REVISION_CHANGED');
  for(const [file,digest] of Object.entries(previous.sourceHashes))if(sha(await readFile(safePath(options.frozenRoot,file)))!==digest)throw Error('FROZEN_SOURCE_FILE_CHANGED');
  if(sha(await readFile(join(options.frozenRoot,protocolFile)))!==protocolHash||sha(await readFile(join(options.frozenRoot,'experiments/persona/charter.json')))!==previous.charterSha256)throw Error('FROZEN_PROTOCOL_OR_CHARTER_CHANGED');
  if(sha(await readFile(options.continuation))!==continuationHash||sha(await readFile(join(mainRoot,'docs/experiments/2026-10-29-transfer-continuation.ts')))!=='74ecfe43a11641718c2d2a274289a118923593229ad6e19792ad22254fc6ad72'||sha(await readFile(join(mainRoot,'tests/transfer-continuation.test.ts')))!=='1a5f61632b72369030f9c68818c7fae77e94111fcb66f980090fee599ba24ecd'||sha(await readFile(options.previous))!==previousHash||sha(await readFile(options.pending))!==pendingHash||sha(await readFile(options.priorSnapshot))!==originals.snapshotSha256||sha(await readFile(scriptPath))!==initialScriptHash)throw Error('CONTINUATION_INPUT_OR_SCRIPT_CHANGED');
 };
 const originals=await captureOriginals(options);await assertFiles();
 const originalCwd=process.cwd();process.chdir(options.frozenRoot);
 try{
  const load=(file:string)=>import(pathToFileURL(join(options.frozenRoot,file)).href);
  const [wrapper,source,replay,analysis,batch,profiles,client]=await Promise.all([load('runner/human-jev-experiment.ts'),load('runner/virtual-beta-source.ts'),load('runner/virtual-beta-replay.ts'),load('runner/transfer-analysis.ts'),load('runner/transfer-evaluation.ts'),load('runner/human-jev-profiles.ts'),load('jev/client.ts')]);
  const profile=profiles.humanJevProfile(mode);
  const assertFrozen=async()=>{if(resolve(process.cwd())!==resolve(options.frozenRoot))throw Error('FROZEN_CWD_CHANGED');await assertFiles();if(!isDeepStrictEqual(await source.sourceIdentity(),identity)||!isDeepStrictEqual(profiles.humanJevProfile(mode),previous.method.profile))throw Error('FROZEN_SOURCE_OR_PROFILE_CHANGED');};
  await assertFrozen();if(!isDeepStrictEqual(profile,previous.method.profile))throw Error('FROZEN_PROFILE_MISMATCH');
  const plan=planTransferContinuation({previous,continuation,pending,continuationSha256:sha(continuationBytes),canonical:batch.transferSchedule(),previousSha256:sha(previousBytes)});
  await mkdir(dirname(options.out),{recursive:true});await mkdir(options.out);
  const batchId=randomUUID(),started=Date.now(),deadlineEpochMs=started+limits.phaseMs,records:TransferRunRecord[]=[];
  const manifest:any={schemaVersion:1,phase:'transfer-continuation-final-2026-10-29',batchId,mock:options.mock,model:options.mock?'MOCK_SCRIPTED_FIXTURE':'jev-1.14.0',...identity,protocol:{file:protocolFile,sha256:protocolHash},charterSha256:previous.charterSha256,method:structuredClone(previous.method),configSha256:sha(JSON.stringify(profile.config)),origin:{previous:options.previous,previousSha256:previousHash,pending:options.pending,pendingSha256:pendingHash,previousRequests:93,previousAttempted:14,firstPhaseRequests:92,firstPhaseAttempted:13,continuation:options.continuation,continuationSha256:continuationHash,phase2Requests:1,phase2RawDigest},orchestrator:{file:scriptPath,sha256:initialScriptHash},frozenRoot:options.frozenRoot,humanInputsRead:false,schedule:plan.schedule,continuationSchedule:plan.continuationSchedule,limits:{...limits},originalLimits:previous.limits,combinedRequestUpperBound:261,completionScope:'final-continuation-only; original13 and phase2 one retained without retries',startedAtUTC:new Date(started).toISOString(),deadlineEpochMs,records,totalRequests:0,combinedRequests:93,requestCountBasis:options.mock?'mock-no-gateway-requests':'maximum-of-durable-ledger-wrapper-snapshot-and-recorded-API-calls',status:'RUNNING',error:null,preservationBefore:originals.before,preservationAfter:null};
  const safeError=(error:unknown)=>{const f=client.safeRequestFailure(error);return {code:f.code,...(f.statusCode?{statusCode:f.statusCode}:{})};};
  const save=async()=>{manifest.totalRequests=records.reduce((n,r)=>n+r.requests,0);manifest.combinedRequests=93+manifest.totalRequests;await writeFile(join(options.out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');await writeFile(join(options.out,'summary.json'),JSON.stringify(analysis.analyzeTransferRuns(records),null,2)+'\n');};
  await writeFile(join(options.out,'original-hashes-before.json'),JSON.stringify({priorHashFiles:originals.priorHashFiles,priorLedgerReferences:originals.priorLedgerReferences,liveFiles:299,entries:originals.entries},null,2)+'\n');
  await writeFile(join(options.out,'frozen-source.json'),JSON.stringify({code:identity,protocolSha256:protocolHash,charterSha256:previous.charterSha256,profile,scriptSha256:initialScriptHash},null,2)+'\n');await save();
  let consecutiveInfrastructure=0;
  try{
   for(const slot of plan.continuationSchedule){
    if(Date.now()>=deadlineEpochMs){manifest.status='PHASE_TIME_LIMIT';break;}
    if(manifest.totalRequests+24>168||manifest.combinedRequests+24>504){manifest.status='BATCH_REQUEST_LIMIT';break;}
    await assertFrozen();
    const dir=join(options.out,slot.id),ledger=options.mock?null:join(options.out,slot.id+'-budget.json');
    const record:TransferRunRecord={...slot,slotId:slot.id,runId:batchId+'-'+slot.id,dir,ledger,resultPath:join(dir,'exploration','result.json'),status:'ATTEMPTING',initialImageSha256:null,requests:0};records.push(record);await save();
    let fatal:unknown;
    try{
     if(ledger)await writeFile(ledger,JSON.stringify({schemaVersion:1,status:'APPROVED',phase:'transfer-continuation-'+slot.id,newMaximum:24,perRunMaximum:12,used:0,attempts:[]},null,2)+'\n',{flag:'wx'});
     const trialOptions={out:dir,mock:options.mock,mode,longContext:true,runId:record.runId,deadlineEpochMs:Math.min(deadlineEpochMs,Date.now()+180000),...(slot.kind==='novel'?{transferFixture:slot.fixture}:{holdoutFixture:slot.fixture}),...(!options.mock?{phaseBudget:ledger,envFile:options.envFile}:{})};
     const saved=await (mockTrial??wrapper.runHumanJev)(trialOptions);record.result=saved.result;record.status='RESULT';record.requests=options.mock?0:saved.result.apiCalls;
     record.preparatoryInitialImageSha256=sha(await readFile(join(dir,'initial-product.png')));
     if(!isDeepStrictEqual(saved.result.config,profile.config)||saved.result.input.persona!==undefined&&saved.result.input.persona!==null||saved.result.runId!==record.runId||!isDeepStrictEqual(saved.result.code,{revision,sourceHash}))throw Error('TRIAL_FROZEN_IDENTITY_MISMATCH');
     if(saved.result.apiCalls>24||saved.result.decisions>12||saved.result.uiActions>15||saved.result.looks>3)throw Error('TRIAL_CAP_EXCEEDED');
     if(mockTrial){record.initialImageSha256=record.preparatoryInitialImageSha256;record.replay={status:'MOCK_INJECTION'};}
     else{
      const metadata=slot.kind==='novel'?saved.result.transfer:saved.result.holdout;if(!metadata||!isDeepStrictEqual(metadata.fixture,slot.fixture)||metadata.initialProductImage.file!=='initial-product.png')throw Error('TRIAL_FROZEN_IDENTITY_MISMATCH');
      const initial=sha(await readFile(join(dir,'exploration','initial-product.png')));if(initial!==metadata.initialProductImage.sha256)throw Error('TRIAL_FROZEN_IDENTITY_MISMATCH');record.initialImageSha256=initial;
      try{const replayed=await replay.replayDirectory(join(dir,'exploration'));await writeFile(join(dir,'offline-replay.json'),JSON.stringify(replayed,null,2)+'\n');record.replay={status:'OK'};}catch{record.replay={status:'ERROR',code:'OFFLINE_REPLAY_FAILED'};throw Error('OFFLINE_REPLAY_FAILED');}
      record.frameChecks=await analysis.verifyTransferFrames(saved.result,join(dir,'exploration'));await writeFile(join(dir,'delivered-current-frames.json'),JSON.stringify(record.frameChecks,null,2)+'\n');
     }
    }catch(error){record.error=safeError(error);if(!record.result){record.status='FAILED';try{const partial=await json(record.resultPath!);if(partial.schemaVersion===1&&partial.runId===record.runId&&Array.isArray(partial.steps)){record.result=partial;record.requests=options.mock?0:partial.apiCalls;}}catch{/* Partial setup remains an attempted, invalid slot. */}}if(error instanceof Error&&['TRIAL_FROZEN_IDENTITY_MISMATCH','TRIAL_CAP_EXCEEDED','OFFLINE_REPLAY_FAILED'].includes(error.message))fatal=error;}
    finally{
     if(ledger){try{record.budgetAfterEvidence=await batch.readTransferLedger(join(dir,'phase-budget-after.json'));record.requests=Math.max(record.requests,record.budgetAfterEvidence!.used);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT'){record.error={code:'BUDGET_SNAPSHOT_ACCOUNTING_UNAVAILABLE'};fatal=error;}}try{record.ledgerEvidence=await batch.readTransferLedger(ledger);record.requests=Math.max(record.requests,record.ledgerEvidence!.used);}catch(error){record.error={code:'LEDGER_ACCOUNTING_UNAVAILABLE'};fatal=error;}}
     await save();
    }
    await assertFrozen();if(fatal)throw fatal;
    if(manifest.totalRequests>168||manifest.combinedRequests>261)throw Error('CONTINUATION_REQUEST_ACCOUNTING_EXCEEDED');
    if(has402(record.error)||has402(record.result)){manifest.status='HTTP_402';break;}
    consecutiveInfrastructure=analysis.transferFailureCategories(record).infrastructure?consecutiveInfrastructure+1:0;
    if(consecutiveInfrastructure>=2){manifest.status='CONSECUTIVE_INFRASTRUCTURE_FAILURES';break;}
    console.log(JSON.stringify({slotId:slot.id,runId:record.runId,status:record.status,attempted:records.length,continuationPlanned:7,requests:record.requests,totalRequests:manifest.totalRequests,combinedRequests:manifest.combinedRequests}));
   }
   if(manifest.status==='RUNNING')manifest.status=records.length===7&&records.every(r=>r.status==='RESULT')?'COMPLETED':'INCOMPLETE';
  }catch(error){manifest.status='BATCH_ERROR';manifest.error=safeError(error);throw error;}
  finally{
   manifest.preservationAfter=await verifyOriginals(originals);await writeFile(join(options.out,'original-preservation-check.json'),JSON.stringify({before:originals.before,after:manifest.preservationAfter},null,2)+'\n');
   if(!manifest.preservationAfter.unchanged){manifest.status='BATCH_ERROR';manifest.error={code:'ORIGINAL_CHANGED_DURING_CONTINUATION'};}await save();if(!manifest.preservationAfter.unchanged)throw Error('ORIGINAL_CHANGED_DURING_CONTINUATION');
  }
  return {root:options.out,status:manifest.status,trials:records.length,requests:manifest.totalRequests,combinedRequests:manifest.combinedRequests};
 }finally{process.chdir(originalCwd);}
}
async function main(){
 const options:any={mock:false},args=process.argv.slice(2),names:Record<string,string>={'--previous':'previous','--continuation':'continuation','--pending':'pending','--prior-snapshot':'priorSnapshot','--frozen-root':'frozenRoot','--env-file':'envFile','--out':'out'};
 for(let i=0;i<args.length;i++){const key=args[i];if(key==='--mock'){options.mock=true;continue;}if(!names[key]||!args[i+1]||args[i+1].startsWith('--'))throw Error('INVALID_OPTION');options[names[key]]=args[++i];}
 console.log(JSON.stringify(await runTransferContinuation(options)));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{await main();}catch{console.error(JSON.stringify({status:'ERROR',code:'CONTINUATION_FAILED_CHECK_MANIFEST'}));process.exitCode=1;}}
