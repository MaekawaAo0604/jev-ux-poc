// Throwaway real-time paper probe. These exports never connect to an exchange.
export function parseTicker(message,seq,receivedMs){
 if(message.channel!=='ticker')return null;
 if(!['snapshot','update'].includes(message.type)||message.data?.length!==1)throw new Error('Invalid ticker envelope');
 const d=message.data[0],sourceMs=Date.parse(d.timestamp);
 if(d.symbol!=='BTC/USD'||![d.bid,d.ask,d.bid_qty,d.ask_qty,sourceMs,receivedMs].every(Number.isFinite)||d.bid<=0||d.ask<d.bid||d.bid_qty<0||d.ask_qty<0||!Number.isSafeInteger(seq)||seq<1)throw new Error('Invalid ticker values');
 return {seq,receivedMs,sourceMs,symbol:d.symbol,bid:d.bid,ask:d.ask,bidQty:d.bid_qty,askQty:d.ask_qty};
}
export function marketFeatures(quotes){
 if(!quotes.length)throw new Error('Missing market data');
 const first=quotes[0],last=quotes.at(-1),mid=q=>(q.bid+q.ask)/2,latestMid=mid(last);
 return {observations:quotes.length,observedSpanMs:last.receivedMs-first.receivedMs,latestMid,spreadBps:(last.ask-last.bid)/latestMid*10000,topBookImbalance:last.bidQty+last.askQty?(last.bidQty-last.askQty)/(last.bidQty+last.askQty):0,
  windows:[1000,5000,30000,60000].map(windowMs=>{
   const start=[...quotes].reverse().find(q=>q.receivedMs<=last.receivedMs-windowMs)??first;
   const inside=quotes.filter(q=>q.seq>=start.seq),prices=inside.map(mid);
   return {windowMs,coverageMs:last.receivedMs-start.receivedMs,complete:last.receivedMs-first.receivedMs>=windowMs,updates:inside.length,returnBps:(latestMid/mid(start)-1)*10000,rangeBps:(Math.max(...prices)-Math.min(...prices))/latestMid*10000};
  }),recent:quotes.slice(-12).map(q=>({ageMs:last.receivedMs-q.receivedMs,midRelativeBps:(mid(q)/latestMid-1)*10000}))};
}
export function actionChoice(answer){
 const keys=['buy','sell','keep'],p=answer?.probabilities;
 if(!keys.includes(answer?.choice)||!p||Object.keys(p).length!==3||keys.some(k=>!Number.isFinite(p[k])||p[k]<0||p[k]>1)||Math.abs(keys.reduce((s,k)=>s+p[k],0)-1)>.02)throw new Error('Invalid action response');
 return answer.choice;
}
// A historical-movement entry gate, not an estimate of future profit. The
// threshold is the future raw bid needed to recover a buy and a subsequent sell.
export function entryCostSnapshot(q,features,config){
 const f=config.feeRate,s=config.slippageBps/10000,a=config.slippageAbsolute??0;
 if(![q.bid,q.ask,f,s,a].every(Number.isFinite)||q.bid<=0||q.ask<q.bid||f<0||f>=1||s<0||s>=1||a<0||q.bid*(1-s)<=a)throw new Error('Invalid entry cost inputs');
 const window=features?.windows?.find(w=>w.windowMs===5000);
 const observedRiseBps=Number.isFinite(window?.returnBps)?window.returnBps:null;
 const breakEvenExitBid=(q.ask*(1+s)*(1+f)+2*a)/((1-s)*(1-f));
 const requiredRiseBps=(breakEvenExitBid/q.bid-1)*10000;
 return {quoteSeq:q.seq,windowMs:5000,coverageMs:window?.coverageMs??0,complete:window?.complete===true,
  observedRiseBps,requiredRiseBps,breakEvenExitBid,allowed:observedRiseBps!==null&&observedRiseBps>requiredRiseBps,
  basis:'past_mid_price_rise_not_forecast',excludes:'AI_API_cost'};
}
export class PaperAccount{
 constructor(config){
  if(![config.initialUSD,config.tradeUSD,config.feeRate,config.slippageBps].every(v=>Number.isFinite(v)&&v>=0)||!config.initialUSD||!config.tradeUSD||config.feeRate>=1||config.slippageBps>=10000)throw new Error('Invalid paper config');
  if(config.tradeBaseQuantity!==undefined&&(!Number.isFinite(config.tradeBaseQuantity)||config.tradeBaseQuantity<=0))throw new Error('Invalid fixed base quantity');
  if(config.slippageAbsolute!==undefined&&(!Number.isFinite(config.slippageAbsolute)||config.slippageAbsolute<0))throw new Error('Invalid absolute slippage');
  this.config={...config};this.cashUSD=config.initialUSD;this.btc=0;this.feesUSD=0;this.fills=[];this.executed=new Set();
 }
 execute(action,decision,q){
  if(!['buy','sell','keep'].includes(action))throw new Error('Invalid action');
  if(this.executed.has(decision.decisionId))return {status:'duplicate_decision'};
  if(q.seq<=decision.afterSeq||q.receivedMs<decision.completedMs)return {status:'not_after_decision'};
  if(action==='keep')return {status:'kept'};
  if(action==='buy'&&this.btc>0)return {status:'already_holding'};
  if(action==='sell'&&!this.btc)return {status:'no_position'};
  const sign=action==='buy'?1:-1,price=(action==='buy'?q.ask:q.bid)*(1+sign*this.config.slippageBps/10000)+sign*(this.config.slippageAbsolute??0);
  if(!Number.isFinite(price)||price<=0)throw new Error('Invalid execution price');
  const quantity=action==='buy'?(this.config.tradeBaseQuantity??this.config.tradeUSD/price):this.btc,notional=price*quantity,fee=notional*this.config.feeRate;
  if(quantity>(action==='buy'?q.askQty:q.bidQty))return {status:'insufficient_liquidity'};
  if(action==='buy'&&notional+fee>this.cashUSD)return {status:'insufficient_cash'};
  this.cashUSD-=sign*notional+fee;this.btc=action==='buy'?quantity:0;this.feesUSD+=fee;this.executed.add(decision.decisionId);
  const fill={decisionId:decision.decisionId,action,price,quantity,feeUSD:fee,quoteSeq:q.seq,quoteReceivedMs:q.receivedMs,decisionCompletedMs:decision.completedMs};this.fills.push(fill);
  return {status:'filled',fill};
 }
 mark(q){
  const grossMarkUSD=this.cashUSD+this.btc*q.bid,netLiquidationUSD=this.cashUSD+this.btc*(q.bid*(1-this.config.slippageBps/10000)-(this.config.slippageAbsolute??0))*(1-this.config.feeRate);
  return {cashUSD:this.cashUSD,btc:this.btc,paidFeesUSD:this.feesUSD,grossMarkUSD,netLiquidationUSD,netLiquidationPnLUSD:netLiquidationUSD-this.config.initialUSD};
 }
}
export class LatestOnly{
 constructor(work,onError){this.work=work;this.onError=onError;this.pending=undefined;this.running=undefined;this.stopped=false;this.coalesced=0;this.started=0;}
 offer(value){
  if(this.stopped)return;
  if(this.pending!==undefined)this.coalesced++;
  this.pending=value;
  if(this.running)return;
  this.running=Promise.resolve().then(async()=>{
   while(!this.stopped&&this.pending!==undefined){
    const next=this.pending;this.pending=undefined;this.started++;
    try{await this.work(next);}catch(error){if(await this.onError(error)!==true)this.stop();}
   }
  }).finally(()=>{this.running=undefined;});
 }
 stop(){this.stopped=true;this.pending=undefined;}
 async idle(){await this.running;}
}

export function distribution(values){
 const a=[...values].sort((x,y)=>x-y);
 return a.length?{count:a.length,min:a[0],p50:a[Math.floor((a.length-1)*.5)],p95:a[Math.ceil((a.length-1)*.95)],max:a.at(-1),mean:a.reduce((s,v)=>s+v,0)/a.length}:null;
}

export function comparisonIsComplete({stopReason,updates,accounts,logComplete,costFilterEnabled=false}){
 const names=costFilterEnabled?['jev','rule','ruleFiltered','buyHold']:['jev','rule','buyHold'];
 return stopReason==='MEASUREMENT_WINDOW_COMPLETE'&&logComplete===true&&updates>=2&&accounts!==null&&names.every(name=>accounts?.[name]?.status==='active'&&accounts[name].completedDecisions>0);
}

// A full stream buffer is temporary backpressure, not a failed write. Preserve
// event order in a bounded queue while waiting for drain; stop only on actual
// I/O failure or exhausted memory allowance. Failure callbacks are deferred so
// stopping the runner cannot re-enter a half-recorded decision synchronously.
export class OrderedAuditWriter{
 constructor(stream,{maxBufferedBytes=4*1024*1024,onFailure=()=>{}}={}){
  this.stream=stream;this.limit=maxBufferedBytes;this.onFailure=onFailure;
  this.queue=[];this.queuedBytes=0;this.blocked=false;this.closing=false;this.failure=null;
  this.backpressureEvents=0;this.maxBufferedBytes=0;
  this.done=new Promise((resolve,reject)=>{this.resolve=resolve;this.reject=reject;});
  this.done.catch(()=>{});
  stream.on('drain',()=>{this.blocked=false;this.pump();});
  stream.on('error',()=>{this.fail('LOG_WRITE_ERROR');this.reject(Error('LOG_WRITE_ERROR'));});
  stream.on('finish',()=>this.failure?this.reject(Error(this.failure)):this.resolve());
 }
 fail(reason){
  if(this.failure)return;this.failure=reason;queueMicrotask(()=>this.onFailure(reason));
 }
 append(event){
  if(this.closing||this.failure)return false;
  const data=Buffer.from(JSON.stringify(event)+'\n');
  const buffered=this.queuedBytes+this.stream.writableLength+data.length;
  if(buffered>this.limit){this.fail('LOG_BUFFER_LIMIT');return false;}
  this.maxBufferedBytes=Math.max(this.maxBufferedBytes,buffered);
  this.queue.push(data);this.queuedBytes+=data.length;this.pump();return true;
 }
 pump(){
  if(this.stream.destroyed)return;
  while(!this.blocked&&this.queue.length){
   const data=this.queue.shift();this.queuedBytes-=data.length;
   if(!this.stream.write(data)){this.blocked=true;this.backpressureEvents++;}
  }
  if(this.closing&&!this.blocked&&!this.queue.length&&!this.stream.writableEnded)this.stream.end();
 }
 async close(){this.closing=true;this.pump();await this.done;}
}

// Independent logical lanes on one public feed. No lane awaits another lane.
// The only asynchronous dependency is infer(); paper execution is shared code,
// but each strategy owns its cash, position, pending order and decision history.
export class IndependentPaperComparison{
 constructor(config,{infer,onEvent=()=>{},onJevError=async()=>false,clock=Date.now}){
  this.config={...config};this.infer=infer;this.onEvent=onEvent;this.clock=clock;
  this.quotes=[];this.curves=[];this.featureLatencyMs=[];this.latest=null;this.stopped=false;
  this.activeRequests=0;this.maxActiveRequests=0;this.failures=[];
  const names=config.costFilterEnabled?['jev','rule','ruleFiltered','buyHold']:['jev','rule','buyHold'];
  this.lanes=Object.fromEntries(names.map(name=>[name,{account:new PaperAccount(config),starts:[],decisions:[],pending:null,status:'active',peakUSD:config.initialUSD,maxDrawdownUSD:0,maxDrawdownPct:0}]));
  this.loop=new LatestOnly(()=>this.decideJev(),async error=>{
   if(this.stopped)return false;
   const lane=this.lanes.jev;
   const failure={strategy:'jev',id:lane.starts.length,atMs:this.clock(),name:['AbortError','TimeoutError'].includes(error?.name)?error.name:'REQUEST_OR_VALIDATION_ERROR',...(Number.isInteger(error?.statusCode)?{status:error.statusCode}:{})};
   this.failures.push(failure);this.onEvent({type:'failure',...failure});lane.status='recovering';
   const recovered=await onJevError(error,failure);
   if(this.stopped)return false;
   lane.status=recovered===true?'active':'stopped_after_error';
   this.onEvent({type:'strategy-status',strategy:'jev',status:lane.status,atMs:this.clock()});
   return recovered===true;
  });
 }
 observe(q){
  if(this.stopped)return;
  if(this.latest&&(q.seq<=this.latest.seq||q.receivedMs<this.latest.receivedMs))throw new Error('Non-monotonic quote');
  this.latest=q;this.quotes.push(q);
  while(this.quotes.length>2&&this.quotes[1].receivedMs<q.receivedMs-60000)this.quotes.shift();
  const start=performance.now();this.features=marketFeatures(this.quotes);this.featureLatencyMs.push(performance.now()-start);
  // A previously completed decision may use this quote. Decisions made below may NOT.
  for(const [name,lane] of Object.entries(this.lanes)){
   const p=lane.pending;
   if(p&&q.seq>p.record.afterSeq&&q.receivedMs>=p.record.completedMs){
    lane.pending=null;
    const costGate=this.costGate(name,p.record.action);
    const result=costGate?.blocked?{status:'blocked_by_cost_filter',costGate}:
     {...lane.account.execute(p.record.action,{decisionId:p.record.id,afterSeq:p.record.afterSeq,completedMs:p.record.completedMs},q),...(costGate?{costGate}:{})};
    this.executed(name,p.record,{...result,quoteSeq:q.seq,receivedMs:q.receivedMs});p.resolve(result);
   }
  }
  for(const name of this.config.costFilterEnabled?['rule','ruleFiltered','buyHold']:['rule','buyHold']){
   const lane=this.lanes[name];
   if(lane.status!=='active'||lane.pending||(name==='buyHold'&&lane.account.fills.length))continue;
   try{
    const startedMs=this.clock(),mono=performance.now();lane.starts.push(startedMs);
    const move=this.features.windows.find(w=>w.windowMs===5000).returnBps;
    const action=name==='buyHold'?'buy':lane.account.btc?(move<0?'sell':'keep'):(move>0?'buy':'keep');
    const record={id:lane.starts.length,startedMs,completedMs:this.clock(),elapsedMs:performance.now()-mono,inputSeq:q.seq,afterSeq:q.seq,action,signalReturnBps:move};
    this.onEvent({type:'decision-start',strategy:name,id:record.id,startedMs,inputSeq:q.seq});
    this.complete(name,record);
   }catch{
    lane.status='stopped_after_error';this.onEvent({type:'strategy-status',strategy:name,status:lane.status,atMs:this.clock()});
   }
  }
  const curve={receivedMs:q.receivedMs,seq:q.seq,mid:(q.bid+q.ask)/2};
  for(const [name,lane] of Object.entries(this.lanes)){
   const mark=lane.account.mark(q);curve[name]=mark.netLiquidationPnLUSD;
   lane.peakUSD=Math.max(lane.peakUSD,mark.netLiquidationUSD);
   const drawdown=lane.peakUSD-mark.netLiquidationUSD;
   lane.maxDrawdownUSD=Math.max(lane.maxDrawdownUSD,drawdown);
   lane.maxDrawdownPct=Math.max(lane.maxDrawdownPct,drawdown/lane.peakUSD*100);
  }
  this.curves.push(curve);this.loop.offer(q.seq);
 }
 async decideJev(){
  if(this.stopped||!this.latest)return;
  const lane=this.lanes.jev,q=this.latest,startedMs=this.clock(),id=lane.starts.length+1;
  const state={market:this.features,account:{cashUSD:lane.account.cashUSD,holdingBTC:lane.account.btc,position:lane.account.btc>0?'holding':'flat',entryPrice:lane.account.btc?lane.account.fills.at(-1)?.price:null},execution:{buyNotionalUSD:this.config.tradeUSD,feeBpsPerSide:this.config.feeRate*10000,adverseSlippageBpsPerSide:this.config.slippageBps,noShortSelling:true}};
  if(this.config.costFilterEnabled)state.execution.entryCostFilter=entryCostSnapshot(q,this.features,this.config);
  lane.starts.push(startedMs);this.onEvent({type:'decision-start',strategy:'jev',id,startedMs,inputSeq:q.seq,inputReceivedMs:q.receivedMs,state});
  const mono=performance.now();this.activeRequests++;this.maxActiveRequests=Math.max(this.maxActiveRequests,this.activeRequests);
  let response;
  try{response=await this.infer(state);}catch(error){
   if(this.stopped){this.onEvent({type:'decision-cancelled',strategy:'jev',id});return;}throw error;
  }finally{this.activeRequests--;}
  if(this.stopped){this.onEvent({type:'decision-cancelled',strategy:'jev',id});return;}
  const completedMs=this.clock(),action=actionChoice(response.answers.action);
  const record={id,startedMs,completedMs,elapsedMs:performance.now()-mono,inputSeq:q.seq,afterSeq:this.latest.seq,inputAgeAtCompletionMs:completedMs-q.receivedMs,updatesDuringInference:this.latest.seq-q.seq,midDriftBps:((this.latest.bid+this.latest.ask)/(q.bid+q.ask)-1)*10000,action,answer:response.answers.action,model:response.response.modelId,usage:{inputTokens:response.usage.inputTokens??null,outputTokens:response.usage.outputTokens??null}};
  await this.complete('jev',record);
 }
 complete(name,record){
  record.rawAction=record.action;
  const costGate=this.costGate(name,record.rawAction);
  if(costGate){record.costGate=costGate;if(costGate.blocked)record.action='keep';}
  const lane=this.lanes[name];lane.decisions.push(record);
  this.onEvent({type:'decision-complete',strategy:name,...record});
  if(record.action==='keep'){
   const result={status:'kept'};this.executed(name,record,result);return Promise.resolve(result);
  }
  return new Promise(resolve=>{lane.pending={record,resolve};});
 }
 costGate(name,action){
  if(!this.config.costFilterEnabled||!['jev','ruleFiltered'].includes(name))return null;
  const snapshot=entryCostSnapshot(this.latest,this.features,this.config);
  const blocked=action==='buy'&&!snapshot.allowed;
  return {...snapshot,blocked,reason:action!=='buy'?'entry_only_not_applicable':blocked?'past_rise_not_above_round_trip_cost':'past_rise_above_round_trip_cost'};
 }
 executed(name,record,result){
  record.execution=result;this.onEvent({type:'decision-execution',strategy:name,id:record.id,result});
 }
 stop(){
  if(this.stopped)return;this.stopped=true;this.loop.stop();
  for(const [name,lane] of Object.entries(this.lanes)){
   if(lane.pending){const p=lane.pending;lane.pending=null;const result={status:'cancelled_at_stop'};this.executed(name,p.record,result);p.resolve(result);}
  }
 }
 async idle(){await this.loop.idle();}
 summary(){
  if(!this.latest)return null;
  const result=Object.fromEntries(Object.entries(this.lanes).map(([name,lane])=>[name,{
   ...lane.account.mark(this.latest),fills:lane.account.fills,status:lane.status,startedDecisions:lane.starts.length,completedDecisions:lane.decisions.length,
   actions:Object.fromEntries(['buy','sell','keep'].map(action=>[action,lane.decisions.filter(d=>d.action===action).length])),
   rawActions:Object.fromEntries(['buy','sell','keep'].map(action=>[action,lane.decisions.filter(d=>d.rawAction===action).length])),
   blockedBuysAtDecision:lane.decisions.filter(d=>d.costGate?.blocked).length,
   blockedBuysAtExecution:lane.decisions.filter(d=>d.execution?.status==='blocked_by_cost_filter').length,
   latencyMs:distribution(lane.decisions.map(d=>d.elapsedMs)),decisionStartGapMs:distribution(lane.starts.slice(1).map((v,i)=>v-lane.starts[i])),
   maxDrawdownUSD:lane.maxDrawdownUSD,maxDrawdownPct:lane.maxDrawdownPct,
  }]));
  result.cash={cashUSD:this.config.initialUSD,btc:0,paidFeesUSD:0,netLiquidationUSD:this.config.initialUSD,netLiquidationPnLUSD:0,fills:[],status:'reference',startedDecisions:0,completedDecisions:0,actions:{buy:0,sell:0,keep:0},latencyMs:null,maxDrawdownUSD:0,maxDrawdownPct:0};
  return result;
 }
}
