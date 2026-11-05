import type {Action,Decision,Observation} from '../jev/types.js';

type Step={number:number;result?:string;state?:{screen?:Pick<Observation,'elements'>};decision?:Decision;loopAvoidance?:{excludedChoices:string[]}};
type Choice={choice:string;action:Action};
export type StopAssessment={
 schemaVersion:1;rawReason:string;attribution:'undetermined'|'not-assessed';
 terminalDecision:{
  step?:number;stage:'action-selection'|'completion-reselection'|'route-reselection'|'recorded-route'|'unknown';
  final?:Choice;beforeReselection?:Choice;routeRequestCount?:number;
  completionReview?:{assessment:string;trigger?:string};excludedChoices:string[];
 };
 restrictedControls:{step:number;id:string;text:string;reason:'SAFETY_BOUNDARY'|'UNSUPPORTED_CONTENT'}[];
 uxCaveats:('ROUTE_RESELECTION_STOP'|'RESTRICTED_CONTROLS_OBSERVED'|'TERMINAL_DECISION_MISSING')[];
};
type Run={reason:string;steps?:Step[];stopAssessment?:StopAssessment};
function choice(d:Decision|undefined):Choice|undefined{
 const action=d?.action;
 if(!d||typeof d.choice!=='string'||!d.choice||!action||!['click','back','scroll','done','stuck'].includes(action.type))return;
 if((action.type==='done'||action.type==='stuck')&&d.choice!==action.type)return;
 if(action.type==='scroll'&&!['up','down'].includes(action.direction))return;
 if(action.type==='click'&&typeof action.elementId!=='string')return;
 return {choice:d.choice,action:{...action}};
}

// A post-run diagnostic, never a model input or a change to the raw ending.
// A blocked control proves a restriction was observed, NOT that it held the
// answer, was relevant to the Goal, or caused the model to stop.
export function assessStop(run:Run):StopAssessment{
 if(!Array.isArray(run.steps)&&run.stopAssessment?.schemaVersion===1&&run.stopAssessment.rawReason===run.reason)return run.stopAssessment;
 const steps=run.steps??[],last=steps.at(-1);
 const terminal=last?.result===run.reason?last:undefined,decision=terminal?.decision;
 const final=choice(decision),before=choice(decision?.recovery?.initialDecision);
 const recoveryComplete=!!before&&Array.isArray(decision?.recovery?.requests);
 const completionComplete=!decision?.completionCheck||!!choice(decision.completionCheck.initialDecision)&&typeof decision.completionCheck.assessment==='string';
 const stage=!final||run.reason==='STUCK'&&final.action.type!=='stuck'||decision?.recovery&&!recoveryComplete||!completionComplete?'unknown':
  decision?.recovery?'route-reselection':decision?.model==='recorded-route'?'recorded-route':
  choice(decision?.completionCheck?.initialDecision)?.action.type==='done'&&final.action.type!=='done'?'completion-reselection':'action-selection';
 const restrictedControls:StopAssessment['restrictedControls']=[];
 for(const step of steps)for(const e of step.state?.screen?.elements??[]){
  if(e.available===false&&(e.unavailableReason==='SAFETY_BOUNDARY'||e.unavailableReason==='UNSUPPORTED_CONTENT'))
   restrictedControls.push({step:step.number,id:e.id,text:e.text,reason:e.unavailableReason});
 }
 const uxCaveats:StopAssessment['uxCaveats']=[];
 if(run.reason==='STUCK'){
  if(stage==='route-reselection')uxCaveats.push('ROUTE_RESELECTION_STOP');
  if(restrictedControls.length)uxCaveats.push('RESTRICTED_CONTROLS_OBSERVED');
  if(stage==='unknown')uxCaveats.push('TERMINAL_DECISION_MISSING');
 }
 return {schemaVersion:1,rawReason:run.reason,attribution:run.reason==='STUCK'?'undetermined':'not-assessed',
  terminalDecision:{...(terminal?{step:terminal.number}:{}),stage,...(final?{final}:{}),
   ...(before?{beforeReselection:before}:{}),...(Array.isArray(decision?.recovery?.requests)?{routeRequestCount:decision.recovery.requests.length}:{}),
   ...(decision?.completionCheck?{completionReview:{assessment:decision.completionCheck.assessment,trigger:decision.completionCheck.trigger}}:{}),
   excludedChoices:[...(terminal?.loopAvoidance?.excludedChoices??[])]},restrictedControls,uxCaveats};
}
