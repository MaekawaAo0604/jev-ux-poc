import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {validateChoice,type ChoiceAnswers,type ChoiceQuestion} from '../client.js';
import {validateWorkingInquiryRecord,workingInquiryQuestions} from './working-inquiry.js';
import type {ExperienceSource} from './experience-contracts.js';
import type {WorkingInquiryContext,WorkingInquiryIntent,WorkingInquiryCheck} from './working-inquiry-contracts.js';
import type {BeginInquiryOperation,PendingInquiryOperation,InquiryOutcomeContext,InquiryOutcomeMemory,InquiryOutcomeRecord,InquiryOutcomeChoices} from './inquiry-outcome-contracts.js';

const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
const object=(value:unknown):value is Record<string,any>=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function fail():never{throw Error('INVALID_INQUIRY_OUTCOME');}
/** Inspect descriptors before reading nested data; copies never invoke accessors. */
function data(value:unknown,depth=0):any{
 if(depth>32)fail();
 if(value===null||value===undefined||typeof value==='string'||typeof value==='boolean'||typeof value==='number')return value;
 if(typeof value!=='object'||!Array.isArray(value)&&Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)fail();
 const result:any=Array.isArray(value)?[]:{};
 for(const key of Reflect.ownKeys(value)){
  if(Array.isArray(value)&&key==='length')continue;
  if(typeof key!=='string'||Array.isArray(value)&&(!/^(0|[1-9][0-9]*)$/.test(key)||Number(key)>=value.length))fail();
  const descriptor=Object.getOwnPropertyDescriptor(value,key)!;if(!descriptor.enumerable||!Object.hasOwn(descriptor,'value'))fail();
  Object.defineProperty(result,key,{value:data(descriptor.value,depth+1),enumerable:true,writable:true,configurable:true});
 }
 if(Array.isArray(value)&&Object.keys(result).length!==value.length)fail();return result;
}
function exact(value:unknown,keys:string[]):asserts value is Record<string,any>{if(!object(value)||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))fail();}
function category<T extends string>(value:unknown,values:readonly T[]):T{if(typeof value!=='string'||!values.includes(value as T))fail();return value as T;}
function hash(value:unknown):string{if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))fail();return value;}
function ordinal(value:unknown):number{if(typeof value!=='string'||!/^o[1-9]\d*$/.test(value)||!Number.isSafeInteger(Number(value.slice(1))))fail();return Number(value.slice(1));}
function source(value:unknown):ExperienceSource{exact(value,['observationId','imageSha256']);ordinal(value.observationId);return {observationId:value.observationId,imageSha256:hash(value.imageSha256)};}
function text(value:unknown,max:number):string{if(typeof value!=='string'||!value.trim()||value.length>max||/[\u0000-\u001f\u007f-\u009f]/.test(value))fail();return value;}
const intents=['change_condition','test_condition','find_route','unknown'] as const;
const checks=['condition_changed','condition_status_known','new_route_visible','unknown'] as const;
const actions=['click','back','scroll','look','reread','wait'] as const;
const results=['condition_satisfied','condition_unmet','condition_uncertain','route_found','route_not_found','unknown'] as const;
const bases=['current_image','none'] as const;
const ids=['inquiryOutcome_result','inquiryOutcome_basis'] as const;
const allowed:Record<WorkingInquiryIntent,WorkingInquiryCheck>={change_condition:'condition_changed',test_condition:'condition_status_known',find_route:'new_route_visible',unknown:'unknown'};

function pendingCopy(value:unknown):PendingInquiryOperation{
 exact(value,['schemaVersion','kind','source','goalSha256','condition','intent','check','action','expectedObservation','explicitLink']);
 if(value.schemaVersion!==1||value.kind!=='pending-inquiry-operation')fail();
 const current=source(value.source),goalSha256=hash(value.goalSha256),intent=category(value.intent,intents),check=category(value.check,checks);
 let condition:PendingInquiryOperation['condition']=null;
 if(value.condition!==null){
  exact(value.condition,['key','scope','conditionId','description','status','evidence','evidenceScope']);
  const {key,...selected}=value.condition;if(typeof key!=='string')fail();
  // The working-inquiry validator owns the condition schema, grounding and scope rules.
  const context:WorkingInquiryContext={schemaVersion:1,kind:'bounded-working-inquiry-context',source:current,goalSha256,conditions:{[key]:selected} as WorkingInquiryContext['conditions'],candidates:[]};
  workingInquiryQuestions(context);condition={key,...selected} as PendingInquiryOperation['condition'];
 }
 if(condition===null&&(intent==='change_condition'||intent==='test_condition')||check!=='unknown'&&check!==allowed[intent])fail();
 exact(value.action,['candidateId','type','execution']);if(typeof value.action.candidateId!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(value.action.candidateId))fail();
 const action={candidateId:value.action.candidateId,type:category(value.action.type,actions),execution:category(value.action.execution,['performed','unchanged'] as const)};
 const expectedObservation=value.expectedObservation===null?null:text(value.expectedObservation,200);
 if(typeof value.explicitLink!=='boolean'||value.explicitLink&&condition===null)fail();
 return {schemaVersion:1,kind:'pending-inquiry-operation',source:current,goalSha256,condition,intent,check,action,expectedObservation,explicitLink:value.explicitLink};
}
/** Bind the admitted working tuple to the actual offered candidate selected by the caller. */
export function beginInquiryOperation(args:BeginInquiryOperation):PendingInquiryOperation{
 const value=data(args);exact(value,['context','record','candidateId','actionType','execution']);
 const record=validateWorkingInquiryRecord(value.record,value.context),ctx=value.context as WorkingInquiryContext;
 const actionType=category(value.actionType,actions),nativeAction=['click','back','scroll'].includes(actionType);
 const candidate=nativeAction?ctx.candidates.find(row=>row.candidateId===value.candidateId):undefined;if(nativeAction&&!candidate)fail();
 const key=record.choices.conditionKey,condition=key==='none'?null:{key,...ctx.conditions[key]};
 return pendingCopy({schemaVersion:1,kind:'pending-inquiry-operation',source:record.source,goalSha256:record.goalSha256,condition,intent:record.choices.intent,check:record.choices.check,action:{candidateId:value.candidateId,type:value.actionType,execution:value.execution},expectedObservation:candidate?.expectedObservation??null,explicitLink:key!=='none'&&candidate!==undefined&&candidate.conditionKeys.includes(key)});
}
function choices(value:unknown):InquiryOutcomeChoices{exact(value,['result','basis']);return {result:category(value.result,results),basis:category(value.basis,bases)};}
/** A current-image claim only answers the earlier selected check; it never answers the entire goal. */
function normalize(rawChoices:InquiryOutcomeChoices,pending:PendingInquiryOperation):{choices:InquiryOutcomeChoices;adjustments:string[]}{
 const admitted={...rawChoices},adjustments:string[]=[];
 if(rawChoices.result!=='unknown'){
  const conditionResult=rawChoices.result.startsWith('condition_');
  if(conditionResult&&pending.condition===null)adjustments.push('NO_SELECTED_CONDITION');
  const compatible=conditionResult?pending.check==='condition_changed'||pending.check==='condition_status_known':pending.check==='new_route_visible';
  if(!compatible)adjustments.push('RESULT_CHECK_MISMATCH');
  if(rawChoices.basis!=='current_image')adjustments.push('NO_CURRENT_IMAGE_BASIS');
  if(adjustments.length)admitted.result='unknown';
 }
 return {choices:admitted,adjustments};
}
function derive(current:ExperienceSource,goalSha256:string,contextSha256:string,pending:PendingInquiryOperation,rawChoices:InquiryOutcomeChoices):InquiryOutcomeRecord{
 const normalized=normalize(rawChoices,pending);
 return {schemaVersion:1,kind:'model-inquiry-outcome-not-fact',source:current,goalSha256,contextSha256,pending,rawChoices,...normalized};
}
function recordCopy(value:unknown):InquiryOutcomeRecord{
 exact(value,['schemaVersion','kind','source','goalSha256','contextSha256','pending','rawChoices','choices','adjustments']);
 if(value.schemaVersion!==1||value.kind!=='model-inquiry-outcome-not-fact')fail();
 const current=source(value.source),goalSha256=hash(value.goalSha256),pending=pendingCopy(value.pending);
 if(pending.goalSha256!==goalSha256||ordinal(pending.source.observationId)>=ordinal(current.observationId))fail();
 const expected=derive(current,goalSha256,hash(value.contextSha256),pending,choices(value.rawChoices));
 if(!isDeepStrictEqual(value,expected))fail();return expected;
}
function bindSource(sources:Map<string,string>,value:ExperienceSource):void{if(sources.has(value.observationId)&&sources.get(value.observationId)!==value.imageSha256)fail();sources.set(value.observationId,value.imageSha256);}
function bindPending(sources:Map<string,string>,pending:PendingInquiryOperation):void{bindSource(sources,pending.source);if(pending.condition?.evidence)bindSource(sources,pending.condition.evidence);}
/** Retained records are closed and normalized; original context hashes require validateRecord. */
export function validateInquiryOutcomeMemory(memory:unknown):InquiryOutcomeMemory{
 if(memory===undefined)return {schemaVersion:1,entries:[]};
 const value=data(memory);exact(value,['schemaVersion','entries']);if(value.schemaVersion!==1||!Array.isArray(value.entries)||value.entries.length>3)fail();
 const entries=value.entries.map(recordCopy),sources=new Map<string,string>();let previous:InquiryOutcomeRecord|undefined;
 for(const entry of entries){
  if(previous&&(previous.goalSha256!==entry.goalSha256||ordinal(previous.source.observationId)>=ordinal(entry.source.observationId)||ordinal(entry.pending.source.observationId)<ordinal(previous.source.observationId)))fail();
  bindSource(sources,entry.source);bindPending(sources,entry.pending);previous=entry;
 }
 return {schemaVersion:1,entries};
}
/** Build before-memory only. The new outcome can be remembered after assessment. */
export function buildInquiryOutcomeContext(current:ExperienceSource,goalSha256:string,pending:PendingInquiryOperation|null,memory:InquiryOutcomeMemory|undefined):InquiryOutcomeContext{
 const safe=data({current,goalSha256,pending,memory}),next=source(safe.current),goal=hash(safe.goalSha256),retained=validateInquiryOutcomeMemory(safe.memory),operation=safe.pending===null?null:pendingCopy(safe.pending),sources=new Map<string,string>();bindSource(sources,next);
 if(operation){if(operation.goalSha256!==goal||ordinal(operation.source.observationId)>=ordinal(next.observationId))fail();bindPending(sources,operation);}
 for(const record of retained.entries){if(record.goalSha256!==goal||ordinal(record.source.observationId)>=ordinal(next.observationId)||operation&&ordinal(record.source.observationId)>ordinal(operation.source.observationId))fail();bindSource(sources,record.source);bindPending(sources,record.pending);}
 return {schemaVersion:1,kind:'bounded-inquiry-outcome-context',source:next,goalSha256:goal,pending:operation,memory:retained};
}
function contextCopy(context:InquiryOutcomeContext):InquiryOutcomeContext{const value=data(context);exact(value,['schemaVersion','kind','source','goalSha256','pending','memory']);if(value.schemaVersion!==1||value.kind!=='bounded-inquiry-outcome-context')fail();return buildInquiryOutcomeContext(value.source,value.goalSha256,value.pending,value.memory);}
export function inquiryOutcomeQuestions(context:InquiryOutcomeContext):Record<string,ChoiceQuestion>{
 const ctx=contextCopy(context);if(!ctx.pending)return {};
 const instructions='Assess only the supplied previous selected condition, check and executed action against the current admitted image. This is a fallible model judgment, never a fact. Historical descriptions and past model outcomes do not establish current state. Judge this specific check independently of the entire goal. Use unknown when unsupported; do not invent unseen content or routes.';
 const question=(detail:string,criteria:Record<string,string>):ChoiceQuestion=>({type:'choice',instructions:instructions+' '+detail,criteria});
 return {
  inquiryOutcome_result:question('What does the current image support for the previous check?',{condition_satisfied:'The selected condition is now supported as satisfied.',condition_unmet:'The selected condition is now supported as unmet.',condition_uncertain:'The selected condition remains uncertain on this image.',route_found:'A visible route relevant to the previous route check was found.',route_not_found:'The current image supports that the previous route check found no visible route.',unknown:'The previous check cannot be assessed.'}),
  inquiryOutcome_basis:question('Is this specific result supported by the current admitted image?',{current_image:'The attached current image supports this result.',none:'No current-image basis supports this result.'}),
 };
}
export function admitInquiryOutcome(response:ChoiceAnswers,context:InquiryOutcomeContext):InquiryOutcomeRecord|null{
 const ctx=contextCopy(context),questions=inquiryOutcomeQuestions(ctx);
 if(!object(response))fail();const descriptor=Object.getOwnPropertyDescriptor(response,'answers');if(!descriptor||!Object.hasOwn(descriptor,'value')||!object(descriptor.value))fail();const answers=descriptor.value;
 for(const key of Reflect.ownKeys(answers))if(typeof key==='string'&&key.startsWith('inquiryOutcome')&&!Object.hasOwn(questions,key))fail();
 if(!ctx.pending)return null;
 const selected=ids.map(id=>{
  const descriptor=Object.getOwnPropertyDescriptor(answers,id);if(!descriptor||!Object.hasOwn(descriptor,'value'))fail();const answer=data(descriptor.value);
  exact(answer,['choice','probabilities',...(object(answer)&&Object.hasOwn(answer,'confidence')?['confidence']:[])]);
  if(Object.hasOwn(answer,'confidence')&&(typeof answer.confidence!=='number'||!Number.isFinite(answer.confidence)||answer.confidence<0||answer.confidence>1))fail();
  if(!object(answer.probabilities))fail();return validateChoice({choice:answer.choice,probabilities:answer.probabilities,...(Object.hasOwn(answer,'confidence')?{confidence:answer.confidence}:{})},questions[id].criteria).choice;
 });
 return derive(ctx.source,ctx.goalSha256,sha(JSON.stringify(ctx)),ctx.pending,choices({result:selected[0],basis:selected[1]}));
}
/** Bind the complete before-context and rederive all normalized fields, ignoring after-memory. */
export function validateInquiryOutcomeRecord(record:unknown,context:InquiryOutcomeContext):InquiryOutcomeRecord|null{
 const ctx=contextCopy(context);if(!ctx.pending){if(record!==null)fail();return null;}
 const value=recordCopy(data(record)),expected=derive(ctx.source,ctx.goalSha256,sha(JSON.stringify(ctx)),ctx.pending,choices(value.rawChoices));
 if(!isDeepStrictEqual(value,expected))fail();return expected;
}
export function rememberInquiryOutcome(context:InquiryOutcomeContext,record:InquiryOutcomeRecord|null):InquiryOutcomeMemory{
 const ctx=contextCopy(context),validated=validateInquiryOutcomeRecord(record,ctx);
 return validated?validateInquiryOutcomeMemory({schemaVersion:1,entries:[...ctx.memory.entries,validated].slice(-3)}):ctx.memory;
}


