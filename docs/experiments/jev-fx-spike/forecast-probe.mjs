// Throwaway live forecast evaluation. Public feed only; deliberately no order API.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {openSync,appendFileSync,fsyncSync,closeSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {LatestOnly,distribution} from './live-core.mjs';
import {parseFxTicker} from './fx-adapter.mjs';
import {horizons,forecastInput,validateForecast,forecastRecovery,scoreForecast,summarizeForecast} from './forecast-core.mjs';

async function main(){
 const args=process.argv.slice(2),duration=Number(args[args.indexOf('--collect-seconds')+1]);
 if(!args.includes('--collect-seconds')||!Number.isFinite(duration)||duration<=0)throw Error('Specify --collect-seconds');
 const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../../..');
 try{process.loadEnvFile(resolve(root,'.env'));}catch(e){if(e.code!=='ENOENT')throw Error('ENV_LOAD_FAILED');}
 if(!process.env.AI_GATEWAY_API_KEY)throw Error('MISSING_GATEWAY_KEY');
 const {experimental_evaluate:evaluate}=await import('ai'),model='typesafe-ai/jev';
 const serviceResponse=await fetch('https://forex-api.coin.z.com/public/v1/status',{signal:AbortSignal.timeout(10000)});
 if(!serviceResponse.ok)throw Error('PUBLIC_PREFLIGHT_FAILED');const service=await serviceResponse.json();
 if(service.status!==0||service.data?.status!=='OPEN')throw Error('FX_SERVICE_NOT_OPEN');
 let pricing=null;try{const r=await fetch('https://ai-gateway.vercel.sh/v1/models',{signal:AbortSignal.timeout(10000)});if(r.ok){const p=(await r.json()).data?.find(m=>m.id===model)?.pricing;if(p)pricing={...p,retrievedAt:new Date().toISOString(),source:'https://ai-gateway.vercel.sh/v1/models'};}}catch{}
 const output=resolve(root,'reports',`jev-usdjpy-forecast-${new Date().toISOString().replaceAll(':','-')}`);await mkdir(output,{recursive:true});
 const hash=data=>createHash('sha256').update(data).digest('hex');
 const config={symbol:'USD/JPY',warmupSeconds:60,collectSeconds:duration,settlementSeconds:61,horizonsMs:horizons,model,feed:'wss://forex-api.coin.z.com/ws/public/v1',maxConcurrentRequests:1,fixedDecisionIntervalMs:null,targetQuoteToleranceMs:1000,definition:'Sign of future midpoint minus input midpoint, at half-tick0.0005JPY resolution. Not uncertainty, profit or an executable return.',anchor:'Latest input quote local receipt time. First valid quote received at/after anchor+horizon, at most1s late. Model forecast must be durably saved before target time and before outcome quote.',baselines:['alwaysUp','alwaysDown','alwaysFlat','momentum: sign of past same-horizon return','reversal: opposite sign of past same-horizon return'],noOrders:true};
 const codeHashes=Object.fromEntries(await Promise.all(['forecast-probe.mjs','forecast-core.mjs','live-core.mjs','fx-adapter.mjs','fx-recovery.mjs'].map(async f=>[f,hash(await readFile(resolve(here,f)))])));
 const questions=forecastInput([{seq:1,receivedMs:0,bid:150,ask:150.005,bidQty:100,askQty:100}]).payload.questions;
 await writeFile(resolve(output,'protocol.json'),JSON.stringify({createdAt:new Date().toISOString(),config,questions,pricing,service,codeHashes},null,2));
 const fd=openSync(resolve(output,'events.ndjson'),'wx'),abort=new AbortController(),quotes=[],history=[],predictions=[],failures=[];
 let stopped=false,collecting=false,collectStartedMs=null,seq=0,requestId=0,dropped=0,consecutiveFailures=0,lastMessageMs=Date.now(),stopReason,logComplete=true;
 let collectionTimer,settleTimer,startupTimer,watchdog,progress,ws,finish;
 const began=Date.now(),finished=new Promise(r=>finish=r);
 const log=event=>{appendFileSync(fd,JSON.stringify(event)+'\n');};
 function stop(reason){if(stopped)return;stopped=true;collecting=false;stopReason=reason;loop.stop();abort.abort();for(const t of [collectionTimer,settleTimer,startupTimer,watchdog,progress])clearTimeout(t);ws?.close();finish();}
 const loop=new LatestOnly(async()=>{
  if(!collecting||stopped)return;
  const id=++requestId,input=forecastInput(history),startedMs=Date.now(),payloadHash=hash(JSON.stringify(input.payload));
  log({type:'forecast-start',id,startedMs,input,payloadHash});
  let response;
  try{response=await evaluate({model,...input.payload,maxRetries:0,abortSignal:AbortSignal.any([abort.signal,AbortSignal.timeout(20000)])});}
  catch(error){if(!collecting||stopped){log({type:'forecast-cancelled',id,atMs:Date.now()});return;}throw error;}
  if(!collecting||stopped){log({type:'forecast-cancelled',id,atMs:Date.now()});return;}
  const answers=validateForecast(response.answers);
  const prepared={type:'forecast-prepared',id,preparedMs:Date.now(),answers,model:response.response.modelId,usage:{inputTokens:response.usage.inputTokens??null,outputTokens:response.usage.outputTokens??null},payloadHash};
  // Commit the actual answers to disk before timestamping their eligibility.
  log(prepared);fsyncSync(fd);
  const committedMs=Date.now(),committedSeq=seq;
  log({type:'forecast-commit',id,committedMs,committedSeq});fsyncSync(fd);
  predictions.push({id,input,answers,committedMs,committedSeq,model:prepared.model,usage:prepared.usage,elapsedMs:committedMs-startedMs});consecutiveFailures=0;
 },async error=>{
  if(!collecting||stopped)return false;
  const recovery=forecastRecovery(error,++consecutiveFailures);
  const failure={id:requestId,atMs:Date.now(),category:recovery.category,...(Number.isInteger(error?.statusCode)?{status:error.statusCode}:{})};
  failures.push(failure);try{log({type:'forecast-failure',...failure});}catch{logComplete=false;stop('LOG_WRITE_ERROR');return false;}
  const delay=recovery.waitMs;if(delay===null||delay>60000){stop('MODEL_OR_LOG_FAILURE');return false;}
  await new Promise(r=>{const done=()=>{clearTimeout(t);abort.signal.removeEventListener('abort',done);r();};const t=setTimeout(done,delay);abort.signal.addEventListener('abort',done,{once:true});});return collecting&&!stopped;
 });
 ws=new WebSocket(config.feed);
 ws.addEventListener('open',()=>ws.send(JSON.stringify({command:'subscribe',channel:'ticker',symbol:'USD_JPY'})));
 ws.addEventListener('message',event=>{
  if(stopped)return;const receivedMs=Date.now();lastMessageMs=receivedMs;
  try{
   const message=JSON.parse(event.data);log({type:'feed-message',receivedMs,message});
   const q=parseFxTicker(message,seq+1,receivedMs,{tradeQuantityUSD:100});
   if(quotes.length&&q.sourceMs<quotes.at(-1).sourceMs){dropped++;return;}
   if(quotes.length&&q.receivedMs<quotes.at(-1).receivedMs){stop('LOCAL_CLOCK_REVERSED');return;}
   seq++;log({type:'quote',...q});quotes.push(q);history.push(q);
   while(history.length>2&&history[1].receivedMs<q.receivedMs-60000)history.shift();
   if(collectStartedMs===null&&q.receivedMs-history[0].receivedMs>=60000){
    collectStartedMs=Date.now();collecting=true;clearTimeout(startupTimer);log({type:'collection-start',atMs:collectStartedMs});
    collectionTimer=setTimeout(()=>{collecting=false;loop.stop();abort.abort();log({type:'collection-end',atMs:Date.now()});settleTimer=setTimeout(()=>stop('MEASUREMENT_COMPLETE'),61000);},duration*1000);
   }
   if(collecting)loop.offer(q.seq);
  }catch(error){stop(['FX_CLOSED_OR_INVALID_SYMBOL','FX_INVALID_QUOTE','FX_STALE_QUOTE','FX_FUTURE_QUOTE'].includes(error?.message)?error.message:'FEED_OR_LOG_FAILURE');}
 });
 ws.addEventListener('error',()=>stop('FEED_CONNECTION_ERROR'));ws.addEventListener('close',()=>{if(!stopped)stop('FEED_DISCONNECTED');});process.once('SIGINT',()=>stop('USER_INTERRUPTED'));
 startupTimer=setTimeout(()=>stop('WARMUP_TIMEOUT'),90000);
 watchdog=setInterval(()=>{if(Date.now()-lastMessageMs>10000)stop('FEED_SILENT');},1000);
 progress=setInterval(()=>console.log(JSON.stringify({phase:collectStartedMs===null?'warming':collecting?'forecasting':'settling',elapsedSeconds:Math.round((Date.now()-began)/1000),quotes:seq,committed:predictions.length,failed:failures.length})),30000);
 console.log(JSON.stringify({phase:'started',output,config}));
 await finished;await loop.idle();
 try{log({type:'stop',reason:stopReason,atMs:Date.now()});fsyncSync(fd);}catch{logComplete=false;}finally{closeSync(fd);}
 const scores=predictions.flatMap(p=>horizons.map(h=>scoreForecast(p,h,quotes))),summary=horizons.map(h=>summarizeForecast(scores,h));
 const tokens=k=>predictions.some(p=>p.usage[k]===null)?null:predictions.reduce((n,p)=>n+p.usage[k],0),inputTokens=tokens('inputTokens'),outputTokens=tokens('outputTokens');
 const estimate=pricing&&inputTokens!==null&&outputTokens!==null&&Number.isFinite(Number(pricing.input))&&Number.isFinite(Number(pricing.output))?inputTokens*Number(pricing.input)+outputTokens*Number(pricing.output):null;
 const result={kind:'FORWARD_TIME_DIRECTION_FORECAST',status:stopReason,complete:stopReason==='MEASUREMENT_COMPLETE'&&logComplete&&predictions.length>0&&summary.every(s=>s.scored>0),startedAt:new Date(began).toISOString(),elapsedMs:Date.now()-began,collectStartedMs,config,quotes:quotes.length,dropped,startedRequests:requestId,committedPredictions:predictions.length,failures,latencyMs:distribution(predictions.map(p=>p.elapsedMs)),summary,scores,inputTokens,outputTokens,estimatedSuccessfulTokenCostUSD:estimate,actualAICostUSD:null,logComplete,eventHash:hash(await readFile(resolve(output,'events.ndjson'))),limitations:['Only a short live technical pilot, not evidence of tradable edge or profitability','Overlapping forecasts share outcomes; raw counts are not independent samples; nonoverlap subset is also not guaranteed independent','Baselines are scored on exactly the same timely successful Jev inputs; failures and expired forecasts are separately disclosed','Midpoint direction ignores spread, fees, slippage, move size and execution','Flat means unchanged price, not an uncertain forecast; forecasts are not abstentions','No model tuning, best-horizon selection or strategy deployment follows this pilot automatically']};
 await writeFile(resolve(output,'results.json'),JSON.stringify(result,null,2));
 const pct=x=>x===null?'—':(x*100).toFixed(1)+'%',names={jev:'Jev',alwaysUp:'常に上',alwaysDown:'常に下',alwaysFlat:'常に同値',momentum:'直近と同方向',reversal:'直近と逆方向'};
 const rows=summary.map(s=>`<tr><th>${s.horizonMs/1000}秒</th><td>${s.scored}/${s.planned}</td><td>${s.exclusions.late}</td><td>${s.truthCounts.up}/${s.truthCounts.down}/${s.truthCounts.flat}</td>${Object.keys(names).map(m=>`<td>${pct(s.methods[m].accuracy)}</td>`).join('')}</tr>`).join('');
 const nonoverlap=summary.map(s=>`<tr><th>${s.horizonMs/1000}秒</th><td>${s.nonOverlapping.scored}</td>${Object.keys(names).map(m=>`<td>${pct(s.nonOverlapping.methods[m].accuracy)}</td>`).join('')}</tr>`).join('');
 const probrows=summary.map(s=>`<tr><th>${s.horizonMs/1000}秒</th><td>${s.methods.jev.predictedCounts.up}/${s.methods.jev.predictedCounts.down}/${s.methods.jev.predictedCounts.flat}</td><td>${s.methods.jev.meanBrier===null?'—':s.methods.jev.meanBrier.toFixed(3)}</td><td>${pct(s.methods.jev.macroRecallObservedClasses)}</td><td>${s.exclusions.missing_future_quote+s.exclusions.outcome_not_after_commit}</td></tr>`).join('');
 await writeFile(resolve(output,'index.html'),`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Jevのドル円予測・未来照合</title><style>body{font:16px/1.8 system-ui;background:#f5f7fa;color:#23313c;margin:24px auto;max-width:1200px;padding:0 16px}table{border-collapse:collapse;white-space:nowrap;width:100%;background:white}td,th{padding:8px;border-bottom:1px solid #ddd;text-align:right}.scroll{overflow:auto}p{max-width:90ch}h1{font-size:1.8rem}</style><h1>Jevの予測を、後から届くドル円価格で採点</h1><p>${result.complete?'測定完了':'測定未完了'}。記録済み予測 ${predictions.length}件 × 4時間幅。API失敗 ${failures.length}件。実売買・仮想売買ともに行っていません。</p><p>過去60秒の観測から、入力時点の1・5・30・60秒先の仲値が上・下・同値になるかを予測。回答をディスクへ保存した後に届く価格で採点します。回答期限を過ぎた予測は「期限切れ」として除外し、同じ対象で単純ルールを比較します。</p><h2>一致率（重複する予測を含む）</h2><div class="scroll"><table><thead><tr><th>予測先</th><th>採点/記録</th><th>期限切れ</th><th>実際 上/下/同</th>${Object.values(names).map(n=>`<th>${n}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div><h2>時間区間が重ならない予測だけの参考値</h2><p>最初の採点可能な予測から、直前の答え合わせ後に開始した予測を順番に選びます。独立性を保証するものではありません。特に60秒先は、この短時間測定では数件しか残りません。</p><div class="scroll"><table><thead><tr><th>予測先</th><th>件数</th>${Object.values(names).map(n=>`<th>${n}</th>`).join('')}</tr></thead><tbody>${nonoverlap}</tbody></table></div><h2>予測の偏りと確率評価</h2><div class="scroll"><table><thead><tr><th>予測先</th><th>Jev 上/下/同</th><th>Brier値</th><th>実出現クラスの平均再現率</th><th>価格欠測等</th></tr></thead><tbody>${probrows}</tbody></table></div><p>Brier値は3クラスの確率誤差の二乗和の平均で、0が最良、最大2です。常に各クラス1/3なら約0.667。「同値」は価格が変わらないことを指し、分からない・見送りではありません。</p><p><strong>これは予測の動作検証で、収益性の証明ではありません。</strong>予測収集は${duration}秒だけです。重複する予測を大量の独立標本とは扱えません。仲値の方向だけを採点し、値幅・手数料・スプレッド・約定ずれは損益評価していません。特定の時間幅が良く見えても、別の時間帯での再検証が必要です。</p><p>入力ごとに常に上・下・同値、同じ長さの過去変化と同方向・逆方向を事前に固定。将来データや保有状態をJevへ渡していません。期限は入力の受信時刻基準、答え合わせは期限後最初の気配（許容遅れ1秒）。この1秒は判断間隔ではありません。</p><p>全処理 ${(result.elapsedMs/1000).toFixed(1)}秒。推論待ち中央値 ${result.latencyMs?.p50??'不明'}ms。正常応答分の利用料概算 ${estimate===null?'不明':estimate.toFixed(6)+' USD'}。失敗・中断分と実請求額は不明。</p><p><a href="results.json">全採点結果</a> · <a href="protocol.json">事前の比較条件</a> · <a href="events.ndjson">時系列の入力・予測・価格ログ</a></p></html>`);
 console.log(JSON.stringify({phase:'complete',output,status:result.status,complete:result.complete,committed:predictions.length,summary,failures:failures.length,estimatedSuccessfulTokenCostUSD:estimate}));if(!result.complete)process.exitCode=2;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
