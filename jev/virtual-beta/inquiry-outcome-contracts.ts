import type {ExperienceSource} from './experience-contracts.js';
import type {WorkingInquiryContext,WorkingInquiryRecord,WorkingInquiryIntent,WorkingInquiryCheck} from './working-inquiry-contracts.js';
export type InquiryOutcomeResult='condition_satisfied'|'condition_unmet'|'condition_uncertain'|'route_found'|'route_not_found'|'unknown';
export type InquiryOutcomeBasis='current_image'|'none';
export type PendingInquiryOperation={
 schemaVersion:1;kind:'pending-inquiry-operation';source:ExperienceSource;goalSha256:string;
 condition:({key:string}&WorkingInquiryContext['conditions'][string])|null;
 intent:WorkingInquiryIntent;check:WorkingInquiryCheck;
 action:{candidateId:string;type:string;execution:'performed'|'unchanged'};
 expectedObservation:string|null;explicitLink:boolean;
};
export type InquiryOutcomeChoices={result:InquiryOutcomeResult;basis:InquiryOutcomeBasis};
export type InquiryOutcomeRecord={
 schemaVersion:1;kind:'model-inquiry-outcome-not-fact';source:ExperienceSource;goalSha256:string;contextSha256:string;
 pending:PendingInquiryOperation;rawChoices:InquiryOutcomeChoices;choices:InquiryOutcomeChoices;adjustments:string[];
};
export type InquiryOutcomeMemory={schemaVersion:1;entries:InquiryOutcomeRecord[]};
export type InquiryOutcomeContext={
 schemaVersion:1;kind:'bounded-inquiry-outcome-context';source:ExperienceSource;goalSha256:string;
 pending:PendingInquiryOperation|null;memory:InquiryOutcomeMemory;
};
export type BeginInquiryOperation={
 context:WorkingInquiryContext;record:WorkingInquiryRecord;candidateId:string;actionType:string;execution:'performed'|'unchanged';
};
