import {buildWorkingInquiryContext,workingInquiryQuestions,admitWorkingInquiry} from '../jev/virtual-beta/working-inquiry.js';
import {workingInquiryCriteria} from '../jev/virtual-beta/working-inquiry-projection.js';
import type {WorkingInquiryContext,WorkingInquiryRecord} from '../jev/virtual-beta/working-inquiry-contracts.js';
import {admitVisualPriorRelations,visualPriorRelationInstructions,type VisualPriorRelationsRecord} from '../jev/virtual-beta/visual-prior-relations.js';
import {betaActionInstructions,experienceAssessmentInstructions} from './virtual-beta-action-instructions.js';
import {requestFor} from '../jev/decide.js';
import {visualActionChecks,visualActionCheckInstructions,type VisualActionCheckRecord} from '../jev/virtual-beta/visual-action-checks.js';
import {conditionContinuityUserRecord} from './condition-continuity-guidance.js';
import {validateVisualHTTPDispatch} from '../jev/virtual-beta/visual-http-timing.js';
import {validateVisualDispatch} from './visual-dispatch-timing.js';
import {emptyConditionContinuity,admitConditionContinuity,type ConditionContinuityMemory} from '../jev/virtual-beta/condition-continuity.js';
import {verifyJevImageBindings} from './jev-image-references.js';
import {visualHypothesisInput} from './visual-hypothesis-input.js';
import {admitVisualHypotheses,rememberVisualHypotheses} from '../jev/virtual-beta/visual-hypotheses.js';
import type {VisualHypothesisMemory,VisualHypothesisRequest} from '../jev/virtual-beta/visual-hypotheses-contracts.js';
import {actionRelationQuestions,admitActionRelations,actionRelationCriteria} from '../jev/virtual-beta/action-relations.js';
import {validateConfig} from '../jev/virtual-beta/config.js';
import {goalSearchQuestions,admitGoalSearch,rememberGoalSearch,goalSearchCriteria} from '../jev/virtual-beta/goal-search.js';
import type {GoalSearchMemory} from '../jev/virtual-beta/goal-search-contracts.js';
import {createCorrespondenceArchive,correspondenceQuestions,admitCorrespondence,correspondenceCriteria} from '../jev/virtual-beta/correspondence.js';
import type {CorrespondenceContext} from '../jev/virtual-beta/correspondence-contracts.js';
import {candidatesFor} from '../jev/types.js';
import {filterCandidates} from '../jev/persona.js';
import {reconstructReplayCandidates} from './virtual-beta-replay-candidates.js';
import {copyDeferrals,updateDeferrals,deferralDecision} from '../jev/virtual-beta/deferral.js';
import {arriveExperience,beginExperience,experienceQuestions,admitExperience,experienceContext,experienceCriteria} from '../jev/virtual-beta/experience.js';
import {prepareReasonContext,requiredReasonSources,reasonQuestions,admitReasons} from '../jev/virtual-beta/deferral-reason.js';
import type {DeferralReasonMemory,DeferralReasonContext} from '../jev/virtual-beta/deferral-reason-contracts.js';
import type {ExperienceMemory,ExperienceIntent} from '../jev/virtual-beta/experience-contracts.js';
import {assessmentQuestions,admitAssessment,assessedCriteria} from '../jev/virtual-beta/deliberation.js';
import type {BetaCandidates,UserObservation} from '../jev/virtual-beta/contracts.js';
import type {AdmittedObservationSource} from '../jev/virtual-beta/deliberation-contracts.js';
import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {replaySelection} from '../jev/virtual-beta/selection.js';
import {sha,offeredCandidates,type BetaResult} from './virtual-beta-core.js';
const isRecord=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const unexpectedGoalSearch=(input:Record<string,unknown>|undefined)=>Object.keys(input??{}).some(key=>key.startsWith('goalSearch'))||(isRecord(input?.userState)&&Object.keys(input.userState).some(key=>key.startsWith('goalSearch')&&key!=='goalSearch'));
const hasCorrespondence=(input:Record<string,unknown>|undefined)=>['correspondenceContext','correspondenceObservations','correspondenceAssessment'].some(key=>input?.[key]!==undefined);
/** Only model-input image references backed by the verified attached assets admit sources. */
function assessmentSources(input:Record<string,unknown>,assets:Record<string,{file:string;sha256:string}>,current:UserObservation):AdmittedObservationSource[]{
 const observation=input.observation;
 if(!isRecord(observation)||typeof observation.id!=='string'||observation.id!==current.id)throw new Error('ASSESSMENT_CURRENT_SOURCE_MISMATCH');
 const imageHash=(image:unknown):string=>{
  if(typeof image!=='string'||!Object.hasOwn(assets,image))throw new Error('ASSESSMENT_SOURCE_IMAGE_NOT_ATTACHED');
  return assets[image].sha256;
 };
 const currentHash=imageHash(observation.image);
 if(currentHash!==current.imageSha256||(Object.hasOwn(observation,'imageSha256')&&observation.imageSha256!==currentHash))throw new Error('ASSESSMENT_CURRENT_IMAGE_MISMATCH');
 const memory=input.memoryObservations===undefined?[]:input.memoryObservations;
 const reasons=input.reasonObservations===undefined?[]:input.reasonObservations;
 const correspondence=input.correspondenceObservations===undefined?[]:input.correspondenceObservations;
 if(!Array.isArray(memory)||!Array.isArray(reasons)||!Array.isArray(correspondence))throw new Error('ASSESSMENT_MEMORY_SOURCE_INVALID');
 const sources=new Map<string,AdmittedObservationSource>();
 const add=(observationId:unknown,imageSha256:string)=>{
  if(typeof observationId!=='string'||!observationId.trim()||observationId==='none')throw new Error('ASSESSMENT_SOURCE_ID_INVALID');
  const prior=sources.get(observationId);
  if(prior&&prior.imageSha256!==imageSha256)throw new Error('ASSESSMENT_SOURCE_ID_CONFLICT');
  sources.set(observationId,{observationId,imageSha256});
 };
 for(const entry of [...memory,...reasons,...correspondence]){
  if(!isRecord(entry))throw new Error('ASSESSMENT_MEMORY_SOURCE_INVALID');
  const hash=imageHash(entry.image);
  if(entry.imageSha256!==hash)throw new Error('ASSESSMENT_MEMORY_SOURCE_IMAGE_MISMATCH');
  add(entry.observationId,hash);
 }
 add(observation.id,currentHash);
 return [...sources.values()];
}
function checkReasonSources(input:Record<string,unknown>,context:DeferralReasonContext,config:NonNullable<BetaResult['config']['deferralReason']>){
 const refs=input.reasonObservations;
 const expected=requiredReasonSources(context,config);
 if(!Array.isArray(refs)||refs.length!==expected.length||refs.some((ref,i)=>!isRecord(ref)||ref.observationId!==expected[i].observationId||ref.imageSha256!==expected[i].imageSha256))throw Error('REASON_SOURCE_REFERENCE_MISMATCH');
}
function closedKeys(value:unknown,required:string[],optional:string[]=[]):asserts value is Record<string,any>{if(!isRecord(value)||required.some(key=>!Object.hasOwn(value,key))||Object.keys(value).some(key=>![...required,...optional].includes(key)))throw Error('VISUAL_HYPOTHESES_UNEXPECTED_OR_MISSING_FIELD');}
function checkVisualResponse(value:unknown){
 closedKeys(value,['model','status','output','rawText','request','costUSD'],['usage']);
 if(!['gpt-6-luna','UNEXPECTED_MODEL'].includes(value.model)||!['completed','refused','incomplete','invalid-json','invalid-response'].includes(value.status)||typeof value.rawText!=='string'||Buffer.byteLength(value.rawText,'utf8')>65536||value.costUSD!==null)throw Error('VISUAL_HYPOTHESES_RESPONSE_EVIDENCE_INVALID');
 closedKeys(value.request,['attempts','httpReceived','statusCode']);if(value.request.attempts!==1||value.request.httpReceived!==true||value.request.statusCode!==200)throw Error('VISUAL_HYPOTHESES_RESPONSE_EVIDENCE_INVALID');
 if(value.usage!==undefined){closedKeys(value.usage,['inputTokens','outputTokens','totalTokens']);if(Object.values(value.usage).some(n=>!Number.isSafeInteger(n)||Number(n)<0)||value.usage.totalTokens!==value.usage.inputTokens+value.usage.outputTokens)throw Error('VISUAL_HYPOTHESES_USAGE_INVALID');}
}
function checkVisualStage(step:BetaResult['steps'][number],termination:BetaResult['termination']){
 const v=step.visualHypotheses!;closedKeys(v,['request','assetFiles','inputSha256','apiCalls','timing'],['response','record','memory','error','measurementError']);closedKeys(v.timing,['apiMs'],['dispatch','httpDispatch']);if(!Number.isFinite(v.timing.apiMs)||v.timing.apiMs<0||![0,1].includes(v.apiCalls))throw Error('VISUAL_HYPOTHESES_ACCOUNTING_INVALID');
 if(v.response!==undefined)checkVisualResponse(v.response);
 if(v.record!==undefined){if(v.measurementError!==undefined||v.apiCalls!==1||!v.response||v.response.status!=='completed'||v.error!==undefined||!v.memory)throw Error('VISUAL_HYPOTHESES_COMPLETE_EVIDENCE_INVALID');return;}
 if(v.memory!==undefined||step.deliberation||step.selection)throw Error('VISUAL_HYPOTHESES_PARTIAL_MISMATCH');
 if(step.outcome==='VISUAL_EXTRACTION_AFTER_DEADLINE'&&termination==='TIME_LIMIT'&&v.apiCalls===1&&v.response&&v.error===undefined)return;
 if(!isRecord(v.error)||!equal(step.error,v.error)||typeof v.error.code!=='string')throw Error('VISUAL_HYPOTHESES_FAILURE_EVIDENCE_MISSING');
 const e=v.error;
 if(e.code==='INVALID_VISUAL_HYPOTHESES'){closedKeys(e,['code','status']);if(v.apiCalls!==1||!v.response||e.status!==v.response.status||termination!=='API_ERROR'||step.outcome!=='VISUAL_EXTRACTION_OUTPUT_ERROR')throw Error('VISUAL_HYPOTHESES_FAILURE_EVIDENCE_INVALID');return;}
 if(e.code==='VISUAL_HTTP_MEASUREMENT_ERROR'){closedKeys(e,['code']);if(v.apiCalls!==1||!v.response||v.measurementError!=='MISSING_VISUAL_HTTP_DISPATCH'||termination!=='API_ERROR'||step.outcome!=='VISUAL_EXTRACTION_AUDIT_ERROR')throw Error('VISUAL_HTTP_MEASUREMENT_FAILURE_INVALID');return;}
 if(v.response!==undefined||step.outcome!=='VISUAL_EXTRACTION_ERROR')throw Error('VISUAL_HYPOTHESES_FAILURE_EVIDENCE_INVALID');
 if(['API_LIMIT','TIME_LIMIT'].includes(e.code as string)){closedKeys(e,['code']);if(v.apiCalls!==0||termination!==e.code)throw Error('VISUAL_HYPOTHESES_ACCOUNTING_INVALID');return;}
 if(termination!=='API_ERROR')throw Error('VISUAL_HYPOTHESES_FAILURE_EVIDENCE_INVALID');
 if(e.code==='BUDGET_ADMISSION_ERROR'){closedKeys(e,['code'],['boundary','persistence']);if(v.apiCalls!==0)throw Error('VISUAL_HYPOTHESES_ACCOUNTING_INVALID');return;}
 if(e.code==='BUDGET_SETTLEMENT_AFTER_REQUEST'){closedKeys(e,['code','requestOutcome'],['persistence']);if(v.apiCalls!==1||!['error','response'].includes(e.requestOutcome as string))throw Error('VISUAL_HYPOTHESES_ACCOUNTING_INVALID');return;}
 if(e.code==='VISUAL_EXTRACTION_REQUEST_FAILED'){closedKeys(e,['code']);if(v.apiCalls!==1)throw Error('VISUAL_HYPOTHESES_ACCOUNTING_INVALID');return;}
 closedKeys(e,['code','attempts','httpReceived'],['statusCode','diagnostic']);
 if(e.diagnostic!==undefined){const d=e.diagnostic;closedKeys(d,['schemaVersion','code','parameter','lookaroundMentioned']);if(e.code!=='HTTP_ERROR'||e.statusCode!==400||d.schemaVersion!==1||!['invalid_json_schema','invalid_request_error','unknown'].includes(d.code as string)||!['text.format.schema','text.format','response_format','model','unknown'].includes(d.parameter as string)||typeof d.lookaroundMentioned!=='boolean')throw Error('VISUAL_PROVIDER_DIAGNOSTIC_INVALID');}
 if(!['MISSING_CREDENTIALS','HTTP_ERROR','TIMEOUT','REQUEST_FAILED'].includes(e.code as string)||v.apiCalls!==1||!Number.isSafeInteger(e.attempts)||![0,1].includes(e.attempts as number)||typeof e.httpReceived!=='boolean'||e.httpReceived!==Object.hasOwn(e,'statusCode')||e.statusCode!==undefined&&(!Number.isInteger(e.statusCode)||Number(e.statusCode)<100||Number(e.statusCode)>599)||e.attempts===0&&e.httpReceived||e.code==='HTTP_ERROR'&&(e.attempts!==1||e.httpReceived!==true||e.statusCode===200)||e.code==='MISSING_CREDENTIALS'&&(e.attempts!==0||e.httpReceived!==false))throw Error('VISUAL_HYPOTHESES_FAILURE_EVIDENCE_INVALID');
}
export async function replayDirectory(directory:string,requirements:{finalVisualHTTP?:boolean}={}){
 closedKeys(requirements,[],['finalVisualHTTP']);if(requirements.finalVisualHTTP!==undefined&&typeof requirements.finalVisualHTTP!=='boolean')throw Error('INVALID_REPLAY_REQUIREMENTS');
 const result:BetaResult=JSON.parse(await readFile(join(directory,'result.json'),'utf8'));if(result.config.actionRelations!==undefined||result.config.visualHypotheses!==undefined)validateConfig(result.config);if(result.measurement!==undefined){closedKeys(result.measurement,['visualDispatch'],['visualHTTP']);if(result.measurement.visualDispatch!=='client-timeout-v1'||Object.hasOwn(result.measurement,'visualHTTP')&&result.measurement.visualHTTP!=='final-timeout-v1'||!result.config.visualHypotheses?.enabled)throw Error('INVALID_VISUAL_DISPATCH_MEASUREMENT');}if(requirements.finalVisualHTTP&&result.measurement?.visualHTTP!=='final-timeout-v1')throw Error('FINAL_VISUAL_HTTP_MEASUREMENT_REQUIRED');let choices=0,images=0,assessments=0;
 let deferrals=result.config.deferral?.enabled?copyDeferrals(undefined,result.config.deferral):undefined,effectiveDeferrals=deferrals;
 let experience:ExperienceMemory|undefined,pending:ExperienceIntent|undefined,execution:'performed'|'unchanged'='unchanged';
 let reasonMemory:DeferralReasonMemory|undefined;
 let continuityMemory:ConditionContinuityMemory|undefined=result.config.visualHypotheses?.continuity?emptyConditionContinuity(result.input.charter.goal):undefined;
 let visualMemory:VisualHypothesisMemory|undefined=result.config.visualHypotheses?.enabled?{schemaVersion:1,records:[]}:undefined;
 let searchMemory:GoalSearchMemory|undefined=result.config.goalSearch?.enabled?{schemaVersion:1,entries:[]}:undefined;
 const seen=new Map<string,string>();
 const archive=result.config.correspondence?.enabled?createCorrespondenceArchive(result.config.correspondence):undefined;

 if(result.transport!==undefined&&(!isRecord(result.transport)||Object.keys(result.transport).length!==1||result.transport.jevImageReferences!=='opaque-v1'))throw Error('INVALID_TRANSPORT_POLICY');
 for(const step of result.steps){
  let priorProjection:Parameters<typeof visualActionChecks>[4];
  let inquiryContext:WorkingInquiryContext|undefined,inquiryRecord:WorkingInquiryRecord|undefined;
  const inquiryInputs=[step.modelInput,step.deliberation?.modelInput],inquiryPresent=step.workingInquiry!==undefined||inquiryInputs.some(v=>Object.keys(v??{}).some(k=>k.startsWith('workingInquiry')))||Object.keys(step.deliberation?.questions??{}).some(k=>k.startsWith('workingInquiry'))||Object.keys(step.deliberation?.response?.answers??{}).some(k=>k.startsWith('workingInquiry'));
  if(!result.config.visualHypotheses?.workingInquiry&&inquiryPresent)throw Error('UNCONFIGURED_WORKING_INQUIRY');
  for(const v of inquiryInputs)if(Object.keys(v??{}).some(k=>k.startsWith('workingInquiry')&&!['workingInquiryContext','workingInquiry'].includes(k))||Object.keys((v?.userState as any)??{}).some(k=>k.startsWith('workingInquiry')))throw Error('UNEXPECTED_WORKING_INQUIRY_FIELD');
  if(Object.keys(step.userState??{}).some(k=>k.startsWith('workingInquiry')))throw Error('UNEXPECTED_WORKING_INQUIRY_STATE');
  const priorInputs=[step.modelInput,step.deliberation?.modelInput],priorPresent=step.visualPriorRelations!==undefined||priorInputs.some(x=>x?.visualPriorRelations!==undefined);
  if(priorInputs.some(x=>Object.keys(x??{}).some(k=>k.startsWith('visualPrior')&&k!=='visualPriorRelations'))||Object.keys(step.userState??{}).some(k=>k.startsWith('visualPrior'))||priorInputs.some(x=>Object.keys((x?.userState as any)??{}).some(k=>k.startsWith('visualPrior'))))throw Error('UNEXPECTED_VISUAL_PRIOR_RELATIONS_FIELD');
  if(!result.config.visualHypotheses?.priorConditionLinks&&priorPresent)throw Error('UNCONFIGURED_VISUAL_PRIOR_RELATIONS');
  if(!step.visualHypotheses?.record&&priorPresent)throw Error('PARTIAL_VISUAL_PRIOR_RELATIONS');
  if(!result.config.visualHypotheses?.candidateChecks&&step.visualActionChecks!==undefined)throw Error('UNCONFIGURED_VISUAL_ACTION_CHECKS');
  if(result.config.visualHypotheses?.candidateChecks){if(!step.deliberation?.assessment&&step.visualActionChecks!==undefined)throw Error('PARTIAL_VISUAL_ACTION_CHECKS');if(step.questions?.nextAction){closedKeys(step.questions.nextAction,['type','instructions','criteria']);if(step.questions.nextAction.type!=='choice')throw Error('VISUAL_ACTION_CHECKS_QUESTION_TYPE_MISMATCH');if(!step.audit?.screen)throw Error('VISUAL_ACTION_CHECKS_SCREEN_MISSING');const base=requestFor({goal:result.input.charter.goal,currentDate:result.input.charter.initialState.currentDate,screen:step.audit.screen,history:[]},{},'').questions.nextAction.instructions;if(step.questions.nextAction.instructions!==betaActionInstructions(result.config,base))throw Error('VISUAL_ACTION_CHECKS_GUIDANCE_MISMATCH');}}
  for(const stage of [step.deliberation,step])if(stage){
   if(stage===step&&!step.response&&[step.deliberation,step.visualHypotheses].some(prior=>prior?.error!==undefined&&equal(prior.error,step.error)))continue;
   const error=stage.error as any,trace=stage.response?.request??error?.request,binding=trace?.imageBindings;
   const expected=result.transport?.jevImageReferences==='opaque-v1'&&(stage.response!==undefined||['HTTP_ERROR','TIMEOUT','MISSING_CREDENTIALS','INVALID_RESPONSE','REQUEST_FAILED'].includes(error?.code));
   if(expected&&!binding&&!(error?.code==='REQUEST_FAILED'&&trace?.attempts===0))throw Error('MISSING_JEV_IMAGE_BINDINGS');
   if(binding){if(!stage.modelInput||!stage.questions||!stage.assetFiles)throw Error('MISSING_JEV_IMAGE_BINDING_INPUT');verifyJevImageBindings(stage.modelInput,stage.questions,stage.assetFiles,binding);}
  }

  const d=step.deliberation,current=step.userState?.lastObservation;
  if(unexpectedGoalSearch(step.modelInput)||unexpectedGoalSearch(d?.modelInput)||unexpectedGoalSearch({userState:step.userState})||Object.keys(step).some(key=>key.startsWith('goalSearch')&&key!=='goalSearch'))throw Error('UNEXPECTED_GOAL_SEARCH_FIELD');
  if(current)seen.set(current.id,current.imageSha256);
  let correspondenceContext:CorrespondenceContext|undefined,correspondenceCandidates:BetaCandidates|undefined,searchCandidates:BetaCandidates|undefined;
  const searchPresent=step.goalSearch!==undefined||(step.modelInput?.userState as any)?.goalSearch!==undefined||(d?.modelInput.userState as any)?.goalSearch!==undefined||Object.keys(d?.questions??{}).some(k=>k.startsWith('goalSearch_'))||Object.keys(d?.response?.answers??{}).some(k=>k.startsWith('goalSearch_'));
  if(!result.config.goalSearch?.enabled&&searchPresent)throw Error('UNCONFIGURED_GOAL_SEARCH');
  if(result.config.goalSearch?.enabled&&(step.modelInput||d||step.goalSearch)){
   if(!current||!step.vision||!step.assetFiles||!step.questions||!step.audit||!step.goalSearch||(!d?.assessment&&(step.selection||step.goalSearch.record||step.goalSearch.annotations)))throw Error('GOAL_SEARCH_METADATA_MISSING');
   const bytes=await readFile(join(directory,step.assetFiles.current.file)),raw=filterCandidates(candidatesFor(step.audit.screen,Object.hasOwn(step.questions.nextAction.criteria,'back')),step.audit.screen,result.input.charter);
   searchCandidates=offeredCandidates(raw,{...step.vision,bytes},result.config);
   const expectedCurrent={id:'o'+step.number,imageSha256:sha(bytes),visibleText:result.config.vision.mode==='full'?[...step.audit.screen.text]:[],fixation:{...step.vision.fixation},candidateIds:Object.keys(searchCandidates)};
   if(!equal(current,expectedCurrent)||!equal(((d?.modelInput??step.modelInput)?.userState as any)?.lastObservation,expectedCurrent)||!equal((step.modelInput?.userState as any)?.lastObservation,expectedCurrent)||!equal(((d?.modelInput??step.modelInput)?.observation as any)?.candidateIds,expectedCurrent.candidateIds)||!equal((step.modelInput?.observation as any)?.candidateIds,expectedCurrent.candidateIds)||!equal(Object.keys(step.questions.nextAction.criteria),expectedCurrent.candidateIds))throw Error('GOAL_SEARCH_OBSERVATION_MISMATCH');
   const searchInput=d?.modelInput??step.modelInput!,searchAssets=d?.assetFiles??step.assetFiles,sourceList=assessmentSources(searchInput,searchAssets,current),expected=goalSearchQuestions(result.input.charter.goal,current,searchCandidates,sourceList,result.config.goalSearch?.interpretation,{mode:result.config.goalSearch?.evidenceMode,prior:searchMemory});
   if(d&&!equal(Object.fromEntries(Object.entries(d.questions).filter(([key])=>key.startsWith('goalSearch_'))),expected)||!equal((searchInput.userState as any)?.goalSearch,searchMemory))throw Error('GOAL_SEARCH_ARRIVAL_OR_QUESTION_MISMATCH');
  }
  const continuityInputs=[step as any,step.modelInput,d?.modelInput,step.userState,step.modelInput?.userState,d?.modelInput.userState];
  for(const v of continuityInputs)if(Object.keys(v??{}).some(k=>k.startsWith('conditionContinuity')&&k!=='conditionContinuity'))throw Error('UNEXPECTED_CONDITION_CONTINUITY_FIELD');
  if(!result.config.visualHypotheses?.continuity&&continuityInputs.some(v=>Object.hasOwn(v??{},'conditionContinuity')))throw Error('UNCONFIGURED_CONDITION_CONTINUITY');
  const visualKeys=(v:Record<string,unknown>|undefined)=>Object.keys(v??{}).filter(k=>k.startsWith('visualHypoth'));
  for(const v of [step as unknown as Record<string,unknown>,step.modelInput,d?.modelInput,step.userState as unknown as Record<string,unknown>,step.modelInput?.userState as Record<string,unknown>,d?.modelInput.userState as Record<string,unknown>])if(visualKeys(v).some(k=>k!=='visualHypotheses'))throw Error('UNEXPECTED_VISUAL_HYPOTHESES_FIELD');
  const visualPresent=[step as unknown as Record<string,unknown>,step.modelInput,d?.modelInput,step.userState as unknown as Record<string,unknown>,step.modelInput?.userState as Record<string,unknown>,d?.modelInput.userState as Record<string,unknown>].some(v=>visualKeys(v).length);
  if(!result.config.visualHypotheses?.enabled&&visualPresent)throw Error('UNCONFIGURED_VISUAL_HYPOTHESES');
  const visualPreStop=result.config.visualHypotheses?.enabled&&step.modelInput&&!step.visualHypotheses&&!d&&!step.selection&&!step.error&&((step.outcome==='SAFETY_STOP'&&result.termination==='SAFETY_STOP')||(['DEADLINE_BEFORE_VISUAL_EXTRACTION','DEADLINE_BEFORE_INFERENCE'].includes(step.outcome??'')&&result.termination==='TIME_LIMIT'));
  if(visualPreStop&&result.config.visualHypotheses?.continuity&&(!equal(step.userState?.conditionContinuity,continuityMemory)||!equal((step.modelInput?.userState as any)?.conditionContinuity,continuityMemory)||step.conditionContinuity!==undefined||step.modelInput?.conditionContinuity!==undefined))throw Error('CONDITION_CONTINUITY_PRESTOP_MISMATCH');
  if(visualPreStop&&(!equal(step.userState?.visualHypotheses,visualMemory)||!equal((step.modelInput?.userState as any)?.visualHypotheses,visualMemory)||step.modelInput?.visualHypotheses!==undefined))throw Error('VISUAL_HYPOTHESES_PRESTOP_STATE_MISMATCH');
  if(result.config.visualHypotheses?.enabled&&step.modelInput&&!visualPreStop){
   const v=step.visualHypotheses;
   if(!v||!current||!step.assetFiles||!searchCandidates)throw Error('VISUAL_HYPOTHESES_METADATA_MISSING');
   checkVisualStage(step,result.termination);
   if(v.timing&&Object.hasOwn(v.timing,'dispatch')){if(!result.measurement)throw Error('UNDECLARED_VISUAL_DISPATCH_MEASUREMENT');validateVisualDispatch(v.timing.dispatch,result.config.maxRunMs,result.config.visualHypotheses.requestTimeoutMs);}else if(result.measurement)throw Error('VISUAL_DISPATCH_TIMING_MISSING');
   if(v.measurementError!==undefined&&(v.measurementError!=='MISSING_VISUAL_HTTP_DISPATCH'||result.measurement?.visualHTTP!=='final-timeout-v1'||v.timing?.httpDispatch!==undefined||v.apiCalls!==1||(v.error as any)?.attempts===0||result.validForComparison||result.termination!=='API_ERROR'))throw Error('INVALID_VISUAL_HTTP_MEASUREMENT_FAILURE');
   if(v.timing&&Object.hasOwn(v.timing,'httpDispatch')){if(result.measurement?.visualHTTP!=='final-timeout-v1'||!v.timing.dispatch)throw Error('UNDECLARED_VISUAL_HTTP_MEASUREMENT');validateVisualHTTPDispatch(v.timing.httpDispatch,v.timing.dispatch.timeoutMs,result.config.visualHypotheses.requestTimeoutMs);if(v.apiCalls!==1||(v.error as any)?.attempts===0)throw Error('NONDISPATCHED_VISUAL_HTTP_TRACE');}else if(result.measurement?.visualHTTP==='final-timeout-v1'&&v.apiCalls===1&&(v.error as any)?.attempts!==0&&v.measurementError===undefined)throw Error('VISUAL_HTTP_DISPATCH_MISSING');
   if(result.config.visualHypotheses.continuity?.retentionPolicy==='grounded-unresolved'&&!result.measurement)throw Error('VISUAL_DISPATCH_MEASUREMENT_MISSING');
   const imageData:VisualHypothesisRequest['images']={};
   for(const [id,asset] of Object.entries(v.assetFiles)){if(asset.file!==asset.file.split(/[\\/]/).at(-1))throw Error('UNSAFE_IMAGE_PATH');const bytes=await readFile(join(directory,asset.file));if(sha(bytes)!==asset.sha256)throw Error('VISUAL_IMAGE_HASH_MISMATCH');imageData[id]={mediaType:'image/png',data:bytes.toString('base64')};}
   const sourceInput=d?.modelInput??step.modelInput;
   const request=visualHypothesisInput({...(result.config.visualHypotheses.priorConditionLinks!==undefined?{priorConditionLinks:result.config.visualHypotheses.priorConditionLinks}:{}),...(result.config.visualHypotheses.requestTimeoutMs!==undefined?{timeoutCapMs:result.config.visualHypotheses.requestTimeoutMs}:{}),goal:result.input.charter.goal,currentDate:result.input.charter.initialState.currentDate,...(result.input.persona?{persona:result.input.persona}:{}),current:{observationId:current.id,imageSha256:current.imageSha256},sources:assessmentSources(sourceInput,v.assetFiles,current),candidates:searchCandidates,user:{...step.userState!,...(continuityMemory?{conditionContinuity:continuityMemory}:{}),experience:result.config.experience?.enabled?arriveExperience(experience,pending,current,execution,result.config.experience):undefined,visualHypotheses:visualMemory},images:imageData,assets:v.assetFiles,timeoutMs:v.timing?.dispatch?.timeoutMs??30000,...(result.config.visualHypotheses.continuity?{continuityCapacity:result.config.visualHypotheses.continuity.capacity,...(result.config.visualHypotheses.continuity.retentionPolicy!==undefined?{continuityRetentionPolicy:result.config.visualHypotheses.continuity.retentionPolicy}:{})}:{})});
   if((v.error as any)?.diagnostic!==undefined&&!request.conditionContinuity)throw Error('UNCONFIGURED_VISUAL_PROVIDER_DIAGNOSTIC');
   const {images:_images,timeoutMs:_timeout,...metadata}=request;
   if(!equal(v.assetFiles,step.assetFiles)||!equal(v.request,metadata)||v.inputSha256!==sha(JSON.stringify({input:metadata,assets:v.assetFiles})))throw Error('VISUAL_HYPOTHESES_INPUT_MISMATCH');
   if(v.record){
    if(!v.response||v.error)throw Error('VISUAL_HYPOTHESES_RESPONSE_MISSING');
    const record=admitVisualHypotheses(v.response,request);
    if(result.config.visualHypotheses.priorConditionLinks){const links=admitVisualPriorRelations((v.response.output as any).relations.map((r:any)=>({candidateId:r.candidateId,priorConditionIds:r.priorConditionIds})),request,record);if(!equal(step.visualPriorRelations,links))throw Error('VISUAL_PRIOR_RELATIONS_RECORD_MISMATCH');for(const input of [step.modelInput,...(d?[d.modelInput]:[])])if(!equal(input.visualPriorRelations,links))throw Error('VISUAL_PRIOR_RELATIONS_DELIVERY_MISMATCH');priorProjection={request,record:links};}
    visualMemory=rememberVisualHypotheses(visualMemory,record,result.config.visualHypotheses.capacity);
    if(request.conditionContinuity){
     const expected=admitConditionContinuity((v.response.output as any).continuity,request.conditionContinuity,record);
     if(!equal(step.conditionContinuity,expected))throw Error('CONDITION_CONTINUITY_RECORD_MISMATCH');
     continuityMemory=expected.after;
     for(const input of [step.modelInput,...(d?[d.modelInput]:[])])if(!equal(input.conditionContinuity,conditionContinuityUserRecord(expected))||!equal((input.userState as any)?.conditionContinuity,continuityMemory))throw Error('CONDITION_CONTINUITY_DELIVERY_MISMATCH');
    }
    if(!equal(v.record,record)||!equal(v.memory,visualMemory))throw Error('VISUAL_HYPOTHESES_RECORD_MISMATCH');
    for(const input of [step.modelInput,...(d?[d.modelInput]:[])])if(!equal(input.visualHypotheses,record)||!equal((input.userState as any)?.visualHypotheses,visualMemory))throw Error('VISUAL_HYPOTHESES_DELIVERY_MISMATCH');
   }else{if(result.config.visualHypotheses.continuity&&(step.conditionContinuity!==undefined||step.modelInput.conditionContinuity!==undefined||d?.modelInput.conditionContinuity!==undefined))throw Error('CONDITION_CONTINUITY_PARTIAL_MISMATCH');if(step.modelInput.visualHypotheses!==undefined)throw Error('VISUAL_HYPOTHESES_PARTIAL_MISMATCH');if(v.error&&(v.error as any).code==='INVALID_VISUAL_HYPOTHESES'){let invalid=false;try{admitVisualHypotheses(v.response!,request);}catch{invalid=true;}if(!invalid)throw Error('VISUAL_HYPOTHESES_VALID_OUTPUT_HIDDEN_AS_FAILURE');}}
   if(result.config.visualHypotheses.continuity&&(!equal(step.userState?.conditionContinuity,continuityMemory)||!equal((step.modelInput.userState as any)?.conditionContinuity,continuityMemory)||d&&!equal((d.modelInput.userState as any)?.conditionContinuity,continuityMemory)||!v.record&&step.conditionContinuity!==undefined))throw Error('CONDITION_CONTINUITY_STATE_MISMATCH');
   if(!equal(step.userState?.visualHypotheses,visualMemory))throw Error('VISUAL_HYPOTHESES_STATE_MISMATCH');
  }
  if(result.config.visualHypotheses?.workingInquiry&&(d||inquiryPresent)){
   if(!d||!priorProjection||!step.conditionContinuity||!step.visualHypotheses?.record||!step.workingInquiry)throw Error('WORKING_INQUIRY_CONTEXT_MISSING');
   closedKeys(step.workingInquiry,['context'],['record','annotations']);
   inquiryContext=buildWorkingInquiryContext({request:priorProjection.request,record:step.visualHypotheses.record,continuity:step.conditionContinuity,prior:priorProjection.record});
   if(!equal(step.workingInquiry.context,inquiryContext)||inquiryInputs.some(v=>!equal(v?.workingInquiryContext,inquiryContext)))throw Error('WORKING_INQUIRY_CONTEXT_MISMATCH');
   const expected=workingInquiryQuestions(inquiryContext),actual=Object.fromEntries(Object.entries(d.questions).filter(([key])=>key.startsWith('workingInquiry')));
   if(!equal(actual,expected)||d.modelInput.workingInquiry!==undefined)throw Error('WORKING_INQUIRY_QUESTIONS_OR_STAGE_MISMATCH');
   if(d.response&&(step.workingInquiry.record!==undefined||d.assessment||!d.error||['INVALID_ASSESSMENT','INVALID_WORKING_INQUIRY'].includes((d.error as any)?.code))){
    try{inquiryRecord=admitWorkingInquiry(d.response,inquiryContext);}catch{
     if((d.error as any)?.code!=='INVALID_WORKING_INQUIRY'||result.termination!=='INVALID_DISTRIBUTION'||step.workingInquiry.record!==undefined||step.workingInquiry.annotations!==undefined||step.modelInput?.workingInquiry!==undefined||d.assessment||step.response||step.selection)throw Error('WORKING_INQUIRY_INVALID_RESPONSE_MISMATCH');
    }
    if(inquiryRecord&&(!equal(step.workingInquiry.record,inquiryRecord)||!equal(step.modelInput?.workingInquiry,inquiryRecord)||(d.error as any)?.code==='INVALID_WORKING_INQUIRY'))throw Error('WORKING_INQUIRY_RECORD_MISMATCH');
   }else if(step.workingInquiry.record!==undefined||step.modelInput?.workingInquiry!==undefined)throw Error('WORKING_INQUIRY_PARTIAL_RECORD');
   if(!d.assessment&&step.workingInquiry.annotations!==undefined)throw Error('WORKING_INQUIRY_PARTIAL_ANNOTATIONS');
  }
  const relationKeys=(v:Record<string,unknown>|undefined)=>Object.keys(v??{}).some(k=>k.startsWith('actionRelation'));
  const extraRelationKeys=(v:Record<string,unknown>|undefined)=>Object.keys(v??{}).some(k=>k.startsWith('actionRelation')&&k!=='actionRelations');
  if(extraRelationKeys(step.modelInput)||extraRelationKeys(step as unknown as Record<string,unknown>)||relationKeys(step.userState as unknown as Record<string,unknown>)||relationKeys(step.modelInput?.userState as Record<string,unknown>)||relationKeys(d?.modelInput.userState as Record<string,unknown>))throw Error('UNEXPECTED_ACTION_RELATIONS_FIELD');
  const relationPresent=relationKeys(step.modelInput)||relationKeys(d?.modelInput)||relationKeys(d?.questions)||relationKeys(d?.response?.answers)||relationKeys(step as unknown as Record<string,unknown>);
  if(!result.config.actionRelations?.enabled&&relationPresent)throw Error('UNCONFIGURED_ACTION_RELATIONS');
  if(result.config.actionRelations?.enabled&&(d||relationPresent)){
   if(!d||!current||!searchCandidates||relationKeys(d.modelInput))throw Error('ACTION_RELATIONS_STAGE_MISMATCH');
   const expected=actionRelationQuestions(result.input.charter.goal,current,searchCandidates,assessmentSources(d.modelInput,d.assetFiles,current),result.config.actionRelations?.evidencePolicy);
   if(!equal(Object.fromEntries(Object.entries(d.questions).filter(([key])=>key.startsWith('actionRelation'))),expected))throw Error('ACTION_RELATIONS_QUESTION_MISMATCH');
   if(!d.assessment&&(step.actionRelations!==undefined||relationKeys(step.modelInput)))throw Error('ACTION_RELATIONS_PARTIAL_MISMATCH');
  }
  if(archive&&(step.modelInput||d||step.correspondence)&&(!current||!step.vision||!step.assetFiles||!step.questions||!step.audit||!step.correspondence))throw Error('CORRESPONDENCE_METADATA_MISSING');
  if(archive&&current&&step.vision&&step.assetFiles&&step.questions){
   const raw=filterCandidates(candidatesFor(step.audit!.screen,Object.hasOwn(step.questions.nextAction.criteria,'back')),step.audit!.screen,result.input.charter);
   correspondenceCandidates=offeredCandidates(raw,{...step.vision,bytes:await readFile(join(directory,step.assetFiles.current.file))},result.config);
   if(!equal(Object.keys(correspondenceCandidates),Object.keys(step.questions.nextAction.criteria)))throw Error('CORRESPONDENCE_CANDIDATES_MISMATCH');
   const input=d?.modelInput??step.modelInput!,assets=d?.assetFiles??step.assetFiles;
   const refs=[...((input.memoryObservations??[]) as any[]),...((input.reasonObservations??[]) as any[])];
   const baseKeys=new Set(['current',...refs.map(r=>r.image)]),baseAssets=Object.fromEntries(Object.entries(assets).filter(([key])=>baseKeys.has(key)));
   const frame={source:{observationId:current.id,imageSha256:current.imageSha256},bytes:await readFile(join(directory,assets.current.file)),file:assets.current.file,clickCandidateIds:Object.keys(correspondenceCandidates).filter(id=>correspondenceCandidates![id].action.type==='click')};
   const expectedCurrent={id:'o'+step.number,imageSha256:sha(frame.bytes),visibleText:result.config.vision.mode==='full'?[...step.audit!.screen.text]:[],fixation:{...step.vision.fixation},candidateIds:Object.keys(correspondenceCandidates)};
   if(!equal(current,expectedCurrent)||!equal((input.userState as any)?.lastObservation,expectedCurrent)||!equal((step.modelInput?.userState as any)?.lastObservation,expectedCurrent)||!equal((input.observation as any)?.candidateIds,expectedCurrent.candidateIds)||!equal((step.modelInput?.observation as any)?.candidateIds,expectedCurrent.candidateIds))throw Error('CORRESPONDENCE_OBSERVATION_MISMATCH');
   const arriving=result.config.experience?.enabled?arriveExperience(experience,pending,current,execution,result.config.experience):undefined;
   const proposal=archive.prepare(frame,arriving,Object.values(baseAssets).map(asset=>asset.sha256));correspondenceContext=proposal.preparation.context;
   archive.remember(frame);
   if(!equal(step.correspondence?.preparation,proposal.preparation)||!equal(step.correspondence?.archive,archive.snapshot()))throw Error('CORRESPONDENCE_PREPARATION_MISMATCH');
   if(correspondenceContext&&proposal.frame){const prior=proposal.frame;if(seen.get(prior.source.observationId)!==prior.source.imageSha256)throw Error('CORRESPONDENCE_SOURCE_NOT_OBSERVED');let image=Object.keys(baseAssets).find(key=>baseAssets[key].sha256===prior.source.imageSha256);if(!image){image='correspondence_0';baseAssets[image]={file:prior.file,sha256:prior.source.imageSha256};}
    const expected=[{observationId:prior.source.observationId,image,imageSha256:prior.source.imageSha256}];
    if(!equal(input.correspondenceContext,correspondenceContext)||!equal(input.correspondenceObservations,expected)||!equal(baseAssets,assets))throw Error('CORRESPONDENCE_IMAGE_INPUT_MISMATCH');
    if(!equal(step.modelInput?.correspondenceContext,correspondenceContext)||!equal(step.modelInput?.correspondenceObservations,expected)||!equal(step.assetFiles,assets))throw Error('CORRESPONDENCE_ACTION_INPUT_MISMATCH');
   }else if(hasCorrespondence(input)||hasCorrespondence(step.modelInput)||step.correspondence?.record!==undefined||step.correspondence?.annotations!==undefined||!equal(baseAssets,assets))throw Error('UNEXPECTED_CORRESPONDENCE_INPUT');
  }else if(!archive&&(step.correspondence!==undefined||hasCorrespondence(step.modelInput)||hasCorrespondence(d?.modelInput)))throw Error('UNCONFIGURED_CORRESPONDENCE');
  if(d){
   if(result.config.visualHypotheses?.candidateChecks){const current=step.userState?.lastObservation;if(!current||!searchCandidates)throw Error('VISUAL_ACTION_CHECKS_ASSESSMENT_CONTEXT_MISSING');const base=assessmentQuestions(searchCandidates,assessmentSources(d.modelInput,d.assetFiles,current)),expectedIds=Object.keys(base).filter(k=>k.startsWith('effect_')),actualIds=Object.keys(d.questions).filter(k=>k.startsWith('effect_'));if(!equal(expectedIds,actualIds))throw Error('VISUAL_ACTION_CHECKS_EFFECT_IDS_MISMATCH');for(const key of expectedIds){const expected=base[key];if(result.config.experience?.enabled)expected.instructions+=' '+experienceAssessmentInstructions;expected.instructions+=' '+visualActionCheckInstructions;if(result.config.visualHypotheses.priorConditionLinks)expected.instructions+=' '+visualPriorRelationInstructions;if(!equal(d.questions[key],expected))throw Error('VISUAL_ACTION_CHECKS_EFFECT_QUESTION_MISMATCH');}}
   if(d.inputSha256!==sha(JSON.stringify({input:d.modelInput,questions:d.questions,assets:d.assetFiles})))throw new Error('ASSESSMENT_INPUT_HASH_MISMATCH');
   for(const asset of Object.values(d.assetFiles)){if(asset.file!==asset.file.split(/[\\/]/).at(-1))throw new Error('UNSAFE_IMAGE_PATH');if(sha(await readFile(join(directory,asset.file)))!==asset.sha256)throw new Error('ASSESSMENT_IMAGE_HASH_MISMATCH');images++;}
   if(d.assessment){
    if(!d.response||!step.userState?.lastObservation)throw new Error('ASSESSMENT_RESPONSE_MISSING');
    const current=step.userState.lastObservation;
    const sources=assessmentSources(d.modelInput,d.assetFiles,current);
    const candidates:BetaCandidates=Object.fromEntries(Object.keys(d.questions).filter(k=>k.startsWith('effect_')).map(k=>{const id=k.slice(7);return [id,{action:{type:'click',elementId:id},label:id}];}));
    if(result.config.experience?.enabled){
     experience=arriveExperience(experience,pending,current,execution,result.config.experience);pending=undefined;
     if(!equal((d.modelInput.userState as any)?.experience,experience)||!equal(d.modelInput.experienceContext,experienceContext(experience,current)))throw new Error('EXPERIENCE_ARRIVAL_MISMATCH');
    }
    let reasonContext:DeferralReasonContext|undefined;
    if(result.config.deferralReason?.enabled){
     if(sources.some(s=>seen.get(s.observationId)!==s.imageSha256))throw Error('REASON_SOURCE_NOT_PREVIOUSLY_OBSERVED');
     const offered:BetaCandidates=Object.fromEntries(current.candidateIds.map(id=>[id,{action:/^e\d+$/.test(id)?{type:'click',elementId:id}:{type:'stuck'},label:id}]));
     reasonContext=prepareReasonContext(reasonMemory,deferrals!,experience,current,offered,result.config.deferralReason);
     if(!equal(d.modelInput.deferralReasonContext,reasonContext))throw Error('REASON_CONTEXT_MISMATCH');
     checkReasonSources(d.modelInput,reasonContext,result.config.deferralReason);
    }
    const outcomeQuestions=experience?experienceQuestions(experience,sources,result.config.experience?.evidenceMode):{};
    const reasonRequest=reasonContext?reasonQuestions(reasonContext,sources,result.config.deferralReason?.reviewMode):{};
    for(const [key,question] of Object.entries(outcomeQuestions))if(!equal(d.questions[key],question))throw new Error('EXPERIENCE_QUESTION_MISMATCH');
    for(const [key,question] of Object.entries(reasonRequest))if(!equal(d.questions[key],question))throw new Error('REASON_QUESTION_MISMATCH');
    const correspondenceRequest=correspondenceContext?correspondenceQuestions(correspondenceContext):{};
    for(const [key,question]of Object.entries(correspondenceRequest))if(!equal(d.questions[key],question))throw Error('CORRESPONDENCE_QUESTION_MISMATCH');
    const response={...d.response,answers:Object.fromEntries(Object.entries(d.response.answers).filter(([key])=>!Object.hasOwn(outcomeQuestions,key)&&!Object.hasOwn(reasonRequest,key)&&!Object.hasOwn(correspondenceRequest,key)&&!key.startsWith('goalSearch_')&&!key.startsWith('actionRelation_')&&!(inquiryContext&&Object.hasOwn(workingInquiryQuestions(inquiryContext),key))))};
    const assessment=admitAssessment(response,candidates,current,sources);
    if(experience){
     if(Object.keys(outcomeQuestions).length)experience=admitExperience(d.response,experience,sources,result.config.experience?.evidenceMode);
     if(!equal(step.userState.experience,experience)||!equal((step.modelInput?.userState as any)?.experience,experience)||!equal(step.modelInput?.experienceContext,experienceContext(experience,current)))throw new Error('EXPERIENCE_JUDGMENT_MISMATCH');
    }
    let expectedCriteria:Record<string,string>|undefined;
    if(correspondenceContext||result.config.goalSearch?.enabled){const offered=searchCandidates??correspondenceCandidates!;expectedCriteria=Object.fromEntries(Object.entries(offered).map(([id,c])=>[id,c.label]));if(result.config.deliberation?.candidateEffects)expectedCriteria=assessedCriteria(offered,assessment);if(experience)expectedCriteria=experienceCriteria(expectedCriteria,experience,current);}
    if(correspondenceContext){
     const record=admitCorrespondence(d.response,correspondenceContext);if(!equal(step.correspondence?.record,record))throw Error('CORRESPONDENCE_RECORD_MISMATCH');const {rawChoices,...admitted}=record;if(!equal(step.modelInput?.correspondenceAssessment,admitted)||d.modelInput.correspondenceAssessment!==undefined)throw Error('CORRESPONDENCE_ASSESSMENT_INPUT_MISMATCH');
     const before=expectedCriteria!,after=correspondenceCriteria(before,record,experience),annotations=Object.keys(before).filter(id=>before[id]!==after[id]).map(candidateId=>({candidateId,before:before[candidateId],after:after[candidateId]}));
     if(!equal(step.correspondence?.annotations,annotations))throw Error('CORRESPONDENCE_ANNOTATION_MISMATCH');expectedCriteria=after;
    }
    if(result.config.goalSearch?.enabled){
     const record=admitGoalSearch(d.response,result.input.charter.goal,current,searchCandidates!,sources,result.config.goalSearch?.interpretation,{mode:result.config.goalSearch?.evidenceMode,prior:searchMemory});searchMemory=rememberGoalSearch(searchMemory,record,result.config.goalSearch);
     if(!equal(step.goalSearch?.record,record)||!equal(step.goalSearch?.memory,searchMemory)||!equal(step.userState.goalSearch,searchMemory)||!equal((step.modelInput?.userState as any)?.goalSearch,searchMemory))throw Error('GOAL_SEARCH_RECORD_OR_MEMORY_MISMATCH');
     const before=expectedCriteria!,after=goalSearchCriteria(before,searchMemory,result.input.charter.goal,current,experience,step.correspondence?.record),annotations=Object.keys(before).filter(id=>before[id]!==after[id]).map(candidateId=>({candidateId,before:before[candidateId],after:after[candidateId]}));
     if(!equal(step.goalSearch?.annotations,annotations))throw Error('GOAL_SEARCH_ANNOTATION_MISMATCH');expectedCriteria=after;
    }
    if(result.config.actionRelations?.enabled){
     const record=admitActionRelations(d.response,result.input.charter.goal,current,searchCandidates!,sources,result.config.actionRelations?.evidencePolicy);
     if(!equal(step.actionRelations?.record,record)||!equal(step.modelInput?.actionRelations,record))throw Error('ACTION_RELATIONS_RECORD_MISMATCH');
     const before=expectedCriteria!,after=actionRelationCriteria(before,record,result.input.charter.goal,current),annotations=Object.keys(before).filter(id=>before[id]!==after[id]).map(candidateId=>({candidateId,before:before[candidateId],after:after[candidateId]}));
     if(!equal(step.actionRelations?.annotations,annotations))throw Error('ACTION_RELATIONS_ANNOTATION_MISMATCH');expectedCriteria=after;
    }
    if(result.config.visualHypotheses?.candidateChecks){if(!expectedCriteria||!step.visualHypotheses?.record)throw Error('VISUAL_ACTION_CHECKS_SOURCE_MISSING');const checked=visualActionChecks(step.visualHypotheses.record,result.input.charter.goal,current,expectedCriteria,priorProjection);if(!equal(step.visualActionChecks,{record:checked.record,annotations:checked.annotations}))throw Error('VISUAL_ACTION_CHECKS_RECORD_MISMATCH');expectedCriteria=checked.criteria;}
    if(inquiryContext&&inquiryRecord){if(!expectedCriteria)throw Error('WORKING_INQUIRY_CRITERIA_MISSING');const projected=workingInquiryCriteria(expectedCriteria,inquiryContext,inquiryRecord);if(!equal(step.workingInquiry?.annotations,projected.annotations))throw Error('WORKING_INQUIRY_ANNOTATIONS_MISMATCH');expectedCriteria=projected.criteria;}
    if(expectedCriteria&&!equal(step.questions?.nextAction.criteria,expectedCriteria))throw Error('FINAL_ASSESSED_CRITERIA_MISMATCH');
    if(!equal(assessment,d.assessment))throw new Error('ASSESSMENT_RECORD_MISMATCH');
    if(result.config.deferral?.enabled){deferrals=updateDeferrals(deferrals,experience!,current,assessment,result.config.deferral);effectiveDeferrals=deferrals;if(!equal(step.deferral?.state,deferrals))throw new Error('DEFERRAL_STATE_MISMATCH');}
    if(reasonContext){
     const admitted=admitReasons(d.response,reasonContext,deferrals!,sources,result.config.deferralReason!);
     reasonMemory=admitted.memory;effectiveDeferrals=admitted.effectiveDeferrals;
     if(!equal(step.deferralReason,{memory:reasonMemory,record:admitted.record,effectiveState:effectiveDeferrals}))throw Error('REASON_RECORD_MISMATCH');
     if(step.modelInput){
      if(!equal(step.modelInput.deferralReasonContext,reasonContext)||!equal(step.modelInput.reasonObservations,d.modelInput.reasonObservations)||!equal(step.modelInput.deferralReasonMemory,reasonMemory)||!equal(step.modelInput.deferralReasonAssessment,admitted.record))throw Error('REASON_ACTION_INPUT_MISMATCH');
      const actionSources=assessmentSources(step.modelInput,step.assetFiles!,current);
      if(!equal(actionSources,sources))throw Error('REASON_ACTION_SOURCE_MISMATCH');
     }
    }
    assessments++;
   }
  }
  if(result.config.goalSearch?.enabled&&(!d||!d.assessment)&&step.goalSearch&&(!equal(step.goalSearch?.memory,searchMemory)||step.goalSearch?.record!==undefined||step.goalSearch?.annotations!==undefined||!equal((step.modelInput?.userState as any)?.goalSearch,searchMemory)||!equal(step.userState?.goalSearch,searchMemory)))throw Error('GOAL_SEARCH_PARTIAL_STATE_MISMATCH');
  if(step.modelInput&&step.questions&&step.assetFiles&&step.inputSha256!==sha(JSON.stringify({input:step.modelInput,questions:step.questions,assets:step.assetFiles})))throw new Error('MODEL_INPUT_HASH_MISMATCH');
  for(const source of Object.values(step.assetFiles??{})){if(source.file!==source.file.split(/[\\/]/).at(-1))throw new Error('UNSAFE_IMAGE_PATH');if(sha(await readFile(join(directory,source.file)))!==source.sha256)throw new Error('IMAGE_HASH_MISMATCH');images++;}
  if(result.config.experience?.enabled&&step.selection&&step.action&&['UI_PERFORMED','FIXATION_MOVED','REREAD','WAIT_NO_UI'].includes(step.outcome??'')){
   pending=beginExperience(step.userState!.lastObservation!,step.selection.selected,step.action,step.deliberation?.assessment);execution=step.outcome==='UI_PERFORMED'?'performed':'unchanged';
  }
  if(step.selection&&result.config.deferral?.enabled){
   const candidates:BetaCandidates=Object.fromEntries(Object.keys(step.questions!.nextAction.criteria).map(id=>[id,{action:/^e\d+$/.test(id)?{type:'click',elementId:id}:{type:'stuck'},label:id}]));
   const decision=deferralDecision(effectiveDeferrals,step.userState!.lastObservation!,candidates,step.deliberation!.assessment!,step.selection.raw,result.config.deferral);
   if(!equal(step.deferral?.decision,decision))throw new Error('DEFERRAL_DECISION_MISMATCH');
   if(!equal(step.selection.policy?.weights,Object.fromEntries(Object.keys(decision.weights).sort().map(id=>[id,decision.weights[id]]))))throw new Error('DEFERRAL_WEIGHT_MISMATCH');
  }
  if(step.selection){
   const conditional=result.config.deferral?.enabled===true&&result.config.deferral.selectionScope==='ui-conditional';
   if(conditional?step.selection.policy?.scope?.kind!=='ui-conditional-v1':step.selection.policy?.scope!==undefined)throw Error('DEFERRAL_SCOPE_MISMATCH');
   const candidates=conditional?reconstructReplayCandidates(step.audit!.screen,Object.keys(step.selection.raw)):Object.fromEntries(Object.keys(step.selection.raw).map(k=>[k,{action:{type:'stuck' as const},label:k}]));
   const selected=replaySelection(step.selection,candidates);if(selected.selected!==step.selection.selected)throw new Error('SELECTION_MISMATCH');
   if(conditional&&step.action&&!equal(step.action,candidates[selected.selected].action))throw Error('CONDITIONAL_ACTION_MISMATCH');choices++;
  }
 }
 return {runId:result.runId,choices,assessments,images,verified:true,scope:'Saved distribution sampling and actual model input assets only; no API or UI actions reexecuted'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){if(process.argv.length!==3&&!(process.argv.length===4&&process.argv[3]==='--require-final-http'))throw new Error('Usage: npm run replay:virtual-beta -- RUN_DIRECTORY [--require-final-http]');console.log(JSON.stringify(await replayDirectory(process.argv[2],{finalVisualHTTP:process.argv[3]==='--require-final-http'}),null,2));}
