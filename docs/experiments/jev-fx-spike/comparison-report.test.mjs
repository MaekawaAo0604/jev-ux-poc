import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as report from './live-report.mjs';

const filteredResult=()=>({status:'MEASUREMENT_WINDOW_COMPLETE',comparisonComplete:true,createdAt:'2026-09-24T00:10:00Z',startedAt:'2026-09-24T00:00:00Z',config:{costFilterEnabled:true,measurementSeconds:600,initialUSD:1000,tradeUSD:100,feeRate:.008,slippageBps:1,feeSource:'https://example.com/fees'},metrics:{updates:2,maxConcurrentRequests:1},accounts:{ruleFiltered:{status:'active',completedDecisions:2,rawActions:{buy:2,sell:0,keep:0},actions:{buy:0,sell:0,keep:2},blockedBuysAtDecision:2,blockedBuysAtExecution:0,fills:[],paidFeesUSD:0,netLiquidationPnLUSD:0,maxDrawdownUSD:0}},curves:[],failures:[],source:'https://example.com/'});

test('filtered report distinguishes proposed choices from effective actions and does not describe historical rises as forecasts',()=>{
 const html=report.renderComparisonReport(filteredResult());
 assert.match(html,/固定ルール（費用フィルター付き）/);
 assert.match(html,/元の判断/);assert.match(html,/判断時の購入見送り/);assert.match(html,/約定前の購入見送り/);
 assert.match(html,/将来の値上がり予測ではありません/);assert.match(html,/損失中の売却も止めません/);
 assert.doesNotMatch(html,/undefined/);
});

test('comparison chart handles a high-update run without spreading the full data into function arguments',()=>{
 const r=filteredResult();r.curves=Array.from({length:40000},(_,seq)=>({seq,receivedMs:seq,jev:0,rule:-seq/1000,ruleFiltered:0,buyHold:-1}));
 const html=report.renderComparisonReport(r);
 assert.match(html,/<polyline/);assert.match(html,/固定ルール（費用フィルター付き）/);
});

test('comparison report exposes incomplete runs and unknown AI costs without treating them as zero',()=>{
 assert.equal(typeof report.renderComparisonReport,'function');
 const html=report.renderComparisonReport({status:'FEED_DISCONNECTED',comparisonComplete:false,createdAt:'2026-09-24T00:00:00Z',startedAt:'2026-09-24T00:00:00Z',config:{measurementSeconds:600,initialUSD:1000,tradeUSD:100,feeRate:.008,slippageBps:1,feeSource:'https://example.com/fees'},metrics:{updates:0,inputTokensOnCompletedCalls:null,maxConcurrentRequests:0},accounts:null,curves:[],failures:[],source:'https://example.com/'});
 assert.match(html,/未完了/);assert.match(html,/AI利用料は未確定/);assert.doesNotMatch(html,/<polyline/);
});

test('comparison report renders measured lane results, units and safely escapes external status',()=>{
 assert.equal(typeof report.renderComparisonReport,'function');
 const lane={status:'active',completedDecisions:2,actions:{buy:1,sell:0,keep:1},fills:[{}],paidFeesUSD:.8,netLiquidationPnLUSD:-1.63,maxDrawdownUSD:1.8,maxDrawdownPct:.18,latencyMs:{p50:.25,p95:.5}};
 const html=report.renderComparisonReport({status:'<img src=x>',comparisonComplete:true,createdAt:'2026-09-24T00:10:00Z',startedAt:'2026-09-24T00:00:00Z',config:{measurementSeconds:600,initialUSD:1000,tradeUSD:100,feeRate:.008,slippageBps:1,feeSource:'https://example.com/fees'},metrics:{updates:2,inputTokensOnCompletedCalls:24,maxConcurrentRequests:1},accounts:{rule:lane},curves:[{receivedMs:1000,rule:0},{receivedMs:2000,rule:-1.63}],failures:[],source:'https://example.com/'});
 assert.match(html,/-1\.63/);assert.match(html,/USD/);assert.match(html,/経過時間/);
 assert.match(html,/&lt;img src=x&gt;/);assert.doesNotMatch(html,/<img src=x>/);
 assert.match(html,/<polyline/);
});
