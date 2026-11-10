import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {parseControlledComparisonPlan,scheduleControlledComparison} from '../runner/controlled-comparison-plan.js';
const study=JSON.parse(await readFile('experiments/virtual-beta/controlled-v1/study.json','utf8'));
const leaves=(v:any,path=''):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?Object.assign({},...Object.entries(v).map(([k,x])=>leaves(x,path?path+'.'+k:k))):{[path]:v};
test('frozen study has explicit54 slots,360 maximum allocations and paired independent seeds without overstating balance',async()=>{
 let slots=0,allocation=0;const seedConditions=new Map<string,Set<number>>();
 for(const b of study.batches){const p=parseControlledComparisonPlan(JSON.parse(await readFile(b.plan,'utf8'))),s=scheduleControlledComparison(p);slots+=s.length;allocation+=p.allocatedAPIRequests;assert.equal(p.allocatedAPIRequests,b.allocatedAPIRequests);assert.equal(s.length,b.plannedTrials);assert.ok(p.maxTotalAPI<=48);for(const row of s){assert.equal(row.seed,b.seed);assert.equal(row.config.selection.seed,b.seed);const k=b.group+':'+b.apiCap+':'+row.condition;seedConditions.set(k,(seedConditions.get(k)??new Set()).add(row.seed));}}
 assert.equal(slots,54);assert.equal(allocation,360);for(const seeds of seedConditions.values())assert.deepEqual([...seeds],[3001,3002,3003]);assert.match(study.orderMeaning,/cannot fully balance/);
});
test('every declared factor pair changes one named mechanism and keeps common limits and current observation engine',async()=>{
 for(const batch of study.batches.filter((b:any)=>b.group==='factors')){const p=parseControlledComparisonPlan(JSON.parse(await readFile(batch.plan,'utf8'))),base=p.configs.find(c=>c.id==='factor-base')!;for(const c of p.configs){assert.equal(c.state.enabled,true);assert.equal(c.vision.mode,'full');if(c.id===base.id)continue;const a=leaves(base),b=leaves(c),diff=Object.keys(a).filter(k=>k!=='id'&&a[k]!==b[k]);const factor=study.factorPairs[c.id];assert.ok(diff.length>0);assert.ok(diff.every(k=>k===factor||k.startsWith(factor+'.')),JSON.stringify({condition:c.id,diff,factor}));}}
});
