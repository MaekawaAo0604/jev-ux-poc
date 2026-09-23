import {SCROLL_VIEWPORT_FRACTION,type Candidate,type Observation,type State} from './types.js';

function validViewport(viewport:Observation['viewport']):viewport is NonNullable<Observation['viewport']>{
 return !!viewport&&[viewport.top,viewport.bottom,viewport.height].every(Number.isFinite)&&viewport.top>=0&&viewport.bottom>viewport.top&&viewport.height>0&&Math.abs(viewport.bottom-viewport.top-viewport.height)<=.01;
}

/** Prior viewport positions only: dynamic content or layout changes can alter what
 * is there now. These notes never certify readable content or goal completion. */
export function navigationCriteria(state:State,candidates:Record<string,Candidate>):Record<string,string>{
 const criteria=Object.fromEntries(Object.entries(candidates).map(([key,candidate])=>[key,candidate.label]));
 const {pageId,viewport}=state.screen;
 if(typeof pageId!=='string'||!pageId.trim()||!validViewport(viewport))return criteria;
 const ranges=state.history.flatMap(entry=>entry.pageId===pageId&&validViewport(entry.viewport)?[entry.viewport]:[]);
 ranges.push(viewport);ranges.sort((a,b)=>a.top-b.top);
 const merged:{top:number;bottom:number}[]=[];
 for(const range of ranges){
  const previous=merged[merged.length-1];
  if(previous&&range.top<=previous.bottom)previous.bottom=Math.max(previous.bottom,range.bottom);
  else merged.push({top:range.top,bottom:range.bottom});
 }
 const delta=viewport.height*SCROLL_VIEWPORT_FRACTION;
 for(const [key,candidate] of Object.entries(candidates)){
  if(candidate.action.type!=='scroll')continue;
  const start=candidate.action.direction==='up'?Math.max(0,viewport.top-delta):viewport.bottom;
  const end=candidate.action.direction==='up'?viewport.top:viewport.bottom+delta;
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)continue;
  const covered=merged.some(range=>range.top<=start&&range.bottom>=end);
  criteria[key]+=covered?'（移動先の表示範囲は過去に観察済み。読み取れた内容は本文と警告を参照）':'（この方向には、まだ観察していない表示範囲がある）';
 }
 return criteria;
}
