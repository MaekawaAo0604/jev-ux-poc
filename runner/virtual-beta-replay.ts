import {copyDeferrals,updateDeferrals,deferralDecision} from '../jev/virtual-beta/deferral.js';
import {arriveExperience,beginExperience,experienceQuestions,admitExperience,experienceContext} from '../jev/virtual-beta/experience.js';
import {prepareReasonContext,requiredReasonSources,reasonQuestions,admitReasons} from '../jev/virtual-beta/deferral-reason.js';
import type {DeferralReasonMemory,DeferralReasonContext} from '../jev/virtual-beta/deferral-reason-contracts.js';
import type {ExperienceMemory,ExperienceIntent} from '../jev/virtual-beta/experience-contracts.js';
import {admitAssessment} from '../jev/virtual-beta/deliberation.js';
import type {BetaCandidates,UserObservation} from '../jev/virtual-beta/contracts.js';
import type {AdmittedObservationSource} from '../jev/virtual-beta/deliberation-contracts.js';
import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {replaySelection} from '../jev/virtual-beta/selection.js';
import {sha,type BetaResult} from './virtual-beta-core.js';
const isRecord=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
/** Only model-input image references backed by the verified attached assets admit sources. */
function assessmentSources(input:Record<string,unknown>,assets:Record<string,{file:string;sha256:string}>,current:UserObservation):AdmittedObservationSource[]{
 const observation=input.observation;
 if(!isRecord(observation)||typeof observation.id!=='string'||observation.id!==current.id)throw new Error('ASSESSMENT_CURRENT_SOURCE_MISMATCH');
 const imageHash=(image:unknown):string=>{
  if(typeof image!=='string'||!Object.hasOwn(assets,image))throw new Error('ASSESSMENT_SOURCE_IMAGE_NOT_ATTACHED');
  return assets[image].sha256;
 };
 const currentHash=imageHash(observation.image);
 if(currentHash!==current.imageSha256||(Object.hasOwn(observation,'imageSha256')&&observation.imageSha256!==currentHash))throw new Error('ASSESSMENT_CURRENT_IMAGE_MISMATCH');
 const memory=input.memoryObservations===undefined?[]:input.memoryObservations;
 const reasons=input.reasonObservations===undefined?[]:input.reasonObservations;
 if(!Array.isArray(memory)||!Array.isArray(reasons))throw new Error('ASSESSMENT_MEMORY_SOURCE_INVALID');
 const sources=new Map<string,AdmittedObservationSource>();
 const add=(observationId:unknown,imageSha256:string)=>{
  if(typeof observationId!=='string'||!observationId.trim()||observationId==='none')throw new Error('ASSESSMENT_SOURCE_ID_INVALID');
  const prior=sources.get(observationId);
  if(prior&&prior.imageSha256!==imageSha256)throw new Error('ASSESSMENT_SOURCE_ID_CONFLICT');
  sources.set(observationId,{observationId,imageSha256});
 };
 for(const entry of [...memory,...reasons]){
  if(!isRecord(entry))throw new Error('ASSESSMENT_MEMORY_SOURCE_INVALID');
  const hash=imageHash(entry.image);
  if(entry.imageSha256!==hash)throw new Error('ASSESSMENT_MEMORY_SOURCE_IMAGE_MISMATCH');
  add(entry.observationId,hash);
 }
 add(observation.id,currentHash);
 return [...sources.values()];
}
function checkReasonSources(input:Record<string,unknown>,context:DeferralReasonContext,config:NonNullable<BetaResult['config']['deferralReason']>){
 const refs=input.reasonObservations;
 const expected=requiredReasonSources(context,config);
 if(!Array.isArray(refs)||refs.length!==expected.length||refs.some((ref,i)=>!isRecord(ref)||ref.observationId!==expected[i].observationId||ref.imageSha256!==expected[i].imageSha256))throw Error('REASON_SOURCE_REFERENCE_MISMATCH');
}
export async function replayDirectory(directory:string){
 const result:BetaResult=JSON.parse(await readFile(join(directory,'result.json'),'utf8'));let choices=0,images=0,assessments=0;
 let deferrals=result.config.deferral?.enabled?copyDeferrals(undefined,result.config.deferral):undefined,effectiveDeferrals=deferrals;
 let experience:ExperienceMemory|undefined,pending:ExperienceIntent|undefined,execution:'performed'|'unchanged'='unchanged';
 let reasonMemory:DeferralReasonMemory|undefined;
 const seen=new Map<string,string>();
 for(const step of result.steps){
  const d=step.deliberation,current=step.userState?.lastObservation;
  if(current)seen.set(current.id,current.imageSha256);
  if(d){
   if(d.inputSha256!==sha(JSON.stringify({input:d.modelInput,questions:d.questions,assets:d.assetFiles})))throw new Error('ASSESSMENT_INPUT_HASH_MISMATCH');
   for(const asset of Object.values(d.assetFiles)){if(asset.file!==asset.file.split(/[\\/]/).at(-1))throw new Error('UNSAFE_IMAGE_PATH');if(sha(await readFile(join(directory,asset.file)))!==asset.sha256)throw new Error('ASSESSMENT_IMAGE_HASH_MISMATCH');images++;}
   if(d.assessment){
    if(!d.response||!step.userState?.lastObservation)throw new Error('ASSESSMENT_RESPONSE_MISSING');
    const current=step.userState.lastObservation;
    const sources=assessmentSources(d.modelInput,d.assetFiles,current);
    const candidates:BetaCandidates=Object.fromEntries(Object.keys(d.questions).filter(k=>k.startsWith('effect_')).map(k=>{const id=k.slice(7);return [id,{action:{type:'click',elementId:id},label:id}];}));
    if(result.config.experience?.enabled){
     experience=arriveExperience(experience,pending,current,execution,result.config.experience);pending=undefined;
     if(!equal((d.modelInput.userState as any)?.experience,experience)||!equal(d.modelInput.experienceContext,experienceContext(experience,current)))throw new Error('EXPERIENCE_ARRIVAL_MISMATCH');
    }
    let reasonContext:DeferralReasonContext|undefined;
    if(result.config.deferralReason?.enabled){
     if(sources.some(s=>seen.get(s.observationId)!==s.imageSha256))throw Error('REASON_SOURCE_NOT_PREVIOUSLY_OBSERVED');
     const offered:BetaCandidates=Object.fromEntries(current.candidateIds.map(id=>[id,{action:/^e\d+$/.test(id)?{type:'click',elementId:id}:{type:'stuck'},label:id}]));
     reasonContext=prepareReasonContext(reasonMemory,deferrals!,experience,current,offered,result.config.deferralReason);
     if(!equal(d.modelInput.deferralReasonContext,reasonContext))throw Error('REASON_CONTEXT_MISMATCH');
     checkReasonSources(d.modelInput,reasonContext,result.config.deferralReason);
    }
    const outcomeQuestions=experience?experienceQuestions(experience,sources,result.config.experience?.evidenceMode):{};
    const reasonRequest=reasonContext?reasonQuestions(reasonContext,sources,result.config.deferralReason?.reviewMode):{};
    for(const [key,question] of Object.entries(outcomeQuestions))if(!equal(d.questions[key],question))throw new Error('EXPERIENCE_QUESTION_MISMATCH');
    for(const [key,question] of Object.entries(reasonRequest))if(!equal(d.questions[key],question))throw new Error('REASON_QUESTION_MISMATCH');
    const response={...d.response,answers:Object.fromEntries(Object.entries(d.response.answers).filter(([key])=>!Object.hasOwn(outcomeQuestions,key)&&!Object.hasOwn(reasonRequest,key)))};
    const assessment=admitAssessment(response,candidates,current,sources);
    if(experience){
     if(Object.keys(outcomeQuestions).length)experience=admitExperience(d.response,experience,sources,result.config.experience?.evidenceMode);
     if(!equal(step.userState.experience,experience)||!equal((step.modelInput?.userState as any)?.experience,experience)||!equal(step.modelInput?.experienceContext,experienceContext(experience,current)))throw new Error('EXPERIENCE_JUDGMENT_MISMATCH');
    }
    if(!equal(assessment,d.assessment))throw new Error('ASSESSMENT_RECORD_MISMATCH');
    if(result.config.deferral?.enabled){deferrals=updateDeferrals(deferrals,experience!,current,assessment,result.config.deferral);effectiveDeferrals=deferrals;if(!equal(step.deferral?.state,deferrals))throw new Error('DEFERRAL_STATE_MISMATCH');}
    if(reasonContext){
     const admitted=admitReasons(d.response,reasonContext,deferrals!,sources,result.config.deferralReason!);
     reasonMemory=admitted.memory;effectiveDeferrals=admitted.effectiveDeferrals;
     if(!equal(step.deferralReason,{memory:reasonMemory,record:admitted.record,effectiveState:effectiveDeferrals}))throw Error('REASON_RECORD_MISMATCH');
     if(step.modelInput){
      if(!equal(step.modelInput.deferralReasonContext,reasonContext)||!equal(step.modelInput.reasonObservations,d.modelInput.reasonObservations)||!equal(step.modelInput.deferralReasonMemory,reasonMemory)||!equal(step.modelInput.deferralReasonAssessment,admitted.record))throw Error('REASON_ACTION_INPUT_MISMATCH');
      const actionSources=assessmentSources(step.modelInput,step.assetFiles!,current);
      if(!equal(actionSources,sources))throw Error('REASON_ACTION_SOURCE_MISMATCH');
     }
    }
    assessments++;
   }
  }
  if(step.modelInput&&step.questions&&step.assetFiles&&step.inputSha256!==sha(JSON.stringify({input:step.modelInput,questions:step.questions,assets:step.assetFiles})))throw new Error('MODEL_INPUT_HASH_MISMATCH');
  for(const source of Object.values(step.assetFiles??{})){if(source.file!==source.file.split(/[\\/]/).at(-1))throw new Error('UNSAFE_IMAGE_PATH');if(sha(await readFile(join(directory,source.file)))!==source.sha256)throw new Error('IMAGE_HASH_MISMATCH');images++;}
  if(result.config.experience?.enabled&&step.selection&&step.action&&['UI_PERFORMED','FIXATION_MOVED','REREAD','WAIT_NO_UI'].includes(step.outcome??'')){
   pending=beginExperience(step.userState!.lastObservation!,step.selection.selected,step.action,step.deliberation?.assessment);execution=step.outcome==='UI_PERFORMED'?'performed':'unchanged';
  }
  if(step.selection&&result.config.deferral?.enabled){
   const candidates:BetaCandidates=Object.fromEntries(Object.keys(step.questions!.nextAction.criteria).map(id=>[id,{action:/^e\d+$/.test(id)?{type:'click',elementId:id}:{type:'stuck'},label:id}]));
   const decision=deferralDecision(effectiveDeferrals,step.userState!.lastObservation!,candidates,step.deliberation!.assessment!,step.selection.raw,result.config.deferral);
   if(!equal(step.deferral?.decision,decision))throw new Error('DEFERRAL_DECISION_MISMATCH');
   if(!equal(step.selection.policy?.weights,Object.fromEntries(Object.keys(decision.weights).sort().map(id=>[id,decision.weights[id]]))))throw new Error('DEFERRAL_WEIGHT_MISMATCH');
  }
  if(step.selection){const candidates=Object.fromEntries(Object.keys(step.selection.raw).map(k=>[k,{action:{type:'stuck' as const},label:k}]));const selected=replaySelection(step.selection,candidates);if(selected.selected!==step.selection.selected)throw new Error('SELECTION_MISMATCH');choices++;}
 }
 return {runId:result.runId,choices,assessments,images,verified:true,scope:'Saved distribution sampling and actual model input assets only; no API or UI actions reexecuted'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){if(process.argv.length!==3)throw new Error('Usage: npm run replay:virtual-beta -- RUN_DIRECTORY');console.log(JSON.stringify(await replayDirectory(process.argv[2]),null,2));}
