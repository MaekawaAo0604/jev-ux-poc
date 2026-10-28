import {persistBudgetSnapshot,BudgetPersistenceError} from './budget-persistence.js';
import {open,readFile,unlink,type FileHandle} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {BetaBudgetError,BetaAdmissionError} from './virtual-beta-core.js';
type ReservationInfo={runKey:string;condition:string;revision:string;sourceHash:string;uiVersion?:string};
type Entry=ReservationInfo&{id:string;ordinal:number;status:'RESERVED'|'OK'|'ERROR';reservedAt:string;finishedAt?:string;metadata?:{attempts?:number;failureCode?:string}};
type Ledger={schemaVersion:1;status:'APPROVED';phase:string;newMaximum:number;perRunMaximum:number;used:number;attempts:Entry[]};
/** Single-process owner lock plus pre-request durable reservation. Failed requests count; rejected reservations do not. */
export class PhaseBudget{
 private constructor(private file:string,private lock:FileHandle,private data:Ledger){}
 static async open(file:string){file=resolve(file);const lock=await open(file+'.lock','wx');try{const data=JSON.parse(await readFile(file,'utf8')) as Ledger;
 if(data.schemaVersion!==1||data.status!=='APPROVED'||!Number.isInteger(data.newMaximum)||data.newMaximum<1||data.newMaximum>48||!Number.isInteger(data.perRunMaximum)||data.perRunMaximum<1||data.perRunMaximum>12||!Array.isArray(data.attempts)||data.used!==data.attempts.length||data.used>data.newMaximum||data.attempts.some((r,i)=>r.ordinal!==i+1||!r.id||!['RESERVED','OK','ERROR'].includes(r.status))||new Set(data.attempts.map(r=>r.id)).size!==data.attempts.length)throw new Error('INVALID_OR_UNAPPROVED_PHASE_BUDGET');
 return new PhaseBudget(file,lock,data);
 }catch(error){await lock.close();await unlink(file+'.lock');throw error;}}
 get used(){return this.data.used;}
 get remaining(){return this.data.newMaximum-this.data.used;}
 snapshot(){return structuredClone({...this.data,remaining:this.remaining});}
 private async persist(){await persistBudgetSnapshot(this.file,{...this.data,remaining:this.remaining});}
 async reserve(info:ReservationInfo){
 if(this.remaining<1||this.data.attempts.filter(r=>r.runKey===info.runKey).length>=this.data.perRunMaximum)throw new BetaBudgetError('API_LIMIT');
 const entry:Entry={...info,id:randomUUID(),ordinal:this.data.used+1,status:'RESERVED',reservedAt:new Date().toISOString()};this.data.attempts.push(entry);this.data.used++;try{await this.persist();}catch(error){throw new BetaAdmissionError(error instanceof BudgetPersistenceError?error.details:undefined);}return entry.id;
 }
 async settle(id:string,status:'OK'|'ERROR',metadata:Entry['metadata']={}){const entry=this.data.attempts.find(r=>r.id===id);if(!entry||entry.status!=='RESERVED')throw new Error('INVALID_BUDGET_SETTLEMENT');entry.status=status;entry.finishedAt=new Date().toISOString();entry.metadata={...(metadata.attempts===undefined?{}:{attempts:metadata.attempts}),...(metadata.failureCode?{failureCode:metadata.failureCode}:{})};await this.persist();}
 async close(){await this.lock.close();await unlink(this.file+'.lock');}
}
