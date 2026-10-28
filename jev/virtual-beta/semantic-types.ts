import type {BetaUIId} from './ui-types.js';
/** Audit-only experimental assignment. Never pass this object to model input. */
export type SemanticFixture={version:1;ui:BetaUIId;mapping:'A'|'B'};
export type SemanticTrial={id:string;slot?:number;pairId:string;replicate:number;fixture:SemanticFixture};
export type SemanticRunAudit={trial:SemanticTrial;definitionHash:string;initialProductImage:{file:string;sha256:string}};
export type SemanticHumanExpectation={fixture:SemanticFixture;definitionHash:string;sourceHash:string;initialProductImageSha256:string};
