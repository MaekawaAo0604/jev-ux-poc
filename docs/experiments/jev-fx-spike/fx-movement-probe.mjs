// Throwaway amplitude-sensitivity probe; no order execution or live defaults.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile,appendFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {marketFeatures,actionChoice} from './live-core.mjs';
import {fxBalancedQuestions} from './fx-adapter.mjs';
import {fxRecoveryWait} from './fx-recovery.mjs';

const factors=[-4,-1,0,.5,1,2,4,8],repeats=3;
const hash=data=>createHash('sha256').update(data).digest('hex');
const mid=q=>(q.bid+q.ask)/2;
const window5=state=>state.market.windows.find(w=>w.windowMs===5000);

export function scaleHistory(quotes,factor){
 if(!quotes.length||!Number.isFinite(factor))throw Error('INVALID_AMPLITUDE');
 const anchor=mid(quotes.at(-1));
 return quotes.map((q,i)=>{
  if(![q.bid,q.ask].every(Number.isFinite)||q.bid<=0||q.ask<q.bid)throw Error('INVALID_QUOTE');
  if(factor===1||i===quotes.length-1)return {...q};
  const center=anchor+factor*(mid(q)-anchor),halfSpread=(q.ask-q.bid)/2;
  const scaled={...q,bid:center-halfSpread,ask:center+halfSpread};
  if(!Number.isFinite(scaled.ask)||scaled.bid<=0)throw Error('INVALID_SCALED_PRICE');
  return scaled;
 });
}

export function movementPayload(original,quotes,factor){
 const marketFor=history=>{const market={...original.market,...marketFeatures(history)};delete market.topBookImbalance;return market;};
 assert.deepEqual(marketFor(quotes),original.market,'SOURCE_FEATURE_MISMATCH');
 const state=structuredClone(original);delete state.execution.entryCostFilter;
 state.market=marketFor(scaleHistory(quotes,factor));
 return {state,questions:fxBalancedQuestions()};
}

export function selectMovementSources(starts,allowedIds,count=4){
 const ids=new Set(allowedIds);
 const eligible=starts.filter(s=>s.type==='decision-start'&&s.strategy==='jev'&&ids.has(s.id)&&s.state.account.position==='flat'&&s.state.market.windows.every(w=>w.complete)&&window5(s.state)?.returnBps>0)
  .sort((a,b)=>window5(a.state).returnBps-window5(b.state).returnBps||a.id-b.id);
 if(!Number.isSafeInteger(count)||count<2||eligible.length<count)throw Error('INSUFFICIENT_MATURE_POSITIVE_INPUTS');
 return Array.from({length:count},(_,i)=>eligible[Math.round(i*(eligible.length-1)/(count-1))]);
}

export function buildMovementCases(sources){
 const cases=[];
 for(let repeat=0;repeat<repeats;repeat++)for(const [index,s]of sources.entries()){
  const rotated=factors.map((_,i)=>factors[(i+index+repeat)%factors.length]);
  for(const factor of repeat%2?rotated.reverse():rotated)cases.push({id:`${s.id}:${factor}:${repeat+1}`,sourceId:s.id,factor,repeat:repeat+1,payload:movementPayload(s.state,s.quotes,factor)});
 }
 return cases;
}

export function summarizeMovement(cases,responses){
 const byId=new Map(responses.map(r=>[r.id,r]));
 return [...new Set(cases.map(c=>c.factor))].sort((a,b)=>a-b).map(factor=>{
  const group=cases.filter(c=>c.factor===factor),done=group.map(c=>byId.get(c.id)).filter(r=>r?.choice),moves=group.map(c=>window5(c.payload.state).returnBps);
  return {factor,planned:group.length,completed:done.length,return5sBps:{min:Math.min(...moves),max:Math.max(...moves)},actions:Object.fromEntries(['buy','sell','keep'].map(action=>[action,done.filter(r=>r.choice===action).length])),meanBuyChoiceProbability:done.length?done.reduce((n,r)=>n+r.answer.probabilities.buy,0)/done.length:null};
 });
}

async function main(){
 const args=process.argv.slice(2);if(!args[0])throw Error('Specify previous prompt comparison report');
 const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../../..'),previous=resolve(args[0]);
 const previousText=await readFile(resolve(previous,'protocol.json'),'utf8'),prior=JSON.parse(previousText);
 assert.equal(prior.kind,'MATCHED_INPUT_PROMPT_ABLATION');assert.deepEqual(prior.questions.balanced,fxBalancedQuestions());
 const source=prior.source,eventText=await readFile(resolve(source,'events.ndjson'),'utf8');
 assert.equal(hash(eventText),prior.sourceEventsHash);
 const events=eventText.trim().split('\n').map(JSON.parse),allQuotes=events.filter(e=>e.type==='quote');
 const selected=selectMovementSources(events,prior.selectedIds);
 const sources=selected.map(s=>{
  const available=allQuotes.filter(q=>q.seq<=s.inputSeq),last=available.at(-1);assert.equal(last.seq,s.inputSeq);assert.equal(last.receivedMs,s.inputReceivedMs);
  const firstInside=available.findIndex(q=>q.receivedMs>=last.receivedMs-60000);
  const quotes=available.slice(Math.max(0,firstInside-1));
  return {id:s.id,inputSeq:s.inputSeq,state:s.state,quotes};
 });
 const cases=buildMovementCases(sources),sourceRanges=[1000,5000,30000,60000].map(ms=>{
  const values=events.filter(e=>e.type==='decision-start'&&e.strategy==='jev'&&e.state.market.windows.every(w=>w.complete)).map(e=>e.state.market.windows.find(w=>w.windowMs===ms).returnBps);
  return {windowMs:ms,minBps:Math.min(...values),maxBps:Math.max(...values)};
 });
 if(args.includes('--dry-run')){console.log(JSON.stringify({sources:sources.map(s=>({id:s.id,return5sBps:window5(s.state).returnBps})),planned:cases.length,sourceRanges,summary:summarizeMovement(cases,[])}));return;}
 try{process.loadEnvFile(resolve(root,'.env'));}catch(e){if(e.code!=='ENOENT')throw Error('ENV_LOAD_FAILED');}
 if(!process.env.AI_GATEWAY_API_KEY)throw Error('MISSING_GATEWAY_KEY');
 const model=prior.model,{experimental_evaluate:evaluate}=await import('ai');
 let pricing=null;try{const response=await fetch('https://ai-gateway.vercel.sh/v1/models',{signal:AbortSignal.timeout(10000)});if(response.ok){const p=(await response.json()).data?.find(m=>m.id===model)?.pricing;if(p)pricing={model,...p,retrievedAt:new Date().toISOString(),source:'https://ai-gateway.vercel.sh/v1/models'};}}catch{}
 const output=resolve(root,'reports',`jev-usdjpy-movement-probe-${new Date().toISOString().replaceAll(':','-')}`);await mkdir(output,{recursive:true});
 const codeHashes=Object.fromEntries(await Promise.all(['fx-movement-probe.mjs','fx-adapter.mjs','live-core.mjs','fx-recovery.mjs'].map(async f=>[f,hash(await readFile(resolve(here,f)))])));
 const caseText=JSON.stringify(cases,null,2);
 const protocol={kind:'SYNTHETIC_AMPLITUDE_SENSITIVITY',source,previous,sourceEventsHash:hash(eventText),previousProtocolHash:hash(previousText),codeHashes,casesHash:hash(caseText),model,pricing,factors,repeats,sourceRanges,sources,questions:fxBalancedQuestions(),plannedCalls:cases.length,
  selection:'Four evenly ranked positive 5s-return inputs with all windows complete, taken only from the previous 48-input sample. No model responses or future prices used.',
  transformation:'Pin latest midpoint and bid/ask. Historical midpoint = latest midpoint + factor * (original historical midpoint - latest midpoint). Preserve timestamps and absolute spreads; recompute every market feature using marketFeatures. Negative factors reverse direction. Synthetic prices are not broker-tick-rounded.',
  invariants:'Identical balanced prompt, flat account, costs, latest quote, quantity and no-short policy within each source. Entry gate removed in every case. No scenario labels, source IDs, scale factors or test instructions sent to the model.',
  execution:'Single-flight sequential requests; cyclic rotated factor order, reversed on alternate repeat. Three responses per source/factor; max two transient retries per request,20s timeout. No fills or PnL.'};
 await writeFile(resolve(output,'protocol.json'),JSON.stringify(protocol,null,2));await writeFile(resolve(output,'cases.json'),caseText);
 const responses=[],failures=[],began=Date.now();let halted=false;
 console.log(JSON.stringify({phase:'started',output,planned:cases.length,sources:sources.map(s=>s.id),factors,repeats,noOrders:true}));
 for(const c of cases){
  for(let attempt=1;attempt<=3;attempt++){
   const beganCall=performance.now();let record;
   try{
    const response=await evaluate({model,...c.payload,maxRetries:0,abortSignal:AbortSignal.timeout(20000)}),choice=actionChoice(response.answers.action);
    record={id:c.id,sourceId:c.sourceId,factor:c.factor,repeat:c.repeat,choice,answer:response.answers.action,requestHash:hash(JSON.stringify(c.payload)),model:response.response.modelId,usage:{inputTokens:response.usage.inputTokens??null,outputTokens:response.usage.outputTokens??null},elapsedMs:performance.now()-beganCall,attempt};
   }catch(error){
    // Never persist raw exception messages, provider headers or request bodies.
    const failure={id:c.id,attempt,name:['AbortError','TimeoutError'].includes(error?.name)?error.name:'REQUEST_OR_VALIDATION_ERROR',...(Number.isInteger(error?.statusCode)?{status:error.statusCode}:{})};
    failures.push(failure);await appendFile(resolve(output,'failures.ndjson'),JSON.stringify(failure)+'\n');
    const delay=fxRecoveryWait(error,attempt);if(delay===null||delay>60000){halted=true;break;}await new Promise(r=>setTimeout(r,delay));continue;
   }
   // A failed local audit write stops the process; never retry a paid decision for it.
   await appendFile(resolve(output,'responses.ndjson'),JSON.stringify(record)+'\n');responses.push(record);break;
  }
  if(halted)break;
  if(responses.length%8===0)console.log(JSON.stringify({phase:'progress',completed:responses.length,planned:cases.length,buy:responses.filter(r=>r.choice==='buy').length}));
 }
 const tokens=key=>responses.some(r=>r.usage[key]===null)?null:responses.reduce((n,r)=>n+r.usage[key],0),input=tokens('inputTokens'),out=tokens('outputTokens');
 const estimate=pricing&&input!==null&&out!==null&&Number.isFinite(Number(pricing.input))&&Number.isFinite(Number(pricing.output))?input*Number(pricing.input)+out*Number(pricing.output):null;
 const result={kind:protocol.kind,status:!halted&&responses.length===cases.length?'COMPLETE':'INCOMPLETE',elapsedMs:Date.now()-began,planned:cases.length,completed:responses.length,summary:summarizeMovement(cases,responses),responses,failures,inputTokens:input,outputTokens:out,estimatedSuccessfulTokenCostUSD:estimate,actualAICostUSD:null,
  limitations:['Synthetic counterfactuals, not current or historical traded prices, except factor1 baseline','Selected rising 5s paths only; not representative market frequencies; overlapping histories are not independent market samples','Three draws per condition describe limited output variability; they do not establish statistical significance or profitability','Flat account cannot test selling an existing position; shorting is unavailable','Amplitude changes all historical movement features jointly while preserving each path shape; no future price labels, fills or PnL','Synthetic prices are not broker-tick-rounded; this tests model input sensitivity only']};
 await writeFile(resolve(output,'results.json'),JSON.stringify(result,null,2));
 const label=f=>f<0?`反転 ${Math.abs(f)}倍`:f===1?'1倍（実測）':`${f}倍（合成）`;
 const rows=result.summary.map(s=>`<tr><th>${label(s.factor)}</th><td>${s.completed}/${s.planned}</td><td>${s.return5sBps.min.toFixed(3)}〜${s.return5sBps.max.toFixed(3)}</td><td>${s.actions.buy}</td><td>${s.actions.sell}</td><td>${s.actions.keep}</td><td>${s.meanBuyChoiceProbability===null?'未取得':(s.meanBuyChoiceProbability*100).toFixed(1)+'%'}</td></tr>`).join('');
 const sourceRows=sources.map(s=>`<tr><th>${s.id}</th>${factors.map(f=>{const done=responses.filter(r=>r.sourceId===s.id&&r.factor===f);return `<td>${done.filter(r=>r.choice==='buy').length}/${done.length}</td>`;}).join('')}</tr>`).join('');
 await writeFile(resolve(output,'index.html'),`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>値動きの大きさとJevの判断</title><style>body{font:16px/1.8 system-ui;background:#f5f7fa;color:#23313c;margin:24px auto;max-width:1050px;padding:0 16px}table{border-collapse:collapse;white-space:nowrap;width:100%;background:white}td,th{padding:8px;border-bottom:1px solid #ddd;text-align:right}.scroll{overflow:auto}p{max-width:85ch}h1{font-size:1.8rem}</style><h1>値動きを大きくすると、Jevは買うか</h1><p>${result.status==='COMPLETE'?'完了':'未完了'}：${result.completed}/${result.planned}回。購入 ${responses.filter(r=>r.choice==='buy').length}回、売却 ${responses.filter(r=>r.choice==='sell').length}回、キープ ${responses.filter(r=>r.choice==='keep').length}回。</p><p><strong>合成入力による反応テストです。収益性の検証ではありません。</strong>実測の4経路を選び、過去の価格の振れ幅だけを変更。現在価格・費用・未保有状態・新指示は固定し、購入ゲートは全条件で無効です。</p><h2>大きさ別の選択</h2><p>各条件は4経路×3回。負の倍率は上下反転の対照です。「買う報告確率」はモデルの返答値であり、利益が出る確率ではありません。1 bp = 0.01%。</p><div class="scroll"><table><thead><tr><th>過去の振れ幅</th><th>完了/予定</th><th>5秒変化（bp）</th><th>買う</th><th>売る</th><th>維持</th><th>買う報告確率・平均</th></tr></thead><tbody>${rows}</tbody></table></div><h2>経路別の購入回数</h2><p>各セルは「買う／正常応答数」。各経路は独立した市場標本とは限りません。</p><div class="scroll"><table><thead><tr><th>元入力ID</th>${factors.map(f=>`<th>${label(f)}</th>`).join('')}</tr></thead><tbody>${sourceRows}</tbody></table></div><h2>解釈の範囲</h2><p>前回の48入力から、60秒分そろい、5秒の変化が正の入力を選び、上昇幅の順位で4件を抽出しました。未来の価格やJevの回答では選んでいません。現在価格を基準に過去価格の偏差を拡大し、1・5・30・60秒の特徴量と直近列をすべて再計算しています。</p><p>1倍以外は架空の価格列で、実際にその動きがあったわけではありません。呼値単位への丸めも行っていません。繰り返しは各条件3回だけなので、ばらつきの確認は限定的です。保有後の売却判断、約定、損益は測定していません。通常運転のコードや指示は変更していません。</p><p>処理時間 ${(result.elapsedMs/1000).toFixed(1)}秒。API失敗 ${failures.length}件。正常応答分の利用料概算 ${estimate===null?'不明':estimate.toFixed(6)+' USD'}。失敗分と実請求額は不明。</p><p><a href="results.json">全返答</a> · <a href="protocol.json">比較条件・元価格列</a> · <a href="cases.json">実際の入力</a></p></html>`);
 console.log(JSON.stringify({phase:'complete',output,status:result.status,elapsedMs:result.elapsedMs,summary:result.summary,failures:failures.length,estimatedSuccessfulTokenCostUSD:estimate}));if(halted)process.exitCode=2;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
