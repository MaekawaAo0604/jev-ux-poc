import {isDeepStrictEqual} from 'node:util';
import {parseHoldoutFixture} from '../app/holdout-fixture.js';
import type {BetaResult,BetaStep} from './virtual-beta-core.js';

export type HoldoutRunRecord={id:string;task:'switch'|'revisit'|'direct';variant:'alpha'|'beta';replicate:number;condition:'control'|'policy';initialImageSha256:string;result:BetaResult};
type IntegrityError={code:string;ids:string[]};
type Edge={step:number;observationId:string|null;action:NonNullable<BetaStep['action']>;from:string|null;to:string|null;status:'observed'|'unknown'|'failed'};
type Branch={step:number;fromObservationId:string|null;source:string|null;firstDestination:string|null;chosenDestination:string|null;status:'changed-destination'|'same-destination'|'source-mismatch'|'unknown'};
const faults=new Set(['API_ERROR','INVALID_DISTRIBUTION','ACTION_ERROR','OBSERVATION_ERROR','SAFETY_STOP']);
const cellKey=(r:Pick<HoldoutRunRecord,'task'|'variant'|'replicate'|'condition'>)=>`${r.task}/${r.variant}/${r.replicate}/${r.condition}`;
const pairKey=(r:Pick<HoldoutRunRecord,'task'|'variant'|'replicate'>)=>`${r.task}/${r.variant}/${r.replicate}`;
const groupKey=(r:Pick<HoldoutRunRecord,'task'|'variant'|'condition'>)=>`${r.task}/${r.variant}/${r.condition}`;
const object=(value:unknown):Record<string,unknown>|undefined=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:undefined;
const text=(value:unknown):string|null=>typeof value==='string'&&value.length>0?value:null;
const image=(s:BetaStep)=>s.assetFiles?.current?.sha256??s.vision?.imageSha256??null;
function localRoute(url:string|undefined):string|null {
 if(!url)return null;
 try{
  const parsed=new URL(url);
  if(!['http:','https:'].includes(parsed.protocol)||!['localhost','127.0.0.1','[::1]'].includes(parsed.hostname))return null;
  // The opt-in holdout UI renders its initial empty hash as home. This is a
  // fixture-specific audit alias, not general image or semantic equivalence.
  const hash=parsed.hash===''&&parsed.pathname.startsWith('/good/')&&parseHoldoutFixture(parsed.search)?'#home':parsed.hash;
  return parsed.pathname+hash;
 }catch{return null;}
}
function strippedConfig(config:BetaResult['config']) {const {id:_id,deferral:_deferral,...rest}=config;return rest;}
const mean=(values:number[])=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
function counts(values:string[]) {const result:Record<string,number>={};for(const value of values)result[value]=(result[value]??0)+1;return result;}
function summarizeRun(record:HoldoutRunRecord,identityErrors:string[]) {
 const r=record.result,steps=r.steps;
 const edges:Edge[]=steps.flatMap((step,index)=>{
  if(!step.action||!['click','back','scroll'].includes(step.action.type))return [];
  const performed=step.outcome==='UI_PERFORMED',failed=step.outcome==='ACTION_ERROR'||step.error!==undefined&&!performed;
  const from=localRoute(step.audit?.url),to=performed?localRoute(steps[index+1]?.audit?.url):null;
  return [{step:step.number,observationId:step.observationId??null,action:structuredClone(step.action),from,to,status:failed?'failed':performed&&from!==null&&to!==null?'observed':'unknown'}];
 });
 const observed=edges.filter(edge=>edge.status==='observed');
 const edgeCounts=counts(observed.map(edge=>JSON.stringify([edge.from,edge.to])));
 const seen=new Set<string>();let revisits=0;
 // Only destinations of observed, performed UI operations count as route visits.
 for(const edge of observed){if(edge.from!==null)seen.add(edge.from);if(edge.to!==null){if(seen.has(edge.to))revisits++;seen.add(edge.to);}}
 const policySelections=steps.flatMap(step=>{
  const selection=step.selection,policy=selection?.policy;if(!selection||!policy)return [];
  const keys=Object.keys(policy.before).sort(),maximum=Math.max(...keys.map(key=>policy.before[key]));
  const candidates=keys.filter(key=>policy.before[key]===maximum&&maximum>0),beforeArgmax=candidates[0]??null;
  return [{step:step.number,mode:selection.mode,beforeArgmax,beforeArgmaxCandidates:candidates,selected:selection.selected,changed:beforeArgmax!==null&&beforeArgmax!==selection.selected,fromTie:candidates.length>1,selectedHadLowerBeforeProbability:beforeArgmax!==null&&(policy.before[selection.selected]??0)<maximum,weights:structuredClone(policy.weights)}];
 });
 const postReturnBranches:Branch[]=[];
 for(const current of steps){
  const context=object(current.modelInput?.experienceContext),routes=context?.returnedRoutes;
  if(!Array.isArray(routes))continue;
  for(const value of routes){
   const route=object(value),path=Array.isArray(route?.path)?route.path:[],first=object(path[0]),source=object(first?.source),last=object(path.at(-1)),lastResult=object(last?.result);
   const fromId=text(route?.fromObservationId),sourceMatches=steps.filter(step=>step.observationId===fromId),original=sourceMatches.length===1?sourceMatches[0]:undefined;
   const firstEdge=original?edges.find(edge=>edge.step===original.number):undefined,currentEdge=edges.find(edge=>edge.step===current.number);
   const branch:Branch={step:current.number,fromObservationId:fromId,source:localRoute(current.audit?.url),firstDestination:firstEdge?.to??null,chosenDestination:currentEdge?.to??null,status:'unknown'};
   const linked=route?.toObservationId===current.observationId&&lastResult?.observationId===current.observationId&&source?.observationId===fromId&&original!==undefined&&source?.imageSha256===image(original)&&lastResult?.imageSha256===image(current)&&source?.imageSha256===image(current);
   if(linked&&branch.source!==null&&firstEdge?.from!==null&&firstEdge?.from!==undefined&&branch.source!==firstEdge.from)branch.status='source-mismatch';
   else if(linked&&branch.source!==null&&branch.source===firstEdge?.from&&firstEdge?.action.type==='click'&&firstEdge.status==='observed'&&currentEdge?.action.type==='click'&&currentEdge.status==='observed')branch.status=branch.chosenDestination===branch.firstDestination?'same-destination':'changed-destination';
   postReturnBranches.push(branch);
  }
 }
 const objectiveOK=r.objectiveAssessment?.status==='OK'&&typeof r.objectiveAssessment.value==='boolean';
 const fault=faults.has(r.termination)||!objectiveOK||r.terminalObservation?.status!=='RECORDED';
 const reasons=[...identityErrors,...(!r.validForComparison?['REPORTED_INVALID']:[]),...(fault?['INFRASTRUCTURE_OR_AUDIT_FAULT']:[]),...(objectiveOK&&r.objectiveAssessment.value!==r.objectiveSuccess?['OBJECTIVE_VALUE_MISMATCH']:[])];
 const valid=reasons.length===0;
 const decisions=steps.filter(step=>step.deferral?.decision).map(step=>step.deferral!.decision!);
 return {id:record.id,task:record.task,variant:record.variant,replicate:record.replicate,condition:record.condition,requests:r.apiCalls,objectiveAssessment:structuredClone(r.objectiveAssessment),reportedObjectiveSuccess:r.objectiveSuccess,perceivedDone:r.perceivedDone,termination:r.termination,validity:{valid,reportedValidForComparison:r.validForComparison,fault,reasons},timing:{apiMs:r.apiMs,uiMs:r.uiMs,elapsedMs:r.elapsedMs,humanTimeMs:null,modeledUserMs:r.modeledUserMs},metrics:{uiActions:r.uiActions,looks:r.looks,decisions:r.decisions,observedUIEdges:observed.length,unknownUIEdges:edges.filter(edge=>edge.status==='unknown').length,failedUIEdges:edges.filter(edge=>edge.status==='failed').length,repeatedDirectedEdges:Object.values(edgeCounts).reduce((n,count)=>n+Math.max(0,count-1),0),revisits,policyChanges:policySelections.filter(s=>s.changed).length,policyChangesFromTies:policySelections.filter(s=>s.changed&&s.fromTie).length,appliedDeferralSteps:decisions.filter(d=>d.appliedCandidates.length>0).length,appliedDeferralCandidates:decisions.reduce((sum,d)=>sum+d.appliedCandidates.length,0),releaseSteps:decisions.filter(d=>d.reason==='ALTERNATIVES_EXHAUSTED').length,postReturnBranchChanges:postReturnBranches.filter(branch=>branch.status==='changed-destination').length},route:{identity:'local-pathname-plus-hash-with-valid-holdout-home-alias',edges,complete:edges.every(edge=>edge.status==='observed'),signature:JSON.stringify(edges.map(edge=>[edge.action.type,edge.from,edge.to,edge.status]))},policySelections,postReturnBranches,deferralReasons:counts(decisions.map(d=>d.reason)),selfReports:steps.map(step=>({step:step.number,reasonEvidence:step.reasonEvidence??null,assessment:step.deliberation?.assessment??null,experienceContext:step.modelInput?.experienceContext??null})),identity:{code:r.code??null,initialImageSha256:record.initialImageSha256,initialFingerprint:r.initialFingerprint}};
}

/** Offline descriptive summaries. No model requests, browser actions, or human outcome inference. */
export function analyzeHoldoutRuns(records:HoldoutRunRecord[]) {
 const errors:IntegrityError[]=[],perRecord=records.map(()=>[] as string[]);
 const add=(code:string,indexes:number[])=>{errors.push({code,ids:indexes.map(index=>records[index].id)});for(const index of indexes)perRecord[index].push(code);};
 const byCell=new Map<string,number[]>(),byId=new Map<string,number[]>(),byResultId=new Map<string,number[]>();
 for(const [index,r] of records.entries()){
  for(const [map,key] of [[byCell,cellKey(r)],[byId,r.id],[byResultId,r.result.runId]] as const)map.set(key,[...(map.get(key)??[]),index]);
  if(!r.id||r.id!==r.result.runId)add('RUN_ID_MISMATCH',[index]);
  if(!['switch','revisit','direct'].includes(r.task)||!['alpha','beta'].includes(r.variant)||![1,2].includes(r.replicate)||!['control','policy'].includes(r.condition))add('UNEXPECTED_CELL',[index]);
  if(!r.initialImageSha256)add('MISSING_INITIAL_IMAGE',[index]);
  if(!r.result.code?.revision||!r.result.code.sourceHash)add('MISSING_CODE_IDENTITY',[index]);
 }
 for(const indexes of byCell.values())if(indexes.length>1)add('DUPLICATE_CELL',indexes);
 for(const indexes of byId.values())if(indexes.length>1)add('DUPLICATE_RUN_ID',indexes);
 for(const indexes of byResultId.values())if(indexes.length>1&&!errors.some(e=>e.code==='DUPLICATE_RUN_ID'&&isDeepStrictEqual(e.ids,indexes.map(i=>records[i].id))))add('AMBIGUOUS_RESULT_RUN_ID',indexes);
 const runs=records.map((record,index)=>summarizeRun(record,perRecord[index]));
 const grouped=new Map<string,typeof runs>();for(const run of runs){const key=groupKey(run);grouped.set(key,[...(grouped.get(key)??[]),run]);}
 const cells=[...grouped.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([key,items])=>{
  const valid=items.filter(item=>item.validity.valid),completePaths=valid.filter(item=>item.route.complete),uniquePaths=new Set(completePaths.map(item=>item.route.signature));
  return {key,task:items[0].task,variant:items[0].variant,condition:items[0].condition,n:items.length,validN:valid.length,objectiveSuccesses:valid.filter(item=>item.objectiveAssessment.value===true).length,objectiveFailures:valid.filter(item=>item.objectiveAssessment.value===false).length,faults:items.filter(item=>item.validity.fault).length,invalidN:items.length-valid.length,terminations:counts(items.map(item=>item.termination)),meanUIActions:mean(valid.map(item=>item.metrics.uiActions)),meanDecisions:mean(valid.map(item=>item.metrics.decisions)),pathUniqueness:{completeValidN:completePaths.length,unknownPathN:valid.length-completePaths.length,uniquePaths:uniquePaths.size,consistent:completePaths.length>1?uniquePaths.size===1:null},behaviorTotals:{repeatedDirectedEdges:valid.reduce((n,r)=>n+r.metrics.repeatedDirectedEdges,0),revisits:valid.reduce((n,r)=>n+r.metrics.revisits,0),policyChanges:valid.reduce((n,r)=>n+r.metrics.policyChanges,0),postReturnBranchChanges:valid.reduce((n,r)=>n+r.metrics.postReturnBranchChanges,0)}};
 });
 const pairGroups=new Map<string,number[]>();records.forEach((r,i)=>pairGroups.set(pairKey(r),[...(pairGroups.get(pairKey(r))??[]),i]));
 const pairs=[...pairGroups.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([key,indexes])=>{
  const controls=indexes.filter(i=>records[i].condition==='control'),policies=indexes.filter(i=>records[i].condition==='policy');
  const pairErrors:string[]=[];let status:'paired'|'missing-condition'|'ambiguous'='paired';
  if(controls.length===0||policies.length===0){status='missing-condition';pairErrors.push('MISSING_PAIRED_CONDITION');}
  if(controls.length>1||policies.length>1){status='ambiguous';pairErrors.push('AMBIGUOUS_PAIR');}
  if(status==='paired'){
   const c=records[controls[0]],p=records[policies[0]];
   if(c.result.code?.sourceHash!==p.result.code?.sourceHash)pairErrors.push('SOURCE_HASH_MISMATCH');
   if(c.result.code?.revision!==p.result.code?.revision)pairErrors.push('REVISION_MISMATCH');
   if(c.initialImageSha256!==p.initialImageSha256)pairErrors.push('INITIAL_IMAGE_MISMATCH');
   if(!isDeepStrictEqual(strippedConfig(c.result.config),strippedConfig(p.result.config)))pairErrors.push('CONFIG_MISMATCH');
   if(!isDeepStrictEqual(c.result.input.charter,p.result.input.charter))pairErrors.push('CHARTER_MISMATCH');
   if(!isDeepStrictEqual(c.result.input.persona,p.result.input.persona))pairErrors.push('PERSONA_MISMATCH');
   if(indexes.some(i=>perRecord[i].length))pairErrors.push('RUN_IDENTITY_ERROR');
  }
  for(const code of pairErrors)errors.push({code,ids:indexes.map(i=>records[i].id)});
  return {key,status,consistent:pairErrors.length===0,errors:pairErrors,ids:indexes.map(i=>records[i].id),bothValid:indexes.length===2&&indexes.every(i=>runs[i].validity.valid),control:controls.length===1?records[controls[0]].id:null,policy:policies.length===1?records[policies[0]].id:null};
 });
 const expected:string[]=[];for(const task of ['switch','revisit','direct'])for(const variant of ['alpha','beta'])for(const replicate of [1,2])for(const condition of ['control','policy'])expected.push(`${task}/${variant}/${replicate}/${condition}`);
 const missing=expected.filter(key=>!byCell.has(key)),duplicates=[...byCell.entries()].filter(([,indexes])=>indexes.length>1).map(([key,indexes])=>({key,ids:indexes.map(i=>records[i].id)}));
 return {schemaVersion:1,kind:'offline-holdout-descriptive-comparison',completeness:{expected:24,received:records.length,uniqueCells:byCell.size,missing,duplicates,complete:missing.length===0&&duplicates.length===0&&records.length===24},integrity:{ok:errors.length===0,errors},runs,cells,pairs,limitations:['Behavior metrics describe model and runner behavior; they are not human difficulty, preferences, validation, or causal effects.','Two replicates per condition support descriptive path comparison only; no p-values or generalization claims.','Elapsed/API/UI times remain separate; human time is unknown. Modeled time is a configured assumption.','Objective outcomes use the independent recorded assessment; infrastructure faults are excluded from task failures and valid-run means.','Route identity uses audited local pathname plus hash, omitting host, temporary port, and query. Only an explicit valid holdout fixture under /good/ aliases the empty hash to #home, matching that fixture UI. Invalid or conflicting fixture selectors, other paths, and other hashes receive no alias. This exception does not establish general semantic equivalence; different state or query values can share a route, and equal images do not establish semantic identity.','Only the immediately following audited observation establishes a destination. Missing observations and failed actions never establish success or recovery.','Policy changes compare deterministic lexical argmax of the saved pre-policy distribution with the saved selection; sampled changes are descriptive, not policy-attributed counterfactuals.','Model judgments, evidence references, and reasons remain model self-reports, including accepted evidence; branch changes are behavior, not demonstrated recovery.','Pair consistency checks code revision, source hash, initial image, charter, persona, and config with only id and deferral removed. Pair integrity does not prove human validity.']};
}
