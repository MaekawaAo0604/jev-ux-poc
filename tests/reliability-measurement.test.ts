import {test} from 'node:test';
import assert from 'node:assert/strict';
import {measureReliability} from '../runner/reliability-measurement.js';

function fixture():any{return {
 oracle:{achievable:true,requiredFacts:['price','hours']},
 result:{reason:'JEV_DONE',steps:[{number:1,url:'http://fixture.test/',state:{screen:{pageId:'p1',text:['料金 1200円','平日10時から17時'],elements:[{id:'e1',text:'利用案内'}]},history:[]},decision:{choice:'e1',action:{type:'click',elementId:'e1'}},result:'OK',recordedAction:{action:'click',target:{anonymousId:'e1'},urlAfter:'http://fixture.test/guide'}},{number:2,url:'http://fixture.test/guide',state:{screen:{pageId:'p2',text:['完了'],elements:[]},history:[{pageId:'p1',observedText:['料金 1200円','平日10時から17時']}]},decision:{choice:'done',action:{type:'done'}},result:'JEV_DONE'}]},
 captures:[{step:1,sha256:'one',facts:['price','hours'],probes:[{kind:'text',text:'料金 1200円',visible:true},{kind:'text',text:'平日10時から17時',visible:true},{kind:'control',text:'利用案内',visible:true,candidateId:'e1'},{kind:'text',text:'HIDDEN',visible:false}]},{step:2,sha256:'two',facts:[],probes:[{kind:'text',text:'完了',visible:true}]}],
 wires:[{step:1,kind:'screen',imageHashes:['one'],seenFacts:['price','hours'],availableFacts:['price','hours'],oracleLeaked:false},{step:2,kind:'screen',imageHashes:['two'],seenFacts:['price','hours'],availableFacts:['price','hours'],oracleLeaked:false}],
 effects:[{step:1,action:{type:'click',elementId:'e1'},expectedUrl:'http://fixture.test/guide',actualUrl:'http://fixture.test/guide'}],
};}
test('measurement separates faithful middleware from goal success, including legitimate non-completion',()=>{
 const data=fixture(),m=measureReliability(data);assert.equal(m.middlewareFailures,0);assert.equal(m.metrics.falseCompletion.failed,0);
 data.result.reason='STUCK';data.oracle.achievable=false;data.result.steps[1].decision={choice:'stuck',action:{type:'stuck'}};
 assert.equal(measureReliability(data).middlewareFailures,0,'not reaching the goal is not a middleware failure');
 assert.equal(measureReliability(data).metrics.falseCompletion.status,'NOT_MEASURED','without a completion claim its correctness is unmeasured');
});
test('measurement detects missing visible content and controls plus hidden-content leakage',()=>{
 const data=fixture();data.result.steps[0].state.screen.text=['HIDDEN'];data.result.steps[0].state.screen.elements=[];
 const m=measureReliability(data);assert.equal(m.metrics.observation.failed,4);
});
test('measurement detects real effect mismatch even when the recorded action claims the chosen target',()=>{
 const data=fixture();data.effects[0].actualUrl='http://fixture.test/wrong';
 assert.equal(measureReliability(data).metrics.execution.failed,1);
});
test('measurement detects discarded observed history and stale goal-information input',()=>{
 const data=fixture();data.result.steps[1].state.history[0].observedText=[];data.wires[1].availableFacts=['hours'];
 const m=measureReliability(data);assert.equal(m.metrics.history.failed,1);assert.equal(m.metrics.retention.failed,1);
});
test('measurement rejects completion without evaluator-only truth or observed evidence',()=>{
 const data=fixture();data.oracle.achievable=false;assert.equal(measureReliability(data).metrics.falseCompletion.failed,1);
 data.oracle.achievable=true;data.captures[0].facts=['price'];assert.equal(measureReliability(data).metrics.falseCompletion.failed,1);
});
test('measurement catches wrong screenshot bytes and evaluator-truth leakage',()=>{
 const data=fixture();data.wires[1].imageHashes=['wrong'];data.wires[0].oracleLeaked=true;
 const m=measureReliability(data);assert.equal(m.metrics.images.failed,1);assert.equal(m.metrics.separation.failed,1);
});

test('an exact current screenshot does not excuse a detail image with unverified or changed pixels',()=>{
 const data=fixture();data.wires[0].derivedImagesVerified=false;
 assert.equal(measureReliability(data).metrics.images.failed,1);
 data.wires[0].derivedImagesVerified=true;assert.equal(measureReliability(data).metrics.images.failed,0);
});
test('missing evidence is unmeasured, not a passing empty denominator',()=>{
 const data=fixture();data.wires=[];data.effects=[];
 const m=measureReliability(data);assert.equal(m.metrics.images.status,'NOT_MEASURED');assert.equal(m.metrics.execution.status,'NOT_MEASURED');
});
test('action equality ignores serialization key order but not the selected element',()=>{
 const data=fixture();data.effects[0].action={elementId:'e1',type:'click'};
 assert.equal(measureReliability(data).metrics.execution.failed,0);
 data.effects[0].action.elementId='e2';assert.equal(measureReliability(data).metrics.execution.failed,2);
});
test('different documents cannot share a page identity even if their histories agree',()=>{
 const data=fixture();data.result.steps[1].state.screen.pageId='p1';
 assert.equal(measureReliability(data).metrics.history.failed,1);
});
test('route continuation is unmeasured without a committed route and fails on a dropped commitment',()=>{
 const data=fixture();assert.equal(measureReliability(data).metrics.routeContinuation.status,'NOT_MEASURED');
 data.result.steps[0].frontier={continuation:{targetId:'f2'}};
 assert.equal(measureReliability(data).metrics.routeContinuation.failed,1);
 data.result.steps[0].decision.frontier={mode:'continue',targetId:'f2'};
 assert.equal(measureReliability(data).metrics.routeContinuation.status,'PASS');
});
test('retained visual text with a mismatched source or invented value is a measurement failure',()=>{
 const data=fixture();data.wires[1].memoryChecks=[{ok:false,code:'VISUAL_NOTE_NOT_IN_SOURCE'}];
 assert.equal(measureReliability(data).metrics.memoryFidelity.failed,1);
});
test('goal-information retention does not classify missing irrelevant facts as middleware failures',()=>{
 const data=fixture();data.wires[1].seenFacts.push('unrelated-news');
 assert.equal(measureReliability(data).metrics.retention.failed,0);
 data.wires[1].availableFacts=['hours'];assert.equal(measureReliability(data).metrics.retention.failed,1);
});
