import {createHash} from 'node:crypto';
import type {ExperienceSource} from './experience-contracts.js';
import type {VisualEvidence,VisualHypothesisRecord} from './visual-hypotheses-contracts.js';

export type ConditionClaim={id:string;description:string;lastGrounded:{status:'unmet'|'satisfied';evidence:VisualEvidence}|null;currentStatus:'unmet'|'satisfied'|'uncertain';lastAssessed:ExperienceSource;transition:'introduced'|'persists'|'revised'|'resolved'|'unobserved'};
export type ConditionContinuityMemory={schemaVersion:1;goalSha256:string;lastObservation:ExperienceSource|null;entries:ConditionClaim[]};
export type ConditionContinuityContext={schemaVersion:1;capacity:number;memory:ConditionContinuityMemory};
export type ConditionContinuityTransition={priorId:string;conditionId:'c1'|'c2'|'c3'|null;change:'persists'|'revised'|'resolved'|'unobserved';explanation:string};
export type ConditionContinuityRecord={schemaVersion:1;current:ExperienceSource;goalSha256:string;before:ConditionContinuityMemory;transitions:ConditionContinuityTransition[];after:ConditionContinuityMemory;evictions:{id:string;reason:'capacity'}[]};
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const object=(value:unknown):value is Record<string,any>=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const hashPattern=/^[a-f0-9]{64}$/;
const claimPattern=/^o([1-9]\d*)_c[123]$/;
function fail():never{throw Error('INVALID_CONDITION_CONTINUITY_DATA');}
function exact(value:unknown,keys:string[]):asserts value is Record<string,any>{if(!object(value)||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))fail();}
function text(value:unknown,max:number,empty=false):string{if(typeof value!=='string'||(!empty&&!value.trim())||value.length>max||/[\u0000-\u001f\u007f-\u009f]/.test(value))fail();return value;}
function category<T extends string>(value:unknown,values:readonly T[]):T{if(typeof value!=='string'||!values.includes(value as T))fail();return value as T;}
function number(id:unknown):number{if(typeof id!=='string'||!/^o[1-9]\d*$/.test(id)||!Number.isSafeInteger(Number(id.slice(1))))fail();return Number(id.slice(1));}
function source(value:unknown):ExperienceSource{exact(value,['observationId','imageSha256']);number(value.observationId);if(typeof value.imageSha256!=='string'||!hashPattern.test(value.imageSha256))fail();return {observationId:value.observationId,imageSha256:value.imageSha256};}
const same=(a:ExperienceSource,b:ExperienceSource)=>a.observationId===b.observationId&&a.imageSha256===b.imageSha256;
function register(map:Map<string,ExperienceSource>,value:ExperienceSource){const previous=map.get(value.observationId);if(previous&&!same(previous,value))fail();map.set(value.observationId,value);}
function basis(value:unknown,map:Map<string,ExperienceSource>,maximum:number):VisualEvidence{
 exact(value,['observationId','imageSha256','quote','quoteStatus']);const s=source({observationId:value.observationId,imageSha256:value.imageSha256});if(number(s.observationId)>maximum||value.quoteStatus!=='model-transcribed-unverified')fail();register(map,s);
 return {...s,quote:text(value.quote,160),quoteStatus:'model-transcribed-unverified'};
}
function array(value:unknown,max:number):unknown[]{if(!Array.isArray(value)||value.length>max)fail();return value;}
function goalHash(goal:string){if(typeof goal!=='string'||!goal.trim()||goal.length>4000||/\u0000/.test(goal))fail();return hash(goal);}

/** Empty recollection has no product state, shared objects, or implied success. */
export function emptyConditionContinuity(goal:string):ConditionContinuityMemory{return {schemaVersion:1,goalSha256:goalHash(goal),lastObservation:null,entries:[]};}
function contextCopy(value:unknown,current?:ExperienceSource,expectedGoal?:string):ConditionContinuityContext{
 exact(value,['schemaVersion','capacity','memory']);if(value.schemaVersion!==1||!Number.isSafeInteger(value.capacity)||value.capacity<1||value.capacity>3)fail();
 const memory=value.memory;exact(memory,['schemaVersion','goalSha256','lastObservation','entries']);if(memory.schemaVersion!==1||typeof memory.goalSha256!=='string'||!hashPattern.test(memory.goalSha256)||expectedGoal!==undefined&&memory.goalSha256!==expectedGoal)fail();
 const last=memory.lastObservation===null?null:source(memory.lastObservation),sources=new Map<string,ExperienceSource>();if(current)register(sources,current);if(last){register(sources,last);if(current&&number(last.observationId)>=number(current.observationId))fail();}
 const entries=array(memory.entries,value.capacity).map(raw=>{
  exact(raw,['id','description','lastGrounded','currentStatus','lastAssessed','transition']);
  if(typeof raw.id!=='string'||!claimPattern.test(raw.id)||!Number.isSafeInteger(Number(claimPattern.exec(raw.id)![1])))fail();
  const lastAssessed=source(raw.lastAssessed);if(!last||!same(lastAssessed,last)||Number(claimPattern.exec(raw.id)![1])>number(lastAssessed.observationId))fail();register(sources,lastAssessed);
  const currentStatus=category(raw.currentStatus,['unmet','satisfied','uncertain']),transition=category(raw.transition,['introduced','persists','revised','resolved','unobserved']);
  let lastGrounded:ConditionClaim['lastGrounded']=null;
  if(raw.lastGrounded!==null){exact(raw.lastGrounded,['status','evidence']);lastGrounded={status:category(raw.lastGrounded.status,['unmet','satisfied']),evidence:basis(raw.lastGrounded.evidence,sources,number(lastAssessed.observationId))};}
  if(currentStatus!=='uncertain'&&(!lastGrounded||lastGrounded.status!==currentStatus||!same(lastGrounded.evidence,lastAssessed)))fail();
  if(currentStatus==='uncertain'&&lastGrounded&&number(lastGrounded.evidence.observationId)>=number(lastAssessed.observationId))fail();
  if(transition==='introduced'&&Number(claimPattern.exec(raw.id)![1])!==number(lastAssessed.observationId)||transition==='persists'&&currentStatus!=='unmet'||transition==='resolved'&&currentStatus!=='satisfied'||transition==='revised'&&currentStatus==='satisfied'||transition==='unobserved'&&currentStatus!=='uncertain')fail();
  return {id:raw.id,description:text(raw.description,200),lastGrounded,currentStatus,lastAssessed,transition};
 });
 if(new Set(entries.map(entry=>entry.id)).size!==entries.length)fail();
 return {schemaVersion:1,capacity:value.capacity,memory:{schemaVersion:1,goalSha256:memory.goalSha256,lastObservation:last,entries}};
}
/** Strict bounded projection. Cross-run whole-memory substitution requires the caller's source/before-chain checks. */
export function validateConditionContinuityContext(value:unknown,current:ExperienceSource,goal:string):ConditionContinuityContext{return contextCopy(value,source(current),goalHash(goal));}
const schemaObject=(properties:Record<string,unknown>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
/** Supported strict subset; identity uniqueness and source semantics are also checked during admission. */
export function conditionContinuitySchema(context:ConditionContinuityContext){
 const ctx=contextCopy(context),ids=ctx.memory.entries.map(entry=>entry.id),priorId=ids.length?{type:'string',enum:ids}:{type:'string',pattern:claimPattern.source};
 const explanation={type:'string',pattern:'^(?=[^\\u0000-\\u001f\\u007f-\\u009f]*\\S)[^\\u0000-\\u001f\\u007f-\\u009f]{1,160}$'};
 return {type:'array',minItems:ids.length,maxItems:ids.length,items:{anyOf:[schemaObject({priorId,conditionId:{type:'null'},change:{type:'string',enum:['unobserved']},explanation}),schemaObject({priorId,conditionId:{type:'string',enum:['c1','c2','c3']},change:{type:'string',enum:['persists','revised','resolved']},explanation})]}};
}
/** Reconcile fallible hypotheses. Historical quotes cannot establish a current transition. */
export function admitConditionContinuity(raw:unknown,context:ConditionContinuityContext,record:VisualHypothesisRecord):ConditionContinuityRecord{
 exact(record,['schemaVersion','kind','source','goalSha256','conditions','relations','unknowns']);if(record.schemaVersion!==1||record.kind!=='model-visual-hypotheses-not-fact'||typeof record.goalSha256!=='string'||!hashPattern.test(record.goalSha256))fail();
 const current=source(record.source),ctx=contextCopy(context,current,record.goalSha256),before=ctx.memory,sources=new Map<string,ExperienceSource>();register(sources,current);
 if(before.lastObservation)register(sources,before.lastObservation);for(const entry of before.entries){register(sources,entry.lastAssessed);if(entry.lastGrounded)register(sources,entry.lastGrounded.evidence);}
 const conditions=array(record.conditions,3).map(value=>{
  exact(value,['id','description','status','evidence','uncertainty']);const id=category(value.id,['c1','c2','c3']),status=category(value.status,['unmet','satisfied','uncertain']),evidence=value.evidence===null?null:basis(value.evidence,sources,number(current.observationId));
  if(status!=='uncertain'&&!evidence)fail();return {id,description:text(value.description,200),status,evidence,uncertainty:text(value.uncertainty,200,true)};
 });
 if(new Set(conditions.map(condition=>condition.id)).size!==conditions.length)fail();array(record.relations,24);for(const unknown of array(record.unknowns,3))text(unknown,200);
 const transitions=array(raw,3).map(value=>{
  exact(value,['priorId','conditionId','change','explanation']);if(!before.entries.some(entry=>entry.id===value.priorId))fail();const change=category(value.change,['persists','revised','resolved','unobserved']),conditionId=value.conditionId===null?null:category(value.conditionId,['c1','c2','c3']);
  if((change==='unobserved')!==(conditionId===null))fail();
  if(conditionId!==null){const condition=conditions.find(condition=>condition.id===conditionId);if(!condition?.evidence||!same(condition.evidence,current)||change==='persists'&&condition.status!=='unmet'||change==='resolved'&&condition.status!=='satisfied'||change==='revised'&&condition.status==='satisfied')fail();}
  return {priorId:value.priorId as string,conditionId,change,explanation:text(value.explanation,160)};
 });
 const referenced=transitions.flatMap(transition=>transition.conditionId===null?[]:[transition.conditionId]);
 if(transitions.length!==before.entries.length||new Set(transitions.map(transition=>transition.priorId)).size!==transitions.length||new Set(referenced).size!==referenced.length)fail();
 const ordered=before.entries.map(entry=>transitions.find(transition=>transition.priorId===entry.id)!);
 const updated=before.entries.map((entry,index):ConditionClaim=>{
  const transition=ordered[index];if(transition.change==='unobserved')return {...structuredClone(entry),currentStatus:'uncertain',lastAssessed:{...current},transition:'unobserved'};
  const condition=conditions.find(condition=>condition.id===transition.conditionId)!;
  return {id:entry.id,description:condition.description,lastGrounded:condition.status==='uncertain'?structuredClone(entry.lastGrounded):{status:condition.status,evidence:structuredClone(condition.evidence!)},currentStatus:condition.status,lastAssessed:{...current},transition:transition.change};
 });
 for(const condition of conditions.filter(condition=>!referenced.includes(condition.id))){const grounded=condition.status!=='uncertain'&&condition.evidence?{status:condition.status,evidence:structuredClone(condition.evidence)}:null;updated.push({id:current.observationId+'_'+condition.id,description:condition.description,lastGrounded:grounded,currentStatus:condition.evidence&&same(condition.evidence,current)?condition.status:'uncertain',lastAssessed:{...current},transition:'introduced'});}
 const removed=updated.slice(0,Math.max(0,updated.length-ctx.capacity)),after={schemaVersion:1 as const,goalSha256:before.goalSha256,lastObservation:{...current},entries:updated.slice(-ctx.capacity)};
 const checked=contextCopy({schemaVersion:1,capacity:ctx.capacity,memory:after}).memory;
 return {schemaVersion:1,current:{...current},goalSha256:before.goalSha256,before:structuredClone(before),transitions:structuredClone(ordered),after:checked,evictions:removed.map(entry=>({id:entry.id,reason:'capacity'}))};
}
