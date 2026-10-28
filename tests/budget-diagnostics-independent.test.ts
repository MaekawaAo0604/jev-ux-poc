import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile,readdir,rename,stat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import {persistBudgetSnapshot,BudgetPersistenceError} from '../runner/budget-persistence.js';
import {BetaAdmissionError,BetaSettlementError,betaBudgetFailureEvidence} from '../runner/virtual-beta-core.js';
import {PhaseBudget} from '../runner/virtual-beta-budget.js';
import {main} from '../runner/virtual-beta.js';
import {runHumanJev} from '../runner/human-jev-experiment.js';
import {sourceIdentity} from '../runner/virtual-beta-source.js';
const root=resolve('reports/budget-diagnostics-2026-10-29/independent-fixtures-'+Date.now());
await mkdir(root,{recursive:true});
process.env.AI_GATEWAY_API_KEY='INDEPENDENT_LOCAL_FETCH_STUB_ONLY';
process.loadEnvFile=()=>{throw Error('ENV_READ_FORBIDDEN');};
const explicitFreeze=process.env.BUDGET_DIAGNOSTIC_SOURCE_FREEZE;
const freeze=explicitFreeze?JSON.parse(await readFile(explicitFreeze,'utf8')):await sourceIdentity();
async function verifyFreeze(label:string){const current=await sourceIdentity();await writeFile(join(root,label+'.json'),JSON.stringify(current,null,2));assert.deepEqual(current,freeze);}
async function fixture(name:string){const dir=join(root,name);await mkdir(dir);const file=join(dir,'ledger.json'),original='{"old":"unchanged"}\n';await writeFile(file,original);return {dir,file,original};}
test('independent source freeze before all tests',async()=>verifyFreeze('freeze-before'));
test('independent partial and complete failed snapshots retain original bytes without retry',async()=>{
 for(const stage of ['write-temp','replace-ledger'] as const){
  const {dir,file,original}=await fixture(stage);let writes=0,replaces=0,temp='';let observed:unknown;
  try{await persistBudgetSnapshot(file,{used:4,attempts:[{status:'RESERVED'}]},{
   write:async(p,c)=>{writes++;temp=p;await writeFile(p,stage==='write-temp'?'{"partial":':c,{flag:'wx'});if(stage==='write-temp')throw Object.assign(Error('PRIVATE_MESSAGE'),{code:'ENOSPC',path:'PRIVATE_PATH',stack:'PRIVATE_STACK'});},
   replace:async()=>{replaces++;throw {code:'EBUSY',message:'PRIVATE_MESSAGE'};}
  });}catch(e){observed=e;}
  assert.ok(observed instanceof BudgetPersistenceError);assert.deepEqual(observed.details,{stage,fsCode:stage==='write-temp'?'ENOSPC':'EBUSY'});
  assert.equal(writes,1);assert.equal(replaces,stage==='write-temp'?0:1);assert.equal(await readFile(file,'utf8'),original);
  const bytes=await readFile(temp,'utf8');if(stage==='write-temp')assert.equal(bytes,'{"partial":');else assert.equal(JSON.parse(bytes).used,4);
  assert.equal((await readdir(dir)).length,2);assert.ok(!JSON.stringify(observed).includes('PRIVATE'));
 }
});
test('independent native replacement failure keeps directory sentinel and complete orphan',async()=>{
 const {dir,file,original}=await fixture('native-directory');const target=join(dir,'blocked');await mkdir(target);await writeFile(join(target,'sentinel'),'original-directory');let e:any;
 try{await persistBudgetSnapshot(target,{used:9});}catch(error){e=error;}
 assert.ok(e instanceof BudgetPersistenceError);assert.equal(e.details.stage,'replace-ledger');assert.ok(['EPERM','EISDIR','EACCES','ENOTDIR','EEXIST'].includes(e.details.fsCode));
 assert.equal(await readFile(file,'utf8'),original);assert.equal((await stat(target)).isDirectory(),true);assert.equal(await readFile(join(target,'sentinel'),'utf8'),'original-directory');
 const orphans=(await readdir(dir)).filter(f=>f.startsWith('blocked.tmp-'));assert.equal(orphans.length,1);assert.deepEqual(JSON.parse(await readFile(join(dir,orphans[0]),'utf8')),{used:9});
});
test('independent JSON boundary rejects nonrepresentable roots before any IO, preserving valid JSON',async()=>{
 const circular:any={};circular.self=circular;
 for(const [i,value] of [undefined,Symbol('PRIVATE'),()=>{},1n,circular,{toJSON:()=>undefined}].entries()){
  const {file,original}=await fixture('invalid-'+i);let operations=0;
  await assert.rejects(persistBudgetSnapshot(file,value,{write:async()=>{operations++;},replace:async()=>{operations++;}}),e=>e instanceof TypeError&&!(e instanceof BudgetPersistenceError));
  assert.equal(operations,0);assert.equal(await readFile(file,'utf8'),original);
 }
 for(const [i,value] of [null,true,0,'日本語',[1,null],{schema:1}].entries()){
  const {file,dir}=await fixture('valid-'+i);await persistBudgetSnapshot(file,value);assert.deepEqual(JSON.parse(await readFile(file,'utf8')),value);assert.deepEqual(await readdir(dir),['ledger.json']);
 }
});
test('independent hostile errno values, accessors, proxies and inherited properties expose only safe flat categories',async()=>{
 let getterCalls=0;const attacks:unknown[]=[
  {code:'EACCES\nPRIVATE_PATH'}, {code:{toString(){throw Error('PRIVATE');}}},Object.create({code:'EPERM'}),
  {get code(){getterCalls++;throw Error('PRIVATE_GETTER');}},
  new Proxy({},{getOwnPropertyDescriptor(){throw Error('PRIVATE_PROXY');}}),
  'PRIVATE_THROWN_STRING',null,()=>{},Object.assign(Error('PRIVATE_MESSAGE'),{code:'ｅＰＥＲＭ',path:'PRIVATE_PATH',stack:'PRIVATE_STACK',cause:'PRIVATE_CAUSE'})
 ];
 for(const raw of attacks){
  let e:any;try{await persistBudgetSnapshot('PRIVATE_TARGET',{}, {write:async()=>{throw raw;},replace:async()=>assert.fail('replace must not run')});}catch(error){e=error;}
  assert.ok(e instanceof BudgetPersistenceError);assert.deepEqual(JSON.parse(JSON.stringify(e)),{code:'BUDGET_PERSISTENCE_ERROR',details:{stage:'write-temp',fsCode:'UNKNOWN'}});
  assert.equal(e.message,'BUDGET_PERSISTENCE_ERROR');assert.equal(Object.hasOwn(e,'cause'),false);assert.ok(!JSON.stringify(e).includes('PRIVATE'));
  for(const wrapped of [new BetaAdmissionError(e.details),new BetaSettlementError(e.details,'error')])assert.ok(!JSON.stringify(betaBudgetFailureEvidence(wrapped)).includes('PRIVATE'));
 }
 assert.equal(getterCalls,0);
 for(const code of ['ENOTEMPTY','EDQUOT','ENODEV','EFBIG','ENOMEM','EBADF','ELOOP']){
  let e:any;try{await persistBudgetSnapshot('PRIVATE_TARGET',{}, {write:async()=>{throw {code,path:'PRIVATE'};},replace:async()=>assert.fail()});}catch(error){e=error;}
  assert.equal(e.details.fsCode,code);assert.equal(Object.isFrozen(e.details),true);
 }
});
test('independent lock and caps remain fail closed with durable reopened accounting',async()=>{
 const {file}=await fixture('lock-caps');await writeFile(file,JSON.stringify({schemaVersion:1,status:'APPROVED',phase:'LOCAL_ONLY',newMaximum:2,perRunMaximum:1,used:0,attempts:[]}));
 const b=await PhaseBudget.open(file);try{
  await assert.rejects(PhaseBudget.open(file),{code:'EEXIST'});
  for(const runKey of ['a','b']){const id=await b.reserve({runKey,condition:'current',revision:'test',sourceHash:'test'});await b.settle(id,'ERROR',{attempts:1,failureCode:'HTTP_ERROR'});await assert.rejects(b.reserve({runKey,condition:'current',revision:'test',sourceHash:'test'}));}
  assert.equal(b.used,2);assert.equal(b.remaining,0);
 }finally{await b.close();}
 const reopened=await PhaseBudget.open(file);assert.equal(reopened.used,2);await reopened.close();
});
type Variant='reserve'|'settle-response'|'settle-error'|'deadline-settlement';
for(const wrapper of ['standard','human-action'] as const)for(const variant of ['reserve','settle-response','settle-error','deadline-settlement'] as Variant[])test('independent '+wrapper+' '+variant+' preserves real HTTP counts and diagnosis',async t=>{
 const dir=join(root,wrapper+'-'+variant);await mkdir(dir);const file=join(dir,'ledger.json'),blocked=join(dir,'blocked');await mkdir(blocked);await writeFile(join(blocked,'sentinel'),'DO_NOT_REPLACE');
 const human=wrapper==='human-action',ordinal=human?2:1;
 await writeFile(file,JSON.stringify({schemaVersion:1,status:'APPROVED',phase:'INDEPENDENT_FAKE_FETCH_ONLY',newMaximum:human?24:4,perRunMaximum:12,used:0,attempts:[]}));
 const prototype=PhaseBudget.prototype as any,originalPersist=prototype.persist,originalReserve=prototype.reserve;
 let failedPersists=0,http=0;const stubFailures:string[]=[],stages:string[]=[];
 const check=(action:()=>void)=>{try{action();}catch(e){stubFailures.push(String(e));}};
 t.mock.method(prototype,'persist',async function(this:any){
  const last=this.snapshot().attempts.at(-1),failureStatus=variant==='reserve'?'RESERVED':variant==='settle-response'?'OK':'ERROR';
  const fail=last?.ordinal===ordinal&&last?.status===failureStatus,saved=this.file;
  if(fail){failedPersists++;this.file=blocked;}try{return await originalPersist.call(this);}finally{this.file=saved;}
 });
 if(variant==='deadline-settlement'){
  const originalNow=performance.now.bind(performance);let shift=0;t.mock.method(performance,'now',()=>originalNow()+shift);
  t.mock.method(prototype,'reserve',async function(this:any,info:any){const id=await originalReserve.call(this,info);if(this.snapshot().attempts.at(-1).ordinal===ordinal)shift+=31000;return id;});
 }
 t.mock.method(globalThis,'fetch',async(url:any,options:any)=>{
  http++;check(()=>assert.equal(String(url),'https://ai-gateway.vercel.sh/typesafe/v1/systemone'));
  const body=JSON.parse(String(options.body)),action=!!body.questions.nextAction;stages.push(action?'action':'assessment');
  check(()=>assert.ok(http<=ordinal,'No retry or unexpected extra HTTP'));
  if(http===ordinal&&variant==='settle-error')return new Response(JSON.stringify({error:{message:'PRIVATE_PROVIDER_SENTINEL'}}),{status:503});
  const current=body.state.observation.id;
  const answers=Object.fromEntries(Object.entries(body.questions).map(([id,q]:[string,any])=>{
   const choice=id==='knowledge'?'insufficient':id==='goal'?'unsatisfied':id==='goalEvidence'?current:id.startsWith('effect_')?'unknown':id==='nextAction'?'done':id==='decisionBasis'?'uncertainty':'none';
   check(()=>assert.ok(Object.hasOwn(q.criteria,choice),id+':'+choice));
   return [id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,Number(k===choice)]))}];
  }));
  return new Response(JSON.stringify({model:'jev-1.14.0',answers}),{status:200});
 });
 let result:any,out:string,actual:number;
 if(human){
  const saved=await runHumanJev({out:join(dir,'run'),mock:false,mode:'experience-reason',phaseBudget:file,longContext:true});
  result=saved.result;out=saved.root;actual=JSON.parse(await readFile(join(out,'manifest.json'),'utf8')).actualAPIRequests;
  assert.equal(result.steps[0].deliberation.apiCalls,1);assert.ok(result.steps[0].deliberation.assessment);assert.equal(result.steps[0].deliberation.error,undefined);
 }else{
  const saved=await main(['--env-file',join(dir,'ABSENT_ENV_FORBIDDEN'),'--conditions','current','--ui','reference','--phase-budget',file,'--max-total-api','4','--out',join(dir,'run')]);
  assert.ok(saved);result=saved.results[0];out=saved.root;actual=JSON.parse(await readFile(join(out,'comparison.json'),'utf8')).actualAPIRequests;
 }
 const before=variant==='reserve'||variant==='deadline-settlement',expected=ordinal-(before?1:0),error=result.steps[0].error;
 assert.deepEqual(stubFailures,[],'fetch assertions must not be swallowed by client catch');
 assert.equal(http,expected);assert.equal(result.apiCalls,expected);assert.equal(actual,expected);assert.equal(failedPersists,1);
 assert.equal(result.termination,'API_ERROR');assert.equal(result.validForComparison,false);
 assert.equal(error.code,before?'BUDGET_ADMISSION_ERROR':'BUDGET_SETTLEMENT_AFTER_REQUEST');assert.equal(error.persistence.stage,'replace-ledger');
 assert.ok(['EPERM','EISDIR','EACCES','ENOTDIR','EEXIST'].includes(error.persistence.fsCode));
 if(before)assert.equal(error.boundary,variant==='reserve'?'reservation':'deadline-settlement');else assert.equal(error.requestOutcome,variant==='settle-error'?'error':'response');
 if(human)assert.deepEqual(stages,before?['assessment']:['assessment','action']);else assert.deepEqual(stages,before?[]:['action']);
 assert.ok(!JSON.stringify(error).includes(dir));assert.ok(!JSON.stringify(result).includes('PRIVATE_PROVIDER_SENTINEL'));
 const ledger=JSON.parse(await readFile(file,'utf8'));assert.equal(ledger.used,ordinal-(variant==='reserve'?1:0));
 if(human)assert.equal(ledger.attempts[0].status,'OK');
 if(variant!=='reserve')assert.equal(ledger.attempts.at(-1).status,'RESERVED');
 assert.equal(await readFile(join(blocked,'sentinel'),'utf8'),'DO_NOT_REPLACE');
 const temps=(await readdir(dir)).filter(f=>f.startsWith('blocked.tmp-'));assert.equal(temps.length,1);
 const orphan=JSON.parse(await readFile(join(dir,temps[0]),'utf8'));assert.equal(orphan.used,ordinal);assert.equal(orphan.attempts.at(-1).status,variant==='reserve'?'RESERVED':variant==='settle-response'?'OK':'ERROR');
 if(variant==='deadline-settlement'){assert.equal(orphan.attempts.at(-1).metadata.attempts,0);assert.equal(orphan.attempts.at(-1).metadata.failureCode,'DEADLINE_BEFORE_REQUEST');}
 await writeFile(join(dir,'evidence.json'),JSON.stringify({wrapper,variant,http,apiCalls:result.apiCalls,actualAPIRequests:actual,failedPersists,stages,termination:result.termination,validForComparison:result.validForComparison,error,orphanStatus:orphan.attempts.at(-1).status},null,2));
});
test('independent normal four comparison conditions complete under mock without HTTP',async t=>{
 let http=0;t.mock.method(globalThis,'fetch',async()=>{http++;throw Error('REAL_HTTP_FORBIDDEN');});
 const saved=await main(['--mock','--out',join(root,'normal-four')]);assert.ok(saved);assert.equal(saved.results.length,4);assert.equal(http,0);
 for(const r of saved.results){assert.equal(r.validForComparison,true,r.condition+':'+r.termination);assert.ok(r.apiCalls>0);assert.ok(r.apiCalls<=r.config.maxAPICalls);assert.ok(!r.steps.some(s=>(s.error as any)?.code?.startsWith('BUDGET_')));}
 assert.deepEqual(saved.results.map(r=>r.condition),['current','vision','state','combined']);
});
test('independent source freeze after all tests',async()=>verifyFreeze('freeze-after'));


