export type DeliberationConfig={enabled:boolean;memoryCapacity:number};
export type AdmittedObservationSource={observationId:string;imageSha256:string};
export type DeliberationAssessment={
 schemaVersion:1;kind:'model-assessment-not-fact';observationId:string;imageSha256:string;
 knowledge:'sufficient'|'insufficient'|'conflicting';goal:'satisfied'|'unsatisfied'|'uncertain';
 goalEvidence?:AdmittedObservationSource;
 effects:Record<string,{prediction:'advances'|'neutral'|'conflicts'|'unknown';evidence?:AdmittedObservationSource}>;
 adjustments:{field:string;from:string;to:string;reason:'NO_ADMITTED_EVIDENCE'}[];
};
export type DeliberationMemory={schemaVersion:1;assessments:DeliberationAssessment[]};
