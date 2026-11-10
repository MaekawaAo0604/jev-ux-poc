import {isDeepStrictEqual} from 'node:util';
import {createHash} from 'node:crypto';
import {parsePersona} from '../jev/persona.js';
import {analyzeRecoveryRuns} from './recovery-analysis.js';
import {analyzeMotionRuns} from './motion-comparison-analysis.js';
import {routeDistance} from './persona-report.js';
import {personaBetaActors,type PersonaBetaRecord,type PersonaBetaActor} from './persona-beta-contracts.js';
import type {BetaStep} from './virtual-beta-core.js';

const clone=<T>(v:T):T=>structuredClone(v);
const unique=<T>(v:T[])=>[...new Set(v)];
const mean=(v:number[])=>v.length?v.reduce((a,b)=>a+b,0)/v.length:null;
const histogram=(values:string[])=>{const out:Record<string,number>={};for(const value of values)out[value]=(out[value]??0)+1;return out;};
const fixtureKey=(r:Pick<PersonaBetaRecord,'fixture'>)=>`${r.fixture.task}/${r.fixture.condition}`;
const fixture={version:1 as const,task:'workshop' as const,condition:'unchanged' as const};
type IntegrityError={code:string;ids:string[];source?:'persona-delivery'|'motion';step?:number;stage?:string};
type RecoveryRun=ReturnType<typeof analyzeRecoveryRuns>['runs'][number];

function routeActions(steps:BetaStep[]){
 return steps.flatMap(step=>{
  const action=step.action;if(step.outcome!=='UI_PERFORMED'||!action||!['click','back','scroll'].includes(action.type))return [];
  const route=step.audit?.recovery?.route??null;
  const matches=action.type==='click'?step.audit?.screen.elements.filter(e=>e.id===action.elementId)??[]:[];
  const reviewerControlText=action.type==='click'&&matches.length===1?matches[0].text:null;
  const bound=route!==null&&(action.type!=='click'||reviewerControlText!==null);
  const direction=action.type==='scroll'?action.direction:null;
  return [{step:step.number,observationId:step.observationId??null,imageSha256:step.assetFiles?.current?.sha256??null,route,action:clone(action),reviewerControlText,bound,token:bound?JSON.stringify([route,action.type,reviewerControlText,direction]):null}];
 });
}

type Path={id:string;runId:string;actor:PersonaBetaActor;replicate:number;fixture:PersonaBetaRecord['fixture'];routeTokens:string[]};
function distances(paths:Path[]){
 const within:{left:string;right:string;actor:PersonaBetaActor;distance:number}[]=[],between:{left:string;right:string;actors:PersonaBetaActor[];distance:number}[]=[];
 for(let i=0;i<paths.length;i++)for(let j=i+1;j<paths.length;j++){
  const a=paths[i],b=paths[j];if(!isDeepStrictEqual(a.fixture,b.fixture))continue;
  const distance=routeDistance(a.routeTokens,b.routeTokens);
  if(a.actor===b.actor)within.push({left:a.id,right:b.id,actor:a.actor,distance});
  else between.push({left:a.id,right:b.id,actors:[a.actor,b.actor],distance});
 }
 const summarize=<T extends {distance:number}>(pairs:T[])=>({count:pairs.length,mean:mean(pairs.map(p=>p.distance)),pairs});
 const withinMean=mean(within.map(p=>p.distance)),betweenMean=mean(between.map(p=>p.distance));
 return {within:summarize(within),between:summarize(between),betweenMinusWithin:withinMean===null||betweenMean===null?null:betweenMean-withinMean,byActor:Object.fromEntries(personaBetaActors.map(actor=>[actor,summarize(within.filter(p=>p.actor===actor))]))};
}

function firstImages(record:PersonaBetaRecord){
 const seen=new Set<string>();
 return (record.result?.steps??[]).flatMap(step=>{
  const imageSha256=step.assetFiles?.current?.sha256;if(!imageSha256||seen.has(imageSha256))return [];seen.add(imageSha256);
  const criteria=step.questions?.nextAction?.criteria;
  const candidateBindings=criteria?Object.entries(criteria).sort(([a],[b])=>a<b?-1:a>b?1:0):null;
  return [{id:record.id,runId:record.runId,actor:record.actor,replicate:record.replicate,fixture:clone(record.fixture),step:step.number,observationId:step.observationId??null,imageSha256,candidateBindings,raw:clone(step.selection?.raw??null),filtered:clone(step.selection?.filtered??null),modelChoice:step.selection?.modelChoice??null,selected:step.selection?.selected??null,actualAction:clone(step.action??null),outcome:step.outcome??null,reasonEvidence:clone(step.reasonEvidence??null)}];
 });
}
type ImageOccurrence=ReturnType<typeof firstImages>[number];
function totalVariation(a:ImageOccurrence['raw'],b:ImageOccurrence['raw']){
 if(!a||!b||!isDeepStrictEqual(Object.keys(a).sort(),Object.keys(b).sort()))return null;
 const valid=(d:Record<string,number>)=>Object.values(d).every(p=>Number.isFinite(p)&&p>=0)&&Math.abs(Object.values(d).reduce((s,p)=>s+p,0)-1)<1e-8;
 if(!valid(a)||!valid(b))return null;
 return Object.keys(a).reduce((s,k)=>s+Math.abs(a[k]-b[k]),0)/2;
}
function compareImages(records:PersonaBetaRecord[]){
 const firstOccurrences=records.flatMap(firstImages),pairs: {imageSha256:string;left:ImageOccurrence;right:ImageOccurrence;rawTotalVariation:number|null;selectedEqual:boolean|null;modelChoiceEqual:boolean|null;sharedHistoryEstablished:false;probabilityInterpretation:'raw-model-distribution-not-confidence'}[]=[];
 let sameImagePairs=0,candidateBindingMismatches=0,unmeasuredBindings=0;
 for(let i=0;i<firstOccurrences.length;i++)for(let j=i+1;j<firstOccurrences.length;j++){
  const left=firstOccurrences[i],right=firstOccurrences[j];
  if(left.runId===right.runId||left.imageSha256!==right.imageSha256||!isDeepStrictEqual(left.fixture,right.fixture))continue;
  sameImagePairs++;
  if(!left.candidateBindings||!right.candidateBindings){unmeasuredBindings++;continue;}
  if(!isDeepStrictEqual(left.candidateBindings,right.candidateBindings)){candidateBindingMismatches++;continue;}
  pairs.push({imageSha256:left.imageSha256,left,right,rawTotalVariation:totalVariation(left.raw,right.raw),selectedEqual:left.selected===null||right.selected===null?null:left.selected===right.selected,modelChoiceEqual:left.modelChoice===null||right.modelChoice===null?null:left.modelChoice===right.modelChoice,sharedHistoryEstablished:false,probabilityInterpretation:'raw-model-distribution-not-confidence'});
 }
 return {firstOccurrences,sameImagePairs,candidateBindingMismatches,unmeasuredBindings,pairs};
}

const permutations=(values:number[]):number[][]=>values.length?values.flatMap((v,i)=>permutations(values.filter((_,j)=>i!==j)).map(p=>[v,...p])):[[]];
/** Exact reference conditional on complete blocks; exchangeability is an unverified assumption. */
function permutationReference(records:PersonaBetaRecord[],complete:Path[]){
 const replicates=unique([1,2,3,...records.filter(r=>isDeepStrictEqual(r.fixture,fixture)).map(r=>r.replicate)]).sort((a,b)=>a-b);
 const planned=replicates.map(replicate=>{
  const items=records.filter(r=>isDeepStrictEqual(r.fixture,fixture)&&r.replicate===replicate);
  const missingActors=personaBetaActors.filter(actor=>!items.some(r=>r.actor===actor));
  const duplicateActors=personaBetaActors.filter(actor=>items.filter(r=>r.actor===actor).length>1);
  const invalidActors=personaBetaActors.filter(actor=>items.some(r=>r.actor===actor)&&!items.filter(r=>r.actor===actor).every(r=>complete.some(p=>p.id===r.id&&p.runId===r.runId)));
  return {key:fixtureKey({fixture})+'/r'+replicate,replicate,attempted:items.length,completeRuns:items.filter(r=>complete.some(p=>p.id===r.id&&p.runId===r.runId)).length,missingActors:[...missingActors],duplicateActors:[...duplicateActors],invalidActors:[...invalidActors],ids:items.map(r=>r.id)};
 });
 const includedBlocks=planned.filter(b=>b.missingActors.length+b.duplicateActors.length+b.invalidActors.length===0),excludedBlocks=planned.filter(b=>!includedBlocks.includes(b));
 const paths=includedBlocks.flatMap(b=>personaBetaActors.map(actor=>complete.find(p=>p.replicate===b.replicate&&p.actor===actor&&isDeepStrictEqual(p.fixture,fixture))!));
 const assumptions=['Actor labels must be exchangeable within replicate blocks under the reference null; this is not validated.','Time, execution order, service changes and carryover may violate exchangeability despite partial order rotation.','Only complete four-actor blocks enter this exploratory conditional reference. Missing or invalid slots are excluded without imputation.','The tail proportion is not a human-fidelity measure, a definitive causal verdict or a calibrated significance claim.'];
 const observed=distances(paths).betweenMinusWithin;
 if(includedBlocks.length<2||includedBlocks.length>3||observed===null)return {status:'insufficient-complete-blocks' as const,includedBlocks,excludedBlocks,blockCount:includedBlocks.length,assignments:0,tailCount:null,tailProportion:null,observed,assumptions};
 const options=permutations([0,1,2,3]),labels:number[]=[],pairs: {i:number;j:number;distance:number}[]=[];
 for(let i=0;i<paths.length;i++)for(let j=i+1;j<paths.length;j++)pairs.push({i,j,distance:routeDistance(paths[i].routeTokens,paths[j].routeTokens)});
 let assignments=0,tailCount=0;
 const visit=(block:number)=>{
  if(block===includedBlocks.length){
   let within=0,between=0,withinCount=0,betweenCount=0;
   for(const p of pairs)if(labels[p.i]===labels[p.j]){within+=p.distance;withinCount++;}else{between+=p.distance;betweenCount++;}
   assignments++;if(between/betweenCount-within/withinCount>=observed-1e-12)tailCount++;return;
  }
  for(const p of options){for(let i=0;i<4;i++)labels[block*4+i]=p[i];visit(block+1);}
 };visit(0);
 return {status:'exact-blocked-label-reference' as const,includedBlocks,excludedBlocks,blockCount:includedBlocks.length,assignments,tailCount,tailProportion:tailCount/assignments,observed,assumptions};
}

/** Pure descriptive analysis. Reviewer audit labels never enter actor input or candidate policy. */
export function analyzePersonaBetaRuns(records:PersonaBetaRecord[]){
 const audits:RecoveryRun[]=[],errors:IntegrityError[]=[],motion=analyzeMotionRuns(records);
 const per=records.map(()=>[] as string[]);
 const add=(code:string,indexes:number[],details:Pick<IntegrityError,'source'|'step'|'stage'>={})=>{errors.push({code,ids:indexes.map(i=>records[i].id),...details});for(const i of indexes)per[i].push(code);};
 // Apply authoritative row-bound audit faults before deriving valid trajectories.
 // Index binding preserves attribution even when separate identity checks find duplicate IDs.
 records.forEach((record,i)=>{
  for(const error of record.personaDelivery?.errors??[])add(error.code,[i],{source:'persona-delivery',step:error.step,stage:error.stage});
  for(const error of motion.runs[i].integrityErrors)add(error.code,[i],{source:'motion',step:error.step});
 });
 for(const field of ['id','runId'] as const){
  const groups=new Map<string,number[]>();records.forEach((r,i)=>groups.set(r[field],[...(groups.get(r[field])??[]),i]));
  for(const indexes of groups.values())if(indexes.length>1)add(field==='id'?'DUPLICATE_SLOT_ID':'DUPLICATE_RUN_ID',indexes);
 }
 const resultIndexes=records.flatMap((r,i)=>r.result?[i]:[]);
 if(new Set(resultIndexes.map(i=>JSON.stringify(records[i].result!.code))).size>1)add('SOURCE_MISMATCH',resultIndexes);
 for(const actor of personaBetaActors){
  const indexes=records.flatMap((r,i)=>r.actor===actor?[i]:[]),items=indexes.map(i=>records[i]);
  if(!items.length)continue;
  const parsed=items.map(r=>{try{return r.persona===null?null:parsePersona(r.persona);}catch{return undefined;}});
  const expectedPersona=parsed[0]??null;
  const canonicalHash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
  if(items.some((r,i)=>!isDeepStrictEqual(r.persona,expectedPersona)||r.personaSha256!==items[0].personaSha256||
   (actor==='baseline'?r.persona!==null||r.personaSha256!==null:!parsed[i]||parsed[i]!.id!==actor||r.personaSha256!==canonicalHash(parsed[i]))))add('PERSONA_IDENTITY_MISMATCH',indexes);
  const recovery=analyzeRecoveryRuns(items,{mode:'experience-persona-unweighted',replicates:3,fixtures:[fixture],expectedPersona,maxRunMs:300000,visualRequestMs:60000});
  errors.push(...recovery.integrity.errors);
  indexes.forEach((index,i)=>{audits[index]=recovery.runs[i];});
 }
 const runs=records.map((record,i)=>{
  const recovery=audits[i],actions=routeActions(record.result?.steps??[]),unboundUIActions=actions.filter(a=>!a.bound).length;
  const reasons=unique([...recovery.validity.reasons,...per[i]]),valid=reasons.length===0;
  const complete=valid&&recovery.coverageComplete&&unboundUIActions===0;
  const reasonEvidence=clone((record.result?.steps??[]).flatMap(s=>s.reasonEvidence?[{step:s.number,imageSha256:s.assetFiles?.current?.sha256??null,...s.reasonEvidence}]:[]));
  return {id:record.id,runId:record.runId,actor:record.actor,replicate:record.replicate,sequence:record.sequence,fixture:clone(record.fixture),status:record.status,validity:{valid,reasons},complete,pathStatus:complete?'complete-valid':'partial-or-invalid',routeTokens:actions.flatMap(a=>a.token===null?[]:[a.token]),routeActions:actions,unboundUIActions,reasonEvidence,reasonCategories:histogram(reasonEvidence.map(e=>e.category)),recovery:clone(recovery),personaDelivery:clone(record.personaDelivery??null)};
 });
 const paths={complete:runs.filter(r=>r.complete),partial:runs.filter(r=>!r.complete)};
 const actors=Object.fromEntries(personaBetaActors.map(actor=>{
  const items=runs.filter(r=>r.actor===actor),delivered=items.flatMap(r=>r.personaDelivery?[r.personaDelivery]:[]);
  const opportunities={occurredRuns:items.filter(r=>r.recovery.opportunities.prerequisiteChange==='occurred').length,deliveredRuns:items.filter(r=>r.recovery.prerequisiteEvents.some(e=>e.eligibleChanged&&e.delivered)).length,noOpportunityRuns:items.filter(r=>r.complete&&r.recovery.opportunities.prerequisiteChange==='none-observed').length,unknownRuns:items.filter(r=>r.recovery.opportunities.prerequisiteChange==='unknown'||!r.complete&&r.recovery.opportunities.prerequisiteChange==='none-observed').length,notApplicableRuns:items.filter(r=>r.recovery.opportunities.prerequisiteChange==='not-applicable').length,unchangedConfirmationRuns:items.filter(r=>r.recovery.prerequisiteEvents.some(e=>e.kind==='confirm'&&!e.eligibleAfter)).length,deliveredUnchangedConfirmationRuns:items.filter(r=>r.recovery.prerequisiteEvents.some(e=>e.kind==='confirm'&&!e.eligibleAfter&&e.delivered)).length};
  return [actor,{planned:3,attempted:items.length,missingReplicates:[1,2,3].filter(rep=>!items.some(r=>r.replicate===rep)),valid:items.filter(r=>r.validity.valid).length,complete:items.filter(r=>r.complete).length,partial:items.filter(r=>!r.complete).length,opportunities,reasonCategories:histogram(items.flatMap(r=>r.reasonEvidence.map(e=>e.category))),personaDelivery:{measuredRuns:delivered.length,unmeasuredRuns:items.length-delivered.length,native:delivered.reduce((s,d)=>s+d.native,0),assessment:delivered.reduce((s,d)=>s+d.assessment,0),action:delivered.reduce((s,d)=>s+d.action,0),errors:delivered.flatMap(d=>clone(d.errors))}}];
 }));
 return {schemaVersion:1,kind:'descriptive-persona-beta-comparison' as const,integrity:{ok:errors.length===0,errors},motion,runs,paths,distances:distances(paths.complete),sameImageComparisons:compareImages(records),actors,permutation:permutationReference(records,paths.complete),qualitativeConsistency:'unassessed' as const,interpretation:{paths:'Only valid completed audit trajectories with bound executed UI actions enter normalized edit distances; objective success is not required. Partial and invalid prefixes remain separately visible.',controls:'Route tokens use audit route, action type and unique matching reviewer control text; local candidate IDs never identify controls across images. These are reviewer-only labels.',screens:'Pair comparisons use the first occurrence per run per exact current image and exact sorted candidate criteria bindings. Other context and whole histories are not asserted equal. Candidate annotations can exclude otherwise similar opportunities.',probabilities:'Raw model probabilities and their total variation are descriptive distribution values, not confidence, human frequencies or comprehension.',reasons:'Model-reported categories are not internal cognition or verified explanations.',opportunities:'Absent, invalid and incomplete opportunities are not imputed as successful avoidance. Observed changes and successful delivery have separate denominators.',consistency:'Persona tendencies are hypotheses, not mandatory paths. Qualitative consistency, contradictions and unexercised traits require separate evidence review.',limits:'Within and between distances are descriptive pair means with correlated pairs, unequal opportunities and small sample sizes; no naturalness, human-fidelity or causal verdict is computed.'}};
}
