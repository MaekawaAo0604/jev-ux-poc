import test from 'node:test';
import assert from 'node:assert/strict';
import {holdoutSchedule,validateHoldoutBatchOptions} from '../runner/holdout-stability.js';

test('fixed24 schedule balances conditions and reverses paired order across replicates',()=>{
 const slots=holdoutSchedule();assert.equal(slots.length,24);assert.equal(new Set(slots.map(s=>s.id)).size,24);
 for(const task of ['switch','revisit','direct'])for(const variant of ['alpha','beta']){
  const group=slots.filter(s=>s.task===task&&s.variant===variant);assert.equal(group.length,4);
  const first=group.filter(s=>s.replicate===1),second=group.filter(s=>s.replicate===2);
  assert.deepEqual(first.map(s=>s.condition),second.map(s=>s.condition).reverse());
  assert.deepEqual(first.map(s=>s.condition).sort(),['control','policy']);
 }
 assert.deepEqual(slots,holdoutSchedule());
});
test('batch refuses unbounded, unsupported or missing-output runs before setup',()=>{
 for(const limit of [0,25,NaN,1.5])assert.throws(()=>validateHoldoutBatchOptions({out:'reports/test',mock:true,limit}));
 assert.throws(()=>validateHoldoutBatchOptions({out:'',mock:true}));
 assert.throws(()=>validateHoldoutBatchOptions({out:'reports/test',mock:false}));
 assert.doesNotThrow(()=>validateHoldoutBatchOptions({out:'reports/test',mock:true,limit:2}));
 assert.doesNotThrow(()=>validateHoldoutBatchOptions({out:'reports/test',mock:false,envFile:'private.env'}));
});
