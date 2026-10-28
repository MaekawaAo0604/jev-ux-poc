import {goalSearchQuestions,admitGoalSearch,rememberGoalSearch,goalSearchCriteria} from '../jev/virtual-beta/goal-search.js';
import type {GoalSearchMemory} from '../jev/virtual-beta/goal-search-contracts.js';
import {createCorrespondenceArchive,correspondenceQuestions,admitCorrespondence,correspondenceCriteria} from '../jev/virtual-beta/correspondence.js';
import type {CorrespondenceContext} from '../jev/virtual-beta/correspondence-contracts.js';
import {candidatesFor} from '../jev/types.js';
import {filterCandidates} from '../jev/persona.js';
import {reconstructReplayCandidates} from './virtual-beta-replay-candidates.js';
import {copyDeferrals,updateDeferrals,deferralDecision} from '../jev/virtual-beta/deferral.js';
import {arriveExperience,beginExperience,experienceQuestions,admitExperience,experienceContext,experienceCriteria} from '../jev/virtual-beta/experience.js';
import {prepareReasonContext,requiredReasonSources,reasonQuestions,admitReasons} from '../jev/virtual-beta/deferral-reason.js';
import type {DeferralReasonMemory,DeferralReasonContext} from '../jev/virtual-beta/deferral-reason-contracts.js';
import type {ExperienceMemory,ExperienceIntent} from '../jev/virtual-beta/experience-contracts.js';
import {admitAssessment,assessedCriteria} from '../jev/virtual-beta/deliberation.js';
import type {BetaCandidates,UserObservation} from '../jev/virtual-beta/contracts.js';
import type {AdmittedObservationSource} from '../jev/virtual-beta/deliberation-contracts.js';
import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {replaySelection} from '../jev/virtual-beta/selection.js';
import {sha,offeredCandidates,type BetaResult} from './virtual-beta-core.js';
const isRecord=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const unexpectedGoalSearch=(input:Record<string,unknown>|undefined)=>Object.keys(input??{}).some(key=>key.startsWith('goalSearch'))||(isRecord(input?.userState)&&Object.keys(input.userState).some(key=>key.startsWith('goalSearch')&&key!=='goalSearch'));
const hasCorrespondence=(input:Record<string,unknown>|undefined)=>['correspondenceContext','correspondenceObservations','correspondenceAssessment'].some(key=>input?.[key]!==undefined);
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
 const correspondence=input.correspondenceObservations===undefined?[]:input.correspondenceObservations;
 if(!Array.isArray(memory)||!Array.isArray(reasons)||!Array.isArray(correspondence))throw new Error('ASSESSMENT_MEMORY_SOURCE_INVALID');
 const sources=new Map<string,AdmittedObservationSource>();
 const add=(observationId:unknown,imageSha256:string)=>{
  if(typeof observationId!=='string'||!observationId.trim()||observationId==='none')throw new Error('ASSESSMENT_SOURCE_ID_INVALID');
  const prior=sources.get(observationId);
  if(prior&&prior.imageSha256!==imageSha256)throw new Error('ASSESSMENT_SOURCE_ID_CONFLICT');
  sources.set(observationId,{observationId,imageSha256});
 };
 for(const entry of [...memory,...reasons,...correspondence]){
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
 let searchMemory:GoalSearchMemory|undefined=result.config.goalSearch?.enabled?{schemaVersion:1,entries:[]}:undefined;
 const seen=new Map<string,string>();
 const archive=result.config.correspondence?.enabled?createCorrespondenceArchive(result.config.correspondence):undefined;
 for(const step of result.steps){
  const d=step.deliberation,current=step.userState?.lastObservation;
  if(unexpectedGoalSearch(step.modelInput)||unexpectedGoalSearch(d?.modelInput)||unexpectedGoalSearch({userState:step.userState})||Object.keys(step).some(key=>key.startsWith('goalSearch')&&key!=='goalSearch'))throw Error('UNEXPECTED_GOAL_SEARCH_FIELD');
  if(current)seen.set(current.id,current.imageSha256);
  let correspondenceContext:CorrespondenceContext|undefined,correspondenceCandidates:BetaCandidates|undefined,searchCandidates:BetaCandidates|undefined;
  const searchPresent=step.goalSearch!==undefined||(step.modelInput?.userState as any)?.goalSearch!==undefined||(d?.modelInput.userState as any)?.goalSearch!==undefined||Object.keys(d?.questions??{}).some(k=>k.startsWith('goalSearch_'))||Object.keys(d?.response?.answers??{}).some(k=>k.startsWith('goalSearch_'));
  if(!result.config.goalSearch?.enabled&&searchPresent)throw Error('UNCONFIGURED_GOAL_SEARCH');
  if(result.config.goalSearch?.enabled&&(step.modelInput||d||step.goalSearch)){
   if(!current||!step.vision||!step.assetFiles||!step.questions||!step.audit||!step.goalSearch||(!d?.assessment&&(step.selection||step.goalSearch.record||step.goalSearch.annotations)))throw Error('GOAL_SEARCH_METADATA_MISSING');
   const bytes=await readFile(join(directory,step.assetFiles.current.file)),raw=filterCandidates(candidatesFor(step.audit.screen,Object.hasOwn(step.questions.nextAction.criteria,'back')),step.audit.screen,result.input.charter);
   searchCandidates=offeredCandidates(raw,{...step.vision,bytes},result.config);
   const expectedCurrent={id:'o'+step.number,imageSha256:sha(bytes),visibleText:result.config.vision.mode==='full'?[...step.audit.screen.text]:[],fixation:{...step.vision.fixation},candidateIds:Object.keys(searchCandidates)};
   if(!equal(current,expectedCurrent)||!equal(((d?.modelInput??step.modelInput)?.userState as any)?.lastObservation,expectedCurrent)||!equal((step.modelInput?.userState as any)?.lastObservation,expectedCurrent)||!equal(((d?.modelInput??step.modelInput)?.observation as any)?.candidateIds,expectedCurrent.candidateIds)||!equal((step.modelInput?.observation as any)?.candidateIds,expectedCurrent.candidateIds)||!equal(Object.keys(step.questions.nextAction.criteria),expectedCurrent.candidateIds))throw Error('GOAL_SEARCH_OBSERVATION_MISMATCH');
   const searchInput=d?.modelInput??step.modelInput!,searchAssets=d?.assetFiles??step.assetFiles,sourceList=assessmentSources(searchInput,searchAssets,current),expected=goalSearchQuestions(result.input.charter.goal,current,searchCandidates,sourceList);
   if(d&&!equal(Object.fromEntries(Object.entries(d.questions).filter(([key])=>key.startsWith('goalSearch_'))),expected)||!equal((searchInput.userState as any)?.goalSearch,searchMemory))throw Error('GOAL_SEARCH_ARRIVAL_OR_QUESTION_MISMATCH');
  }
  if(archive&&(step.modelInput||d||step.correspondence)&&(!current||!step.vision||!step.assetFiles||!step.questions||!step.audit||!step.correspondence))throw Error('CORRESPONDENCE_METADATA_MISSING');
  if(archive&&current&&step.vision&&step.assetFiles&&step.questions){
   const raw=filterCandidates(candidatesFor(step.audit!.screen,Object.hasOwn(step.questions.nextAction.criteria,'back')),step.audit!.screen,result.input.charter);
   correspondenceCandidates=offeredCandidates(raw,{...step.vision,bytes:await readFile(join(directory,step.assetFiles.current.file))},result.config);
   if(!equal(Object.keys(correspondenceCandidates),Object.keys(step.questions.nextAction.criteria)))throw Error('CORRESPONDENCE_CANDIDATES_MISMATCH');
   const input=d?.modelInput??step.modelInput!,assets=d?.assetFiles??step.assetFiles;
   const refs=[...((input.memoryObservations??[]) as any[]),...((input.reasonObservations??[]) as any[])];
   const baseKeys=new Set(['current',...refs.map(r=>r.image)]),baseAssets=Object.fromEntries(Object.entries(assets).filter(([key])=>baseKeys.has(key)));
   const frame={source:{observationId:current.id,imageSha256:current.imageSha256},bytes:await readFile(join(directory,assets.current.file)),file:assets.current.file,clickCandidateIds:Object.keys(correspondenceCandidates).filter(id=>correspondenceCandidates![id].action.type==='click')};
   const expectedCurrent={id:'o'+step.number,imageSha256:sha(frame.bytes),visibleText:result.config.vision.mode==='full'?[...step.audit!.screen.text]:[],fixation:{...step.vision.fixation},candidateIds:Object.keys(correspondenceCandidates)};
   if(!equal(current,expectedCurrent)||!equal((input.userState as any)?.lastObservation,expectedCurrent)||!equal((step.modelInput?.userState as any)?.lastObservation,expectedCurrent)||!equal((input.observation as any)?.candidateIds,expectedCurrent.candidateIds)||!equal((step.modelInput?.observation as any)?.candidateIds,expectedCurrent.candidateIds))throw Error('CORRESPONDENCE_OBSERVATION_MISMATCH');
   const arriving=result.config.experience?.enabled?arriveExperience(experience,pending,current,execution,result.config.experience):undefined;
   const proposal=archive.prepare(frame,arriving,Object.values(baseAssets).map(asset=>asset.sha256));correspondenceContext=proposal.preparation.context;
   archive.remember(frame);
   if(!equal(step.correspondence?.preparation,proposal.preparation)||!equal(step.correspondence?.archive,archive.snapshot()))throw Error('CORRESPONDENCE_PREPARATION_MISMATCH');
   if(correspondenceContext&&proposal.frame){const prior=proposal.frame;if(seen.get(prior.source.observationId)!==prior.source.imageSha256)throw Error('CORRESPONDENCE_SOURCE_NOT_OBSERVED');let image=Object.keys(baseAssets).find(key=>baseAssets[key].sha256===prior.source.imageSha256);if(!image){image='correspondence_0';baseAssets[image]={file:prior.file,sha256:prior.source.imageSha256};}
    const expected=[{observationId:prior.source.observationId,image,imageSha256:prior.source.imageSha256}];
    if(!equal(input.correspondenceContext,correspondenceContext)||!equal(input.correspondenceObservations,expected)||!equal(baseAssets,assets))throw Error('CORRESPONDENCE_IMAGE_INPUT_MISMATCH');
    if(!equal(step.modelInput?.correspondenceContext,correspondenceContext)||!equal(step.modelInput?.correspondenceObservations,expected)||!equal(step.assetFiles,assets))throw Error('CORRESPONDENCE_ACTION_INPUT_MISMATCH');
   }else if(hasCorrespondence(input)||hasCorrespondence(step.modelInput)||step.correspondence?.record!==undefined||step.correspondence?.annotations!==undefined||!equal(baseAssets,assets))throw Error('UNEXPECTED_CORRESPONDENCE_INPUT');
  }else if(!archive&&(step.correspondence!==undefined||hasCorrespondence(step.modelInput)||hasCorrespondence(d?.modelInput)))throw Error('UNCONFIGURED_CORRESPONDENCE');
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
    const correspondenceRequest=correspondenceContext?correspondenceQuestions(correspondenceContext):{};
    for(const [key,question]of Object.entries(correspondenceRequest))if(!equal(d.questions[key],question))throw Error('CORRESPONDENCE_QUESTION_MISMATCH');
    const response={...d.response,answers:Object.fromEntries(Object.entries(d.response.answers).filter(([key])=>!Object.hasOwn(outcomeQuestions,key)&&!Object.hasOwn(reasonRequest,key)&&!Object.hasOwn(correspondenceRequest,key)&&!key.startsWith('goalSearch_')))};
    const assessment=admitAssessment(response,candidates,current,sources);
    if(experience){
     if(Object.keys(outcomeQuestions).length)experience=admitExperience(d.response,experience,sources,result.config.experience?.evidenceMode);
     if(!equal(step.userState.experience,experience)||!equal((step.modelInput?.userState as any)?.experience,experience)||!equal(step.modelInput?.experienceContext,experienceContext(experience,current)))throw new Error('EXPERIENCE_JUDGMENT_MISMATCH');
    }
    let expectedCriteria:Record<string,string>|undefined;
    if(correspondenceContext||result.config.goalSearch?.enabled){const offered=searchCandidates??correspondenceCandidates!;expectedCriteria=Object.fromEntries(Object.entries(offered).map(([id,c])=>[id,c.label]));if(result.config.deliberation?.candidateEffects)expectedCriteria=assessedCriteria(offered,assessment);if(experience)expectedCriteria=experienceCriteria(expectedCriteria,experience,current);}
    if(correspondenceContext){
     const record=admitCorrespondence(d.response,correspondenceContext);if(!equal(step.correspondence?.record,record))throw Error('CORRESPONDENCE_RECORD_MISMATCH');const {rawChoices,...admitted}=record;if(!equal(step.modelInput?.correspondenceAssessment,admitted)||d.modelInput.correspondenceAssessment!==undefined)throw Error('CORRESPONDENCE_ASSESSMENT_INPUT_MISMATCH');
     const before=expectedCriteria!,after=correspondenceCriteria(before,record,experience),annotations=Object.keys(before).filter(id=>before[id]!==after[id]).map(candidateId=>({candidateId,before:before[candidateId],after:after[candidateId]}));
     if(!equal(step.correspondence?.annotations,annotations))throw Error('CORRESPONDENCE_ANNOTATION_MISMATCH');expectedCriteria=after;
    }
    if(result.config.goalSearch?.enabled){
     const record=admitGoalSearch(d.response,result.input.charter.goal,current,searchCandidates!,sources);searchMemory=rememberGoalSearch(searchMemory,record,result.config.goalSearch);
     if(!equal(step.goalSearch?.record,record)||!equal(step.goalSearch?.memory,searchMemory)||!equal(step.userState.goalSearch,searchMemory)||!equal((step.modelInput?.userState as any)?.goalSearch,searchMemory))throw Error('GOAL_SEARCH_RECORD_OR_MEMORY_MISMATCH');
     const before=expectedCriteria!,after=goalSearchCriteria(before,searchMemory,result.input.charter.goal,current,experience,step.correspondence?.record),annotations=Object.keys(before).filter(id=>before[id]!==after[id]).map(candidateId=>({candidateId,before:before[candidateId],after:after[candidateId]}));
     if(!equal(step.goalSearch?.annotations,annotations))throw Error('GOAL_SEARCH_ANNOTATION_MISMATCH');expectedCriteria=after;
    }
    if(expectedCriteria&&!equal(step.questions?.nextAction.criteria,expectedCriteria))throw Error('FINAL_ASSESSED_CRITERIA_MISMATCH');
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
  if(result.config.goalSearch?.enabled&&(!d||!d.assessment)&&step.goalSearch&&(!equal(step.goalSearch?.memory,searchMemory)||step.goalSearch?.record!==undefined||step.goalSearch?.annotations!==undefined||!equal((step.modelInput?.userState as any)?.goalSearch,searchMemory)||!equal(step.userState?.goalSearch,searchMemory)))throw Error('GOAL_SEARCH_PARTIAL_STATE_MISMATCH');
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
  if(step.selection){
   const conditional=result.config.deferral?.enabled===true&&result.config.deferral.selectionScope==='ui-conditional';
   if(conditional?step.selection.policy?.scope?.kind!=='ui-conditional-v1':step.selection.policy?.scope!==undefined)throw Error('DEFERRAL_SCOPE_MISMATCH');
   const candidates=conditional?reconstructReplayCandidates(step.audit!.screen,Object.keys(step.selection.raw)):Object.fromEntries(Object.keys(step.selection.raw).map(k=>[k,{action:{type:'stuck' as const},label:k}]));
   const selected=replaySelection(step.selection,candidates);if(selected.selected!==step.selection.selected)throw new Error('SELECTION_MISMATCH');
   if(conditional&&step.action&&!equal(step.action,candidates[selected.selected].action))throw Error('CONDITIONAL_ACTION_MISMATCH');choices++;
  }
 }
 return {runId:result.runId,choices,assessments,images,verified:true,scope:'Saved distribution sampling and actual model input assets only; no API or UI actions reexecuted'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){if(process.argv.length!==3)throw new Error('Usage: npm run replay:virtual-beta -- RUN_DIRECTORY');console.log(JSON.stringify(await replayDirectory(process.argv[2]),null,2));}
