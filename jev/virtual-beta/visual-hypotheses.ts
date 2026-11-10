import {visualPriorConditionIds,admitVisualPriorRelations} from './visual-prior-relations.js';
import {validateConditionContinuityContext,conditionContinuitySchema,admitConditionContinuity} from './condition-continuity.js';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {parsePersona} from '../persona.js';
import {experienceContext} from './experience.js';
import type {ExperienceSource} from './experience-contracts.js';
import type {VisualCandidate,VisualEvidence,VisualHypothesisMemory,VisualHypothesisRecord,VisualHypothesisRequest,VisualHypothesisResponse} from './visual-hypotheses-contracts.js';

const sha=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
const object=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
function fail():never{throw Error('INVALID_VISUAL_HYPOTHESIS_DATA');}
const roleValues=['execute','prerequisite','information','navigation','unrelated','unknown'] as const;
const statusValues=['unmet','satisfied','uncertain'] as const;
const idPattern=/^[A-Za-z0-9_-]{1,80}$/;
const hashPattern=/^[a-f0-9]{64}$/;
function exact(value:unknown,keys:string[]):asserts value is Record<string,any>{if(!object(value)||Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)))fail();}
function text(value:unknown,maximum:number,empty=false):string{if(typeof value!=='string'||(!empty&&!value.trim())||value.length>maximum||/[\u0000-\u001f\u007f-\u009f]/.test(value))fail();return value;}
function category<T extends string>(value:unknown,values:readonly T[]):T{if(typeof value!=='string'||!values.includes(value as T))fail();return value as T;}
function observationNumber(value:unknown):number{if(typeof value!=='string'||!/^o[1-9]\d*$/.test(value)||!Number.isSafeInteger(Number(value.slice(1))))fail();return Number(value.slice(1));}
function sourceCopy(value:unknown,maximum=Number.MAX_SAFE_INTEGER):ExperienceSource{
 if(!object(value)||typeof value.imageSha256!=='string'||!hashPattern.test(value.imageSha256)||observationNumber(value.observationId)>maximum)fail();
 return {observationId:value.observationId,imageSha256:value.imageSha256};
}
const sameSource=(a:ExperienceSource,b:ExperienceSource)=>a.observationId===b.observationId&&a.imageSha256===b.imageSha256;
function checkSource(map:Map<string,ExperienceSource>,source:ExperienceSource){const known=map.get(source.observationId);if(known&&!sameSource(known,source))fail();map.set(source.observationId,source);}
function candidateCopy(value:unknown):VisualCandidate{if(!object(value)||typeof value.id!=='string'||!idPattern.test(value.id))fail();return {id:value.id,type:category(value.type,['click','scroll','back'])};}
function boundedArray(value:unknown,max:number):unknown[]{if(!Array.isArray(value)||value.length>max)fail();return value;}
function evidenceCopy(value:unknown,sources:Map<string,ExperienceSource>,current?:ExperienceSource,stored=false):VisualEvidence|null{
 if(value===null)return null;
 exact(value,stored?['observationId','imageSha256','quote','quoteStatus']:['observationId','quote']);
 const source=sources.get(value.observationId);if(!source||current&&!sameSource(source,current))fail();
 if(stored&&(value.imageSha256!==source.imageSha256||value.quoteStatus!=='model-transcribed-unverified'))fail();
 return {...source,quote:text(value.quote,160),quoteStatus:'model-transcribed-unverified'};
}
function dataCopy(value:unknown,sources:Map<string,ExperienceSource>,current:ExperienceSource,candidates:VisualCandidate[],stored=false){
 exact(value,['conditions','relations','unknowns']);
 const conditions=boundedArray(value.conditions,3).map(raw=>{
  exact(raw,['id','description','status','evidence','uncertainty']);
  const id=category(raw.id,['c1','c2','c3']),status=category(raw.status,statusValues),evidence=evidenceCopy(raw.evidence,sources,undefined,stored);
  if(status!=='uncertain'&&!evidence)fail();
  return {id,description:text(raw.description,200),status,evidence,uncertainty:text(raw.uncertainty,200,true)};
 });
 if(new Set(conditions.map(c=>c.id)).size!==conditions.length)fail();
 const rawRelations=boundedArray(value.relations,24);if(rawRelations.length!==candidates.length)fail();
 const relations=rawRelations.map(raw=>{
  exact(raw,['candidateId','conditionIds','relation','currentEvidence','expectedResult']);
  if(!candidates.some(c=>c.id===raw.candidateId))fail();
  const conditionIds=boundedArray(raw.conditionIds,3).map(id=>category(id,conditions.map(c=>c.id)));
  if(new Set(conditionIds).size!==conditionIds.length)fail();
  const relation=category(raw.relation,roleValues),currentEvidence=evidenceCopy(raw.currentEvidence,sources,current,stored),expectedResult=raw.expectedResult===null?null:text(raw.expectedResult,200);
  if((relation!=='unknown'||expectedResult!==null)&&!currentEvidence)fail();
  return {candidateId:raw.candidateId as string,conditionIds,relation,currentEvidence,expectedResult};
 });
 if(new Set(relations.map(r=>r.candidateId)).size!==relations.length)fail();
 const unknowns=boundedArray(value.unknowns,3).map(v=>text(v,200));if(new Set(unknowns).size!==unknowns.length)fail();
 return {conditions,relations:candidates.map(candidate=>relations.find(r=>r.candidateId===candidate.id)!),unknowns};
}
function recordCopy(value:unknown):VisualHypothesisRecord{
 exact(value,['schemaVersion','kind','source','goalSha256','conditions','relations','unknowns']);
 if(value.schemaVersion!==1||value.kind!=='model-visual-hypotheses-not-fact'||typeof value.goalSha256!=='string'||!hashPattern.test(value.goalSha256))fail();
 const source=sourceCopy(value.source),maximum=observationNumber(source.observationId),sources=new Map<string,ExperienceSource>();checkSource(sources,source);
 for(const condition of boundedArray(value.conditions,3)){if(!object(condition))fail();if(condition.evidence!==null)checkSource(sources,sourceCopy(condition.evidence,maximum));}
 const relations=boundedArray(value.relations,24);
 for(const relation of relations){if(!object(relation))fail();if(relation.currentEvidence!==null){const s=sourceCopy(relation.currentEvidence,maximum);if(!sameSource(s,source))fail();checkSource(sources,s);}}
 const candidates=relations.map(relation=>candidateCopy({id:(relation as Record<string,any>).candidateId,type:'click'}));
 return {schemaVersion:1,kind:'model-visual-hypotheses-not-fact',source,goalSha256:value.goalSha256,...dataCopy({conditions:value.conditions,relations:value.relations,unknowns:value.unknowns},sources,source,candidates,true)};
}
function memoryCopy(memory:VisualHypothesisMemory|undefined):VisualHypothesisMemory{
 if(memory===undefined)return {schemaVersion:1,records:[]};
 if(!object(memory)||memory.schemaVersion!==1)fail();const records=boundedArray(memory.records,3).map(recordCopy);
 const sources=new Map<string,ExperienceSource>();let previous=0,goal:string|undefined;
 for(const record of records){const number=observationNumber(record.source.observationId);if(number<=previous||goal!==undefined&&record.goalSha256!==goal)fail();previous=number;goal=record.goalSha256;checkSource(sources,record.source);for(const condition of record.conditions)if(condition.evidence)checkSource(sources,condition.evidence);}
 return {schemaVersion:1,records};
}
/** Validated allowlist projection. Unknown request/persona/candidate/experience properties are never read. */
export function validateVisualHypothesisRequest(request:VisualHypothesisRequest):VisualHypothesisRequest{
 if(!object(request))fail();
 if(request.priorConditionLinks!==undefined&&typeof request.priorConditionLinks!=='boolean')fail();
 if(request.timeoutCapMs!==undefined&&request.timeoutCapMs!==30000&&request.timeoutCapMs!==60000)fail();
 const timeoutCap=request.timeoutCapMs??30000;
 if(!object(request)||typeof request.goal!=='string'||!request.goal.trim()||request.goal.length>4000||/\u0000/.test(request.goal)||typeof request.currentDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(request.currentDate)||!Number.isFinite(Date.parse(request.currentDate))||new Date(request.currentDate).toISOString().slice(0,10)!==request.currentDate||!Number.isSafeInteger(request.timeoutMs)||request.timeoutMs<1||request.timeoutMs>timeoutCap)fail();
 const current=sourceCopy(request.current),maximum=observationNumber(current.observationId),sources=new Map<string,ExperienceSource>();
 if(!Array.isArray(request.sources)||request.sources.length<1||request.sources.length>5)fail();
 const copiedSources=request.sources.map(raw=>{const source=sourceCopy(raw,maximum);if(sources.has(source.observationId)||typeof raw.image!=='string'||!idPattern.test(raw.image))fail();sources.set(source.observationId,source);return {...source,image:raw.image};});
 const now=copiedSources.find(source=>sameSource(source,current));if(!now||now.image!=='current'||new Set(copiedSources.map(s=>s.imageSha256)).size>4)fail();
 if(!object(request.images)||Object.keys(request.images).length<1||Object.keys(request.images).length>4)fail();
 const images:VisualHypothesisRequest['images']={};
 for(const id of Object.keys(request.images)){
  if(!idPattern.test(id)||!copiedSources.some(s=>s.image===id))fail();const image=request.images[id];
  if(!object(image)||image.mediaType!=='image/png'||typeof image.data!=='string'||!image.data.length||image.data.length>28000000||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(image.data))fail();
  const bytes=Buffer.from(image.data,'base64');if(bytes.length<8||bytes.length>20971520||bytes.toString('base64')!==image.data||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))fail();
  if(copiedSources.some(source=>source.image===id&&source.imageSha256!==sha(bytes)))fail();
  Object.defineProperty(images,id,{value:{mediaType:'image/png',data:image.data},enumerable:true,writable:true,configurable:true});
 }
 if(copiedSources.some(s=>!Object.hasOwn(images,s.image)))fail();
 const candidates=boundedArray(request.candidates,24).map(candidateCopy);if(new Set(candidates.map(c=>c.id)).size!==candidates.length)fail();
 const persona=request.persona===undefined?undefined:parsePersona(request.persona),memory=memoryCopy(request.memory),goalSha256=sha(request.goal);
 for(const record of memory.records){if(record.goalSha256!==goalSha256||observationNumber(record.source.observationId)>=maximum)fail();checkSource(sources,record.source);for(const condition of record.conditions)if(condition.evidence)checkSource(sources,condition.evidence);}
 let experience:VisualHypothesisRequest['experience'];
 if(request.experience!==undefined){
  if(!object(request.experience)||request.experience.schemaVersion!==1)fail();boundedArray(request.experience.transitions,8);
  experience={schemaVersion:1,transitions:experienceContext(request.experience,{id:current.observationId,imageSha256:current.imageSha256,visibleText:[],fixation:{x:0,y:0},candidateIds:candidates.map(c=>c.id)}).transitions};
  for(const transition of experience.transitions){checkSource(sources,sourceCopy(transition.intent.source,maximum));checkSource(sources,sourceCopy(transition.result,maximum));if(observationNumber(transition.intent.source.observationId)>=observationNumber(transition.result.observationId))fail();}
 }
 const conditionContinuity=request.conditionContinuity===undefined?undefined:validateConditionContinuityContext(request.conditionContinuity,current,request.goal);
 if(request.priorConditionLinks===true&&!conditionContinuity)fail();
 if(conditionContinuity){const memory=conditionContinuity.memory;if(memory.lastObservation)checkSource(sources,memory.lastObservation);for(const entry of memory.entries){checkSource(sources,entry.lastAssessed);if(entry.lastGrounded)checkSource(sources,entry.lastGrounded.evidence);}}
 return {goal:request.goal,currentDate:request.currentDate,...(persona?{persona}:{}),current,sources:copiedSources,candidates,...(conditionContinuity?{conditionContinuity}:{}),...(experience?{experience}:{}),...(request.memory!==undefined?{memory}:{}),images,timeoutMs:request.timeoutMs,...(request.priorConditionLinks!==undefined?{priorConditionLinks:request.priorConditionLinks}:{}),...(request.timeoutCapMs!==undefined?{timeoutCapMs:request.timeoutCapMs}:{})};
}
const schemaObject=(properties:Record<string,unknown>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const schemaText=(maximum:number,empty=false)=>({type:'string',pattern:`^[^\\u0000-\\u001f\\u007f-\\u009f]{${empty?0:1},${maximum}}$`});
/** Supported strict-schema subset; cross references, uniqueness and all bounds are checked again locally. */
export function visualHypothesisSchema(request:VisualHypothesisRequest){
 const req=validateVisualHypothesisRequest(request);
 const nullable=(schema:unknown)=>({anyOf:[schema,{type:'null'}]});
 const evidence=(ids:string[])=>schemaObject({observationId:{type:'string',enum:ids},quote:schemaText(160)});
 const contextEvidence=evidence(req.sources.map(s=>s.observationId)),currentEvidence=evidence([req.current.observationId]);
 const condition=(statuses:string[],basis:unknown)=>schemaObject({id:{type:'string',enum:['c1','c2','c3']},description:schemaText(200),status:{type:'string',enum:statuses},evidence:basis,uncertainty:schemaText(200,true)});
 const priorIds=req.priorConditionLinks===true?visualPriorConditionIds(req.conditionContinuity!):[];
 const priorReferences={type:'array',minItems:0,maxItems:priorIds.length,items:priorIds.length?{type:'string',enum:priorIds}:{type:'string',pattern:/^o[1-9]\d*_c[123]$/.source}};
 const relation=(roles:string[],basis:unknown,expectedResult:unknown,references=priorReferences)=>schemaObject({candidateId:req.candidates.length?{type:'string',enum:req.candidates.map(c=>c.id)}:{type:'string',pattern:idPattern.source},conditionIds:{type:'array',minItems:0,maxItems:3,items:{type:'string',enum:['c1','c2','c3']}},relation:{type:'string',enum:roles},currentEvidence:basis,expectedResult,...(req.priorConditionLinks===true?{priorConditionIds:references}:{})});
 return schemaObject({... (req.conditionContinuity?{continuity:conditionContinuitySchema(req.conditionContinuity)}:{}),conditions:{type:'array',minItems:0,maxItems:3,items:{anyOf:[condition(['unmet','satisfied'],contextEvidence),condition(['uncertain'],nullable(contextEvidence))]}},relations:{type:'array',minItems:req.candidates.length,maxItems:req.candidates.length,items:{anyOf:[relation(roleValues.filter(role=>role!=='unknown'),currentEvidence,nullable(schemaText(200))),relation(['unknown'],currentEvidence,req.priorConditionLinks===true?nullable(schemaText(200)):schemaText(200)),relation(['unknown'],nullable(currentEvidence),{type:'null'},req.priorConditionLinks===true?{...priorReferences,maxItems:0}:priorReferences)]}},unknowns:{type:'array',minItems:0,maxItems:3,items:schemaText(200)}});
}
/** Reject duplicate JSON members before parsing, with a small independent nesting bound. */
function uniqueJSON(raw:string){
 let i=0;const whitespace=()=>{while(i<raw.length&&/[\t\n\r ]/.test(raw[i]))i++;};
 function string(){const start=i++;while(i<raw.length){if(raw[i]==='\\'){i+=2;continue;}if(raw[i++]==='"')return JSON.parse(raw.slice(start,i)) as string;}fail();}
 function value(depth:number):void{
  if(depth>32)fail();whitespace();const start=i;
  if(raw[i]==='{'){i++;whitespace();const keys=new Set<string>();if(raw[i]==='}'){i++;return;}while(i<raw.length){whitespace();if(raw[i]!=='"')fail();const key=string();if(keys.has(key))fail();keys.add(key);whitespace();if(raw[i++]!==':')fail();value(depth+1);whitespace();const end=raw[i++];if(end==='}')return;if(end!==',')fail();}fail();}
  else if(raw[i]==='['){i++;whitespace();if(raw[i]===']'){i++;return;}while(i<raw.length){value(depth+1);whitespace();const end=raw[i++];if(end===']')return;if(end!==',')fail();}fail();}
  else if(raw[i]==='"'){string();return;}
  else{while(i<raw.length&&!/[\s,\]}]/.test(raw[i]))i++;if(i===start)fail();}
 }
 value(0);whitespace();if(i!==raw.length)fail();
}
/** Admission checks HTTP/output status and source binding; model text is never treated as an action distribution. */
export function admitVisualHypotheses(response:VisualHypothesisResponse,request:VisualHypothesisRequest):VisualHypothesisRecord{
 const req=validateVisualHypothesisRequest(request);
 if(!object(response)||response.model!=='gpt-6-luna'||response.status!=='completed'||typeof response.rawText!=='string'||Buffer.byteLength(response.rawText,'utf8')>65536||!object(response.request)||response.request.attempts!==1||response.request.httpReceived!==true||response.request.statusCode!==200||response.costUSD!==null)fail();
 uniqueJSON(response.rawText);const parsed:unknown=JSON.parse(response.rawText);if(!isDeepStrictEqual(parsed,response.output))fail();
 const sources=new Map(req.sources.map(source=>[source.observationId,sourceCopy(source)]));
 let data=response.output,continuity:unknown,priorLinks:unknown;
 if(req.conditionContinuity){exact(data,['conditions','relations','unknowns','continuity']);continuity=data.continuity;data={conditions:data.conditions,relations:data.relations,unknowns:data.unknowns};}
 if(req.priorConditionLinks===true){
  exact(data,['conditions','relations','unknowns']);
  const links:{candidateId:unknown;priorConditionIds:unknown}[]=[];
  const relations=boundedArray(data.relations,24).map(raw=>{
   exact(raw,['candidateId','conditionIds','relation','currentEvidence','expectedResult','priorConditionIds']);
   links.push({candidateId:raw.candidateId,priorConditionIds:raw.priorConditionIds});
   return {candidateId:raw.candidateId,conditionIds:raw.conditionIds,relation:raw.relation,currentEvidence:raw.currentEvidence,expectedResult:raw.expectedResult};
  });
  priorLinks=links;data={conditions:data.conditions,relations,unknowns:data.unknowns};
 }
 const record:VisualHypothesisRecord={schemaVersion:1,kind:'model-visual-hypotheses-not-fact',source:sourceCopy(req.current),goalSha256:sha(req.goal),...dataCopy(data,sources,req.current,req.candidates)};
 if(req.conditionContinuity)admitConditionContinuity(continuity,req.conditionContinuity,record);
 if(req.priorConditionLinks===true)admitVisualPriorRelations(priorLinks,req,record);
 return record;
}
/** Bounded, copied, strictly chronological same-goal recollection; never a full audit history. */
export function rememberVisualHypotheses(memory:VisualHypothesisMemory|undefined,record:VisualHypothesisRecord,capacity:number):VisualHypothesisMemory{
 if(!Number.isSafeInteger(capacity)||capacity<1||capacity>3)fail();const previous=memoryCopy(memory),current=recordCopy(record),last=previous.records.at(-1);
 if(last&&(current.goalSha256!==last.goalSha256||observationNumber(current.source.observationId)<=observationNumber(last.source.observationId)))fail();
 const result={schemaVersion:1 as const,records:[...previous.records,current].slice(-capacity)};return memoryCopy(result);
}
