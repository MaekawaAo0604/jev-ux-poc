import type {Observation,State} from '../types.js';
import {publicExploration} from '../persona.js';
import type {BetaAction,BetaCandidates,BetaConfig,BetaInput,Point,Rect,UserMemory,UserObservation,UserState,VisionObservation,VisionTarget} from './contracts.js';
import {visionCandidates} from './vision.js';

const extraTypes=new Set(['look','reread','wait','abandon']);
const advanced=['deliberation','experience','deferral','deferralReason','goalSearch','visualHypotheses','actionRelations','correspondence'] as const;
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const onlyKeys=(value:Record<string,unknown>,keys:string[])=>Object.keys(value).every(key=>keys.includes(key));

/** Factors are an opt-in single-stage profile; existing configuration remains authoritative. */
export function validateFactorControls(config:BetaConfig):void {
 const factors=config.factors;
 if(factors===undefined)return;
 if(!object(factors)||!onlyKeys(factors,['informationChannel','extraActions'])||!['image-state','dom-state'].includes(factors.informationChannel)||
   !object(factors.extraActions)||!onlyKeys(factors.extraActions,['look','reread','wait','abandon'])||
   ['look','reread','wait','abandon'].some(key=>typeof (factors.extraActions as Record<string,unknown>)[key]!=='boolean'))throw new Error('INVALID_FACTOR_CONTROLS');
 if(config.state?.enabled!==true||advanced.some(key=>config[key]?.enabled===true))throw new Error('INVALID_FACTOR_PROFILE');
 if(factors.informationChannel==='dom-state'&&config.vision?.mode!=='full')throw new Error('INVALID_FACTOR_DOM_VISION');
}

export function factorUsesDOM(config:BetaConfig):boolean {
 return config.factors?config.factors.informationChannel==='dom-state':config.vision.mode==='full';
}
export function factorVisibleText(config:BetaConfig,screenText:string[]):string[] {
 return factorUsesDOM(config)?[...screenText]:[];
}
const pointCopy=(point:Point):Point=>({x:point.x,y:point.y});
const rectCopy=(rect:Rect):Rect=>({x:rect.x,y:rect.y,width:rect.width,height:rect.height});
const contained=(outer:Rect,inner:Rect)=>inner.x>=outer.x&&inner.y>=outer.y&&inner.width>0&&inner.height>0&&inner.x+inner.width<=outer.x+outer.width&&inner.y+inner.height<=outer.y+outer.height;
function fullyVisible(target:VisionTarget,vision:VisionObservation):boolean {
 return contained(vision.clearRect,target)&&(!target.badge||contained(vision.clearRect,target.badge));
}
function addExtras(result:BetaCandidates,vision:VisionObservation,extras:{look:boolean;reread:boolean;wait:boolean;abandon:boolean},legacy=false):void {
 if(extras.look){
  const points=legacy?[{x:320,y:225},{x:960,y:225},{x:320,y:675},{x:960,y:675}]:[
   {x:vision.sourceWidth/4,y:vision.sourceHeight/4},{x:vision.sourceWidth*3/4,y:vision.sourceHeight/4},
   {x:vision.sourceWidth/4,y:vision.sourceHeight*3/4},{x:vision.sourceWidth*3/4,y:vision.sourceHeight*3/4}];
  for(const [i,point] of points.entries())result['look_'+i]={action:{type:'look',point},label:'Look at viewport point '+JSON.stringify(point)};
 }
 if(extras.reread)result.reread={action:{type:'reread'},label:'Read the current visible area again'};
 if(extras.wait)result.wait={action:{type:'wait'},label:'Wait without operating the UI'};
 if(extras.abandon)result.abandon={action:{type:'abandon'},label:'Give up on this goal'};
}

/** The constrained copy controls labels/eligibility without changing the delivered image. */
export function factorCandidates(original:BetaCandidates,vision:VisionObservation,config:BetaConfig):BetaCandidates {
 if(!config.factors){
  const result={...original};
  addExtras(result,vision,{look:config.vision.mode!=='full'||config.state.enabled,reread:config.state.enabled,wait:config.state.enabled,abandon:config.state.enabled},true);
  return visionCandidates(result,vision);
 }
 const result=Object.fromEntries(Object.entries(original).filter(([,candidate])=>!extraTypes.has(candidate.action.type)));
 addExtras(result,vision,config.factors.extraActions);
 if(factorUsesDOM(config))return visionCandidates(result,vision);
 const constrained:VisionObservation={...vision,mode:vision.mode==='full'?'foveated':vision.mode,visibleTargets:vision.visibleTargets.filter(target=>fullyVisible(target,vision))};
 return visionCandidates(result,constrained);
}

function publicInput(input:BetaInput):BetaInput {
 const publicValue=publicExploration(input),c=publicValue.charter,p=publicValue.persona;
 return {...(p?{persona:{schemaVersion:p.schemaVersion,id:p.id,name:p.name,itLiteracy:p.itLiteracy,serviceExperience:p.serviceExperience,knowledge:[...p.knowledge],expectations:[...p.expectations],behavioralTendencies:[...p.behavioralTendencies],contextAndConstraints:[...p.contextAndConstraints]}}:{}),
  charter:{schemaVersion:c.schemaVersion,id:c.id,targetWebsite:c.targetWebsite,goal:c.goal,initialState:{description:c.initialState.description,currentDate:c.initialState.currentDate},scope:[...c.scope],prohibitedActions:{actionTypes:[...c.prohibitedActions.actionTypes],controlTexts:[...c.prohibitedActions.controlTexts],downloads:c.prohibitedActions.downloads},maxActions:c.maxActions}};
}
function copyAction(action:BetaAction):BetaAction {
 switch(action.type){
  case 'click':return {type:'click',elementId:action.elementId};
  case 'scroll':return {type:'scroll',direction:action.direction};
  case 'look':return {type:'look',point:pointCopy(action.point)};
  default:return {type:action.type};
 }
}
function currentObservation(observation:UserObservation,config:BetaConfig):UserObservation {
 return {id:observation.id,imageSha256:observation.imageSha256,visibleText:factorVisibleText(config,observation.visibleText),fixation:pointCopy(observation.fixation),candidateIds:[...observation.candidateIds]};
}
function userProjection(state:UserState,observation:UserObservation,config:BetaConfig):UserState {
 const memory:UserMemory[]=config.state.memoryCapacity===0?[]:state.memory.slice(-config.state.memoryCapacity).map(item=>({observationId:item.observationId,imageSha256:item.imageSha256,visibleText:factorVisibleText(config,item.visibleText),...(item.action?{action:copyAction(item.action)}:{}),...(item.outcome?{outcome:item.outcome}:{})}));
 return {schemaVersion:1,revision:state.revision,fixation:pointCopy(state.fixation),expectations:[...state.expectations],memory,lastObservation:currentObservation(observation,config)};
}
function screenProjection(screen:Observation){
 return {title:screen.title,text:[...screen.text],elements:screen.elements.map(e=>({id:e.id,type:e.type,text:e.text})),canScrollUp:screen.canScrollUp,canScrollDown:screen.canScrollDown};
}

/** Opt-in inputs admit current DOM only when requested, never the audit history. */
export function factorModelInput(input:BetaInput,vision:VisionObservation,observation:UserObservation,state:UserState,config:BetaConfig,screen:Observation,history:State['history']):Record<string,unknown> {
 if(!config.factors)return {goal:input.charter.goal,currentDate:input.charter.initialState.currentDate,exploration:publicExploration(input),observation:{id:observation.id,image:'current',width:vision.width,height:vision.height,viewport:{width:vision.sourceWidth,height:vision.sourceHeight},fixation:vision.fixation,clearRect:vision.clearRect,transform:vision.transform,candidateIds:observation.candidateIds,...(config.vision.mode==='full'?{screen:screenProjection(screen)}:{})},...(config.state.enabled?{userState:structuredClone(state)}:config.vision.mode==='full'?{history:structuredClone(history)}:{})};
 return {goal:input.charter.goal,currentDate:input.charter.initialState.currentDate,exploration:publicInput(input),
  observation:{id:observation.id,image:'current',width:vision.width,height:vision.height,viewport:{width:vision.sourceWidth,height:vision.sourceHeight},fixation:pointCopy(vision.fixation),clearRect:rectCopy(vision.clearRect),transform:{offsetX:vision.transform.offsetX,offsetY:vision.transform.offsetY,scaleX:vision.transform.scaleX,scaleY:vision.transform.scaleY},candidateIds:[...observation.candidateIds],...(factorUsesDOM(config)?{screen:screenProjection(screen)}:{})},
  userState:userProjection(state,observation,config)};
}
