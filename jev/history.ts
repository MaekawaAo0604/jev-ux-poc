import type {Observation,State} from './types.js';

function copyEntry(entry:State['history'][number]):State['history'][number]{
 return {
  ...entry,
  ...(entry.observedText?{observedText:[...entry.observedText]}:{}),
  ...(entry.observedWarnings?{observedWarnings:[...entry.observedWarnings]}:{}),
  ...(entry.observedRegions?{observedRegions:entry.observedRegions.map(region=>({...region,bbox:{...region.bbox},...(region.context?{context:{...region.context,headings:[...region.context.headings]}}:{})}))}:{}),
  ...(entry.viewport?{viewport:{...entry.viewport}}:{}),
  ...(entry.remainingGoalChecks?{remainingGoalChecks:[...entry.remainingGoalChecks]}:{}),
 };
}

/** Keep text actually observed before each action, not just the page title.
 * Copy entries so later observations never change an earlier recorded State.
 * Retain observed text and its context throughout the exploration.
 */
export function rememberObservation(history:State['history'],screen:Observation,action:string,result:string):State['history']{
 const observed=new Set(screen.text);
 const entry:State['history'][number]={
  screen:screen.title,action,result,observedText:[...screen.text],
  ...(screen.warnings?.length?{observedWarnings:[...screen.warnings]}:{}),
  ...(screen.regions?{observedRegions:screen.regions.filter(region=>observed.has(region.text)).map(region=>({...region,bbox:{...region.bbox},...(region.context?{context:{...region.context,headings:[...region.context.headings]}}:{})}))}:{}),
  ...(screen.pageId?{pageId:screen.pageId}:{}),
  ...(screen.viewport?{viewport:{...screen.viewport}}:{}),
 };
 return [...history.map(copyEntry),entry];
}
