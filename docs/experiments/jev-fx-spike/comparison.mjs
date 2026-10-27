// Public, forward-time paper comparison only. No broker/order API exists here.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {experimental_evaluate as evaluate} from 'ai';
import {parseTicker,IndependentPaperComparison,distribution,OrderedAuditWriter,comparisonIsComplete} from './live-core.mjs';
import {renderComparisonReport} from './live-report.mjs';

const args=process.argv.slice(2),durationSeconds=Number(args[args.indexOf('--duration-seconds')+1]);
if(!args.includes('--duration-seconds')||!Number.isFinite(durationSeconds)||durationSeconds<=0)throw Error('Specify --duration-seconds (observation duration, NOT decision interval).');
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../../..');
try{process.loadEnvFile(resolve(root,'.env'));}catch(error){if(error.code!=='ENOENT')throw error;}
if(!process.env.AI_GATEWAY_API_KEY)throw Error('Missing Gateway credential');
const output=resolve(root,'reports',`jev-cost-filter-paper-${new Date().toISOString().replaceAll(':','-')}`);
await mkdir(output,{recursive:true});
const config={measurementSeconds:durationSeconds,symbol:'BTC/USD',feed:'wss://ws.kraken.com/v2',eventTrigger:'bbo',independentStrategies:true,fixedDecisionIntervalMs:null,maxConcurrentDecisions:1,pendingState:'Jev keeps newest pending state only; rule handles every quote without waiting for Jev',actions:['buy','sell','keep'],shortSelling:false,initialUSD:1000,tradeUSD:100,feeRate:.008,feeSource:'https://www.kraken.com/features/fee-schedule',feeBasis:'Same explicit paper assumption as the prior run: 0.80% per side. Not an account-specific fee quote.',slippageBps:1,slippageBasis:'Assumed adverse 1 bp per side; not measured execution',apiTimeoutMs:20000,apiRetries:0,featureWindowsMs:[1000,5000,30000,60000],featureNote:'Past-data description windows, NOT decision intervals. Partial windows allowed and coverage exposed.',rule:'Unchanged diagnostic rule: positive trailing 5s midpoint return buys when flat; negative return sells when holding; otherwise keep. Not optimized or validated for profit.',execution:'Each strategy uses its own first valid BBO received AFTER its decision completes; ask to buy, bid to sell, adverse slippage and fees. Reject insufficient top-level size; no same-quote fill.',independence:'Logical asynchronous lanes in one Node process, not process-level isolation. A fatal Jev error disables Jev only; shared feed/log failure stops all lanes.',noRealOrders:true};
const questions={action:{type:'choice',instructions:'Select one action for a PAPER spot BTC/USD account using only the supplied streaming-market observations and account state. Seek net benefit after transaction costs, not activity or a high number of trades. There is no scheduled holding period and no obligation to trade. Numeric features are already computed; do not invent price forecasts. Treat probabilities as action classifications, never as profit probabilities. No leverage, short selling, or adding to an existing position. An incomplete observation window or no demonstrated edge can justify keep. The simulator executes a buy/sell at a later quote, so current prices are not guaranteed execution prices.',criteria:{buy:'When currently flat with sufficient cash, open one position with the stated fixed USD amount if the observations justify taking exposure after the disclosed costs. Never add to an existing position.',sell:'When holding BTC, close the whole existing position if the observations justify exiting after costs. Never open a short position.',keep:'Preserve the current cash/BTC allocation. This includes staying in cash when evidence is insufficient or trading costs outweigh a plausible benefit.'}}};
config.costFilterEnabled=true;
config.entryCostFilter={strategies:['jev','ruleFiltered'],windowMs:5000,partialWindows:true,rule:'New buys require past 5s midpoint rise STRICTLY above current round-trip break-even rise. Historical movement only, NOT a future-return forecast.',breakEvenExitBid:'ask * (1 + slippage) * (1 + fee) / ((1 - slippage) * (1 - fee))',requiredRiseBps:'(breakEvenExitBid / currentBid - 1) * 10000',apply:'Use latest state at decision completion and recheck at first eligible future execution quote. Preserve raw action. No restrictions on sells or keep.',unchangedControls:['rule','buyHold','cash'],excludes:'AI API billing'};
questions.action.instructions+=' The execution.entryCostFilter is a code-computed new-purchase gate: allowed means only that the observed past rise exceeds round-trip costs, NOT that future profit is predicted. If flat and allowed is false, choose keep instead of buy. Selling is not restricted by this gate; you may exit a losing position. The gate is rechecked on the latest state after your response and before paper execution.';
config.transientRecovery={maxConsecutiveFailures:3,backoff:'Retry-After if provided, otherwise 1s then 2s. Resume newest input only. Rule continues throughout.',fatal:'Disable Jev only; continue collecting all strategies through the observation window.'};
config.auditLog={maxBufferedBytes:4*1024*1024,backpressure:'Preserve order and wait for drain; bounded memory overflow or actual I/O failure stops all lanes.'};
const codeHashes=Object.fromEntries(await Promise.all(['comparison.mjs','live-core.mjs','live-report.mjs'].map(async name=>[name,createHash('sha256').update(await readFile(resolve(here,name))).digest('hex')])));
await writeFile(resolve(output,'protocol.json'),JSON.stringify({createdAt:new Date().toISOString(),config,questions,codeHashes},null,2));
const logStream=createWriteStream(resolve(output,'events.ndjson'),{flags:'wx'}),abort=new AbortController();
let stopped=false,stopReason,seq=0,messages=0,regressions=0,lastMessageMs=Date.now(),consecutiveFailures=0,timer,ping,progressTimer;
let finish;const finished=new Promise(r=>finish=r),began=Date.now();
const auditWriter=new OrderedAuditWriter(logStream,{maxBufferedBytes:config.auditLog.maxBufferedBytes,onFailure:reason=>stop(reason)});
function log(value){auditWriter.append(value);}
const comparison=new IndependentPaperComparison(config,{
 infer:state=>evaluate({model:process.env.JEV_GATEWAY_MODEL||'typesafe-ai/jev',state,questions,maxRetries:0,abortSignal:AbortSignal.any([abort.signal,AbortSignal.timeout(config.apiTimeoutMs)])}),
 onEvent:event=>{if(event.type==='decision-complete'&&event.strategy==='jev')consecutiveFailures=0;log(event);},
 onJevError:async(error,failure)=>{
  consecutiveFailures++;
  const transient=[408,429,500,502,503,504].includes(error?.statusCode)||['TimeoutError','AbortError'].includes(error?.name);
  if(stopped||!transient||consecutiveFailures>=3)return false;
  const retry=error?.responseHeaders?.['retry-after'];
  const serverDelay=typeof retry==='string'?(Number.isFinite(Number(retry))?Number(retry)*1000:Date.parse(retry)-Date.now()):NaN;
  const waitMs=Number.isFinite(serverDelay)?Math.max(0,serverDelay):1000*2**(consecutiveFailures-1);
  log({type:'transient-recovery-wait',strategy:'jev',failedId:failure.id,atMs:Date.now(),waitMs,resume:'newest observed state only'});
  await new Promise(resolve=>{
   const onAbort=()=>{clearTimeout(recoveryTimer);resolve();};
   const recoveryTimer=setTimeout(()=>{abort.signal.removeEventListener('abort',onAbort);resolve();},waitMs);
   abort.signal.addEventListener('abort',onAbort,{once:true});
  });return !stopped;
 }
});
const ws=new WebSocket(config.feed);
function stop(reason){
 if(stopped)return;stopped=true;stopReason=reason;
 comparison.stop();clearTimeout(timer);clearInterval(ping);clearInterval(progressTimer);abort.abort();
 if(ws.readyState===WebSocket.OPEN||ws.readyState===WebSocket.CONNECTING)ws.close();finish();
}
ws.addEventListener('open',()=>{
 ws.send(JSON.stringify({method:'subscribe',params:{channel:'ticker',symbol:[config.symbol],event_trigger:'bbo',snapshot:true},req_id:1}));
 ping=setInterval(()=>{if(Date.now()-lastMessageMs>60000){stop('FEED_SILENT');return;}if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({method:'ping'}));},30000);
});
ws.addEventListener('message',event=>{
 try{
  if(stopped)return;
  const receivedMs=Date.now();lastMessageMs=receivedMs;messages++;
  const message=JSON.parse(event.data);log({type:'feed-message',receivedMs,message});
  if(stopped)return;
  if(message.success===false){stop('FEED_SUBSCRIPTION_REJECTED');return;}
  if(message.channel==='status'&&message.data?.[0]?.system!=='online'){stop('EXCHANGE_NOT_ONLINE');return;}
  const q=parseTicker(message,seq+1,receivedMs);if(!q)return;
  if(comparison.latest&&q.sourceMs<comparison.latest.sourceMs){regressions++;return;}
  seq++;log({type:'quote',...q});if(!stopped)comparison.observe(q);
 }catch{stop('FEED_OR_PAPER_VALIDATION_ERROR');}
});
ws.addEventListener('error',()=>stop('FEED_CONNECTION_ERROR'));
ws.addEventListener('close',()=>{if(!stopped)stop('FEED_DISCONNECTED');});
process.once('SIGINT',()=>stop('USER_INTERRUPTED'));
timer=setTimeout(()=>stop('MEASUREMENT_WINDOW_COMPLETE'),durationSeconds*1000);
// Console progress is not a decision timer. No inference or trade runs here.
progressTimer=setInterval(()=>console.log(JSON.stringify({phase:'measuring',elapsedSeconds:Math.round((Date.now()-began)/1000),updates:seq,strategies:Object.fromEntries(Object.entries(comparison.summary()??{}).map(([k,v])=>[k,{status:v.status,decisions:v.completedDecisions,fills:v.fills.length,pnlUSD:v.netLiquidationPnLUSD}]))})),30000);
console.log(JSON.stringify({phase:'started',output,measurementSeconds:durationSeconds,fixedDecisionIntervalMs:null,independentStrategies:true,realOrders:0}));
await finished;await comparison.idle();
log({type:'stop',reason:stopReason,at:new Date().toISOString()});
let logComplete=true;
try{await auditWriter.close();}catch{logComplete=false;stopReason=auditWriter.failure??'LOG_WRITE_ERROR';}
let entries=[];
try{entries=(await readFile(resolve(output,'events.ndjson'),'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);}catch{logComplete=false;stopReason='LOG_READBACK_ERROR';}
const allQuotes=entries.filter(e=>e.type==='quote'),spanMs=allQuotes.length>1?allQuotes.at(-1).receivedMs-allQuotes[0].receivedMs:0;
const jev=comparison.lanes.jev,accounts=comparison.summary();
const result={kind:'INDEPENDENT_LIVE_PAPER_COMPARISON',status:stopReason,comparisonComplete:stopReason==='MEASUREMENT_WINDOW_COMPLETE'&&Object.values(comparison.lanes).every(l=>l.status==='active'),createdAt:new Date().toISOString(),startedAt:new Date(began).toISOString(),config,elapsedMs:Date.now()-began,source:'https://docs.kraken.com/exchange/api-reference/spot-websocket-v2/ticker',metrics:{messages,updates:seq,outOfOrderDropped:regressions,observedSpanMs:spanMs,updatesPerSecond:spanMs?(allQuotes.length-1)/(spanMs/1000):null,pendingUpdatesCoalesced:comparison.loop.coalesced,maxConcurrentRequests:comparison.maxActiveRequests,featureLatencyMs:distribution(comparison.featureLatencyMs),sourceTimestampAgeAtReceiptMs:distribution(allQuotes.map(q=>q.receivedMs-q.sourceMs)),inputAgeAtCompletionMs:distribution(jev.decisions.map(d=>d.inputAgeAtCompletionMs)),updatesDuringInference:distribution(jev.decisions.map(d=>d.updatesDuringInference)),absoluteMidDriftBps:distribution(jev.decisions.map(d=>Math.abs(d.midDriftBps))),inputTokensOnCompletedCalls:jev.decisions.some(d=>d.usage.inputTokens===null)?null:jev.decisions.reduce((s,d)=>s+d.usage.inputTokens,0),outputTokensOnCompletedCalls:jev.decisions.some(d=>d.usage.outputTokens===null)?null:jev.decisions.reduce((s,d)=>s+d.usage.outputTokens,0),aiCostUSD:null},accounts,failures:comparison.failures,decisions:Object.fromEntries(Object.entries(comparison.lanes).map(([name,lane])=>[name,lane.decisions])),curves:comparison.curves,limitations:['Ten minutes is a functional comparison, not profitability evidence','Strategies see the same feed but decide at their own speeds; this compares whole systems, not model skill at matched timestamps','Independent logical lanes share a process, CPU, feed and logger; no process-level fault isolation','Public BBO paper fills do not guarantee broker execution; depth, queue position, precision and minimum order sizes are simplified','Fee and adverse slippage are explicit assumptions, not account-specific measured costs','Net liquidation PnL excludes actual AI billing and tax; AI cost remains unknown, NOT zero','Open positions are marked after hypothetical exit costs, not called realized profit or forcibly closed','The simple 5s-return rule is an untuned diagnostic, not a proven trading strategy','Jev probabilities classify actions, not probability of making money','Shared feed disconnect or data/log error ends all lanes; no reconnect or production risk management']};
result.comparisonComplete=comparisonIsComplete({stopReason,updates:seq,accounts,logComplete,costFilterEnabled:config.costFilterEnabled});
result.limitations.push('Entry cost filter uses historical 5s movement, not expected future profit; it can miss trades or buy after a move has already finished. Sells are never gated by profitability.');
result.metrics.auditLog={complete:logComplete,backpressureEvents:auditWriter.backpressureEvents,maxBufferedBytes:auditWriter.maxBufferedBytes,limitBytes:auditWriter.limit};
await writeFile(resolve(output,'results.json'),JSON.stringify(result,null,2));
await writeFile(resolve(output,'index.html'),renderComparisonReport(result));
console.log(JSON.stringify({phase:'complete',output,status:stopReason,comparisonComplete:result.comparisonComplete,metrics:result.metrics,accounts:accounts&&Object.fromEntries(Object.entries(accounts).map(([k,a])=>[k,{status:a.status,decisions:a.completedDecisions,actions:a.actions,fills:a.fills.length,pnlUSD:a.netLiquidationPnLUSD,drawdownUSD:a.maxDrawdownUSD,feesUSD:a.paidFeesUSD,latencyMs:a.latencyMs}]))}));
if(!result.comparisonComplete)process.exitCode=2;
