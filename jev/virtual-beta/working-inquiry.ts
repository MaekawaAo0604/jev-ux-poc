import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {validateChoice,type ChoiceAnswers,type ChoiceQuestion} from '../client.js';
import {admitConditionContinuity} from './condition-continuity.js';
import {validateVisualHypothesisRequest,rememberVisualHypotheses} from './visual-hypotheses.js';
import {validateVisualPriorRelations} from './visual-prior-relations.js';
import type {ExperienceSource} from './experience-contracts.js';
import type {VisualEvidence} from './visual-hypotheses-contracts.js';
import type {WorkingInquiryBuild,WorkingInquiryContext,WorkingInquiryChoices,WorkingInquiryRecord,WorkingInquiryIntent,WorkingInquiryCheck} from './working-inquiry-contracts.js';

const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
const object=(value:unknown):value is Record<string,any>=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function fail():never{throw Error('INVALID_WORKING_INQUIRY');}
/** Read descriptors before delegating to older validators, so no accessor can execute. */
function data(value:unknown,depth=0):any{
 if(depth>32)fail();
 if(value===null||typeof value==='string'||typeof value==='number'||typeof value==='boolean'||value===undefined)return value;
 if(typeof value!=='object')fail();
 if(!Array.isArray(value)&&Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)fail();
 const result:any=Array.isArray(value)?[]:{};
 for(const key of Reflect.ownKeys(value)){
  if(Array.isArray(value)&&key==='length')continue;
  if(typeof key!=='string'||Array.isArray(value)&&(!/^(0|[1-9][0-9]*)$/.test(key)||Number(key)>=value.length))fail();const descriptor=Object.getOwnPropertyDescriptor(value,key)!;
  if(!descriptor.enumerable||!Object.hasOwn(descriptor,'value'))fail();
  Object.defineProperty(result,key,{value:data(descriptor.value,depth+1),enumerable:true,writable:true,configurable:true});
 }
 if(Array.isArray(value)&&Object.keys(result).length!==value.length)fail();
 return result;
}
function exact(value:unknown,keys:string[]):asserts value is Record<string,any>{if(!object(value)||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))fail();}
function text(value:unknown,max:number):string{if(typeof value!=='string'||!value.trim()||value.length>max||/[\u0000-\u001f\u007f-\u009f]/.test(value))fail();return value;}
function category<T extends string>(value:unknown,choices:readonly T[]):T{if(typeof value!=='string'||!choices.includes(value as T))fail();return value as T;}
function list(value:unknown,max:number):any[]{if(!Array.isArray(value)||value.length>max)fail();return value;}
function number(id:unknown):number{if(typeof id!=='string'||!/^o[1-9]\d*$/.test(id)||!Number.isSafeInteger(Number(id.slice(1))))fail();return Number(id.slice(1));}
function source(value:unknown):ExperienceSource{exact(value,['observationId','imageSha256']);number(value.observationId);if(typeof value.imageSha256!=='string'||!/^[a-f0-9]{64}$/.test(value.imageSha256))fail();return {observationId:value.observationId,imageSha256:value.imageSha256};}
const sameSource=(a:ExperienceSource,b:ExperienceSource)=>a.observationId===b.observationId&&a.imageSha256===b.imageSha256;
function basis(value:unknown,current:ExperienceSource,sources:Map<string,string>):VisualEvidence|null{
 if(value===null)return null;exact(value,['observationId','imageSha256','quote','quoteStatus']);
 const s=source({observationId:value.observationId,imageSha256:value.imageSha256});
 if(number(s.observationId)>number(current.observationId)||s.observationId===current.observationId&&!sameSource(s,current)||sources.has(s.observationId)&&sources.get(s.observationId)!==s.imageSha256||value.quoteStatus!=='model-transcribed-unverified')fail();
 sources.set(s.observationId,s.imageSha256);return {...s,quote:text(value.quote,160),quoteStatus:'model-transcribed-unverified'};
}
/** Closed context copies also bind historical evidence and every candidate reference. */
function contextCopy(input:WorkingInquiryContext):WorkingInquiryContext{
 const value=data(input);exact(value,['schemaVersion','kind','source','goalSha256','conditions','candidates']);
 if(value.schemaVersion!==1||value.kind!=='bounded-working-inquiry-context'||typeof value.goalSha256!=='string'||!/^[a-f0-9]{64}$/.test(value.goalSha256)||!object(value.conditions)||Object.keys(value.conditions).length>6)fail();
 const current=source(value.source),sources=new Map([[current.observationId,current.imageSha256]]),conditions:WorkingInquiryContext['conditions']={};let currentCount=0,recalledCount=0;
 for(const [key,raw] of Object.entries(value.conditions)){
  exact(raw,['scope','conditionId','description','status','evidence','evidenceScope']);
  const scope=category(raw.scope,['current-hypothesis','recalled']),status=category(raw.status,['unmet','uncertain']),evidence=basis(raw.evidence,current,sources),evidenceScope=evidence===null?'none':sameSource(evidence,current)?'current':'historical';
  if(raw.evidenceScope!==evidenceScope||status==='unmet'&&!evidence)fail();
  if(scope==='current-hypothesis'){if(!/^c[123]$/.test(raw.conditionId)||key!=='current_'+raw.conditionId||++currentCount>3)fail();}
  else{if(typeof raw.conditionId!=='string'||!/^o[1-9]\d*_c[123]$/.test(raw.conditionId)||key!=='recalled_'+raw.conditionId||++recalledCount>3||evidenceScope!=='historical'||!evidence||number(raw.conditionId.split('_')[0])>number(evidence.observationId))fail();}
  conditions[key]={scope,conditionId:raw.conditionId,description:text(raw.description,200),status,evidence,evidenceScope};
 }
 const candidates=list(value.candidates,24).map(raw=>{
  exact(raw,['candidateId','conditionKeys','currentControlEvidence','expectedObservation']);
  if(typeof raw.candidateId!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(raw.candidateId))fail();
  const conditionKeys=list(raw.conditionKeys,6).map(key=>{if(typeof key!=='string'||!Object.hasOwn(conditions,key))fail();return key;});
  if(new Set(conditionKeys).size!==conditionKeys.length)fail();
  const currentControlEvidence=basis(raw.currentControlEvidence,current,sources),expectedObservation=raw.expectedObservation===null?null:text(raw.expectedObservation,200);
  if(currentControlEvidence&&!sameSource(currentControlEvidence,current)||expectedObservation!==null&&!currentControlEvidence||conditionKeys.some(key=>conditions[key].scope==='recalled')&&!currentControlEvidence)fail();
  return {candidateId:raw.candidateId,conditionKeys,currentControlEvidence,expectedObservation};
 });
 if(new Set(candidates.map(candidate=>candidate.candidateId)).size!==candidates.length)fail();
 return {schemaVersion:1,kind:'bounded-working-inquiry-context',source:current,goalSha256:value.goalSha256,conditions,candidates};
}
/** Continuity is recomputed from the admitted request's before-memory, never trusted after-memory. */
export function buildWorkingInquiryContext(args:WorkingInquiryBuild):WorkingInquiryContext{
 const safe=data(args) as WorkingInquiryBuild,request=validateVisualHypothesisRequest(safe.request),record=rememberVisualHypotheses(undefined,safe.record,1).records[0];
 if(!request.conditionContinuity||request.priorConditionLinks!==true||!sameSource(record.source,request.current)||record.goalSha256!==sha(request.goal))fail();
 const continuity=admitConditionContinuity(safe.continuity.transitions,request.conditionContinuity,record);
 if(!isDeepStrictEqual(safe.continuity,continuity))fail();
 const prior=validateVisualPriorRelations(safe.prior,request,record),conditions:WorkingInquiryContext['conditions']={};
 for(const condition of record.conditions){if(condition.status==='satisfied')continue;const evidence=condition.evidence;conditions['current_'+condition.id]={scope:'current-hypothesis',conditionId:condition.id,description:condition.description,status:condition.status,evidence,evidenceScope:evidence===null?'none':sameSource(evidence,record.source)?'current':'historical'};}
 for(const entry of continuity.after.entries){if(entry.currentStatus==='satisfied'||entry.lastGrounded?.status!=='unmet'||entry.lastGrounded.evidence.observationId===record.source.observationId)continue;conditions['recalled_'+entry.id]={scope:'recalled',conditionId:entry.id,description:entry.description,status:entry.currentStatus,evidence:entry.lastGrounded.evidence,evidenceScope:'historical'};}
 const candidates=request.candidates.map(candidate=>{
  const relation=record.relations.find(row=>row.candidateId===candidate.id),linked=prior.relations.find(row=>row.candidateId===candidate.id);if(!relation||!linked)fail();
  const keys=[...relation.conditionIds.map(id=>'current_'+id),...linked.recalledConditions.map(entry=>'recalled_'+entry.id)];
  return {candidateId:candidate.id,conditionKeys:keys.filter(key=>Object.hasOwn(conditions,key)),currentControlEvidence:relation.currentEvidence,expectedObservation:relation.expectedResult};
 });
 return contextCopy({schemaVersion:1,kind:'bounded-working-inquiry-context',source:record.source,goalSha256:record.goalSha256,conditions,candidates});
}
const intents=['change_condition','test_condition','find_route','unknown'] as const;
const checks=['condition_changed','condition_status_known','new_route_visible','unknown'] as const;
const ids=['workingInquiry_condition','workingInquiry_intent','workingInquiry_check'] as const;
/** Three categorical judgments share the existing assessment request; they never choose an action. */
export function workingInquiryQuestions(context:WorkingInquiryContext):Record<string,ChoiceQuestion>{
 const ctx=contextCopy(context),instructions='Choose a fallible working hypothesis from the supplied context. Historical evidence describes its earlier observation and does not establish current state. Preserve the persona and all offered actions. No condition, intent or check asserts success or forces an action. A check is an expected observation to assess on the next screen. Use unknown when the evidence is insufficient.';
 const question=(detail:string,criteria:Record<string,string>):ChoiceQuestion=>({type:'choice',instructions:instructions+' '+detail,criteria});
 return {
  workingInquiry_condition:question('Which unresolved condition is the present working target?',Object.fromEntries([...Object.entries(ctx.conditions).map(([key,condition])=>[key,JSON.stringify(condition)]),['none','No supplied unresolved condition can be selected.']])),
  workingInquiry_intent:question('What is the intended next step?',{change_condition:'Attempt to change the selected condition.',test_condition:'Inspect whether the selected condition is met or unmet.',find_route:'Find a visible route towards the goal.',unknown:'The intended next step is unknown.'}),
  workingInquiry_check:question('Which observable result would test that intended step?',{condition_changed:'Observe whether the selected condition changed.',condition_status_known:'Observe evidence clarifying the selected condition status.',new_route_visible:'Observe a new visible route towards the goal.',unknown:'No supported observable check can be named.'}),
 };
}
function choices(value:unknown,ctx:WorkingInquiryContext):WorkingInquiryChoices{
 exact(value,['conditionKey','intent','check']);if(typeof value.conditionKey!=='string'||value.conditionKey!=='none'&&!Object.hasOwn(ctx.conditions,value.conditionKey))fail();
 return {conditionKey:value.conditionKey,intent:category(value.intent,intents),check:category(value.check,checks)};
}
function derive(rawChoices:WorkingInquiryChoices,ctx:WorkingInquiryContext):WorkingInquiryRecord{
 const admitted={...rawChoices},adjustments:WorkingInquiryRecord['adjustments']=[];
 if(admitted.conditionKey==='none'&&(admitted.intent==='change_condition'||admitted.intent==='test_condition')){adjustments.push({field:'intent',from:admitted.intent,to:'unknown',reason:'NO_SELECTED_CONDITION'});admitted.intent='unknown';}
 const allowed:Record<WorkingInquiryIntent,WorkingInquiryCheck>={change_condition:'condition_changed',test_condition:'condition_status_known',find_route:'new_route_visible',unknown:'unknown'};
 if(admitted.check!=='unknown'&&admitted.check!==allowed[admitted.intent]){adjustments.push({field:'check',from:admitted.check,to:'unknown',reason:'INTENT_CHECK_MISMATCH'});admitted.check='unknown';}
 return {schemaVersion:1,kind:'model-working-inquiry-not-fact',source:{...ctx.source},goalSha256:ctx.goalSha256,contextSha256:sha(JSON.stringify(ctx)),rawChoices:{...rawChoices},choices:admitted,adjustments};
}
export function admitWorkingInquiry(response:ChoiceAnswers,context:WorkingInquiryContext):WorkingInquiryRecord{
 const ctx=contextCopy(context),questions=workingInquiryQuestions(ctx);
 if(!object(response))fail();const descriptor=Object.getOwnPropertyDescriptor(response,'answers');if(!descriptor||!Object.hasOwn(descriptor,'value')||!object(descriptor.value))fail();const answers=descriptor.value;
 for(const id of Reflect.ownKeys(answers))if(typeof id==='string'&&id.startsWith('workingInquiry')&&!(ids as readonly string[]).includes(id))fail();
 const selected=ids.map(id=>{
  const descriptor=Object.getOwnPropertyDescriptor(answers,id);if(!descriptor||!Object.hasOwn(descriptor,'value'))fail();const answer=data(descriptor.value);
  exact(answer,['choice','probabilities',...(object(answer)&&Object.hasOwn(answer,'confidence')?['confidence']:[])]);
  if(Object.hasOwn(answer,'confidence')&&(typeof answer.confidence!=='number'||!Number.isFinite(answer.confidence)||answer.confidence<0||answer.confidence>1))fail();
  if(!object(answer.probabilities))fail();return validateChoice({choice:answer.choice,probabilities:answer.probabilities,...(Object.hasOwn(answer,'confidence')?{confidence:answer.confidence}:{})},questions[id].criteria).choice;
 });
 return derive(choices({conditionKey:selected[0],intent:selected[1],check:selected[2]},ctx),ctx);
}
/** Recompute every admitted field from the raw categorical answers and the closed context. */
export function validateWorkingInquiryRecord(record:unknown,context:WorkingInquiryContext):WorkingInquiryRecord{
 const ctx=contextCopy(context),value=data(record);exact(value,['schemaVersion','kind','source','goalSha256','contextSha256','rawChoices','choices','adjustments']);
 const expected=derive(choices(value.rawChoices,ctx),ctx);if(!isDeepStrictEqual(value,expected))fail();return expected;
}


