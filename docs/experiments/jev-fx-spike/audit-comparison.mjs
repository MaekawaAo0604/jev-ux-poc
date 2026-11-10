// Independent verification: deliberately does NOT import the simulator/accounting code.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const directory=resolve(process.argv[2]??'');
if(!process.argv[2])throw Error('Specify a completed comparison report directory');
const rawResult=JSON.parse(await readFile(resolve(directory,'results.json'),'utf8'));
const isFx=rawResult.config.symbol==='USD/JPY';
// Unit aliases only; independent accounting below does not import simulator helpers.
const aliases={initialJPY:'initialUSD',tradeQuantityUSD:'tradeBaseQuantity',cashJPY:'cashUSD',holdingUSD:'holdingBTC',usd:'btc',feeJPY:'feeUSD',paidFeesJPY:'paidFeesUSD',grossMarkJPY:'grossMarkUSD',netLiquidationJPY:'netLiquidationUSD',netLiquidationPnLJPY:'netLiquidationPnLUSD',maxDrawdownJPY:'maxDrawdownUSD'};
function normalize(v){if(!isFx||v===null||typeof v!=='object')return v;if(Array.isArray(v))return v.map(normalize);return Object.fromEntries(Object.entries(v).map(([k,x])=>[aliases[k]??k,normalize(x)]));}
const result=normalize(rawResult);
const protocol=normalize(JSON.parse(await readFile(resolve(directory,'protocol.json'),'utf8')));
const events=(await readFile(resolve(directory,'events.ndjson'),'utf8')).trim().split('\n').map(x=>normalize(JSON.parse(x)));
const absolute=result.config.slippageAbsolute??0;
const quotes=events.filter(e=>e.type==='quote'),qmap=new Map(quotes.map(q=>[q.seq,q]));
const key=(s,id)=>`${s}:${id}`,starts=new Map(),completed=new Map(),executions=new Set(),executionResults=new Map(),active=new Set();
let maxActive=0,ruleDecisionsDuringJevRequests=0,ruleDecisionsDuringRecovery=0,recovering=false,latestObservedSeq=null,lastFeed=null;
const close=(actual,expected,label)=>assert.ok(Math.abs(actual-expected)<1e-7,`${label}: ${actual} vs ${expected}`);
const costFilter={verifiedDecisions:0,verifiedExecutionRechecks:0,blockedAtDecision:0,blockedAtExecution:0,unrestrictedSells:0};
const gated=name=>result.config.costFilterEnabled&&['jev','ruleFiltered'].includes(name);
function verifyGate(gate,seq,action){
 assert.ok(gate,'missing cost gate evidence');assert.equal(gate.quoteSeq,seq);
 const q=qmap.get(seq);assert.ok(q);
 const past=quotes.filter(v=>v.seq<=seq);
 const anchor=past.findLast(v=>v.receivedMs<=q.receivedMs-5000)??past[0];
 const observed=((q.bid+q.ask)/(anchor.bid+anchor.ask)-1)*10000;
 const buyCost=(q.ask*(1+result.config.slippageBps/10000)+absolute)*(1+result.config.feeRate);
 const exitBid=(buyCost/(1-result.config.feeRate)+absolute)/(1-result.config.slippageBps/10000);
 const required=(exitBid/q.bid-1)*10000,allowed=observed>required;
 close(gate.breakEvenExitBid,exitBid,'cost gate break-even bid');close(gate.requiredRiseBps,required,'cost gate required rise');
 close(gate.observedRiseBps,observed,'past observed rise');assert.equal(gate.allowed,allowed);
 assert.equal(gate.windowMs,5000);assert.equal(gate.coverageMs,q.receivedMs-anchor.receivedMs);
 assert.equal(gate.complete,q.receivedMs-past[0].receivedMs>=5000);
 if(action!==undefined)assert.equal(gate.blocked,action==='buy'&&!allowed);
}
assert.equal(quotes.length,result.metrics.updates);assert.equal(quotes.length,result.curves.length);
assert.deepEqual(protocol.config,result.config);
for(let i=1;i<quotes.length;i++){assert.ok(quotes[i].seq>quotes[i-1].seq);assert.ok(quotes[i].receivedMs>=quotes[i-1].receivedMs);}
for(let index=0;index<events.length;index++){
 const e=events[index];
 if(e.type==='feed-message')lastFeed=e;
 if(isFx&&e.type==='quote'){
  assert.ok(lastFeed,'missing original FX feed message');const m=lastFeed.message;
  assert.equal(m.symbol,'USD_JPY');assert.equal(m.status,'OPEN');
  assert.equal(e.bid,Number(m.bid));assert.equal(e.ask,Number(m.ask));assert.equal(e.sourceMs,Date.parse(m.timestamp));assert.equal(e.receivedMs,lastFeed.receivedMs);
  assert.ok(e.receivedMs-e.sourceMs<=(result.config.quoteMaxAgeMs??5000));assert.ok(e.sourceMs-e.receivedMs<=(result.config.quoteFutureToleranceMs??1000));
  assert.equal(e.depthObserved,false);assert.equal(e.bidQty,result.config.tradeBaseQuantity);assert.equal(e.askQty,result.config.tradeBaseQuantity);
  lastFeed=null; // Each observed quote requires a distinct received message.
 }
 if(e.type==='quote')latestObservedSeq=e.seq;
 if(e.type==='decision-start'){
  assert.equal(e.inputSeq,latestObservedSeq,'decision input must be the latest already-observed quote');
  assert.ok(!starts.has(key(e.strategy,e.id)));starts.set(key(e.strategy,e.id),{...e,index});
  if(e.strategy==='jev'){active.add(e.id);maxActive=Math.max(maxActive,active.size);}
  if(e.strategy==='jev'&&gated(e.strategy))verifyGate(e.state.execution.entryCostFilter,e.inputSeq);
  if(isFx&&e.strategy==='jev'){assert.equal(e.state.market.depthObserved,false);assert.equal(e.state.market.topBookImbalance,undefined);}
 }
 if(e.type==='decision-complete'){
  assert.equal(e.afterSeq,latestObservedSeq,'decision gate must use the latest already-observed quote');
  const start=starts.get(key(e.strategy,e.id));assert.ok(start&&start.index<index);
  assert.equal(start.inputSeq,e.inputSeq);assert.ok(e.completedMs>=start.startedMs);
  assert.ok(!completed.has(key(e.strategy,e.id)));completed.set(key(e.strategy,e.id),{...e,index});
  if(e.strategy==='jev'){assert.ok(active.delete(e.id));}
  if(e.strategy==='rule'&&active.size)ruleDecisionsDuringJevRequests++;
  if(e.strategy==='rule'&&recovering)ruleDecisionsDuringRecovery++;
  if(gated(e.strategy)){
   verifyGate(e.costGate,e.afterSeq,e.rawAction);costFilter.verifiedDecisions++;
   assert.equal(e.action,e.costGate.blocked?'keep':e.rawAction);
   if(e.strategy==='jev')assert.equal(e.rawAction,e.answer.choice);
   if(e.costGate.blocked)costFilter.blockedAtDecision++;
   if(e.rawAction==='sell')costFilter.unrestrictedSells++;
  }
 }
 if(e.type==='failure'&&e.strategy==='jev')assert.ok(active.delete(e.id));
 if(e.type==='decision-cancelled'&&e.strategy==='jev')assert.ok(active.delete(e.id));
 if(e.type==='transient-recovery-wait')recovering=true;
 if(e.type==='strategy-status'&&e.strategy==='jev')recovering=false;
 if(e.type==='decision-execution'){
  const id=key(e.strategy,e.id),d=completed.get(id);assert.ok(d&&d.index<index);assert.ok(!executions.has(id));executions.add(id);
  executionResults.set(id,e.result);
  if(e.result.quoteSeq!==undefined){
   assert.equal(e.result.quoteSeq,latestObservedSeq,'execution quote must already have been observed');
   const q=qmap.get(e.result.quoteSeq);assert.ok(q.seq>d.afterSeq);assert.ok(q.receivedMs>=d.completedMs);
   const eligible=events.slice(d.index+1,index).find(v=>v.type==='quote'&&v.seq>d.afterSeq&&v.receivedMs>=d.completedMs);
   assert.equal(eligible?.seq,q.seq,'must use first eligible quote after decision, not a later convenient price');
   if(gated(e.strategy)){
    verifyGate(e.result.costGate,q.seq,d.action);costFilter.verifiedExecutionRechecks++;
    if(e.result.costGate.blocked){assert.equal(e.result.status,'blocked_by_cost_filter');costFilter.blockedAtExecution++;}
    else assert.notEqual(e.result.status,'blocked_by_cost_filter');
   }
  }
 }
}
assert.equal(active.size,0);assert.equal(maxActive,result.metrics.maxConcurrentRequests);assert.ok(maxActive<=1);
const accounts={};
for(const name of result.config.costFilterEnabled?['jev','rule','ruleFiltered','buyHold']:['jev','rule','buyHold']){
 const a=result.accounts[name],fills=a.fills,logged=events.filter(e=>e.type==='decision-execution'&&e.strategy===name&&e.result.status==='filled').map(e=>e.result.fill);
 assert.deepEqual(fills,logged);
 assert.equal(a.completedDecisions,[...completed.values()].filter(d=>d.strategy===name).length);
 let cash=result.config.initialUSD,btc=0,fees=0,peak=cash,dd=0,ddPct=0,fillIndex=0;
 for(let i=0;i<quotes.length;i++){
  const q=quotes[i];
  while(fillIndex<fills.length&&fills[fillIndex].quoteSeq===q.seq){
   const f=fills[fillIndex++],buy=f.action==='buy',d=completed.get(key(name,f.decisionId));
   assert.ok(d);assert.equal(d.action,f.action);assert.equal(f.decisionCompletedMs,d.completedMs);
   assert.ok(q.seq>d.afterSeq&&q.receivedMs>=d.completedMs);
   const price=(buy?q.ask:q.bid)*(1+(buy?1:-1)*result.config.slippageBps/10000)+(buy?1:-1)*absolute;
   close(f.price,price,'execution price');
   const quantity=buy?(result.config.tradeBaseQuantity??result.config.tradeUSD/price):btc;
   if(buy)assert.equal(btc,0);else assert.ok(btc>0);
   close(f.quantity,quantity,'quantity');assert.ok(quantity<=(buy?q.askQty:q.bidQty));
   const notional=price*quantity,fee=notional*result.config.feeRate;
   close(f.feeUSD,fee,'fee');fees+=fee;cash+=(buy?-notional:notional)-fee;btc=buy?quantity:0;assert.ok(cash>=0);
  }
  const equity=cash+btc*(q.bid*(1-result.config.slippageBps/10000)-absolute)*(1-result.config.feeRate);
  const curve=result.curves[i];assert.equal(curve.seq,q.seq);close(curve[name],equity-result.config.initialUSD,'curve PnL');
  peak=Math.max(peak,equity);dd=Math.max(dd,peak-equity);ddPct=Math.max(ddPct,(peak-equity)/peak*100);
 }
 assert.equal(fillIndex,fills.length);close(a.cashUSD,cash,'final cash');close(a.btc,btc,'final BTC');close(a.paidFeesUSD,fees,'total fees');
 close(a.maxDrawdownUSD,dd,'drawdown');close(a.maxDrawdownPct,ddPct,'drawdown percent');
 close(a.netLiquidationPnLUSD,result.curves.at(-1)[name],'final PnL');
 for(const action of ['buy','sell','keep'])assert.equal(a.actions[action],[...completed.values()].filter(d=>d.strategy===name&&d.action===action).length);
 if(result.config.costFilterEnabled){
  const records=[...completed.values()].filter(d=>d.strategy===name);
  for(const action of ['buy','sell','keep'])assert.equal(a.rawActions[action],records.filter(d=>d.rawAction===action).length);
  assert.equal(a.blockedBuysAtDecision,records.filter(d=>d.costGate?.blocked).length);
  assert.equal(a.blockedBuysAtExecution,events.filter(e=>e.type==='decision-execution'&&e.strategy===name&&e.result.status==='blocked_by_cost_filter').length);
 }
 const records=[...completed.values()].filter(d=>d.strategy===name);
 assert.equal(result.decisions[name].length,records.length,'all completed decisions must appear exactly once in result');
 const seen=new Set();
 for(let i=0;i<records.length;i++){
  const d=result.decisions[name][i];assert.ok(!seen.has(d.id),'duplicate result decision');seen.add(d.id);
  const {type,strategy,index,...logged}=records[i];
  assert.ok(executions.has(key(name,d.id)),'decision execution missing');
  assert.deepEqual(d,{...logged,execution:executionResults.get(key(name,d.id))},'complete decision evidence must match append-only log');
 }
 accounts[name]={fills:fills.length,netLiquidationPnLUSD:a.netLiquidationPnLUSD,paidFeesUSD:fees,maxDrawdownUSD:dd};
}
assert.equal(result.metrics.inputTokensOnCompletedCalls,result.decisions.jev.some(d=>d.usage.inputTokens===null)?null:result.decisions.jev.reduce((s,d)=>s+d.usage.inputTokens,0));
assert.equal(result.metrics.aiCostUSD,null,'unknown billing must not be counted as zero');
const codeHashes={};
for(const [name,expected] of Object.entries(protocol.codeHashes)){
 const actual=createHash('sha256').update(await readFile(resolve(dirname(fileURLToPath(import.meta.url)),name))).digest('hex');
 codeHashes[name]=actual===expected;
}
const audit={status:'PASS',verifiedAt:new Date().toISOString(),independentRecalculation:true,updates:quotes.length,maxConcurrentJevRequests:maxActive,ruleDecisionsDuringJevRequests,ruleDecisionsDuringRecovery,codeStillMatchesRun:codeHashes,accounts,checks:['Strict post-decision first-eligible-quote execution for every lane','No duplicate decisions or executions','One in-flight Jev request','Rule activity while Jev awaits response or recovery','Cash, positions, execution prices, liquidity, fees and every equity point independently recalculated','Drawdown and decision summaries reconcile with append-only log','AI billing remains explicitly unknown']};
if(result.config.costFilterEnabled){audit.costFilter=costFilter;audit.checks.push('Historical cost gate independently recomputed from past quotes only, including decision/execution rechecks and raw/effective actions');}
if(isFx){audit.currency='JPY';for(const a of Object.values(audit.accounts))for(const k of ['netLiquidationPnL','paidFees','maxDrawdown']){a[k+'JPY']=a[k+'USD'];delete a[k+'USD'];}}
await writeFile(resolve(directory,'audit.json'),JSON.stringify(audit,null,2));
console.log(JSON.stringify(audit));
