import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import type {VisualHypothesisRequest,VisualHypothesisResponse} from '../jev/virtual-beta/visual-hypotheses-contracts.js';
const api=await import('../jev/virtual-beta/visual-hypotheses.js').catch(()=>({} as any));
const hash=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
function request():VisualHypothesisRequest{const imageSha256=hash(Buffer.from(png,'base64'));return {goal:'予約Aの設定Bを変更して保存を確認する。制約も守る。',currentDate:'2026-10-30',current:{observationId:'o2',imageSha256},sources:[{observationId:'o1',imageSha256,image:'current'},{observationId:'o2',imageSha256,image:'current'}],candidates:[{id:'e1',type:'click'},{id:'back',type:'back'}],experience:{schemaVersion:1,transitions:[]},memory:{schemaVersion:1,records:[]},images:{current:{mediaType:'image/png',data:png}},timeoutMs:1000};}
function output(){return {conditions:[{id:'c1',description:'利用情報に不足がある',status:'unmet',evidence:{observationId:'o1',quote:'情報を確認してください'},uncertainty:'操作で解消するかは未確認'}],relations:[{candidateId:'e1',conditionIds:['c1'],relation:'prerequisite',currentEvidence:{observationId:'o2',quote:'利用情報を確認する'},expectedResult:'利用可能になったかを見る'},{candidateId:'back',conditionIds:[],relation:'navigation',currentEvidence:{observationId:'o2',quote:'戻る'},expectedResult:null}],unknowns:['保存が完了するかは不明']};}
function response(value:unknown=output()):VisualHypothesisResponse{return {model:'gpt-6-luna',status:'completed',output:value,rawText:JSON.stringify(value),request:{attempts:1,httpReceived:true,statusCode:200},costUSD:null};}

test('admission preserves fallible descriptions and binds exact current/historical sources and candidate identities',()=>{
 assert.equal(typeof api.admitVisualHypotheses,'function');const req=request(),raw=response(),record=api.admitVisualHypotheses(raw,req);
 assert.equal(record.kind,'model-visual-hypotheses-not-fact');assert.deepEqual(record.source,req.current);assert.equal(record.goalSha256,hash(req.goal));assert.equal(record.conditions[0].evidence.imageSha256,req.current.imageSha256);assert.equal(record.conditions[0].evidence.quoteStatus,'model-transcribed-unverified');assert.equal(record.relations[0].currentEvidence.observationId,'o2');assert.equal(record.relations[0].candidateId,'e1');assert.equal(record.relations[0].currentEvidence.quoteStatus,'model-transcribed-unverified');assert.deepEqual(raw,response());
});
test('schema is closed, current candidate IDs/evidence are scoped, and nullable unknown data is allowed',()=>{
 assert.equal(typeof api.visualHypothesisSchema,'function');const schema=api.visualHypothesisSchema(request());assert.equal(schema.additionalProperties,false);assert.deepEqual(schema.required,['conditions','relations','unknowns']);assert.equal(schema.properties.conditions.maxItems,3);assert.equal(schema.properties.relations.minItems,2);assert.equal(schema.properties.relations.maxItems,2);assert.deepEqual(schema.properties.relations.items.properties.candidateId.enum,['e1','back']);assert.deepEqual(schema.properties.relations.items.properties.currentEvidence.anyOf[0].properties.observationId.enum,['o2']);
 const value={conditions:[],relations:request().candidates.map(c=>({candidateId:c.id,conditionIds:[],relation:'unknown',currentEvidence:null,expectedResult:null})),unknowns:[]};assert.equal(api.admitVisualHypotheses(response(value),request()).conditions.length,0);
});
for(const [name,mutate] of [
 ['extra root',(v:any)=>v.extra='hidden'],['extra condition',(v:any)=>v.conditions[0].internalReasoning='hidden'],['duplicate condition',(v:any)=>v.conditions.push(v.conditions[0])],['unknown condition ID',(v:any)=>v.conditions[0].id='secret'],['missing candidate',(v:any)=>v.relations.pop()],['duplicate candidate',(v:any)=>v.relations[1]=v.relations[0]],['unknown candidate',(v:any)=>v.relations[0].candidateId='e77'],['stale current evidence',(v:any)=>v.relations[0].currentEvidence.observationId='o1'],['unattached evidence',(v:any)=>v.conditions[0].evidence.observationId='o99'],['missing condition evidence',(v:any)=>v.conditions[0].evidence=null],['missing role evidence',(v:any)=>v.relations[0].currentEvidence=null],['expected without evidence',(v:any)=>{v.relations[0].relation='unknown';v.relations[0].currentEvidence=null;}],['unknown referenced condition',(v:any)=>v.relations[0].conditionIds=['c2']],['duplicate reference',(v:any)=>v.relations[0].conditionIds=['c1','c1']],['long quote',(v:any)=>v.conditions[0].evidence.quote='x'.repeat(161)],['long description',(v:any)=>v.conditions[0].description='x'.repeat(201)],['control character',(v:any)=>v.unknowns=['a\u0000b']],['nonfinite unexpected data',(v:any)=>v.conditions[0].confidence=NaN],['too many unknowns',(v:any)=>v.unknowns=['a','b','c','d']]
] as const)test('rejects '+name+' without truncation or invented evidence',()=>{const value=output();mutate(value);assert.throws(()=>api.admitVisualHypotheses(response(value),request()));});
test('non-completion statuses, mismatched parsed/raw text and duplicate JSON members never admit',()=>{
 for(const status of ['refused','incomplete','invalid-json','invalid-response'])assert.throws(()=>api.admitVisualHypotheses({...response(),status},request()));
 assert.throws(()=>api.admitVisualHypotheses({...response(),rawText:'{}'},request()));assert.throws(()=>api.admitVisualHypotheses({...response(),rawText:'{"conditions":[],"conditions":[],"relations":[],"unknowns":[]}'},request()));
 assert.throws(()=>api.admitVisualHypotheses({...response(),rawText:' '.repeat(65537)},request()));
});
test('request allowlist never reads unknown labels, DOM, geometry or audit getters',()=>{
 assert.equal(typeof api.validateVisualHypothesisRequest,'function');const req:any=request();for(const key of ['audit','DOM','labels','unseenText','oracle'])Object.defineProperty(req,key,{enumerable:true,get(){throw Error('must not read '+key);}});for(const c of req.candidates)Object.defineProperty(c,'label',{enumerable:true,get(){throw Error('label leak');}});
 req.persona={schemaVersion:1,id:'p1',name:'Persona',itLiteracy:'medium',serviceExperience:'new',knowledge:['basic'],expectations:['clear'],behavioralTendencies:['careful'],contextAndConstraints:[]};Object.defineProperty(req.persona,'secret',{enumerable:true,get(){throw Error('persona extra');}});Object.defineProperty(req.experience,'audit',{enumerable:true,get(){throw Error('experience extra');}});
 const clean=api.validateVisualHypothesisRequest(req);assert.equal(clean.persona.id,'p1');assert.ok(!JSON.stringify(clean).includes('secret'));assert.deepEqual(clean.candidates,[{id:'e1',type:'click'},{id:'back',type:'back'}]);
});
test('malformed images, mismatched/future/duplicate source identities, candidate overflow and timeout bounds reject',()=>{
 for(const mutate of [(r:any)=>r.images.current.data='bad',(r:any)=>r.current.imageSha256='f'.repeat(64),(r:any)=>r.sources.push({...r.sources[0]}),(r:any)=>r.sources[0].observationId='o3',(r:any)=>r.candidates.push(r.candidates[0]),(r:any)=>r.candidates=Array.from({length:25},(_,i)=>({id:'e'+i,type:'click'})),(r:any)=>r.timeoutMs=30001,(r:any)=>r.timeoutMs=0,(r:any)=>r.sources[0].image='missing']){const req=request();mutate(req);assert.throws(()=>api.validateVisualHypothesisRequest(req));}
});
test('bounded visual memory copies records, preserves order and rejects cross-goal/future/conflicting histories',()=>{
 assert.equal(typeof api.rememberVisualHypotheses,'function');let memory={schemaVersion:1,records:[]} as any;
 for(let i=1;i<=4;i++){const req=request();req.current.observationId='o'+i;req.sources=[{...req.current,image:'current'}];const value={conditions:[],relations:req.candidates.map(c=>({candidateId:c.id,conditionIds:[],relation:'unknown',currentEvidence:null,expectedResult:null})),unknowns:[]};memory=api.rememberVisualHypotheses(memory,api.admitVisualHypotheses(response(value),req),3);}
 assert.deepEqual(memory.records.map((r:any)=>r.source.observationId),['o2','o3','o4']);const req=request();req.current.observationId='o5';req.sources=[{...req.current,image:'current'}];req.memory=memory;assert.equal(api.validateVisualHypothesisRequest(req).memory.records.length,3);
 const wrong=structuredClone(req);wrong.goal='other';assert.throws(()=>api.validateVisualHypothesisRequest(wrong));const future=structuredClone(req);future.current.observationId='o4';future.sources=[{...future.current,image:'current'}];assert.throws(()=>api.validateVisualHypothesisRequest(future));assert.throws(()=>api.rememberVisualHypotheses(memory,memory.records[2],3));assert.throws(()=>api.rememberVisualHypotheses(memory,memory.records[2],4));
});

test('bounded experience reads only performed action/source fields and never extra label/audit getters',()=>{
 const req:any=request(),source=req.sources[0],transition:any={intent:{source:{observationId:'o1',imageSha256:source.imageSha256},candidateId:'e1',action:{type:'click',elementId:'e1'},prediction:'unknown'},result:req.current,execution:'performed'};req.experience.transitions=[transition];
 for(const object of [transition,transition.intent,transition.intent.action])for(const key of ['audit','label','unseenText'])Object.defineProperty(object,key,{enumerable:true,get(){throw Error('experience leak');}});
 const clean=api.validateVisualHypothesisRequest(req);assert.deepEqual(clean.experience.transitions[0].intent.action,{type:'click',elementId:'e1'});assert.equal(clean.experience.transitions.length,1);
 req.experience.transitions=Array.from({length:9},()=>transition);assert.throws(()=>api.validateVisualHypothesisRequest(req));
});
test('candidate order is preserved through model relation reordering and no-current-candidate schema remains valid',()=>{
 const value=output();value.relations.reverse();assert.deepEqual(api.admitVisualHypotheses(response(value),request()).relations.map((r:any)=>r.candidateId),['e1','back']);
 const req=request();req.candidates=[];const admitted=api.admitVisualHypotheses(response({conditions:[],relations:[],unknowns:[]}),req);assert.deepEqual(admitted.relations,[]);const schema=api.visualHypothesisSchema(req);assert.equal(schema.properties.relations.maxItems,0);assert.equal(Object.hasOwn(schema.properties.relations.items.properties.candidateId,'enum'),false);
});
test('a conflicting historical image hash in bounded visual memory is rejected even with the same goal',()=>{
 const req=request(),record=api.admitVisualHypotheses(response(),req),future=request();future.current.observationId='o3';future.sources=[{...future.current,image:'current'},{observationId:'o2',imageSha256:future.current.imageSha256,image:'current'}];
 record.source.imageSha256='f'.repeat(64);for(const relation of record.relations)if(relation.currentEvidence)relation.currentEvidence.imageSha256='f'.repeat(64);future.memory={schemaVersion:1,records:[record]};assert.throws(()=>api.validateVisualHypothesisRequest(future));
});
