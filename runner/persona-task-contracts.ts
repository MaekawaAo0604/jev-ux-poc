import type {Persona} from '../jev/persona.js';
import type {PersonaBetaActor} from './persona-beta-contracts.js';
import type {PersonaTaskFixture} from '../app/persona-task-types.js';
import type {BetaResult} from './virtual-beta-core.js';
import type {TransferFrameCheck} from './transfer-analysis.js';
export type PersonaTaskRecord={id:string;runId:string;actor:PersonaBetaActor;replicate:number;sequence:number;fixture:PersonaTaskFixture;persona:Persona|null;personaSha256:string|null;status:'ATTEMPTING'|'RESULT'|'FAILED';dir:string;ledger:string|null;resultPath:string;requests:number;initialImageSha256:string|null;result?:BetaResult;error?:{code:string;statusCode?:number};frameChecks?:TransferFrameCheck[];replay?:{status:'OK'|'ERROR';code?:string};personaDelivery?:{native:number;assessment:number;action:number;errors:{step:number;stage:string;code:string}[]};ledgerEvidence?:{used:number;sha256:string;reserved:number;ok:number;errors:number};accountingCause?:{code:string;statusCode?:number}};
