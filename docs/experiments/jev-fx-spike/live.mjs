// Disposable performance/paper probe. Public market data only; no order endpoints.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {experimental_evaluate as evaluate} from 'ai';
import {parseTicker,marketFeatures,actionChoice,PaperAccount,LatestOnly} from './live-core.mjs';
import {renderLiveReport} from './live-report.mjs';

const args=process.argv.slice(2),durationSeconds=Number(args[args.indexOf('--duration-seconds')+1]);
if(!args.includes('--duration-seconds')||!Number.isFinite(durationSeconds)||durationSeconds<=0)throw new Error('Specify the measurement duration with --duration-seconds. This is not a decision interval.');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
try{process.loadEnvFile(resolve(root,'.env'));}catch(error){if(error.code!=='ENOENT')throw error;}
if(!process.env.AI_GATEWAY_API_KEY)throw new Error('Missing Gateway credential');
const output=resolve(root,'reports',`jev-live-paper-${new Date().toISOString().replaceAll(':','-')}`);
await mkdir(output,{recursive:true});
const config={measurementSeconds:durationSeconds,symbol:'BTC/USD',feed:'wss://ws.kraken.com/v2',eventTrigger:'bbo',fixedDecisionIntervalMs:null,maxConcurrentDecisions:1,pendingState:'latest only; all observations still recorded',actions:['buy','sell','keep'],shortSelling:false,initialUSD:1000,tradeUSD:100,feeRate:.008,feeSource:'https://www.kraken.com/features/fee-schedule',feeBasis:'Public Tier 1 taker 0.80% per side, viewed 2026-09-24. A conservative paper assumption, not an account-specific fee quote.',slippageBps:1,slippageBasis:'Illustrative adverse 1 bp per side; not measured execution',apiTimeoutMs:20000,apiRetries:0,featureWindowsMs:[1000,5000,30000,60000],featureNote:'Descriptive rolling windows only; these DO NOT schedule decisions.',execution:'First valid BBO received after model completion, at ask to buy or bid to sell, plus adverse slippage. Top-level quantity must cover the entire simulated order.',noRealOrders:true};
const questions={action:{type:'choice',instructions:'Select one action for a PAPER spot BTC/USD account using only the supplied streaming-market observations and account state. Seek net benefit after transaction costs, not activity or a high number of trades. There is no scheduled holding period and no obligation to trade. Numeric features are already computed; do not invent price forecasts. Treat probabilities as action classifications, never as profit probabilities. No leverage, short selling, or adding to an existing position. An incomplete observation window or no demonstrated edge can justify keep. The simulator executes a buy/sell at a later quote, so current prices are not guaranteed execution prices.',criteria:{buy:'When currently flat with sufficient cash, open one position with the stated fixed USD amount if the observations justify taking exposure after the disclosed costs. Never add to an existing position.',sell:'When holding BTC, close the whole existing position if the observations justify exiting after costs. Never open a short position.',keep:'Preserve the current cash/BTC allocation. This includes staying in cash when evidence is insufficient or trading costs outweigh a plausible benefit.'}}};
const codeHashes=Object.fromEntries(await Promise.all(['live.mjs','live-core.mjs'].map(async name=>[name,createHash('sha256').update(await readFile(resolve(dirname(fileURLToPath(import.meta.url)),name))).digest('hex')])));
config.transientRecovery={maxConsecutiveFailures:3,backoff:'Retry-After if supplied, otherwise 1s then 2s; resume newest state, never replay old request',meaning:'Operational failure handling, not a decision or trading interval'};
await writeFile(resolve(output,'protocol.json'),JSON.stringify({createdAt:new Date().toISOString(),config,questions,codeHashes},null,2));
const logStream=createWriteStream(resolve(output,'events.ndjson'),{flags:'wx'}),abort=new AbortController();
const account=new PaperAccount(config),baseline=new PaperAccount(config),buyHold=new PaperAccount(config);
const quotes=[],decisions=[],starts=[],curves=[],failures=[];
let latest,seq=0,messages=0,regressions=0,stopped=false,stopReason,pendingFill,decisionId=0,activeRequests=0,maxActiveRequests=0,timer,ping,lastMessageMs=Date.now(),consecutiveFailures=0;
let finish;const finished=new Promise(r=>finish=r),began=Date.now(),ws=new WebSocket(config.feed);
const safeError=error=>({name:['AbortError','TimeoutError'].includes(error?.name)?error.name:'REQUEST_OR_VALIDATION_ERROR',...(Number.isInteger(error?.statusCode)?{status:error.statusCode}:{})});
function log(value){if(!logStream.write(JSON.stringify(value)+'\n'))stop('LOG_BACKPRESSURE');}
function stop(reason){
 if(stopped)return;stopped=true;stopReason=reason;loop.stop();clearTimeout(timer);clearInterval(ping);abort.abort();
 if(pendingFill){pendingFill.resolve({status:'cancelled_at_stop'});pendingFill=undefined;}
 if(ws.readyState===WebSocket.OPEN||ws.readyState===WebSocket.CONNECTING)ws.close();finish();
}
const loop=new LatestOnly(async()=>{
 if(stopped||!latest)return;
 const q=latest,features=marketFeatures(quotes),id=++decisionId,startedMs=Date.now();starts.push(startedMs);
 const state={market:features,account:{cashUSD:account.cashUSD,holdingBTC:account.btc,position:account.btc>0?'holding':'flat',entryPrice:account.btc?account.fills.at(-1)?.price:null},execution:{buyNotionalUSD:config.tradeUSD,feeBpsPerSide:config.feeRate*10000,adverseSlippageBpsPerSide:config.slippageBps,noShortSelling:true}};
 log({type:'decision-start',id,startedMs,inputSeq:q.seq,inputSourceMs:q.sourceMs,inputReceivedMs:q.receivedMs,state});
 const startedMono=performance.now();activeRequests++;maxActiveRequests=Math.max(maxActiveRequests,activeRequests);
 let response;
 try{response=await evaluate({model:process.env.JEV_GATEWAY_MODEL||'typesafe-ai/jev',state,questions,maxRetries:0,abortSignal:AbortSignal.any([abort.signal,AbortSignal.timeout(config.apiTimeoutMs)])});}
 catch(error){if(stopped){log({type:'decision-cancelled',id,reason:stopReason});return;}throw error;}
 finally{activeRequests--;}
 if(stopped){log({type:'decision-cancelled',id,reason:stopReason});return;}
 const completedMs=Date.now(),elapsedMs=performance.now()-startedMono,action=actionChoice(response.answers.action),afterSeq=latest.seq;consecutiveFailures=0;
 // This record is written BEFORE any future quote can fill the simulated order.
 const record={id,startedMs,completedMs,elapsedMs,inputSeq:q.seq,afterSeq,updatesDuringInference:afterSeq-q.seq,inputAgeAtCompletionMs:completedMs-q.receivedMs,midDriftBps:(((latest.bid+latest.ask)/(q.bid+q.ask))-1)*10000,action,answer:response.answers.action,model:response.response.modelId,usage:{inputTokens:response.usage.inputTokens??null,outputTokens:response.usage.outputTokens??null}};
 decisions.push(record);log({type:'decision-complete',...record});
 // Diagnostic comparator: positive 5s return -> buy, negative -> sell, else keep.
 // Same decision opportunities and same future quote as Jev; no claim this is a tuned strategy.
 const move=features.windows.find(w=>w.windowMs===5000).returnBps;
 const baselineAction=baseline.btc?(move<0?'sell':'keep'):(move>0?'buy':'keep');
 const fillResult=await new Promise(resolve=>{pendingFill={record,action,baselineAction,buyHoldAction:buyHold.fills.length?'keep':'buy',resolve};});
 record.execution=fillResult;
 log({type:'decision-execution',id,result:fillResult});
 if(id%20===0)console.log(JSON.stringify({phase:'measuring',elapsedSeconds:Math.round((Date.now()-began)/1000),updates:seq,decisions:decisions.length,latestModelMs:Math.round(elapsedMs),action,paperFills:account.fills.length}));
},async error=>{
 const failure={id:decisionId,...safeError(error)};failures.push(failure);log({type:'failure',...failure});consecutiveFailures++;
 const transient=[408,429,500,502,503,504].includes(error?.statusCode)||['TimeoutError','AbortError'].includes(error?.name);
 if(stopped)return false;
 if(!transient||consecutiveFailures>=3){stop('MODEL_OR_VALIDATION_ERROR');return false;}
 // This is failure backoff, NOT normal decision pacing. Never retry the old input.
 const retry=error?.responseHeaders?.['retry-after'];
 const serverDelay=typeof retry==='string'?(Number.isFinite(Number(retry))?Number(retry)*1000:Date.parse(retry)-Date.now()):NaN;
 const waitMs=Number.isFinite(serverDelay)?Math.max(0,serverDelay):1000*2**(consecutiveFailures-1);
 log({type:'transient-recovery-wait',failedId:decisionId,waitMs,resume:'newest observed state only'});
 await new Promise(resolve=>{
  const onAbort=()=>{clearTimeout(recoveryTimer);resolve();};
  const recoveryTimer=setTimeout(()=>{abort.signal.removeEventListener('abort',onAbort);resolve();},waitMs);
  abort.signal.addEventListener('abort',onAbort,{once:true});
 });
 return !stopped;
});
logStream.on('error',()=>stop('LOG_WRITE_ERROR'));
ws.addEventListener('open',()=>{
 ws.send(JSON.stringify({method:'subscribe',params:{channel:'ticker',symbol:[config.symbol],event_trigger:'bbo',snapshot:true},req_id:1}));
 // Transport keepalive per Kraken guidance, never a trading/decision timer.
 ping=setInterval(()=>{
  if(Date.now()-lastMessageMs>60000){stop('FEED_SILENT');return;}
  if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({method:'ping'}));
 },30000);
});
ws.addEventListener('message',event=>{
 try{
  const receivedMs=Date.now();lastMessageMs=receivedMs;messages++;
  const message=JSON.parse(event.data);log({type:'feed-message',receivedMs,message});
  if(stopped)return;
  if(message.success===false){stop('FEED_SUBSCRIPTION_REJECTED');return;}
  if(message.channel==='status'&&message.data?.[0]?.system!=='online'){stop('EXCHANGE_NOT_ONLINE');return;}
  const q=parseTicker(message,seq+1,receivedMs);if(!q)return;
  if(latest&&q.sourceMs<latest.sourceMs){regressions++;return;}
  latest=q;seq++;quotes.push(q);
  // Bound feature memory by its declared maximum window; raw feed stays in NDJSON.
  while(quotes.length>2&&quotes[1].receivedMs<receivedMs-60000)quotes.shift();
  log({type:'quote',...q});
  if(pendingFill&&q.seq>pendingFill.record.afterSeq&&receivedMs>=pendingFill.record.completedMs){
   const p=pendingFill;pendingFill=undefined;
   const d={decisionId:p.record.id,afterSeq:p.record.afterSeq,completedMs:p.record.completedMs};
   const result={jev:account.execute(p.action,d,q),baseline:baseline.execute(p.baselineAction,d,q),buyHold:buyHold.execute(p.buyHoldAction,d,q),quoteSeq:q.seq,receivedMs};
   p.resolve(result);
  }
  curves.push({receivedMs,seq,mid:(q.bid+q.ask)/2,jev:account.mark(q).netLiquidationPnLUSD,baseline:baseline.mark(q).netLiquidationPnLUSD,buyHold:buyHold.mark(q).netLiquidationPnLUSD});
  loop.offer(q.seq);
 }catch(error){failures.push(safeError(error));stop('FEED_OR_PAPER_VALIDATION_ERROR');}
});
ws.addEventListener('error',()=>stop('FEED_CONNECTION_ERROR'));
ws.addEventListener('close',()=>{if(!stopped)stop('FEED_DISCONNECTED');});
timer=setTimeout(()=>stop('MEASUREMENT_WINDOW_COMPLETE'),durationSeconds*1000);
console.log(JSON.stringify({phase:'started',output,measurementSeconds:durationSeconds,fixedDecisionIntervalMs:null,realOrders:0}));
await finished;await loop.idle();
log({type:'stop',reason:stopReason,at:new Date().toISOString()});logStream.end();await once(logStream,'finish');
const stats=values=>{const a=[...values].sort((x,y)=>x-y);return a.length?{count:a.length,min:a[0],p50:a[Math.floor((a.length-1)*.5)],p95:a[Math.ceil((a.length-1)*.95)],max:a.at(-1),mean:a.reduce((s,v)=>s+v,0)/a.length}:null;};
// Re-read the persisted quote audit, not the rolling input buffer, for full-run metrics.
const entries=(await readFile(resolve(output,'events.ndjson'),'utf8')).trim().split('\n').map(line=>JSON.parse(line));
const allQuotes=entries.filter(e=>e.type==='quote'),spanMs=allQuotes.length>1?allQuotes.at(-1).receivedMs-allQuotes[0].receivedMs:0;
const result={kind:'LIVE_MARKET_PAPER_PERFORMANCE_PROBE',status:stopReason,createdAt:new Date().toISOString(),config,elapsedMs:Date.now()-began,source:'https://docs.kraken.com/exchange/api-reference/spot-websocket-v2/ticker',metrics:{messages,updates:seq,outOfOrderDropped:regressions,observedSpanMs:spanMs,updatesPerSecond:spanMs?(allQuotes.length-1)/(spanMs/1000):null,startedDecisions:starts.length,completedDecisions:decisions.length,completedDecisionsPerSecond:spanMs?decisions.length/(spanMs/1000):null,pendingUpdatesCoalesced:loop.coalesced,maxConcurrentRequests:maxActiveRequests,modelLatencyMs:stats(decisions.map(d=>d.elapsedMs)),decisionStartGapMs:stats(starts.slice(1).map((v,i)=>v-starts[i])),sourceTimestampAgeAtReceiptMs:stats(allQuotes.map(q=>q.receivedMs-q.sourceMs)),inputAgeAtCompletionMs:stats(decisions.map(d=>d.inputAgeAtCompletionMs)),updatesDuringInference:stats(decisions.map(d=>d.updatesDuringInference)),absoluteMidDriftBps:stats(decisions.map(d=>Math.abs(d.midDriftBps))),actions:Object.fromEntries(['buy','sell','keep'].map(a=>[a,decisions.filter(d=>d.action===a).length])),inputTokensOnCompletedCalls:decisions.some(d=>d.usage.inputTokens===null)?null:decisions.reduce((s,d)=>s+d.usage.inputTokens,0)},accounts:latest?{jev:{...account.mark(latest),fills:account.fills},baseline:{...baseline.mark(latest),fills:baseline.fills},buyHold:{...buyHold.mark(latest),fills:buyHold.fills},cash:{netLiquidationPnLUSD:0,fills:[]}}:null,failures,decisions,curves,limitations:['A short performance probe is not evidence of profitability','Public BBO is not an executable broker fill; slippage, depth beyond best quote, minimum order size and precision are not fully simulated','Published fee assumption is not a verified personal account tier; taxes and actual AI billing are excluded','Open positions are marked at hypothetical net liquidation value, not forcibly closed or called realized profit','No live order endpoint, no account credentials, no short selling','No reconnect or production risk-control system; transport/fatal inference failure stops this probe','Clock differences affect source timestamp age; this is not a precise network latency measurement','All feed messages retained, but not every update receives a separate Jev call','Feature windows and a 5s-return diagnostic comparator are declared assumptions, not optimized trading parameters']};
await writeFile(resolve(output,'results.json'),JSON.stringify(result,null,2));
await writeFile(resolve(output,'index.html'),renderLiveReport(result));
console.log(JSON.stringify({phase:'complete',output,status:stopReason,metrics:result.metrics,accounts:result.accounts&&Object.fromEntries(Object.entries(result.accounts).map(([k,v])=>[k,{netLiquidationPnLUSD:v.netLiquidationPnLUSD,fills:v.fills.length}]))}));
if(stopReason!=='MEASUREMENT_WINDOW_COMPLETE')process.exitCode=1;
