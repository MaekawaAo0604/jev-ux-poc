import type {Persona} from '../jev/persona.js';
import type {RecoveryRunRecord} from './recovery-contracts.js';
export const personaBetaActors=['baseline','A','B','C'] as const;
export type PersonaBetaActor=typeof personaBetaActors[number];
export type PersonaBetaRecord=RecoveryRunRecord&{
 actor:PersonaBetaActor;sequence:number;persona:Persona|null;personaSha256:string|null;
 personaDelivery?:{native:number;assessment:number;action:number;errors:{step:number;stage:string;code:string}[]};
};
