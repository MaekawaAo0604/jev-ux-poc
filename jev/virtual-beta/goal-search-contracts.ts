import type {ExperienceSource} from './experience-contracts.js';
export type GoalSearchConfig={enabled:boolean;capacity:number;interpretation?:'role-state-v2'};
export type GoalSearchEntry={kind:'model-goal-search-not-fact';source:ExperienceSource;goalSha256:string;scope:'delivered-current-view-only';interpretation?:'role-state-v2';requirements:{id:string;text:string;role?:'required'|'context'|'uncertain';assessment:'observed'|'not_shown'|'context'|'contradicted'|'uncertain'}[];finding:{kind:'target'|'navigation'|'prerequisite'|'guidance'|'no-target-in-view'|'uncertain';candidateId?:string}};
export type GoalSearchMemory={schemaVersion:1;entries:GoalSearchEntry[]};
