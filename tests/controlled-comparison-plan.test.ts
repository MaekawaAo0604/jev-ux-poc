import test from 'node:test';
import assert from 'node:assert/strict';
import {comparisonConfigs} from '../jev/virtual-beta/config.js';
import {parseControlledComparisonPlan,scheduleControlledComparison} from '../runner/controlled-comparison-plan.js';
const plan=()=>({schemaVersion:1,id:'test',configs:comparisonConfigs().map(c=>({...c,maxAPICalls:3})),seeds:[11,22,33],maxTotalAPI:48});
test('validates complete allocation up front and preserves paired distinct uint32 seeds',()=>{
 const parsed=parseControlledComparisonPlan(plan()),trials=scheduleControlledComparison(parsed);
 assert.equal(parsed.allocatedAPIRequests,36);assert.equal(trials.length,12);
 for(const condition of parsed.configs.map(c=>c.id))assert.deepEqual(trials.filter(t=>t.condition===condition).map(t=>t.seed),[11,22,33]);
 assert.equal(new Set(trials.map(t=>t.runId)).size,12);
 assert.ok(trials.every(t=>t.config.selection.seed===t.seed&&t.config.maxAPICalls===3));
 assert.deepEqual(trials.filter(t=>t.seed===11).map(t=>t.condition),['current','vision','state','combined']);
 assert.deepEqual(trials.filter(t=>t.seed===22).map(t=>t.condition),['vision','state','combined','current']);
 for(const c of parsed.configs)assert.equal(new Set(trials.filter(t=>t.condition===c.id).map(t=>t.position)).size,3);
});
test('rejects duplicate/invalid seeds, duplicate configs and unsafe caps before scheduling',()=>{
 for(const change of [{seeds:[]},{seeds:[1,1]},{seeds:[-1]},{seeds:[4294967296]},{seeds:[1,2,3,4]},{configs:[]},{configs:[plan().configs[0],plan().configs[0]]},{maxTotalAPI:49},{maxTotalAPI:35},{maxDurationMs:2700001},{unexpected:true}])assert.throws(()=>parseControlledComparisonPlan({...plan(),...change}));
 assert.throws(()=>parseControlledComparisonPlan({...plan(),configs:[{...plan().configs[0],maxAPICalls:13}]}));
 assert.throws(()=>parseControlledComparisonPlan({...plan(),configs:Array.from({length:9},(_,i)=>({...plan().configs[0],id:'c'+i,maxAPICalls:1}))}));
});
test('single-stage comparison refuses advanced stages and clones caller config',()=>{
 const input=plan();const parsed=parseControlledComparisonPlan(input);input.configs[0].selection.seed=999;
 assert.notEqual(parsed.configs[0].selection.seed,999);
 assert.throws(()=>parseControlledComparisonPlan({...plan(),configs:[{...plan().configs[2],deliberation:{enabled:true,memoryCapacity:3}}]}),/SINGLE_STAGE/);
});
test('one-seed batches rotate their declared condition order by seed deterministically',()=>{
 const input={...plan(),seeds:[0,4294967295],configs:plan().configs.slice(0,2)};
 assert.deepEqual(scheduleControlledComparison(parseControlledComparisonPlan(input)).map(t=>[t.seed,t.condition]),[[0,'current'],[0,'vision'],[4294967295,'vision'],[4294967295,'current']]);
});
