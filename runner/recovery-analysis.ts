import {isDeepStrictEqual} from 'node:util';
import {createHash} from 'node:crypto';
import {recoveryDefinition,recoveryFixtures,type RecoveryFixture} from '../app/recovery-fixture.js';
import {humanJevProfile} from './human-jev-profiles.js';
import type {RecoveryAuditSnapshot,RecoveryRunRecord} from './recovery-contracts.js';
import type {BetaStep} from './virtual-beta-core.js';

const sha=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const key=(r:Pick<RecoveryRunRecord,'fixture'>)=>`${r.fixture?.task??'unknown'}/${r.fixture?.condition??'unknown'}`;
const slotKey=(r:Pick<RecoveryRunRecord,'fixture'|'replicate'>)=>key(r)+'/r'+r.replicate;
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const unique=(v:string[])=>[...new Set(v)];
const count=(v:string[])=>{const out:Record<string,number>={};for(const value of v)out[value]=(out[value]??0)+1;return out;};
const mean=(v:number[])=>v.length?v.reduce((a,b)=>a+b,0)/v.length:null;
function snapshot(value:unknown):RecoveryAuditSnapshot|null{
 if(!object(value)||value.schemaVersion!==1||!['primary','home','account','records','alternative'].includes(value.route as string)||typeof value.eligible!=='boolean'||typeof value.complete!=='boolean'||typeof value.savedValue!=='string'||!Number.isSafeInteger(value.verificationAttempts)||Number(value.verificationAttempts)<0||!Number.isSafeInteger(value.recordChecks)||Number(value.recordChecks)<0)return null;
 return {schemaVersion:1,route:value.route as RecoveryAuditSnapshot['route'],eligible:value.eligible,verificationAttempts:Number(value.verificationAttempts),recordChecks:Number(value.recordChecks),savedValue:value.savedValue,complete:value.complete};
}
function localURL(value:string|undefined){if(!value)return null;try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)?u.pathname+u.search+u.hash:null;}catch{return null;}}
type Evidence={kind:'observation'|'terminal';step:number;observationId:string|null;imageSha256:string|null;url:string|null;snapshot:RecoveryAuditSnapshot;delivered:boolean;deliveredStages:('assessment'|'action')[]};
function observationEvidence(record:RecoveryRunRecord,step:BetaStep):Evidence|null{
 const state=snapshot(step.audit?.recovery);if(!state)return null;
 const hash=step.assetFiles?.current?.sha256??null;
 const matching=(record.frameChecks??[]).filter(f=>f.step===step.number&&f.observationId===step.observationId&&hash!==null&&f.imageSha256===hash&&f.validCurrentFrame&&f.successfulResponse&&f.scope==='full-viewport-current'&&(!step.vision||step.vision.imageSha256===hash));
 const stages=[...new Set(matching.map(f=>f.stage))];
 return {kind:'observation',step:step.number,observationId:step.observationId??null,imageSha256:hash,url:localURL(step.audit?.url),snapshot:state,delivered:stages.length>0,deliveredStages:stages};
}
function summarizeRun(record:RecoveryRunRecord,identityErrors:string[]){
 const r=record.result,steps=r?.steps??[],auditErrors:string[]=[];
 let definition:ReturnType<typeof recoveryDefinition>|undefined;try{definition=recoveryDefinition(record.fixture);}catch{auditErrors.push('INVALID_FIXTURE');}
 const observed=steps.map(s=>observationEvidence(record,s));
 for(const [i,s] of steps.entries()){
  if(!observed[i])auditErrors.push('MISSING_OR_INVALID_SNAPSHOT');
  if(s.number!==i+1||s.observationId!=='o'+s.number)auditErrors.push('OBSERVATION_SEQUENCE_MISMATCH');
  if(observed[i]&&!observed[i]!.imageSha256)auditErrors.push('MISSING_CURRENT_IMAGE_REFERENCE');
 }
 const terminalState=snapshot(r?.recovery?.terminalSnapshot),terminal:Evidence|null=terminalState?{kind:'terminal',step:steps.at(-1)?.number??0,observationId:null,imageSha256:null,url:null,snapshot:terminalState,delivered:false,deliveredStages:[]}:null;
 if(r&&!terminal)auditErrors.push('MISSING_OR_INVALID_TERMINAL_SNAPSHOT');
 const first=observed[0]??null;
 const initiallyBlocked=first!==null&&first.snapshot.route==='primary'&&!first.snapshot.eligible&&!first.snapshot.complete;
 if(r&&first&&!initiallyBlocked)auditErrors.push('INITIAL_PRIMARY_NOT_BLOCKED');
 for(const ref of [...observed.filter((e):e is Evidence=>e!==null),...(terminal?[terminal]:[])]){
  if(definition&&![definition.originalValue,definition.desiredValue].includes(ref.snapshot.savedValue))auditErrors.push('UNEXPECTED_SAVED_VALUE');
  if(definition&&ref.snapshot.complete!==(ref.snapshot.savedValue===definition.desiredValue))auditErrors.push('SAVED_VALUE_COMPLETE_MISMATCH');
 }
 if(r){
  if(!r.recovery||!isDeepStrictEqual(r.recovery.fixture,record.fixture)||definition&&r.recovery.definitionHash!==sha(definition)||r.recovery.initialProductImage.sha256!==record.initialImageSha256)auditErrors.push('RECOVERY_METADATA_MISMATCH');
  if(definition&&r.input.charter.goal!==definition.goal)auditErrors.push('GOAL_MISMATCH');
  if(terminal&&r.objectiveAssessment.status==='OK'&&r.objectiveAssessment.value!==terminal.snapshot.complete)auditErrors.push('OBJECTIVE_SNAPSHOT_MISMATCH');
 }
 const transitions=steps.map((step,i)=>{
  const before=observed[i]??null,next=steps[i+1],after=i+1<steps.length?(next.number===step.number+1?observed[i+1]:null):terminal;
  const actualUI=step.outcome==='UI_PERFORMED'&&!!step.action&&['click','back','scroll'].includes(step.action.type),navigation=actualUI&&['click','back'].includes(step.action!.type),errors:string[]=[];
  let role:'confirm'|'reconcile'|null=null,eligibleChanged=false,save=false;
  if(before&&after){
   const a=before.snapshot,b=after.snapshot,dConfirm=b.verificationAttempts-a.verificationAttempts,dReconcile=b.recordChecks-a.recordChecks;
   if(dConfirm<0||dReconcile<0||a.eligible&&!b.eligible||a.complete&&!b.complete)errors.push('STATE_REGRESSION');
   if(a.route!==b.route&&!navigation)errors.push('ROUTE_CHANGE_WITHOUT_PERFORMED_NAVIGATION');
   if(dConfirm!==0||dReconcile!==0){
    if(actualUI&&step.action?.type==='click'&&a.route==='account'&&b.route==='account'&&dConfirm===1&&dReconcile===0)role='confirm';
    else if(actualUI&&step.action?.type==='click'&&a.route==='records'&&b.route==='records'&&dReconcile===1&&dConfirm===0)role='reconcile';
    else errors.push('COUNTER_CHANGE_WITHOUT_MATCHING_OPERATION');
   }
   eligibleChanged=!a.eligible&&b.eligible;
   if(eligibleChanged&&!role)errors.push('ELIGIBILITY_CHANGE_WITHOUT_MATCHING_OPERATION');
   if(!a.complete&&b.complete){
    const saveRoute=record.fixture.condition==='switch'?'alternative':'primary';
    save=actualUI&&step.action?.type==='click'&&a.route===saveRoute&&b.route===saveRoute&&(record.fixture.condition==='switch'||a.eligible)&&b.savedValue===definition?.desiredValue&&!dConfirm&&!dReconcile;
    if(!save)errors.push('COMPLETION_WITHOUT_VALID_SAVE_OPERATION');
   }
   if(a.savedValue!==b.savedValue&&!save)errors.push('SAVED_VALUE_CHANGE_WITHOUT_VALID_SAVE_OPERATION');
  }
  auditErrors.push(...errors);
  return {step:step.number,observationId:step.observationId??null,sourceImageSha256:before?.imageSha256??null,action:step.action?structuredClone(step.action):null,outcome:step.outcome??null,actualUI,navigation,before,after,afterKind:after?.kind??'unknown',fromURL:before?.url??null,toURL:after?.kind==='observation'?after.url:null,stateConsistent:errors.length===0&&before!==null&&after!==null,role,eligibleChanged,save,errors};
 });
 const prerequisiteEvents=transitions.flatMap(t=>t.stateConsistent&&t.role?[{step:t.step,kind:t.role,eligibleBefore:t.before!.snapshot.eligible,eligibleAfter:t.after!.snapshot.eligible,eligibleChanged:t.eligibleChanged,delivered:t.after!.delivered,evidence:{before:t.before!,after:t.after!}}]:[]);
 const saves=transitions.flatMap(t=>t.stateConsistent&&t.save?[{step:t.step,route:t.before!.snapshot.route,delivered:t.after!.delivered,evidence:{before:t.before!,after:t.after!}}]:[]);
 type Revisit={step:number;eligible:boolean;afterPrerequisiteChange:boolean;afterUnchangedConfirmation:boolean;changeStep:number|null;confirmationStep:number|null;changeDelivered:boolean;confirmationDelivered:boolean;evidence:{departure:Evidence;before:Evidence;after:Evidence}};
 const revisits:Revisit[]=[];let departure:Evidence|undefined;
 for(const t of transitions){
  if(!t.stateConsistent){departure=undefined;continue;}
  if(!t.navigation)continue;
  const from=t.before!,to=t.after!;
  if(from.snapshot.route==='primary'&&to.snapshot.route!=='primary')departure=from;
  if(from.snapshot.route!=='primary'&&to.snapshot.route==='primary'&&departure){
   const changed=prerequisiteEvents.filter(e=>e.eligibleChanged&&e.step<t.step).at(-1),unchanged=prerequisiteEvents.filter(e=>e.kind==='confirm'&&!e.eligibleAfter&&e.step<t.step).at(-1);
   const afterChange=to.snapshot.eligible&&changed!==undefined,afterUnchanged=!to.snapshot.eligible&&unchanged!==undefined;
   revisits.push({step:t.step,eligible:to.snapshot.eligible,afterPrerequisiteChange:afterChange,afterUnchangedConfirmation:afterUnchanged,changeStep:afterChange?changed!.step:null,confirmationStep:afterUnchanged?unchanged!.step:null,changeDelivered:afterChange&&changed!.delivered,confirmationDelivered:afterUnchanged&&unchanged!.delivered,evidence:{departure,before:from,after:to}});departure=undefined;
  }
 }
 const changedReturns=revisits.filter(v=>v.afterPrerequisiteChange),afterChangeSaves=saves.filter(s=>s.route==='primary'&&changedReturns.some(v=>v.step<s.step));
 const switchSaves=saves.filter(s=>s.route==='alternative'&&initiallyBlocked&&transitions.some(t=>t.navigation&&t.stateConsistent&&t.before?.snapshot.route==='primary'&&t.after?.snapshot.route!=='primary'&&t.step<s.step));
 const changes=prerequisiteEvents.filter(e=>e.eligibleChanged),unchangedConfirms=prerequisiteEvents.filter(e=>e.kind==='confirm'&&!e.eligibleAfter);
 const coverageComplete=r!==undefined&&observed.length>0&&observed.every(Boolean)&&terminal!==null&&auditErrors.length===0;
 const choices=steps.flatMap(s=>s.selection?[{step:s.number,observationId:s.observationId??null,imageSha256:s.assetFiles?.current?.sha256??null,modelChoice:s.selection.modelChoice,selected:s.selection.selected,differsFromModel:s.selection.modelChoice!==s.selection.selected,baselineSelected:s.selection.policy?.scope?.baselineSelected??null,differsFromBaseline:s.selection.policy?.scope?s.selection.policy.scope.baselineSelected!==s.selection.selected:null,raw:structuredClone(s.selection.raw),filtered:structuredClone(s.selection.filtered),policy:s.selection.policy?structuredClone(s.selection.policy):null}]:[]);
 const reasonReports=steps.flatMap(s=>s.deferralReason?[{step:s.number,observationId:s.observationId??null,imageSha256:s.assetFiles?.current?.sha256??null,kind:'model-self-report-not-verified-truth' as const,reviews:structuredClone(s.deferralReason.record.reviews),releasedCandidates:[...s.deferralReason.record.releasedCandidates]}]:[]);
 const infrastructure=!r||record.status==='FAILED'||['API_ERROR','ACTION_ERROR','OBSERVATION_ERROR'].includes(r.termination)||r.objectiveAssessment.status!=='OK'||r.terminalObservation.status!=='RECORDED';
 const categories={infrastructure,invalidDistribution:r?.termination==='INVALID_DISTRIBUTION',safety:r?.termination==='SAFETY_STOP',limit:r!==undefined&&['UI_ACTION_LIMIT','LOOK_LIMIT','DECISION_LIMIT','API_LIMIT','TIME_LIMIT'].includes(r.termination),abandoned:r?.termination==='ABANDONED',stuck:r?.termination==='STUCK'};
 const reasons=unique([...identityErrors,...auditErrors,...(!r?['NO_RESULT']:[]),...(record.status!=='RESULT'?['TRIAL_NOT_COMPLETED']:[]),...(record.error?['TRIAL_ERROR']:[]),...(r&&!r.validForComparison?['REPORTED_INVALID']:[]),...(infrastructure?['INFRASTRUCTURE_FAULT']:[]),...(categories.invalidDistribution?['INVALID_DISTRIBUTION']:[]),...(categories.safety?['SAFETY_STOP']:[]),...(record.replay?.status==='ERROR'?['REPLAY_FAILED']:[]),...(r&&r.objectiveAssessment.value!==r.objectiveSuccess?['OBJECTIVE_VALUE_MISMATCH']:[])]);
 return {id:record.id,runId:record.runId,fixture:structuredClone(record.fixture),replicate:record.replicate,status:record.status,dir:record.dir,resultPath:record.resultPath,ledger:record.ledger,ledgerEvidence:record.ledgerEvidence??null,source:r?.code??null,initialImageSha256:record.initialImageSha256,objectiveAssessment:r?.objectiveAssessment??null,perceivedDone:r?.perceivedDone??null,termination:r?.termination??null,validity:{valid:reasons.length===0,reasons},categories,auditErrors:unique(auditErrors),initialBlocked:{observed:initiallyBlocked,delivered:initiallyBlocked&&first!.delivered,evidence:first},coverageComplete,opportunities:{prerequisiteChange:record.fixture.condition==='switch'?'not-applicable':changes.length?'occurred':coverageComplete?'none-observed':'unknown',unchangedConfirmation:record.fixture.condition!=='unchanged'?'not-applicable':unchangedConfirms.length?'occurred':coverageComplete?'none-observed':'unknown'},transitions,prerequisiteEvents,revisits,saves,switchCompletion:{applicable:record.fixture.condition==='switch',completed:switchSaves.length>0,evidence:switchSaves},recoveryAfterChange:{applicable:record.fixture.condition!=='switch',completed:afterChangeSaves.length>0,returns:changedReturns,evidence:afterChangeSaves},choices,reasonReports,metrics:{uiActions:r?.uiActions??null,looks:r?.looks??null,judgments:r?.decisions??null,requests:record.requests,recordedAPICalls:r?.apiCalls??null,selectionCorrections:choices.filter(c=>c.differsFromModel).length,baselineSelectionChanges:choices.filter(c=>c.differsFromBaseline===true).length,earlyUnchangedRevisits:revisits.filter(v=>v.afterUnchangedConfirmation).length},timing:{apiMs:r?.apiMs??null,uiMs:r?.uiMs??null,elapsedMs:r?.elapsedMs??null,humanTimeMs:null}};
}
/** Offline, descriptive snapshot/action analysis only. No certification paths or model calls. */
export function analyzeRecoveryRuns(records:RecoveryRunRecord[],options:{mode?:'experience-goal-search-grounded'|'experience-action-relations'|'experience-action-relations-current'|'experience-visual-conditions';replicates?:1|2}={}){
 const mode=options.mode??'experience-goal-search-grounded';if(!['experience-goal-search-grounded','experience-action-relations','experience-action-relations-current','experience-visual-conditions'].includes(mode))throw Error('INVALID_RECOVERY_ANALYSIS_MODE');
 const replicates=options.replicates??2;if(replicates!==1&&replicates!==2)throw Error('INVALID_RECOVERY_REPLICATES');const allowedReplicates=replicates===1?[1]:[1,2],plannedTrials=6*replicates;
 const errors:{code:string;ids:string[]}[]=[],per=records.map(()=>[] as string[]),profile=humanJevProfile(mode);
 const add=(code:string,indexes:number[])=>{errors.push({code,ids:indexes.map(i=>records[i].id)});for(const i of indexes)per[i].push(code);};
 const ids=new Map<string,number[]>(),runIds=new Map<string,number[]>(),slots=new Map<string,number[]>();
 records.forEach((record,i)=>{
  for(const [map,k] of [[ids,record.id],[runIds,record.runId],[slots,slotKey(record)]] as const)map.set(k,[...(map.get(k)??[]),i]);
  if(!recoveryFixtures().some(f=>isDeepStrictEqual(f,record.fixture))||!allowedReplicates.includes(record.replicate))add('UNEXPECTED_CELL',[i]);
  if(!record.id||!record.runId||record.result&&record.result.runId!==record.runId)add('RUN_ID_MISMATCH',[i]);
  const r=record.result;if(!r)return;
  if(!isDeepStrictEqual(r.config,profile.config)||r.condition!==profile.config.id)add('CONFIG_MISMATCH',[i]);
  if(r.input.persona!==undefined&&r.input.persona!==null)add('PERSONA_MISMATCH',[i]);
  if(!r.code?.sourceHash||!r.code.revision)add('MISSING_SOURCE_IDENTITY',[i]);
  if(!record.initialImageSha256)add('MISSING_INITIAL_IMAGE',[i]);
  if(!Number.isInteger(record.requests)||record.requests<0||record.requests>profile.maximumRequests||r.apiCalls>profile.config.maxAPICalls||r.decisions>12||r.uiActions>15||r.looks>3)add('TRIAL_CAP_EXCEEDED',[i]);
 });
 for(const [map,code] of [[ids,'DUPLICATE_SLOT_ID'],[runIds,'DUPLICATE_RUN_ID'],[slots,'DUPLICATE_CELL']] as const)for(const indexes of map.values())if(indexes.length>1)add(code,indexes);
 const resultIndexes=records.flatMap((r,i)=>r.result?[i]:[]);
 if(new Set(resultIndexes.map(i=>JSON.stringify(records[i].result!.code))).size>1)add('SOURCE_MISMATCH',resultIndexes);
 const runs=records.map((r,i)=>summarizeRun(r,per[i]));for(const run of runs)for(const code of run.auditErrors)errors.push({code,ids:[run.id]});
 const summarize=(items:typeof runs,planned:number)=>{
  const valid=items.filter(r=>r.validity.valid),prerequisite=items.filter(r=>r.fixture.condition!=='switch'),unchanged=items.filter(r=>r.fixture.condition==='unchanged');
  return {planned,attempted:items.length,notAttempted:Math.max(0,planned-new Set(items.filter(r=>allowedReplicates.includes(r.replicate)&&recoveryFixtures().some(f=>isDeepStrictEqual(f,r.fixture))).map(slotKey)).size),withResult:items.filter(r=>r.objectiveAssessment!==null).length,valid:valid.length,invalid:items.length-valid.length,objectiveSuccesses:valid.filter(r=>r.objectiveAssessment?.value===true).length,objectiveFailures:valid.filter(r=>r.objectiveAssessment?.value===false).length,objectiveDenominator:valid.length,falseDone:valid.filter(r=>r.perceivedDone===true&&r.objectiveAssessment?.value===false).length,subjectiveDone:items.filter(r=>r.perceivedDone===true).length,infrastructure:items.filter(r=>r.categories.infrastructure).length,invalidDistributions:items.filter(r=>r.categories.invalidDistribution).length,safetyStops:items.filter(r=>r.categories.safety).length,limits:items.filter(r=>r.categories.limit).length,abandoned:items.filter(r=>r.categories.abandoned).length,stuck:items.filter(r=>r.categories.stuck).length,terminations:count(items.map(r=>r.termination??'NO_RESULT')),requests:items.reduce((n,r)=>n+r.metrics.requests,0),meanUIActions:mean(valid.map(r=>r.metrics.uiActions!)),meanJudgments:mean(valid.map(r=>r.metrics.judgments!)),initialBlocked:{observedRuns:items.filter(r=>r.initialBlocked.observed).length,deliveredRuns:items.filter(r=>r.initialBlocked.delivered).length,unknownRuns:items.filter(r=>r.initialBlocked.evidence===null).length},switchCompletedRuns:items.filter(r=>r.switchCompletion.applicable&&r.switchCompletion.completed).length,prerequisite:{applicableAttempted:prerequisite.length,occurredRuns:prerequisite.filter(r=>r.prerequisiteEvents.some(e=>e.eligibleChanged)).length,deliveredRuns:prerequisite.filter(r=>r.prerequisiteEvents.some(e=>e.eligibleChanged&&e.delivered)).length,noOpportunityRuns:prerequisite.filter(r=>r.opportunities.prerequisiteChange==='none-observed').length,unknownRuns:prerequisite.filter(r=>r.opportunities.prerequisiteChange==='unknown').length,returnedRuns:prerequisite.filter(r=>r.revisits.some(v=>v.afterPrerequisiteChange)).length,completedRuns:prerequisite.filter(r=>r.recoveryAfterChange.completed).length},unchanged:{applicableAttempted:unchanged.length,confirmedStillBlockedRuns:unchanged.filter(r=>r.prerequisiteEvents.some(e=>e.kind==='confirm'&&!e.eligibleAfter)).length,deliveredStillBlockedRuns:unchanged.filter(r=>r.prerequisiteEvents.some(e=>e.kind==='confirm'&&!e.eligibleAfter&&e.delivered)).length,earlyRevisitRuns:unchanged.filter(r=>r.metrics.earlyUnchangedRevisits>0).length,earlyRevisitEvents:unchanged.reduce((n,r)=>n+r.metrics.earlyUnchangedRevisits,0)},selectionCorrections:items.reduce((n,r)=>n+r.metrics.selectionCorrections,0)};
 };
 const cells=recoveryFixtures().map(f=>{
  const items=runs.filter(r=>isDeepStrictEqual(r.fixture,f)),initials=unique(items.flatMap(r=>r.initialImageSha256?[r.initialImageSha256]:[])),configs=unique(records.filter(r=>isDeepStrictEqual(r.fixture,f)&&r.result).map(r=>JSON.stringify(r.result!.config)));
  return {key:key({fixture:f}),fixture:f,...summarize(items,replicates),initialImages:{consistent:items.filter(r=>r.initialImageSha256).length>1?initials.length===1:null,hashes:initials},configs:{consistent:configs.length>1?false:items.filter(r=>r.objectiveAssessment).length>1?true:null},aggregationUncertain:initials.length>1||configs.length>1};
 });
 const missing=recoveryFixtures().flatMap(f=>allowedReplicates.filter(replicate=>!slots.has(slotKey({fixture:f,replicate}))).map(replicate=>slotKey({fixture:f,replicate})));
 return {schemaVersion:1,kind:'offline-recovery-transfer-descriptive',completeness:{planned:plannedTrials,attempted:records.length,withResult:resultIndexes.length,valid:runs.filter(r=>r.validity.valid).length,missing,complete:records.length===plannedTrials&&resultIndexes.length===plannedTrials&&missing.length===0&&[...slots.values()].every(v=>v.length===1)},integrity:{ok:errors.length===0,errors},totals:summarize(runs,plannedTrials),cells,runs,limitations:['All trials start on an explicitly blocked primary screen; initial exposure does not establish self-directed discovery of a dead end.','Snapshot ground truth, successful current-frame delivery, model self-reports and actual UI operations are separate evidence. Delivered pixels do not establish reading or understanding.','Behavior counts describe locally established transitions in attempted trials, including partial/faulted trials. Valid objective outcomes and valid-run means have their own denominators.','Prerequisite roles require actual successful clicks with one matching confirm/reconcile counter increment; certification routes are never consulted.','Revisits require a recorded UI departure and return. Wait, reread and repeated observations do not establish a revisit. Missing transitions are not interpolated.','Terminal snapshots may establish actual state after the last UI operation but never establish model exposure or an unrecorded URL.','An unchanged-eligibility early return records lack of prerequisite progress; it is not a prohibition or a claim about natural human behavior.','Absence of an observed or delivered opportunity is not evidence of successful avoidance, comprehension or correct release decisions.',replicates===2?'Two repeats per task/condition provide descriptive evidence only; no human fidelity, broad stability or causal claim.':'One repeat per task/condition is an initial bounded comparison only; reproducibility, human fidelity and causal effects remain unverified.','Limits and infrastructure failures remain separate. A final saved UI state may satisfy the objective without a later delivered confirmation or subjective done.']};
}
