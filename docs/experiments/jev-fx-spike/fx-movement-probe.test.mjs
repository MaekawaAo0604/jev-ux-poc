import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as probe from './fx-movement-probe.mjs';
import {marketFeatures} from './live-core.mjs';
import {fxBalancedQuestions} from './fx-adapter.mjs';

const quotes=[99,99.5,100].map((mid,i)=>({seq:i+1,receivedMs:i*30000,sourceMs:i*30000-100,bid:mid-.01,ask:mid+.01,bidQty:100,askQty:100}));
function original(){const market={...marketFeatures(quotes),symbol:'USD/JPY',priceUnit:'JPY per USD',depthObserved:false};delete market.topBookImbalance;return {market,account:{cashJPY:150000,holdingUSD:0,position:'flat',entryPrice:null},execution:{feeBpsPerSide:.2,adverseSlippageBpsPerSide:0,adverseSlippageJPYPerUSDPerSide:.001,buyQuantityUSD:100,noShortSelling:true,entryCostFilter:{allowed:true}}};}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('amplitude scaling pins the latest quote and changes past midpoints without changing quote times or spreads',()=>{
 assert.equal(typeof probe.scaleHistory,'function');const copy=structuredClone(quotes);
 const doubled=probe.scaleHistory(quotes,2),reversed=probe.scaleHistory(quotes,-1),flat=probe.scaleHistory(quotes,0);
 assert.deepEqual(quotes,copy);assert.deepEqual(doubled.at(-1),quotes.at(-1));assert.deepEqual(probe.scaleHistory(quotes,1),quotes);
 near((doubled[0].bid+doubled[0].ask)/2,98);near((reversed[0].bid+reversed[0].ask)/2,101);
 for(let i=0;i<3;i++){near(doubled[i].ask-doubled[i].bid,.02);near((flat[i].bid+flat[i].ask)/2,100);assert.equal(doubled[i].receivedMs,quotes[i].receivedMs);}
 assert.throws(()=>probe.scaleHistory(quotes,NaN));assert.throws(()=>probe.scaleHistory(quotes,1000));
});
test('model payload recomputes every historical feature while keeping costs, current price, prompt and account fixed',()=>{
 assert.equal(typeof probe.movementPayload,'function');const state=original(),copy=structuredClone(state);
 const payload=probe.movementPayload(state,quotes,2);assert.deepEqual(state,copy);
 assert.deepEqual(payload.account,undefined);assert.deepEqual(payload.state.account,copy.account);
 const execution=structuredClone(copy.execution);delete execution.entryCostFilter;assert.deepEqual(payload.state.execution,execution);
 assert.equal(payload.state.market.latestMid,100);near(payload.state.market.spreadBps,2);
 near(payload.state.market.windows.find(w=>w.windowMs===60000).returnBps,204.08163265306123);
 near(payload.state.market.windows.find(w=>w.windowMs===60000).rangeBps,200);
 near(payload.state.market.recent[0].midRelativeBps,-200);
 assert.equal(payload.state.market.topBookImbalance,undefined);assert.deepEqual(payload.questions,fxBalancedQuestions());
 assert.deepEqual(Object.keys(payload).sort(),['questions','state']);
 state.market.latestMid=999;assert.throws(()=>probe.movementPayload(state,quotes,2),/SOURCE_FEATURE_MISMATCH/);
});
test('source selection uses only mature positive observed moves from the approved sample, never model answers',()=>{
 assert.equal(typeof probe.selectMovementSources,'function');
 const starts=Array.from({length:9},(_,i)=>{const state=original();state.market.windows[1].returnBps=i+1;return {id:i+1,type:'decision-start',strategy:'jev',state};});
 starts[7].state.market.windows[3].complete=false;starts[8].state.market.windows[1].returnBps=-100;
 assert.deepEqual(probe.selectMovementSources(starts,[1,2,3,4,5,6,7,8,9],4).map(s=>s.id),[1,3,5,7]);
 assert.deepEqual(probe.selectMovementSources(starts,[2,3,5,7],4).map(s=>s.id),[2,3,5,7]);
 assert.throws(()=>probe.selectMovementSources(starts,[8,9],4),/INSUFFICIENT_MATURE_POSITIVE_INPUTS/);
});
test('planned repeats cover every source and factor equally without exposing test labels to Jev',()=>{
 assert.equal(typeof probe.buildMovementCases,'function');
 const cases=probe.buildMovementCases([{id:7,state:original(),quotes}]);
 assert.equal(cases.length,24);assert.equal(new Set(cases.map(c=>c.id)).size,24);
 for(const factor of [-4,-1,0,.5,1,2,4,8]){
  const group=cases.filter(c=>c.factor===factor);assert.equal(group.length,3);
  assert.deepEqual(group[0].payload,group[1].payload);assert.deepEqual(group[1].payload,group[2].payload);
  for(const c of group){assert.equal(c.sourceId,7);assert.deepEqual(Object.keys(c.payload).sort(),['questions','state']);}
 }
});
test('summary uses actual model choices, separates missing responses, and never treats reported probability as a trade',()=>{
 assert.equal(typeof probe.summarizeMovement,'function');
 const cases=[{id:'a',factor:1,payload:{state:original()}},{id:'b',factor:1,payload:{state:original()}},{id:'c',factor:2,payload:{state:original()}}];
 const rows=probe.summarizeMovement(cases,[{id:'a',choice:'keep',answer:{probabilities:{buy:.4,sell:0,keep:.6}}},{id:'c',choice:'buy',answer:{probabilities:{buy:.6,sell:0,keep:.4}}}]);
 assert.equal(rows[0].planned,2);assert.equal(rows[0].completed,1);assert.deepEqual(rows[0].actions,{buy:0,sell:0,keep:1});near(rows[0].meanBuyChoiceProbability,.4);
 assert.equal(rows[1].completed,1);assert.deepEqual(rows[1].actions,{buy:1,sell:0,keep:0});
});
