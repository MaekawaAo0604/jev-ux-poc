import {beginInquiryOperation,buildInquiryOutcomeContext,inquiryOutcomeQuestions,admitInquiryOutcome,rememberInquiryOutcome} from '../jev/virtual-beta/inquiry-outcome.js';
import {inquiryOutcomeUserContext,inquiryOutcomeUserMemory,inquiryOutcomeCriteria} from '../jev/virtual-beta/inquiry-outcome-projection.js';
import type {InquiryOutcomeContext,InquiryOutcomeRecord,InquiryOutcomeMemory,PendingInquiryOperation} from '../jev/virtual-beta/inquiry-outcome-contracts.js';
import {buildWorkingInquiryContext,workingInquiryQuestions,admitWorkingInquiry} from '../jev/virtual-beta/working-inquiry.js';
import {workingInquiryCriteria} from '../jev/virtual-beta/working-inquiry-projection.js';
import type {WorkingInquiryContext,WorkingInquiryRecord} from '../jev/virtual-beta/working-inquiry-contracts.js';
import {admitVisualPriorRelations,visualPriorRelationInstructions,type VisualPriorRelationsRecord} from '../jev/virtual-beta/visual-prior-relations.js';
import {betaActionInstructions,experienceAssessmentInstructions} from './virtual-beta-action-instructions.js';
import {visualActionChecks,visualActionCheckInstructions,type VisualActionCheckRecord} from '../jev/virtual-beta/visual-action-checks.js';
import {planVisualDispatch,type VisualDispatchTiming} from './visual-dispatch-timing.js';
import {conditionContinuityGuidance,conditionContinuityUserRecord} from './condition-continuity-guidance.js';
import {emptyConditionContinuity,admitConditionContinuity,type ConditionContinuityRecord} from '../jev/virtual-beta/condition-continuity.js';
import {visualHypothesisInput} from './visual-hypothesis-input.js';
import {admitVisualHypotheses,rememberVisualHypotheses} from '../jev/virtual-beta/visual-hypotheses.js';
import {validateVisualHTTPDispatch,type VisualHTTPDispatch} from '../jev/virtual-beta/visual-http-timing.js';
import {VisualHypothesisTransportError,type VisualHypothesisExtractor,type VisualHypothesisRequest,type VisualHypothesisResponse,type VisualHypothesisRecord,type VisualHypothesisMemory} from '../jev/virtual-beta/visual-hypotheses-contracts.js';
import {actionRelationQuestions,admitActionRelations,actionRelationCriteria,type ActionRelationRecord} from '../jev/virtual-beta/action-relations.js';
import {recoveryDefinition,recoveryQuery,type RecoveryFixture} from '../app/recovery-fixture.js';
import {readRecoverySnapshot,checkRecoveryObjective} from './recovery-oracle.js';
import type {RecoveryAuditSnapshot} from './recovery-contracts.js';
import {transferDefinition,transferQuery,type TransferFixture} from '../app/transfer-fixture.js';
import {checkTransferObjective} from './transfer-oracle.js';
import {goalSearchQuestions,admitGoalSearch,rememberGoalSearch,goalSearchCriteria,goalSearchInstructions} from '../jev/virtual-beta/goal-search.js';
import type {GoalSearchEntry,GoalSearchMemory} from '../jev/virtual-beta/goal-search-contracts.js';
import {createCorrespondenceArchive,correspondenceQuestions,admitCorrespondence,correspondenceCriteria} from '../jev/virtual-beta/correspondence.js';
import type {CorrespondencePreparation,CorrespondenceContext,CorrespondenceRecord,CorrespondenceArchiveEntry} from '../jev/virtual-beta/correspondence-contracts.js';
import {BudgetPersistenceError,type BudgetPersistenceDetails} from './budget-persistence.js';
import {prepareReasonContext,requiredReasonSources,reasonQuestions,admitReasons} from '../jev/virtual-beta/deferral-reason.js';
import type {DeferralReasonMemory,DeferralReasonRecord} from '../jev/virtual-beta/deferral-reason-contracts.js';
import {holdoutQuery,holdoutDefinition,type HoldoutFixture} from '../app/holdout-fixture.js';
import {copyDeferrals,updateDeferrals,deferralDecision} from '../jev/virtual-beta/deferral.js';
import type {DeferralMemory,DeferralDecision} from '../jev/virtual-beta/deferral-contracts.js';
import {beginExperience,arriveExperience,experienceQuestions,admitExperience,experienceContext,experienceCriteria,experienceInstructions} from '../jev/virtual-beta/experience.js';
import type {ExperienceIntent} from '../jev/virtual-beta/experience-contracts.js';
import {assessmentQuestions,admitAssessment,carryDeliberation,recordAssessment,assessedCriteria,actionDeliberationInstructions} from '../jev/virtual-beta/deliberation.js';
import type {DeliberationAssessment} from '../jev/virtual-beta/deliberation-contracts.js';
import type {Page} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {LocalExplorationPage} from '../pages/LocalExplorationPage.js';
import {candidatesFor,type Action,type Candidate,type State,type Observation} from '../jev/types.js';
import {filterCandidates,publicExploration,type Charter,type Persona} from '../jev/persona.js';
import {requestFor} from '../jev/decide.js';
import {validateChoice,safeRequestFailure,ChoiceRequestError,type ChoiceAnswers,type ChoiceQuestion} from '../jev/client.js';
import {goals} from '../tests/goals.js';
import {transformVision,visionCandidates} from '../jev/virtual-beta/vision.js';
import {createUserState,updateUserState} from '../jev/virtual-beta/user-state.js';
import {createSampler,InvalidDistributionError,type SelectionFailureDetails} from '../jev/virtual-beta/selection.js';
import {validateConfig} from '../jev/virtual-beta/config.js';
import type {BetaAction,BetaCandidates,BetaConfig,BetaInput,SelectionRecord,VisionTarget,Termination,UserObservation,UserState,VisionObservation} from '../jev/virtual-beta/contracts.js';
export const sha=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
import type {AuditROI,BetaUIIdentity} from '../jev/virtual-beta/ui-types.js';
import type {SemanticTrial,SemanticRunAudit} from '../jev/virtual-beta/semantic-types.js';
import {semanticQuery,semanticDefinition,semanticROIs} from '../app/semantic-fixture.js';
export type ModelRequest={input:Record<string,unknown>;questions:Record<string,ChoiceQuestion>;timeoutMs:number;images:Record<string,{mediaType:'image/png';data:string}>};
export class BetaBudgetError extends Error{constructor(public kind:'API_LIMIT'|'TIME_LIMIT'){super(kind);}}
export class BetaAdmissionError extends Error{
 readonly code='BUDGET_ADMISSION_ERROR';readonly persistence?:BudgetPersistenceDetails;readonly boundary:'reservation'|'deadline-settlement';
 constructor(details?:BudgetPersistenceDetails,boundary:'reservation'|'deadline-settlement'='reservation'){super('BUDGET_ADMISSION_ERROR');this.persistence=details?new BudgetPersistenceError(details).details:undefined;this.boundary=boundary==='deadline-settlement'?'deadline-settlement':'reservation';}
}
export class BetaSettlementError extends Error{
 readonly code='BUDGET_SETTLEMENT_AFTER_REQUEST';readonly persistence?:BudgetPersistenceDetails;readonly requestOutcome:'response'|'error';
 constructor(details?:BudgetPersistenceDetails,requestOutcome:'response'|'error'='response'){super('BUDGET_SETTLEMENT_AFTER_REQUEST');this.persistence=details?new BudgetPersistenceError(details).details:undefined;this.requestOutcome=requestOutcome==='error'?'error':'response';}
}
export function betaBudgetFailureEvidence(error:BetaAdmissionError|BetaSettlementError){
 return error instanceof BetaAdmissionError?{code:error.code,...(error.persistence?{boundary:error.boundary,persistence:{...error.persistence}}:{})}:{code:error.code,requestOutcome:error.requestOutcome,...(error.persistence?{persistence:{...error.persistence}}:{})};
}
/** Retain only internally constructed safe request metadata, including image binding evidence. */
function choiceFailureEvidence(error:unknown){
 const failure=safeRequestFailure(error);
 if(!(error instanceof ChoiceRequestError)||!error.request)return failure;
 const trace=error.request;
 return {...failure,request:{attempts:trace.attempts,failures:trace.failures.map(f=>({code:f.code,...(f.statusCode?{statusCode:f.statusCode}:{}),...(f.providerCode?{providerCode:f.providerCode}:{}),...(f.providerType?{providerType:f.providerType}:{})})),...(trace.elapsedMs===undefined?{}:{elapsedMs:trace.elapsedMs}),...(trace.longContext?{longContext:true}:{}),...(trace.budgetExhausted?{budgetExhausted:true}:{}),...(trace.imageBindings?{imageBindings:structuredClone(trace.imageBindings)}:{})}};
}
export class BetaResponseError extends Error{constructor(public kind:'API_ERROR'|'INVALID_DISTRIBUTION',public code:'MODEL_MISMATCH'|'INVALID_RESPONSE'|'INVALID_DISTRIBUTION',public response:ChoiceAnswers){super(code);}}
export type BetaEvaluator=(request:ModelRequest)=>Promise<ChoiceAnswers>;
export type BetaStep={number:number;inquiryOutcome?:{context:InquiryOutcomeContext;record?:InquiryOutcomeRecord|null;memory?:InquiryOutcomeMemory;operation?:PendingInquiryOperation;annotations?:{candidateId:string;before:string;after:string}[]};workingInquiry?:{context:WorkingInquiryContext;record?:WorkingInquiryRecord;annotations?:{candidateId:string;before:string;after:string}[]};visualPriorRelations?:VisualPriorRelationsRecord;visualActionChecks?:{record:VisualActionCheckRecord;annotations:{candidateId:string;before:string;after:string}[]};conditionContinuity?:ConditionContinuityRecord;visualHypotheses?:{request:Omit<VisualHypothesisRequest,'images'|'timeoutMs'>;assetFiles:Record<string,{file:string;sha256:string}>;inputSha256:string;response?:VisualHypothesisResponse;record?:VisualHypothesisRecord;memory?:VisualHypothesisMemory;apiCalls:number;measurementError?:'MISSING_VISUAL_HTTP_DISPATCH';timing?:{apiMs:number;dispatch?:VisualDispatchTiming;httpDispatch?:VisualHTTPDispatch};error?:unknown};actionRelations?:{record:ActionRelationRecord;annotations:{candidateId:string;before:string;after:string}[]};goalSearch?:{record?:GoalSearchEntry;memory:GoalSearchMemory;annotations?:{candidateId:string;before:string;after:string}[]};correspondence?:{preparation:CorrespondencePreparation;archive:CorrespondenceArchiveEntry[];record?:CorrespondenceRecord;annotations?:{candidateId:string;before:string;after:string}[]};deferralReason?:{memory:DeferralReasonMemory;record:DeferralReasonRecord;effectiveState:DeferralMemory};deferral?:{state:DeferralMemory;decision?:DeferralDecision};deliberation?:{modelInput:Record<string,unknown>;questions:Record<string,ChoiceQuestion>;assetFiles:Record<string,{file:string;sha256:string}>;inputSha256:string;response?:ChoiceAnswers;assessment?:DeliberationAssessment;apiCalls:number;timing?:{apiMs:number};error?:unknown};observationId?:string;audit?:{recovery?:RecoveryAuditSnapshot;screen:Observation;url:string;rawScreenshot:string;sourceSha256:string;targets?:VisionTarget[];regionsOfInterest?:AuditROI[]};vision?:Omit<VisionObservation,'bytes'>;userState?:UserState;modelInput?:Record<string,unknown>;questions?:Record<string,ChoiceQuestion>;assetFiles?:Record<string,{file:string;sha256:string}>;inputSha256?:string;response?:ChoiceAnswers;selection?:SelectionRecord;selectionFailure?:SelectionFailureDetails;reasonEvidence?:{category:string;observationId:string;kind:'model-self-report';proposedChoice:string;selectedChoice:string};action?:BetaAction;outcome?:string;error?:unknown;objectiveSuccess?:boolean;counts?:{looks:number;uiActions:number};timing?:{apiMs:number;uiMs:number;modeledUserMs:number|null}};
export type BetaResult={schemaVersion:1;measurement?:{visualDispatch:'client-timeout-v1';visualHTTP?:'final-timeout-v1'};transport?:{jevImageReferences:'opaque-v1'};runId:string;condition:string;code?:{revision:string;sourceHash:string};uiVersion?:BetaUIIdentity;recovery?:{fixture:RecoveryFixture;definitionHash:string;initialProductImage:{file:string;sha256:string};terminalSnapshot?:RecoveryAuditSnapshot};transfer?:{fixture:TransferFixture;definitionHash:string;initialProductImage:{file:string;sha256:string}};holdout?:{fixture:HoldoutFixture;definitionHash:string;initialProductImage:{file:string;sha256:string}};semantic?:SemanticRunAudit;config:BetaConfig;input:BetaInput;initialFingerprint:string|null;objectiveSuccess:boolean;perceivedDone:boolean;termination:Termination;looks:number;uiActions:number;decisions:number;apiCalls:number;apiMs:number;uiMs:number;modeledUserMs:number|null;elapsedMs:number;terminalObservation:{status:'RECORDED'|'ERROR';code?:'OBSERVATION_ERROR'};objectiveAssessment:{status:'OK'|'ERROR';value:boolean|null;code?:'ORACLE_ERROR'};validForComparison:boolean;steps:BetaStep[]};
const reasonQuestion:ChoiceQuestion={type:'choice',instructions:'Report a short category explaining the proposed nextAction using this observation. This is a self report, not a record of internal reasoning. Do not change the action to fit the category.',criteria:{goal:'Goal relevance',clarity:'Readable explanation',efficiency:'Fewer operations',confirmation:'Checking safety or result',uncertainty:'Unclear next step',other:'Other'}};
/** Allowlist boundary: never spread audit State, raw screen, targets or history into constrained input. */
export function modelInput(input:BetaInput,vision:VisionObservation,observation:UserObservation,state:UserState,config:BetaConfig,screen:Observation,history:State['history']):Record<string,unknown>{
 const exploration=publicExploration(input);
 return {goal:input.charter.goal,currentDate:input.charter.initialState.currentDate,exploration,observation:{id:observation.id,image:'current',width:vision.width,height:vision.height,viewport:{width:vision.sourceWidth,height:vision.sourceHeight},fixation:vision.fixation,clearRect:vision.clearRect,transform:vision.transform,candidateIds:observation.candidateIds,...(config.vision.mode==='full'?{screen:{title:screen.title,text:[...screen.text],elements:screen.elements.map(e=>({id:e.id,type:e.type,text:e.text})),canScrollUp:screen.canScrollUp,canScrollDown:screen.canScrollDown}}:{})},...(config.state.enabled?{userState:structuredClone(state)}:config.vision.mode==='full'?{history:structuredClone(history)}:{})};
}
export function offeredCandidates(original:Record<string,Candidate>,vision:VisionObservation,config:BetaConfig):BetaCandidates{
 const result:BetaCandidates={...original};
 if(config.vision.mode!=='full'||config.state.enabled)for(const [i,point] of [{x:320,y:225},{x:960,y:225},{x:320,y:675},{x:960,y:675}].entries())result['look_'+i]={action:{type:'look',point},label:'Look at viewport point '+JSON.stringify(point)};
 if(config.state.enabled){result.reread={action:{type:'reread'},label:'Read the current visible area again'};result.wait={action:{type:'wait'},label:'Wait without operating the UI'};result.abandon={action:{type:'abandon'},label:'Give up on this goal'};}
 return visionCandidates(result,vision);
}
export async function executeBetaAction(pom:LocalExplorationPage,action:BetaAction,state:UserState):Promise<{ui:boolean;look:boolean;fixation:UserState['fixation']}>{
 if(action.type==='look')return {ui:false,look:true,fixation:{...action.point}};
 if(['reread','wait','done','stuck','abandon'].includes(action.type))return {ui:false,look:false,fixation:{...state.fixation}};
 await pom.act(action as Action);return {ui:true,look:false,fixation:{...state.fixation}};
}
export async function runBeta(page:Page,args:{nativeHTTPMeasurement?:boolean;jevImageReferences?:'opaque-v1';runId:string;dir:string;baseURL:string;charter:Charter;persona?:Persona;config:BetaConfig;evaluate:BetaEvaluator;extract?:VisualHypothesisExtractor;preserveDisplay?:boolean;semanticTrial?:SemanticTrial;holdoutFixture?:HoldoutFixture;transferFixture?:TransferFixture;recoveryFixture?:RecoveryFixture;uiVersion?:BetaUIIdentity;roiSelectors?:Record<string,string>;code?:{revision:string;sourceHash:string};isSafetyStopped?:()=>boolean}):Promise<BetaResult>{
 if(args.preserveDisplay&&!args.semanticTrial)throw new Error('PRESERVATION_REQUIRES_SEMANTIC_FIXTURE');
 const recoveryDefinitionValue=args.recoveryFixture?recoveryDefinition(args.recoveryFixture):undefined;
 if(args.recoveryFixture&&(args.transferFixture||args.holdoutFixture||args.semanticTrial||args.uiVersion||args.preserveDisplay))throw Error('CONFLICTING_FIXTURES');
 if(args.recoveryFixture&&(args.charter.targetWebsite!=='local:good'||args.charter.goal!==recoveryDefinitionValue!.goal))throw Error('RECOVERY_CHARTER_MISMATCH');
 const transferDefinitionValue=args.transferFixture?transferDefinition(args.transferFixture):undefined;
 if(args.transferFixture&&(args.holdoutFixture||args.semanticTrial||args.uiVersion||args.preserveDisplay))throw Error('CONFLICTING_FIXTURES');
 if(args.transferFixture&&(args.charter.targetWebsite!=='local:good'||args.charter.goal!==transferDefinitionValue!.goal))throw Error('TRANSFER_CHARTER_MISMATCH');
 const holdoutDefinitionValue=args.holdoutFixture?holdoutDefinition(args.holdoutFixture):undefined;
 if(args.holdoutFixture&&(args.semanticTrial||args.uiVersion||args.preserveDisplay))throw new Error('CONFLICTING_FIXTURES');
 if(args.holdoutFixture&&(args.charter.targetWebsite!=='local:good'||args.charter.goal!==holdoutDefinitionValue!.goal))throw new Error('HOLDOUT_CHARTER_MISMATCH');
 const checkObjective=async()=>{if(args.recoveryFixture)return checkRecoveryObjective(page,args.recoveryFixture);if(args.transferFixture)return checkTransferObjective(page,args.transferFixture);if(holdoutDefinitionValue){const complete=page.locator('[data-holdout-complete="true"]');const count=await complete.count();if(count>1)throw new Error('AMBIGUOUS_HOLDOUT_ORACLE');return count===1&&await complete.isVisible()&&await page.getByRole('status').filter({hasText:holdoutDefinitionValue.objectiveText}).isVisible();}const mail=await goals[args.charter.oracle].check(page,[]);if(!args.preserveDisplay)return mail;const changes=await page.locator('.semantic-display-state').getAttribute('data-change-count');if(changes===null||!/^\d+$/.test(changes))throw new Error('SEMANTIC_PRESERVATION_AUDIT_MISSING');return mail&&changes==='0';};
 const config=validateConfig(args.config),input=publicExploration({charter:args.charter,...(args.persona?{persona:args.persona}:{})});
 if(config.visualHypotheses?.enabled&&!args.extract)throw Error('VISUAL_EXTRACTOR_REQUIRED');
 if(args.uiVersion||args.semanticTrial||args.holdoutFixture||args.transferFixture||args.recoveryFixture){if(args.uiVersion&&args.semanticTrial)throw new Error('CONFLICTING_FIXTURES');if(args.charter.targetWebsite!=='local:good')throw new Error('COMPARISON_UI_REQUIRES_LOCAL_GOOD');input.charter={...input.charter,id:args.recoveryFixture?'recovery-task':args.holdoutFixture||args.transferFixture?'holdout-task':'notification-task',targetWebsite:'local:demo'};}
 await mkdir(args.dir,{recursive:true});
 const pom=new LocalExplorationPage(page,true,true),sampler=createSampler(config.selection),steps:BetaStep[]=[],started=performance.now();
 let user=createUserState(args.persona,config.initialFixation??{x:640,y:450}),history:State['history']=[],looks=0,uiActions=0,apiCalls=0,apiMs=0,uiMs=0,objectiveSuccess=false,perceivedDone=false,initialFingerprint:string|null=null,termination:Termination='DECISION_LIMIT';
 const memoryImages=new Map<string,{bytes:Buffer;file:string}>();
 const correspondence=config.correspondence?.enabled?createCorrespondenceArchive(config.correspondence):undefined;
 let deferrals=config.deferral?.enabled?copyDeferrals(undefined,config.deferral):undefined;
 let reasonMemory:DeferralReasonMemory|undefined;
 let effectiveDeferrals=deferrals;
 let inquiryOutcomeMemory:InquiryOutcomeMemory={schemaVersion:1,entries:[]},pendingInquiry:PendingInquiryOperation|null=null;
 let pendingIntent:ExperienceIntent|undefined;
 let pendingEvent:{action:BetaAction;outcome:'performed'|'failed'|'unchanged'}|undefined;
 let semantic:SemanticRunAudit|undefined;
 let holdout:BetaResult['holdout'];
 let transfer:BetaResult['transfer'];
 let recovery:BetaResult['recovery'];
 const auditROIs=args.semanticTrial?semanticROIs:args.roiSelectors;
 try{
 await page.goto(args.baseURL+'/'+(args.charter.targetWebsite==='local:good'?'good':'bad')+'/'+(args.recoveryFixture?recoveryQuery(args.recoveryFixture):args.transferFixture?transferQuery(args.transferFixture):args.holdoutFixture?holdoutQuery(args.holdoutFixture):args.semanticTrial?semanticQuery(args.semanticTrial.fixture):args.uiVersion?'?betaUI='+args.uiVersion.token:''),{waitUntil:'networkidle',timeout:Math.max(1,Math.min(30000,Math.floor(config.maxRunMs-(performance.now()-started))))});
 if(args.recoveryFixture){const file='initial-product.png',bytes=await page.screenshot();await writeFile(join(args.dir,file),bytes);recovery={fixture:structuredClone(args.recoveryFixture),definitionHash:sha(JSON.stringify(recoveryDefinitionValue)),initialProductImage:{file,sha256:sha(bytes)}};}
 if(args.transferFixture){const file='initial-product.png',bytes=await page.screenshot();await writeFile(join(args.dir,file),bytes);transfer={fixture:structuredClone(args.transferFixture),definitionHash:sha(JSON.stringify(transferDefinitionValue)),initialProductImage:{file,sha256:sha(bytes)}};}
 if(args.holdoutFixture){const file='initial-product.png',bytes=await page.screenshot();await writeFile(join(args.dir,file),bytes);holdout={fixture:structuredClone(args.holdoutFixture),definitionHash:sha(JSON.stringify(holdoutDefinitionValue)),initialProductImage:{file,sha256:sha(bytes)}};}
 if(args.semanticTrial){const file='initial-product.png',bytes=await page.screenshot();await writeFile(join(args.dir,file),bytes);semantic={objectivePolicy:args.preserveDisplay?'mail-and-display-preserved':'mail-only',trial:structuredClone(args.semanticTrial),definitionHash:sha(JSON.stringify(semanticDefinition(args.semanticTrial.fixture))),initialProductImage:{file,sha256:sha(bytes)}};}
 for(let number=1;number<=config.maxDecisions;number++){
  if(args.isSafetyStopped?.()){termination='SAFETY_STOP';break;}
  if(performance.now()-started>=config.maxRunMs){termination='TIME_LIMIT';break;}
  if(apiCalls>=config.maxAPICalls){termination='API_LIMIT';break;}
  if(uiActions>=Math.min(config.maxUIActions,args.charter.maxActions)){termination='UI_ACTION_LIMIT';break;}
  const step:BetaStep={number};steps.push(step);
  try{
   const screen=await pom.observe(false),rawCandidates=filterCandidates(candidatesFor(screen,pom.canGoBack),screen,args.charter);
   const capture=await pom.captureDecisionScreenshot(screen,rawCandidates),rawFile='audit-'+number+'.png';await writeFile(join(args.dir,rawFile),capture.bytes);
   const regionsOfInterest:AuditROI[]=[];
   for(const [id,selector] of Object.entries(auditROIs??{})){const locator=page.locator(selector);const count=await locator.count();if(count>1)throw new Error('AMBIGUOUS_AUDIT_ROI');if(count===1&&await locator.isVisible()){const rect=await locator.boundingBox();if(rect)regionsOfInterest.push({id,rect,definition:'element-client-rect'});}}
   step.audit={screen,url:page.url(),rawScreenshot:rawFile,sourceSha256:sha(capture.bytes),targets:capture.targets.map(t=>({id:t.id,x:t.x,y:t.y,width:t.width,height:t.height,...(t.badge?{badge:{...t.badge}}:{})})),...(auditROIs?{regionsOfInterest}:{})};
   if(args.recoveryFixture)step.audit.recovery=await readRecoverySnapshot(page,args.recoveryFixture);
   const vision=transformVision(capture.bytes,config.vision,user.fixation,capture.targets),{bytes,...metadata}=vision;
   step.vision=metadata;
   const imageFile='input-'+number+'.png';await writeFile(join(args.dir,imageFile),bytes);
   const candidates=offeredCandidates(rawCandidates,vision,config),excluded:Record<string,string>={};
   for(const [id,c] of Object.entries(candidates))if(c.action.type==='look'&&looks>=config.maxLooks)excluded[id]='LOOK_BUDGET_EXHAUSTED';
   const observation:UserObservation={id:'o'+number,imageSha256:vision.imageSha256,visibleText:config.vision.mode==='full'?[...screen.text]:[],fixation:{...user.fixation},candidateIds:Object.keys(candidates)};
   const previousUser=user;user=updateUserState(user,observation,config.state,pendingEvent);if(config.deliberation?.enabled)user=carryDeliberation(previousUser,user,config.deliberation);if(config.experience?.enabled)user={...user,experience:arriveExperience(previousUser.experience,pendingIntent,observation,pendingEvent?.outcome==='performed'?'performed':'unchanged',config.experience)};if(config.goalSearch?.enabled){user={...user,goalSearch:structuredClone(previousUser.goalSearch??{schemaVersion:1,entries:[]})};step.goalSearch={memory:structuredClone(user.goalSearch!)};}if(config.visualHypotheses?.enabled)user={...user,visualHypotheses:structuredClone(previousUser.visualHypotheses??{schemaVersion:1,records:[]})};if(config.visualHypotheses?.continuity)user={...user,conditionContinuity:structuredClone(previousUser.conditionContinuity??emptyConditionContinuity(input.charter.goal))};pendingEvent=undefined;pendingIntent=undefined;step.userState=structuredClone(user);step.observationId=observation.id;
   memoryImages.set(vision.imageSha256,{bytes,file:imageFile});
   const wire=modelInput(input,vision,observation,user,config,screen,history);
   if(user.experience)wire.experienceContext=experienceContext(user.experience,observation);
   const assetFiles:NonNullable<BetaStep['assetFiles']>={current:{file:imageFile,sha256:vision.imageSha256}},images:ModelRequest['images']={current:{mediaType:'image/png',data:bytes.toString('base64')}};
   if(config.state.enabled){
    const referenceByHash=new Map([[vision.imageSha256,'current']]);
    wire.memoryObservations=user.memory.map((memory,i)=>{
     const source=memoryImages.get(memory.imageSha256);if(!source)throw new Error('USER_MEMORY_IMAGE_MISSING');
     let id=referenceByHash.get(memory.imageSha256);if(!id){id='memory_'+i;referenceByHash.set(memory.imageSha256,id);images[id]={mediaType:'image/png',data:source.bytes.toString('base64')};assetFiles[id]={file:source.file,sha256:memory.imageSha256};}
     return {observationId:memory.observationId,image:id,imageSha256:memory.imageSha256};
    });
   }
   const reasonContext=config.deferralReason?.enabled?prepareReasonContext(reasonMemory,deferrals!,user.experience,observation,candidates,config.deferralReason):undefined;
   const reasonBasis=reasonContext?requiredReasonSources(reasonContext,config.deferralReason!):[];
   if(reasonContext){
    wire.deferralReasonContext=reasonContext;
    wire.reasonObservations=reasonBasis.map((source,i)=>{const retained=memoryImages.get(source.imageSha256);if(!retained)throw new Error('RETAINED_REASON_IMAGE_MISSING');let image=Object.keys(assetFiles).find(id=>assetFiles[id].sha256===source.imageSha256);if(!image){image='reason_'+i;images[image]={mediaType:'image/png',data:retained.bytes.toString('base64')};assetFiles[image]={file:retained.file,sha256:source.imageSha256};}return {observationId:source.observationId,image,imageSha256:source.imageSha256};});
   }
   let correspondenceContext:CorrespondenceContext|undefined;
   if(correspondence){
    const frame={source:{observationId:observation.id,imageSha256:observation.imageSha256},bytes,file:imageFile,clickCandidateIds:Object.keys(candidates).filter(id=>candidates[id].action.type==='click')};
    const proposal=correspondence.prepare(frame,user.experience,Object.values(assetFiles).map(asset=>asset.sha256));
    step.correspondence={preparation:proposal.preparation,archive:[]};correspondenceContext=proposal.preparation.context;
    if(correspondenceContext&&proposal.frame){const prior=proposal.frame;wire.correspondenceContext=structuredClone(correspondenceContext);let image=Object.keys(assetFiles).find(key=>assetFiles[key].sha256===prior.source.imageSha256);if(!image){image='correspondence_0';images[image]={mediaType:'image/png',data:prior.bytes.toString('base64')};assetFiles[image]={file:prior.file,sha256:prior.source.imageSha256};}wire.correspondenceObservations=[{observationId:prior.source.observationId,image,imageSha256:prior.source.imageSha256}];}
    correspondence.remember(frame);step.correspondence.archive=correspondence.snapshot();
   }
   const correspondenceBasis=correspondenceContext?[correspondenceContext.prior]:[];
   // No semantic target geometry or unavailable controls cross this boundary.
   const instructions=requestFor({goal:input.charter.goal,currentDate:input.charter.initialState.currentDate,screen,history:[]},rawCandidates,'').questions.nextAction.instructions;
   const next:ChoiceQuestion={type:'choice',instructions:betaActionInstructions(config,instructions),criteria:Object.fromEntries(Object.entries(candidates).map(([k,c])=>[k,c.label]))};
   const questions={nextAction:next,decisionBasis:reasonQuestion};step.modelInput=wire;step.questions=questions;step.assetFiles=assetFiles;step.inputSha256=sha(JSON.stringify({input:wire,questions,assets:assetFiles}));
   if(!initialFingerprint)initialFingerprint=sha(JSON.stringify({screen,sourceSha256:sha(capture.bytes)}));
   if(performance.now()-started>=config.maxRunMs){termination='TIME_LIMIT';step.outcome='DEADLINE_BEFORE_INFERENCE';step.timing={apiMs:0,uiMs:0,modeledUserMs:null};break;}
   if(config.deliberation?.enabled){
    const sources=[...new Map([...user.memory.map(m=>({observationId:m.observationId,imageSha256:m.imageSha256})),...reasonBasis,...correspondenceBasis,{observationId:observation.id,imageSha256:observation.imageSha256}].map(s=>[s.observationId,s])).values()];
    if(config.visualHypotheses?.enabled){
     if(args.isSafetyStopped?.()){termination='SAFETY_STOP';step.outcome=termination;break;}
     const dispatch=planVisualDispatch(config.maxRunMs,performance.now()-started,config.visualHypotheses.requestTimeoutMs);
     const timeoutMs=dispatch?.timeoutMs??0;
     if(timeoutMs<=0){termination='TIME_LIMIT';step.outcome='DEADLINE_BEFORE_VISUAL_EXTRACTION';break;}
     const request=visualHypothesisInput({...(config.visualHypotheses.priorConditionLinks!==undefined?{priorConditionLinks:config.visualHypotheses.priorConditionLinks}:{}),...(config.visualHypotheses.requestTimeoutMs!==undefined?{timeoutCapMs:config.visualHypotheses.requestTimeoutMs}:{}),...(config.visualHypotheses.continuity?{continuityCapacity:config.visualHypotheses.continuity.capacity,...(config.visualHypotheses.continuity.retentionPolicy!==undefined?{continuityRetentionPolicy:config.visualHypotheses.continuity.retentionPolicy}:{})}:{}),goal:input.charter.goal,currentDate:input.charter.initialState.currentDate,...(input.persona?{persona:input.persona}:{}),current:{observationId:observation.id,imageSha256:observation.imageSha256},sources,candidates,user,images,assets:assetFiles,timeoutMs});
     const {images:_images,timeoutMs:_timeout,...metadata}=request;
     const v:NonNullable<BetaStep['visualHypotheses']>={request:metadata,assetFiles:structuredClone(assetFiles),inputSha256:sha(JSON.stringify({input:metadata,assets:assetFiles})),apiCalls:0};step.visualHypotheses=v;
     let admitted=true,httpDispatch:VisualHTTPDispatch|undefined;const before=performance.now();apiCalls++;
     try{v.response=await args.extract!(request,{onHTTPDispatch:trace=>{if(httpDispatch)throw Error('DUPLICATE_VISUAL_HTTP_DISPATCH');httpDispatch=validateVisualHTTPDispatch(trace,request.timeoutMs,request.timeoutCapMs);}});if(args.nativeHTTPMeasurement&&!httpDispatch){termination='API_ERROR';v.error={code:'VISUAL_HTTP_MEASUREMENT_ERROR'};step.error=v.error;step.outcome='VISUAL_EXTRACTION_AUDIT_ERROR';break;}}
     catch(error){if(error instanceof BetaBudgetError){admitted=false;apiCalls--;termination=error.kind;v.error={code:error.kind};}else if(error instanceof BetaAdmissionError){admitted=false;apiCalls--;termination='API_ERROR';v.error=betaBudgetFailureEvidence(error);}else if(error instanceof BetaSettlementError){termination='API_ERROR';v.error=betaBudgetFailureEvidence(error);}else{termination='API_ERROR';v.error=error instanceof VisualHypothesisTransportError?{...error.evidence}: {code:'VISUAL_EXTRACTION_REQUEST_FAILED'};}step.error=v.error;step.outcome='VISUAL_EXTRACTION_ERROR';break;}
     finally{v.apiCalls=admitted?1:0;if(args.nativeHTTPMeasurement&&admitted&&!httpDispatch&&(v.error as any)?.attempts!==0)v.measurementError='MISSING_VISUAL_HTTP_DISPATCH';const ms=admitted?performance.now()-before:0;v.timing={apiMs:ms,dispatch:dispatch!,...(httpDispatch?{httpDispatch}:{})};apiMs+=ms;step.timing={apiMs:ms,uiMs:0,modeledUserMs:config.modeledActionMs};}
     if(performance.now()-started>=config.maxRunMs){termination='TIME_LIMIT';step.outcome='VISUAL_EXTRACTION_AFTER_DEADLINE';break;}
     try{v.record=admitVisualHypotheses(v.response!,request);v.memory=rememberVisualHypotheses(user.visualHypotheses,v.record,config.visualHypotheses.capacity);user={...user,visualHypotheses:structuredClone(v.memory)};if(request.conditionContinuity){step.conditionContinuity=admitConditionContinuity((v.response!.output as any).continuity,request.conditionContinuity,v.record);user={...user,conditionContinuity:structuredClone(step.conditionContinuity.after)};wire.conditionContinuity=conditionContinuityUserRecord(step.conditionContinuity);}if(config.visualHypotheses.priorConditionLinks){const links=admitVisualPriorRelations((v.response!.output as any).relations.map((r:any)=>({candidateId:r.candidateId,priorConditionIds:r.priorConditionIds})),request,v.record);step.visualPriorRelations=links;wire.visualPriorRelations=structuredClone(links);}wire.visualHypotheses=structuredClone(v.record);wire.userState=structuredClone(user);step.userState=structuredClone(user);step.inputSha256=sha(JSON.stringify({input:wire,questions,assets:assetFiles}));}
     catch{termination='API_ERROR';v.error={code:'INVALID_VISUAL_HYPOTHESES',status:v.response!.status};step.error=v.error;step.outcome='VISUAL_EXTRACTION_OUTPUT_ERROR';break;}
     if(apiCalls>=config.maxAPICalls){termination='API_LIMIT';step.outcome='VISUAL_EXTRACTION_ONLY_API_LIMIT';break;}
    }
    if(config.visualHypotheses?.workingInquiry){const context=buildWorkingInquiryContext({request:{...step.visualHypotheses!.request,images,timeoutMs:step.visualHypotheses!.timing!.dispatch!.timeoutMs},record:step.visualHypotheses!.record!,continuity:step.conditionContinuity!,prior:step.visualPriorRelations!});step.workingInquiry={context};wire.workingInquiryContext=structuredClone(context);step.inputSha256=sha(JSON.stringify({input:wire,questions,assets:assetFiles}));}
    if(config.visualHypotheses?.inquiryOutcome){const context=buildInquiryOutcomeContext({observationId:observation.id,imageSha256:observation.imageSha256},sha(input.charter.goal),pendingInquiry,inquiryOutcomeMemory);step.inquiryOutcome={context};wire.inquiryOutcomeContext=inquiryOutcomeUserContext(context);step.inputSha256=sha(JSON.stringify({input:wire,questions,assets:assetFiles}));}
    const inquiryOutcomeRequest=step.inquiryOutcome?inquiryOutcomeQuestions(step.inquiryOutcome.context):{};
    const inquiryRequest=step.workingInquiry?workingInquiryQuestions(step.workingInquiry.context):{};
    const outcomeQuestions=user.experience?experienceQuestions(user.experience,sources,config.experience?.evidenceMode):{};
    const reasonRequest=reasonContext?reasonQuestions(reasonContext,sources,config.deferralReason?.reviewMode):{};
    const correspondenceRequest=correspondenceContext?correspondenceQuestions(correspondenceContext):{};
    const searchRequest=config.goalSearch?.enabled?goalSearchQuestions(input.charter.goal,observation,candidates,sources,config.goalSearch?.interpretation,{mode:config.goalSearch?.evidenceMode,prior:user.goalSearch}):{};
    const relationRequest=config.actionRelations?.enabled?actionRelationQuestions(input.charter.goal,observation,candidates,sources,config.actionRelations?.evidencePolicy):{};
    const assessmentRequest={...inquiryOutcomeRequest,...inquiryRequest,...assessmentQuestions(candidates,sources),...outcomeQuestions,...reasonRequest,...correspondenceRequest,...searchRequest,...relationRequest},assessmentInput=structuredClone(wire),assessmentAssets=structuredClone(assetFiles);
    if(config.experience?.enabled)for(const [key,question] of Object.entries(assessmentRequest))if(!Object.hasOwn(inquiryOutcomeRequest,key)&&!Object.hasOwn(inquiryRequest,key)&&!Object.hasOwn(outcomeQuestions,key)&&!Object.hasOwn(reasonRequest,key)&&!Object.hasOwn(correspondenceRequest,key)&&!Object.hasOwn(searchRequest,key)&&!Object.hasOwn(relationRequest,key))question.instructions+=' '+experienceAssessmentInstructions;
    if(config.visualHypotheses?.continuity)for(const key of ['knowledge','goal'])assessmentRequest[key].instructions+=' '+conditionContinuityGuidance;
    if(config.visualHypotheses?.candidateChecks)for(const [key,question]of Object.entries(assessmentRequest))if(key.startsWith('effect_'))question.instructions+=' '+visualActionCheckInstructions;
    if(config.visualHypotheses?.priorConditionLinks)for(const [key,question]of Object.entries(assessmentRequest))if(key.startsWith('effect_'))question.instructions+=' '+visualPriorRelationInstructions;
    const d:NonNullable<BetaStep['deliberation']>={modelInput:assessmentInput,questions:assessmentRequest,assetFiles:assessmentAssets,inputSha256:sha(JSON.stringify({input:assessmentInput,questions:assessmentRequest,assets:assessmentAssets})),apiCalls:0};step.deliberation=d;
    if(args.isSafetyStopped?.()){termination='SAFETY_STOP';step.outcome=termination;break;}
    if(performance.now()-started>=config.maxRunMs){termination='TIME_LIMIT';step.outcome='DEADLINE_BEFORE_ASSESSMENT';break;}
    const assessmentBefore=performance.now();apiCalls++;let assessmentAdmitted=true;
    try{d.response=await args.evaluate({input:assessmentInput,questions:assessmentRequest,images,timeoutMs:Math.max(1,Math.min(30000,Math.floor(config.maxRunMs-(performance.now()-started))))});}
    catch(error){if(error instanceof BetaBudgetError){assessmentAdmitted=false;apiCalls--;d.error={code:error.kind};termination=error.kind;}else if(error instanceof BetaAdmissionError){assessmentAdmitted=false;apiCalls--;d.error=betaBudgetFailureEvidence(error);termination='API_ERROR';}else if(error instanceof BetaSettlementError){d.error=betaBudgetFailureEvidence(error);termination='API_ERROR';}else if(error instanceof BetaResponseError){d.response=error.response;d.error={code:error.code};termination=error.kind;}else{d.error=choiceFailureEvidence(error);termination=error instanceof ChoiceRequestError&&error.failure.code==='TIMEOUT'&&performance.now()-started>=config.maxRunMs?'TIME_LIMIT':'API_ERROR';}step.error=d.error;step.outcome='ASSESSMENT_ERROR';break;}
    finally{d.apiCalls=assessmentAdmitted?1:0;const ms=assessmentAdmitted?performance.now()-assessmentBefore:0;d.timing={apiMs:ms};apiMs+=ms;step.timing={apiMs:(step.timing?.apiMs??0)+ms,uiMs:0,modeledUserMs:config.modeledActionMs};}
    if(performance.now()-started>=config.maxRunMs){termination='TIME_LIMIT';step.outcome='ASSESSMENT_AFTER_DEADLINE';break;}
    if(step.inquiryOutcome){try{step.inquiryOutcome.record=admitInquiryOutcome(d.response!,step.inquiryOutcome.context);inquiryOutcomeMemory=rememberInquiryOutcome(step.inquiryOutcome.context,step.inquiryOutcome.record);step.inquiryOutcome.memory=structuredClone(inquiryOutcomeMemory);delete wire.inquiryOutcomeContext;wire.inquiryOutcomeMemory=inquiryOutcomeUserMemory(inquiryOutcomeMemory);step.inputSha256=sha(JSON.stringify({input:wire,questions,assets:assetFiles}));}catch{termination='INVALID_DISTRIBUTION';d.error={code:'INVALID_INQUIRY_OUTCOME'};step.error=d.error;step.outcome='ASSESSMENT_ERROR';break;}}
    if(step.workingInquiry){try{step.workingInquiry.record=admitWorkingInquiry(d.response!,step.workingInquiry.context);wire.workingInquiry=structuredClone(step.workingInquiry.record);step.inputSha256=sha(JSON.stringify({input:wire,questions,assets:assetFiles}));}catch{termination='INVALID_DISTRIBUTION';d.error={code:'INVALID_WORKING_INQUIRY'};step.error=d.error;step.outcome='ASSESSMENT_ERROR';break;}}
    try{const response={...d.response!,answers:Object.fromEntries(Object.entries(d.response!.answers).filter(([key])=>!Object.hasOwn(inquiryOutcomeRequest,key)&&!Object.hasOwn(inquiryRequest,key)&&!Object.hasOwn(outcomeQuestions,key)&&!Object.hasOwn(reasonRequest,key)&&!Object.hasOwn(correspondenceRequest,key)&&!Object.hasOwn(searchRequest,key)&&!Object.hasOwn(relationRequest,key)))};d.assessment=admitAssessment(response,candidates,observation,sources);let experience=user.experience;if(experience&&Object.keys(outcomeQuestions).length)experience=admitExperience(d.response!,experience,sources,config.experience?.evidenceMode);const priorContinuity=user.conditionContinuity,priorVisual=user.visualHypotheses,priorSearch=user.goalSearch;user=recordAssessment(user,d.assessment,config.deliberation);if(priorSearch)user={...user,goalSearch:priorSearch};if(priorVisual)user={...user,visualHypotheses:priorVisual};if(priorContinuity)user={...user,conditionContinuity:priorContinuity};if(experience){user={...user,experience};wire.experienceContext=experienceContext(experience,observation);}} catch{termination='INVALID_DISTRIBUTION';d.error={code:'INVALID_ASSESSMENT'};step.error=d.error;step.outcome='ASSESSMENT_ERROR';break;}
    if(correspondenceContext){try{const record=admitCorrespondence(d.response!,correspondenceContext);step.correspondence!.record=record;const {rawChoices,...admitted}=record;wire.correspondenceAssessment=structuredClone(admitted);}catch{termination='INVALID_DISTRIBUTION';d.error={code:'INVALID_CORRESPONDENCE'};step.error=d.error;step.outcome='ASSESSMENT_ERROR';break;}}
    if(config.goalSearch?.enabled){try{const record=admitGoalSearch(d.response!,input.charter.goal,observation,candidates,sources,config.goalSearch?.interpretation,{mode:config.goalSearch?.evidenceMode,prior:user.goalSearch});user={...user,goalSearch:rememberGoalSearch(user.goalSearch,record,config.goalSearch)};step.goalSearch={record,memory:structuredClone(user.goalSearch!)};}catch{termination='INVALID_DISTRIBUTION';d.error={code:'INVALID_GOAL_SEARCH'};step.error=d.error;step.outcome='ASSESSMENT_ERROR';break;}}
    if(config.actionRelations?.enabled){try{const record=admitActionRelations(d.response!,input.charter.goal,observation,candidates,sources,config.actionRelations?.evidencePolicy);step.actionRelations={record,annotations:[]};wire.actionRelations=structuredClone(record);}catch{termination='INVALID_DISTRIBUTION';d.error={code:'INVALID_ACTION_RELATIONS'};step.error=d.error;step.outcome='ASSESSMENT_ERROR';break;}}
    if(config.deferral?.enabled){deferrals=updateDeferrals(deferrals,user.experience!,observation,d.assessment!,config.deferral);step.deferral={state:structuredClone(deferrals)};effectiveDeferrals=deferrals;}
    if(reasonContext){try{const admitted=admitReasons(d.response!,reasonContext,deferrals!,sources,config.deferralReason!);reasonMemory=admitted.memory;effectiveDeferrals=admitted.effectiveDeferrals;step.deferralReason={memory:structuredClone(reasonMemory),record:admitted.record,effectiveState:structuredClone(effectiveDeferrals)};wire.deferralReasonMemory=structuredClone(reasonMemory);wire.deferralReasonAssessment=structuredClone(admitted.record);}catch{termination='INVALID_DISTRIBUTION';d.error={code:'INVALID_DEFERRAL_REASON'};step.error=d.error;step.outcome='ASSESSMENT_ERROR';break;}}
    if(config.deliberation.candidateEffects)next.criteria=assessedCriteria(candidates,d.assessment!);
    if(user.experience)next.criteria=experienceCriteria(next.criteria,user.experience,observation);
    if(step.correspondence?.record){const before=next.criteria;next.criteria=correspondenceCriteria(before,step.correspondence.record,user.experience);step.correspondence.annotations=Object.keys(before).filter(id=>before[id]!==next.criteria[id]).map(candidateId=>({candidateId,before:before[candidateId],after:next.criteria[candidateId]}));}
    if(config.goalSearch?.enabled){const before=next.criteria;next.criteria=goalSearchCriteria(before,user.goalSearch!,input.charter.goal,observation,user.experience,step.correspondence?.record);step.goalSearch!.annotations=Object.keys(before).filter(id=>before[id]!==next.criteria[id]).map(candidateId=>({candidateId,before:before[candidateId],after:next.criteria[candidateId]}));}
    if(step.actionRelations){const before=next.criteria;next.criteria=actionRelationCriteria(before,step.actionRelations.record,input.charter.goal,observation);step.actionRelations.annotations=Object.keys(before).filter(id=>before[id]!==next.criteria[id]).map(candidateId=>({candidateId,before:before[candidateId],after:next.criteria[candidateId]}));}
    if(config.visualHypotheses?.candidateChecks){const checked=visualActionChecks(step.visualHypotheses!.record!,input.charter.goal,observation,next.criteria,step.visualPriorRelations?{request:{...step.visualHypotheses!.request,images,timeoutMs:step.visualHypotheses!.timing!.dispatch!.timeoutMs},record:step.visualPriorRelations}:undefined);next.criteria=checked.criteria;step.visualActionChecks={record:checked.record,annotations:checked.annotations};}
    if(step.workingInquiry?.record){const projected=workingInquiryCriteria(next.criteria,step.workingInquiry.context,step.workingInquiry.record);next.criteria=projected.criteria;step.workingInquiry.annotations=projected.annotations;}
    if(step.inquiryOutcome?.memory){const projected=inquiryOutcomeCriteria(next.criteria,step.workingInquiry!.context.candidates.map(c=>c.candidateId),step.inquiryOutcome.memory);next.criteria=projected.criteria;step.inquiryOutcome.annotations=projected.annotations;}
    wire.userState=structuredClone(user);step.userState=structuredClone(user);step.inputSha256=sha(JSON.stringify({input:wire,questions,assets:assetFiles}));
    if(args.isSafetyStopped?.()){termination='SAFETY_STOP';step.outcome=termination;break;}
    if(apiCalls>=config.maxAPICalls){termination='API_LIMIT';step.outcome='ASSESSMENT_ONLY_API_LIMIT';break;}
    if(performance.now()-started>=config.maxRunMs){termination='TIME_LIMIT';step.outcome='DEADLINE_BEFORE_INFERENCE';break;}
   }
   const before=performance.now();apiCalls++;
   let response:ChoiceAnswers;let admitted=true;
   try{response=await args.evaluate({input:wire,questions,images,timeoutMs:Math.max(1,Math.min(30000,Math.floor(config.maxRunMs-(performance.now()-started))))});}catch(error){if(error instanceof BetaBudgetError){admitted=false;apiCalls--;step.error={code:error.kind};termination=error.kind;}else if(error instanceof BetaAdmissionError){admitted=false;apiCalls--;step.error=betaBudgetFailureEvidence(error);termination='API_ERROR';}else if(error instanceof BetaSettlementError){step.error=betaBudgetFailureEvidence(error);termination='API_ERROR';}else if(error instanceof BetaResponseError){step.response=error.response;step.error={code:error.code};termination=error.kind;}else{step.error=choiceFailureEvidence(error);termination=error instanceof ChoiceRequestError&&error.failure.code==='TIMEOUT'&&performance.now()-started>=config.maxRunMs?'TIME_LIMIT':'API_ERROR';}break;}
   finally{const ms=admitted?performance.now()-before:0;apiMs+=ms;step.timing={apiMs:(step.timing?.apiMs??0)+ms,uiMs:0,modeledUserMs:config.modeledActionMs};}
   step.response=response;
   if(performance.now()-started>=config.maxRunMs){termination='TIME_LIMIT';step.outcome='RESPONSE_AFTER_DEADLINE';break;}
   let selection:SelectionRecord;
   try{const answer=response.answers.nextAction;let weights:Record<string,number>|undefined;
    if(config.deferral?.enabled){const decision=deferralDecision(effectiveDeferrals,observation,candidates,step.deliberation!.assessment!,answer?.probabilities,config.deferral);step.deferral!.decision=decision;weights=decision.weights;}
    selection=sampler.select(answer?.choice,answer?.probabilities,candidates,excluded,weights,config.deferral?.enabled?config.deferral.selectionScope:undefined);}catch(error){termination='INVALID_DISTRIBUTION';step.error={code:'INVALID_DISTRIBUTION'};if(error instanceof InvalidDistributionError&&error.details)step.selectionFailure=error.details;break;}
   step.selection=selection;
   try{const basis=validateChoice(response.answers.decisionBasis,reasonQuestion.criteria);step.reasonEvidence={category:basis.choice,observationId:observation.id,kind:'model-self-report',proposedChoice:selection.modelChoice,selectedChoice:selection.selected};}catch{step.error={code:'REASON_UNAVAILABLE'};}
   if(args.isSafetyStopped?.()){termination='SAFETY_STOP';step.outcome=termination;break;}
   if(performance.now()-started>=config.maxRunMs){termination='TIME_LIMIT';step.outcome='SELECTION_AFTER_DEADLINE';break;}
   const action=candidates[selection.selected].action;step.action=action;
   if(action.type==='done'){perceivedDone=true;termination='SUBJECTIVE_DONE';step.outcome=termination;break;}
   if(action.type==='abandon'||action.type==='stuck'){termination=action.type==='abandon'?'ABANDONED':'STUCK';step.outcome=termination;break;}
   try{
    const before=performance.now(),executed=await executeBetaAction(pom,action,user);const ms=performance.now()-before;uiMs+=ms;step.timing!.uiMs=ms;
    if(executed.look){looks++;user={...user,fixation:executed.fixation};}if(executed.ui)uiActions++;
    step.outcome=executed.ui?'UI_PERFORMED':executed.look?'FIXATION_MOVED':action.type==='reread'?'REREAD':'WAIT_NO_UI';
    pendingEvent={action,outcome:executed.ui?'performed':'unchanged'};
    if(config.experience?.enabled)pendingIntent=beginExperience(observation,selection.selected,action,step.deliberation?.assessment);
    // Baseline goal assistant retains its existing visible DOM/action history. B never receives it.
    history.push({screen:screen.title,action:candidates[selection.selected].label,result:step.outcome,observedText:[...screen.text]});
    try{objectiveSuccess=await checkObjective();step.objectiveSuccess=objectiveSuccess;}catch{termination='OBSERVATION_ERROR';step.error={code:'ORACLE_ERROR'};step.outcome='ORACLE_ERROR';break;}
    step.counts={looks,uiActions};
    if(step.inquiryOutcome&&step.workingInquiry?.record){pendingInquiry=beginInquiryOperation({context:step.workingInquiry.context,record:step.workingInquiry.record,candidateId:selection.selected,actionType:action.type,execution:executed.ui?'performed':'unchanged'});step.inquiryOutcome.operation=structuredClone(pendingInquiry);}
   }catch{step.error={code:'ACTION_ERROR'};termination='ACTION_ERROR';step.outcome=termination;break;}
  }catch{termination='OBSERVATION_ERROR';step.error={code:'OBSERVATION_ERROR'};break;}
  finally{await writeFile(join(args.dir,'step-'+number+'.json'),JSON.stringify(step,null,2));}
 }
 }catch{termination=args.isSafetyStopped?.()?'SAFETY_STOP':'OBSERVATION_ERROR';}
 if(args.isSafetyStopped?.())termination='SAFETY_STOP';
 let objectiveAssessment:BetaResult['objectiveAssessment'];
 try{objectiveSuccess=await checkObjective();objectiveAssessment={status:'OK',value:objectiveSuccess};}catch{objectiveAssessment={status:'ERROR',value:null,code:'ORACLE_ERROR'};}
 let terminalObservation:BetaResult['terminalObservation'];
 try{await page.screenshot({path:join(args.dir,'final.png')});if(recovery&&args.recoveryFixture)recovery.terminalSnapshot=await readRecoverySnapshot(page,args.recoveryFixture);terminalObservation={status:'RECORDED'};}catch{terminalObservation={status:'ERROR',code:'OBSERVATION_ERROR'};}
 const validForComparison=objectiveAssessment.status==='OK'&&terminalObservation.status==='RECORDED'&&!['API_ERROR','INVALID_DISTRIBUTION','ACTION_ERROR','OBSERVATION_ERROR','SAFETY_STOP'].includes(termination);
 const result:BetaResult={schemaVersion:1,...(config.visualHypotheses?.enabled?{measurement:{visualDispatch:'client-timeout-v1' as const,...(args.nativeHTTPMeasurement?{visualHTTP:'final-timeout-v1' as const}:{})}}:{}),...(args.jevImageReferences?{transport:{jevImageReferences:args.jevImageReferences}}:{}),runId:args.runId,condition:config.id,...(args.uiVersion?{uiVersion:structuredClone(args.uiVersion)}:{}),...(args.code?{code:{...args.code}}:{}),...(semantic?{semantic}:{}),...(holdout?{holdout}:{}),...(transfer?{transfer}:{}),...(recovery?{recovery}:{}),config,input,initialFingerprint,objectiveSuccess,perceivedDone,termination,looks,uiActions,decisions:steps.length,apiCalls,apiMs,uiMs,modeledUserMs:config.modeledActionMs===null?null:config.modeledActionMs*steps.filter(s=>s.action).length,elapsedMs:performance.now()-started,terminalObservation,objectiveAssessment,validForComparison,steps};
 await writeFile(join(args.dir,'result.json'),JSON.stringify(result,null,2));return result;
}
