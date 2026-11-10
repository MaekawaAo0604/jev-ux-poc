import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSampler,replaySelection} from '../jev/virtual-beta/selection.js';
import type {BetaCandidates} from '../jev/virtual-beta/contracts.js';
const candidates:BetaCandidates={a:{action:{type:'click',elementId:'a'},label:'first'},b:{action:{type:'click',elementId:'b'},label:'other'},done:{action:{type:'done'},label:'done'}};

test('explicit positive policy weights change actual argmax while retaining raw, pre-policy and final distributions',()=>{
 const record=createSampler({mode:'argmax',seed:2}).select('a',{a:0.95,b:0.04,done:0.01},candidates,{}, {a:0.01,b:1,done:1});
 assert.equal(record.selected,'b');assert.equal(record.modelChoice,'a');assert.equal(record.raw.a,0.95);assert.equal(record.normalized.a,0.95);assert.equal(record.policy!.before.a,0.95);assert.equal(record.policy!.weights.a,0.01);assert.ok(record.filtered.a>0);assert.ok(record.filtered.b>record.filtered.a);assert.deepEqual(record.adjustments,[]);
 assert.deepEqual(replaySelection(record,candidates),record);const changed=structuredClone(record);changed.policy!.weights.a=0.5;assert.throws(()=>replaySelection(changed,candidates));
});

test('policy sampling is seeded/replayable, safety exclusions stay excluded and malformed weights are rejected',()=>{
 const raw={a:0.8,b:0.1,done:0.1},weights={a:0.01,b:1,done:1};
 const first=createSampler({mode:'sample',seed:20261028}).select('a',raw,candidates,{done:'SAFETY_TEST'},weights);
 const second=createSampler({mode:'sample',seed:20261028}).select('a',raw,candidates,{done:'SAFETY_TEST'},weights);assert.deepEqual(first,second);assert.equal(first.filtered.done,0);assert.equal(first.policy!.before.done,0);assert.deepEqual(replaySelection(first,candidates),first);
 for(const bad of [{a:0,b:1,done:1},{a:NaN,b:1,done:1},{a:2,b:1,done:1},{a:1,b:1},{a:1,b:1,done:1,extra:1}] as Record<string,number>[])assert.throws(()=>createSampler({mode:'argmax',seed:1}).select('a',raw,candidates,{},bad));
 const unchanged=createSampler({mode:'argmax',seed:1}).select('a',raw,candidates);assert.equal(unchanged.policy,undefined);assert.equal(unchanged.selected,'a');
 const zero=createSampler({mode:'argmax',seed:1}).select('a',{a:1,b:0,done:0},candidates,{},weights);assert.equal(zero.filtered.b,0);assert.equal(zero.selected,'a');
});


test('inactive positive weights preserve draw and probabilities; underflow cannot silently delete revisit mass',()=>{
 const raw={a:0.8,b:0.1,done:0.1};const plain=createSampler({mode:'sample',seed:42}).select('a',raw,candidates),inactive=createSampler({mode:'sample',seed:42}).select('a',raw,candidates,{}, {a:1,b:1,done:1});assert.equal(inactive.selected,plain.selected);assert.equal(inactive.draw,plain.draw);assert.deepEqual(inactive.filtered,plain.filtered);
 assert.throws(()=>createSampler({mode:'argmax',seed:1}).select('b',{a:Number.MIN_VALUE,b:1,done:0},candidates,{}, {a:0.01,b:1,done:1}),/underflow/);
});
