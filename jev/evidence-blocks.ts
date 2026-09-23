import type {RegionContext,State,TextRegion} from './types.js';
import {evidenceKey} from './evidence-session.js';
export type GoalEvidence={id:string;step:number;text:string;warnings:string[];omitted:boolean;pageId?:string;context?:RegionContext};
export type EvidenceBlock={key:string;local:{pageId?:string;legacyFrame?:number;context?:RegionContext;text:string[];warnings:string[];omitted:boolean};evidence:GoalEvidence[]};
export function goalEvidenceInput(state:State,goalChecks:string[]){
 const frames=[...state.history.map(h=>({text:h.observedText||[],regions:h.observedRegions,warnings:h.observedWarnings||[],omitted:!!h.observationOmitted,pageId:h.pageId})),{text:state.screen.text,regions:state.screen.regions,warnings:state.screen.warnings||[],omitted:false,pageId:state.screen.pageId}];
 const evidence:GoalEvidence[]=[],blocks:EvidenceBlock[]=[];
 frames.forEach((frame,index)=>{
  const byContext=new Map<string,GoalEvidence[]>(),used=new Set<TextRegion>();
  frame.text.forEach((text,i)=>{
   if(!text.trim())return;
   const region=frame.regions?.find(r=>!used.has(r)&&r.text===text);if(region)used.add(region);
   const context=region?.context?{landmark:region.context.landmark,section:region.context.section,headings:region.context.headings.filter(h=>frame.text.includes(h))}:undefined;
   const quote:GoalEvidence={id:`s${index+1}-t${i+1}`,step:index+1,text,warnings:[...frame.warnings],omitted:frame.omitted,...(frame.pageId?{pageId:frame.pageId}:{}),...(context?{context}: {})};
   evidence.push(quote);const group=evidenceKey(context??null);const list=byContext.get(group)??[];list.push(quote);byContext.set(group,list);
  });
  for(const quotes of byContext.values()){
   const local={...(frame.pageId?{pageId:frame.pageId}:{legacyFrame:index+1}),...(quotes[0].context?{context:quotes[0].context}:{}),text:quotes.map(e=>e.text),warnings:[...frame.warnings],omitted:frame.omitted};
   const key=evidenceKey(local),existing=blocks.find(b=>b.key===key);
   if(existing)existing.evidence.push(...quotes);else blocks.push({key,local,evidence:quotes});
  }
 });
 return {goal:state.goal,currentDate:state.currentDate,goalChecks,observations:frames.map(({regions:_,...frame})=>frame),evidence,blocks};
}
