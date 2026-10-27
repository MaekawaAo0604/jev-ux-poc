// Throwaway forward prediction probe. No accounts or orders.
import {marketFeatures} from './live-core.mjs';
import {fxRecoveryWait} from './fx-recovery.mjs';
export const horizons=[1000,5000,30000,60000];
const classes=['up','down','flat'];
const methods=['jev','alwaysUp','alwaysDown','alwaysFlat','momentum','reversal'];
const direction=x=>x>0?'up':x<0?'down':'flat';
const oneHot=choice=>Object.fromEntries(classes.map(k=>[k,k===choice?1:0]));

export function forecastInput(quotes){
 const market=marketFeatures(quotes);delete market.topBookImbalance;
 Object.assign(market,{symbol:'USD/JPY',priceUnit:'JPY per USD',depthObserved:false});
 const questions=Object.fromEntries(horizons.map(ms=>['h'+ms,{type:'choice',instructions:`Forecast the direction of the observed USD/JPY midpoint ${ms/1000} seconds after the latest supplied observation, compared with that observation's latestMid. Use only supplied past market observations. This is a price-direction forecast, NOT a trading decision: ignore transaction costs, account positions and willingness to trade. Select the most likely outcome and express uncertainty through the three probabilities. Flat means exactly unchanged midpoint at the feed's half-tick resolution (0.0005 JPY/USD), NOT uncertainty or abstaining. No future prices or order book sizes are supplied.`,criteria:{up:'The future midpoint is strictly higher than latestMid.',down:'The future midpoint is strictly lower than latestMid.',flat:'The future midpoint equals latestMid.'}}]));
 const last=quotes.at(-1),halfTicks=q=>Math.round((q.bid+q.ask)*1000);
 const momentum=Object.fromEntries(horizons.map(ms=>{
  const past=[...quotes].reverse().find(q=>q.receivedMs<=last.receivedMs-ms)??quotes[0];
  return ['h'+ms,direction(halfTicks(last)-halfTicks(past))];
 }));
 const reversal=Object.fromEntries(Object.entries(momentum).map(([k,v])=>[k,v==='up'?'down':v==='down'?'up':'flat']));
 return {quote:structuredClone(quotes.at(-1)),payload:{state:{market},questions},baselines:{momentum,reversal}};
}
export function validateForecast(answers){
 if(!answers||Object.keys(answers).length!==horizons.length)throw Error('INVALID_FORECAST');
 for(const ms of horizons){const a=answers['h'+ms],p=a?.probabilities;
  if(!classes.includes(a?.choice)||!p||Object.keys(p).length!==3||classes.some(k=>!Number.isFinite(p[k])||p[k]<0||p[k]>1)||Math.abs(Object.values(p).reduce((a,b)=>a+b,0)-1)>.001)throw Error('INVALID_FORECAST');
 }
 return answers;
}
export function forecastRecovery(error,consecutiveFailures){
 const formatErrors=['AI_TypeValidationError','AI_JSONParseError','AI_InvalidResponseDataError','AI_NoObjectGeneratedError','AI_NoOutputGeneratedError'];
 const invalid=error?.message==='INVALID_FORECAST',format=formatErrors.includes(error?.name);
 const category=invalid?'INVALID_FORECAST':format?error.name:Number.isInteger(error?.statusCode)?'HTTP_ERROR':['TimeoutError','AbortError'].includes(error?.name)?error.name:'UNCLASSIFIED_ERROR';
 return {category,waitMs:invalid||format?(consecutiveFailures>=3?null:1000*2**(consecutiveFailures-1)):fxRecoveryWait(error,consecutiveFailures)};
}
export function scoreForecast(prediction,horizonMs,quotes){
 const {input,committedMs,committedSeq}=prediction,anchor=input.quote,targetMs=anchor.receivedMs+horizonMs;
 const base={id:prediction.id,horizonMs,inputSeq:anchor.seq,inputMs:anchor.receivedMs,targetMs,committedMs};
 if(!Number.isFinite(committedMs)||committedMs>=targetMs)return {...base,status:'late'};
 const outcome=quotes.find(q=>q.seq>anchor.seq&&q.receivedMs>=targetMs);
 if(!outcome||outcome.receivedMs-targetMs>1000)return {...base,status:'missing_future_quote'};
 if(outcome.seq<=committedSeq||outcome.receivedMs<=committedMs)return {...base,status:'outcome_not_after_commit'};
 const deltaHalfTicks=Math.round((outcome.bid+outcome.ask)*1000)-Math.round((anchor.bid+anchor.ask)*1000),truth=direction(deltaHalfTicks);
 const jev=prediction.answers['h'+horizonMs],choices={jev:jev.choice,alwaysUp:'up',alwaysDown:'down',alwaysFlat:'flat',momentum:input.baselines.momentum['h'+horizonMs],reversal:input.baselines.reversal['h'+horizonMs]};
 const probabilities=Object.fromEntries(methods.map(m=>[m,m==='jev'?jev.probabilities:oneHot(choices[m])]));
 return {...base,status:'scored',outcomeSeq:outcome.seq,outcomeMs:outcome.receivedMs,outcomeLagMs:outcome.receivedMs-targetMs,deltaJPY:deltaHalfTicks*.0005,truth,choices,correct:Object.fromEntries(methods.map(m=>[m,choices[m]===truth])),brier:Object.fromEntries(methods.map(m=>[m,classes.reduce((n,k)=>n+(probabilities[m][k]-(k===truth?1:0))**2,0)]))};
}
export function summarizeForecast(rows,horizonMs){
 const group=rows.filter(r=>r.horizonMs===horizonMs),scored=group.filter(r=>r.status==='scored');
 const stats=items=>{
  const truthCounts=Object.fromEntries(classes.map(k=>[k,items.filter(r=>r.truth===k).length]));
  return {scored:items.length,truthCounts,methods:Object.fromEntries(methods.map(method=>{
   const present=classes.filter(k=>truthCounts[k]);
   return [method,{correct:items.filter(r=>r.correct[method]).length,accuracy:items.length?items.filter(r=>r.correct[method]).length/items.length:null,meanBrier:items.length?items.reduce((n,r)=>n+r.brier[method],0)/items.length:null,macroRecallObservedClasses:present.length?present.reduce((n,k)=>n+items.filter(r=>r.truth===k&&r.correct[method]).length/truthCounts[k],0)/present.length:null,predictedCounts:Object.fromEntries(classes.map(k=>[k,items.filter(r=>r.choices[method]===k).length]))}];
  }))};
 };
 let end=-Infinity;const nonOverlapping=[];
 for(const r of [...scored].sort((a,b)=>a.inputMs-b.inputMs||a.id-b.id))if(r.inputMs>=end){nonOverlapping.push(r);end=r.outcomeMs;}
 return {horizonMs,planned:group.length,exclusions:Object.fromEntries(['late','missing_future_quote','outcome_not_after_commit'].map(k=>[k,group.filter(r=>r.status===k).length])),...stats(scored),nonOverlapping:{ids:nonOverlapping.map(r=>r.id),...stats(nonOverlapping)}};
}
