import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {FxComparison,parseFxTicker} from './fx-adapter.mjs';

async function fixture(duplicateRaw=false){
 const dir=await mkdtemp(resolve(tmpdir(),'usd-jpy-audit-')),events=[];
 const config={symbol:'USD/JPY',initialJPY:150000,tradeQuantityUSD:100,feeRate:.00002,slippageBps:0,slippageAbsolute:.001,costFilterEnabled:true};
 const rules={symbol:'USD_JPY',minOpenOrderSize:'100',maxOrderSize:'500000',sizeStep:'1',tickSize:'.001'};
 let now=Date.parse('2026-09-24T05:00:00Z');
 const c=new FxComparison(config,rules,{clock:()=>now,onEvent:e=>events.push(structuredClone(e)),infer:async s=>{
  const choice=s.account.holdingUSD?'sell':s.market.latestMid>150.02?'buy':'keep';return {answers:{action:{choice,probabilities:{buy:choice==='buy'?1:0,sell:choice==='sell'?1:0,keep:choice==='keep'?1:0}}},usage:{inputTokens:10,outputTokens:1},response:{modelId:'test'}};
 }});
 for(const [seq,advance,bid] of [[1,0,150],duplicateRaw?[2,0,150]:[2,5000,150.03],[3,1,150.03],[4,1000,150.01],[5,1000,150]]){
  now+=advance;const message={symbol:'USD_JPY',status:'OPEN',timestamp:new Date(now).toISOString(),bid:bid.toFixed(3),ask:(bid+.005).toFixed(3)};
  if(!duplicateRaw||seq!==2)events.push({type:'feed-message',receivedMs:now,message});const q=parseFxTicker(message,seq,now,config);events.push({type:'quote',...q});c.observe(q);await new Promise(r=>setImmediate(r));
 }
 c.stop();await c.idle();
 const result={config,accounts:c.summary(),decisions:c.decisions(),curves:c.engine.curves,metrics:{updates:5,maxConcurrentRequests:1,inputTokensOnCompletedCalls:c.engine.lanes.jev.decisions.length*10,aiCostUSD:null}};
 await writeFile(resolve(dir,'results.json'),JSON.stringify(result));await writeFile(resolve(dir,'protocol.json'),JSON.stringify({config,codeHashes:{}}));await writeFile(resolve(dir,'events.ndjson'),events.map(e=>JSON.stringify(e)).join('\n'));
 return {dir,events,result};
}
const run=dir=>spawnSync(process.execPath,['docs/experiments/jev-fx-spike/audit-comparison.mjs',dir],{encoding:'utf8'});
test('independent FX audit verifies actual bid/ask, fixed USD size, both JPY fees, slippage, gates and every curve',async()=>{
 const {dir}=await fixture(),a=run(dir);assert.equal(a.status,0,a.stderr);
 const result=JSON.parse(await readFile(resolve(dir,'audit.json'),'utf8'));
 assert.equal(result.currency,'JPY');assert.equal(result.accounts.jev.fills,2);assert.ok(result.accounts.jev.netLiquidationPnLJPY<0);
 assert.ok(result.costFilter.verifiedExecutionRechecks>0);assert.doesNotMatch(JSON.stringify(result.accounts),/PnLUSD|paidFeesUSD/);
});
test('independent FX audit rejects a quote that no longer matches the received broker message',async()=>{
 const {dir,events}=await fixture();events.find(e=>e.type==='feed-message').message.bid='149.900';
 await writeFile(resolve(dir,'events.ndjson'),events.map(e=>JSON.stringify(e)).join('\n'));
 assert.notEqual(run(dir).status,0);
});
test('independent FX audit cannot reuse one raw message to invent a post-decision quote',async()=>{
 const {dir}=await fixture(true);assert.notEqual(run(dir).status,0);
});
