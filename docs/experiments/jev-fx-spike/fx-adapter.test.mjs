import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as fx from './fx-adapter.mjs';
const cfg={initialJPY:150000,tradeQuantityUSD:100,feeRate:.00002,slippageBps:0,slippageAbsolute:.001,costFilterEnabled:true};
const rules={symbol:'USD_JPY',minOpenOrderSize:'100',maxOrderSize:'500000',sizeStep:'1',tickSize:'.001'};
const message={symbol:'USD_JPY',bid:'150.000',ask:'150.005',timestamp:'2026-09-24T05:00:00.000Z',status:'OPEN'};
const now=Date.parse(message.timestamp);
const answer=choice=>({answers:{action:{choice,probabilities:{buy:choice==='buy'?1:0,sell:choice==='sell'?1:0,keep:choice==='keep'?1:0}}},usage:{inputTokens:1,outputTokens:1},response:{modelId:'test'}});

test('FX parser validates an open current USD/JPY bid/ask and labels unpublished depth as an assumption',()=>{
 assert.equal(typeof fx.parseFxTicker,'function');
 const q=fx.parseFxTicker(message,1,now+100,cfg);
 assert.equal(q.bid,150);assert.equal(q.ask,150.005);assert.equal(q.symbol,'USD/JPY');assert.equal(q.sourceMs,now);
 assert.equal(q.depthObserved,false);assert.equal(q.bidQty,100);assert.equal(q.askQty,100);
 for(const bad of [{status:'CLOSE'},{symbol:'EUR_JPY'},{bid:'151'},{ask:'abc'},{timestamp:'bad'}])assert.throws(()=>fx.parseFxTicker({...message,...bad},1,now,cfg));
 assert.throws(()=>fx.parseFxTicker(message,1,now+6000,cfg),/STALE/);
 assert.throws(()=>fx.parseFxTicker(message,1,now-2000,cfg),/FUTURE/);
});

test('FX simulator enforces published quantity limits and never permits a fractional below-minimum order',()=>{
 assert.equal(typeof fx.FxComparison,'function');
 for(const bad of [{tradeQuantityUSD:99},{tradeQuantityUSD:100.5},{tradeQuantityUSD:500001}])assert.throws(()=>new fx.FxComparison({...cfg,...bad},rules,{infer:async()=>answer('keep')}));
 assert.throws(()=>new fx.FxComparison(cfg,{...rules,symbol:'EUR_JPY'},{infer:async()=>answer('keep')}));
});

test('FX adapter reuses independent lanes but sends and saves JPY cash and USD holdings, never BTC units',async()=>{
 assert.equal(typeof fx.FxComparison,'function');
 const states=[],events=[];
 const c=new fx.FxComparison(cfg,rules,{clock:()=>0,infer:async state=>{states.push(state);return answer(state.account.holdingUSD?'sell':state.market.latestMid>150.02?'buy':'keep');},onEvent:e=>events.push(structuredClone(e))});
 const observe=(seq,time,bid)=>c.observe(fx.parseFxTicker({...message,bid:bid.toFixed(3),ask:(bid+.005).toFixed(3),timestamp:new Date(time).toISOString()},seq,time,cfg));
 observe(1,now,150);await c.idle();observe(2,now+5000,150.03);await new Promise(r=>setImmediate(r));observe(3,now+5001,150.03);await new Promise(r=>setImmediate(r));
 observe(4,now+6000,150.01);await new Promise(r=>setImmediate(r));c.stop();await c.idle();
 assert.equal(states[0].account.cashJPY,150000);assert.equal(states[0].execution.buyQuantityUSD,100);
 assert.equal(states[0].execution.adverseSlippageJPYPerUSDPerSide,.001);
 assert.equal(states[0].market.depthObserved,false);assert.equal(states[0].market.topBookImbalance,undefined);
 const a=c.summary().jev;assert.equal(a.fills.length,2);assert.equal(a.usd,0);assert.ok(a.netLiquidationPnLJPY<0);assert.equal(a.fills[0].quantity,100);
 const text=JSON.stringify({events,states,summary:c.summary()});assert.doesNotMatch(text,/holdingBTC|cashUSD|feeUSD|PnLUSD|"btc"|buyNotionalUSD/);
 assert.deepEqual(events.find(e=>e.type==='decision-start'&&e.strategy==='jev').state,states[0]);
});

test('disabled entry gate admits a Jev buy on falling prices while charging both fees and keeping execution safeguards',async()=>{
 assert.equal(typeof fx.fxQuestions,'function');
 const questions=fx.fxQuestions(false);assert.doesNotMatch(JSON.stringify(questions),/gate|5s|5-second/);
 assert.match(questions.action.instructions,/costs/);assert.match(questions.action.instructions,/No leverage, shorts/);
 const states=[],config={...cfg,costFilterEnabled:false};let time=now;
 const c=new fx.FxComparison(config,rules,{clock:()=>time,infer:async state=>{states.push(state);return answer(state.account.holdingUSD?'sell':'buy');}});
 const observe=async(seq,bid)=>{time=now+seq*1000;c.observe(fx.parseFxTicker({...message,bid:bid.toFixed(3),ask:(bid+.005).toFixed(3),timestamp:new Date(time).toISOString()},seq,time,config));await new Promise(r=>setImmediate(r));};
 await observe(1,150);assert.equal(c.summary().jev.fills.length,0,'must wait for a later quote');
 await observe(2,149.99);await observe(3,149.98);c.stop();await c.idle();
 const a=c.summary().jev;assert.equal(a.fills.length,2);assert.ok(Math.abs(a.fills[0].price-149.996)<1e-9);assert.equal(a.fills[0].quantity,100);assert.ok(Math.abs(a.fills[1].price-149.979)<1e-9);
 assert.ok(Math.abs(a.paidFeesJPY-.59995)<1e-8);assert.ok(Math.abs(a.netLiquidationPnLJPY-(-2.29995))<1e-7);
 assert.equal(a.usd,0);assert.equal(states[0].execution.entryCostFilter,undefined);assert.equal(states[0].execution.feeBpsPerSide,.2);assert.equal(states[0].execution.noShortSelling,true);
});
