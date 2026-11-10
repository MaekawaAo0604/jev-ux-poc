import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {comparisonConfigs} from '../jev/virtual-beta/config.js';
import {runControlledComparison} from '../runner/controlled-comparison.js';
import {sha,type BetaEvaluator} from '../runner/virtual-beta-core.js';
const plan=(caps=1,conditions=2,seeds=[17,29])=>({schemaVersion:1,id:'runner-test',configs:comparisonConfigs().slice(0,conditions).map(c=>({...c,maxAPICalls:caps,maxRunMs:30000})),seeds,maxTotalAPI:48});
async function target(){const dir=await mkdtemp(join(tmpdir(),'controlled-comparison-'));return {dir,out:join(dir,'new')};}
async function ledger(dir:string,maximum=48,perRunMaximum=12){const file=join(dir,'phase.json');await writeFile(file,JSON.stringify({schemaVersion:1,status:'APPROVED',phase:'local-stub',newMaximum:maximum,perRunMaximum,used:0,attempts:[]}));return file;}
const response=(request:Parameters<BetaEvaluator>[0],choice:string,model='MOCK')=>({model,answers:Object.fromEntries(Object.entries(request.questions).map(([id,q])=>{const selected=id==='nextAction'?choice:'goal';return [id,{choice:selected,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k===selected?1:0]))}];}))});
test('invalid allocations and underfunded phase reject before credential/output/browser work',async()=>{
 const {dir,out}=await target();await assert.rejects(runControlledComparison({plan:{...plan(),maxTotalAPI:1},out,mock:false,envFile:join(dir,'absent')}));await assert.rejects(access(out));
 const phaseBudgetFile=await ledger(dir,2);await assert.rejects(runControlledComparison({plan:plan(),out,mock:false,phaseBudgetFile,envFile:join(dir,'absent')}),/UNDERFUNDED/);await assert.rejects(access(out));
 assert.equal(JSON.parse(await readFile(phaseBudgetFile,'utf8')).used,0);await assert.rejects(access(phaseBudgetFile+'.lock'));
});
test('independent caps preserve every trial and fresh seed sampler; mock has zero actual HTTP',async()=>{
 const {out}=await target();let factories=0;
 const result=await runControlledComparison({plan:plan(1,2),out,mock:true},()=>{factories++;return async req=>response(req,Object.keys(req.questions.nextAction.criteria).find(k=>/^e\d+$/.test(k))!);});
 assert.equal(factories,4);assert.equal(result.summary.actualAPIRequests,0);assert.equal(result.summary.simulatedAPIRequests,4);assert.equal(result.results.length,4);
 assert.ok(result.summary.trials.every(t=>t.status==='censored'&&t.termination==='API_LIMIT'&&t.simulatedAPIRequests===1));
 assert.ok(result.summary.trials.every(t=>t.statusHistory.map(s=>s.status).join(',')==='planned,attempted,censored'));
 const summary=JSON.parse(await readFile(join(out,'comparison.json'),'utf8'));assert.equal(summary.plannedTrials,4);assert.equal(summary.attemptedTrials,4);assert.equal(summary.censoredTrials,4);assert.equal(summary.domainCollectionCostUSD,null);
 for(const run of result.results){assert.equal(run.config.selection.seed,result.summary.trials.find(t=>t.runId===run.runId)!.seed);await access(join(out,run.runId,'trace.zip'));}
 for(const file of ['manifest.json','checkpoint.json','comparison.csv','comparison.html'])await access(join(out,file));
 await assert.rejects(runControlledComparison({plan:plan(),out,mock:true}),/OUTPUT_EXISTS/);
});
test('voluntary abandonment is completed while three consecutive trustworthy invalid responses stop and retain missing rows',async()=>{
 const voluntary=await target();const config={...comparisonConfigs()[2],maxAPICalls:1,maxRunMs:30000};
 const done=await runControlledComparison({plan:{...plan(),configs:[config],seeds:[1]},out:voluntary.out,mock:true},()=>async req=>response(req,'abandon'));
 assert.equal(done.summary.trials[0].status,'completed');assert.equal(done.summary.trials[0].termination,'ABANDONED');
 const invalid=await target();const stopped=await runControlledComparison({plan:plan(1,4,[5]),out:invalid.out,mock:true},()=>async req=>({...response(req,'done'),answers:{nextAction:{choice:'done',probabilities:{done:1}}}}));
 assert.deepEqual(stopped.summary.trials.map(t=>t.status),['invalid','invalid','invalid','missing']);assert.equal(stopped.summary.stopReason,'THREE_CONSECUTIVE_MODEL_INVALID');assert.equal(stopped.summary.simulatedAPIRequests,3);
});
test('real adapter local fetch stub counts failed HTTP, debits phase, stops infrastructure and preserves missing',async()=>{
 const {dir,out}=await target(),phaseBudgetFile=await ledger(dir),oldFetch=globalThis.fetch,oldKey=process.env.AI_GATEWAY_API_KEY;let requests=0;
 process.env.AI_GATEWAY_API_KEY='LOCAL_FETCH_STUB_ONLY';globalThis.fetch=async()=>{requests++;return new Response('',{status:503});};
 try{const result=await runControlledComparison({plan:plan(1,2,[3]),out,mock:false,phaseBudgetFile,envFile:join(dir,'not-present')});assert.equal(requests,1);assert.equal(result.summary.actualAPIRequests,1);assert.equal(result.summary.reservedAPIRequests,1);assert.deepEqual(result.summary.trials.map(t=>t.status),['invalid','missing']);assert.equal(result.summary.stopReason,'API_ERROR');assert.equal(result.summary.trials[0].costUSD,null);const phase=JSON.parse(await readFile(phaseBudgetFile,'utf8'));assert.equal(phase.used,1);assert.equal(phase.attempts[0].status,'ERROR');assert.equal(phase.attempts[0].metadata.attempts,1);}
 finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=oldKey;}
});
test('real adapter successful stub records provider costs separately from modeled time and resets samples per seed',async()=>{
 const {dir,out}=await target(),phaseBudgetFile=await ledger(dir),oldFetch=globalThis.fetch,oldKey=process.env.AI_GATEWAY_API_KEY;let requests=0;
 process.env.AI_GATEWAY_API_KEY='LOCAL_FETCH_STUB_ONLY';globalThis.fetch=async(_url,init)=>{requests++;const payload=JSON.parse(String(init?.body));return new Response(JSON.stringify({...response({questions:payload.questions} as Parameters<BetaEvaluator>[0],'done','jev-1.14.0'),providerMetadata:{gateway:{cost:'0.001'}}}),{status:200});};
 try{const input=plan(1,1);input.configs[0].selection.mode='sample';const result=await runControlledComparison({plan:input,out,mock:false,phaseBudgetFile,envFile:join(dir,'not-present')});assert.equal(requests,2);assert.equal(result.summary.actualAPIRequests,2);assert.equal(result.summary.costUSD,0.002);assert.equal(result.summary.modelWaitingMs,result.summary.requests.reduce((s,r)=>s+r.apiMs,0));assert.ok(result.results.reduce((s,r)=>s+r.apiMs,0)>=result.summary.modelWaitingMs);assert.ok(result.summary.trials.every(t=>t.status==='completed'&&t.modeledUserMs===null));assert.ok(result.results.every(r=>r.steps[0].selection?.drawIndex===0));assert.equal(JSON.parse(await readFile(phaseBudgetFile,'utf8')).used,2);}
 finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=oldKey;}
});

test('classification separates imposed censoring, voluntary choice, model invalid and infrastructure/audit failures',async()=>{
 const module=await import('../runner/controlled-comparison.js') as Record<string,unknown>,classify=module.classifyControlledTrial;
 assert.equal(typeof classify,'function');if(typeof classify!=='function')return;
 const base={termination:'SUBJECTIVE_DONE',validForComparison:true,terminalObservation:{status:'RECORDED'},objectiveAssessment:{status:'OK',value:false},objectiveSuccess:false,steps:[]} as any;
 for(const termination of ['API_LIMIT','TIME_LIMIT','UI_ACTION_LIMIT','LOOK_LIMIT','DECISION_LIMIT'])assert.equal(classify({...base,termination}).status,'censored');
 assert.equal(classify({...base,termination:'ABANDONED'}).status,'completed');
 assert.equal(classify({...base,termination:'TIME_LIMIT'},{requestFailureCodes:['TIMEOUT']}).status,'invalid');
 assert.equal(classify({...base,termination:'TIME_LIMIT'},{requestFailureCodes:['TIMEOUT']}).stopReason,'INFRASTRUCTURE_TIMEOUT');
 const invalid={...base,termination:'INVALID_DISTRIBUTION',validForComparison:false};assert.equal(classify(invalid).trustworthyModelInvalid,true);
 const corrupted={...invalid,steps:[{audit:{sourceSha256:'a'},vision:{sourceSha256:'b'}}]};assert.equal(classify(corrupted).trustworthyModelInvalid,false);assert.equal(classify(corrupted).stopReason,'AUDIT_INVALID');
 assert.equal(classify({...base,terminalObservation:{status:'ERROR'}}).stopReason,'AUDIT_INVALID');
});

test('predetermined phase deadline preserves every unattempted trial without any simulated calls',async()=>{
 const {out}=await target();const result=await runControlledComparison({plan:{...plan(),maxDurationMs:1},out,mock:true});
 assert.equal(result.summary.stopReason,'PHASE_TIME_LIMIT');assert.equal(result.summary.attemptedTrials,0);assert.equal(result.summary.missingTrials,4);assert.equal(result.summary.actualAPIRequests,0);assert.equal(result.summary.simulatedAPIRequests,0);
});

test('real adapter transport timeout is infrastructure invalid even when run budget is exhausted',async()=>{
 const {dir,out}=await target(),phaseBudgetFile=await ledger(dir),oldFetch=globalThis.fetch,oldKey=process.env.AI_GATEWAY_API_KEY;
 process.env.AI_GATEWAY_API_KEY='LOCAL_FETCH_STUB_ONLY';globalThis.fetch=async()=>{throw new DOMException('Local timeout','TimeoutError');};
 try{const result=await runControlledComparison({plan:plan(1,2,[3]),out,mock:false,phaseBudgetFile,envFile:join(dir,'not-present')});assert.equal(result.summary.stopReason,'INFRASTRUCTURE_TIMEOUT');assert.deepEqual(result.summary.trials.map(t=>t.status),['invalid','missing']);assert.equal(result.summary.actualAPIRequests,1);assert.equal(result.summary.requests[0].failureCode,'TIMEOUT');}
 finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=oldKey;}
});

test('viewer manifest exposes attempted records, complete schedule and exact raw result hashes',async()=>{
 const {out}=await target();const saved=await runControlledComparison({plan:plan(1,1,[7]),out,mock:true},()=>async req=>response(req,'done'));
 const manifest=JSON.parse(await readFile(join(out,'manifest.json'),'utf8'));
 assert.equal(manifest.status,'COMPLETED');assert.equal(manifest.schedule[0].id,saved.summary.trials[0].runId);assert.equal(manifest.records.length,1);
 const row=manifest.records[0];assert.equal(row.id,row.runId);assert.equal(row.status,'RESULT');assert.equal(row.resultPath,join(out,row.id,'result.json'));assert.equal(row.requests,0);assert.equal(row.rawSha256,sha(await readFile(row.resultPath)));assert.equal(row.replay.status,'OK');assert.ok(row.artifactHashes['trace.zip']);assert.equal(saved.summary.validTrials,1);
});
