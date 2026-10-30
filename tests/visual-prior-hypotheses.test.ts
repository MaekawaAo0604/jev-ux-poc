import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateVisualHypothesisRequest,visualHypothesisSchema,admitVisualHypotheses,rememberVisualHypotheses} from '../jev/virtual-beta/visual-hypotheses.js';
import {buildOpenAIVisualHypothesisRequest} from '../runner/openai-visual-hypotheses.js';
import type {VisualHypothesisRequest,VisualHypothesisResponse} from '../jev/virtual-beta/visual-hypotheses-contracts.js';
const sha=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',imageSha256=sha(Buffer.from(png,'base64')),goal='画面の案内を確認し、変更内容の保存を確認する。';
const source=(n:number)=>({observationId:'o'+n,imageSha256});
function request(flag?:boolean):VisualHypothesisRequest{return {goal,currentDate:'2026-10-30',current:source(2),sources:[{...source(1),image:'current'},{...source(2),image:'current'}],candidates:[{id:'e1',type:'click'},{id:'back',type:'back'}],images:{current:{mediaType:'image/png',data:png}},timeoutMs:1000,conditionContinuity:{schemaVersion:1,capacity:3,memory:{schemaVersion:1,goalSha256:sha(goal),lastObservation:source(1),entries:[{id:'o1_c1',description:'必要な確認と照合が済んでいる。',lastGrounded:{status:'unmet',evidence:{...source(1),quote:'確認が未完了です。',quoteStatus:'model-transcribed-unverified'}},currentStatus:'unmet',lastAssessed:source(1),transition:'introduced'}]}},...(flag!==undefined?{priorConditionLinks:flag}:{})};}
function output(links=true):any{return {conditions:[],relations:[{candidateId:'e1',conditionIds:[],relation:'information',currentEvidence:{observationId:'o2',quote:'確認する'},expectedResult:'確認結果を調べる。',...(links?{priorConditionIds:['o1_c1']}:{})},{candidateId:'back',conditionIds:[],relation:'unknown',currentEvidence:null,expectedResult:null,...(links?{priorConditionIds:[]}:{})}],unknowns:[],continuity:[{priorId:'o1_c1',conditionId:null,change:'unobserved',explanation:'現在の完了状態は未確認'}]};}
const response=(value:unknown=output()):VisualHypothesisResponse=>({model:'gpt-6-luna',status:'completed',output:value,rawText:JSON.stringify(value),request:{attempts:1,httpReceived:true,statusCode:200},costUSD:null});
const relationBranches=(req:VisualHypothesisRequest)=>(visualHypothesisSchema(req) as any).properties.relations.items.anyOf;

for(const [name,bodyHash,schemaHash,projectionHash]of [
 ['baseline','bae74735e43228717cd718dd7abff6ac396daed12825bbe42ba5aa34389585ba','47c3cd170a99d8727570f1ef637f7d1243ee2b1cab6c42b0d4d00dafdcc73c63','055c7cab1952356a81c20e2955268e37ea2f29e60e7a5474a7f11db923bddf4d'],
 ['continuity','c5f560b67c484c973c6d9731f36d0f868a9720949dd7300b584aaa0f77a3cdd1','aa768e547c0b4d7fa197dacdc2c4a8e72d197d0ca6aabe61ea4d4cd26515a529','5d1930120213a8c9beef9ab70120646c4b53c8553d6e1c253be8ab3567fc0813'],
 ['retention','c5f560b67c484c973c6d9731f36d0f868a9720949dd7300b584aaa0f77a3cdd1','aa768e547c0b4d7fa197dacdc2c4a8e72d197d0ca6aabe61ea4d4cd26515a529','76a807cf8097dc7ae0bf7c42ba41834247e7054869464ecc65be635f35170aaa'],
]as const)test('pre-change '+name+' native body, schema and request projection remain byte equivalent',()=>{const req=request();if(name==='baseline')delete req.conditionContinuity;if(name==='retention')req.conditionContinuity!.retentionPolicy='grounded-unresolved';assert.equal(sha(JSON.stringify(buildOpenAIVisualHypothesisRequest(req))),bodyHash);assert.equal(sha(JSON.stringify(visualHypothesisSchema(req))),schemaHash);assert.equal(sha(JSON.stringify(validateVisualHypothesisRequest(req))),projectionHash);});
test('new flag is retained only when specified; false and undefined keep the old native body/schema',()=>{
 const absent=validateVisualHypothesisRequest(request());assert.equal(Object.hasOwn(absent,'priorConditionLinks'),false);assert.equal(Object.hasOwn(absent,'timeoutCapMs'),false);
 const enabled=validateVisualHypothesisRequest(request(true));assert.equal(enabled.priorConditionLinks,true);
 const off=request(false),clean=validateVisualHypothesisRequest(off);assert.equal(clean.priorConditionLinks,false);assert.deepEqual(buildOpenAIVisualHypothesisRequest(off),buildOpenAIVisualHypothesisRequest(request()));assert.deepEqual(visualHypothesisSchema(off),visualHypothesisSchema(request()));
 const optional=request();optional.priorConditionLinks=undefined;optional.timeoutCapMs=undefined;assert.deepEqual(validateVisualHypothesisRequest(optional),absent);
});
for(const value of [null,0,1,'true',[],{}])test('reject invalid prior link flag '+JSON.stringify(value),()=>{const req:any=request();req.priorConditionLinks=value;assert.throws(()=>validateVisualHypothesisRequest(req));assert.throws(()=>buildOpenAIVisualHypothesisRequest(req));});
test('true requires continuity, while explicit false does not introduce that requirement',()=>{const enabled=request(true);delete enabled.conditionContinuity;assert.throws(()=>validateVisualHypothesisRequest(enabled));const off=request(false);delete off.conditionContinuity;assert.equal(validateVisualHypothesisRequest(off).priorConditionLinks,false);});
for(const [cap,timeout,valid]of [[undefined,30000,true],[undefined,30001,false],[30000,30000,true],[30000,30001,false],[60000,30001,true],[60000,60000,true],[60000,60001,false],[60000,0,false],[60000,-1,false],[60000,1.5,false]]as const)test('timeout bound cap='+cap+' timeout='+timeout,()=>{
 const req:any=request();req.timeoutMs=timeout;if(cap!==undefined)req.timeoutCapMs=cap;
 if(valid){const clean=validateVisualHypothesisRequest(req);assert.equal(clean.timeoutMs,timeout);if(cap!==undefined)assert.equal(clean.timeoutCapMs,cap);assert.deepEqual(buildOpenAIVisualHypothesisRequest(req),buildOpenAIVisualHypothesisRequest(request()));}else assert.throws(()=>validateVisualHypothesisRequest(req));
});
for(const cap of [0,1,30001,60001,-1,NaN,Infinity,'60000',null,{},[]])test('invalid explicit timeout cap '+String(cap)+' is rejected',()=>{const req:any=request();req.timeoutCapMs=cap;assert.throws(()=>validateVisualHypothesisRequest(req));});
test('native request sends declared true flag, gated instructions and strict prior references, never timeout metadata',()=>{
 const req=request(true);req.timeoutMs=60000;req.timeoutCapMs=60000;const body=buildOpenAIVisualHypothesisRequest(req),input=JSON.parse(body.input[0].content[0].type==='input_text'?body.input[0].content[0].text:'null');
 assert.equal(input.priorConditionLinks,true);assert.equal(input.timeoutCapMs,undefined);assert.equal(input.timeoutMs,undefined);assert.equal(body.model,'gpt-6-luna');assert.equal(body.max_output_tokens,4000);assert.equal(body.store,false);assert.equal(body.text.format.strict,true);assert.match(body.instructions,/priorConditionIds/);assert.match(body.instructions,/current/i);assert.match(body.instructions,/historical/i);
 assert.deepEqual(Object.keys(body.text.format.schema.properties),['continuity','conditions','relations','unknowns']);for(const branch of relationBranches(req)){assert.equal(branch.additionalProperties,false);assert.ok(branch.required.includes('priorConditionIds'));assert.deepEqual(branch.properties.priorConditionIds.items.enum,['o1_c1']);assert.equal(branch.properties.priorConditionIds.maxItems,branch.properties.currentEvidence.anyOf?0:1);}
 for(const branch of relationBranches(request()))assert.equal(Object.hasOwn(branch.properties,'priorConditionIds'),false);
});
test('eligible IDs exclude satisfied/ungrounded claims and empty memory produces no empty enum',()=>{
 const req=request(true),base=req.conditionContinuity!.memory.entries[0];req.conditionContinuity!.memory.entries.push({...structuredClone(base),id:'o1_c2',currentStatus:'satisfied',lastGrounded:{status:'satisfied',evidence:{...source(1),quote:'確認済みです。',quoteStatus:'model-transcribed-unverified'}}},{...structuredClone(base),id:'o1_c3',currentStatus:'uncertain',lastGrounded:null});
 for(const branch of relationBranches(req))assert.deepEqual(branch.properties.priorConditionIds.items.enum,['o1_c1']);
 req.conditionContinuity!.memory.entries=[];req.conditionContinuity!.memory.lastObservation=null;const schema=visualHypothesisSchema(req);assert.ok(!JSON.stringify(schema).includes('"enum":[]'));for(const branch of relationBranches(req)){assert.equal(branch.properties.priorConditionIds.maxItems,0);assert.equal(Object.hasOwn(branch.properties.priorConditionIds.items,'enum'),false);}
 const value=output();value.continuity=[];value.relations[0].priorConditionIds=[];assert.equal(admitVisualHypotheses(response(value),req).conditions.length,0);
});
test('new links admit with zero current conditions, but do not grow stored hypothesis records or memory',()=>{
 const req=request(true),before=structuredClone(req),raw=response(),record=admitVisualHypotheses(raw,req);assert.deepEqual(Object.keys(record),['schemaVersion','kind','source','goalSha256','conditions','relations','unknowns']);assert.deepEqual(Object.keys(record.relations[0]),['candidateId','conditionIds','relation','currentEvidence','expectedResult']);assert.equal(record.conditions.length,0);assert.equal(record.relations[0].relation,'information');assert.equal(JSON.stringify(record).includes('priorConditionIds'),false);assert.equal(JSON.stringify(record).includes('必要な確認と照合'),false);
 const memory=rememberVisualHypotheses(undefined,record,3);assert.deepEqual(memory.records[0],record);assert.equal(JSON.stringify(memory).includes('priorConditionIds'),false);assert.deepEqual(req,before);assert.deepEqual(raw,response());
});
for(const [name,mutate]of [
 ['missing required field',(v:any)=>delete v.relations[0].priorConditionIds],['unknown claim',(v:any)=>v.relations[0].priorConditionIds=['o1_c9']],['local condition used as claim',(v:any)=>v.relations[0].priorConditionIds=['c1']],['future claim',(v:any)=>v.relations[0].priorConditionIds=['o9_c1']],['duplicate claim',(v:any)=>v.relations[0].priorConditionIds=['o1_c1','o1_c1']],['oversized refs',(v:any)=>v.relations[0].priorConditionIds=Array(4).fill('o1_c1')],['not array',(v:any)=>v.relations[0].priorConditionIds='o1_c1'],['extra relation field',(v:any)=>v.relations[0].audit='hidden'],['unknown candidate',(v:any)=>v.relations[0].candidateId='e99'],['duplicate candidate',(v:any)=>v.relations[1]=structuredClone(v.relations[0])],['missing candidate',(v:any)=>v.relations.pop()],['null control evidence',(v:any)=>{v.relations[0].relation='unknown';v.relations[0].expectedResult=null;v.relations[0].currentEvidence=null;}],['historical control evidence',(v:any)=>v.relations[0].currentEvidence.observationId='o1'],
]as const)test('HTTP200 model output rejects '+name,()=>{const value=output();mutate(value);assert.throws(()=>admitVisualHypotheses(response(value),request(true)));});
test('legacy modes reject newly added field rather than accepting an undeclared intervention',()=>{assert.throws(()=>admitVisualHypotheses(response(),request()));assert.throws(()=>admitVisualHypotheses(response(),request(false)));assert.equal(admitVisualHypotheses(response(output(false)),request()).relations.length,2);});
test('cross-goal, future and conflicting recalled sources never enter extraction',()=>{
 for(const mutate of [(r:any)=>r.conditionContinuity.memory.goalSha256=sha('other'),(r:any)=>r.conditionContinuity.memory.lastObservation=source(3),(r:any)=>r.conditionContinuity.memory.entries[0].lastGrounded.evidence.imageSha256='f'.repeat(64)]){const req=request(true);mutate(req);assert.throws(()=>validateVisualHypothesisRequest(req));assert.throws(()=>admitVisualHypotheses(response(),req));}
});
test('request allowlist does not inspect DOM, labels, human or audit getters',()=>{
 const req:any=request(true);for(const key of ['DOM','audit','oracle','human','labels'])Object.defineProperty(req,key,{enumerable:true,get(){throw Error('UNSEEN_DATA_READ');}});for(const candidate of req.candidates)Object.defineProperty(candidate,'label',{enumerable:true,get(){throw Error('LABEL_READ');}});
 const clean=validateVisualHypothesisRequest(req);assert.deepEqual(clean.candidates,[{id:'e1',type:'click'},{id:'back',type:'back'}]);assert.equal(clean.priorConditionLinks,true);assert.doesNotThrow(()=>buildOpenAIVisualHypothesisRequest(req));assert.doesNotMatch(JSON.stringify(clean),/DOM|oracle|human|labels/);
});

// Independent strict-schema subset oracle: validate generated schema rather than assuming local admission is the provider schema.
function schemaAccepts(schema:any,value:any):boolean{
 if(schema.anyOf)return schema.anyOf.some((branch:any)=>schemaAccepts(branch,value));
 if(schema.enum&&!schema.enum.some((entry:any)=>JSON.stringify(entry)===JSON.stringify(value)))return false;
 if(schema.type==='null')return value===null;
 if(schema.type==='string')return typeof value==='string'&&(!schema.pattern||new RegExp(schema.pattern).test(value));
 if(schema.type==='array')return Array.isArray(value)&&value.length>=schema.minItems&&value.length<=schema.maxItems&&value.every(item=>schemaAccepts(schema.items,item));
 if(schema.type==='object')return value!==null&&typeof value==='object'&&!Array.isArray(value)&&schema.required.every((key:string)=>Object.hasOwn(value,key))&&(schema.additionalProperties!==false||Object.keys(value).every(key=>Object.hasOwn(schema.properties,key)))&&Object.entries(schema.properties).every(([key,property])=>schemaAccepts(property,value[key]));
 throw Error('Unsupported test schema');
}
test('new strict schema and admission reject recalled links without a current control quote',()=>{
 const req=request(true),value=output();Object.assign(value.relations[0],{relation:'unknown',currentEvidence:null,expectedResult:null});
 assert.equal(schemaAccepts(visualHypothesisSchema(req),value),false);assert.throws(()=>admitVisualHypotheses(response(value),req));
});
test('unknown relation with a current quote and null result can retain a prior hypothesis',()=>{
 const req=request(true),value=output();Object.assign(value.relations[0],{relation:'unknown',expectedResult:null});
 assert.equal(schemaAccepts(visualHypothesisSchema(req),value),true);assert.equal(admitVisualHypotheses(response(value),req).relations[0].relation,'unknown');
});
test('separate current controls may independently recall the same prior condition',()=>{
 const req=request(true),value=output();Object.assign(value.relations[1],{currentEvidence:{observationId:'o2',quote:'戻る'},priorConditionIds:['o1_c1']});
 assert.equal(schemaAccepts(visualHypothesisSchema(req),value),true);assert.equal(admitVisualHypotheses(response(value),req).relations.length,2);
});
