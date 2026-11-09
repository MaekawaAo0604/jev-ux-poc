import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {isDeepStrictEqual as equal} from 'node:util';
import {candidatesFor} from '../jev/types.js';
import {filterCandidates} from '../jev/persona.js';
import {requestFor} from '../jev/decide.js';
import {createSampler} from '../jev/virtual-beta/selection.js';
import {transformVision} from '../jev/virtual-beta/vision.js';
import {factorVisibleText} from '../jev/virtual-beta/factors.js';
import {createUserState,updateUserState} from '../jev/virtual-beta/user-state.js';
import type {BetaAction,UserObservation} from '../jev/virtual-beta/contracts.js';
import {modelInput,offeredCandidates,reasonQuestion,sha,type BetaResult} from './virtual-beta-core.js';
import {betaActionInstructions} from './virtual-beta-action-instructions.js';
/** Strict opt-in replay of admitted data and actual action, not an execution or human model. */
export async function verifyFactorReplay(directory:string,result:BetaResult){
 const evidence=result.factorContract!==undefined||result.steps.some(s=>s.audit?.canGoBack!==undefined);
 if(evidence!==!!result.config.factors||result.config.factors&&result.factorContract!=='independent-v1')throw Error('FACTOR_CONTRACT_MISMATCH');
 if(!result.config.factors)return;
 const config=result.config,sampler=createSampler(config.selection),images=new Map<string,{file:string}>();
 let user=createUserState(result.input.persona,config.initialFixation??{x:640,y:450}),looks=0,uiActions=0;
 let pending:{action:BetaAction;outcome:'performed'|'failed'|'unchanged'}|undefined;
 for(const [index,step] of result.steps.entries()){
  if(step.number!==index+1)throw Error('FACTOR_STEP_SEQUENCE_MISMATCH');
  if(!step.modelInput){if(step.response||step.selection||step.action)throw Error('FACTOR_PARTIAL_INPUT_MISMATCH');continue;}
  const audit=step.audit;if(!audit||typeof audit.canGoBack!=='boolean'||!step.vision||!step.assetFiles)throw Error('FACTOR_AUDIT_MISSING');
  if(audit.rawScreenshot!=='audit-'+step.number+'.png')throw Error('FACTOR_RAW_PATH_MISMATCH');
  const raw=await readFile(join(directory,audit.rawScreenshot));if(sha(raw)!==audit.sourceSha256)throw Error('FACTOR_RAW_HASH_MISMATCH');
  const vision=transformVision(raw,config.vision,user.fixation,audit.targets??[]),{bytes,...metadata}=vision;
  if(!equal(metadata,step.vision))throw Error('FACTOR_VISION_MISMATCH');
  const original=filterCandidates(candidatesFor(audit.screen,audit.canGoBack),audit.screen,result.input.charter),candidates=offeredCandidates(original,vision,config);
  const observation:UserObservation={id:'o'+step.number,imageSha256:vision.imageSha256,visibleText:factorVisibleText(config,audit.screen.text),fixation:{...user.fixation},candidateIds:Object.keys(candidates)};
  user=updateUserState(user,observation,config.state,pending);pending=undefined;
  if(step.observationId!==observation.id||!equal(step.userState,user))throw Error('FACTOR_USER_STATE_MISMATCH');
  const file='input-'+step.number+'.png',assets:Record<string,{file:string;sha256:string}>={current:{file,sha256:vision.imageSha256}};
  if(sha(await readFile(join(directory,file)))!==vision.imageSha256)throw Error('FACTOR_CURRENT_IMAGE_MISMATCH');
  images.set(vision.imageSha256,{file});const wire=modelInput(result.input,vision,observation,user,config,audit.screen,[]),references=new Map([[vision.imageSha256,'current']]);
  wire.memoryObservations=user.memory.map((memory,i)=>{const source=images.get(memory.imageSha256);if(!source)throw Error('FACTOR_MEMORY_IMAGE_MISSING');let id=references.get(memory.imageSha256);if(!id){id='memory_'+i;references.set(memory.imageSha256,id);assets[id]={file:source.file,sha256:memory.imageSha256};}return {observationId:memory.observationId,image:id,imageSha256:memory.imageSha256};});
  if(!equal(wire,step.modelInput)||!equal(assets,step.assetFiles))throw Error('FACTOR_MODEL_INPUT_MISMATCH');
  const base=requestFor({goal:result.input.charter.goal,currentDate:result.input.charter.initialState.currentDate,screen:audit.screen,history:[]},original,'').questions.nextAction.instructions;
  const questions={nextAction:{type:'choice',instructions:betaActionInstructions(config,base),criteria:Object.fromEntries(Object.entries(candidates).map(([id,c])=>[id,c.label]))},decisionBasis:reasonQuestion};
  if(!equal(step.questions,questions))throw Error('FACTOR_QUESTION_MISMATCH');
  const excluded:Record<string,string>={};for(const [id,c]of Object.entries(candidates))if(c.action.type==='look'&&looks>=config.maxLooks)excluded[id]='LOOK_BUDGET_EXHAUSTED';
  if(step.selection){
   const answer=step.response?.answers.nextAction;if(!answer)throw Error('FACTOR_SELECTION_RESPONSE_MISSING');
   const selection=sampler.select(answer.choice,answer.probabilities,candidates,excluded);if(!equal(selection,step.selection))throw Error('FACTOR_SELECTION_MISMATCH');
   if(step.action&&!equal(candidates[selection.selected].action,step.action))throw Error('FACTOR_ACTION_MISMATCH');
   if(!step.action&&!['SELECTION_AFTER_DEADLINE','SAFETY_STOP'].includes(step.outcome??''))throw Error('FACTOR_SELECTED_ACTION_MISSING');
  }else{
   if(step.action)throw Error('FACTOR_ACTION_WITHOUT_SELECTION');
   if(step.response&&step.outcome!=='RESPONSE_AFTER_DEADLINE'){
    if((step.error as any)?.code!=='INVALID_DISTRIBUTION')throw Error('FACTOR_SELECTION_MISSING');
    const answer=step.response.answers.nextAction;let rejected=false;
    try{sampler.select(answer?.choice,answer?.probabilities,candidates,excluded);}catch{rejected=true;}
    if(!rejected)throw Error('FACTOR_INVALID_DISTRIBUTION_NOT_REPRODUCED');
   }
  }
  if(step.action&&['UI_PERFORMED','FIXATION_MOVED','REREAD','WAIT_NO_UI','ORACLE_ERROR'].includes(step.outcome??'')){
   const action=step.action;if(action.type==='look'){looks++;user={...user,fixation:{...action.point}};}const ui=['click','back','scroll'].includes(action.type);if(ui)uiActions++;
   pending={action,outcome:ui?'performed':'unchanged'};
   if(step.counts&&!equal(step.counts,{looks,uiActions}))throw Error('FACTOR_COUNTER_MISMATCH');
  }
 }
 if(result.termination==='SUBJECTIVE_DONE'&&(!result.perceivedDone||result.steps.at(-1)?.action?.type!=='done')||result.termination==='ABANDONED'&&result.steps.at(-1)?.action?.type!=='abandon'||result.termination==='STUCK'&&result.steps.at(-1)?.action?.type!=='stuck')throw Error('FACTOR_TERMINAL_ACTION_MISMATCH');
 if(result.looks!==looks||result.uiActions!==uiActions)throw Error('FACTOR_TOTAL_COUNTER_MISMATCH');
}
