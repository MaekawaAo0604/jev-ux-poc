// Throwaway, offline financial hypothesis probe. No broker or order API.
export function pairedBootstrap(differences){
 if(!differences.length||differences.some(v=>!Number.isFinite(v)))throw new Error('Invalid paired differences');
 let seed=20260924;const means=[];
 for(let i=0;i<5000;i++){
  let total=0;for(let j=0;j<differences.length;j++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;total+=differences[Math.floor(seed/4294967296*differences.length)];}
  means.push(total/differences.length);
 }
 means.sort((a,b)=>a-b);
 return {meanJPY:differences.reduce((a,b)=>a+b,0)/differences.length,lower95JPY:means[124],upper95JPY:means[4874],method:'Paired event IID bootstrap; serial dependence not modeled'};
}
function dateValue(date){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw new Error('Invalid date');
 return Date.parse(date);
}
export function parseRates(csv){
 const [header,...lines]=csv.trim().split(/\r?\n/);
 if(header!=='observation_date,DEXJPUS')throw new Error('Unexpected FX series');
 const rows=[];let previous='';
 for(const line of lines){
  const [date,value,...rest]=line.split(',');dateValue(date);
  if(rest.length||date<=previous||value===undefined)throw new Error('Invalid rate row');previous=date;
  if(value===''||value==='.')continue;
  const rate=Number(value);if(!Number.isFinite(rate)||rate<=0)throw new Error('Invalid rate');
  rows.push({date,rate});
 }
 return rows;
}
const decode=text=>text.replace(/<[^>]*>/g,' ').replace(/&#(x[\da-f]+|\d+);/gi,(_,v)=>String.fromCodePoint(v[0].toLowerCase()==='x'?parseInt(v.slice(1),16):Number(v))).replace(/&(amp|nbsp|quot|apos|lt|gt|ndash|mdash|rsquo|lsquo|rdquo|ldquo);/g,(_,v)=>({amp:'&',nbsp:' ',quot:'"',apos:"'",lt:'<',gt:'>',ndash:'–',mdash:'—',rsquo:'’',lsquo:'‘',rdquo:'”',ldquo:'“'}[v])).replace(/\s+/g,' ').trim();
export function extractStatement(html){
 const heading=html.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/i)?.[1];
 if(!heading||decode(heading)!=='Federal Reserve issues FOMC statement')return null;
 const after=html.slice(html.indexOf('releaseTime'));
 const start=after.indexOf('<div class="col-xs-12 col-sm-8 col-md-8">');
 if(start<0)throw new Error('Statement body not found');
 const paragraphs=[...after.slice(start).matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(m=>decode(m[1]));
 const end=paragraphs.findIndex(p=>/^Voting for the (?:monetary policy|FOMC monetary policy) action/i.test(p));
 if(end<1)throw new Error('Statement body boundary missing');
 const text=paragraphs.slice(0,end).join('\n\n');
 if(!/federal funds rate/i.test(text))throw new Error('Policy text missing');
 return text;
}
export function rateAction(text){
 const match=text.match(/(?:Committee|FOMC)\s+(?:has\s+)?decided to (raise|increase|lower|reduce|maintain|keep) the target range for the federal funds rate/i);
 if(!match)throw new Error('Unrecognized policy-rate action');
 return ['raise','increase'].includes(match[1].toLowerCase())?1:['lower','reduce'].includes(match[1].toLowerCase())?-1:0;
}
export function eventWindow(date,rates){
 dateValue(date);
 const i=rates.findIndex(r=>r.date>date);
 if(i<0||!rates[i+1])return null;
 const a=rates[i],b=rates[i+1];
 return {entryDate:a.date,entry:a.rate,exitDate:b.date,exit:b.rate,calendarDays:(dateValue(b.date)-dateValue(a.date))/86400000};
}
export function modelState(event,previousStatement){return {previousStatement:previousStatement??'Not supplied',currentStatement:event.text};}
export function stanceDirection(answer){
 const keys=['hawkish','dovish','neutral'],p=answer?.probabilities;
 if(!keys.includes(answer?.choice)||!p||Object.keys(p).length!==3||keys.some(k=>!Number.isFinite(p[k])||p[k]<0||p[k]>1)||Math.abs(keys.reduce((s,k)=>s+p[k],0)-1)>.02)throw new Error('Invalid stance probabilities');
 if(p[answer.choice]<.7)return 0;
 return answer.choice==='hawkish'?1:answer.choice==='dovish'?-1:0;
}
export function simulate(events,strategy,config){
 if(!['baseline','filtered','jevOnly','cash'].includes(strategy))throw new Error('Invalid strategy');
 const {initialJPY,unitsUSD,roundTripPips,fundingPipsPerDay,apiJPYPerEvent}=config;
 if(![initialJPY,unitsUSD,roundTripPips,fundingPipsPerDay,apiJPYPerEvent].every(v=>Number.isFinite(v)&&v>=0)||!initialJPY||!unitsUSD)throw new Error('Invalid simulation config');
 let equity=initialJPY,peak=equity,previousExit='',grossJPY=0,transactionJPY=0,fundingJPY=0,apiJPY=0,trades=0,wins=0,positive=0,negative=0,maxClosedDrawdownJPY=0;
 const curve=[{date:'start',equityJPY:equity}],ledger=[];
 for(const e of events){
  if(![-1,0,1].includes(e.baseline)||![-1,0,1].includes(e.jev))throw new Error('Missing or invalid decision');
  const w=e.window;
  if(!w||w.entryDate<=e.date||w.exitDate<=w.entryDate||w.entryDate<previousExit||!Number.isFinite(w.entry)||!Number.isFinite(w.exit)||w.entry<=0||w.exit<=0||w.calendarDays!==(dateValue(w.exitDate)-dateValue(w.entryDate))/86400000)throw new Error('Invalid or overlapping trade window');
  previousExit=w.exitDate;
  const direction=strategy==='baseline'?e.baseline:strategy==='filtered'?(e.baseline===e.jev?e.baseline:0):strategy==='jevOnly'?e.jev:0;
  const gross=direction*unitsUSD*(w.exit-w.entry),transaction=direction?unitsUSD*.01*roundTripPips:0,funding=direction?unitsUSD*.01*fundingPipsPerDay*w.calendarDays:0,api=['filtered','jevOnly'].includes(strategy)?apiJPYPerEvent:0;
  const net=gross-transaction-funding-api;
  if(direction){trades++;if(net>0)wins++;positive+=Math.max(net,0);negative+=Math.max(-net,0);}
  grossJPY+=gross;transactionJPY+=transaction;fundingJPY+=funding;apiJPY+=api;equity+=net;peak=Math.max(peak,equity);maxClosedDrawdownJPY=Math.max(maxClosedDrawdownJPY,peak-equity);
  ledger.push({date:e.date,...w,direction,grossJPY:gross,transactionJPY:transaction,fundingJPY:funding,apiJPY:api,netJPY:net});
  curve.push({date:w.exitDate,equityJPY:equity});
 }
 return {strategy,events:events.length,trades,wins,winRate:trades?wins/trades:null,grossJPY,transactionJPY,fundingJPY,apiJPY,netJPY:equity-initialJPY,returnPercent:(equity/initialJPY-1)*100,maxClosedDrawdownJPY,profitFactor:negative?positive/negative:null,curve,ledger};
}
