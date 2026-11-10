import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {PhaseBudget} from '../runner/virtual-beta-budget.js';
test('admission failure at actual atomic replace exposes safe stage and code without changing original ledger',async()=>{
 const root=resolve('reports/budget-diagnostics-2026-10-29/replace-'+Date.now());await mkdir(root,{recursive:true});
 const file=join(root,'ledger.json'),blocked=join(root,'existing-directory');
 await mkdir(blocked);await writeFile(file,JSON.stringify({schemaVersion:1,status:'APPROVED',phase:'LOCAL_FS_FAILURE_ONLY',newMaximum:4,perRunMaximum:2,used:0,attempts:[]}));
 const budget=await PhaseBudget.open(file),internal=budget as any;
 try{
  internal.file=blocked;
  await assert.rejects(budget.reserve({runKey:'fake-no-http',condition:'current',revision:'test',sourceHash:'test'}),(error:any)=>{
   assert.equal(error.code,'BUDGET_ADMISSION_ERROR');
   assert.equal(error.persistence?.stage,'replace-ledger');
   assert.ok(['EPERM','EISDIR','EACCES','ENOTDIR','EEXIST'].includes(error.persistence.fsCode));
   const serialized=JSON.stringify(error);assert.ok(!serialized.includes(root));assert.ok(!serialized.includes('existing-directory'));return true;
  });
  assert.equal(JSON.parse(await readFile(file,'utf8')).used,0);assert.equal(budget.used,1);
 }finally{internal.file=file;await budget.close();}
});
import {performance} from 'node:perf_hooks';
import {runHumanJev} from '../runner/human-jev-experiment.js';
process.env.AI_GATEWAY_API_KEY='LOCAL_BUDGET_DIAGNOSTIC_STUB_ONLY';
process.loadEnvFile=()=>{throw Error('ENV_FILE_FORBIDDEN');};
for(const variant of ['reserve','settle-response','settle-error','deadline-settlement'] as const)test('wrapper persistence diagnostics distinguish '+variant+' and preserve actual HTTP accounting',async t=>{
 const root=resolve('reports/budget-diagnostics-2026-10-29/'+variant+'-'+Date.now());await mkdir(root,{recursive:true});
 const file=join(root,'ledger.json'),blocked=join(root,'replacement-directory');await mkdir(blocked);
 await writeFile(file,JSON.stringify({schemaVersion:1,status:'APPROVED',phase:'FAKE_FETCH_ONLY',newMaximum:24,perRunMaximum:12,used:0,attempts:[]}));
 const prototype=PhaseBudget.prototype as any,originalPersist=prototype.persist,originalReserve=prototype.reserve;
 t.mock.method(prototype,'persist',async function(this:any){
  const last=this.snapshot().attempts.at(-1),fail=variant==='reserve'?last?.status==='RESERVED':variant==='settle-response'?last?.status==='OK':last?.status==='ERROR';
  const saved=this.file;if(fail)this.file=blocked;
  try{return await originalPersist.call(this);}finally{this.file=saved;}
 });
 if(variant==='deadline-settlement'){
  const originalNow=performance.now.bind(performance);let shift=0;
  t.mock.method(performance,'now',()=>originalNow()+shift);
  t.mock.method(prototype,'reserve',async function(this:any,info:any){const id=await originalReserve.call(this,info);shift+=31000;return id;});
 }
 let http=0;
 t.mock.method(globalThis,'fetch',async (url:any,options:any)=>{
  assert.equal(String(url),'https://ai-gateway.vercel.sh/typesafe/v1/systemone');assert.equal(++http,1,'No duplicate HTTP');
  if(variant==='settle-error')return new Response(JSON.stringify({error:'PRIVATE_MESSAGE_MUST_NOT_LEAK'}),{status:503});
  const body=JSON.parse(String(options.body)),current=body.state.observation.id;
  return new Response(JSON.stringify({model:'jev-1.14.0',answers:Object.fromEntries(Object.entries(body.questions).map(([id,q]:[string,any])=>{
   const choice=id==='knowledge'?'insufficient':id==='goal'?'unsatisfied':id==='goalEvidence'?current:id.startsWith('effect_')?'unknown':id==='nextAction'?'done':id==='decisionBasis'?'uncertainty':'none';
   assert.ok(Object.hasOwn(q.criteria,choice),id+':'+choice);
   return [id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,Number(k===choice)]))}];
  }))}),{status:200});
 });
 const saved=await runHumanJev({out:join(root,'run'),mock:false,mode:'experience-reason',phaseBudget:file,longContext:true});
 const beforeRequest=variant==='reserve'||variant==='deadline-settlement',expected=beforeRequest?0:1;
 assert.equal(http,expected);assert.equal(saved.result.apiCalls,expected);assert.equal(saved.result.steps[0].deliberation!.apiCalls,expected);
 assert.equal(JSON.parse(await readFile(join(saved.root,'manifest.json'),'utf8')).actualAPIRequests,expected);
 assert.equal(saved.result.termination,'API_ERROR');assert.equal(saved.result.validForComparison,false);
 const error=saved.result.steps[0].error as any;
 assert.equal(error.code,beforeRequest?'BUDGET_ADMISSION_ERROR':'BUDGET_SETTLEMENT_AFTER_REQUEST');
 assert.equal(error.persistence?.stage,'replace-ledger');assert.ok(['EPERM','EISDIR','EACCES','ENOTDIR','EEXIST'].includes(error.persistence.fsCode));
 if(beforeRequest)assert.equal(error.boundary,variant==='reserve'?'reservation':'deadline-settlement');
 else assert.equal(error.requestOutcome,variant==='settle-response'?'response':'error');
 assert.ok(!JSON.stringify(error).includes(root));assert.ok(!JSON.stringify(saved.result).includes('PRIVATE_MESSAGE_MUST_NOT_LEAK'));
 const ledger=JSON.parse(await readFile(file,'utf8'));assert.equal(ledger.used,variant==='reserve'?0:1);
 if(!beforeRequest)assert.equal(ledger.attempts[0].status,'RESERVED');
});
