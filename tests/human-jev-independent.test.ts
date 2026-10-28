import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PhaseBudget} from '../runner/virtual-beta-budget.js';
import {runHumanJev} from '../runner/human-jev-experiment.js';

async function localLedger(){
 const dir=await mkdtemp(join(tmpdir(),'human-jev-independent-')),file=join(dir,'budget.json');
 await writeFile(file,JSON.stringify({schemaVersion:1,status:'APPROVED',phase:'INDEPENDENT_LOCAL_TRANSPORT_ONLY',newMaximum:13,perRunMaximum:12,used:0,attempts:[]}));
 return {dir,file};
}
const readJSON=async(file:string)=>JSON.parse(await readFile(file,'utf8'));
function localReply(body:any){return new Response(JSON.stringify({model:'jev-1.14.0',answers:Object.fromEntries(Object.entries(body.questions as Record<string,{criteria:Record<string,string>}>).map(([id,q])=>{const choice=id==='nextAction'?'done':id==='decisionBasis'?'goal':'none';return [id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k===choice?1:0]))}];}))}),{status:200});}

// These exercise the real durable adapter with an entirely local fetch stub.
// No .env is specified or read; LOCAL_TEST_ONLY is never a real credential.
test('independent human wrapper: post-HTTP settlement failure retains the one actual API call',async(t)=>{
 const {dir,file}=await localLedger(),fetchBefore=globalThis.fetch,keyBefore=process.env.AI_GATEWAY_API_KEY;let requests=0,settlementReached=0;
 process.env.AI_GATEWAY_API_KEY='LOCAL_TEST_ONLY';
 const originalSettle=PhaseBudget.prototype.settle;
 t.mock.method(PhaseBudget.prototype,'settle',async function(this:PhaseBudget,...[id,status,metadata]:Parameters<PhaseBudget['settle']>){if(status==='OK'){settlementReached++;throw new Error('LOCAL_POST_HTTP_SETTLEMENT_FAILURE');}return originalSettle.call(this,id,status,metadata);});
 globalThis.fetch=async(url,options)=>{assert.match(String(url),/^https:\/\/ai-gateway\.vercel\.sh\//);requests++;return localReply(JSON.parse(String(options!.body)));};
 try{
  const saved=await runHumanJev({out:join(dir,'new-output'),mock:false,phaseBudget:file});
  assert.equal(requests,1);assert.equal(settlementReached,1);assert.equal(saved.result.termination,'API_ERROR');assert.equal(saved.result.uiActions,0);assert.equal(saved.result.validForComparison,false);
  assert.equal((await readJSON(join(saved.root,'manifest.json'))).actualAPIRequests,1);
  assert.equal((await readJSON(file)).used,1);
  assert.equal(saved.result.apiCalls,1,'A response was already received; a settlement failure cannot erase the actual HTTP call');
 }finally{globalThis.fetch=fetchBefore;if(keyBefore===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=keyBefore;}
});

test('independent human wrapper: pre-HTTP deadline settlement failure remains zero actual API calls',async(t)=>{
 const {dir,file}=await localLedger(),fetchBefore=globalThis.fetch,keyBefore=process.env.AI_GATEWAY_API_KEY,realNow=performance.now.bind(performance),originalReserve=PhaseBudget.prototype.reserve;let requests=0,offset=0,reservations=0,settlements=0;
 process.env.AI_GATEWAY_API_KEY='LOCAL_TEST_ONLY';
 t.mock.method(performance,'now',()=>realNow()+offset);
 t.mock.method(PhaseBudget.prototype,'reserve',async function(this:PhaseBudget,...[info]:Parameters<PhaseBudget['reserve']>){const id=await originalReserve.call(this,info);reservations++;assert.equal((await readJSON(file)).used,1);offset=30001;return id;});
 t.mock.method(PhaseBudget.prototype,'settle',async()=>{settlements++;throw new Error('LOCAL_PRE_HTTP_SETTLEMENT_FAILURE');});
 globalThis.fetch=async(_url,options)=>{requests++;return localReply(JSON.parse(String(options!.body)));};
 try{
  const saved=await runHumanJev({out:join(dir,'new-output'),mock:false,phaseBudget:file});
  assert.equal(reservations,1);assert.equal(settlements,1);assert.equal(requests,0);assert.equal(saved.result.termination,'API_ERROR');assert.equal(saved.result.uiActions,0);assert.equal(saved.result.validForComparison,false);
  assert.equal((await readJSON(join(saved.root,'manifest.json'))).actualAPIRequests,0);
  assert.equal((await readJSON(file)).used,1,'The conservative durable reservation remains charged');
  assert.equal(saved.result.apiCalls,0,'The deadline prevented HTTP; a settlement failure cannot invent an actual call');
 }finally{globalThis.fetch=fetchBefore;if(keyBefore===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=keyBefore;}
});

test('independent human wrapper: twelve admitted exploration calls plus one blind review exhaust only the new thirteen ledger',async()=>{
 const {dir,file}=await localLedger(),fetchBefore=globalThis.fetch,keyBefore=process.env.AI_GATEWAY_API_KEY;let exploration=0,reviews=0;
 process.env.AI_GATEWAY_API_KEY='LOCAL_TEST_ONLY';
 globalThis.fetch=async(url,options)=>{
  assert.match(String(url),/^https:\/\/ai-gateway\.vercel\.sh\//);
  const body=JSON.parse(String(options!.body)),state=body.state;
  assert.doesNotMatch(JSON.stringify({state,questions:body.questions}),/participant-feedback|selfAttested|reportedOutcome|通知設定だから設定|文字小さかった/);
  if(body.questions.nextAction){
   exploration++;assert.equal(state.exploration.persona,undefined);assert.equal(state.observation.screen,undefined);assert.equal(state.observation.width,1280);assert.equal(state.observation.height,900);
   assert.ok(state.userState.memory.every((m:any)=>m.visibleText.length===0));assert.ok(body.questions.nextAction.criteria.e4);assert.ok(body.questions.nextAction.criteria.e5);assert.ok(body.questions.nextAction.criteria.done);
  }else{
   reviews++;assert.equal(exploration,12);assert.equal(Object.keys(body.questions).length,9);assert.deepEqual(Object.keys(state).sort(),['frames','goal']);assert.equal(state.frames.length,1,'Repeated identical normally delivered images are deduplicated');
   assert.deepEqual(Object.keys(body.assets),['o1']);assert.equal(state.frames[0].observationId,'o1');
  }
  return new Response(JSON.stringify({model:'jev-1.14.0',answers:Object.fromEntries(Object.entries(body.questions as Record<string,{criteria:Record<string,string>}>).map(([id,q])=>{const choice=id==='nextAction'?'wait':id==='decisionBasis'?'uncertainty':id==='slot_2_issue_type'?'insufficient':'none';return [id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k===choice?1:0]))}];}))}),{status:200});
 };
 try{
  const saved=await runHumanJev({out:join(dir,'new-output'),mock:false,phaseBudget:file});const ledger=await readJSON(file),manifest=await readJSON(join(saved.root,'manifest.json'));
  assert.equal(exploration,12);assert.equal(reviews,1);assert.equal(saved.result.apiCalls,12);assert.equal(saved.result.termination,'DECISION_LIMIT');assert.equal(saved.result.uiActions,0);assert.equal(saved.result.perceivedDone,false);
  assert.equal(manifest.actualAPIRequests,13);assert.equal(manifest.totalEvaluatorCalls,13);assert.equal(ledger.used,13);assert.equal(ledger.attempts.length,13);assert.ok(ledger.attempts.every((a:any)=>a.status==='OK'&&a.metadata.attempts===1));
  const counts=ledger.attempts.reduce((m:Record<string,number>,a:any)=>(m[a.runKey]=(m[a.runKey]??0)+1,m),{});assert.deepEqual(Object.values(counts).sort((a:any,b:any)=>a-b),[1,12]);
  assert.equal(saved.review.status,'OK');const findings=saved.review.findings as Array<{type:string}>;assert.deepEqual(findings.map(f=>f.type),['none','insufficient','none']);assert.equal(findings.filter(f=>!['none','insufficient'].includes(f.type)).length,0,'Successful transport is not three measured positive UX findings');
 }finally{globalThis.fetch=fetchBefore;if(keyBefore===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=keyBefore;}
});
