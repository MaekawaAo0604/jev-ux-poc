import {writeFile,rename} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';

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
/** Preserve failed temporary snapshots for diagnosis; the existing ledger is replaced only after a complete write. */
export async function persistBudgetSnapshot(file:string,snapshot:unknown,io?:{write:(path:string,content:string)=>Promise<void>;replace:(from:string,to:string)=>Promise<void>}):Promise<void>{
 const serialized=JSON.stringify(snapshot,null,2);
 if(serialized===undefined)throw new TypeError('INVALID_BUDGET_SNAPSHOT');
 const content=serialized+'\n',temporary=file+'.tmp-'+randomUUID(),operations=io??nativeIO;
 try{await operations.write(temporary,content);}
 catch(error){throw new BudgetPersistenceError({stage:'write-temp',fsCode:failureCode(error)});}
 try{await operations.replace(temporary,file);}
 catch(error){throw new BudgetPersistenceError({stage:'replace-ledger',fsCode:failureCode(error)});}
}
