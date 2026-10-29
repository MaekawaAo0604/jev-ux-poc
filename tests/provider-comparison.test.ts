import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const api=await import('../runner/provider-comparison.js').catch(()=>({} as any));

test('provider comparison uses 12 paired slots in reverse second-block order',()=>{
 assert.equal(typeof api.providerSchedule,'function');const slots=api.providerSchedule();assert.equal(slots.length,12);assert.equal(new Set(slots.map((s:any)=>s.id)).size,12);assert.deepEqual(slots.slice(6).map((s:any)=>s.fixture),slots.slice(0,6).map((s:any)=>s.fixture).reverse());
});
test('provider configuration rejects invalid limits, credentials in mock and nonexternal env',()=>{
 assert.equal(typeof api.validateProviderComparisonOptions,'function');const base={out:resolve('reports/new'),mock:true,priorSnapshot:resolve('reports/prior.json')};
 for(const o of [{...base,out:''},{...base,limit:0},{...base,limit:13},{...base,envFile:'E:/secret.env'},{...base,mock:false},{...base,mock:false,envFile:resolve('.env')},{...base,priorSnapshot:'relative'}])assert.throws(()=>api.validateProviderComparisonOptions(o));
 api.validateProviderComparisonOptions(base);api.validateProviderComparisonOptions({...base,mock:false,envFile:'E:/ChatGPT/Ux_test/.env'});
});
test('existing output refuses before source, env or browser access',async()=>{
 assert.equal(typeof api.runProviderComparison,'function');const out=await mkdtemp(join(tmpdir(),'provider-existing-'));await assert.rejects(()=>api.runProviderComparison({out,mock:true,priorSnapshot:join(out,'absent')}),{code:'EEXIST'});
});
test('auth/quota and hidden budget faults stop the next pair, ordinary failures remain distinct',()=>{
 assert.equal(typeof api.providerStopReason,'function');for(const statusCode of [401,402,403,404,429])assert.equal(api.providerStopReason({result:{steps:[{error:{statusCode}}]}}),'PROVIDER_UNAVAILABLE');
 assert.equal(api.providerStopReason({error:{code:'BUDGET_SETTLEMENT_AFTER_REQUEST'}}),'BUDGET_ACCOUNTING_FAILURE');assert.equal(api.providerStopReason({error:{code:'LEDGER_ACCOUNTING_UNAVAILABLE'}}),'BUDGET_ACCOUNTING_FAILURE');assert.equal(api.providerStopReason({timing:{apiMs:402}}),null);assert.equal(api.providerStopReason({error:{statusCode:500}}),null);
});
