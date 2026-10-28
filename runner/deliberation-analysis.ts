import type {BetaResult,BetaStep} from './virtual-beta-core.js';
import type {AdmittedObservationSource,DeliberationAssessment} from '../jev/virtual-beta/deliberation-contracts.js';
import {analyzeRun} from './virtual-beta-analysis.js';

type Evidence=boolean|null;
type ObservedImage=AdmittedObservationSource&{image:string;file:string};
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const nonempty=(value:unknown):value is string=>typeof value==='string'&&value.length>0;
const count=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
const source=(value:unknown):value is AdmittedObservationSource=>object(value)&&nonempty(value.observationId)&&nonempty(value.imageSha256);
function validAssessment(value:unknown):value is DeliberationAssessment{
 if(!object(value)||value.schemaVersion!==1||value.kind!=='model-assessment-not-fact'||!nonempty(value.observationId)||!nonempty(value.imageSha256))return false;
 if(!['sufficient','insufficient','conflicting'].includes(String(value.knowledge))||!['satisfied','unsatisfied','uncertain'].includes(String(value.goal)))return false;
 if(value.goalEvidence!==undefined&&!source(value.goalEvidence))return false;
 if(!object(value.effects)||!Object.values(value.effects).every(effect=>object(effect)&&['advances','neutral','conflicts','unknown'].includes(String(effect.prediction))&&(effect.evidence===undefined||source(effect.evidence))))return false;
 return Array.isArray(value.adjustments)&&value.adjustments.every(adjustment=>object(adjustment)&&nonempty(adjustment.field)&&nonempty(adjustment.from)&&nonempty(adjustment.to)&&adjustment.reason==='NO_ADMITTED_EVIDENCE');
}

/** References record image availability, not verified file bytes or evidence of reading. */
function observedImages(record:NonNullable<BetaStep['deliberation']>){
 const input=record.modelInput,assets=record.assetFiles,images:ObservedImage[]=[];
 let complete=true;
 const add=(observationId:unknown,image:unknown,claimedHash?:unknown)=>{
  const asset=typeof image==='string'?assets?.[image]:undefined;
  if(!nonempty(observationId)||!nonempty(image)||!nonempty(asset?.file)||!nonempty(asset?.sha256)){complete=false;return;}
  if(claimedHash!==undefined&&claimedHash!==asset.sha256){complete=false;return;}
  images.push({observationId,image,imageSha256:asset.sha256,file:asset.file});
 };
 if(object(input?.observation))add(input.observation.id,input.observation.image,input.observation.imageSha256);else complete=false;
 if(input?.memoryObservations!==undefined){
  if(Array.isArray(input.memoryObservations))for(const memory of input.memoryObservations){if(object(memory))add(memory.observationId,memory.image,memory.imageSha256);else complete=false;}
  else complete=false;
 }
 return {images,complete};
}
const admitted=(citation:AdmittedObservationSource|undefined,images:ObservedImage[],complete:boolean):Evidence=>!citation?null:images.some(image=>image.observationId===citation.observationId&&image.imageSha256===citation.imageSha256)?true:complete?false:null;
function selectedActionMatches(step:BetaStep):Evidence{
 if(!step.action||!nonempty(step.selection?.selected))return null;
 if(step.action.type==='click')return step.selection!.selected===step.action.elementId;
 if(['done','stuck','abandon','wait','reread'].includes(step.action.type))return step.selection!.selected===step.action.type;
 // Look and other candidates need their candidate-to-action mapping to establish identity.
 return null;
}

/** Pure report of model claims and recorded behavior; no inference about internal meaning or human reasoning. */
export function analyzeDeliberationRun(result:BetaResult){
 const base=analyzeRun(result),enabled=result.config.deliberation?.enabled===true;
 const mode=result.config.deliberation===undefined?'legacy-single-stage' as const:enabled?'enabled' as const:'disabled' as const;
 const reasons:string[]=[];
 const timeline=result.steps.map(step=>{
  const record=step.deliberation,valid=validAssessment(record?.assessment),assessment=valid?record!.assessment!:null;
  const assessmentStatus=!record?enabled?'missing' as const:'not-enabled' as const:record.error!==undefined?'error' as const:valid?'recorded' as const:record.assessment!==undefined?'invalid' as const:'missing' as const;
  const observations=record?observedImages(record):{images:[] as ObservedImage[],complete:false};
  const citations=assessment?[
   {field:'goal',source:assessment.goalEvidence?{...assessment.goalEvidence}:null,admitted:admitted(assessment.goalEvidence,observations.images,observations.complete)},
   ...Object.entries(assessment.effects).map(([candidate,effect])=>({field:'effects.'+candidate,source:effect.evidence?{...effect.evidence}:null,admitted:admitted(effect.evidence,observations.images,observations.complete)})),
  ]:[];
  const sourceAdmitted=assessment?admitted(assessment,observations.images,observations.complete):null;
  const selected=step.selection?.selected??null,matches=selectedActionMatches(step);
  const criteria=step.questions?.nextAction?.criteria;
  const selectedCandidateOffered:Evidence=selected&&criteria?Object.hasOwn(criteria,selected):null;
  const chosenEffect=assessment&&selected&&matches===true&&selectedCandidateOffered===true?assessment.effects[selected]:undefined;
  const uncertain=assessment?assessment.knowledge==='insufficient'||assessment.knowledge==='conflicting':null;
  const uncertaintyThen=uncertain===true?!step.action?'noAction' as const:step.action.type==='look'?'look' as const:step.action.type==='click'?'click' as const:step.action.type==='done'?'done' as const:'other' as const:null;
  return {decision:step.number,observationId:step.observationId??null,assessmentStatus,
   assessmentInputSha256:record?.inputSha256??null,actionInputSha256:step.inputSha256??null,
   assessmentAPICalls:record&&(record.apiCalls===0||record.apiCalls===1)?record.apiCalls:!record&&!enabled?0:null,
   assessmentAPIMs:record?.timing?.apiMs??null,
   modelAssessment:assessment?{knowledge:assessment.knowledge,goal:assessment.goal,kind:assessment.kind}:null,
   assessment:record?.assessment?structuredClone(record.assessment):null,assessmentError:record?.error===undefined?null:structuredClone(record.error),
   observedImages:observations.images,observationEvidenceComplete:observations.complete,sourceAdmitted,citations,
   effects:assessment?structuredClone(assessment.effects):null,adjustments:assessment?structuredClone(assessment.adjustments):null,
   selected,selectedActionMatches:matches,selectedCandidateOffered,chosenPrediction:chosenEffect?.prediction??null,
   chosenPredictionEvidenceAdmitted:chosenEffect?admitted(chosenEffect.evidence,observations.images,observations.complete):null,
   uncertaintyThen,action:step.action?structuredClone(step.action):null,outcome:step.outcome??null,
   actionError:step.error===undefined?null:structuredClone(step.error),
   reasonEvidence:step.reasonEvidence?{...step.reasonEvidence,evidenceKind:'model-self-report-only' as const}:null,
  };
 });
 const assessmentCallsKnown=timeline.every(step=>step.assessmentAPICalls!==null);
 const recordedAssessmentCalls=timeline.reduce((total,step)=>total+(step.assessmentAPICalls??0),0);
 const assessmentAPICalls=assessmentCallsKnown?recordedAssessmentCalls:null;
 const totalAPICalls=count(result.apiCalls)?result.apiCalls:null;
 const accountingConsistent=totalAPICalls!==null&&assessmentAPICalls!==null?assessmentAPICalls<=totalAPICalls&&totalAPICalls-assessmentAPICalls<=timeline.length:null;
 const actionAPICalls=accountingConsistent===true?totalAPICalls!-assessmentAPICalls!:null;
 if(timeline.some(step=>step.assessmentStatus==='missing'))reasons.push('ASSESSMENT_RECORD_MISSING');
 if(timeline.some(step=>step.assessmentStatus==='invalid'))reasons.push('ASSESSMENT_RECORD_INVALID');
 if(timeline.some(step=>step.assessmentStatus==='error'))reasons.push('ASSESSMENT_ERROR');
 if(timeline.some(step=>step.sourceAdmitted===false||step.citations.some(citation=>citation.admitted===false)))reasons.push('ASSESSMENT_SOURCE_NOT_ADMITTED');
 if(timeline.some(step=>step.assessmentStatus==='recorded'&&step.sourceAdmitted===null))reasons.push('ASSESSMENT_SOURCE_UNKNOWN');
 if(!assessmentCallsKnown||totalAPICalls===null)reasons.push('API_ACCOUNTING_UNKNOWN');
 if(accountingConsistent===false)reasons.push('API_ACCOUNTING_INCONSISTENT');
 if(!enabled&&timeline.some(step=>step.assessmentStatus!=='not-enabled'))reasons.push('ASSESSMENT_PRESENT_WHILE_DISABLED');
 const counts={validAssessments:timeline.filter(step=>step.assessmentStatus==='recorded').length,
  missingAssessments:timeline.filter(step=>step.assessmentStatus==='missing').length,
  invalidAssessments:timeline.filter(step=>step.assessmentStatus==='invalid').length,
  assessmentErrors:timeline.filter(step=>step.assessmentStatus==='error').length,
  knowledge:{sufficient:0,insufficient:0,conflicting:0},goal:{satisfied:0,unsatisfied:0,uncertain:0},
  uncertaintyThen:{look:0,click:0,done:0,other:0,noAction:0},selectedPredictedConflict:0,selectedGroundedPredictedConflict:0};
 for(const step of timeline){
  if(step.assessmentStatus!=='recorded')continue;
  if(step.modelAssessment){counts.knowledge[step.modelAssessment.knowledge]++;counts.goal[step.modelAssessment.goal]++;}
  if(step.uncertaintyThen)counts.uncertaintyThen[step.uncertaintyThen]++;
  if(step.chosenPrediction==='conflicts'){counts.selectedPredictedConflict++;if(step.chosenPredictionEvidenceAdmitted===true)counts.selectedGroundedPredictedConflict++;}
 }
 const oracle=result.objectiveAssessment?.status==='OK'&&typeof result.objectiveAssessment.value==='boolean'?result.objectiveAssessment.value:null;
 const terminal=timeline.at(-1),terminalGoal=terminal?.assessmentStatus==='recorded'?terminal.modelAssessment?.goal:null;
 // Earlier claims cannot be compared to a terminal oracle: intervening actions may change state.
 const terminalDone=terminal?.action?.type==='done',terminalGoalComparable=terminalDone&&terminalGoal&&terminalGoal!=='uncertain';
 const subjectiveDoneContradictsObjective:Evidence=oracle===null?null:result.perceivedDone?oracle===false:false;
 const terminalAssessmentContradictsObjective:Evidence=oracle!==null&&terminalGoalComparable?(terminalGoal==='satisfied')!==oracle:null;
 return {schemaVersion:1 as const,runId:result.runId,mode,
  classification:{artifactValidity:base.classification.artifactValidity,censored:base.classification.behavior==='budget-censored',reasons:[...base.classification.reasons,...reasons]},
  accounting:{totalAPICalls,assessmentAPICalls,recordedAssessmentAPICalls:recordedAssessmentCalls,actionAPICalls,consistent:accountingConsistent,actionCallsBasis:'Total calls minus complete recorded assessment calls; not the number of executed actions.'},
  counts,outcomes:{termination:result.termination,perceivedDone:result.perceivedDone,objectiveSuccess:result.objectiveSuccess,independentObjective:oracle,subjectiveDoneContradictsObjective,terminalAssessmentContradictsObjective},
  timeline,interpretation:'Assessment categories, predictions and decision reasons are model self-reports, not certified facts, internal understanding or human reasoning. Attached image references record availability only; this report does not verify file bytes. Terminal outcome contradictions use only the independent recorded oracle.'};
}
export type DeliberationRunAnalysis=ReturnType<typeof analyzeDeliberationRun>;
