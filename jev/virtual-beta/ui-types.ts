import type {Rect} from './contracts.js';
export type BetaUIId='reference'|'position-only'|'wording-only';
export type BetaUIVariant={id:BetaUIId;token:'r'|'p'|'w';entryLabel:string;entryTranslateYPx:number};
export type BetaUIIdentity=BetaUIVariant&{definitionHash:string};
/** Audit-only ROI. Never enter model state/questions or candidate generation. */
export type AuditROI={id:string;rect:Rect;definition:'element-client-rect'};
