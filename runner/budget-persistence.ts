import {writeFile,rename} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {performance} from 'node:perf_hooks';

export type BudgetPersistenceDetails={stage:'write-temp'|'replace-ledger';fsCode:string};
const filesystemCodes=new Set(['EPERM','EACCES','EBUSY','EISDIR','ENOENT','ENOSPC','EIO','EROFS','EMFILE','ENFILE','EEXIST','EINVAL','ENOTDIR','EXDEV','ETXTBSY','ENAMETOOLONG','ENOTEMPTY','EDQUOT','ENODEV','EFBIG','ENOMEM','EBADF','ELOOP']);
const safeCode=(value:unknown):string=>typeof value==='string'&&filesystemCodes.has(value)?value:'UNKNOWN';
function failureCode(error:unknown):string{
 try{
  if(error!==null&&(typeof error==='object'||typeof error==='function'))return safeCode(Object.getOwnPropertyDescriptor(error,'code')?.value);
 }catch{}
 return 'UNKNOWN';
}
/** Public diagnostics contain only fixed categories, never the original filesystem error. */
export class BudgetPersistenceError extends Error{
 readonly code='BUDGET_PERSISTENCE_ERROR';
 readonly details:BudgetPersistenceDetails;
 constructor(details:BudgetPersistenceDetails){
  super('BUDGET_PERSISTENCE_ERROR');
  if(!details||!['write-temp','replace-ledger'].includes(details.stage))throw new Error('INVALID_BUDGET_PERSISTENCE_STAGE');
  this.details=Object.freeze({stage:details.stage,fsCode:safeCode(details.fsCode)});
  Object.defineProperty(this,'details',{writable:false,configurable:false});
  Object.defineProperty(this,'code',{writable:false,configurable:false});
 }
}
const nativeIO={write:async(path:string,content:string):Promise<void>=>{await writeFile(path,content,{flag:'wx'});},replace:rename};
type SnapshotIO={write:(path:string,content:string)=>Promise<void>;replace:(from:string,to:string)=>Promise<void>};
const pending=new Map<string,Promise<void>>();
const retryDelays=[25,50,100];
function retryDiagnostic(kind:'budget-persistence-retry'|'budget-persistence-recovered'|'budget-persistence-exhausted',ledgerId:string,attempt:number,delayMs:number):void{
 console.warn(JSON.stringify({kind,ledgerId,attempt,delayMs,fsCode:'EPERM'}));
}
async function persistSerialized(file:string,content:string,operations:SnapshotIO,ledgerId:string):Promise<void>{
 const temporary=file+'.tmp-'+randomUUID(),started=performance.now();
 try{await operations.write(temporary,content);}
 catch(error){throw new BudgetPersistenceError({stage:'write-temp',fsCode:failureCode(error)});}
 let previousFailure:BudgetPersistenceError|undefined;
 for(let attempt=1;attempt<=4;attempt++){
  // This guards the start of another attempt; an in-flight native operation cannot be interrupted.
  if(attempt>1&&performance.now()-started>=250){retryDiagnostic('budget-persistence-exhausted',ledgerId,attempt-1,0);throw previousFailure!;}
  try{
   await operations.replace(temporary,file);
   if(attempt>1)retryDiagnostic('budget-persistence-recovered',ledgerId,attempt,0);
   return;
  }catch(error){
   const fsCode=failureCode(error);previousFailure=new BudgetPersistenceError({stage:'replace-ledger',fsCode});
   if(process.platform!=='win32'||fsCode!=='EPERM')throw previousFailure;
   if(attempt===4||performance.now()-started>=250){retryDiagnostic('budget-persistence-exhausted',ledgerId,attempt,0);throw previousFailure;}
   const delayMs=retryDelays[attempt-1];retryDiagnostic('budget-persistence-retry',ledgerId,attempt,delayMs);
   await new Promise<void>(done=>setTimeout(done,delayMs));
  }
 }
}
/** One exclusive temporary write, then bounded Windows EPERM replacement retries of those same bytes.
 * Failed temporary snapshots remain available for diagnosis. Only the same resolved ledger is serialized.
 */
export async function persistBudgetSnapshot(file:string,snapshot:unknown,io?:{write:(path:string,content:string)=>Promise<void>;replace:(from:string,to:string)=>Promise<void>}):Promise<void>{
 // Capture the destination and snapshot before the first await; queued I/O must not resolve a later CWD.
 const normalized=resolve(file),serialized=JSON.stringify(snapshot,null,2);
 if(serialized===undefined)throw new TypeError('INVALID_BUDGET_SNAPSHOT');
 const key=process.platform==='win32'?normalized.toLowerCase():normalized;
 const ledgerId=createHash('sha256').update(key).digest('hex'),content=serialized+'\n',operations=io??nativeIO;
 const task=(pending.get(key)??Promise.resolve()).then(()=>persistSerialized(normalized,content,operations,ledgerId));
 // The stored tail always fulfills: a failure neither poisons the FIFO nor leaves a rejected cleanup promise.
 const tail=task.then(()=>{},()=>{});pending.set(key,tail);
 try{await task;}finally{if(pending.get(key)===tail)pending.delete(key);}
}
