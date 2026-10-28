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

import {comparisonConfigs,validateConfig} from '../jev/virtual-beta/config.js';
test('initial fixation is explicit, cloned, and rejected outside the controlled viewport before dispatch',()=>{
 const c=comparisonConfigs(1,'crop')[3],point={x:960,y:675},valid=validateConfig({...c,initialFixation:point});point.x=1;assert.deepEqual(valid.initialFixation,{x:960,y:675});assert.equal(validateConfig(c).initialFixation,undefined);
 for(const bad of [null,{x:NaN,y:450},{x:640,y:Infinity},{x:1280,y:450},{x:640,y:900},{x:-1,y:450}])assert.throws(()=>validateConfig({...c,initialFixation:bad as any}));
});
