import {actionRelationQuestions} from '../jev/virtual-beta/action-relations.js';
import {offeredCandidates} from './virtual-beta-core.js';
import {candidatesFor} from '../jev/types.js';
import {filterCandidates} from '../jev/persona.js';
import {readFile,writeFile,mkdir,lstat} from 'node:fs/promises';
import {resolve,join,dirname,relative,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {runHumanJev} from './human-jev-experiment.js';
import {humanJevProfile} from './human-jev-profiles.js';
import {recoverySchedule} from './recovery-evaluation.js';
import {analyzeRecoveryRuns} from './recovery-analysis.js';
import type {RecoveryRunRecord,RecoverySlot} from './recovery-contracts.js';
import {recoveryDefinition} from '../app/recovery-fixture.js';
import {sourceIdentity} from './virtual-beta-source.js';
import {replayDirectory} from './virtual-beta-replay.js';
import {verifyTransferFrames,transferFailureCategories} from './transfer-analysis.js';
import {readTransferLedger} from './transfer-evaluation.js';
import {safeRequestFailure} from '../jev/client.js';

export const visualConditionsActors=['experience-action-relations','experience-action-relations-current','experience-visual-conditions'] as const;
export type VisualConditionsActor=typeof visualConditionsActors[number];
export type VisualConditionsSlot=RecoverySlot&{actor:VisualConditionsActor;sequence:number};
export type VisualConditionsRunRecord=RecoveryRunRecord&{actor:VisualConditionsActor;sequence:number};
export const visualConditionsLimits={trials:18,maxRequests:504,maxRequestsPerTrial:36,maxJudgmentsPerTrial:12,maxUIActionsPerTrial:15,maxLooksPerTrial:3,maxRunMsPerTrial:180000,phaseMs:2400000,parallel:1};
export type VisualConditionsOptions={out:string;mock:boolean;priorSnapshot:string;envFile?:string;limit?:number};
const protocolFile='experiments/virtual-beta/visual-conditions-comparison.json';
const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const object=(value:unknown):value is Record<string,any>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const hash=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const nonnegative=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
const slotKey=(slot:RecoverySlot)=>`${slot.fixture.task}/${slot.fixture.condition}/r${slot.replicate}`;

/** One actor at a time; reverse fixture block and reverse paired actor order in block two. */
export const visualConditionsActorOrderOffset=2;
export function visualConditionsSchedule():VisualConditionsSlot[]{
 return recoverySchedule().filter(slot=>slot.replicate===1).flatMap((slot,index)=>{const actors=[...visualConditionsActors.slice((index+visualConditionsActorOrderOffset)%3),...visualConditionsActors.slice(0,(index+visualConditionsActorOrderOffset)%3)];return actors.map((actor,i)=>({...slot,actor,sequence:index*3+i+1}));});
}
export function validateVisualConditionsOptions(options:VisualConditionsOptions){
 if(typeof options.out!=='string'||!options.out.trim()||typeof options.mock!=='boolean')throw Error('EXPLICIT_OUTPUT_AND_KIND_REQUIRED');
 if(typeof options.priorSnapshot!=='string'||!isAbsolute(options.priorSnapshot))throw Error('ABSOLUTE_PRIOR_SNAPSHOT_REQUIRED');
 if(!Number.isInteger(options.limit??18)||(options.limit??18)<1||(options.limit??18)>18)throw Error('TRIAL_LIMIT_1_TO_18');
 if(options.mock&&options.envFile!==undefined)throw Error('MOCK_MUST_NOT_READ_ENV');
 if(!options.mock){
  if(typeof options.envFile!=='string'||!isAbsolute(options.envFile))throw Error('EXTERNAL_ENV_REQUIRED');
  const rel=relative(process.cwd(),options.envFile);if(!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('../')&&!rel.startsWith('..\\'))throw Error('EXTERNAL_ENV_REQUIRED');
 }
}
export function visualConditionsStopReason(value:unknown):'PROVIDER_UNAVAILABLE'|'BUDGET_ACCOUNTING_FAILURE'|'MODEL_OUTPUT_FAILURE'|null{
 if(!value||typeof value!=='object')return null;
 if(['BUDGET_ADMISSION_ERROR','BUDGET_SETTLEMENT_AFTER_REQUEST','LEDGER_ACCOUNTING_UNAVAILABLE'].includes((value as Record<string,unknown>).code as string))return 'BUDGET_ACCOUNTING_FAILURE';
 if((value as any).code==='MISSING_CREDENTIALS')return 'PROVIDER_UNAVAILABLE';
 if((value as any).code==='INVALID_VISUAL_HYPOTHESES')return 'MODEL_OUTPUT_FAILURE';
 const children=Object.values(value).map(visualConditionsStopReason);
 if(children.includes('MODEL_OUTPUT_FAILURE'))return 'MODEL_OUTPUT_FAILURE';
 if(children.includes('BUDGET_ACCOUNTING_FAILURE'))return 'BUDGET_ACCOUNTING_FAILURE';
 if([400,401,402,403,404,429].includes((value as Record<string,unknown>).statusCode as number)||children.includes('PROVIDER_UNAVAILABLE'))return 'PROVIDER_UNAVAILABLE';
 return null;
}
function initialEvidence(record:VisualConditionsRunRecord){
 const step=record.result?.steps[0],stage=step?.deliberation;
 if(!step||!stage?.modelInput||!stage.questions||!stage.assetFiles?.current||!record.initialImageSha256)return null;
 const input=stage.modelInput as unknown as Record<string,any>;
 if(input.observation?.id!=='o1'||input.observation?.image!=='current'||input.goal!==recoveryDefinition(record.fixture).goal)return null;
 const assets=Object.fromEntries(Object.entries(stage.assetFiles).map(([id,a])=>[id,a.sha256]));
 if(!Object.values(assets).every(hash)||assets.current!==step.assetFiles?.current?.sha256)return null;
 try{const current=input.userState?.lastObservation;if(!current||!step.vision||!step.audit) return null;const candidates=offeredCandidates(filterCandidates(candidatesFor(step.audit.screen,Object.hasOwn(stage.questions,'effect_back')),step.audit.screen,record.result!.input.charter),{...step.vision,bytes:Buffer.alloc(0)},record.result!.config);const expectedRelations=actionRelationQuestions(input.goal,current,candidates,[{observationId:current.id,imageSha256:assets.current}],record.result!.config.actionRelations?.evidencePolicy);return {product:record.initialImageSha256,goal:input.goal,input:stage.modelInput,assets,questions:stage.questions,expectedRelations,state:step.audit.recovery??null};}catch{return null;}
}
/** Questions intentionally differ; full first input and actually delivered images must match. */
function comparePair(records:VisualConditionsRunRecord[],slot:RecoverySlot){
 const groups=visualConditionsActors.map(actor=>records.filter(r=>r.actor===actor&&slotKey(r)===slotKey(slot))),pair=groups.map(g=>g.length===1?g[0]:undefined),evidence=pair.map(r=>r?initialEvidence(r):null),reasons:string[]=[];
 if(groups.some(g=>g.length===0))reasons.push('MISSING_ACTOR_TRIAL');if(groups.some(g=>g.length>1))reasons.push('DUPLICATE_ACTOR_SLOT');
 const cleanInput=(input:any)=>{const copy=structuredClone(input);delete copy.visualHypotheses;if(copy.userState)delete copy.userState.visualHypotheses;return copy;};
 const baseQuestions=(q:Record<string,any>)=>Object.fromEntries(Object.entries(q).filter(([key])=>!key.startsWith('actionRelation_')));
 if(pair.every(Boolean)){
  if(evidence.some(x=>!x))reasons.push('MISSING_OR_MALFORMED_INITIAL_EVIDENCE');
  else{const [a,b,c]=evidence as NonNullable<ReturnType<typeof initialEvidence>>[];
   for(const item of [a,b,c])if(!isDeepStrictEqual(Object.fromEntries(Object.entries(item.questions).filter(([key])=>key.startsWith('actionRelation_'))),item.expectedRelations))reasons.push('ACTION_RELATION_QUESTION_CONTRACT_MISMATCH');
   for(const next of [b,c]){for(const field of ['product','goal','assets','state'] as const)if(a[field]===null||!isDeepStrictEqual(a[field],next[field]))reasons.push('INITIAL_'+field.toUpperCase()+'_MISMATCH');if(!isDeepStrictEqual(cleanInput(a.input),cleanInput(next.input)))reasons.push('UNDECLARED_INITIAL_INPUT_CHANGE');if(!isDeepStrictEqual(baseQuestions(a.questions),baseQuestions(next.questions)))reasons.push('UNDECLARED_ASSESSMENT_QUESTION_CHANGE');}
   if(!isDeepStrictEqual(b.questions,c.questions))reasons.push('CURRENT_AND_VISUAL_QUESTION_MISMATCH');
   if(isDeepStrictEqual(a.expectedRelations,b.expectedRelations))reasons.push('DECLARED_CURRENT_POLICY_DIFFERENCE_MISSING');
   if(a.input.visualHypotheses!==undefined||b.input.visualHypotheses!==undefined||c.input.visualHypotheses===undefined)reasons.push('DECLARED_VISUAL_INPUT_DIFFERENCE_MISSING');
  }
 }
 return {slot:slotKey(slot),ids:pair.map(r=>r?.runId??null),bothPresent:pair.every(Boolean),initialEvidenceAvailable:evidence.every(Boolean),matchedInitialEvidence:reasons.length===0,reasons};
}

function measurements(record:VisualConditionsRunRecord,mock:boolean){
 const chargedRequests=nonnegative(record.requests)?record.requests:0;
 const stages:Record<string,any>[]=[];
 for(const step of record.result?.steps??[]){
  if(step.visualHypotheses)stages.push(step.visualHypotheses);
  if(step.deliberation)stages.push(step.deliberation);
  const mirrored=!step.response&&[step.visualHypotheses,step.deliberation].some(stage=>stage?.error!==undefined&&isDeepStrictEqual(stage.error,step.error));
  if(!mirrored)stages.push(step);
 }
 if(!stages.some(s=>s.response||s.error))stages.push({error:record.error});
 const responses=stages.filter(s=>object(s.response)&&typeof s.response.model==='string'&&(object(s.response.answers)||s.response.request?.httpReceived===true)).map(s=>s.response);
 let knownHTTPAttempts=0,httpAttemptEvidenceRequests=0,reached=false;
 if(!mock)for(const stage of stages){
  const response=stage.response,error=stage.error,trace=object(response?.request)?response.request:object(error?.request)?error.request:object(error)?error:null;
  if(trace&&Number.isSafeInteger(trace.attempts)&&trace.attempts>=0){knownHTTPAttempts+=trace.attempts;httpAttemptEvidenceRequests++;}
  reached||=trace?.httpReceived===true||object(response)&&typeof response.model==='string'&&(object(response.answers)||response.request?.httpReceived===true)||[error,error?.failure,...(Array.isArray(trace?.failures)?trace.failures:[])].some(v=>object(v)&&Number.isInteger(v.statusCode)&&v.statusCode>=400&&v.statusCode<=599);
 }
 const complete=httpAttemptEvidenceRequests>=chargedRequests;
 const explicitNoHTTP=mock||!reached&&knownHTTPAttempts===0&&(chargedRequests===0||record.result?.apiCalls===0||httpAttemptEvidenceRequests>0&&complete);
 const returnedModels:Record<string,number>={};for(const response of responses)returnedModels[response.model]=(returnedModels[response.model]??0)+1;
 return {runId:record.runId,chargedRequests,knownHTTPAttempts,httpAttemptEvidenceRequests,httpAttemptCountsComplete:mock||complete,requestAttempted:mock?false:reached||knownHTTPAttempts>0?true:explicitNoHTTP?false:null,apiReached:mock?false:reached?true:explicitNoHTTP?false:null,recordedResponses:responses.length,returnedModels,apiMs:nonnegative(record.result?.apiMs)?record.result!.apiMs:null,costUSD:responses.length===chargedRequests&&responses.every(r=>nonnegative(r.costUSD))?responses.reduce((n,r)=>n+r.costUSD,0):null,humanTimeMs:null};
}
/** Offline analysis preserves planned denominators and objective/audit distinctions per actor. */
export function analyzeVisualConditionsComparison(records:VisualConditionsRunRecord[],options:{mock?:boolean}={}){
 const errors:{code:string;ids:string[]}[]=[],mock=options.mock===true;
 const runIds=new Map<string,number>();for(const r of records)runIds.set(r.runId,(runIds.get(r.runId)??0)+1);
 const measured=records.map(r=>measurements(r,mock));
 const safe=records.map((record,index)=>{
  const reasons:string[]=[];
  if(!visualConditionsActors.includes(record.actor))reasons.push('UNKNOWN_ACTOR');
  if((runIds.get(record.runId)??0)>1)reasons.push('DUPLICATE_ACTUAL_RUN_ID');
  if(Object.keys(measured[index].returnedModels).some(model=>!((mock?['MOCK_SCRIPTED_FIXTURE',...(record.actor==='experience-visual-conditions'?['gpt-6-luna']:[])]:['jev-1.14.0',...(record.actor==='experience-visual-conditions'?['gpt-6-luna']:[])]).includes(model))))reasons.push('MODEL_MISMATCH');
  for(const code of reasons)errors.push({code,ids:[record.runId]});
  return reasons.length?{...record,error:{code:reasons[0]}}:record;
 });
 const actors=Object.fromEntries(visualConditionsActors.map(actor=>{
  const actorRecords=safe.filter(r=>r.actor===actor);
  const summary=analyzeRecoveryRuns(actorRecords,{mode:actor,replicates:1});
  const items=measured.filter((_,i)=>records[i].actor===actor),models:Record<string,number>={};
  for(const item of items)for(const [model,count]of Object.entries(item.returnedModels))models[model]=(models[model]??0)+count;
  return [actor,{...summary,measurements:{chargedRequests:items.reduce((n,r)=>n+r.chargedRequests,0),knownHTTPAttempts:items.reduce((n,r)=>n+r.knownHTTPAttempts,0),httpAttemptEvidenceRequests:items.reduce((n,r)=>n+r.httpAttemptEvidenceRequests,0),httpAttemptCountsComplete:items.every(r=>r.httpAttemptCountsComplete),requestAttemptedRuns:items.filter(r=>r.requestAttempted===true).length,unknownAttemptRuns:items.filter(r=>r.requestAttempted===null).length,apiReachedRuns:items.filter(r=>r.apiReached===true).length,unknownReachRuns:items.filter(r=>r.apiReached===null).length,recordedResponses:items.reduce((n,r)=>n+r.recordedResponses,0),returnedModels:models,apiMs:items.some(r=>r.apiMs===null)?null:items.reduce((n,r)=>n+r.apiMs!,0),costUSD:items.some(r=>r.costUSD===null)?null:items.reduce((n,r)=>n+r.costUSD!,0),humanTimeMs:null},requestEvidence:items}];
 })) as unknown as Record<VisualConditionsActor,ReturnType<typeof analyzeRecoveryRuns>&{measurements:Record<string,any>;requestEvidence:ReturnType<typeof measurements>[]} >;
 const pairs=recoverySchedule().filter(slot=>slot.replicate===1).map(slot=>comparePair(records,slot));
 for(const pair of pairs.filter(p=>p.bothPresent))for(const code of pair.reasons)errors.push({code,ids:pair.ids.filter((x):x is string=>x!==null)});
 for(const actor of visualConditionsActors)errors.push(...actors[actor].integrity.errors);
 const identities=records.flatMap(r=>r.result?[r.result.code]:[]);if(identities.some(code=>!isDeepStrictEqual(code,identities[0])))errors.push({code:'SOURCE_MISMATCH',ids:records.map(r=>r.runId)});
 const planned=visualConditionsSchedule(),notAttempted=planned.filter(slot=>!records.some(r=>r.actor===slot.actor&&slotKey(r)===slotKey(slot))).length;
 return {schemaVersion:1,kind:mock?'mock-visual-conditions-comparison-not-model-evidence':'offline-visual-conditions-comparison-descriptive',completeness:{planned:18,attempted:records.length,notAttempted,valid:visualConditionsActors.reduce((n,a)=>n+actors[a].totals.valid,0),withResult:records.filter(r=>r.result).length,plannedPairs:6,matchedInitialPairs:pairs.filter(p=>p.matchedInitialEvidence).length,complete:records.length===18&&notAttempted===0&&visualConditionsActors.every(a=>actors[a].completeness.complete)},integrity:{ok:errors.length===0,errors},actors,pairs,limitations:['Three explicit actors: old role judgments, current-candidate evidence repair, and repaired actor plus native Responses visual-condition extraction. Initial product, goal, admitted base input and images match; declared extraction memory/input and candidate evidence questions intentionally differ.','The model supplies fallible categorical hypotheses, not verified UI semantics. An evidence reference does not establish that the hypothesis is correct.','One trial per actor/task/condition; no reproducibility, broad stability, human fidelity or causal claim. Later trajectories differ.','Charged reservations do not prove HTTP attempts or service receipt. API time and human time remain separate.','Mock results verify integration only and are never real-model performance evidence.']};
}
async function assertNewOutput(out:string){try{await lstat(out);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return;throw error;}throw Object.assign(Error('OUTPUT_ALREADY_EXISTS'),{code:'EEXIST'});}
type Prior={count:number;files:{path:string;sha256:string}[];sha256:string};
async function loadPrior(file:string):Promise<Prior>{
 const bytes=await readFile(file),data=JSON.parse(bytes.toString('utf8'));
 if(!Number.isInteger(data.count)||data.count<1||!Array.isArray(data.files)||data.files.length!==data.count||new Set(data.files.map((f:any)=>f.path)).size!==data.count)throw Error('INVALID_PRIOR_SNAPSHOT');
 for(const f of data.files){const rel=typeof f.path==='string'?relative(resolve('reports'),f.path):'..';if(!isAbsolute(f.path)||isAbsolute(rel)||rel==='..'||rel.startsWith('../')||rel.startsWith('..\\')||/(^|[\\/])(?:\.env(?:\.|$)|credentials(?:\.|$))/i.test(f.path)||!hash(f.sha256))throw Error('UNSAFE_PRIOR_PATH');}
 return {...data,sha256:sha(bytes)};
}
async function preserve(prior:Prior){const changed:string[]=[];for(const f of prior.files){try{if(sha(await readFile(f.path))!==f.sha256)changed.push(f.path);}catch{changed.push(f.path);}}return {unchanged:changed.length===0,checked:prior.files.length,changed};}
function safeError(error:unknown){const code=(error as {code?:unknown}|null)?.code;if(code==='BUDGET_ADMISSION_ERROR'||code==='BUDGET_SETTLEMENT_AFTER_REQUEST')return {code};const failure=safeRequestFailure(error);return {code:failure.code,...(failure.statusCode?{statusCode:failure.statusCode}:{})};}

export async function runVisualConditionsComparison(options:VisualConditionsOptions){
 validateVisualConditionsOptions(options);const out=resolve(options.out);await assertNewOutput(out);
 const protocolBytes=await readFile(protocolFile),protocol=JSON.parse(protocolBytes.toString('utf8'));
 if(!isDeepStrictEqual(protocol.limits,visualConditionsLimits)||!isDeepStrictEqual(protocol.actors,visualConditionsActors)||protocol.provider!=='jev'||protocol.model!=='jev-1.14.0'||protocol.imageReferencePolicy!=='opaque-v1'||protocol.actorOrderOffset!==visualConditionsActorOrderOffset||protocol.schemaContract!=='evidence-conditional-v1'||protocol.persona!==null||protocol.repeats!==1||protocol.actorChangesAllowed!==false||!isDeepStrictEqual(protocol.extractor,{model:'gpt-6-luna',endpoint:'https://api.openai.com/v1/responses',maxAttemptsPerRequest:1}))throw Error('PROTOCOL_MISMATCH');
 const prior=await loadPrior(options.priorSnapshot),before=await preserve(prior);if(!before.unchanged)throw Error('ORIGINAL_CHANGED_BEFORE_BATCH');
 if(!options.mock){process.loadEnvFile(options.envFile!);if(!process.env.AI_GATEWAY_API_KEY)throw Error('MISSING_JEV_CREDENTIAL');if(!process.env.OPENAI_API_KEY)throw Error('MISSING_OPENAI_CREDENTIAL');}
 const code=await sourceIdentity(),profiles=Object.fromEntries(visualConditionsActors.map(actor=>[actor,humanJevProfile(actor)])) as Record<VisualConditionsActor,ReturnType<typeof humanJevProfile>>;
 const charterSha256=sha(await readFile('experiments/persona/charter.json')),batchId=randomUUID(),started=Date.now(),deadlineEpochMs=started+visualConditionsLimits.phaseMs,schedule=visualConditionsSchedule(),records:VisualConditionsRunRecord[]=[];
 const manifest:any={schemaVersion:1,phase:'visual-conditions-2026-10-30',batchId,mock:options.mock,...code,provider:'jev',model:options.mock?'MOCK_SCRIPTED_FIXTURE':'jev-1.14.0',protocol:{file:protocolFile,sha256:sha(protocolBytes)},charterSha256,method:{extractor:protocol.extractor,actors:visualConditionsActors,profiles,persona:null,longContext:true,maxAttemptsPerRequest:1,imageReferencePolicy:'opaque-v1',actorOrderOffset:visualConditionsActorOrderOffset,schemaContract:'evidence-conditional-v1'},configSha256:Object.fromEntries(visualConditionsActors.map(a=>[a,sha(JSON.stringify(profiles[a].config))])),schedule,executionTrialLimit:options.limit??18,limits:visualConditionsLimits,initialState:protocol.initialState,humanInputsRead:false,startedAtUTC:new Date(started).toISOString(),deadlineEpochMs,priorSnapshot:options.priorSnapshot,priorSnapshotSha256:prior.sha256,preservationBefore:before,preservationAfter:null,records,totalRequests:0,status:'RUNNING',error:null};
 const assertFrozen=async()=>{
  if(!isDeepStrictEqual(await sourceIdentity(),code)||sha(await readFile(protocolFile))!==sha(protocolBytes)||sha(await readFile('experiments/persona/charter.json'))!==charterSha256||visualConditionsActors.some(actor=>!isDeepStrictEqual(humanJevProfile(actor),profiles[actor]))||sha(await readFile(options.priorSnapshot))!==prior.sha256)throw Error('FROZEN_SOURCE_OR_PROTOCOL_CHANGED');
  if(!(await preserve(prior)).unchanged)throw Error('ORIGINAL_CHANGED_DURING_BATCH');
 };
 await mkdir(dirname(out),{recursive:true});await mkdir(out);
 const save=async()=>{manifest.totalRequests=records.reduce((n,r)=>n+r.requests,0);await writeFile(join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');await writeFile(join(out,'summary.json'),JSON.stringify(analyzeVisualConditionsComparison(records,{mock:options.mock}),null,2)+'\n');};
 await writeFile(join(out,'frozen-source.json'),JSON.stringify({code,protocol:manifest.protocol,profiles,charterSha256},null,2));await save();let consecutiveInfrastructure=0;
 try{
  for(const slot of schedule.slice(0,options.limit??18)){
   if(Date.now()>=deadlineEpochMs){manifest.status='PHASE_TIME_LIMIT';break;}
   if(manifest.totalRequests+profiles[slot.actor].maximumRequests>visualConditionsLimits.maxRequests){manifest.status='BATCH_REQUEST_LIMIT';break;}
   await assertFrozen();
   const dir=join(out,slot.id+'-'+slot.actor),ledger=options.mock?null:dir+'-budget.json';
   const record:VisualConditionsRunRecord={...slot,runId:batchId+'-'+slot.id+'-'+slot.actor,status:'ATTEMPTING',dir,ledger,resultPath:join(dir,'exploration/result.json'),requests:0,initialImageSha256:null};records.push(record);await save();let fatal:unknown;
   try{
    if(ledger)await writeFile(ledger,JSON.stringify({schemaVersion:1,status:'APPROVED',phase:'action-relations-'+slot.actor+'-'+slot.id,newMaximum:profiles[slot.actor].maximumRequests,perRunMaximum:12,used:0,attempts:[]},null,2)+'\n',{flag:'wx'});
    const saved=await runHumanJev({out:dir,mock:options.mock,mode:slot.actor,longContext:true,recoveryFixture:slot.fixture,runId:record.runId,decisionBackend:'jev',deadlineEpochMs:Math.min(deadlineEpochMs,Date.now()+visualConditionsLimits.maxRunMsPerTrial),...(!options.mock?{phaseBudget:ledger!}:{})});
    record.result=saved.result;record.status='RESULT';const result=saved.result;record.requests=options.mock?0:result.apiCalls;
    if(!options.mock&&!isDeepStrictEqual(result.transport,{jevImageReferences:'opaque-v1'}))throw Error('TRIAL_FROZEN_IDENTITY_MISMATCH');
    if(!isDeepStrictEqual(result.config,profiles[slot.actor].config)||result.input.persona!==undefined&&result.input.persona!==null||result.runId!==record.runId||!isDeepStrictEqual(result.code,{revision:code.revision,sourceHash:code.sourceHash})||!isDeepStrictEqual(result.recovery?.fixture,record.fixture))throw Error('TRIAL_FROZEN_IDENTITY_MISMATCH');
    if(result.apiCalls>profiles[slot.actor].maximumRequests||result.decisions>12||result.uiActions>15||result.looks>3)throw Error('TRIAL_CAP_EXCEEDED');
    record.initialImageSha256=sha(await readFile(join(dir,'exploration/initial-product.png')));
    if(record.initialImageSha256!==result.recovery!.initialProductImage.sha256||record.initialImageSha256!==sha(await readFile(join(dir,'initial-product.png'))))throw Error('INITIAL_PRODUCT_MISMATCH');
    try{const replay=await replayDirectory(join(dir,'exploration'));await writeFile(join(dir,'offline-replay.json'),JSON.stringify(replay,null,2));record.replay={status:'OK'};}catch{record.replay={status:'ERROR',code:'OFFLINE_REPLAY_FAILED'};throw Error('OFFLINE_REPLAY_FAILED');}
    record.frameChecks=await verifyTransferFrames(result,join(dir,'exploration'));await writeFile(join(dir,'delivered-current-frames.json'),JSON.stringify(record.frameChecks,null,2));
   }catch(error){
    record.error=safeError(error);
    if(!record.result){record.status='FAILED';try{const result=JSON.parse(await readFile(record.resultPath,'utf8'));if(result.schemaVersion===1&&result.runId===record.runId&&Array.isArray(result.steps)){record.result=result;record.requests=options.mock?0:result.apiCalls;record.initialImageSha256=result.recovery?.initialProductImage?.sha256??null;}}catch{/* Missing/invalid partial results remain attempted failures. */}}
    if(error instanceof Error&&['TRIAL_FROZEN_IDENTITY_MISMATCH','TRIAL_CAP_EXCEEDED','INITIAL_PRODUCT_MISMATCH','OFFLINE_REPLAY_FAILED'].includes(error.message))fatal=error;
   }finally{
    if(ledger)try{const evidence=await readTransferLedger(ledger,profiles[slot.actor].maximumRequests as 24|36);record.requests=Math.max(record.requests,evidence.used);record.ledgerEvidence=evidence;}catch(error){record.error={code:'LEDGER_ACCOUNTING_UNAVAILABLE'};fatal=error;}
    await save();
   }
   await assertFrozen();
   const stop=visualConditionsStopReason(record);if(stop){manifest.status=stop;break;}
   if(fatal)throw fatal;
   if(manifest.totalRequests>visualConditionsLimits.maxRequests)throw Error('BATCH_REQUEST_LIMIT_EXCEEDED');
   const pair=comparePair(records,slot);if(pair.bothPresent&&pair.initialEvidenceAvailable&&!pair.matchedInitialEvidence){manifest.status='PAIR_INITIAL_EVIDENCE_MISMATCH';break;}
   console.log(JSON.stringify({slotId:slot.id,actor:slot.actor,attempted:records.length,planned:18,requests:record.requests,totalRequests:manifest.totalRequests,objective:record.result?.objectiveAssessment.value,termination:record.result?.termination,error:record.error??null}));
   consecutiveInfrastructure=transferFailureCategories(record).infrastructure?consecutiveInfrastructure+1:0;
   if(consecutiveInfrastructure>=2){manifest.status='CONSECUTIVE_INFRASTRUCTURE_FAILURES';break;}
  }
  if(manifest.status==='RUNNING')manifest.status=records.length===18&&records.every(r=>r.status==='RESULT')?'COMPLETED':'INCOMPLETE';
 }catch(error){manifest.status='BATCH_ERROR';manifest.error=safeError(error);throw error;}
 finally{manifest.preservationAfter=await preserve(prior);if(!manifest.preservationAfter.unchanged){manifest.status='BATCH_ERROR';manifest.error={code:'ORIGINAL_CHANGED_DURING_BATCH'};}await save();if(!manifest.preservationAfter.unchanged)throw Error('ORIGINAL_CHANGED_DURING_BATCH');}
 return {root:out,status:manifest.status,trials:records.length,requests:manifest.totalRequests};
}
async function main(){
 const options:any={mock:false},args=process.argv.slice(2),names:Record<string,string>={'--out':'out','--env-file':'envFile','--prior-snapshot':'priorSnapshot','--limit':'limit'};
 for(let i=0;i<args.length;i++){const key=args[i];if(key==='--mock'){options.mock=true;continue;}if(!names[key]||!args[i+1]||args[i+1].startsWith('--'))throw Error('INVALID_OPTION');options[names[key]]=key==='--limit'?Number(args[++i]):args[++i];}
 console.log(JSON.stringify(await runVisualConditionsComparison(options)));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{await main();}catch{console.error(JSON.stringify({status:'ERROR',code:'VISUAL_CONDITIONS_BATCH_FAILED_CHECK_MANIFEST'}));process.exitCode=1;}}
