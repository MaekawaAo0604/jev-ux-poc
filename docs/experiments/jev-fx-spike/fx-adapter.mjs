// Throwaway USD/JPY experiment adapter. No authenticated broker interface.
import {IndependentPaperComparison} from './live-core.mjs';

export function fxQuestions(costFilterEnabled=true){
 const gate=costFilterEnabled?' The code-computed entry cost gate compares historical movement with costs, NOT future expected profit. When flat and the gate is not allowed, choose keep. Passing the gate does not by itself justify buying. The gate never restricts exiting a losing position.':'';
 return {action:{type:'choice',instructions:'Choose buy, sell or keep for a PAPER USD/JPY account using only the supplied past observations and account. Cash is JPY, holding is USD, price is JPY per USD. Seek net benefit after disclosed costs, not activity. No mandatory holding period, trading interval or obligation to trade. No leverage, shorts or adding to a position. Do not invent a price forecast; probabilities classify actions and are NOT profit probabilities.'+gate+' Execution uses a later quote, not the current input price. No order book sizes are observed.',criteria:{buy:'When flat, open the specified USD quantity if observations justify exposure after costs'+(costFilterEnabled?' and the purchase gate permits it':'')+'.',sell:'When holding USD, close the entire existing position if exiting is justified; losses do not prohibit selling. Never short.',keep:'Preserve current JPY cash and USD position, including staying out when evidence is insufficient.'}}};
}

// Prompt-only comparison variant. Keep fxQuestions unchanged as the control.
export function fxBalancedQuestions(){
 return {action:{type:'choice',instructions:'Choose buy, sell or keep for a PAPER USD/JPY account using only the supplied past observations and account. Cash is JPY, holding is USD, price is JPY per USD. Compare the available actions using observed price movements, the current position and all disclosed transaction costs, and select the action you assess as most advantageous after costs. Incorporate uncertainty into that comparison; certainty of profit is not required. Do not treat unobserved information as fact. Increasing trading activity is not an objective. No mandatory holding period, trading interval or obligation to trade. No leverage, shorts or adding to a position. Probabilities classify actions and are NOT profit probabilities. Execution uses a later quote, not the current input price. No order book sizes are observed.',criteria:{buy:'When flat, open the specified USD quantity if buying is assessed as more advantageous than staying in cash after costs and uncertainty.',sell:'When holding USD, close the entire existing position if exiting is assessed as more advantageous than holding after costs and uncertainty; losses do not prohibit selling. Never short.',keep:'Preserve current JPY cash and USD position if maintaining that state is assessed as at least as advantageous as the available trade after costs and uncertainty.'}}};
}

// The original engine's historical USD/BTC member names are private to this
// boundary. Values are JPY cash / USD quantity; no currency conversion occurs.
const keyMap={initialUSD:'initialJPY',tradeUSD:'tradeNotionalJPY',cashUSD:'cashJPY',holdingBTC:'holdingUSD',btc:'usd',feeUSD:'feeJPY',paidFeesUSD:'paidFeesJPY',grossMarkUSD:'grossMarkJPY',netLiquidationUSD:'netLiquidationJPY',netLiquidationPnLUSD:'netLiquidationPnLJPY',maxDrawdownUSD:'maxDrawdownJPY',buyNotionalUSD:'buyNotionalJPY'};
export function fxUnits(value){
 if(Array.isArray(value))return value.map(fxUnits);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[keyMap[k]??k,fxUnits(v)]));
 return value;
}
function modelState(state,config){
 const s=fxUnits(state);delete s.execution.buyNotionalJPY;
 s.market.symbol='USD/JPY';s.market.priceUnit='JPY per USD';
 delete s.market.topBookImbalance;s.market.depthObserved=false;
 s.execution.buyQuantityUSD=config.tradeQuantityUSD;
 s.execution.adverseSlippageJPYPerUSDPerSide=config.slippageAbsolute;
 s.execution.liquidity='Public feed provides no sizes; full small-order fill is assumed, not observed';
 return s;
}
export function parseFxTicker(message,seq,receivedMs,config){
 if(message.symbol!=='USD_JPY'||message.status!=='OPEN')throw Error('FX_CLOSED_OR_INVALID_SYMBOL');
 const decimal=s=>typeof s==='string'&&/^\d+(?:\.\d+)?$/.test(s)?Number(s):NaN;
 const bid=decimal(message.bid),ask=decimal(message.ask),sourceMs=Date.parse(message.timestamp);
 if(![bid,ask,sourceMs,receivedMs].every(Number.isFinite)||bid<=0||ask<bid||!Number.isSafeInteger(seq)||seq<1)throw Error('FX_INVALID_QUOTE');
 if(receivedMs-sourceMs>5000)throw Error('FX_STALE_QUOTE');
 if(sourceMs-receivedMs>1000)throw Error('FX_FUTURE_QUOTE');
 return {seq,receivedMs,sourceMs,symbol:'USD/JPY',bid,ask,bidQty:config.tradeQuantityUSD,askQty:config.tradeQuantityUSD,depthObserved:false,liquidityAssumption:'Full configured small order; quoted size not published'};
}
export class FxComparison{
 constructor(config,rules,{infer,onEvent=()=>{},...options}){
  const size=config.tradeQuantityUSD,min=Number(rules.minOpenOrderSize),max=Number(rules.maxOrderSize),step=Number(rules.sizeStep);
  if(rules.symbol!=='USD_JPY'||![size,min,max,step].every(Number.isFinite)||min<=0||max<min||step<=0||size<min||size>max||Math.abs(size/step-Math.round(size/step))>1e-8)throw Error('FX_INVALID_ORDER_SIZE');
  const internal={...config,initialUSD:config.initialJPY,tradeUSD:1,tradeBaseQuantity:size};
  this.engine=new IndependentPaperComparison(internal,{...options,infer:state=>infer(modelState(state,config)),onEvent:event=>{
   const e=fxUnits(event);if(event.state)e.state=modelState(event.state,config);onEvent(e);
  }});
 }
 observe(q){this.engine.observe(q);}
 stop(){this.engine.stop();}
 idle(){return this.engine.idle();}
 summary(){return fxUnits(this.engine.summary());}
 decisions(){return fxUnits(Object.fromEntries(Object.entries(this.engine.lanes).map(([k,l])=>[k,l.decisions])));}
}
