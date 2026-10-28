import test from 'node:test';
import assert from 'node:assert/strict';
import {createSemanticTrials} from '../runner/semantic-protocol.js';
const ids=['reference','position-only','wording-only'] as const;
test('factorial assignments have twelve unique fixed slots and one A/B pair per UI and replicate',()=>{
 const a=createSemanticTrials([...ids],2,123);assert.equal(a.length,12);assert.equal(new Set(a.map(t=>t.id)).size,12);assert.deepEqual(a.map(t=>t.slot),Array.from({length:12},(_,i)=>i+1));
 for(const ui of ids)for(const rep of [1,2])assert.deepEqual(a.filter(t=>t.fixture.ui===ui&&t.replicate===rep).map(t=>t.fixture.mapping).sort(),['A','B']);
 assert.deepEqual(a,createSemanticTrials([...ids],2,123));assert.notDeepEqual(a.map(t=>t.fixture),createSemanticTrials([...ids],2,124).map(t=>t.fixture));
});
test('invalid or duplicate treatments and invalid seeds fail before execution',()=>{
 for(const args of [[[],2,123],[[...ids,'reference'],2,123],[[...ids],0,123],[[...ids],2,-1],[[...ids],2,2**32]] as const)assert.throws(()=>createSemanticTrials(args[0] as any,args[1],args[2]));
});
