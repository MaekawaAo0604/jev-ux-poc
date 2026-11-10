import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as core from './live-core.mjs';

const config={initialUSD:1000,tradeUSD:100,feeRate:.01,slippageBps:0};
const quote=(seq,receivedMs,bid=99,ask=101)=>({seq,receivedMs,sourceMs:receivedMs-10,symbol:'BTC/USD',bid,ask,bidQty:10,askQty:10});
const answer=choice=>({answers:{action:{choice,probabilities:{buy:choice==='buy'?1:0,sell:choice==='sell'?1:0,keep:choice==='keep'?1:0}}},usage:{inputTokens:12,outputTokens:1},response:{modelId:'test-model'}});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('timer expiry alone cannot label a comparison complete without quotes, both judgments and intact logs',()=>{
 assert.equal(typeof core.comparisonIsComplete,'function');
 const ok={stopReason:'MEASUREMENT_WINDOW_COMPLETE',updates:2,logComplete:true,accounts:{jev:{status:'active',completedDecisions:1},rule:{status:'active',completedDecisions:2},buyHold:{status:'active',completedDecisions:1}}};
 assert.equal(core.comparisonIsComplete(ok),true);
 for(const patch of [{updates:0},{logComplete:false},{accounts:null},{stopReason:'FEED_DISCONNECTED'},{accounts:{...ok.accounts,jev:{status:'active',completedDecisions:0}}},{accounts:{...ok.accounts,jev:{status:'stopped_after_error',completedDecisions:1}}}])assert.equal(core.comparisonIsComplete({...ok,...patch}),false);
});
function make(infer,extra={}){
 assert.equal(typeof core.IndependentPaperComparison,'function','independent comparison scheduler must exist');
 return new core.IndependentPaperComparison(config,{infer,clock:()=>0,onJevError:async()=>false,...extra});
}

test('fixed rule buys and sells while the first Jev request is still unresolved',async()=>{
 let release;const events=[];
 const c=make(()=>new Promise(r=>release=r),{onEvent:e=>events.push(e)});
 c.observe(quote(1,1000));await tick();
 c.observe(quote(2,6000,109,111)); // past return > 0: rule decides buy
 assert.equal(c.lanes.rule.account.fills.length,0); // no same-quote fill
 c.observe(quote(3,6001,109,111));
 c.observe(quote(4,11000,89,91)); // past return < 0: rule decides sell
 c.observe(quote(5,11001,89,91));
 assert.deepEqual(c.lanes.rule.account.fills.map(f=>[f.action,f.quoteSeq]),[['buy',3],['sell',5]]);
 assert.equal(c.lanes.jev.decisions.length,0);
 assert.equal(c.lanes.jev.starts.length,1);
 assert.equal(c.lanes.buyHold.account.fills.length,1);
 assert.equal(c.lanes.rule.decisions.length,5);
 const complete=events.findIndex(e=>e.type==='decision-complete'&&e.strategy==='rule'&&e.action==='buy');
 const executed=events.findIndex(e=>e.type==='decision-execution'&&e.strategy==='rule'&&e.result.status==='filled');
 assert.ok(complete>=0&&executed>complete);
 c.stop();release(answer('keep'));await c.idle();
});

test('fatal Jev failure disables only Jev; prices, rules and buy-hold continue',async()=>{
 const c=make(async()=>{throw Object.assign(new Error('test failure'),{statusCode:401});});
 c.observe(quote(1,1000));await c.idle();
 assert.equal(c.lanes.jev.status,'stopped_after_error');
 c.observe(quote(2,6000,109,111));c.observe(quote(3,6001,109,111));
 assert.equal(c.lanes.rule.account.fills.length,1);
 assert.equal(c.lanes.buyHold.account.fills.length,1);
 assert.equal(c.latest.seq,3);assert.equal(c.lanes.jev.starts.length,1);
 c.stop();await c.idle();
});

test('Jev keep does not wait for a future fill quote; the newest pending state runs next',async()=>{
 const pending=[];const states=[];
 const c=make(state=>{states.push(state);return new Promise(r=>pending.push(r));});
 c.observe(quote(1,1000));await tick();
 c.observe(quote(2,1100,100,102));c.observe(quote(3,1200,101,103));
 pending.shift()(answer('keep'));await tick();
 assert.equal(c.lanes.jev.decisions.length,1);
 assert.equal(c.lanes.jev.starts.length,2);
 assert.equal(states[1].market.latestMid,102);
 assert.equal(c.maxActiveRequests,1);
 assert.equal(c.lanes.jev.decisions[0].execution.status,'kept');
 c.stop();pending.shift()(answer('buy'));await c.idle();
 assert.equal(c.lanes.jev.account.fills.length,0);
});

test('Jev fill uses a quote strictly after response and cancellation cannot create a fill',async()=>{
 let release;const c=make(()=>new Promise(r=>release=r));
 c.observe(quote(1,1000));await tick();c.observe(quote(2,1200));
 release(answer('buy'));await tick();
 assert.equal(c.lanes.jev.account.fills.length,0);
 assert.equal(c.lanes.jev.pending.record.afterSeq,2);
 c.observe(quote(3,1300,199,201));await tick();
 assert.equal(c.lanes.jev.account.fills[0].price,201);
 assert.equal(c.lanes.jev.account.fills[0].quoteSeq,3);
 c.stop();release(answer('sell'));await c.idle();
 assert.equal(c.lanes.jev.account.fills.length,1);
});

test('recovery waits do not block the rule and never replay an old model input',async()=>{
 let recover;const seen=[];
 const c=make(async state=>{seen.push(state.market.latestMid);if(seen.length===1)throw Error('transient');return answer('keep');},{onJevError:()=>new Promise(r=>recover=r)});
 c.observe(quote(1,1000));await tick();
 c.observe(quote(2,6000,109,111));c.observe(quote(3,6001,110,112));
 assert.equal(c.lanes.rule.account.fills.length,1);
 recover(true);await c.idle();
 assert.deepEqual(seen,[100,111]);
 assert.equal(c.lanes.jev.status,'active');c.stop();
});

test('each lane reports own decisions, costs and peak-to-trough drawdown, including unrealized exposure',async()=>{
 const c=make(async()=>answer('keep'));
 c.observe(quote(1,1000,99,100));await c.idle();
 c.observe(quote(2,6000,109,110));await c.idle();
 c.observe(quote(3,6001,99,100));await c.idle(); // rule buys 1 BTC, cash 899, liquidation 98.01 => 997.01
 const stats=c.summary();
 assert.equal(stats.rule.fills.length,1);assert.equal(stats.rule.paidFeesUSD,1);
 assert.ok(Math.abs(stats.rule.netLiquidationPnLUSD-(-2.99))<1e-8);
 assert.ok(Math.abs(stats.rule.maxDrawdownUSD-2.99)<1e-8);
 assert.ok(Math.abs(stats.rule.maxDrawdownPct-.299)<1e-8);
 assert.equal(stats.jev.netLiquidationPnLUSD,0);assert.equal(stats.jev.actions.keep,3);
 assert.equal(stats.cash.netLiquidationPnLUSD,0);
 c.stop();await c.idle();
});

test('a stop resolves pending paper actions as cancelled and rejects subsequent observations',async()=>{
 const c=make(async()=>answer('buy'));
 c.observe(quote(1,1000));await tick();c.stop();await c.idle();
 assert.equal(c.lanes.jev.decisions[0].execution.status,'cancelled_at_stop');
 c.observe(quote(2,2000));
 assert.equal(c.latest.seq,1);assert.equal(c.lanes.buyHold.account.fills.length,0);
});
