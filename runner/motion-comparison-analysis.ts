import type {RecoveryRunRecord} from './recovery-contracts.js';
import type {BetaStep} from './virtual-beta-core.js';

type Run=RecoveryRunRecord&{actor:string};
type IntegrityError={code:string;step:number};
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const clone=<T>(v:T):T=>structuredClone(v);
const unique=<T>(v:T[])=>[...new Set(v)];
const equalWeights=(a:Record<string,number>|undefined,b:Record<string,number>|undefined)=>!!a&&!!b&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.hasOwn(b,k)&&a[k]===b[k]);
function memoryChannels(step:BetaStep){
 const channels:{name:string;stage:string;sources:{observationId:string;imageSha256:string}[];truncated:boolean}[]=[];
 for(const [stage,input] of [['action',step.modelInput],['assessment',step.deliberation?.modelInput]] as const){
  if(!input)continue;
  const state=object(input.userState)?input.userState:{};
  const values=[...Object.entries(state).filter(([k])=>['memory','experience','deliberation','visualHypotheses','conditionContinuity','goalSearch'].includes(k)).map(([k,v])=>['userState.'+k,v] as const),...Object.entries(input).filter(([k])=>/Observations$|Context$/.test(k))];
  for(const [name,value] of values.slice(0,16)){
   const sources:{observationId:string;imageSha256:string}[]=[],seen=new Set<unknown>();let visited=0,truncated=false;
   const visit=(v:unknown,depth=0)=>{
    if(!v||typeof v!=='object'||seen.has(v))return;
    if(depth>8||visited++>=128||sources.length>=16){truncated=true;return;}seen.add(v);
    if(object(v)&&typeof v.observationId==='string'&&typeof v.imageSha256==='string'&&!sources.some(s=>s.observationId===v.observationId&&s.imageSha256===v.imageSha256))sources.push({observationId:v.observationId,imageSha256:v.imageSha256});
    for(const child of Object.values(v)){if(visited>=128||sources.length>=16){truncated=true;break;}visit(child,depth+1);}
   };visit(value);channels.push({name,stage,sources,truncated});
  }
 }
 return channels;
}
function summarize(record:Run){
 const result=record.result,rawSteps=result?.steps??[],errors:IntegrityError[]=[];
 const steps=rawSteps.map(step=>{
  const image=step.assetFiles?.current?.sha256??null;
  const checks=(record.frameChecks??[]).filter(c=>c.step===step.number&&c.observationId===(step.observationId??null)&&image!==null&&c.imageSha256===image&&(!step.vision||step.vision.imageSha256===image));
  const stages=unique(checks.filter(c=>c.validCurrentFrame&&c.successfulResponse&&c.scope==='full-viewport-current').map(c=>c.stage));
  const frame={step:step.number,observationId:step.observationId??null,imageSha256:image,route:step.audit?.recovery?.route??null,delivery:image===null?'unobserved':stages.length?'verified':'unverified',verifiedStages:stages};
  const selection=step.selection,application=step.deferral?.application,decision=step.deferral?.decision,flag=result?.config?.deferral?.applyWeights;
  const baselineSelected=selection?.policy?.scope?.baselineSelected??null,applied=application?.appliedWeights;
  const nonunitApplied=applied?Object.values(applied).some(w=>w!==1):null;
  const changedByDeferral=baselineSelected!==null&&selection&&applied?baselineSelected!==selection.selected&&nonunitApplied===true:null;
  const add=(code:string)=>errors.push({code,step:step.number});
  if(selection&&flag!==undefined&&!application)add('MISSING_DEFERRAL_APPLICATION');
  if(application){
   if(flag!==undefined&&application.mode!==(flag?'apply':'observe-only'))add('APPLICATION_MODE_MISMATCH');
   if(!equalWeights(decision?.weights,application.proposedWeights))add('PROPOSED_WEIGHT_BINDING_MISMATCH');
   if(selection&&!equalWeights(selection.policy?.weights,applied))add('APPLIED_WEIGHT_BINDING_MISMATCH');
   if(application.mode==='apply'&&!equalWeights(application.proposedWeights,applied))add('ON_APPLIED_WEIGHT_MISMATCH');
  }
  if(flag===false&&selection){
   if(nonunitApplied===true)add('OFF_NONUNIT_APPLIED_WEIGHTS');
   if(baselineSelected!==null&&baselineSelected!==selection.selected)add('OFF_BASELINE_SELECTION_CHANGED');
  }
  const actualUI=step.outcome==='UI_PERFORMED'&&!!step.action&&['click','back','scroll'].includes(step.action.type);
  const candidateId=step.action?.type==='click'?step.action.elementId:null;
  const controls=candidateId?step.audit?.screen?.elements?.filter(e=>e.id===candidateId):[];
  return {step:step.number,frame,modelChoice:selection?.modelChoice??null,baselineSelected,selected:selection?.selected??null,mandatoryAdjustments:clone(selection?.adjustments??[]),computedWeights:clone(decision?.weights??null),appliedWeights:clone(applied??null),legacyPolicyWeights:clone(selection?.policy?.weights??null),applicationMeasured:!!application,applicationMode:application?.mode??null,nonunitApplied,changedByDeferral,actualUI,action:clone(step.action??null),outcome:step.outcome??null,candidateId,reviewerControlText:controls?.length===1?controls[0].text:null,memoryChannels:memoryChannels(step)};
 }).map((s,i,all)=>({...s,nextObservedFrame:all[i+1]?.step===s.step+1&&all[i+1]?.frame.imageSha256!==null?clone(all[i+1].frame):null}));
 const patterns: {kind:'A-B-A-B';evidence:string;steps:typeof steps}[]=[];
 for(let i=0;i+3<steps.length;i++){
  const window=steps.slice(i,i+4),[a,b,c,d]=window.map(s=>s.frame),images=window.every(s=>s.frame.imageSha256!==null);
  if(!images||a.imageSha256===b.imageSha256||a.imageSha256!==c.imageSha256||b.imageSha256!==d.imageSha256||a.route===null||b.route===null||a.route===b.route||a.route!==c.route||b.route!==d.route)continue;
  if(!window.every((s,j)=>s.step===window[0].step+j)||!window.slice(0,3).every(s=>s.actualUI&&['click','back'].includes(s.action!.type)))continue;
  patterns.push({kind:'A-B-A-B',evidence:window.every(s=>s.frame.delivery==='verified')?'verified-delivered-inputs':'recorded-inputs-delivery-unverified',steps:clone(window)});
 }
 const retries=steps.flatMap((current,i)=>{
  if(!current.actualUI||current.action?.type!=='click'||!current.frame.imageSha256||current.reviewerControlText===null)return [];
  const prior=steps.slice(0,i).reverse().find(s=>s.actualUI&&s.action?.type==='click'&&s.frame.imageSha256===current.frame.imageSha256&&s.candidateId===current.candidateId&&s.reviewerControlText===current.reviewerControlText);
  if(!prior)return [];
  const between=steps.filter(s=>s.step>prior.step&&s.step<current.step),distinct=unique(between.flatMap(s=>s.frame.imageSha256&&s.frame.imageSha256!==current.frame.imageSha256?[s.frame.imageSha256]:[]));
  const observed=between.length===current.step-prior.step-1&&between.every((s,j)=>s.step===prior.step+j+1&&s.frame.imageSha256!==null),interveningDistinctFrameCount=observed?distinct.length:null;
  return [{kind:'same-frame-control-retry' as const,step:current.step,priorStep:prior.step,identity:{imageSha256:current.frame.imageSha256,candidateId:current.candidateId,reviewerControlText:current.reviewerControlText},evidence:current.frame.delivery==='verified'&&prior.frame.delivery==='verified'?'verified-delivered-inputs':'recorded-inputs-delivery-unverified',interveningDistinctFrames:distinct,interveningDistinctFrameCount,interveningRouteVisits:between.filter(s=>s.frame.route!==null).map(s=>({step:s.step,route:s.frame.route})),interveningObservationComplete:observed,immediateSameFrame:interveningDistinctFrameCount===0,priorObservedResult:clone(prior.nextObservedFrame),prior:clone(prior),current:clone(current)}];
 });
 const counts={runs:1,withResult:result?1:0,steps:steps.length,recordedInputs:steps.filter(s=>s.frame.imageSha256!==null).length,verifiedDeliveredInputs:steps.filter(s=>s.frame.delivery==='verified').length,deliveryUnverifiedInputs:steps.filter(s=>s.frame.delivery==='unverified').length,unobservedFrames:steps.filter(s=>s.frame.delivery==='unobserved').length,observedUIActions:steps.filter(s=>s.actualUI).length,selectionRecords:steps.filter(s=>s.selected!==null).length,baselineMeasured:steps.filter(s=>s.baselineSelected!==null).length,applicationMeasured:steps.filter(s=>s.applicationMeasured).length,deferralChanges:steps.filter(s=>s.changedByDeferral===true).length,deferralAttributionUnmeasured:steps.filter(s=>s.selected!==null&&s.changedByDeferral===null).length,modelChoiceDifferences:steps.filter(s=>s.modelChoice!==null&&s.selected!==null&&s.modelChoice!==s.selected).length,baselineDifferences:steps.filter(s=>s.baselineSelected!==null&&s.selected!==null&&s.baselineSelected!==s.selected).length,mandatoryAdjustmentSteps:steps.filter(s=>s.mandatoryAdjustments.length>0).length,verifiedABAB:patterns.filter(p=>p.evidence==='verified-delivered-inputs').length,recordedABAB:patterns.filter(p=>p.evidence!=='verified-delivered-inputs').length,sameFrameControlRetries:retries.length,immediateSameFrameRetries:retries.filter(r=>r.immediateSameFrame).length,integrityErrors:errors.length};
 return {id:record.id,runId:record.runId,actor:record.actor,status:record.status,context:{goalOutcome:result?.objectiveSuccess??null,objectiveAssessment:clone(result?.objectiveAssessment??null),perceivedDone:result?.perceivedDone??null,termination:result?.termination??null,error:clone(record.error??null)},counts,steps,patterns,retries,integrityErrors:errors};
}
/** Describes recorded motion; goal results and memory references are context, never naturalness scores or causal verdicts. */
export function analyzeMotionRuns(records:(RecoveryRunRecord&{actor:string})[]){
 const runs=records.map(summarize);
 type Counts=ReturnType<typeof summarize>['counts'];
 const total=(items:typeof runs):Counts=>{
  const empty:Counts={runs:0,withResult:0,steps:0,recordedInputs:0,verifiedDeliveredInputs:0,deliveryUnverifiedInputs:0,unobservedFrames:0,observedUIActions:0,selectionRecords:0,baselineMeasured:0,applicationMeasured:0,deferralChanges:0,deferralAttributionUnmeasured:0,modelChoiceDifferences:0,baselineDifferences:0,mandatoryAdjustmentSteps:0,verifiedABAB:0,recordedABAB:0,sameFrameControlRetries:0,immediateSameFrameRetries:0,integrityErrors:0};
  for(const run of items)for(const key of Object.keys(empty) as (keyof Counts)[])empty[key]+=run.counts[key];return empty;
 };
 const errors=runs.flatMap(run=>run.integrityErrors.map(e=>({id:run.id,runId:run.runId,actor:run.actor,...e})));
 return {kind:'descriptive-motion-comparison' as const,overall:total(runs),actors:Object.fromEntries(unique(runs.map(r=>r.actor)).map(actor=>[actor,total(runs.filter(r=>r.actor===actor))])),runs,integrity:{ok:errors.length===0,errors},interpretation:{patterns:'Overlapping observed windows; no naturalness ranking or whole-trajectory causal attribution.',controls:'Image hash, local candidate ID and audit control text identify reviewer-only same-frame matches.',delivery:'Only matching successful stored frameChecks verify delivery; recorded asset patterns remain unverified otherwise.',memory:'Stored channel names and source references support inspection, not conclusions about cognition.',terminal:'Terminal audit is context and is never appended as a delivered frame.'}};
}