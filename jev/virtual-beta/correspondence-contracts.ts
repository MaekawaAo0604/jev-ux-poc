import type {ExperienceSource} from './experience-contracts.js';
export type CorrespondenceConfig={enabled:boolean;capacity:number;maxCurrentCandidates:number;maxPastCandidates:number;maxUniqueImages:number};
/** Internal bounded memory, built only from already delivered pixels and visible anonymous controls. */
export type CorrespondenceFrame={source:ExperienceSource;bytes:Buffer;file:string;clickCandidateIds:string[]};
export type CorrespondenceContext={kind:'visual-correspondence-hypothesis-not-fact';current:ExperienceSource;prior:ExperienceSource;currentCandidateIds:string[];priorCandidateIds:string[]};
export type CorrespondencePreparation={reason:'PROPOSED'|'DISABLED'|'NO_HISTORY'|'NO_CLICKS'|'EXACT_ALREADY_HANDLED'|'IMAGE_CAPACITY'|'NO_COMPATIBLE_IMAGE';context?:CorrespondenceContext;ranking:{source:ExperienceSource;distance:number;hasCitedJudgment:boolean;alreadyAttached:boolean}[]};
export type CorrespondenceRecord={kind:'model-correspondence-hypotheses-not-fact';current:ExperienceSource;prior:ExperienceSource;rawChoices:Record<string,{choice:string;probabilities:Record<string,number>}>;links:{candidateId:string;priorCandidateId:string;status:'unchanged'|'changed'}[];adjustments:string[]};
export type CorrespondenceArchiveEntry={source:ExperienceSource;file:string;clickCandidateIds:string[]};
