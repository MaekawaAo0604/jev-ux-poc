import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {sourceIdentity} from '../runner/virtual-beta-source.js';
import {humanJevProfile} from '../runner/human-jev-profiles.js';
import type {BetaResult} from '../runner/virtual-beta-core.js';
const api=await import('../runner/transfer-evaluation.js').catch(()=>({} as any));

test('schedule places a sentinel before each rotated six-cell block with distinct run IDs',()=>{
 assert.equal(typeof api.transferSchedule,'function','transfer scheduler must exist');
 const schedule=api.transferSchedule();
 assert.equal(schedule.length,21);assert.equal(new Set(schedule.map((s:any)=>s.id)).size,21);
 assert.deepEqual([0,7,14].map(i=>schedule[i].kind),['sentinel','sentinel','sentinel']);
 assert.deepEqual(schedule.slice(1,7).map((s:any)=>s.fixture.task+'/'+s.fixture.variant),['catalog/alpha','catalog/beta','draft/alpha','draft/beta','help/alpha','help/beta']);
 assert.deepEqual(schedule.slice(8,14).map((s:any)=>s.fixture.task+'/'+s.fixture.variant),['draft/alpha','draft/beta','help/alpha','help/beta','catalog/alpha','catalog/beta']);
 assert.deepEqual(schedule.slice(15).map((s:any)=>s.fixture.task+'/'+s.fixture.variant),['help/alpha','help/beta','catalog/alpha','catalog/beta','draft/alpha','draft/beta']);
 assert.ok(schedule.filter((s:any)=>s.kind==='sentinel').every((s:any)=>s.fixture.task==='direct'&&s.fixture.variant==='alpha'));
});
test('batch rejects ambiguous execution, invalid caps, real injection and mock credentials before output setup',async()=>{
 assert.equal(typeof api.validateTransferBatchOptions,'function','validation must exist');
 for(const options of [{out:'',mock:true},{out:'x',mock:true,limit:0},{out:'x',mock:true,limit:22},{out:'x',mock:true,limit:1.5},{out:'x',mock:false},{out:'x',mock:true,envFile:'secret'}])assert.throws(()=>api.validateTransferBatchOptions(options));
 await assert.rejects(()=>api.runTransferEvaluation({out:'unused',mock:false,envFile:'external'},async()=>({})),/MOCK_ONLY/);
});
async function sandbox(fn:(path:string)=>Promise<void>){const path=await mkdtemp(join(tmpdir(),'transfer-batch-'));try{await fn(path);}finally{await rm(path,{recursive:true,force:true});}}
async function successful(options:any){
 await mkdir(options.out);await writeFile(join(options.out,'initial-product.png'),'initial');
 const code=await sourceIdentity();
 const result:BetaResult={schemaVersion:1,runId:options.runId,condition:'human-screen-goal-search-grounded',code:{revision:code.revision,sourceHash:code.sourceHash},config:humanJevProfile('experience-goal-search-grounded').config,input:{charter:{schemaVersion:1,id:'fixture',targetWebsite:'local:good',goal:'fixture goal',initialState:{description:'initial',currentDate:'2026-10-29'},scope:[],prohibitedActions:{actionTypes:[],controlTexts:[],downloads:true},maxActions:15}},initialFingerprint:'fp',objectiveSuccess:false,perceivedDone:false,termination:'DECISION_LIMIT',looks:0,uiActions:0,decisions:0,apiCalls:0,apiMs:0,uiMs:0,modeledUserMs:null,elapsedMs:0,terminalObservation:{status:'RECORDED'},objectiveAssessment:{status:'OK',value:false},validForComparison:true,steps:[]};
 return {root:options.out,result,review:{status:'NOT_RUN'}};
}
test('limited batch keeps full21 planned slots, exact frozen method and unique output identities',async()=>sandbox(async path=>{
 assert.equal(typeof api.runTransferEvaluation,'function','batch runner must exist');
 const seen:any[]=[];const out=join(path,'run');
 const result=await api.runTransferEvaluation({out,mock:true,limit:2},async(options:any)=>{seen.push(options);return successful(options);});
 const manifest=JSON.parse(await readFile(join(out,'manifest.json'),'utf8')),summary=JSON.parse(await readFile(join(out,'summary.json'),'utf8'));
 assert.equal(result.status,'INCOMPLETE');assert.equal(manifest.schedule.length,21);assert.equal(manifest.records.length,2);
 assert.equal(summary.novel.planned,18);assert.equal(summary.novel.attempted,1);assert.equal(summary.sentinel.attempted,1);
 assert.equal(new Set(seen.map(o=>o.runId)).size,2);assert.ok(seen.every(o=>o.mode==='experience-goal-search-grounded'&&o.longContext===true&&o.deadlineEpochMs<=Date.now()+180000));
 assert.ok(seen[0].holdoutFixture);assert.ok(!seen[0].transferFixture);assert.ok(seen[1].transferFixture);assert.ok(!seen[1].holdoutFixture);
 assert.equal(manifest.method.persona,null);assert.deepEqual(manifest.method.profile,humanJevProfile('experience-goal-search-grounded'));
 assert.equal(manifest.limits.maxRequests,504);assert.equal(manifest.limits.parallel,1);assert.equal(manifest.priorCheckBefore.checked,0);
 await assert.rejects(()=>api.runTransferEvaluation({out,mock:true,limit:1},successful),/EEXIST/);
}));
test('setup failures are attempted slots and two consecutive infrastructure errors stop incomplete schedule',async()=>sandbox(async path=>{
 const out=join(path,'failed');const result=await api.runTransferEvaluation({out,mock:true},async()=>{throw Object.assign(new Error('external details should not be saved'),{code:'ECONNRESET'});});
 assert.equal(result.status,'CONSECUTIVE_INFRASTRUCTURE_FAILURES');
 const manifest=JSON.parse(await readFile(join(out,'manifest.json'),'utf8')),summary=JSON.parse(await readFile(join(out,'summary.json'),'utf8'));
 assert.equal(manifest.records.length,2);assert.equal(summary.completeness.attempted,2);assert.equal(summary.completeness.withResult,0);assert.equal(summary.novel.infrastructure,1);assert.equal(summary.sentinel.infrastructure,1);
 assert.ok(!JSON.stringify(manifest).includes('external details'));
}));
test('HTTP402 halts immediately and preserves failed slot accounting',async()=>sandbox(async path=>{
 const out=join(path,'payment');const result=await api.runTransferEvaluation({out,mock:true},async()=>{throw {statusCode:402};});
 assert.equal(result.status,'HTTP_402');const manifest=JSON.parse(await readFile(join(out,'manifest.json'),'utf8'));assert.equal(manifest.records.length,1);assert.equal(manifest.records[0].error.statusCode,402);
}));
test('exact config changes fail the batch even when only config id differs',async()=>sandbox(async path=>{
 const out=join(path,'changed');await assert.rejects(()=>api.runTransferEvaluation({out,mock:true,limit:1},async(options:any)=>{const saved=await successful(options);saved.result.config.id='changed';return saved;}),/FROZEN_CONFIG_CHANGED/);
 const manifest=JSON.parse(await readFile(join(out,'manifest.json'),'utf8'));assert.equal(manifest.status,'BATCH_ERROR');assert.equal(manifest.records.length,1);assert.equal(manifest.records[0].status,'RESULT');
}));
test('malformed explicitly supplied prior snapshot rejects without silently assuming no history',async()=>sandbox(async path=>{
 const prior=join(path,'prior.json');await writeFile(prior,'{"hashes":{},"ledgers":"bad"}');
 await assert.rejects(()=>api.runTransferEvaluation({out:join(path,'out'),mock:true,priorSnapshot:prior,limit:1},successful),/INVALID_PRIOR_SNAPSHOT/);
}));

test('charged ledger accounting preserves ERROR and RESERVED without rewriting ledger',async()=>sandbox(async path=>{
 const ledger=join(path,'budget.json');
 const original=JSON.stringify({schemaVersion:1,status:'APPROVED',phase:'unit',newMaximum:24,perRunMaximum:12,used:3,attempts:[{id:'a',ordinal:1,status:'OK'},{id:'b',ordinal:2,status:'ERROR'},{id:'c',ordinal:3,status:'RESERVED'}]});
 await writeFile(ledger,original);const accounting=await api.readTransferLedger(ledger);
 assert.equal(accounting.used,3);assert.equal(accounting.ok,1);assert.equal(accounting.errors,1);assert.equal(accounting.reserved,1);assert.equal(await readFile(ledger,'utf8'),original);
}));
test('trial cap violation preserves result and stops before another trial',async()=>sandbox(async path=>{
 const out=join(path,'cap');await assert.rejects(()=>api.runTransferEvaluation({out,mock:true},async(options:any)=>{const saved=await successful(options);saved.result.apiCalls=25;return saved;}),/TRIAL_CAP_EXCEEDED/);
 const manifest=JSON.parse(await readFile(join(out,'manifest.json'),'utf8'));assert.equal(manifest.records.length,1);assert.equal(manifest.records[0].result.apiCalls,25);assert.equal(manifest.status,'BATCH_ERROR');
}));
test('global deadline stops remaining slots without calling another trial',async()=>sandbox(async path=>{
 const out=join(path,'deadline'),original=Date.now;const started=original();
 try{const outcome=await api.runTransferEvaluation({out,mock:true},async(options:any)=>{const saved=await successful(options);Date.now=()=>started+3000000;return saved;});assert.equal(outcome.status,'PHASE_TIME_LIMIT');assert.equal(outcome.trials,1);}finally{Date.now=original;}
}));
test('full bounded mock simulation completes21 slots and keeps all six novel cells at3',async()=>sandbox(async path=>{
 const out=join(path,'complete');const outcome=await api.runTransferEvaluation({out,mock:true},successful),summary=JSON.parse(await readFile(join(out,'summary.json'),'utf8'));
 assert.equal(outcome.status,'COMPLETED');assert.equal(outcome.trials,21);assert.equal(outcome.requests,0);assert.equal(summary.completeness.complete,true);assert.ok(summary.cells.every((c:any)=>c.attempted===3));assert.equal(summary.novel.attempted,18);assert.equal(summary.sentinel.attempted,3);
}));


test('stable slot IDs are distinct from fresh actual run IDs across new batches',async()=>sandbox(async path=>{
 const a=join(path,'a'),b=join(path,'b');await api.runTransferEvaluation({out:a,mock:true,limit:1},successful);await api.runTransferEvaluation({out:b,mock:true,limit:1},successful);
 const first=JSON.parse(await readFile(join(a,'manifest.json'),'utf8')).records[0],second=JSON.parse(await readFile(join(b,'manifest.json'),'utf8')).records[0];
 assert.equal(first.slotId,'transfer-sentinel-direct-alpha-r1');assert.equal(second.slotId,first.slotId);assert.notEqual(first.runId,second.runId);assert.equal(first.result.runId,first.runId);assert.notEqual(first.runId,first.slotId);
}));

test('saved partial exploration result is recovered for accounting while failed wrapper remains invalid',async()=>sandbox(async path=>{
 const out=join(path,'partial');const outcome=await api.runTransferEvaluation({out,mock:true,limit:1},async(options:any)=>{const saved=await successful(options);await mkdir(join(options.out,'exploration'));await writeFile(join(options.out,'exploration','result.json'),JSON.stringify(saved.result));throw {statusCode:503};});
 assert.equal(outcome.status,'INCOMPLETE');const manifest=JSON.parse(await readFile(join(out,'manifest.json'),'utf8')),summary=JSON.parse(await readFile(join(out,'summary.json'),'utf8'));assert.equal(manifest.records[0].status,'FAILED');assert.equal(manifest.records[0].result.runId,manifest.records[0].runId);assert.equal(summary.sentinel.withResult,1);assert.equal(summary.sentinel.valid,0);assert.equal(summary.sentinel.infrastructure,1);
}));
