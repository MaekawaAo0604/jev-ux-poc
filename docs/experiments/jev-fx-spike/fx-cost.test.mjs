import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PaperAccount,entryCostSnapshot} from './live-core.mjs';
const config={initialUSD:150000,tradeUSD:15000,tradeBaseQuantity:100,feeRate:.00002,slippageBps:0,slippageAbsolute:.001};
const q=(seq,bid,ask)=>({seq,receivedMs:seq*1000,bid,ask,bidQty:100,askQty:100});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);

test('fixed base quantity and absolute FX slippage charge both API order fees and never inherit BTC cost',()=>{
 const a=new PaperAccount(config);
 const buy=a.execute('buy',{decisionId:1,afterSeq:1,completedMs:1000},q(2,150,150.005));
 assert.equal(buy.status,'filled');assert.equal(buy.fill.quantity,100);near(buy.fill.price,150.006);near(buy.fill.feeUSD,.300012);
 const sell=a.execute('sell',{decisionId:2,afterSeq:2,completedMs:2000},q(3,150.02,150.025));
 assert.equal(sell.status,'filled');near(sell.fill.price,150.019);near(sell.fill.feeUSD,.300038);
 near(a.cashUSD-150000,.69995);
});

test('FX break-even gate includes absolute slippage and agrees with actual round-trip accounting',()=>{
 const a=new PaperAccount(config),quote=q(1,150,150.005);
 const gate=entryCostSnapshot(quote,{windows:[{windowMs:5000,returnBps:1,coverageMs:5000,complete:true}]},config);
 near(gate.breakEvenExitBid,150.0130003600072);near(gate.requiredRiseBps,.8666906671472852);
 a.execute('buy',{decisionId:1,afterSeq:1,completedMs:1000},{...quote,seq:2,receivedMs:2000});
 near(a.mark(quote).netLiquidationPnLUSD,-1.30001);
 a.execute('sell',{decisionId:2,afterSeq:2,completedMs:2000},q(3,gate.breakEvenExitBid,gate.breakEvenExitBid+.005));
 near(a.cashUSD,150000);
});

test('invalid fixed quantity or absolute slippage is rejected instead of corrupting an account',()=>{
 for(const bad of [{tradeBaseQuantity:0},{tradeBaseQuantity:NaN},{slippageAbsolute:-1},{slippageAbsolute:NaN}])assert.throws(()=>new PaperAccount({...config,...bad}));
});
