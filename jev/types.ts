export const SCROLL_VIEWPORT_FRACTION=0.7;
export type Action = {type:'click';elementId:string}|{type:'back'}|{type:'scroll';direction:'up'|'down'}|{type:'done'}|{type:'stuck'};
export type Element = {id:string;type:'button'|'link';text:string;description?:string;fontSizePx?:number;context?:RegionContext;available?:boolean;unavailableReason?:string};
export type RegionContext = {landmark:'main'|'navigation'|'header'|'footer'|'other';section:string;headings:string[]};
export type TextRegion = {id:string;source:'dom';text:string;bbox:{x0:number;y0:number;x1:number;y1:number};fragments?:{x0:number;y0:number;x1:number;y1:number}[];fontSizePx?:number;context?:RegionContext};
export type Observation = {title:string;text:string[];regions?:TextRegion[];warnings?:string[];elements:Element[];canScrollUp:boolean;canScrollDown:boolean;pageId?:string;viewport?:{top:number;bottom:number;height:number}};
export type ObservedAlternative={pageTitle:string;pageId?:string;controls:{label:string;kind:Action['type'];context?:RegionContext}[]};
export type State = {exploration?:import('./persona.js').ExplorationInput;goal:string;currentDate:string;screen:Observation;observedAlternatives?:ObservedAlternative[];history:{screen:string;action:string;result:string;observedText?:string[];observedWarnings?:string[];observationOmitted?:boolean;observedRegions?:TextRegion[];pageId?:string;viewport?:Observation['viewport'];remainingGoalChecks?:string[];recoveryTarget?:string}[]};
export type Candidate = {action:Action;label:string};
export type Decision = {decisionReason?:import('./persona.js').DecisionReason;action:Action;choice:string;probabilities:Record<string,number>;confidence?:number;model:string;request?:import('./client.js').RequestTrace;usage?:import('./client.js').ChoiceAnswers['usage'];costUSD?:number;goalAssessment?:import('./goal-status.js').GoalAssessment;navigationFocus?:{priorityGoalChecks:string[];verificationPendingGoalChecks:string[]};frontier?:import('./frontier-types.js').FrontierDecision;navigationTransit?:{eligibleTargetIds:string[];selectionSource:'current-action'};completionCheck?:{initialDecision:Decision;assessment:string;response:import('./client.js').ChoiceAnswers;trigger?:'primary-done'|'image-evidence';evidenceGuard?:{supported:boolean;unresolved:string[]}};recovery?:{initialDecision:Decision;selectedAlternative?:string;requests:Pick<import('./client.js').ChoiceAnswers,'model'|'request'|'usage'|'costUSD'>[]}};
export type Decider = (state:State, candidates:Record<string,Candidate>,options?:{frontier?:import('./frontier-types.js').FrontierOffer;completionEvidence?:()=>{supported:boolean;unresolved:string[]}})=>Promise<Decision>;
export function candidatesFor(screen:Observation, canBack:boolean):Record<string,Candidate> {
  const entries: [string,Candidate][] = screen.elements.filter(e=>e.available!==false).map(e=>[e.id,{action:{type:'click',elementId:e.id},label:e.text.trim()?`「${e.text}」をクリック`:`${e.description||'文字未取得の操作'}をクリック`}]);
  if(canBack) entries.push(['back',{action:{type:'back'},label:'ブラウザーで前の画面に戻る'}]);
  if(screen.canScrollDown) entries.push(['scroll_down',{action:{type:'scroll',direction:'down'},label:'下にスクロール'}]);
  if(screen.canScrollUp) entries.push(['scroll_up',{action:{type:'scroll',direction:'up'},label:'上にスクロール'}]);
  entries.push(['done',{action:{type:'done'},label:'目的を達成したと判断して終了する'}],['stuck',{action:{type:'stuck'},label:'次の操作が分からないため終了する'}]);
  return Object.fromEntries(entries);
}
