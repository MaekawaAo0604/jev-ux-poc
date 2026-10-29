import test from'node:test';import assert from'node:assert/strict';import{mkdtemp,rm}from'node:fs/promises';import{tmpdir}from'node:os';import{join,resolve}from'node:path';
const api=await import('../runner/recovery-evaluation.js').catch(()=>({} as any));
test('bounded recovery schedule has exactly six cells twice in outcome-independent reverse order',()=>{assert.equal(typeof api.recoverySchedule,'function');const s=api.recoverySchedule();assert.equal(s.length,12);assert.equal(new Set(s.map((x:any)=>x.id)).size,12);assert.deepEqual(s.slice(6).map((x:any)=>x.fixture),s.slice(0,6).map((x:any)=>x.fixture).reverse());for(const f of s.slice(0,6))assert.equal(s.filter((x:any)=>JSON.stringify(x.fixture)===JSON.stringify(f.fixture)).length,2);});
test('recovery batch rejects unsafe API, output and limit configuration',()=>{assert.equal(typeof api.validateRecoveryOptions,'function');const base={out:resolve('reports/new'),mock:true,priorSnapshot:resolve('reports/prior.json')};for(const options of [{...base,out:''},{...base,limit:0},{...base,limit:13},{...base,envFile:'E:/secret.env'},{...base,mock:false},{...base,mock:false,envFile:resolve('.env')}])assert.throws(()=>api.validateRecoveryOptions(options));api.validateRecoveryOptions(base);api.validateRecoveryOptions({...base,mock:false,envFile:'E:/ChatGPT/Ux_test/.env'});});
test('recovery batch refuses existing output before fixture, env, browser or original-file reads',async()=>{assert.equal(typeof api.runRecoveryEvaluation,'function');const dir=await mkdtemp(join(tmpdir(),'recovery-existing-'));try{await assert.rejects(()=>api.runRecoveryEvaluation({out:dir,mock:true,priorSnapshot:join(dir,'missing')}),{code:'EEXIST'});}finally{await rm(dir,{recursive:true,force:true});}});

test('settlement or admission evidence stops immediately even when original HTTP status was masked',()=>{
 assert.equal(typeof api.recoveryStopReason,'function');
 for(const code of ['BUDGET_SETTLEMENT_AFTER_REQUEST','BUDGET_ADMISSION_ERROR'])assert.equal(api.recoveryStopReason({result:{steps:[{deliberation:{error:{code,requestOutcome:'error'}}}]}}),'BUDGET_ACCOUNTING_FAILURE');
 assert.equal(api.recoveryStopReason({result:{steps:[{error:{statusCode:402}}]}}),'HTTP_402');
 assert.equal(api.recoveryStopReason({timing:{apiMs:402},text:'BUDGET_SETTLEMENT_AFTER_REQUEST'}),null);
 assert.equal(api.recoveryStopReason({error:{code:'ORDINARY_API_ERROR',statusCode:500}}),null);
});
