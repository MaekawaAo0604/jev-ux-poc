// Throwaway forward-time USD/JPY paper probe. Public market data only.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {experimental_evaluate as evaluate} from 'ai';
import {OrderedAuditWriter,distribution,comparisonIsComplete} from './live-core.mjs';
import {FxComparison,parseFxTicker,fxQuestions} from './fx-adapter.mjs';
import {renderFxReport} from './fx-report.mjs';
import {nextFxBoundary} from './fx-boundary.mjs';
import {fxRecoveryWait} from './fx-recovery.mjs';

const args=process.argv.slice(2),duration=Number(args[args.indexOf('--duration-seconds')+1]);
if(!args.includes('--duration-seconds')||!Number.isFinite(duration)||duration<=0)throw Error('Specify observation --duration-seconds');
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../../..');
try{process.loadEnvFile(resolve(root,'.env'));}catch(e){if(e.code!=='ENOENT')throw Error('ENV_LOAD_FAILED');}
if(!process.env.AI_GATEWAY_API_KEY)throw Error('MISSING_GATEWAY_KEY');
async function publicJson(url){const r=await fetch(url,{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('PUBLIC_PREFLIGHT_HTTP_FAILURE');return r.json();}
const [service,ruleResponse]=await Promise.all(['status','symbols'].map(x=>publicJson('https://forex-api.coin.z.com/public/v1/'+x)));
if(service.status!==0||service.data?.status!=='OPEN'||ruleResponse.status!==0)throw Error('FX_SERVICE_NOT_OPEN');
const rules=ruleResponse.data.find(r=>r.symbol==='USD_JPY');if(!rules)throw Error('FX_RULES_MISSING');
const model=process.env.JEV_GATEWAY_MODEL||'typesafe-ai/jev';
let pricing=null;try{const catalog=await publicJson('https://ai-gateway.vercel.sh/v1/models');const m=catalog.data?.find(x=>x.id===model);if(m?.pricing)pricing={model,inputPerTokenUSD:m.pricing.input,outputPerTokenUSD:m.pricing.output,retrievedAt:new Date().toISOString(),source:'https://ai-gateway.vercel.sh/v1/models'};}catch{}
const config={symbol:'USD/JPY',measurementSeconds:duration,initialJPY:150000,tradeQuantityUSD:100,feeRate:.00002,feeBasis:'Published GMO FX API order fee 0.002% per side; no introductory waiver; fractional JPY kept, broker rounding not reproduced',feeSource:'https://coin.z.com/jp/corp/product/info/fx/api/',slippageBps:0,slippageAbsolute:.001,slippageBasis:'Assumed adverse 0.001 JPY per USD per side, NOT measured execution',costFilterEnabled:true,featureWindowsMs:[1000,5000,30000,60000],entryCostFilter:'Trailing 5s midpoint rise must exceed round-trip cost; partial windows allowed. Historical movement NOT prediction. Recheck latest state at response and first eligible execution quote. Never gate sells.',fixedDecisionIntervalMs:null,feed:'wss://forex-api.coin.z.com/ws/public/v1',source:'https://api.coin.z.com/fxdocs/',rules,liquidity:'Quoted sizes unavailable: full 100 USD fill assumed; do not infer order book imbalance',cashModel:'Fully funded long-only approximation; no leverage, shorts, pyramiding or margin accounting',swap:'Stop at JST 06:00 boundary; swap not modelled',quoteMaxAgeMs:5000,quoteFutureToleranceMs:1000,aiTimeoutMs:20000,maxConcurrentRequests:1,noRealOrders:true};
config.costFilterEnabled=!args.includes('--no-entry-cost-filter');
if(!config.costFilterEnabled)config.entryCostFilter='Disabled: no purchase veto based on trailing 5s movement; transaction costs remain unchanged.';
const questions=fxQuestions(config.costFilterEnabled);
const output=resolve(root,'reports',`jev-usdjpy-paper-${new Date().toISOString().replaceAll(':','-')}`);await mkdir(output,{recursive:true});
const codeHashes=Object.fromEntries(await Promise.all(['fx-probe.mjs','fx-adapter.mjs','fx-report.mjs','fx-boundary.mjs','fx-recovery.mjs','live-core.mjs'].map(async name=>[name,createHash('sha256').update(await readFile(resolve(here,name))).digest('hex')])));
await writeFile(resolve(output,'protocol.json'),JSON.stringify({createdAt:new Date().toISOString(),config,questions,pricing,service,ruleResponse,codeHashes},null,2));
const abort=new AbortController();let stopped=false,stopReason,seq=0,messages=0,dropped=0,consecutiveFailures=0,lastMessageMs=Date.now();
let finish;const finished=new Promise(r=>finish=r),began=Date.now(),day=t=>Math.floor((t+3*3600000)/86400000),startedDay=day(began);
const writer=new OrderedAuditWriter(createWriteStream(resolve(output,'events.ndjson'),{flags:'wx'}),{onFailure:reason=>stop(reason)});
const log=e=>writer.append(e);
const comparison=new FxComparison(config,rules,{
 infer:state=>evaluate({model,state,questions,maxRetries:0,abortSignal:AbortSignal.any([abort.signal,AbortSignal.timeout(config.aiTimeoutMs)])}),
 onEvent:e=>{if(e.type==='decision-complete'&&e.strategy==='jev')consecutiveFailures=0;log(e);},
 onJevError:async(error,failure)=>{
  consecutiveFailures++;const waitMs=fxRecoveryWait(error,consecutiveFailures);if(stopped||waitMs===null)return false;
  log({type:'transient-recovery-wait',strategy:'jev',failedId:failure.id,atMs:Date.now(),waitMs});
  await new Promise(r=>{const done=()=>{clearTimeout(t);abort.signal.removeEventListener('abort',done);r();};const t=setTimeout(done,waitMs);abort.signal.addEventListener('abort',done,{once:true});});return !stopped;
 }
});
const ws=new WebSocket(config.feed);
function stop(reason){if(stopped)return;stopped=true;stopReason=reason;comparison.stop();abort.abort();clearTimeout(timer);clearTimeout(boundaryTimer);clearInterval(progress);clearInterval(watchdog);ws.close();finish();}
ws.addEventListener('open',()=>ws.send(JSON.stringify({command:'subscribe',channel:'ticker',symbol:'USD_JPY'})));
ws.addEventListener('message',event=>{
 if(stopped)return;const receivedMs=Date.now();lastMessageMs=receivedMs;messages++;
 try{
  const message=JSON.parse(event.data);log({type:'feed-message',receivedMs,message});if(stopped)return;
  if(day(receivedMs)!==startedDay){stop('SWAP_BOUNDARY_NOT_MODELLED');return;}
  const q=parseFxTicker(message,seq+1,receivedMs,config);
  if(comparison.engine.latest&&q.sourceMs<comparison.engine.latest.sourceMs){dropped++;return;}
  seq++;log({type:'quote',...q});if(!stopped)comparison.observe(q);
 }catch(error){stop(['FX_CLOSED_OR_INVALID_SYMBOL','FX_INVALID_QUOTE','FX_STALE_QUOTE','FX_FUTURE_QUOTE'].includes(error?.message)?error.message:'FEED_OR_PAPER_VALIDATION_ERROR');}
});
ws.addEventListener('error',()=>stop('FEED_CONNECTION_ERROR'));ws.addEventListener('close',()=>{if(!stopped)stop('FEED_DISCONNECTED');});process.once('SIGINT',()=>stop('USER_INTERRUPTED'));
const timer=setTimeout(()=>stop('MEASUREMENT_WINDOW_COMPLETE'),duration*1000);
const boundaryTimer=setTimeout(()=>stop('SWAP_BOUNDARY_NOT_MODELLED'),Math.max(0,nextFxBoundary(began)-Date.now()));
const watchdog=setInterval(()=>{if(Date.now()-lastMessageMs>10000)stop('FEED_SILENT');},1000);
const compact=()=>Object.fromEntries(Object.entries(comparison.summary()??{}).map(([k,a])=>[k,{status:a.status,decisions:a.completedDecisions,rawActions:a.rawActions,fills:a.fills.length,pnlJPY:a.netLiquidationPnLJPY,blocked:a.blockedBuysAtDecision}]));
const progress=setInterval(()=>console.log(JSON.stringify({phase:'measuring',elapsedSeconds:Math.round((Date.now()-began)/1000),updates:seq,accounts:compact()})),30000);
console.log(JSON.stringify({phase:'started',output,measurementSeconds:duration,symbol:config.symbol,feeRate:config.feeRate,slippageAbsolute:config.slippageAbsolute,realOrders:0}));
await finished;await comparison.idle();log({type:'stop',reason:stopReason,at:new Date().toISOString()});
let logComplete=true;try{await writer.close();}catch{logComplete=false;stopReason=writer.failure??'LOG_WRITE_ERROR';}
let events=[];try{events=(await readFile(resolve(output,'events.ndjson'),'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);}catch{logComplete=false;stopReason='LOG_READBACK_ERROR';}
const quotes=events.filter(e=>e.type==='quote'),accounts=comparison.summary(),decisions=comparison.decisions(),engine=comparison.engine;
const tokens=key=>decisions.jev.some(d=>d.usage[key]===null)?null:decisions.jev.reduce((s,d)=>s+d.usage[key],0);
const input=tokens('inputTokens'),out=tokens('outputTokens'),rateIn=Number(pricing?.inputPerTokenUSD),rateOut=Number(pricing?.outputPerTokenUSD);
const aiEstimatedCostUSD=pricing&&input!==null&&out!==null&&Number.isFinite(rateIn)&&Number.isFinite(rateOut)?input*rateIn+out*rateOut:null;
const gates=(decisions.ruleFiltered??[]).map(d=>d.costGate),latest=engine.latest;
const result={kind:'USDJPY_LIVE_PAPER_PROBE',status:stopReason,comparisonComplete:comparisonIsComplete({stopReason,updates:seq,accounts,logComplete,costFilterEnabled:config.costFilterEnabled}),startedAt:new Date(began).toISOString(),createdAt:new Date().toISOString(),elapsedMs:Date.now()-began,config,pricing,accounts,decisions,curves:engine.curves,failures:engine.failures,metrics:{messages,updates:seq,outOfOrderDropped:dropped,maxConcurrentRequests:engine.maxActiveRequests,pendingUpdatesCoalesced:engine.loop.coalesced,featureLatencyMs:distribution(engine.featureLatencyMs),spreadJPY:distribution(quotes.map(q=>q.ask-q.bid)),sourceAgeMs:distribution(quotes.map(q=>q.receivedMs-q.sourceMs)),inputTokensOnCompletedCalls:input,outputTokensOnCompletedCalls:out,aiCostUSD:null,aiEstimatedCostUSD,aiEstimatedCostJPY:aiEstimatedCostUSD!==null&&latest?aiEstimatedCostUSD*(latest.bid+latest.ask)/2:null,entryGatePassRatePct:gates.length?gates.filter(g=>g.allowed).length/gates.length*100:null,maxPastRiseBps:gates.length?gates.reduce((v,g)=>Math.max(v,g.observedRiseBps),-Infinity):null,minRequiredRiseBps:gates.length?gates.reduce((v,g)=>Math.min(v,g.requiredRiseBps),Infinity):null,auditLog:{complete:logComplete,backpressureEvents:writer.backpressureEvents,maxBufferedBytes:writer.maxBufferedBytes}},limitations:['No real orders; short forward-time functional probe, not evidence of profitability','Only fully funded long positions; FX margin, short sales and liquidation not simulated','Public feed has no sizes; full configured order fill is assumed, not measured','Per-side 0.001 JPY/USD slippage is assumed; fee rounding, tax and funding costs not replicated',config.costFilterEnabled?'Historical 5s movement gate is not a forecast; raw actions and vetoes separately recorded':'No trailing-5s entry gate; fees, spread and adverse slippage still apply','Jev actual billing unknown; displayed estimate covers successful reported tokens only and uses final quote midpoint for JPY conversion','No swap valuation: stop before JST 06:00 boundary','Freshness cutoff 5s, future tolerance 1s, feed silence 10s; these are safety checks, not decision intervals']};
await writeFile(resolve(output,'results.json'),JSON.stringify(result,null,2));await writeFile(resolve(output,'index.html'),renderFxReport(result));
console.log(JSON.stringify({phase:'complete',output,status:stopReason,comparisonComplete:result.comparisonComplete,metrics:result.metrics,accounts:compact()}));if(!result.comparisonComplete)process.exitCode=2;
