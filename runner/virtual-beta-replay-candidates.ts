import {candidatesFor,type Observation} from '../jev/types.js';
import type {BetaCandidates,BetaAction} from '../jev/virtual-beta/contracts.js';
/** Audit/replay only: derive offered action types, never leak DOM meaning to user input. */
export function reconstructReplayCandidates(screen:Observation,ids:string[]):BetaCandidates{
 if(!screen||!Array.isArray(ids)||ids.length===0||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!id))throw Error('INVALID_REPLAY_CANDIDATES');
 const original=candidatesFor(screen,ids.includes('back'));
 const extras:Record<string,BetaAction>={reread:{type:'reread'},wait:{type:'wait'},abandon:{type:'abandon'}};
 for(const [i,point] of [{x:320,y:225},{x:960,y:225},{x:320,y:675},{x:960,y:675}].entries())extras['look_'+i]={type:'look',point};
 return Object.fromEntries(ids.map(id=>{const action=Object.hasOwn(original,id)?original[id].action:Object.hasOwn(extras,id)?extras[id]:undefined;if(!action)throw Error('UNOBSERVED_REPLAY_CANDIDATE');return [id,{action:structuredClone(action),label:id}];}));
}
