import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as deferral from '../jev/virtual-beta/deferral.js';
import type {DeferralApplication,DeferralConfig,DeferralDecision,DeferralMemory} from '../jev/virtual-beta/deferral-contracts.js';
import type {BetaCandidates,SelectionPolicyScope,UserObservation} from '../jev/virtual-beta/contracts.js';
import type {DeliberationAssessment} from '../jev/virtual-beta/deliberation-contracts.js';
import {createSampler,replaySelection} from '../jev/virtual-beta/selection.js';

const config:DeferralConfig={enabled:true,capacity:8,weight:0.01,minAlternativeProbability:0.01};
const candidates:BetaCandidates={e1:{action:{type:'click',elementId:'e1'},label:'first'},e2:{action:{type:'click',elementId:'e2'},label:'alternative'},wait:{action:{type:'wait'},label:'wait'},abandon:{action:{type:'abandon'},label:'abandon'}};
const current:UserObservation={id:'o3',imageSha256:'A',visibleText:[],fixation:{x:0,y:0},candidateIds:Object.keys(candidates)};
const assessment:DeliberationAssessment={schemaVersion:1,kind:'model-assessment-not-fact',observationId:'o3',imageSha256:'A',knowledge:'insufficient',goal:'unsatisfied',effects:{},adjustments:[]};
const memory:DeferralMemory={schemaVersion:1,entries:[{imageSha256:'A',candidateId:'e1',fromObservationId:'o1',toObservationId:'o3',evidence:[{observationId:'o2',imageSha256:'B'}]}]};
const raw={e1:0.96,e2:0.04,wait:0,abandon:0};
function apply(decision:DeferralDecision,value:DeferralConfig):DeferralApplication{
 const fn=(deferral as Partial<{deferralApplication:(decision:DeferralDecision,config:DeferralConfig)=>DeferralApplication}>).deferralApplication;
 assert.equal(typeof fn,'function','deferralApplication export is required');
 return fn!(decision,value);
}
const proposed=(weights:Record<string,number>):DeferralDecision=>({kind:'temporary-deferral',weights,plausibleCandidates:[],deferredCandidates:[],appliedCandidates:[],reason:'NO_DEFERRED_CANDIDATE'});

// Catches changing the proposal/learning path when only application should change.
test('same 0.96/0.04 proposal selects e2 ON and e1 OFF through existing argmax in both scopes',()=>{
 for(const selectionScope of ['global','ui-conditional'] as SelectionPolicyScope[]){
  const onConfig={...config,selectionScope,applyWeights:true},offConfig={...config,selectionScope,applyWeights:false};
  const onDecision=deferral.deferralDecision(memory,current,candidates,assessment,raw,onConfig),offDecision=deferral.deferralDecision(memory,current,candidates,assessment,raw,offConfig),before=structuredClone(offDecision);
  assert.deepEqual(offDecision,onDecision);
  assert.equal(offDecision.reason,'DEFER_WITH_ALTERNATIVES');
  const on=apply(onDecision,onConfig),off=apply(offDecision,offConfig);
  assert.deepEqual(on.proposedWeights,{e1:0.01,e2:1,wait:1,abandon:1});
  assert.deepEqual(off.proposedWeights,on.proposedWeights);
  assert.deepEqual(off.appliedWeights,{e1:1,e2:1,wait:1,abandon:1});
  assert.equal(on.mode,'apply');assert.equal(off.mode,'observe-only');
  const selectedOn=createSampler({mode:'argmax',seed:7}).select('e1',raw,candidates,{},on.appliedWeights,selectionScope);
  const selectedOff=createSampler({mode:'argmax',seed:7}).select('e1',raw,candidates,{},off.appliedWeights,selectionScope);
  assert.equal(selectedOn.selected,'e2');assert.equal(selectedOff.selected,'e1');
  assert.deepEqual(selectedOn.raw,selectedOff.raw);assert.deepEqual(selectedOn.normalized,selectedOff.normalized);
  assert.deepEqual(offDecision,before);assert.equal(offDecision.weights.e1,0.01);
 }
});

// Catches equating the evaluator's modelChoice with the probability sampler baseline.
test('observe-only returns the sampler baseline even when modelChoice differs from raw argmax',()=>{
 const application=apply(proposed({e1:0.01,e2:1,wait:1,abandon:1}),{...config,applyWeights:false});
 const result=createSampler({mode:'argmax',seed:7}).select('e2',raw,candidates,{},application.appliedWeights);
 assert.equal(result.modelChoice,'e2');assert.equal(result.selected,'e1');
});

// Catches OFF re-enabling a safety-excluded candidate or consuming a different draw.
test('same saved distribution and seed replay ON/OFF while safety exclusions remain active',()=>{
 const distribution={e1:0.8,e2:0.1,wait:0.05,abandon:0.05};
 for(const selectionScope of ['global','ui-conditional'] as SelectionPolicyScope[]){
  const baseline=createSampler({mode:'sample',seed:20261105}),offSampler=createSampler({mode:'sample',seed:20261105}),onSampler=createSampler({mode:'sample',seed:20261105});
  for(let i=0;i<8;i++){
   const excluded={e1:'SAFETY_EXCLUDED'},weights={e1:0.01,e2:1,wait:1,abandon:1};
   const off=apply(proposed(weights),{...config,applyWeights:false}),on=apply(proposed(weights),{...config,applyWeights:true});
   const plain=baseline.select('e1',distribution,candidates,excluded),actualOff=offSampler.select('e1',distribution,candidates,excluded,off.appliedWeights,selectionScope),actualOn=onSampler.select('e1',distribution,candidates,excluded,on.appliedWeights,selectionScope);
   assert.equal(actualOff.selected,plain.selected);assert.equal(actualOff.draw,plain.draw);assert.equal(actualOn.draw,plain.draw);assert.equal(actualOff.drawIndex,i);
   assert.equal(actualOff.filtered.e1,0);assert.equal(actualOn.filtered.e1,0);assert.deepEqual(actualOff.adjustments,[{candidate:'e1',reason:'SAFETY_EXCLUDED'}]);
   assert.deepEqual(replaySelection(structuredClone(actualOff),candidates),actualOff);assert.deepEqual(replaySelection(structuredClone(actualOn),candidates),actualOn);
  }
 }
});

// Catches applying the scope change to non-UI wait/abandon events or changing the draw stream.
test('UI-conditional ON/OFF retain non-UI wait and abandon on the same seeded draws',()=>{
 const distribution={e1:0.25,e2:0.25,wait:0.25,abandon:0.25},weights={e1:0.01,e2:1,wait:1,abandon:1};
 const baseline=createSampler({mode:'sample',seed:35}),onSampler=createSampler({mode:'sample',seed:35}),offSampler=createSampler({mode:'sample',seed:35}),nonUI=new Set<string>();
 for(let i=0;i<32;i++){
  const plain=baseline.select('e1',distribution,candidates);
  const on=onSampler.select('e1',distribution,candidates,{},apply(proposed(weights),{...config,applyWeights:true}).appliedWeights,'ui-conditional');
  const off=offSampler.select('e1',distribution,candidates,{},apply(proposed(weights),{...config,applyWeights:false}).appliedWeights,'ui-conditional');
  assert.equal(off.selected,plain.selected);assert.equal(on.draw,off.draw);
  if(['wait','abandon'].includes(plain.selected)){nonUI.add(plain.selected);assert.equal(on.selected,plain.selected);assert.equal(on.policy!.scope!.baselineClass,'non-ui');}
 }
 assert.deepEqual([...nonUI].sort(),['abandon','wait']);
});

// Catches changing legacy application or introducing needless normalization of all-ones proposals.
test('legacy, explicit ON, no-deferral and all-ones proposals retain their actual sampler behavior',()=>{
 const decision=deferral.deferralDecision(undefined,current,candidates,assessment,raw,config);
 assert.equal(decision.reason,'NO_DEFERRED_CANDIDATE');
 for(const value of [config,{...config,applyWeights:true},{...config,applyWeights:false}]){
  const application=apply(decision,value);
  assert.deepEqual(application.proposedWeights,{e1:1,e2:1,wait:1,abandon:1});assert.deepEqual(application.appliedWeights,application.proposedWeights);
  const result=createSampler({mode:'sample',seed:35}).select('e2',raw,candidates,{},application.appliedWeights);
  const baseline=createSampler({mode:'sample',seed:35}).select('e2',raw,candidates);
  assert.equal(result.selected,baseline.selected);assert.deepEqual(result.filtered,baseline.filtered);assert.equal(result.draw,baseline.draw);
 }
 const weighted=proposed({e1:0.01,e2:1});assert.deepEqual(apply(weighted,config).appliedWeights,{e1:0.01,e2:1});
 assert.deepEqual(deferral.copyDeferrals(memory,{...config,enabled:false}),{schemaVersion:1,entries:[]});
});

// Catches leaking input/output aliases or normalizing a multiplier record as probabilities.
test('proposed and applied maps preserve multipliers and never alias decision or each other',()=>{
 for(const applyWeights of [true,false]){
  const decision=proposed(Object.freeze({e1:0.01,e2:0.7})),application=apply(decision,{...config,applyWeights});
  assert.deepEqual(application.proposedWeights,{e1:0.01,e2:0.7});assert.notEqual(application.proposedWeights,decision.weights);assert.notEqual(application.appliedWeights,decision.weights);assert.notEqual(application.appliedWeights,application.proposedWeights);
  application.proposedWeights.e1=0.5;assert.equal(decision.weights.e1,0.01);assert.equal(application.appliedWeights.e1,applyWeights?0.01:1);
  application.appliedWeights.e2=0.3;assert.equal(decision.weights.e2,0.7);assert.equal(application.proposedWeights.e2,0.7);
 }
});

// Catches OFF silently accepting malformed proposals that ON would reject.
test('both modes reject empty, nonplain, inherited, hidden, symbol and nonpositive weight values',()=>{
 const hidden=Object.defineProperty({e1:1},'hidden',{value:1}),symbol=Object.assign({e1:1},{[Symbol('hidden')]:1});
 const bad:unknown[]=[undefined,null,[],{},new Map([['e1',1]]),new (class Weights{e1=1})(),Object.create({e1:1}),Object.assign(Object.create({inherited:1}),{e1:1}),hidden,symbol,...[0,-1,NaN,Infinity,-Infinity,1.1,'1',true,null,undefined].map(e1=>({e1}))];
 for(const applyWeights of [true,false])for(const weights of bad)assert.throws(()=>apply(proposed(weights as Record<string,number>),{...config,applyWeights}));
 const nullPrototype=Object.assign(Object.create(null),{e1:0.1,e2:1});assert.deepEqual(apply(proposed(nullPrototype),config).appliedWeights,{e1:0.1,e2:1});
});

// Catches getters being executed as data while validating a saved application.
test('accessor weight records, decision weight accessors and flag getters are rejected without invocation',()=>{
 let reads=0;const getter={get(){reads++;throw new Error('GETTER_EXECUTED');},enumerable:true};
 const weights=Object.defineProperty({e2:1},'e1',getter);
 const decision=Object.defineProperty(proposed({e1:1}),'weights',getter);
 const badConfig=Object.defineProperty({...config},'applyWeights',getter);
 for(const applyWeights of [true,false]){
  assert.throws(()=>apply(proposed(weights),{...config,applyWeights}));assert.throws(()=>apply(decision,{...config,applyWeights}));
 }
 assert.throws(()=>apply(proposed({e1:1}),badConfig));assert.throws(()=>deferral.copyDeferrals(undefined,badConfig));assert.equal(reads,0);
});

// Catches invalid flags and application without enabled deferral bypassing validation.
test('flag must be boolean and any defined application mode requires enabled deferral',()=>{
 for(const applyWeights of [null,0,1,'false',[],{}]){
  const badConfig={...config,applyWeights} as DeferralConfig;
  assert.throws(()=>apply(proposed({e1:1}),badConfig));assert.throws(()=>deferral.copyDeferrals(undefined,badConfig));
 }
 for(const applyWeights of [false,true]){
  const badConfig={...config,enabled:false,applyWeights};
  assert.throws(()=>apply(proposed({e1:1}),badConfig));assert.throws(()=>deferral.copyDeferrals(undefined,badConfig));
 }
 assert.equal(apply(proposed({e1:1}),{...config,applyWeights:undefined}).mode,'apply');
 const inherited=Object.assign(Object.create({applyWeights:false}),config);assert.throws(()=>apply(proposed({e1:1}),inherited));
});