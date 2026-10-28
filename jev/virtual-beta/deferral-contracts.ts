import type {ExperienceSource} from './experience-contracts.js';
export type DeferralConfig={enabled:boolean;capacity:number;weight:number;minAlternativeProbability:number;selectionScope?:'global'|'ui-conditional'};
export type DeferralEntry={imageSha256:string;candidateId:string;fromObservationId:string;toObservationId:string;evidence:ExperienceSource[]};
export type DeferralMemory={schemaVersion:1;entries:DeferralEntry[]};
export type DeferralDecision={kind:'temporary-deferral';weights:Record<string,number>;plausibleCandidates:string[];deferredCandidates:string[];appliedCandidates:string[];reason:'DEFER_WITH_ALTERNATIVES'|'ALTERNATIVES_EXHAUSTED'|'NO_PLAUSIBLE_ALTERNATIVE'|'NO_DEFERRED_CANDIDATE'};
