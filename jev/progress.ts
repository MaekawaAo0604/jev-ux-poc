import type {Observation,State} from './types.js';

export function explorationProgress(state:State):{
 currentPage?:string;
 visibleRange?:Observation['viewport'];
 pages:{pageId:string;ranges:NonNullable<Observation['viewport']>[];actions:{step:number;label:string;result:string;remainingGoalChecks?:string[]}[]}[];
}{
 type ProgressPage={pageId:string;ranges:NonNullable<Observation['viewport']>[];actions:{step:number;label:string;result:string;remainingGoalChecks?:string[]}[]};
 const pages:ProgressPage[]=[];
 const byId=new Map<string,ProgressPage>();
 const page=(pageId:string)=>{
  let found=byId.get(pageId);
  if(!found){found={pageId,ranges:[],actions:[]};byId.set(pageId,found);pages.push(found);}
  return found;
 };
 state.history.forEach((entry,index)=>{
  if(!entry.pageId)return;
  const progress=page(entry.pageId);
  if(entry.viewport)progress.ranges.push({...entry.viewport});
  progress.actions.push({step:index+1,label:entry.action,result:entry.result,...(entry.remainingGoalChecks?{remainingGoalChecks:[...entry.remainingGoalChecks]}:{})});
 });
 if(state.screen.pageId){
  const current=page(state.screen.pageId);
  if(state.screen.viewport)current.ranges.push({...state.screen.viewport});
 }
 return {
  ...(state.screen.pageId?{currentPage:state.screen.pageId}:{}),
  ...(state.screen.viewport?{visibleRange:{...state.screen.viewport}}:{}),
  pages,
 };
}
