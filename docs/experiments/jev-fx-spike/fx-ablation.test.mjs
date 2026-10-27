import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as ablation from './fx-ablation.mjs';
import {fxQuestions} from './fx-adapter.mjs';
const state=(allowed)=>({market:{latestMid:150,windows:[{windowMs:5000,returnBps:-1}]},account:{cashJPY:150000,holdingUSD:0,position:'flat'},execution:{feeBpsPerSide:.2,adverseSlippageJPYPerUSDPerSide:.001,noShortSelling:true,buyQuantityUSD:100,entryCostFilter:{allowed}}});
test('prompt comparison sends identical ungated states and preserves the original control instructions',()=>{
 assert.equal(typeof ablation.comparisonDefinition,'function');
 const comparison=ablation.comparisonDefinition(true);
 assert.deepEqual(comparison.arms,['legacy','balanced']);
 for(const allowed of [true,false]){
  const original=state(allowed),copy=structuredClone(original),expected=structuredClone(original);delete expected.execution.entryCostFilter;
  const legacy=comparison.payload(original,'legacy'),balanced=comparison.payload(original,'balanced');
  assert.deepEqual(legacy.state,expected);assert.deepEqual(balanced.state,expected);assert.deepEqual(original,copy);
  assert.deepEqual(legacy.questions,fxQuestions(false));assert.notDeepEqual(balanced.questions,legacy.questions);
  assert.deepEqual(Object.keys(balanced).sort(),['questions','state']);
  assert.throws(()=>comparison.payload(original,'unknown'),/INVALID_PROMPT_ARM/);
 }
});
test('matched replay changes only the gate input and gate instructions, preserving market, cash and all transaction costs',()=>{
 assert.equal(typeof ablation.payloadForArm,'function');const original=state(false),copy=structuredClone(original);
 const on=ablation.payloadForArm(original,true),off=ablation.payloadForArm(original,false);
 assert.deepEqual(on.state,copy);assert.deepEqual(original,copy);assert.deepEqual(off.state.market,copy.market);assert.deepEqual(off.state.account,copy.account);
 const expected=structuredClone(copy.execution);delete expected.entryCostFilter;assert.deepEqual(off.state.execution,expected);
 assert.doesNotMatch(JSON.stringify(off.questions),/gate/);assert.match(JSON.stringify(on.questions),/gate/);
 assert.deepEqual(Object.keys(off).sort(),['questions','state']);
});
test('sampling is deterministic across the window and adds eligible inputs without using later outcomes',()=>{
 assert.equal(typeof ablation.selectReplayInputs,'function');const starts=Array.from({length:7},(_,i)=>({type:'decision-start',strategy:'jev',id:i+1,state:state(i===1)}));
 const selected=ablation.selectReplayInputs(starts,3);
 assert.deepEqual(selected.map(s=>s.id),[1,2,4,7]);
 assert.throws(()=>ablation.selectReplayInputs(starts,0));
 const poisoned=[...starts,{type:'decision-complete',strategy:'jev',id:99,netProfit:999999},{type:'quote',seq:999,ask:999999}];
 assert.deepEqual(ablation.selectReplayInputs(poisoned,3),selected);
});
