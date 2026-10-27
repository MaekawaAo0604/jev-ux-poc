import type {BetaResult,BetaStep} from './virtual-beta-core.js';
import type {Point,Rect} from '../jev/virtual-beta/contracts.js';

const budgetTerminations=new Set(['API_LIMIT','TIME_LIMIT','UI_ACTION_LIMIT','LOOK_LIMIT','DECISION_LIMIT']);
const invalidTerminations=new Set(['API_ERROR','INVALID_DISTRIBUTION','ACTION_ERROR','OBSERVATION_ERROR','SAFETY_STOP']);
const measuredROIIds=['notification-entry','notification-stop'];
const validRect=(r:Rect|undefined):r is Rect=>!!r&&[r.x,r.y,r.width,r.height].every(Number.isFinite)&&r.width>0&&r.height>0;
const pointInside=(p:Point|undefined,r:Rect)=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)?p.x>=r.x&&p.y>=r.y&&p.x<r.x+r.width&&p.y<r.y+r.height:null;
const fullyContains=(outer:Rect|undefined,inner:Rect)=>validRect(outer)?inner.x>=outer.x&&inner.y>=outer.y&&inner.x+inner.width<=outer.x+outer.width&&inner.y+inner.height<=outer.y+outer.height:null;
const offered=(s:BetaStep|undefined)=>s?.questions?.nextAction?.criteria?Object.keys(s.questions.nextAction.criteria):null;
const clicks=(s:BetaStep|undefined)=>offered(s)?.filter(id=>/^e[1-9]\d*$/.test(id))??null;
const source=(s:BetaStep|undefined)=>s?.audit?.sourceSha256||null;
const consistentSource=(s:BetaStep|undefined)=>!!source(s)&&!!s?.vision?.sourceSha256&&source(s)===s.vision.sourceSha256;

/** Pure projection of recorded evidence, not a filesystem/hash verifier or a cognitive model. */
export function analyzeRun(result:BetaResult){
 const reasons:string[]=[];
 let artifactValidity:'artifact-valid'|'infra-invalid'|'unknown'='unknown';
 if(invalidTerminations.has(result.termination))reasons.push('INFRASTRUCTURE_TERMINATION');
 if(result.terminalObservation?.status==='ERROR')reasons.push('TERMINAL_CAPTURE_ERROR');
 if(result.objectiveAssessment?.status==='ERROR')reasons.push('OBJECTIVE_ORACLE_ERROR');
 if(result.validForComparison===false)reasons.push('RUN_REPORTED_INVALID');
 if(result.objectiveAssessment?.status==='OK'&&result.objectiveAssessment.value!==result.objectiveSuccess)reasons.push('OBJECTIVE_METADATA_MISMATCH');
 if(result.steps.some(s=>source(s)&&s.vision?.sourceSha256&&!consistentSource(s)))reasons.push('OBSERVATION_SOURCE_MISMATCH');
 if(reasons.length)artifactValidity='infra-invalid';
 else if(result.validForComparison===true&&result.terminalObservation?.status==='RECORDED'&&result.objectiveAssessment?.status==='OK'&&typeof result.objectiveAssessment.value==='boolean')artifactValidity='artifact-valid';
 else reasons.push('AUDIT_VALIDITY_METADATA_MISSING_OR_UNKNOWN');
 const behavior=budgetTerminations.has(result.termination)?'budget-censored' as const:result.termination==='ABANDONED'?'voluntary-abandonment' as const:result.termination==='STUCK'?'stuck' as const:result.termination==='SUBJECTIVE_DONE'?'perceived-done' as const:result.termination==='OBJECTIVE_SUCCESS'?'objective-success' as const:'error' as const;
 const timeline=result.steps.map(s=>({
  decision:s.number,observationId:s.observationId??null,
  inputSha256:s.inputSha256??null,rawSourceSha256:source(s),
  rawScreenshot:s.audit?.rawScreenshot??null,inputImageSha256:s.vision?.imageSha256??null,
  assets:s.assetFiles?structuredClone(s.assetFiles):null,
  // The input contains only the already-admitted model view; audit DOM stays out.
  modelInput:s.modelInput?structuredClone(s.modelInput):null,
  fixation:s.vision?.fixation?{...s.vision.fixation}:null,
  clearRect:s.vision?.clearRect?{...s.vision.clearRect}:null,
  transform:s.vision?.transform?{...s.vision.transform}:null,
  memory:s.userState?{revision:s.userState.revision,enabled:result.config.state.enabled,entries:structuredClone(s.userState.memory),lastObservation:s.userState.lastObservation?structuredClone(s.userState.lastObservation):null}:null,
  offeredCandidateIds:offered(s),offeredClickIds:clicks(s),
  offeredCandidates:s.questions?.nextAction?.criteria?{...s.questions.nextAction.criteria}:null,
  modelProposal:s.selection?.modelChoice??s.response?.answers?.nextAction?.choice??null,
  selected:s.selection?.selected??null,
  proposalDiffersFromSelection:s.selection?s.selection.modelChoice!==s.selection.selected:null,
  selection:s.selection?structuredClone(s.selection):null,
  action:s.action?structuredClone(s.action):null,outcome:s.outcome??null,error:s.error??null,
  objectiveSuccess:s.objectiveSuccess??null,counters:s.counts?{...s.counts}:null,
  timing:s.timing?{...s.timing}:null,
  reasonEvidence:s.reasonEvidence?{...s.reasonEvidence,evidenceKind:'model-self-report-only' as const}:null,
  regionsOfInterest:(s.audit?.regionsOfInterest??[]).map(roi=>({id:roi.id,definition:roi.definition,rect:{...roi.rect},fixationInside:validRect(roi.rect)?pointInside(s.vision?.fixation,roi.rect):null,fullySharp:validRect(roi.rect)?fullyContains(s.vision?.clearRect,roi.rect):null})),
 }));
 const lookEffectPairs=result.steps.flatMap((before,index)=>{
  if(before.action?.type!=='look'||before.outcome!=='FIXATION_MOVED')return [];
  const after=result.steps[index+1];
  const rawScreenRelation:'same'|'changed'|'unknown'=consistentSource(before)&&consistentSource(after)?source(before)===source(after)?'same':'changed':'unknown';
  const beforeIds=clicks(before),afterIds=clicks(after);
  const newlyOfferedClickIds=beforeIds&&afterIds?afterIds.filter(id=>!beforeIds.includes(id)):null;
  const followingSelectedNewClick=newlyOfferedClickIds&&after?.selection?newlyOfferedClickIds.includes(after.selection.selected)&&after.action?.type==='click'&&after.action.elementId===after.selection.selected:null;
  const fixationMatchesRequested=after?.vision?.fixation?after.vision.fixation.x===before.action.point.x&&after.vision.fixation.y===before.action.point.y:null;
  const interpretation=rawScreenRelation==='same'&&fixationMatchesRequested&&followingSelectedNewClick?'available under policy, next selection consistent with using it':rawScreenRelation==='same'?'Same raw screen; observed eligibility and following choice only.':rawScreenRelation==='changed'?'Raw screen changed; candidate differences cannot be attributed to fixation alone.':'Missing or inconsistent raw-source evidence; look effect unknown.';
  return [{beforeDecision:before.number,afterDecision:after?.number??null,rawScreenRelation,beforeSourceSha256:source(before),afterSourceSha256:source(after),fromFixation:before.vision?.fixation?{...before.vision.fixation}:null,requestedFixation:{...before.action.point},observedNextFixation:after?.vision?.fixation?{...after.vision.fixation}:null,fixationMatchesRequested,beforeClearRect:before.vision?.clearRect?{...before.vision.clearRect}:null,afterClearRect:after?.vision?.clearRect?{...after.vision.clearRect}:null,beforeInputImageSha256:before.vision?.imageSha256??null,afterInputImageSha256:after?.vision?.imageSha256??null,newlyOfferedClickIds,followingModelProposal:after?.selection?.modelChoice??after?.response?.answers?.nextAction?.choice??null,followingSelected:after?.selection?.selected??null,followingAction:after?.action?structuredClone(after.action):null,followingOutcome:after?.outcome??null,followingSelectedNewClick,interpretation}];
 });
 const roiIds=new Set([...measuredROIIds,...timeline.flatMap(s=>s.regionsOfInterest.map(r=>r.id))]);
 const roiMetrics=[...roiIds].map(id=>{
  const observations=timeline.flatMap(s=>s.regionsOfInterest.filter(r=>r.id===id).map(r=>({decision:s.decision,...r})));
  return {id,status:observations.length?'recorded' as const:'not-recorded' as const,observedDecisions:observations.map(o=>o.decision),firstFixationInsideDecision:observations.find(o=>o.fixationInside===true)?.decision??null,firstFullySharpDecision:observations.find(o=>o.fullySharp===true)?.decision??null,interpretation:'Viewport geometry only; no inference about reading or cognition.'};
 });
 return {schemaVersion:1 as const,runId:result.runId,condition:result.condition,uiVersion:result.uiVersion?structuredClone(result.uiVersion):null,
  classification:{artifactValidity,behavior,reasons,validForOutcomeComparison:artifactValidity==='artifact-valid',completedUncensored:artifactValidity==='artifact-valid'&&!budgetTerminations.has(result.termination)&&['SUBJECTIVE_DONE','OBJECTIVE_SUCCESS'].includes(result.termination)},
  outcomes:{termination:result.termination,perceivedDone:result.perceivedDone,objectiveSuccess:result.objectiveSuccess,objectiveAssessment:result.objectiveAssessment?structuredClone(result.objectiveAssessment):null,terminalObservation:result.terminalObservation?{...result.terminalObservation}:null},
  counters:{apiCalls:result.apiCalls,decisions:result.decisions,looks:result.looks,uiActions:result.uiActions},
  timings:{apiMs:result.apiMs,uiMs:result.uiMs,elapsedMs:result.elapsedMs,modeledUserMs:result.modeledUserMs,humanTaskMs:null,interpretation:'API latency and runner elapsed time are not human task time.'},
  timeline,lookEffectPairs,roiMetrics,
 };
}
export type RunAnalysis=ReturnType<typeof analyzeRun>;
