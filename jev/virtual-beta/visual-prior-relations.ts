import {createHash} from 'node:crypto';
import {conditionContinuitySchema,type ConditionClaim,type ConditionContinuityContext} from './condition-continuity.js';
import {validateVisualHypothesisRequest,rememberVisualHypotheses} from './visual-hypotheses.js';
import type {VisualHypothesisRequest,VisualHypothesisRecord} from './visual-hypotheses-contracts.js';

export type VisualRecalledCondition=ConditionClaim&{evidenceScope:'historical';statusScope:'last-assessed-not-current-observation'};
export type VisualPriorRelationsRecord={schemaVersion:1;kind:'model-visual-prior-relations-not-fact';source:VisualHypothesisRecord['source'];goalSha256:string;relations:{candidateId:string;recalledConditions:VisualRecalledCondition[]}[]};
export const visualPriorRelationInstructions='Links between recalled conditions and current controls are fallible model hypotheses. Recalled conditions and their quotes are historical, not current facts or proof of an unmet or resolved condition. Each recalled currentStatus belongs to its last assessed observation, not the current observation. Check expected results on the next observed screen. Preserve persona and all offered candidates; no forced action or probability correction follows from a link.';
const object=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function fail():never{throw Error('INVALID_VISUAL_PRIOR_RELATIONS');}
function exact(value:unknown,keys:string[]):asserts value is Record<string,unknown>{
 if(!object(value)||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)||!Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)!,'value')))fail();
}
function array(value:unknown,maximum:number):unknown[]{if(!Array.isArray(value)||value.length>maximum)fail();return value;}
/** Context is bounded and validated; only grounded unresolved historical identities are eligible. */
export function visualPriorConditionIds(context:ConditionContinuityContext):string[]{
 conditionContinuitySchema(context);
 return context.memory.entries.filter(entry=>entry.lastGrounded?.status==='unmet'&&entry.currentStatus!=='satisfied').map(entry=>entry.id);
}
/** One explicit model link row per offered UI candidate; no semantic matching or memory update. */
export function admitVisualPriorRelations(rawLinks:unknown,request:VisualHypothesisRequest,record:VisualHypothesisRecord):VisualPriorRelationsRecord{
 const req=validateVisualHypothesisRequest(request),current=rememberVisualHypotheses(undefined,record,1).records[0];
 if(req.priorConditionLinks!==true||!req.conditionContinuity||current.goalSha256!==createHash('sha256').update(req.goal).digest('hex')||current.source.observationId!==req.current.observationId||current.source.imageSha256!==req.current.imageSha256)fail();
 const ids=new Set(req.candidates.map(candidate=>candidate.id));
 if(current.relations.length!==ids.size||current.relations.some(relation=>!ids.has(relation.candidateId)))fail();
 const eligible=new Set(visualPriorConditionIds(req.conditionContinuity)),entries=req.conditionContinuity.memory.entries;
 const raw=array(rawLinks,req.candidates.length);if(raw.length!==req.candidates.length)fail();
 const rows=raw.map(value=>{
  exact(value,['candidateId','priorConditionIds']);if(typeof value.candidateId!=='string'||!ids.has(value.candidateId))fail();
  const priorIds=array(value.priorConditionIds,req.conditionContinuity!.capacity).map(id=>{if(typeof id!=='string'||!eligible.has(id))fail();return id;});
  if(new Set(priorIds).size!==priorIds.length)fail();
  const relation=current.relations.find(relation=>relation.candidateId===value.candidateId)!;
  if(priorIds.length&&!relation.currentEvidence)fail();
  return {candidateId:value.candidateId,recalledConditions:priorIds.map((id):VisualRecalledCondition=>({...structuredClone(entries.find(entry=>entry.id===id)!),evidenceScope:'historical',statusScope:'last-assessed-not-current-observation'}))};
 });
 if(new Set(rows.map(row=>row.candidateId)).size!==rows.length)fail();
 return {schemaVersion:1,kind:'model-visual-prior-relations-not-fact',source:{...current.source},goalSha256:current.goalSha256,relations:current.relations.map(relation=>rows.find(row=>row.candidateId===relation.candidateId)!)};
}
/** Compare only expected plain data via descriptors: unknown fields and accessors never execute. */
function sameData(value:unknown,expected:unknown):boolean{
 if(expected===null||typeof expected!=='object')return value===expected;
 if(Array.isArray(expected))return Array.isArray(value)&&value.length===expected.length&&Object.keys(value).length===expected.length&&expected.every((item,index)=>{const descriptor=Object.getOwnPropertyDescriptor(value,index);return !!descriptor&&Object.hasOwn(descriptor,'value')&&sameData(descriptor.value,item);});
 if(!object(value))return false;
 const keys=Object.keys(expected);if(Object.keys(value).length!==keys.length)return false;
 return keys.every(key=>{const descriptor=Object.getOwnPropertyDescriptor(value,key);return !!descriptor&&Object.hasOwn(descriptor,'value')&&sameData(descriptor.value,(expected as Record<string,unknown>)[key]);});
}
/** Re-derive historical projections from request memory, then require the complete closed record. */
export function validateVisualPriorRelations(record:unknown,request:VisualHypothesisRequest,currentRecord:VisualHypothesisRecord):VisualPriorRelationsRecord{
 exact(record,['schemaVersion','kind','source','goalSha256','relations']);
 const raw=array(record.relations,24).map(value=>{
  exact(value,['candidateId','recalledConditions']);
  const priorConditionIds=array(value.recalledConditions,3).map(entry=>{
   if(!object(entry))fail();const descriptor=Object.getOwnPropertyDescriptor(entry,'id');if(!descriptor||!Object.hasOwn(descriptor,'value')||typeof descriptor.value!=='string')fail();return descriptor.value;
  });
  return {candidateId:value.candidateId,priorConditionIds};
 });
 const expected=admitVisualPriorRelations(raw,request,currentRecord);if(!sameData(record,expected))fail();return expected;
}
