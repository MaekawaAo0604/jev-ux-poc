// Throwaway matched-input decision probe. It never executes orders, even paper ones.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {fxQuestions,fxBalancedQuestions} from './fx-adapter.mjs';
import {actionChoice} from './live-core.mjs';
import {fxRecoveryWait} from './fx-recovery.mjs';

export function payloadForArm(original,enabled){
 const state=structuredClone(original);if(!enabled)delete state.execution.entryCostFilter;
 return {state,questions:fxQuestions(enabled)};
}
export function comparisonDefinition(comparePrompts=false){
 if(comparePrompts)return {
  kind:'MATCHED_INPUT_PROMPT_ABLATION',prefix:'jev-usdjpy-prompt-ablation',arms:['legacy','balanced'],labels:['旧指示','新指示'],
  title:'同じ入力でJevの判断指示を比較',description:'両方とも購入ゲートを外し、価格・費用・保有状態を同一にして、判断指示だけを変えています。',
  payload(original,arm){
   if(!['legacy','balanced'].includes(arm))throw Error('INVALID_PROMPT_ARM');
   const state=structuredClone(original);delete state.execution.entryCostFilter;
   return {state,questions:arm==='legacy'?fxQuestions(false):fxBalancedQuestions()};
  },
 };
 return {kind:'MATCHED_INPUT_GATE_ABLATION',prefix:'jev-usdjpy-entry-ablation',arms:['on','off'],labels:['制限あり','制限なし'],title:'同じ入力で購入制限を外した結果',description:'手数料などの費用は変えていません。',payload:(original,arm)=>payloadForArm(original,arm==='on')};
}
export function selectReplayInputs(events,count){
 if(!Number.isSafeInteger(count)||count<1)throw Error('INVALID_SAMPLE_COUNT');
 const starts=events.filter(e=>e.type==='decision-start'&&e.strategy==='jev');if(!starts.length)throw Error('NO_JEV_INPUTS');
 const chosen=new Set(),n=Math.min(count,starts.length);
 for(let i=0;i<n;i++)chosen.add(n===1?0:Math.round(i*(starts.length-1)/(n-1)));
 starts.forEach((e,i)=>{if(e.state.execution.entryCostFilter?.allowed)chosen.add(i);});
 return [...chosen].sort((a,b)=>a-b).map(i=>starts[i]);
}

async function main(){
 const args=process.argv.slice(2),sourceArg=args[0],count=Number(args[args.indexOf('--samples')+1]);
 if(!sourceArg||!args.includes('--samples'))throw Error('Specify source report and --samples');
 const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../../..'),source=resolve(sourceArg);
 const [eventText,protocolText]=await Promise.all(['events.ndjson','protocol.json'].map(f=>readFile(resolve(source,f),'utf8')));
 const events=eventText.trim().split('\n').map(JSON.parse),protocol=JSON.parse(protocolText);
 assert.equal(protocol.config.symbol,'USD/JPY');assert.equal(protocol.config.costFilterEnabled,true);
 assert.deepEqual(fxQuestions(true),protocol.questions,'control prompt must exactly match the source experiment');
 const selected=selectReplayInputs(events,count);
 const comparison=comparisonDefinition(args.includes('--compare-prompts')),[firstArm,secondArm]=comparison.arms;
 try{process.loadEnvFile(resolve(root,'.env'));}catch(e){if(e.code!=='ENOENT')throw Error('ENV_LOAD_FAILED');}
 if(!process.env.AI_GATEWAY_API_KEY)throw Error('MISSING_GATEWAY_KEY');
 const model=protocol.pricing?.model??'typesafe-ai/jev';
 const {experimental_evaluate:evaluate}=await import('ai');
 let pricing=null;try{const response=await fetch('https://ai-gateway.vercel.sh/v1/models',{signal:AbortSignal.timeout(10000)});if(response.ok){const p=(await response.json()).data?.find(m=>m.id===model)?.pricing;if(p)pricing={model,...p,retrievedAt:new Date().toISOString(),source:'https://ai-gateway.vercel.sh/v1/models'};}}catch{}
 const output=resolve(root,'reports',`${comparison.prefix}-${new Date().toISOString().replaceAll(':','-')}`);await mkdir(output,{recursive:true});
 const hashes=Object.fromEntries(await Promise.all(['fx-ablation.mjs','fx-adapter.mjs','live-core.mjs','fx-recovery.mjs'].map(async f=>[f,createHash('sha256').update(await readFile(resolve(here,f))).digest('hex')])));
 await writeFile(resolve(output,'protocol.json'),JSON.stringify({kind:comparison.kind,source,sourceEventsHash:createHash('sha256').update(eventText).digest('hex'),sourceProtocolHash:createHash('sha256').update(protocolText).digest('hex'),codeHashes:hashes,model,pricing,requestedUniformSamples:count,selection:'Equally spaced original request indices plus every gate-eligible input; includes no future outcome filtering. Enriched sample, not representative trading frequency.',selectedIds:selected.map(s=>s.id),arms:comparison.arms,questions:Object.fromEntries(comparison.arms.map(arm=>[arm,comparison.payload(selected[0].state,arm).questions])),execution:'Sequential paired requests, alternating which arm runs first; max2 retries after first attempt,20s timeout, no trades, no synthesized PnL. Original account remains fixed for each matched state.'},null,2));
 const cases=[],failures=[],began=Date.now();let halted=false;
 console.log(JSON.stringify({phase:'started',output,pairedInputs:selected.length,modelCallsBeforeRetries:selected.length*2,noOrders:true}));
 for(const [index,s]of selected.entries()){
  const record={id:s.id,inputSeq:s.inputSeq,inputGateAllowed:s.state.execution.entryCostFilter.allowed,state:structuredClone(s.state),arms:{}};cases.push(record);
  for(const arm of index%2?[...comparison.arms].reverse():comparison.arms){
   const payload=comparison.payload(s.state,arm);
   for(let attempt=1;attempt<=3;attempt++){
    const started=performance.now();
    try{const response=await evaluate({model,...payload,maxRetries:0,abortSignal:AbortSignal.timeout(20000)});const choice=actionChoice(response.answers.action);
     record.arms[arm]={choice,answer:response.answers.action,requestStateHash:createHash('sha256').update(JSON.stringify(payload.state)).digest('hex'),requestQuestionsHash:createHash('sha256').update(JSON.stringify(payload.questions)).digest('hex'),model:response.response.modelId,usage:{inputTokens:response.usage.inputTokens??null,outputTokens:response.usage.outputTokens??null},elapsedMs:performance.now()-started,attempt};break;
    }catch(error){const failure={id:s.id,arm,attempt,name:['AbortError','TimeoutError'].includes(error?.name)?error.name:'REQUEST_OR_VALIDATION_ERROR',...(Number.isInteger(error?.statusCode)?{status:error.statusCode}:{})};failures.push(failure);
     const delay=fxRecoveryWait(error,attempt);if(delay===null||delay>60000){record.arms[arm]={failed:true,failure};halted=true;break;}await new Promise(r=>setTimeout(r,delay));
    }
   }
   if(halted)break;
  }
  console.log(JSON.stringify({phase:'pair',done:index+1,total:selected.length,id:s.id,...Object.fromEntries(comparison.arms.map(arm=>[arm,record.arms[arm]?.choice??'unavailable']))}));
  if(halted)break;
 }
 const complete=cases.filter(c=>comparison.arms.every(arm=>c.arms[arm]?.choice)),summary={};
 for(const arm of comparison.arms)summary[arm]={matched:complete.length,actions:Object.fromEntries(['buy','sell','keep'].map(action=>[action,complete.filter(c=>c.arms[arm].choice===action).length])),meanBuyChoiceProbability:complete.length?complete.reduce((n,c)=>n+c.arms[arm].answer.probabilities.buy,0)/complete.length:null};
 const completedCalls=cases.flatMap(c=>Object.values(c.arms)).filter(a=>a.choice),tokens=key=>completedCalls.some(a=>a.usage[key]===null)?null:completedCalls.reduce((n,a)=>n+a.usage[key],0);
 const input=tokens('inputTokens'),out=tokens('outputTokens'),estimate=pricing&&input!==null&&out!==null&&Number.isFinite(Number(pricing.input))&&Number.isFinite(Number(pricing.output))?input*Number(pricing.input)+out*Number(pricing.output):null;
 const result={kind:comparison.kind,status:halted?'INCOMPLETE':'COMPLETE',source,createdAt:new Date().toISOString(),elapsedMs:Date.now()-began,selected:selected.length,matched:complete.length,summary,changedChoices:complete.filter(c=>c.arms[firstArm].choice!==c.arms[secondArm].choice).length,cases,failures,inputTokens:input,outputTokens:out,actualAICostUSD:null,estimatedSuccessfulTokenCostUSD:estimate,limitations:['Saved observations, not current market data','No position path or paper fills: this measures decision sensitivity only, NOT trading PnL','Gate-eligible observations are oversampled; aggregate choices are not a market-frequency estimate','One response per input and arm; prompt effects and model sampling variability are not fully separated','Both arms preserve actual cost assumptions, long-only policy and original flat account; no forced trades; this does not test exit behavior',args.includes('--compare-prompts')?'Both arms remove the entry gate; only action instructions and criteria change':'Only entry gate information and instructions change']};
 await writeFile(resolve(output,'results.json'),JSON.stringify(result,null,2));
 const rows=complete.map(c=>`<tr><td>${c.id}</td><td>${c.inputGateAllowed?'通過':'不通過'}</td><td>${c.arms[firstArm].choice}</td><td>${c.arms[secondArm].choice}</td><td>${c.arms[firstArm].answer.probabilities.buy.toFixed(2)}</td><td>${c.arms[secondArm].answer.probabilities.buy.toFixed(2)}</td></tr>`).join('');
 await writeFile(resolve(output,'index.html'),`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${comparison.title}</title><style>body{font:16px/1.8 system-ui;background:#f5f7fa;color:#23313c;margin:24px auto;max-width:1000px;padding:0 16px}table{border-collapse:collapse;white-space:nowrap;width:100%;background:white}td,th{padding:8px;border-bottom:1px solid #ddd;text-align:right}.scroll{overflow:auto}p{max-width:80ch}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:white;padding:12px}</style><h1>${comparison.title}</h1><p>${halted?'未完了':'完了'}：${complete.length}組。売買の実行ではなく、保存済みの同一入力に対する判断比較です。${comparison.description}</p><p>${comparison.labels[0]}：買う ${summary[firstArm].actions.buy} / 売る ${summary[firstArm].actions.sell} / キープ ${summary[firstArm].actions.keep}<br>${comparison.labels[1]}：買う ${summary[secondArm].actions.buy} / 売る ${summary[secondArm].actions.sell} / キープ ${summary[secondArm].actions.keep}<br>選択が変化した入力：${result.changedChoices}件。</p><p>買う選択の報告確率（平均）：${comparison.labels[0]} ${summary[firstArm].meanBuyChoiceProbability===null?'未取得':(summary[firstArm].meanBuyChoiceProbability*100).toFixed(1)+'%'} → ${comparison.labels[1]} ${summary[secondArm].meanBuyChoiceProbability===null?'未取得':(summary[secondArm].meanBuyChoiceProbability*100).toFixed(1)+'%'}。</p><p>時系列から等間隔で${count}件を選び、購入条件を通った入力も追加しています。通過例を多く含む標本なので、市場全体の売買頻度とは異なります。各入力は元の未保有状態のままです。損益と保有後の売却判断は検証していません。</p><div class="scroll"><table><thead><tr><th>入力ID</th><th>元の条件</th><th>${comparison.labels[0]}</th><th>${comparison.labels[1]}</th><th>買う報告確率・${comparison.labels[0]}</th><th>買う報告確率・${comparison.labels[1]}</th></tr></thead><tbody>${rows}</tbody></table></div><p>表示した確率はモデルが返した選択の確率で、利益が出る確率ではありません。各条件1回の応答なので、指示の影響と応答のばらつきは完全には分離していません。</p><p>要求処理時間：${(result.elapsedMs/1000).toFixed(1)}秒。正常応答分の利用料概算：${estimate===null?'未取得':estimate.toFixed(6)+' USD'}。実請求額と失敗分は不明。API失敗 ${failures.length}件。</p><details><summary>Jevへ送った判断指示</summary>${comparison.arms.map((arm,i)=>`<h2>${comparison.labels[i]}</h2><pre>${JSON.stringify(comparison.payload(selected[0].state,arm).questions,null,2).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')}</pre>`).join('')}</details><p><a href="results.json">全返答</a> · <a href="protocol.json">比較条件</a></p></html>`);
 console.log(JSON.stringify({phase:'complete',output,status:result.status,summary,changedChoices:result.changedChoices,failures:failures.length,estimatedSuccessfulTokenCostUSD:estimate}));if(halted)process.exitCode=2;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
