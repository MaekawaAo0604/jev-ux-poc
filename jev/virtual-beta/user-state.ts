import type {Persona} from '../persona.js';
import type {BetaAction,Point,StateConfig,UserMemory,UserObservation,UserState} from './contracts.js';

const copyPoint=(point:Point):Point=>({x:point.x,y:point.y});
const copyAction=(action:BetaAction):BetaAction=>{
 switch(action.type){
  case 'look':return {type:'look',point:copyPoint(action.point)};
  case 'click':return {type:'click',elementId:action.elementId};
  case 'scroll':return {type:'scroll',direction:action.direction};
  default:return {type:action.type};
 }
};
const copyObservation=(observation:UserObservation):UserObservation=>({id:observation.id,imageSha256:observation.imageSha256,visibleText:[...observation.visibleText],fixation:copyPoint(observation.fixation),candidateIds:[...observation.candidateIds]});
const copyMemory=(memory:UserMemory):UserMemory=>({observationId:memory.observationId,imageSha256:memory.imageSha256,visibleText:[...memory.visibleText],...(memory.action?{action:copyAction(memory.action)}:{}),...(memory.outcome?{outcome:memory.outcome}:{})});

/** Expectations are fixed persona statements, not inferred beliefs or emotion scores. */
export function createUserState(persona:Persona|undefined,fixation:Point):UserState {
 return {schemaVersion:1,revision:0,fixation:copyPoint(fixation),memory:[],expectations:[...(persona?.expectations??[])]};
}

/** Only the caller's user-visible observation enters memory; never spread audit objects. */
export function updateUserState(state:UserState,observation:UserObservation,config:StateConfig,event?:{action:BetaAction;outcome:'performed'|'failed'|'unchanged'}):UserState {
 if(typeof config.enabled!=='boolean'||!Number.isSafeInteger(config.memoryCapacity)||config.memoryCapacity<0)throw new Error('Invalid user memory configuration');
 const base={schemaVersion:1 as const,revision:state.revision+1,fixation:copyPoint(observation.fixation)};
 if(!config.enabled)return {...base,memory:[],expectations:[]};
 const current:UserMemory={observationId:observation.id,imageSha256:observation.imageSha256,visibleText:[...observation.visibleText],...(event?{action:copyAction(event.action),outcome:event.outcome}:{})};
 const previous=config.memoryCapacity>1?state.memory.slice(1-config.memoryCapacity).map(copyMemory):[];
 const memory=config.memoryCapacity===0?[]:[...previous,current];
 return {...base,memory,lastObservation:copyObservation(observation),expectations:[...state.expectations]};
}

