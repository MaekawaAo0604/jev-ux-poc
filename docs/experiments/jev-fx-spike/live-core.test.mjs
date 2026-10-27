import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseTicker,marketFeatures,actionChoice,PaperAccount,LatestOnly} from './live-core.mjs';
const quote=(seq,receivedMs,bid=100,ask=101)=>({seq,receivedMs,sourceMs:receivedMs-100,symbol:'BTC/USD',bid,ask,bidQty:10,askQty:10});

test('ticker parser preserves executable sides and rejects crossed, malformed, or wrong-symbol prices',()=>{
 const m={channel:'ticker',type:'update',data:[{symbol:'BTC/USD',bid:100,ask:101,bid_qty:2,ask_qty:3,timestamp:'2026-09-24T00:00:00Z'}]};
 assert.deepEqual(parseTicker(m,5,1000),{seq:5,receivedMs:1000,sourceMs:Date.parse('2026-09-24T00:00:00Z'),symbol:'BTC/USD',bid:100,ask:101,bidQty:2,askQty:3});
 assert.equal(parseTicker({channel:'heartbeat'},5,1000),null);
 for(const patch of [{ask:99},{bid:NaN},{symbol:'ETH/USD'},{timestamp:'invalid'},{bid_qty:-1}])assert.throws(()=>parseTicker({...m,data:[{...m.data[0],...patch}]},5,1000));
});
test('rolling features compute past returns and imbalance, without requiring a full warm-up interval',()=>{
 const f=marketFeatures([quote(1,1000,99,101),{...quote(2,2000,100,102),bidQty:3,askQty:1}]);
 assert.equal(f.observedSpanMs,1000);assert.equal(f.latestMid,101);assert.equal(f.topBookImbalance,.5);
 assert.ok(Math.abs(f.windows[0].returnBps-100)<1e-9);assert.equal(f.windows[0].coverageMs,1000);
 assert.equal(f.windows.at(-1).complete,false);assert.equal(f.observations,2);
 assert.throws(()=>marketFeatures([]));
});
test('choice validation accepts buy, sell, keep only and never treats confidence as a return forecast',()=>{
 assert.equal(actionChoice({choice:'keep',probabilities:{buy:.1,sell:.1,keep:.8}}),'keep');
 assert.equal(actionChoice({choice:'buy',probabilities:{buy:.4,sell:.3,keep:.3}}),'buy');
 assert.throws(()=>actionChoice({choice:'sell',probabilities:{sell:1}}));
 assert.throws(()=>actionChoice({choice:'short',probabilities:{buy:0,sell:0,keep:1}}));
});
test('paper buys use the post-decision ask, sells use bid, fees are charged on each side',()=>{
 const a=new PaperAccount({initialUSD:1000,tradeUSD:100,feeRate:.01,slippageBps:0});
 assert.equal(a.execute('buy',{decisionId:1,afterSeq:2,completedMs:2000},quote(2,2001,99,100)).status,'not_after_decision');
 const buy=a.execute('buy',{decisionId:1,afterSeq:2,completedMs:2000},quote(3,2001,99,100));
 assert.equal(buy.status,'filled');assert.equal(buy.fill.price,100);assert.equal(a.cashUSD,899);assert.equal(a.btc,1);
 const sell=a.execute('sell',{decisionId:2,afterSeq:3,completedMs:2100},quote(4,2200,110,111));
 assert.equal(sell.fill.price,110);assert.equal(a.cashUSD,1007.9);assert.equal(a.btc,0);assert.equal(a.feesUSD,2.1);
 assert.ok(Math.abs(a.mark(quote(5,2300,110,111)).netLiquidationPnLUSD-7.9)<1e-9);
});
test('keep preserves exposure; repeated buy cannot pyramid; sell cannot short; insufficient liquidity is not invented',()=>{
 const config={initialUSD:1000,tradeUSD:100,feeRate:0,slippageBps:0};
 const a=new PaperAccount(config),q=quote(2,2000,99,100),d={decisionId:1,afterSeq:1,completedMs:1000};
 assert.equal(a.execute('sell',d,q).status,'no_position');assert.equal(a.btc,0);
 assert.equal(a.execute('buy',d,{...q,askQty:.5}).status,'insufficient_liquidity');
 a.execute('buy',d,q);assert.equal(a.execute('buy',{...d,decisionId:2},q).status,'already_holding');
 assert.equal(a.execute('keep',{...d,decisionId:3},q).status,'kept');assert.equal(a.btc,1);assert.equal(a.fills.length,1);
 assert.equal(a.execute('sell',d,q).status,'duplicate_decision');
 const poor=new PaperAccount({...config,initialUSD:50});assert.equal(poor.execute('buy',d,q).status,'insufficient_cash');
});
test('slippage is adverse and remaining holdings are marked after hypothetical exit fees, not as realized profit',()=>{
 const a=new PaperAccount({initialUSD:1000,tradeUSD:100,feeRate:.01,slippageBps:100});
 a.execute('buy',{decisionId:1,afterSeq:1,completedMs:1000},quote(2,2000,99,100));
 assert.equal(a.fills[0].price,101);assert.equal(a.cashUSD,899);
 const mark=a.mark(quote(3,3000,102,103));
 assert.equal(mark.cashUSD,899);assert.ok(mark.btc>0);
 // 100/101 BTC * 102 bid * 0.99 slippage * 0.99 net fee + 899 cash.
 assert.ok(Math.abs(mark.netLiquidationUSD-(899+(100/101)*102*.99*.99))<1e-8);
});
test('single-flight runs latest pending state immediately after completion, never queues stale intermediate states',async()=>{
 const seen=[],release=[];let active=0,max=0;
 const loop=new LatestOnly(async value=>{seen.push(value);active++;max=Math.max(max,active);await new Promise(r=>release.push(r));active--;},e=>{throw e;});
 loop.offer(1);await new Promise(r=>setImmediate(r));loop.offer(2);loop.offer(3);
 assert.deepEqual(seen,[1]);release.shift()();await new Promise(r=>setImmediate(r));assert.deepEqual(seen,[1,3]);assert.equal(max,1);
 loop.stop();loop.offer(4);release.shift()();await loop.idle();assert.deepEqual(seen,[1,3]);
});
test('single-flight stops after failure instead of silently repeating an old action',async()=>{
 const seen=[],errors=[];const loop=new LatestOnly(async value=>{seen.push(value);throw Error('failure');},error=>errors.push(error.message));
 loop.offer(1);await loop.idle();loop.offer(2);await loop.idle();assert.deepEqual(seen,[1]);assert.deepEqual(errors,['failure']);
});

test('an explicitly recovered transient failure resumes only the newest offered state, never the failed state',async()=>{
 const seen=[];let recover;
 const loop=new LatestOnly(async value=>{seen.push(value);if(value===1)throw Error('transient');},()=>new Promise(r=>{recover=r;}));
 loop.offer(1);await new Promise(r=>setImmediate(r));loop.offer(2);loop.offer(3);assert.deepEqual(seen,[1]);
 recover(true);await loop.idle();assert.deepEqual(seen,[1,3]);
});
