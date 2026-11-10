import {isDeepStrictEqual as equal} from 'node:util';
import {createHash} from 'node:crypto';
import {parsePersona} from '../jev/persona.js';
import {personaTasks,type PersonaTaskSnapshot} from '../app/persona-task-types.js';
import {personaTaskDefinition} from '../app/persona-task-fixture.js';
import {personaBetaActors} from './persona-beta-contracts.js';
import type {PersonaTaskRecord} from './persona-task-contracts.js';
import type {BetaStep} from './virtual-beta-core.js';
import {routeDistance} from './persona-report.js';

const clone=<T>(v:T):T=>structuredClone(v);
const unique=<T>(v:T[])=>[...new Set(v)];
const mean=(v:number[])=>v.length?v.reduce((a,b)=>a+b,0)/v.length:null;
const sha=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const histogram=(values:string[])=>{const out:Record<string,number>={};for(const v of values)out[v]=(out[v]??0)+1;return out;};
const booleanFields=['otherSessionActive','currentSessionActive','passwordChanged','draftCompact','savedCompact','notifications','complete'] as const;
const eventVocabulary={sessions:['help','review-other-session','review-password','revoke-other-session','change-password','cancel-review','start'],preferences:['layout-compact','layout-standard','preview-layout','save-layout','help','start'],privacy:['quick-enable-extended','permission-details','scope-basic','scope-extended','enable-reminders','disable-reminders','help','start']};
function snapshot(v:unknown,task:PersonaTaskRecord['fixture']['task']):PersonaTaskSnapshot|null{
 if(!Object.hasOwn(eventVocabulary,task)||!object(v)||v.schemaVersion!==1||v.task!==task||!['start','help','details','review','complete'].includes(v.route as string)||!Array.isArray(v.events)||!v.events.every(e=>typeof e==='string'&&eventVocabulary[task].includes(e))||booleanFields.some(k=>typeof v[k]!=='boolean')||!['none','basic','extended'].includes(v.scope as string))return null;
 return clone(v as unknown as PersonaTaskSnapshot);
}
const taskComplete=(s:PersonaTaskSnapshot)=>s.task==='sessions'?!s.otherSessionActive&&s.currentSessionActive&&!s.passwordChanged:s.task==='preferences'?s.savedCompact:s.notifications&&s.scope!=='none';
type ErrorEvidence={code:string;ids:string[];step?:number;stage?:string};
type Observation={kind:'observation'|'terminal';step:number;observationId:string|null;imageSha256:string|null;snapshot:PersonaTaskSnapshot;deliveredStages:string[]};
const performed=(s:BetaStep)=>s.outcome==='UI_PERFORMED'&&!!s.action&&['click','back','scroll'].includes(s.action.type);
function actionEvidence(step:BetaStep){
 const a=step.action,route=step.audit?.personaTask?.route??null;
 const controls=a?.type==='click'?step.audit?.screen?.elements?.filter(e=>e.id===a.elementId)??[]:[];
 const reviewerControlText=controls.length===1?controls[0].text:null;
 const bound=route!==null&&(a?.type!=='click'||reviewerControlText!==null);
 return {step:step.number,observationId:step.observationId??null,imageSha256:step.assetFiles?.current?.sha256??null,route,action:clone(a??null),reviewerControlText,bound,token:bound&&performed(step)?JSON.stringify([route,a!.type,reviewerControlText,a!.type==='scroll'?a!.direction:null]):null};
}
const sameWeights=(a:Record<string,number>|undefined,b:Record<string,number>|undefined)=>!!a&&!!b&&equal(a,b);
function selectionErrors(s:BetaStep){
 const errors:string[]=[],selection=s.selection,application=s.deferral?.application;
 if(!selection){if(s.action||performed(s))errors.push('MISSING_SELECTION');return errors;}
 if(!application)errors.push('MISSING_DEFERRAL_APPLICATION');
 else{
  if(application.mode!=='observe-only')errors.push('APPLICATION_MODE_MISMATCH');
  if(!sameWeights(s.deferral?.decision?.weights,application.proposedWeights))errors.push('PROPOSED_WEIGHT_BINDING_MISMATCH');
  if(!sameWeights(selection.policy?.weights,application.appliedWeights))errors.push('APPLIED_WEIGHT_BINDING_MISMATCH');
  if(!Object.keys(application.appliedWeights).length||Object.values(application.appliedWeights).some(w=>w!==1))errors.push('OFF_NONUNIT_APPLIED_WEIGHTS');
 }
 const baseline=selection.policy?.scope?.baselineSelected;
 if(baseline===undefined)errors.push('MISSING_BASELINE_SELECTION');else if(baseline!==selection.selected)errors.push('OFF_BASELINE_SELECTION_CHANGED');
 const action=s.action;
 if(!action||selection.selected!==(action.type==='click'?action.elementId:action.type==='scroll'?'scroll_'+action.direction:action.type==='look'?selection.selected:action.type))errors.push('ACTUAL_SELECTION_MISMATCH');
 return errors;
}
const choiceGroups={help:['help'],details:['permission-details','preview-layout'],review:['review-other-session','review-password'],revokeOther:['revoke-other-session'],passwordChange:['change-password'],compact:['layout-compact'],standard:['layout-standard'],preview:['preview-layout'],save:['save-layout'],quickExtended:['quick-enable-extended'],basicScope:['scope-basic'],extendedScope:['scope-extended'],enableReminders:['enable-reminders'],disableReminders:['disable-reminders']} as const;

/** Pure observed-to-stop comparison. Snapshot truths and audit labels never become actor input. */
export function analyzePersonaTaskRuns(records:PersonaTaskRecord[]){
 const errors:ErrorEvidence[]=[],per=records.map(()=>[] as string[]);
 const add=(code:string,indexes:number[],detail:{step?:number;stage?:string}={},integrity=true)=>{for(const i of indexes)per[i].push(code);if(integrity)errors.push({code,ids:indexes.map(i=>records[i].id),...detail});};
 for(const [field,code] of [['id','DUPLICATE_SLOT_ID'],['runId','DUPLICATE_RUN_ID'],['cell','DUPLICATE_CELL']] as const){
  const groups=new Map<string,number[]>();records.forEach((r,i)=>{const key=field==='cell'?JSON.stringify([r.fixture,r.actor,r.replicate]):r[field];groups.set(key,[...(groups.get(key)??[]),i]);});
  for(const indexes of groups.values())if(indexes.length>1)add(code,indexes);
 }
 for(const actor of personaBetaActors){
  const indexes=records.flatMap((r,i)=>r.actor===actor?[i]:[]);
  for(const i of indexes){const r=records[i];let valid=false;try{valid=actor==='baseline'?r.persona===null&&r.personaSha256===null:!!r.persona&&r.persona.id===actor&&equal(parsePersona(r.persona),r.persona)&&sha(r.persona)===r.personaSha256;}catch{}
   if(!valid)add('PERSONA_IDENTITY_MISMATCH',[i]);
  }
  if(indexes.some(i=>!equal(records[i].persona,records[indexes[0]].persona)||records[i].personaSha256!==records[indexes[0]].personaSha256))add('PERSONA_IDENTITY_MISMATCH',indexes);
 }
 const runs=records.map((record,index)=>{
  const r=record.result,steps=r?.steps??[],pending=record.status==='ATTEMPTING'&&!r;
  const fault=(code:string,step?:number,stage?:string,integrity=true)=>add(code,[index],{...(step===undefined?{}:{step}),...(stage===undefined?{}:{stage})},integrity);
  if(record.error)fault(record.error.code,undefined,undefined,false);
  if(!r)fault('NO_RESULT',undefined,undefined,false);
  if(record.status!=='RESULT')fault('INCOMPLETE_RECORD',undefined,undefined,false);
  if(!personaTasks.includes(record.fixture.task)||record.fixture.version!==1||!personaBetaActors.includes(record.actor)||![1,2,3].includes(record.replicate))fault('UNEXPECTED_CELL');
  if(r&&(!record.runId||r.runId!==record.runId))fault('RUN_ID_MISMATCH');
  if(r&&!r.validForComparison)fault('INVALID_RESULT',undefined,undefined,false);
  if(r&&['API_ERROR','INVALID_DISTRIBUTION','ACTION_ERROR','OBSERVATION_ERROR','SAFETY_STOP'].includes(r.termination))fault(r.termination,undefined,undefined,false);
  for(const e of record.personaDelivery?.errors??[])fault(e.code,e.step,e.stage);
  if(r&&!record.personaDelivery)fault('PERSONA_DELIVERY_UNVERIFIED');
  if(r&&!equal(r.input.persona??null,record.persona))fault('PERSONA_BINDING_MISMATCH',0,'run');
  if(r&&record.replay?.status!=='OK')fault('REPLAY_UNVERIFIED');
  if(record.ledger&&r){const l=record.ledgerEvidence;if(!l||l.reserved!==0||l.used!==r.apiCalls||l.used!==record.requests||!l.sha256||l.ok+l.errors!==l.used)fault('LEDGER_ACCOUNTING_MISMATCH');}
  if(r&&(!r.personaTask||!equal(r.personaTask.fixture,record.fixture)||!r.personaTask.definitionHash||r.personaTask.definitionHash!==sha(personaTaskDefinition(record.fixture))||!r.personaTask.initialProductImage?.file||r.personaTask.initialProductImage.sha256!==record.initialImageSha256))fault('TASK_METADATA_MISMATCH');
  if(r&&(!r.terminalObservation||r.terminalObservation.status!=='RECORDED'))fault('TERMINAL_OBSERVATION_UNVERIFIED',undefined,undefined,false);
  if(r&&(!r.objectiveAssessment||r.objectiveAssessment.status!=='OK'||typeof r.objectiveAssessment.value!=='boolean'))fault('OBJECTIVE_ASSESSMENT_UNVERIFIED',undefined,undefined,false);
  let native=0,assessment=0,action=0;
  const observations=steps.map((s,i):Observation|null=>{
   if(s.number!==i+1||s.observationId!=='o'+s.number)fault('OBSERVATION_SEQUENCE_MISMATCH',s.number);
   if(!s.audit?.screen||!Array.isArray(s.audit.screen.elements)||!s.audit.rawScreenshot||!s.audit.sourceSha256)fault('MISSING_OR_INVALID_AUDIT',s.number);
   const state=snapshot(s.audit?.personaTask,record.fixture.task);
   if(!state)fault('MISSING_OR_INVALID_SNAPSHOT',s.number);
   if(state&&state.complete!==taskComplete(state))fault('OBJECTIVE_STATE_MISMATCH',s.number);
   const image=s.assetFiles?.current?.sha256??null;
   if(!image)fault('MISSING_CURRENT_IMAGE_REFERENCE',s.number);
   const matched=(record.frameChecks??[]).filter(c=>c.step===s.number&&c.observationId===s.observationId&&image!==null&&c.imageSha256===image&&(!s.vision||s.vision.imageSha256===image));
   const stages=unique(matched.filter(c=>c.validCurrentFrame&&c.successfulResponse&&c.scope==='full-viewport-current').map(c=>c.stage));
   for(const stage of ['assessment','action'] as const){
    const part=stage==='assessment'?s.deliberation:s,input=part?.modelInput;
    if(s.selection&&(!input||!stages.includes(stage)))fault('CURRENT_FRAME_UNVERIFIED',s.number,stage);
    if(input){
     const exploration=object(input.exploration)?input.exploration:{};
     if(!equal(exploration.persona??null,record.persona))fault('PERSONA_BINDING_MISMATCH',s.number,stage);
     if(!object(input.userState)||!equal(input.userState.expectations,record.persona?.expectations??[]))fault('PERSONA_EXPECTATION_MISMATCH',s.number,stage);
    }
    if(part?.response?.answers){if(stage==='assessment')assessment++;else action++;}
   }
   const v=s.visualHypotheses;
   if(s.selection&&(!v||v.response?.status!=='completed'))fault('NATIVE_INPUT_UNVERIFIED',s.number,'native');
   if(v){if(!equal(v.request?.persona??null,record.persona))fault('PERSONA_BINDING_MISMATCH',s.number,'native');if(v.response?.status==='completed')native++;}
   for(const code of selectionErrors(s))fault(code,s.number);
   if(performed(s)&&!actionEvidence(s).bound)fault('UNBOUND_UI_ACTION',s.number);
   return state?{kind:'observation',step:s.number,observationId:s.observationId??null,imageSha256:image,snapshot:state,deliveredStages:stages}:null;
  });
  if(r&&record.personaDelivery&&!equal({native,assessment,action},{native:record.personaDelivery.native,assessment:record.personaDelivery.assessment,action:record.personaDelivery.action}))fault('PERSONA_DELIVERY_COUNT_MISMATCH');
  const terminalState=snapshot(r?.personaTask?.terminalSnapshot,record.fixture.task);
  const terminal:Observation|null=terminalState?{kind:'terminal',step:steps.at(-1)?.number??0,observationId:null,imageSha256:null,snapshot:terminalState,deliveredStages:[]}:null;
  if(r&&!terminal)fault('MISSING_OR_INVALID_TERMINAL_SNAPSHOT');
  if(terminal&&terminal.snapshot.complete!==taskComplete(terminal.snapshot))fault('OBJECTIVE_STATE_MISMATCH');
  if(terminal&&r?.objectiveAssessment.status==='OK'&&(r.objectiveAssessment.value!==terminal.snapshot.complete||r.objectiveSuccess!==terminal.snapshot.complete))fault('OBJECTIVE_SNAPSHOT_MISMATCH');
  if(r&&!steps.length)fault('EMPTY_TRAJECTORY',undefined,undefined,false);
  const transitions=steps.map((s,i)=>{
   const before=observations[i],after=i+1<steps.length?observations[i+1]:terminal,actualUI=performed(s),events:string[]=[];
   if(before&&after){
    const a=before.snapshot,b=after.snapshot;
    if(b.events.length<a.events.length||!a.events.every((v,j)=>b.events[j]===v))fault('EVENT_HISTORY_MISMATCH',s.number);
    else events.push(...b.events.slice(a.events.length));
    if(!actualUI&&!equal(a,b))fault('STATE_CHANGE_WITHOUT_PERFORMED_UI',s.number);
    if(events.length>1||events.length>0&&s.action?.type!=='click'||actualUI&&s.action?.type==='click'&&events.length!==1)fault('EVENT_OPERATION_MISMATCH',s.number);
   }
   return {step:s.number,action:clone(s.action??null),reviewerControlText:actionEvidence(s).reviewerControlText,outcome:s.outcome??null,actualUI,before,after,events};
  });
  const routeActions=steps.filter(performed).map(actionEvidence),routeTokens=routeActions.flatMap(a=>a.token===null?[]:[a.token]);
  const revisits:{route:string;departureStep:number;returnStep:number;departure:typeof transitions[number];return:typeof transitions[number]}[]=[],departures=new Map<string,typeof transitions[number]>();
  for(const t of transitions)if(t.actualUI&&t.before&&t.after&&t.before.snapshot.route!==t.after.snapshot.route){
   const from=t.before.snapshot.route,to=t.after.snapshot.route,prior=departures.get(to);if(prior)revisits.push({route:to,departureStep:prior.step,returnStep:t.step,departure:clone(prior),return:clone(t)});departures.set(from,t);
  }
  const choices={firstAction:routeActions[0]??null,...Object.fromEntries(Object.entries(choiceGroups).map(([name,events])=>{const evidence=transitions.filter(t=>t.actualUI&&t.events.some(e=>(events as readonly string[]).includes(e)));return [name,{count:evidence.length,evidence:clone(evidence)}];})),revisits:{count:revisits.length,evidence:revisits}};
  const reasonEvidence=steps.flatMap(s=>s.reasonEvidence?[{step:s.number,imageSha256:s.assetFiles?.current?.sha256??null,...clone(s.reasonEvidence)}]:[]);
  const reasons=unique(per[index]),valid=reasons.length===0,censored=!!r&&['TIME_LIMIT','UI_ACTION_LIMIT','LOOK_LIMIT','DECISION_LIMIT','API_LIMIT'].includes(r.termination);
  const complete=valid&&steps.length>0&&observations.every(Boolean)&&!!terminal;
  return {id:record.id,runId:record.runId,actor:record.actor,replicate:record.replicate,sequence:record.sequence,fixture:clone(record.fixture),status:record.status,validity:{valid,reasons},complete,pathStatus:complete?'complete-observed-to-stop':'partial-or-invalid',pending,censored,abandoned:r?.termination==='ABANDONED',subjective:{perceivedDone:r?.perceivedDone??null,termination:r?.termination??null},objective:clone(r?.objectiveAssessment??null),infrastructure:{failed:!!record.error||!!r&&['API_ERROR','ACTION_ERROR','OBSERVATION_ERROR'].includes(r.termination),error:clone(record.error??null)},routeTokens,routeActions,observations,terminal,transitions,choices,reasonEvidence,reasonCategories:histogram(reasonEvidence.map(e=>e.category)),personaDelivery:clone(record.personaDelivery??null)};
 });
 const tasks=Object.fromEntries(personaTasks.map(task=>{
  const items=runs.filter(r=>r.fixture.task===task),valid=items.filter(r=>r.complete);
  const actors=Object.fromEntries(personaBetaActors.map(actor=>{
   const attempted=items.filter(r=>r.actor===actor),included=valid.filter(r=>r.actor===actor);
   return [actor,{planned:3,attempted:attempted.length,missingReplicates:[1,2,3].filter(n=>!attempted.some(r=>r.replicate===n)),valid:attempted.filter(r=>r.validity.valid).length,complete:included.length,partial:attempted.filter(r=>!r.complete).length,censored:included.filter(r=>r.censored).length,abandoned:included.filter(r=>r.abandoned).length,subjectiveDone:included.filter(r=>r.subjective.perceivedDone).length,objectiveSuccess:included.filter(r=>r.objective?.value===true).length,objectiveDenominator:included.filter(r=>r.objective?.status==='OK').length,choices:Object.fromEntries([...Object.keys(choiceGroups),'revisits'].map(name=>{const evidence=included.flatMap(r=>{const choice=(r.choices as unknown as Record<string,{count:number;evidence:unknown[]}>)[name];return choice.evidence.map(e=>({id:r.id,runId:r.runId,evidence:clone(e)}));});return [name,{count:evidence.length,denominator:included.length,evidence}];})),firstChoices:included.map(r=>({id:r.id,runId:r.runId,evidence:clone(r.choices.firstAction)})),reasonCategories:histogram(included.flatMap(r=>r.reasonEvidence.map(e=>e.category)))}];
  }));
  return [task,{planned:12,attempted:items.length,paths:{complete:valid,partial:items.filter(r=>!r.complete)},distances:distances(valid),actors,sameImageComparisons:compareImages(records.filter(r=>r.fixture.task===task),runs)}];
 }));
 return {schemaVersion:1,kind:'descriptive-persona-task-comparison' as const,runs,tasks,integrity:{ok:errors.length===0,errors},qualitativeConsistency:'unassessed' as const,humanMatch:'unvalidated' as const,interpretation:{paths:'Only valid fully audited observed-to-stop trajectories enter route distances, including explicitly censored caps. Invalid observed prefixes remain separate. Distances are length-sensitive and imply no behavior beyond the imposed bounds.',controls:'Tokens use observed route, actual UI action and unique audit control text, never image-local candidate IDs across images. Audit truth remains reviewer-only.',screens:'Same PNG does not establish identical full decision input or history. recordedActionInputEqual compares only saved action-stage input, questions and assets; it does not compare all native/assessment inputs. Stable observed targets and generated candidate annotations are compared separately; raw TV requires exact candidate bindings and annotations.',reasons:'Model-reported categories are self-report only, not internal cognition or verified explanations.',choices:'Facts derive from observed successful UI actions and snapshot event deltas, with before/after references. Valid actor aggregates exclude invalid prefixes; absence is not comprehension.',limits:'Three repeats are descriptive; correlated pair distances provide no significance, naturalness ranking, field-level Persona attribution or validated human match. Goal outcomes, subjective done, infrastructure and censoring remain separate.',reuse:'Existing Persona parser, audit records and routeDistance are reused. No research dependency, model or learned weight is introduced.'}};
}

type Path={id:string;actor:PersonaTaskRecord['actor'];routeTokens:string[]};
function distances(paths:Path[]){
 const within:{left:string;right:string;actor:string;distance:number}[]=[],between:{left:string;right:string;actors:string[];distance:number}[]=[];
 for(let i=0;i<paths.length;i++)for(let j=i+1;j<paths.length;j++){const a=paths[i],b=paths[j],distance=routeDistance(a.routeTokens,b.routeTokens);if(a.actor===b.actor)within.push({left:a.id,right:b.id,actor:a.actor,distance});else between.push({left:a.id,right:b.id,actors:[a.actor,b.actor],distance});}
 const summary=<T extends {distance:number}>(pairs:T[])=>({count:pairs.length,mean:mean(pairs.map(p=>p.distance)),pairs});
 const a=mean(within.map(p=>p.distance)),b=mean(between.map(p=>p.distance));
 return {within:summary(within),between:summary(between),betweenMinusWithin:a===null||b===null?null:b-a,byActor:Object.fromEntries(personaBetaActors.map(actor=>[actor,summary(within.filter(p=>p.actor===actor))]))};
}
function imageOccurrences(record:PersonaTaskRecord,valid:boolean){
 const seen=new Set<string>();return (record.result?.steps??[]).flatMap(s=>{
  const image=s.assetFiles?.current?.sha256;if(!image||seen.has(image))return [];seen.add(image);
  const route=s.audit?.personaTask?.route??null,observedTargets=s.audit?.screen?.elements?.map(e=>({candidateId:e.id,route,type:e.type,text:e.text})).sort((a,b)=>a.candidateId.localeCompare(b.candidateId))??null;
  const candidateAnnotations=s.questions?.nextAction?.criteria?Object.entries(s.questions.nextAction.criteria).sort(([a],[b])=>a.localeCompare(b)):null;
  return [{id:record.id,runId:record.runId,actor:record.actor,replicate:record.replicate,step:s.number,observationId:s.observationId??null,imageSha256:image,valid,observedTargets,candidateAnnotations,raw:clone(s.selection?.raw??null),selected:s.selection?.selected??null,actualAction:actionEvidence(s),inputPresent:!!s.modelInput,recordedInputSha256:s.modelInput?sha({input:s.modelInput,questions:s.questions,assets:s.assetFiles}):null}];
 });
}
type Occurrence=ReturnType<typeof imageOccurrences>[number];
function totalVariation(a:Occurrence['raw'],b:Occurrence['raw']){
 if(!a||!b||!equal(Object.keys(a).sort(),Object.keys(b).sort()))return null;
 if([a,b].some(d=>Object.values(d).some(v=>!Number.isFinite(v)||v<0)||Math.abs(Object.values(d).reduce((s,p)=>s+p,0)-1)>1e-8))return null;
 return Object.keys(a).reduce((s,k)=>s+Math.abs(a[k]-b[k]),0)/2;
}
function compareImages(records:PersonaTaskRecord[],runs:{id:string;validity:{valid:boolean}}[]){
 const firstOccurrences=records.flatMap(r=>imageOccurrences(r,runs.find(run=>run.id===r.id)?.validity.valid??false));
 const pairs:{left:Occurrence;right:Occurrence;imageSha256:string;stableObservedTargetsEqual:boolean|null;candidateAnnotationsEqual:boolean|null;exactCandidateBindings:boolean;rawTotalVariation:number|null;selectedTargetEqual:boolean|null;recordedActionInputEqual:boolean|null;fullInputEqualityEstablished:false;sharedHistoryEstablished:false}[]=[];
 for(let i=0;i<firstOccurrences.length;i++)for(let j=i+1;j<firstOccurrences.length;j++){
  const left=firstOccurrences[i],right=firstOccurrences[j];if(left.runId===right.runId||left.imageSha256!==right.imageSha256)continue;
  const stable=(o:Occurrence)=>o.observedTargets?.map(({candidateId,...target})=>JSON.stringify(target)).sort()??null;
  const stableObservedTargetsEqual=left.observedTargets&&right.observedTargets?equal(stable(left),stable(right)):null;
  const candidateAnnotationsEqual=left.candidateAnnotations&&right.candidateAnnotations?equal(left.candidateAnnotations,right.candidateAnnotations):null;
  const exactCandidateBindings=!!left.observedTargets&&!!right.observedTargets&&equal(left.observedTargets,right.observedTargets)&&candidateAnnotationsEqual===true;
  pairs.push({left:clone(left),right:clone(right),imageSha256:left.imageSha256,stableObservedTargetsEqual,candidateAnnotationsEqual,exactCandidateBindings,rawTotalVariation:exactCandidateBindings&&left.valid&&right.valid?totalVariation(left.raw,right.raw):null,selectedTargetEqual:left.actualAction.bound&&right.actualAction.bound?equal([left.actualAction.route,left.actualAction.action?.type,left.actualAction.reviewerControlText],[right.actualAction.route,right.actualAction.action?.type,right.actualAction.reviewerControlText]):null,fullInputEqualityEstablished:false,recordedActionInputEqual:left.recordedInputSha256&&right.recordedInputSha256?left.recordedInputSha256===right.recordedInputSha256:null,sharedHistoryEstablished:false});
 }
 return {firstOccurrences,sameImagePairs:pairs.length,candidateBindingMismatches:pairs.filter(p=>!p.exactCandidateBindings).length,measuredDistributionPairs:pairs.filter(p=>p.rawTotalVariation!==null).length,pairs};
}
