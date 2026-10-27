import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as core from './live-core.mjs';

const config={initialUSD:1000,tradeUSD:100,feeRate:.008,slippageBps:1,costFilterEnabled:true};
const q=(seq,receivedMs,price=100)=>({seq,receivedMs,sourceMs:receivedMs-1,symbol:'BTC/USD',bid:price,ask:price,bidQty:100,askQty:100});
const features=returnBps=>({windows:[{windowMs:5000,returnBps,coverageMs:5000,complete:true}]});
const answer=choice=>({answers:{action:{choice,probabilities:{buy:choice==='buy'?1:0,sell:choice==='sell'?1:0,keep:choice==='keep'?1:0}}},usage:{inputTokens:12,outputTokens:1},response:{modelId:'test-model'}});
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('entry cost combines spread, both fees and adverse slippage without pretending to forecast a return',()=>{
 assert.equal(typeof core.entryCostSnapshot,'function');
 const c=core.entryCostSnapshot(q(1,1000),features(100),config);
 assert.ok(Math.abs(c.breakEvenExitBid-101.63322783891293)<1e-10);
 assert.ok(Math.abs(c.requiredRiseBps-163.32278389129318)<1e-8);
 assert.equal(c.observedRiseBps,100);assert.equal(c.allowed,false);assert.equal(c.quoteSeq,1);
 const spread=core.entryCostSnapshot({...q(1,1000),bid:99,ask:101},features(300),{...config,feeRate:0,slippageBps:0});
 assert.equal(spread.breakEvenExitBid,101);assert.ok(Math.abs(spread.requiredRiseBps-202.020202020202)<1e-8);
 assert.equal(spread.allowed,true);
});

test('entry filter rejects exactly break-even and missing evidence, but permits strictly larger past rises',()=>{
 assert.equal(typeof core.entryCostSnapshot,'function');
 const quote={...q(1,1000),ask:125},noFees={...config,feeRate:0,slippageBps:0};
 for(const [rise,allowed] of [[2500,false],[2499,false],[2500.001,true],[-1,false]])assert.equal(core.entryCostSnapshot(quote,features(rise),noFees).allowed,allowed);
 assert.equal(core.entryCostSnapshot(quote,{windows:[]},noFees).allowed,false);
 assert.equal(core.entryCostSnapshot(quote,features(NaN),noFees).observedRiseBps,null);
 assert.throws(()=>core.entryCostSnapshot({...quote,bid:0},features(3000),config));
});

test('rule and Jev block small-move buys while original rule remains an independent unchanged control',async()=>{
 const states=[];
 const c=new core.IndependentPaperComparison(config,{infer:async state=>{states.push(state);return answer('buy');},clock:()=>0});
 assert.ok(c.lanes.ruleFiltered,'filtered control lane must exist');
 c.observe(q(1,1000));await c.idle();c.observe(q(2,6000,101));await c.idle();c.observe(q(3,6001,101));await c.idle();
 assert.equal(c.lanes.rule.account.fills.length,1);assert.equal(c.lanes.ruleFiltered.account.fills.length,0);assert.equal(c.lanes.jev.account.fills.length,0);
 assert.equal(states[1].execution.entryCostFilter.allowed,false);
 assert.ok(states[1].execution.entryCostFilter.breakEvenExitBid>102);
 const record=c.lanes.jev.decisions[1];assert.equal(record.rawAction,'buy');assert.equal(record.action,'keep');assert.equal(record.answer.choice,'buy');assert.equal(record.costGate.blocked,true);
 const s=c.summary();assert.equal(s.jev.rawActions.buy,3);assert.equal(s.jev.actions.buy,0);assert.equal(s.jev.blockedBuysAtDecision,3);assert.equal(s.ruleFiltered.blockedBuysAtDecision,2);
 c.stop();await c.idle();
});

test('both gated lanes can buy above cost and can sell at a loss without a profit-only exit restriction',async()=>{
 const c=new core.IndependentPaperComparison(config,{infer:async state=>answer(state.account.holdingBTC?'sell':state.market.latestMid>=110?'buy':'keep'),clock:()=>0});
 assert.ok(c.lanes.ruleFiltered);
 c.observe(q(1,1000));await c.idle();c.observe(q(2,6000,110));await tick();c.observe(q(3,6001,110));await tick();
 assert.equal(c.lanes.jev.account.fills[0]?.action,'buy');assert.equal(c.lanes.ruleFiltered.account.fills[0]?.action,'buy');
 c.observe(q(4,11000,90));await tick();c.observe(q(5,11001,89));await tick();
 for(const name of ['jev','ruleFiltered']){
  assert.deepEqual(c.lanes[name].account.fills.map(f=>f.action),['buy','sell']);
  assert.ok(c.summary()[name].netLiquidationPnLUSD<0);assert.equal(c.lanes[name].account.btc,0);
  assert.equal(c.lanes[name].decisions.find(d=>d.rawAction==='sell').costGate.blocked,false);
 }
 c.stop();await c.idle();
});

test('a stale Jev buy is filtered using the latest observed price, not its earlier favorable input',async()=>{
 let release;
 const c=new core.IndependentPaperComparison(config,{infer:state=>state.market.latestMid===100?Promise.resolve(answer('keep')):new Promise(r=>release=r),clock:()=>0});
 assert.ok(c.lanes.ruleFiltered);
 c.observe(q(1,1000));await c.idle();c.observe(q(2,6000,110));await tick();
 c.observe(q(3,6001,100.1));release(answer('buy'));await tick();
 const d=c.lanes.jev.decisions.find(d=>d.inputSeq===2);
 assert.equal(d.rawAction,'buy');assert.equal(d.action,'keep');assert.equal(d.costGate.quoteSeq,3);
 assert.equal(c.lanes.jev.account.fills.length,0);
 c.stop();release(answer('keep'));await c.idle();
});

test('a buy passing the decision gate is rechecked on its future execution quote',async()=>{
 const c=new core.IndependentPaperComparison(config,{infer:async state=>answer(state.market.latestMid>=110?'buy':'keep'),clock:()=>0});
 assert.ok(c.lanes.ruleFiltered);
 c.observe(q(1,1000));await c.idle();c.observe(q(2,6000,110));await tick();
 assert.equal(c.lanes.jev.pending?.record.action,'buy');
 c.observe(q(3,6001,100.1));await c.idle();
 for(const name of ['jev','ruleFiltered']){
  const d=c.lanes[name].decisions.find(d=>d.action==='buy');
  assert.equal(d.execution.status,'blocked_by_cost_filter');assert.equal(d.execution.costGate.quoteSeq,3);
  assert.equal(c.lanes[name].account.fills.length,0);assert.equal(c.summary()[name].blockedBuysAtExecution,1);
 }
 c.stop();await c.idle();
});

test('filtered comparison cannot be complete when its filtered rule is absent or failed',()=>{
 const input={stopReason:'MEASUREMENT_WINDOW_COMPLETE',updates:2,logComplete:true,costFilterEnabled:true,accounts:Object.fromEntries(['jev','rule','buyHold'].map(k=>[k,{status:'active',completedDecisions:1}]))};
 assert.equal(core.comparisonIsComplete(input),false);
 input.accounts.ruleFiltered={status:'active',completedDecisions:2};assert.equal(core.comparisonIsComplete(input),true);
 input.accounts.ruleFiltered.status='stopped_after_error';assert.equal(core.comparisonIsComplete(input),false);
});
