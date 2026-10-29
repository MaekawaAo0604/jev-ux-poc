import type {ConditionContinuityContext} from './condition-continuity.js';
import type {Persona} from '../persona.js';
import type {ExperienceMemory,ExperienceSource} from './experience-contracts.js';
export type VisualCandidate={id:string;type:'click'|'scroll'|'back'};
export type VisualSource=ExperienceSource&{image:string};
export type VisualHypothesisRequest={goal:string;currentDate:string;persona?:Persona;current:ExperienceSource;sources:VisualSource[];candidates:VisualCandidate[];experience?:ExperienceMemory;memory?:VisualHypothesisMemory;conditionContinuity?:ConditionContinuityContext;images:Record<string,{mediaType:'image/png';data:string}>;timeoutMs:number};
export type VisualEvidence=ExperienceSource&{quote:string;quoteStatus:'model-transcribed-unverified'};
export type VisualHypothesisRecord={schemaVersion:1;kind:'model-visual-hypotheses-not-fact';source:ExperienceSource;goalSha256:string;conditions:{id:string;description:string;status:'unmet'|'satisfied'|'uncertain';evidence:VisualEvidence|null;uncertainty:string}[];relations:{candidateId:string;conditionIds:string[];relation:'execute'|'prerequisite'|'information'|'navigation'|'unrelated'|'unknown';currentEvidence:VisualEvidence|null;expectedResult:string|null}[];unknowns:string[]};
export type VisualHypothesisMemory={schemaVersion:1;records:VisualHypothesisRecord[]};
export type VisualHypothesisResponse={model:string;status:'completed'|'refused'|'incomplete'|'invalid-json'|'invalid-response';output:unknown;rawText:string;usage?:{inputTokens:number;outputTokens:number;totalTokens:number};request:{attempts:1;httpReceived:true;statusCode:200};costUSD:null};
export type VisualHypothesisExtractor=(request:VisualHypothesisRequest)=>Promise<VisualHypothesisResponse>;
export class VisualHypothesisTransportError extends Error{constructor(readonly evidence:{code:'MISSING_CREDENTIALS'|'HTTP_ERROR'|'TIMEOUT'|'REQUEST_FAILED';attempts:0|1;httpReceived:boolean;statusCode?:number}){super('VISUAL_HYPOTHESIS_TRANSPORT_ERROR');}}
