import test from'node:test';import assert from'node:assert/strict';
const api=await import('../runner/persona-beta-comparison.js').catch(()=>({}as any));
test('twelve slots keep fixture/profile fixed and rotate baseline A B C over3replicates',()=>{
 assert.equal(typeof api.personaBetaSchedule,'function');const s=api.personaBetaSchedule();assert.equal(s.length,12);assert.deepEqual(s.map((r:any)=>r.sequence),Array.from({length:12},(_,i)=>i+1));
 for(const actor of['baseline','A','B','C'])assert.deepEqual(s.filter((r:any)=>r.actor===actor).map((r:any)=>r.replicate),[1,2,3]);
 assert.ok(s.every((r:any)=>r.fixture.task==='workshop'&&r.fixture.condition==='unchanged'));assert.equal(new Set(s.map((r:any)=>r.id)).size,12);
});
test('accounting/provider/safety faults stop immediately; isolated invalid output continues only within declared streak bound',()=>{
 assert.equal(typeof api.personaBetaStopReason,'function');
 assert.equal(api.personaBetaStopReason({result:{termination:'API_ERROR',validForComparison:false,steps:[{error:{code:'INVALID_VISUAL_HYPOTHESES'}}]}},1),null);
 assert.equal(api.personaBetaStopReason({result:{termination:'API_ERROR',validForComparison:false}},2),'CONSECUTIVE_INVALID_TRIALS');
 assert.equal(api.personaBetaStopReason({error:{code:'LEDGER_ACCOUNTING_UNAVAILABLE'},result:{steps:[{error:{code:'INVALID_VISUAL_HYPOTHESES'}}]}},1),'BUDGET_ACCOUNTING_FAILURE');
 assert.equal(api.personaBetaStopReason({result:{steps:[{error:{statusCode:402}}]}},1),'PROVIDER_UNAVAILABLE');
 assert.equal(api.personaBetaStopReason({result:{termination:'SAFETY_STOP'}},1),'SAFETY_STOP');
});
test('Persona binding validates every recorded stage and only counts successful responses',()=>{
 assert.equal(typeof api.personaInputBindings,'function');const p={schemaVersion:1,id:'A',name:'a',itLiteracy:'low',serviceExperience:'new',knowledge:['web'],expectations:['read'],behavioralTendencies:['careful'],contextAndConstraints:[]};
 const input={exploration:{persona:p,charter:{}},userState:{expectations:['read']}},record={persona:p,result:{input:{persona:p},steps:[{number:1,visualHypotheses:{request:{persona:p},response:{status:'completed'}},deliberation:{modelInput:input,response:{answers:{knowledge:{choice:'insufficient'}}}},modelInput:input,response:{answers:{nextAction:{choice:'done'}}}}]}};assert.deepEqual(api.personaInputBindings(record),{native:1,assessment:1,action:1,errors:[]});
 const changed=structuredClone(record);changed.result.steps[0].modelInput.exploration.persona={...p,name:'leaked'};
 const bad=api.personaInputBindings(changed);assert.ok(bad.errors.length>0);
 const failed=structuredClone(record);delete (failed.result.steps[0].visualHypotheses as any).response;delete (failed.result.steps[0].deliberation as any).response;delete (failed.result.steps[0]as any).response;
 assert.deepEqual(api.personaInputBindings(failed),{native:0,assessment:0,action:0,errors:[]});
});
