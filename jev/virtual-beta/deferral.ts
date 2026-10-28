import type {BetaCandidates,UserObservation} from './contracts.js';
import type {DeliberationAssessment} from './deliberation-contracts.js';
import type {ExperienceMemory,ExperienceSource} from './experience-contracts.js';
import type {DeferralConfig,DeferralMemory,DeferralDecision,DeferralEntry} from './deferral-contracts.js';
import {experienceContext} from './experience.js';
import {InvalidDistributionError} from './selection.js';

const isRecord=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const nonempty=(value:unknown):value is string=>typeof value==='string'&&value.trim().length>0;
const sameSource=(a:ExperienceSource,b:ExperienceSource)=>a.observationId===b.observationId&&a.imageSha256===b.imageSha256;
const entryKey=(entry:Pick<DeferralEntry,'imageSha256'|'candidateId'>)=>JSON.stringify([entry.imageSha256,entry.candidateId]);
function validateConfig(config:DeferralConfig){
 if(!config||typeof config.enabled!=='boolean'||!Number.isSafeInteger(config.capacity)||config.capacity<1||config.capacity>8||!Number.isFinite(config.weight)||config.weight<=0||config.weight>=1||!Number.isFinite(config.minAlternativeProbability)||config.minAlternativeProbability<0||config.minAlternativeProbability>1||config.selectionScope!==undefined&&!['global','ui-conditional'].includes(config.selectionScope))throw new Error('INVALID_DEFERRAL_CONFIG');
}
function sourceCopy(source:ExperienceSource):ExperienceSource{
 if(!source||!nonempty(source.observationId)||source.observationId==='none'||!nonempty(source.imageSha256))throw new Error('INVALID_DEFERRAL_EVIDENCE');
 return {observationId:source.observationId,imageSha256:source.imageSha256};
}
function entryCopy(entry:DeferralEntry):DeferralEntry{
 if(!entry||!nonempty(entry.imageSha256)||!nonempty(entry.candidateId)||!nonempty(entry.fromObservationId)||!nonempty(entry.toObservationId)||entry.fromObservationId===entry.toObservationId||!Array.isArray(entry.evidence)||entry.evidence.length<1||entry.evidence.length>8)throw new Error('INVALID_DEFERRAL_ENTRY');
 const evidence=entry.evidence.map(sourceCopy);
 if(new Set(evidence.map(source=>source.observationId)).size!==evidence.length)throw new Error('DUPLICATE_DEFERRAL_EVIDENCE');
 return {imageSha256:entry.imageSha256,candidateId:entry.candidateId,fromObservationId:entry.fromObservationId,toObservationId:entry.toObservationId,evidence};
}
/** An explicit uncalibrated heuristic memory; old references remain recollections, never new image evidence. */
export function copyDeferrals(memory:DeferralMemory|undefined,config:DeferralConfig):DeferralMemory{
 validateConfig(config);
 if(!config.enabled||memory===undefined)return {schemaVersion:1,entries:[]};
 if(!memory||memory.schemaVersion!==1||!Array.isArray(memory.entries))throw new Error('INVALID_DEFERRAL_MEMORY');
 const entries=memory.entries.slice(-config.capacity).map(entryCopy);
 if(new Set(entries.map(entryKey)).size!==entries.length)throw new Error('DUPLICATE_DEFERRAL_ENTRY');
 return {schemaVersion:1,entries};
}
function validateAssessment(current:UserObservation,assessment:DeliberationAssessment){
 if(!current||!nonempty(current.id)||!nonempty(current.imageSha256)||!assessment||assessment.schemaVersion!==1||assessment.kind!=='model-assessment-not-fact'||assessment.observationId!==current.id||assessment.imageSha256!==current.imageSha256||!['satisfied','unsatisfied','uncertain'].includes(assessment.goal)||!isRecord(assessment.effects))throw new Error('INVALID_CURRENT_DEFERRAL_ASSESSMENT');
}
export function updateDeferrals(memory:DeferralMemory|undefined,experience:ExperienceMemory,current:UserObservation,assessment:DeliberationAssessment,config:DeferralConfig):DeferralMemory{
 const copied=copyDeferrals(memory,config);
 validateAssessment(current,assessment);
 if(!config.enabled||assessment.goal==='satisfied')return copied;
 const context=experienceContext(experience,current);
 for(const route of context.returnedRoutes){
  if(route.path.length<2||route.path[0].source.imageSha256!==current.imageSha256||!sameSource(route.path.at(-1)!.result,{observationId:current.id,imageSha256:current.imageSha256}))continue;
  const transitions=context.transitions.slice(-route.path.length),first=transitions[0];
  if(transitions.length!==route.path.length||!first||first.execution!=='performed'||first.intent.action.type!=='click'||first.intent.action.elementId!==route.path[0].candidateId)continue;
  if(transitions.some((transition,index)=>!sameSource(transition.intent.source,route.path[index].source)||transition.intent.candidateId!==route.path[index].candidateId||!sameSource(transition.result,route.path[index].result)||index>0&&!sameSource(transitions[index-1].result,transition.intent.source)))continue;
  if(transitions.some(transition=>transition.judgment?.evidence&&transition.judgment.progress==='advances'))continue;
  const evidence:ExperienceSource[]=[];
  for(const transition of transitions){
   const judgment=transition.judgment;
   if(judgment?.evidence&&(judgment.progress==='neutral'||judgment.progress==='conflicts'||judgment.expectation==='not_supported')&&!evidence.some(source=>sameSource(source,judgment.evidence!)))evidence.push(sourceCopy(judgment.evidence));
  }
  if(!evidence.length)continue;
  const entry:DeferralEntry={imageSha256:first.intent.source.imageSha256,candidateId:first.intent.candidateId,fromObservationId:first.intent.source.observationId,toObservationId:current.id,evidence};
  copied.entries=[...copied.entries.filter(previous=>entryKey(previous)!==entryKey(entry)),entryCopy(entry)].slice(-config.capacity);
 }
 return copied;
}
function validateDistribution(raw:Record<string,number>,candidates:BetaCandidates):{keys:string[];total:number}{
 const invalid=(message:string):never=>{throw new InvalidDistributionError(message);};
 if(!isRecord(candidates)||!Object.keys(candidates).length)invalid('Deferral requires nonempty current candidates');
 const keys=Object.keys(candidates);
 if(!isRecord(raw)||Object.keys(raw).length!==keys.length||keys.some(key=>!Object.hasOwn(raw,key)))invalid('Deferral distribution must contain exactly the current candidate keys');
 if(keys.some(key=>typeof raw[key]!=='number'||!Number.isFinite(raw[key])||raw[key]<0||raw[key]>1))invalid('Deferral probabilities must be finite numbers between zero and one');
 const total=[...keys].sort().reduce((sum,key)=>sum+raw[key],0);
 if(total<=0||Math.abs(total-1)>0.02)invalid('Deferral probability sum must be within 0.02 of one');
 for(const key of keys){
  const action=candidates[key]?.action;
  if(!action||!['click','back','scroll','done','stuck','look','reread','wait','abandon'].includes(action.type)||action.type==='click'&&action.elementId!==key)invalid('Unsupported current deferral candidate');
 }
 return {keys,total};
}
/** Positive multipliers preserve every candidate and zero probability; the sampler applies and records them. */
export function deferralDecision(memory:DeferralMemory|undefined,current:UserObservation,candidates:BetaCandidates,assessment:DeliberationAssessment,raw:Record<string,number>,config:DeferralConfig):DeferralDecision{
 const copied=copyDeferrals(memory,config);
 validateAssessment(current,assessment);
 const {keys,total}=validateDistribution(raw,candidates),weights=Object.fromEntries(keys.map(key=>[key,1]));
 const clicks=keys.filter(key=>candidates[key].action.type==='click');
 const predictions=Object.fromEntries(clicks.map(key=>{
  const prediction=Object.hasOwn(assessment.effects,key)?assessment.effects[key].prediction:'unknown';
  if(!['advances','neutral','conflicts','unknown'].includes(prediction))throw new Error('INVALID_DEFERRAL_EFFECT');
  return [key,prediction];
 }));
 const plausibleCandidates=clicks.filter(key=>raw[key]>0&&raw[key]/total>=config.minAlternativeProbability&&predictions[key]!=='conflicts');
 const deferredCandidates=clicks.filter(key=>copied.entries.some(entry=>entry.imageSha256===current.imageSha256&&entry.candidateId===key));
 let reason:DeferralDecision['reason'],appliedCandidates:string[]=[];
 if(!deferredCandidates.length)reason='NO_DEFERRED_CANDIDATE';
 else if(!plausibleCandidates.length)reason='NO_PLAUSIBLE_ALTERNATIVE';
 else if(plausibleCandidates.every(key=>deferredCandidates.includes(key)))reason='ALTERNATIVES_EXHAUSTED';
 else{reason='DEFER_WITH_ALTERNATIVES';appliedCandidates=[...deferredCandidates];for(const key of appliedCandidates)weights[key]=config.weight;}
 return {kind:'temporary-deferral',weights,plausibleCandidates,deferredCandidates,appliedCandidates,reason};
}
