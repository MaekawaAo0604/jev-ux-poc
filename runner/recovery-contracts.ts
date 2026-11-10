import type {RecoveryFixture} from '../app/recovery-fixture.js';
import type {BetaResult} from './virtual-beta-core.js';
import type {TransferFrameCheck} from './transfer-analysis.js';
/** Private observable fixture truth. Never copied into model input or candidate labels. */
export type RecoveryAuditSnapshot={schemaVersion:1;route:'primary'|'home'|'account'|'records'|'alternative';eligible:boolean;verificationAttempts:number;recordChecks:number;savedValue:string;complete:boolean};
export type RecoverySlot={id:string;fixture:RecoveryFixture;replicate:number};
export type RecoveryRunRecord=RecoverySlot&{runId:string;status:'ATTEMPTING'|'RESULT'|'FAILED';dir:string;ledger:string|null;resultPath:string;requests:number;initialImageSha256:string|null;result?:BetaResult;error?:{code:string;statusCode?:number};frameChecks?:TransferFrameCheck[];replay?:{status:'OK'|'ERROR';code?:string};ledgerEvidence?:{used:number;sha256:string;reserved:number;ok:number;errors:number}};
