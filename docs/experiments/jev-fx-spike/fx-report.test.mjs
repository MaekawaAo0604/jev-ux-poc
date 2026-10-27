import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as report from './fx-report.mjs';
test('USD/JPY report labels JPY profit and USD exposure, distinguishes blocked buys, and discloses hypothetical fills',()=>{
 assert.equal(typeof report.renderFxReport,'function');
 const a={completedDecisions:2,actions:{buy:0,sell:0,keep:2},rawActions:{buy:1,sell:0,keep:1},blockedBuysAtDecision:1,blockedBuysAtExecution:0,fills:[],netLiquidationPnLJPY:0,paidFeesJPY:0,maxDrawdownJPY:0,usd:0,status:'active'};
 const html=report.renderFxReport({comparisonComplete:false,status:'<bad>',startedAt:'2026-09-24T00:00:00Z',elapsedMs:600000,config:{initialJPY:150000,tradeQuantityUSD:100,feeRate:.00002,slippageAbsolute:.001},accounts:{jev:a,rule:a,ruleFiltered:a},metrics:{updates:2},failures:[],curves:[{receivedMs:1,jev:0,rule:-1,ruleFiltered:0},{receivedMs:2,jev:0,rule:-2,ruleFiltered:0}]});
 assert.match(html,/USD\/JPY/);assert.match(html,/損益（円）/);assert.match(html,/仮定/);assert.match(html,/未完了/);assert.match(html,/元の買い判断/);assert.match(html,/&lt;bad&gt;/);
 assert.doesNotMatch(html,/BTC|損益 USD|<bad>/);assert.match(html,/<polyline/);
});
test('disabled gate report does not claim Jev is filtered or present missing gate statistics as measurements',()=>{
 const a={completedDecisions:1,actions:{buy:1,sell:0,keep:0},rawActions:{buy:1,sell:0,keep:0},fills:[],netLiquidationPnLJPY:0,paidFeesJPY:0,maxDrawdownJPY:0,usd:0};
 const html=report.renderFxReport({comparisonComplete:true,status:'COMPLETE',startedAt:'now',elapsedMs:1000,config:{costFilterEnabled:false,initialJPY:150000,tradeQuantityUSD:100,feeRate:.00002,slippageAbsolute:.001},accounts:{jev:a,rule:a,buyHold:a},metrics:{updates:2},failures:[],curves:[]});
 assert.match(html,/購入制限なし/);assert.doesNotMatch(html,/Jev＋費用フィルター|購入条件通過率|購入時と約定前/);
 assert.match(html,/0.002/);assert.match(html,/0.001/);
});
