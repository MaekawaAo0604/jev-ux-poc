import test from 'node:test';import assert from 'node:assert/strict';import {readFile}from'node:fs/promises';import{parseControlledComparisonPlan,scheduleControlledComparison}from'../runner/controlled-comparison-plan.js';
const study=JSON.parse(await readFile('experiments/virtual-beta/attention-reselection-v1/study.json','utf8'));
test('12 fixed paired attention ON/OFF slots hold other mechanisms and finite budgets constant',async()=>{
 let total=0,slots=0;const seeds=[];
 for(const b of study.batches){const p=parseControlledComparisonPlan(JSON.parse(await readFile(b.plan,'utf8')));total+=p.allocatedAPIRequests;slots+=scheduleControlledComparison(p).length;seeds.push(...p.seeds);
  for(const mode of ['crop','foveated']){const off=p.configs.find(c=>c.vision.mode===mode&&!c.attention),on=p.configs.find(c=>c.vision.mode===mode&&c.attention?.enabled);assert.ok(off&&on);const {id:a,...x}=off,{id:z,attention,...y}=on;assert.deepEqual(x,y);assert.equal(on.maxAPICalls,12);assert.equal(on.maxDecisions,8);assert.equal(on.maxLooks,4);assert.equal(on.maxUIActions,6);assert.equal(on.state.memoryCapacity,3);assert.equal(on.behavior,'goal');assert.equal(on.selection.mode,'argmax');}
 }
 assert.deepEqual(seeds,[5001,5002,5003]);assert.equal(total,144);assert.equal(slots,12);assert.equal(total,study.allocatedAPIRequests);assert.equal(slots,study.plannedTrials);
});
