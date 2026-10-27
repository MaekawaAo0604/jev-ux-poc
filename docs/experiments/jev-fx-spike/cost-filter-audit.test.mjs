import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {IndependentPaperComparison} from './live-core.mjs';

async function fixture(){
 const directory=await mkdtemp(resolve(tmpdir(),'jev-cost-audit-'));
 const config={initialUSD:1000,tradeUSD:100,feeRate:.008,slippageBps:1,costFilterEnabled:true};
 const events=[];let now=1000;
 const c=new IndependentPaperComparison(config,{clock:()=>now,onEvent:e=>events.push(structuredClone(e)),infer:async state=>{
  const choice=state.account.holdingBTC?'sell':'buy';
  return {answers:{action:{choice,probabilities:{buy:choice==='buy'?1:0,sell:choice==='sell'?1:0,keep:0}}},usage:{inputTokens:12,outputTokens:1},response:{modelId:'test-model'}};
 }});
 for(const [seq,time,price] of [[1,1000,100],[2,6000,110],[3,6001,100.1],[4,7000,111],[5,7001,112],[6,8000,90],[7,8001,90]]){
  now=time;const q={seq,receivedMs:time,sourceMs:time,symbol:'BTC/USD',bid:price,ask:price,bidQty:100,askQty:100};
  events.push({type:'quote',...q});c.observe(q);await new Promise(r=>setImmediate(r));
 }
 c.stop();await c.idle();
 const result={config,accounts:c.summary(),curves:c.curves,decisions:Object.fromEntries(Object.entries(c.lanes).map(([k,l])=>[k,l.decisions])),metrics:{updates:7,maxConcurrentRequests:1,inputTokensOnCompletedCalls:c.lanes.jev.decisions.length*12,aiCostUSD:null}};
 await writeFile(resolve(directory,'results.json'),JSON.stringify(result));
 await writeFile(resolve(directory,'protocol.json'),JSON.stringify({config,codeHashes:{}}));
 await writeFile(resolve(directory,'events.ndjson'),events.map(e=>JSON.stringify(e)).join('\n'));
 return {directory,events,result};
}
function audit(directory){return spawnSync(process.execPath,['docs/experiments/jev-fx-spike/audit-comparison.mjs',directory],{encoding:'utf8'});}

test('independent audit recalculates filtered lanes, threshold decisions, future-quote rechecks and unblocked loss exits',async()=>{
 const {directory}=await fixture();const run=audit(directory);assert.equal(run.status,0,run.stderr);
 const result=JSON.parse(await readFile(resolve(directory,'audit.json'),'utf8'));
 assert.ok(result.accounts.ruleFiltered);assert.ok(result.costFilter.verifiedDecisions>0);
 assert.ok(result.costFilter.blockedAtDecision>0);assert.ok(result.costFilter.blockedAtExecution>0);
 assert.ok(result.costFilter.unrestrictedSells>0);
});

test('independent audit rejects an invented cost threshold even when result and log agree',async()=>{
 const {directory,events,result}=await fixture();
 const event=events.find(e=>e.type==='decision-complete'&&e.strategy==='jev');
 event.costGate.breakEvenExitBid+=10;result.decisions.jev[0].costGate.breakEvenExitBid+=10;
 await writeFile(resolve(directory,'events.ndjson'),events.map(e=>JSON.stringify(e)).join('\n'));
 await writeFile(resolve(directory,'results.json'),JSON.stringify(result));
 const run=audit(directory);assert.notEqual(run.status,0,'independent recomputation must reject matching but wrong evidence');
});

test('audit rejects using a later quote for a decision even when its gate math is correct',async()=>{
 const {directory,events,result}=await fixture();
 const future=events.findLast(e=>e.type==='decision-complete'&&e.strategy==='jev');
 const event=events.find(e=>e.type==='decision-complete'&&e.strategy==='jev');
 assert.equal(future.costGate.blocked,true);assert.equal(event.costGate.blocked,true);
 event.afterSeq=future.afterSeq;event.costGate=structuredClone(future.costGate);
 result.decisions.jev[0].afterSeq=future.afterSeq;result.decisions.jev[0].costGate=structuredClone(future.costGate);
 await writeFile(resolve(directory,'events.ndjson'),events.map(e=>JSON.stringify(e)).join('\n'));
 await writeFile(resolve(directory,'results.json'),JSON.stringify(result));
 const run=audit(directory);assert.notEqual(run.status,0,'correct arithmetic must not allow future information');
});

test('audit rejects omitted, duplicated or altered decision records in the result even when account totals match',async()=>{
 const {directory,result}=await fixture();
 for(const mutation of ['omitted','duplicated','answer','usage','afterSeq']){
  const copy=structuredClone(result);
  if(mutation==='omitted')copy.decisions.ruleFiltered=[];
  if(mutation==='duplicated')copy.decisions.ruleFiltered[1]=structuredClone(copy.decisions.ruleFiltered[0]);
  if(mutation==='answer')copy.decisions.jev[0].answer.choice='sell';
  if(mutation==='usage')copy.decisions.jev[0].usage.outputTokens+=100;
  if(mutation==='afterSeq')copy.decisions.jev[0].afterSeq=7;
  await writeFile(resolve(directory,'results.json'),JSON.stringify(copy));
  const run=audit(directory);assert.notEqual(run.status,0,`must reject ${mutation} decision evidence`);
 }
});
