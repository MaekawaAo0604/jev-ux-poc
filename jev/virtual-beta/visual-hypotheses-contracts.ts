import type {VisualHTTPDispatch} from './visual-http-timing.js';
import type {ConditionContinuityContext} from './condition-continuity.js';
import type {Persona} from '../persona.js';
import type {ExperienceMemory,ExperienceSource} from './experience-contracts.js';
export type VisualCandidate={id:string;type:'click'|'scroll'|'back'};
export type VisualSource=ExperienceSource&{image:string};
export type VisualHypothesisRequest={goal:string;currentDate:string;persona?:Persona;current:ExperienceSource;sources:VisualSource[];candidates:VisualCandidate[];experience?:ExperienceMemory;memory?:VisualHypothesisMemory;conditionContinuity?:ConditionContinuityContext;priorConditionLinks?:boolean;timeoutCapMs?:30000|60000;images:Record<string,{mediaType:'image/png';data:string}>;timeoutMs:number};
export type VisualEvidence=ExperienceSource&{quote:string;quoteStatus:'model-transcribed-unverified'};
export type VisualHypothesisRecord={schemaVersion:1;kind:'model-visual-hypotheses-not-fact';source:ExperienceSource;goalSha256:string;conditions:{id:string;description:string;status:'unmet'|'satisfied'|'uncertain';evidence:VisualEvidence|null;uncertainty:string}[];relations:{candidateId:string;conditionIds:string[];relation:'execute'|'prerequisite'|'information'|'navigation'|'unrelated'|'unknown';currentEvidence:VisualEvidence|null;expectedResult:string|null}[];unknowns:string[]};
export type VisualHypothesisMemory={schemaVersion:1;records:VisualHypothesisRecord[]};
export type VisualHypothesisResponse={model:string;status:'completed'|'refused'|'incomplete'|'invalid-json'|'invalid-response';output:unknown;rawText:string;usage?:{inputTokens:number;outputTokens:number;totalTokens:number};request:{attempts:1;httpReceived:true;statusCode:200};costUSD:null};
export type VisualHypothesisAudit={onHTTPDispatch:(trace:VisualHTTPDispatch)=>void};
export type VisualHypothesisExtractor=(request:VisualHypothesisRequest,audit?:VisualHypothesisAudit)=>Promise<VisualHypothesisResponse>;
export type VisualProviderDiagnostic={schemaVersion:1;code:'invalid_json_schema'|'invalid_request_error'|'unknown';parameter:'text.format.schema'|'text.format'|'response_format'|'model'|'unknown';lookaroundMentioned:boolean};
export class VisualHypothesisTransportError extends Error{constructor(readonly evidence:{code:'MISSING_CREDENTIALS'|'HTTP_ERROR'|'TIMEOUT'|'REQUEST_FAILED';attempts:0|1;httpReceived:boolean;statusCode?:number;diagnostic?:VisualProviderDiagnostic}){super('VISUAL_HYPOTHESIS_TRANSPORT_ERROR');}}
