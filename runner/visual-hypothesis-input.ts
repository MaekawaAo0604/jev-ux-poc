import {emptyConditionContinuity} from '../jev/virtual-beta/condition-continuity.js';
import type {ConditionRetentionPolicy} from '../jev/virtual-beta/condition-continuity.js';
import {validateVisualHypothesisRequest} from '../jev/virtual-beta/visual-hypotheses.js';
import type {BetaCandidates,UserState} from '../jev/virtual-beta/contracts.js';
import type {Persona} from '../jev/persona.js';
import {parsePersona} from '../jev/persona.js';
import type {ExperienceSource} from '../jev/virtual-beta/experience-contracts.js';
import type {VisualHypothesisRequest} from '../jev/virtual-beta/visual-hypotheses-contracts.js';
/** Explicit allowlist: no candidate labels, DOM, geometry, audit, fixture or oracle. */
export function visualHypothesisInput(args:{goal:string;currentDate:string;persona?:Persona;current:ExperienceSource;sources:ExperienceSource[];candidates:BetaCandidates;user:UserState;images:VisualHypothesisRequest['images'];assets:Record<string,{sha256:string}>;timeoutMs:number;continuityCapacity?:number;continuityRetentionPolicy?:ConditionRetentionPolicy}):VisualHypothesisRequest{
 const sources=args.sources.map(source=>{const image=Object.keys(args.assets).find(key=>args.assets[key].sha256===source.imageSha256);if(!image)throw Error('VISUAL_SOURCE_NOT_ATTACHED');return {observationId:source.observationId,imageSha256:source.imageSha256,image};});
 return validateVisualHypothesisRequest({goal:args.goal,currentDate:args.currentDate,...(args.persona?{persona:parsePersona(args.persona)}:{}),current:{observationId:args.current.observationId,imageSha256:args.current.imageSha256},sources,candidates:Object.entries(args.candidates).flatMap(([id,candidate])=>['click','scroll','back'].includes(candidate.action.type)?[{id,type:candidate.action.type as 'click'|'scroll'|'back'}]:[]),...(args.user.experience?{experience:args.user.experience}:{}),...(args.user.visualHypotheses?{memory:args.user.visualHypotheses}:{}),...(args.continuityCapacity!==undefined?{conditionContinuity:{schemaVersion:1,capacity:args.continuityCapacity,...(args.continuityRetentionPolicy!==undefined?{retentionPolicy:args.continuityRetentionPolicy}:{}),memory:args.user.conditionContinuity??emptyConditionContinuity(args.goal)}}:{}),images:structuredClone(args.images),timeoutMs:args.timeoutMs});
}
