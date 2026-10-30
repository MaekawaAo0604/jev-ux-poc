import type {VisualEvidence,VisualHypothesisRequest,VisualHypothesisRecord} from './visual-hypotheses-contracts.js';
import type {ConditionContinuityRecord} from './condition-continuity.js';
import type {VisualPriorRelationsRecord} from './visual-prior-relations.js';
import type {ExperienceSource} from './experience-contracts.js';
export type WorkingInquiryIntent='change_condition'|'test_condition'|'find_route'|'unknown';
export type WorkingInquiryCheck='condition_changed'|'condition_status_known'|'new_route_visible'|'unknown';
export type WorkingInquiryContext={
 schemaVersion:1;kind:'bounded-working-inquiry-context';source:ExperienceSource;goalSha256:string;
 conditions:Record<string,{scope:'current-hypothesis'|'recalled';conditionId:string;description:string;status:'unmet'|'uncertain';evidence:VisualEvidence|null;evidenceScope:'current'|'historical'|'none'}>;
 candidates:{candidateId:string;conditionKeys:string[];currentControlEvidence:VisualEvidence|null;expectedObservation:string|null}[];
};
export type WorkingInquiryChoices={conditionKey:string;intent:WorkingInquiryIntent;check:WorkingInquiryCheck};
export type WorkingInquiryRecord={
 schemaVersion:1;kind:'model-working-inquiry-not-fact';source:ExperienceSource;goalSha256:string;contextSha256:string;
 rawChoices:WorkingInquiryChoices;choices:WorkingInquiryChoices;
 adjustments:{field:'intent'|'check';from:string;to:'unknown';reason:'NO_SELECTED_CONDITION'|'INTENT_CHECK_MISMATCH'}[];
};
export type WorkingInquiryBuild={request:VisualHypothesisRequest;record:VisualHypothesisRecord;continuity:ConditionContinuityRecord;prior:VisualPriorRelationsRecord};
