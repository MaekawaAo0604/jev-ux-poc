import type {ExperienceSource} from './experience-contracts.js';
export type GoalSearchConfig={enabled:boolean;capacity:number};
export type GoalSearchEntry={kind:'model-goal-search-not-fact';source:ExperienceSource;goalSha256:string;scope:'delivered-current-view-only';requirements:{id:string;text:string;assessment:'observed'|'not_shown'|'context'|'contradicted'|'uncertain'}[];finding:{kind:'target'|'prerequisite'|'guidance'|'no-target-in-view'|'uncertain';candidateId?:string}};
export type GoalSearchMemory={schemaVersion:1;entries:GoalSearchEntry[]};
