import type {BetaAction} from './contracts.js';
export type ExperienceConfig={enabled:boolean;capacity:number;evidenceMode?:'basis'};
export type ExperienceSource={observationId:string;imageSha256:string};
export type ExperienceIntent={source:ExperienceSource;candidateId:string;action:BetaAction;prediction:'advances'|'neutral'|'conflicts'|'unknown'};
export type ExperienceTransition={intent:ExperienceIntent;result:ExperienceSource;execution:'performed'|'unchanged';judgment?:{kind:'model-assessment-not-fact';progress:'advances'|'neutral'|'conflicts'|'unknown';expectation:'supported'|'not_supported'|'unknown';evidence?:ExperienceSource;adjustments:string[]}};
export type ExperienceMemory={schemaVersion:1;transitions:ExperienceTransition[]};
