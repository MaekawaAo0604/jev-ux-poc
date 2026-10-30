import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const api=await import('../jev/virtual-beta/visual-prior-relations.js').catch(()=>({} as any));
const action=await import('../jev/virtual-beta/visual-action-checks.js').catch(()=>({} as any));
test.beforeEach(()=>{assert.equal(typeof api.visualPriorConditionIds,'function');assert.equal(typeof api.admitVisualPriorRelations,'function');assert.equal(typeof api.validateVisualPriorRelations,'function');});
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',sha=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex'),imageSha256=sha(Buffer.from(png,'base64')),goal='Set A and verify the saved result.';
const source=(id:string)=>({observationId:id,imageSha256}),quote=(id:string)=>({...source(id),quote:'Visible condition '+id,quoteStatus:'model-transcribed-unverified'});
function context():any{return {schemaVersion:1,capacity:3,memory:{schemaVersion:1,goalSha256:sha(goal),lastObservation:source('o2'),entries:[{id:'o1_c1',description:'An earlier enabling condition was unmet.',lastGrounded:{status:'unmet',evidence:quote('o1')},currentStatus:'uncertain',lastAssessed:source('o2'),transition:'unobserved'},{id:'o2_c2',description:'A current earlier observation confirmed this condition.',lastGrounded:{status:'satisfied',evidence:quote('o2')},currentStatus:'satisfied',lastAssessed:source('o2'),transition:'resolved'},{id:'o2_c3',description:'An ungrounded condition remains unknown.',lastGrounded:null,currentStatus:'uncertain',lastAssessed:source('o2'),transition:'introduced'}]}};}
const recalled=(entry:any)=>({...entry,evidenceScope:'historical',statusScope:'last-assessed-not-current-observation'});
function request():any{return {goal,currentDate:'2026-10-30',current:source('o3'),sources:[{...source('o1'),image:'history'},{...source('o2'),image:'history'},{...source('o3'),image:'current'}],candidates:[{id:'e1',type:'click'},{id:'e2',type:'click'},{id:'back',type:'back'}],conditionContinuity:context(),priorConditionLinks:true,images:{current:{mediaType:'image/png',data:png},history:{mediaType:'image/png',data:png}},timeoutMs:1000};}
function record():any{return {schemaVersion:1,kind:'model-visual-hypotheses-not-fact',source:source('o3'),goalSha256:sha(goal),conditions:[{id:'c1',description:'The saved result is not established.',status:'uncertain',evidence:null,uncertainty:'Unknown outcome.'}],relations:[{candidateId:'e1',conditionIds:['c1'],relation:'information',currentEvidence:quote('o3'),expectedResult:'Inspect whether needed information is available.'},{candidateId:'e2',conditionIds:[],relation:'navigation',currentEvidence:quote('o3'),expectedResult:'Inspect the destination.'},{candidateId:'back',conditionIds:[],relation:'unknown',currentEvidence:null,expectedResult:null}],unknowns:[]};}
function links():any[]{return [{candidateId:'e2',priorConditionIds:[]},{candidateId:'back',priorConditionIds:[]},{candidateId:'e1',priorConditionIds:['o1_c1']}];}
const offered=()=>({e2:'second',done:'done',e1:'first',back:'back'});
const admit=(raw:unknown=links(),req=request(),currentRecord=record())=>api.admitVisualPriorRelations(raw,req,currentRecord);

test('eligible prior IDs include grounded unresolved claims only and retain memory order',()=>{
 const ctx=context();assert.deepEqual(api.visualPriorConditionIds(ctx),['o1_c1']);ctx.memory.entries[1]={...ctx.memory.entries[1],lastGrounded:{status:'unmet',evidence:quote('o2')},currentStatus:'unmet',transition:'introduced'};
 assert.deepEqual(api.visualPriorConditionIds(ctx),['o1_c1','o2_c2']);assert.deepEqual(api.visualPriorConditionIds(context()),['o1_c1']);
});
test('empty memory has no eligible IDs and admits only empty links',()=>{
 const req=request();req.conditionContinuity.memory={schemaVersion:1,goalSha256:sha(goal),lastObservation:null,entries:[]};assert.deepEqual(api.visualPriorConditionIds(req.conditionContinuity),[]);
 const raw=links();raw[2].priorConditionIds=[];assert.deepEqual(admit(raw,req).relations.map((relation:any)=>relation.recalledConditions),[[],[],[]]);assert.throws(()=>admit(links(),req));
});
test('raw links normalize to record order and copy only requested recalled conditions',()=>{
 const result=admit();assert.deepEqual(result,{schemaVersion:1,kind:'model-visual-prior-relations-not-fact',source:source('o3'),goalSha256:sha(goal),relations:[{candidateId:'e1',recalledConditions:[recalled(context().memory.entries[0])]},{candidateId:'e2',recalledConditions:[]},{candidateId:'back',recalledConditions:[]}]});
 assert.equal(result.relations[0].recalledConditions[0].currentStatus,'uncertain');assert.equal(result.relations[0].recalledConditions[0].lastGrounded.evidence.observationId,'o1');
});
test('different current controls may independently link the same historical claim',()=>{
 const raw=links();raw[0].priorConditionIds=['o1_c1'];const result=admit(raw);assert.equal(result.relations[0].recalledConditions[0].id,'o1_c1');assert.equal(result.relations[1].recalledConditions[0].id,'o1_c1');assert.notEqual(result.relations[0].recalledConditions[0],result.relations[1].recalledConditions[0]);
});
test('candidate membership is checked against request while sidecar order follows record',()=>{
 const currentRecord=record();currentRecord.relations.reverse();assert.deepEqual(admit(links(),request(),currentRecord).relations.map((value:any)=>value.candidateId),['back','e2','e1']);
 const req=request();req.candidates[0].id='other';assert.throws(()=>admit(links(),req));
});
for(const [name,change] of [
 ['missing candidate',(raw:any[])=>{raw.pop();}],['duplicate candidate',(raw:any[])=>{raw[0].candidateId='e1';}],['unknown candidate',(raw:any[])=>{raw[0].candidateId='other';}],['unknown claim',(raw:any[])=>{raw[2].priorConditionIds=['o99_c1'];}],['satisfied claim',(raw:any[])=>{raw[2].priorConditionIds=['o2_c2'];}],['ungrounded claim',(raw:any[])=>{raw[2].priorConditionIds=['o2_c3'];}],['duplicate claim',(raw:any[])=>{raw[2].priorConditionIds=['o1_c1','o1_c1'];}],['too many claims',(raw:any[])=>{raw[2].priorConditionIds=['o1_c1','o1_c1','o1_c1','o1_c1'];}],['extra field',(raw:any[])=>{raw[2].DOM='hidden';}],['wrong prior type',(raw:any[])=>{raw[2].priorConditionIds='o1_c1';}],
] as const)test('rejects raw '+name,()=>{const raw=links();change(raw);assert.throws(()=>admit(raw));});
for(const [name,change] of [
 ['cross-goal memory',(req:any)=>{req.conditionContinuity.memory.goalSha256=sha('other goal');}],['future memory source',(req:any)=>{req.conditionContinuity.memory.lastObservation=source('o4');}],['duplicate memory ID',(req:any)=>{req.conditionContinuity.memory.entries[2]=structuredClone(req.conditionContinuity.memory.entries[0]);}],['capacity overflow',(req:any)=>{req.conditionContinuity.capacity=1;}],['missing continuity',(req:any)=>{delete req.conditionContinuity;}],['disabled mode',(req:any)=>{req.priorConditionLinks=false;}],
] as const)test('rejects request '+name,()=>{const req=request();change(req);assert.throws(()=>admit(links(),req));});
for(const [name,change] of [
 ['cross-goal record',(value:any)=>{value.goalSha256=sha('other goal');}],['different current source',(value:any)=>{value.source=source('o4');}],['forged image source',(value:any)=>{value.source.imageSha256=sha('other image');}],['future current evidence',(value:any)=>{value.relations[0].currentEvidence=quote('o4');}],['missing current-control evidence',(value:any)=>{value.relations[0].relation='unknown';value.relations[0].currentEvidence=null;value.relations[0].expectedResult=null;}],
] as const)test('rejects '+name,()=>{const value=record();change(value);assert.throws(()=>admit(links(),request(),value));});

test('empty links are allowed without current evidence and unknown remains unknown',()=>{const raw=links();raw[2].priorConditionIds=[];const value=record();value.relations[0].relation='unknown';value.relations[0].currentEvidence=null;value.relations[0].expectedResult=null;assert.deepEqual(admit(raw,request(),value).relations[0].recalledConditions,[]);});
test('copy validation rejects sidecar tampering and preserves all original input data',()=>{
 const req=request(),value=record(),raw=links(),before=structuredClone({req,value,raw}),sidecar=admit(raw,req,value),checked=api.validateVisualPriorRelations(sidecar,req,value);
 assert.deepEqual({req,value,raw},before);assert.deepEqual(checked,sidecar);assert.notEqual(checked,sidecar);
 sidecar.relations[0].recalledConditions[0].description='tampered';assert.throws(()=>api.validateVisualPriorRelations(sidecar,req,value));assert.equal(checked.relations[0].recalledConditions[0].description,before.req.conditionContinuity.memory.entries[0].description);
 req.conditionContinuity.memory.entries[0].lastGrounded.evidence.quote='later mutation';raw[2].priorConditionIds=[];assert.equal(checked.relations[0].recalledConditions[0].lastGrounded.evidence.quote,'Visible condition o1');
});
for(const [name,change] of [
 ['kind',(value:any)=>{value.kind='fact';}],['source',(value:any)=>{value.source.imageSha256=sha('other');}],['goal',(value:any)=>{value.goalSha256=sha('other');}],['candidate order',(value:any)=>{value.relations.reverse();}],['missing candidate',(value:any)=>{value.relations.pop();}],['unknown root field',(value:any)=>{value.audit='hidden';}],['grounding',(value:any)=>{value.relations[0].recalledConditions[0].lastGrounded.status='satisfied';}],['current status',(value:any)=>{value.relations[0].recalledConditions[0].currentStatus='unmet';}],
] as const)test('strict validation rejects projected '+name,()=>{const value=admit();change(value);assert.throws(()=>api.validateVisualPriorRelations(value,request(),record()));});

test('unknown getter fields and hidden serialization hooks are never invoked',()=>{
 let reads=0;const raw:any=links();Object.defineProperty(raw[2],'DOM',{enumerable:true,get(){reads++;throw Error('LEAK');}});assert.throws(()=>admit(raw));assert.equal(reads,0);
 const currentRecord=record();Object.defineProperty(currentRecord,'DOM',{enumerable:true,get(){reads++;throw Error('LEAK');}});assert.throws(()=>admit(links(),request(),currentRecord));assert.equal(reads,0);
 const sidecar=admit();Object.defineProperty(sidecar.relations[0].recalledConditions[0],'description',{enumerable:true,get(){reads++;throw Error('LEAK');}});assert.throws(()=>api.validateVisualPriorRelations(sidecar,request(),record()));assert.equal(reads,0);
 const req=request();for(const object of [req.conditionContinuity.memory.entries[0],req.conditionContinuity.memory.entries[0].lastGrounded.evidence])Object.defineProperty(object,'toJSON',{get(){reads++;throw Error('LEAK');}});assert.equal(admit(links(),req).relations[0].recalledConditions.length,1);assert.equal(reads,0);
});

test('old four-argument action-check output retains its exact captured bytes',()=>{
 const s={observationId:'o3',imageSha256:sha('image')},value={schemaVersion:1,kind:'model-visual-hypotheses-not-fact',source:s,goalSha256:sha(goal),conditions:[],relations:[{candidateId:'e1',conditionIds:[],relation:'unknown',currentEvidence:null,expectedResult:null}],unknowns:[]};
 assert.equal(sha(JSON.stringify(action.visualActionChecks(value,goal,{id:'o3',imageSha256:s.imageSha256},{e1:'first',done:'done'}))),'f97f87f9506564db8fbe25f4e25899fcdc0fd5158ca4f518b3092053e949dbb4');
});
test('optional prior projection adds a separate historical field, including empty arrays, without changing current checks',()=>{
 const req=request(),value=record(),sidecar=admit(),before=action.visualActionChecks(value,goal,{id:'o3',imageSha256},offered());
 const result=action.visualActionChecks(value,goal,{id:'o3',imageSha256},offered(),{request:req,record:sidecar});
 assert.deepEqual(result.record.checks[0].recalledConditions,[recalled(context().memory.entries[0])]);assert.deepEqual(result.record.checks[1].recalledConditions,[]);assert.deepEqual(result.record.checks[2].recalledConditions,[]);
 for(let index=0;index<result.record.checks.length;index++){const {recalledConditions,...existing}=result.record.checks[index];assert.deepEqual(existing,before.record.checks[index]);assert.equal(Object.hasOwn(before.record.checks[index],'recalledConditions'),false);}
 assert.deepEqual(Object.keys(result.criteria),Object.keys(offered()));assert.equal(result.criteria.done,'done');assert.ok(result.criteria.e1.includes('recalledConditions'));assert.equal(req.conditionContinuity.memory.entries[0].currentStatus,'uncertain');
 sidecar.relations[0].recalledConditions[0].description='changed';assert.equal(result.record.checks[0].recalledConditions[0].description,context().memory.entries[0].description);assert.throws(()=>action.visualActionChecks(value,goal,{id:'o3',imageSha256},offered(),{request:req,record:sidecar}));
});
test('prior relation guidance labels historical links as fallible and leaves action selection free',()=>{
 assert.equal(typeof api.visualPriorRelationInstructions,'string');assert.match(api.visualPriorRelationInstructions,/model hypotheses/i);assert.match(api.visualPriorRelationInstructions,/historical/i);assert.match(api.visualPriorRelationInstructions,/current facts/i);assert.match(api.visualPriorRelationInstructions,/next observed/i);assert.match(api.visualPriorRelationInstructions,/no forced action/i);
});


test('an unmet remembered status is explicitly scoped to its prior assessment, never promoted into current conditions',()=>{
 const req=request();req.conditionContinuity.memory.entries[0]={...req.conditionContinuity.memory.entries[0],lastGrounded:{status:'unmet',evidence:quote('o2')},currentStatus:'unmet',transition:'persists'};
 const value=record(),sidecar=admit(links(),req,value),projected=action.visualActionChecks(value,goal,{id:'o3',imageSha256},offered(),{request:req,record:sidecar}),item=projected.record.checks[0].recalledConditions[0];
 assert.equal(item.currentStatus,'unmet');assert.equal(item.lastAssessed.observationId,'o2');assert.equal(item.evidenceScope,'historical');assert.equal(item.statusScope,'last-assessed-not-current-observation');assert.deepEqual(projected.record.checks[0].conditions,[{...value.conditions[0],evidenceScope:'none'}]);assert.equal(projected.record.checks[0].conditions[0].status,'uncertain');
 const tampered=structuredClone(sidecar);tampered.relations[0].recalledConditions[0].statusScope='current';assert.throws(()=>api.validateVisualPriorRelations(tampered,req,value));
});
