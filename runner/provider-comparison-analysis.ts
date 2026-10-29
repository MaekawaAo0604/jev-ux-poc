import {isDeepStrictEqual} from 'node:util';
import {recoveryDefinition,recoveryFixtures} from '../app/recovery-fixture.js';
import {humanJevProfile} from './human-jev-profiles.js';
import {analyzeRecoveryRuns} from './recovery-analysis.js';
import type {RecoveryRunRecord} from './recovery-contracts.js';

export type DecisionProvider='jev'|'openai-decisions';
export type ProviderRunRecord=RecoveryRunRecord&{provider:DecisionProvider};
type ComparisonOptions={mock?:boolean};
type IntegrityError={code:string;ids:string[];provider?:DecisionProvider;slot?:string};
type UnknownObject=Record<string,unknown>;
const providers:DecisionProvider[]=['jev','openai-decisions'];
const expectedModels:Record<DecisionProvider,string>={jev:'jev-1.14.0','openai-decisions':'gpt-6-luna'};
const object=(value:unknown):value is UnknownObject=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
const slotKey=(record:Pick<RecoveryRunRecord,'fixture'|'replicate'>)=>record.fixture.task+'/'+record.fixture.condition+'/r'+record.replicate;
const unique=(values:string[])=>[...new Set(values)];
const imageHash=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const profile=humanJevProfile('experience-goal-search-grounded');

function resultObject(record:ProviderRunRecord):UnknownObject|null {
 return object(record.result)?record.result as unknown as UnknownObject:null;
}
function firstStep(record:ProviderRunRecord):UnknownObject|null {
 const steps=resultObject(record)?.steps;
 return Array.isArray(steps)&&object(steps[0])?steps[0]:null;
}
/** Artifact locations are intentionally omitted: parity concerns delivered content. */
function assetHashes(value:unknown):Record<string,string>|null {
 if(!object(value)||!object(value.current)||!imageHash(value.current.sha256))return null;
 const hashes:Record<string,string>={};
 for(const [name,asset] of Object.entries(value)){
  if(!object(asset)||!imageHash(asset.sha256))return null;
  hashes[name]=asset.sha256;
 }
 return hashes;
}
function requestEvidence(stage:unknown) {
 if(!object(stage)||!object(stage.modelInput)||!object(stage.questions))return null;
 const observation=stage.modelInput.observation;
 if(typeof stage.modelInput.goal!=='string'||!object(observation)||observation.id!=='o1'||observation.image!=='current')return null;
 const assets=assetHashes(stage.assetFiles),questions=Object.values(stage.questions);
 const validQuestions=questions.length>0&&questions.every(question=>
  object(question)&&question.type==='choice'&&typeof question.instructions==='string'&&
  object(question.criteria)&&Object.keys(question.criteria).length>0&&Object.values(question.criteria).every(value=>typeof value==='string')
 );
 if(!assets||!validQuestions)return null;
 return {modelInput:stage.modelInput,questions:stage.questions,assets};
}
function responses(record:ProviderRunRecord) {
 const steps=resultObject(record)?.steps;
 if(!Array.isArray(steps))return [];
 return steps.flatMap(step=>{
  if(!object(step))return [];
  const stages=[...(object(step.deliberation)?[step.deliberation]:[]),step];
  return stages.flatMap(stage=>object(stage.response)?[{response:stage.response,error:stage.error??null}]:[]);
 });
}
function httpEvidence(record:ProviderRunRecord,mock:boolean,chargedRequests:number) {
 if(mock)return {knownHTTPAttempts:0,httpAttemptEvidenceRequests:0,httpAttemptCountsComplete:true,requestAttempted:false,apiReached:false};
 const attemptCount=(value:unknown):number|null=>{
  if(!object(value))return null;
  const trace=object(value.request)?value.request:value;
  return Number.isSafeInteger(trace.attempts)&&Number(trace.attempts)>=0?Number(trace.attempts):null;
 };
 const httpStatus=(value:unknown):boolean=>{
  if(!object(value))return false;
  const status=(item:unknown)=>object(item)&&Number.isInteger(item.statusCode)&&Number(item.statusCode)>=400&&Number(item.statusCode)<=599;
  const trace=object(value.request)?value.request:value;
  return status(value)||status(value.failure)||(Array.isArray(trace.failures)&&trace.failures.some(status));
 };
 const stages:{response:unknown;error:unknown}[]=[];
 const steps=resultObject(record)?.steps;
 if(Array.isArray(steps))for(const step of steps){
  if(!object(step))continue;
  const assessment=object(step.deliberation)?step.deliberation:null;
  if(assessment)stages.push({response:assessment.response,error:assessment.error});
  // The runner mirrors an assessment failure onto step.error; this is one request.
  const mirrored=assessment&&!object(step.response)&&assessment.error!==undefined&&isDeepStrictEqual(step.error,assessment.error);
  if(!mirrored)stages.push({response:step.response,error:step.error});
 }
 const stageHasEvidence=(stage:{response:unknown;error:unknown})=>
  attemptCount(stage.response)!==null||attemptCount(stage.error)!==null||httpStatus(stage.error)||
  object(stage.response)&&typeof stage.response.model==='string'&&object(stage.response.answers);
 // Wrapper error evidence can survive a missing result, but must not count a step twice.
 if(!stages.some(stageHasEvidence))stages.push({response:undefined,error:record.error});
 let knownHTTPAttempts=0,httpAttemptEvidenceRequests=0,reached=false;
 for(const stage of stages){
  const attempts=attemptCount(stage.response)??attemptCount(stage.error);
  if(attempts!==null){knownHTTPAttempts+=attempts;httpAttemptEvidenceRequests++;}
  const safeResponse=object(stage.response)&&typeof stage.response.model==='string'&&stage.response.model.length>0&&object(stage.response.answers);
  reached||=safeResponse||httpStatus(stage.response)||httpStatus(stage.error);
 }
 const httpAttemptCountsComplete=httpAttemptEvidenceRequests>=chargedRequests;
 const explicitlyNoHTTP=!reached&&knownHTTPAttempts===0&&(
  chargedRequests===0||resultObject(record)?.apiCalls===0||
  httpAttemptEvidenceRequests>0&&httpAttemptCountsComplete
 );
 const requestAttempted:boolean|null=reached||knownHTTPAttempts>0?true:explicitlyNoHTTP?false:null;
 // A sent request may time out before the service receives it.
 const apiReached:boolean|null=reached?true:explicitlyNoHTTP?false:null;
 return {knownHTTPAttempts,httpAttemptEvidenceRequests,httpAttemptCountsComplete,requestAttempted,apiReached};
}

function runMeasurements(record:ProviderRunRecord,mock:boolean) {
 const returned=responses(record),models:Record<string,number>={};
 for(const {response} of returned){
  if(typeof response.model==='string')models[response.model]=(models[response.model]??0)+1;
 }
 const requests=finite(record.requests)?record.requests:0;
 const knownInputTokens=returned.reduce((sum,{response})=>sum+(object(response.usage)&&finite(response.usage.inputTokens)?response.usage.inputTokens:0),0);
 const knownOutputTokens=returned.reduce((sum,{response})=>sum+(object(response.usage)&&finite(response.usage.outputTokens)?response.usage.outputTokens:0),0);
 const knownCostUSD=returned.reduce((sum,{response})=>sum+(finite(response.costUSD)?response.costUSD:0),0);
 const coverage=returned.length===requests;
 const inputComplete=coverage&&returned.every(({response})=>object(response.usage)&&finite(response.usage.inputTokens));
 const outputComplete=coverage&&returned.every(({response})=>object(response.usage)&&finite(response.usage.outputTokens));
 const costComplete=coverage&&returned.every(({response})=>finite(response.costUSD));
 const rawAPI=resultObject(record)?.apiMs;
 return {
  runId:record.runId,requests,chargedRequests:requests,...httpEvidence(record,mock,requests),
  successfulResponse:returned.some(({response,error})=>!error&&typeof response.model==='string'&&object(response.answers)),
  recordedResponses:returned.length,returnedModels:models,
  inputTokens:inputComplete?knownInputTokens:null,outputTokens:outputComplete?knownOutputTokens:null,
  knownInputTokens,knownOutputTokens,costUSD:costComplete?knownCostUSD:null,knownCostUSD,
  apiMs:finite(rawAPI)?rawAPI:requests===0?0:null,humanTimeMs:null
 };
}
function sumMeasurements(items:ReturnType<typeof runMeasurements>[]) {
 const sum=(field:'requests'|'chargedRequests'|'knownHTTPAttempts'|'httpAttemptEvidenceRequests'|'knownInputTokens'|'knownOutputTokens'|'knownCostUSD')=>items.reduce((total,item)=>total+item[field],0);
 const nullable=(field:'apiMs'|'inputTokens'|'outputTokens'|'costUSD')=>items.some(item=>item[field]===null)?null:items.reduce((total,item)=>total+item[field]!,0);
 const returnedModels:Record<string,number>={};
 for(const item of items)for(const [model,count] of Object.entries(item.returnedModels))returnedModels[model]=(returnedModels[model]??0)+count;
 return {requests:sum('requests'),chargedRequests:sum('chargedRequests'),knownHTTPAttempts:sum('knownHTTPAttempts'),
  httpAttemptEvidenceRequests:sum('httpAttemptEvidenceRequests'),httpAttemptCountsComplete:items.every(item=>item.httpAttemptCountsComplete),
  requestAttemptedRuns:items.filter(item=>item.requestAttempted===true).length,unknownAttemptRuns:items.filter(item=>item.requestAttempted===null).length,
  apiReachedRuns:items.filter(item=>item.apiReached===true).length,unknownReachRuns:items.filter(item=>item.apiReached===null).length,successfulResponseRuns:items.filter(item=>item.successfulResponse).length,recordedResponses:items.reduce((total,item)=>total+item.recordedResponses,0),returnedModels,
  inputTokens:nullable('inputTokens'),outputTokens:nullable('outputTokens'),knownInputTokens:sum('knownInputTokens'),knownOutputTokens:sum('knownOutputTokens'),
  costUSD:nullable('costUSD'),knownCostUSD:sum('knownCostUSD'),apiMs:nullable('apiMs'),humanTimeMs:null};
}
function sanitizeRecord(record:ProviderRunRecord,errors:IntegrityError[]):ProviderRunRecord {
 try {
  // Existing recovery analysis remains authoritative for run-level validity and all denominators.
  analyzeRecoveryRuns([record]);
  return record;
 } catch {
  errors.push({code:'MALFORMED_RESULT',ids:[record.id],provider:record.provider});
  return {...record,result:undefined,status:'FAILED',error:{code:'MALFORMED_RESULT'}};
 }
}
function equalKnown(a:unknown,b:unknown) {return a!==undefined&&a!==null&&b!==undefined&&b!==null&&isDeepStrictEqual(a,b);}

/** Offline 2 x 3 x 2 descriptive comparison. No model calls or artifact IO. */
export function analyzeProviderComparison(records:ProviderRunRecord[],options:ComparisonOptions={}) {
 const mock=options.mock===true,errors:IntegrityError[]=[];
 const measurements=records.map(record=>runMeasurements(record,mock));
 const perRecordErrors=records.map(()=>[] as string[]);
 records.forEach((record,index)=>{
  if(!providers.includes(record.provider)){
   errors.push({code:'UNKNOWN_PROVIDER',ids:[record.id]});perRecordErrors[index].push('UNKNOWN_PROVIDER');
  }
  const expected=mock?'MOCK_SCRIPTED_FIXTURE':expectedModels[record.provider];
  if(Object.keys(measurements[index].returnedModels).some(model=>model!==expected)){
   errors.push({code:'MODEL_MISMATCH',ids:[record.id],provider:record.provider});perRecordErrors[index].push('MODEL_MISMATCH');
  }
 });
 const runIds=new Map<string,number[]>();
 records.forEach((record,index)=>runIds.set(record.runId,[...(runIds.get(record.runId)??[]),index]));
 for(const indexes of runIds.values())if(indexes.length>1){
  errors.push({code:'DUPLICATE_ACTUAL_RUN_ID',ids:indexes.map(index=>records[index].id)});
  for(const index of indexes)perRecordErrors[index].push('DUPLICATE_ACTUAL_RUN_ID');
 }
 const safeRecords=records.map((record,index)=>{
  const safe=sanitizeRecord(record,errors);
  return perRecordErrors[index].length?{...safe,error:{code:perRecordErrors[index][0]}}:safe;
 });
 const byProvider=Object.fromEntries(providers.map(provider=>{
  const providerRecords=safeRecords.filter(record=>record.provider===provider);
  const summary=analyzeRecoveryRuns(providerRecords);
  for(const error of summary.integrity.errors)errors.push({...error,provider});
  return [provider,{...summary,measurements:sumMeasurements(measurements.filter((_,index)=>records[index].provider===provider))}];
 })) as Record<DecisionProvider,ReturnType<typeof analyzeRecoveryRuns>&{measurements:ReturnType<typeof sumMeasurements>}>;
 const sourceIdentities=records.flatMap(record=>{const code=resultObject(record)?.code;return object(code)?[code]:[];});
 if(sourceIdentities.some(code=>!isDeepStrictEqual(code,sourceIdentities[0])))errors.push({code:'SOURCE_MISMATCH',ids:records.filter(record=>resultObject(record)?.code).map(record=>record.id)});
 const planned=recoveryFixtures().flatMap(fixture=>[1,2].map(replicate=>({fixture,replicate})));
 const pairs=planned.map(slot=>{
  const key=slotKey(slot),indexes=providers.map(provider=>records.flatMap((record,index)=>record.provider===provider&&isDeepStrictEqual(record.fixture,slot.fixture)&&record.replicate===slot.replicate?[index]:[]));
  const left=indexes[0].length===1?records[indexes[0][0]]:undefined,right=indexes[1].length===1?records[indexes[1][0]]:undefined;
  const reasons:string[]=[];
  const providerEvidence=Object.fromEntries(providers.map((provider,index)=>[provider,indexes[index].length===1?measurements[indexes[index][0]]:null])) as Record<DecisionProvider,ReturnType<typeof runMeasurements>|null>;
  if(indexes.some(items=>items.length>1))reasons.push('DUPLICATE_PROVIDER_SLOT');
  const bothPresent=indexes.every(items=>items.length>0);
  let firstAction:{sameModelInput:boolean|null;sameQuestions:boolean|null;sameAssets:boolean|null}={sameModelInput:null,sameQuestions:null,sameAssets:null};
  if(left&&right){
   const a=left.result,b=right.result;
   const check=(condition:boolean,code:string)=>{if(!condition)reasons.push(code);};
   check(left.id===right.id,'SLOT_ID_MISMATCH');
   check(imageHash(left.initialImageSha256)&&imageHash(right.initialImageSha256)&&equalKnown(left.initialImageSha256,right.initialImageSha256),'INITIAL_PRODUCT_IMAGE_MISMATCH');
   check(!!a&&!!b,'MISSING_RESULT');
   if(a&&b){
    check(equalKnown(a.recovery?.initialProductImage?.sha256,b.recovery?.initialProductImage?.sha256)&&a.recovery?.initialProductImage?.sha256===left.initialImageSha256&&b.recovery?.initialProductImage?.sha256===right.initialImageSha256,'INITIAL_PRODUCT_IMAGE_MISMATCH');
    check(equalKnown(a.code,b.code),'SOURCE_MISMATCH');
    check(isDeepStrictEqual(a.config,profile.config)&&isDeepStrictEqual(b.config,profile.config)&&a.condition===profile.config.id&&b.condition===profile.config.id,'CONFIG_MISMATCH');
    check((a.input?.persona??null)===null&&(b.input?.persona??null)===null,'PERSONA_MISMATCH');
    check(a.input?.charter?.goal===recoveryDefinition(slot.fixture).goal&&b.input?.charter?.goal===recoveryDefinition(slot.fixture).goal,'GOAL_MISMATCH');
    check(equalKnown(a.input,b.input),'INPUT_MISMATCH');
   }
   const firstA=firstStep(left),firstB=firstStep(right);
   const auditA=firstA?.audit,auditB=firstB?.audit;
   check(object(auditA)&&object(auditB)&&equalKnown(auditA.recovery,auditB.recovery),'FIRST_STATE_MISMATCH');
   const assetsA=assetHashes(firstA?.assetFiles),assetsB=assetHashes(firstB?.assetFiles);
   check(assetsA!==null&&assetsB!==null&&assetsA.current===assetsB.current,'FIRST_CURRENT_IMAGE_MISMATCH');
   const requestA=requestEvidence(firstA?.deliberation),requestB=requestEvidence(firstB?.deliberation);
   check(requestA!==null&&requestB!==null,'MISSING_OR_MALFORMED_FIRST_ASSESSMENT');
   if(requestA&&requestB){
    check(isDeepStrictEqual(requestA.modelInput,requestB.modelInput),'FIRST_ASSESSMENT_INPUT_MISMATCH');
    check(requestA.modelInput.goal===recoveryDefinition(slot.fixture).goal&&requestB.modelInput.goal===recoveryDefinition(slot.fixture).goal,'GOAL_MISMATCH');
    check(isDeepStrictEqual(requestA.questions,requestB.questions),'FIRST_ASSESSMENT_QUESTIONS_MISMATCH');
    check(isDeepStrictEqual(requestA.assets,requestB.assets)&&requestA.assets.current===assetsA?.current&&requestB.assets.current===assetsB?.current,'FIRST_ASSESSMENT_ASSETS_MISMATCH');
   }
   const actionA=requestEvidence(firstA),actionB=requestEvidence(firstB);
   if(actionA&&actionB)firstAction={sameModelInput:isDeepStrictEqual(actionA.modelInput,actionB.modelInput),sameQuestions:isDeepStrictEqual(actionA.questions,actionB.questions),sameAssets:isDeepStrictEqual(actionA.assets,actionB.assets)};
  }
  const status: 'match'|'mismatch'|'missing'=!bothPresent?'missing':reasons.length?'mismatch':'match';
  if(status==='mismatch')for(const code of unique(reasons))errors.push({code,ids:[...indexes[0],...indexes[1]].map(index=>records[index].id),slot:key});
  const bothRunsValid=providers.every((provider,index)=>indexes[index].length===1&&byProvider[provider].runs.some(run=>run.runId===records[indexes[index][0]].runId&&run.validity.valid));
  return {key,fixture:slot.fixture,replicate:slot.replicate,status,reasons:unique(reasons),providers:providerEvidence,firstAction,bothRunsValid,eligibleForOutcomeComparison:status==='match'&&bothRunsValid};
 });
 const missing=providers.flatMap(provider=>byProvider[provider].completeness.missing.map(slot=>provider+'/'+slot));
 return {schemaVersion:1,kind:'offline-provider-recovery-comparison-descriptive',dataSource:mock?'synthetic-mock':'recorded-provider-runs',expectedModels:mock?{jev:'MOCK_SCRIPTED_FIXTURE','openai-decisions':'MOCK_SCRIPTED_FIXTURE'}:expectedModels,
  completeness:{planned:24,attempted:records.length,withResult:providers.reduce((sum,provider)=>sum+byProvider[provider].completeness.withResult,0),valid:providers.reduce((sum,provider)=>sum+byProvider[provider].completeness.valid,0),missing,paired:pairs.filter(pair=>pair.status!=='missing').length,matching:pairs.filter(pair=>pair.status==='match').length,eligiblePairs:pairs.filter(pair=>pair.eligibleForOutcomeComparison).length,complete:providers.every(provider=>byProvider[provider].completeness.complete)&&records.length===24},
  integrity:{ok:errors.length===0,errors},totals:sumMeasurements(measurements),providers:byProvider,pairs,
  limitations:[
   'Two repeats per task/condition/provider are descriptive only; no statistical, causal, broad stability or human-fidelity claim.',
   'Both providers use the same full-vision experience-goal-search-grounded actor with null persona. Objective task success does not establish human behavioral fidelity.',
   'Only the initial assessment request, its question semantics and image content are required to match. First action input can already depend on different assessment responses; later trajectories are not identical-input comparisons.',
   'Model IDs are the IDs actually returned per response. Model confidence and probability outputs are not observed human choice frequencies.',
   'Attempted, invalid, faulted, missing and valid objective outcomes retain separate denominators through the recovery analyzer.',
   'API time is machine request time, never human hesitation or reading time. Token/cost totals require complete recorded evidence; missing USD prices remain unknown.',
   'Charged requests include reservations and are not proof of HTTP dispatch or API receipt. Known HTTP attempts sum explicit safe attempt counters; coverage records missing counters. A network timeout alone leaves API receipt unknown.',
   'A matching initial request does not establish that either model read or understood the pixels. A failed run cannot become successful through pairing.',
   ...(mock?['Synthetic mock responses validate plumbing only. They did not reach either model API and provide no evidence about Jev or OpenAI behavior.']:[])
  ]};
}


