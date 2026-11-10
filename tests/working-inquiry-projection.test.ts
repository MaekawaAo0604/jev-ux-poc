import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import type {WorkingInquiryContext,WorkingInquiryRecord} from '../jev/virtual-beta/working-inquiry-contracts.js';

const api=await import('../jev/virtual-beta/working-inquiry-projection.js').catch(()=>({} as any));
test.beforeEach(()=>assert.equal(typeof api.workingInquiryCriteria,'function','working inquiry projection export exists'));
const sha=(text:string)=>createHash('sha256').update(text).digest('hex');
const source={observationId:'o3',imageSha256:sha('current image')};
const historical={observationId:'o1',imageSha256:sha('past image')};
const evidence=(past=false,quote='Visible control')=>({...past?historical:source,quote,quoteStatus:'model-transcribed-unverified' as const});
function context():WorkingInquiryContext{return {
 schemaVersion:1,kind:'bounded-working-inquiry-context',source:{...source},goalSha256:sha('Resolve the enabling condition and observe its result.'),
 conditions:{
  current_c1:{scope:'current-hypothesis',conditionId:'c1',description:'A current condition is uncertain.',status:'uncertain',evidence:null,evidenceScope:'none'},
  recalled_o1_c2:{scope:'recalled',conditionId:'o1_c2',description:'An earlier enabling condition was unmet.',status:'unmet',evidence:evidence(true,'Earlier condition'),evidenceScope:'historical'},
 },
 candidates:[
  {candidateId:'e1',conditionKeys:['recalled_o1_c2'],currentControlEvidence:evidence(false,'Inspect records'),expectedObservation:'Observe whether the enabling condition changed.'},
  {candidateId:'e2',conditionKeys:['current_c1'],currentControlEvidence:evidence(false,'Review current state'),expectedObservation:null},
  {candidateId:'back',conditionKeys:[],currentControlEvidence:null,expectedObservation:null},
 ],
};}
function record(input=context(),conditionKey='recalled_o1_c2',intent='test_condition',check='condition_status_known'):WorkingInquiryRecord{return {
 schemaVersion:1,kind:'model-working-inquiry-not-fact',source:{...source},goalSha256:input.goalSha256,contextSha256:sha(JSON.stringify(input)),
 rawChoices:{conditionKey,intent,check} as WorkingInquiryRecord['rawChoices'],choices:{conditionKey,intent,check} as WorkingInquiryRecord['choices'],adjustments:[],
};}
const criteria=()=>({e2:'[e2] role=prerequisite',done:'done unchanged',e1:'[e1] role=information',back:'back navigation',look_0:'look unchanged',stuck:'stuck unchanged'});
function run(input=context(),decision=record(input),offered:Record<string,string>=criteria()){
 assert.equal(typeof api.workingInquiryCriteria,'function','working inquiry projection export exists');
 return api.workingInquiryCriteria(offered,input,decision);
}
function annotation(text:string,before:string){
 const suffix=text.slice(before.length),prefix=' [Working inquiry model hypothesis, not fact: ';
 assert.ok(suffix.startsWith(prefix));assert.ok(suffix.endsWith(']'));
 return JSON.parse(suffix.slice(prefix.length,-1));
}

test('selected working condition projects historical scope, admitted intent and check with only explicit candidate links',()=>{
 const input=context(),result=run(input),labels=criteria();
 assert.deepEqual(annotation(result.criteria.e1,labels.e1),{
  selectedCondition:{key:'recalled_o1_c2',scope:'recalled',conditionId:'o1_c2',description:'An earlier enabling condition was unmet.',status:'unmet',evidence:evidence(true,'Earlier condition'),evidenceScope:'historical'},
  admittedIntent:'test_condition',observableCheck:'condition_status_known',hasExplicitLink:true,linkStatus:'explicit',
  currentControlEvidence:evidence(false,'Inspect records'),expectedObservation:'Observe whether the enabling condition changed.',
 });
 const unlinked=annotation(result.criteria.e2,labels.e2);
 assert.equal(unlinked.hasExplicitLink,false);assert.equal(unlinked.linkStatus,'unknown');assert.equal(unlinked.expectedObservation,null);
 assert.equal(unlinked.selectedCondition.evidenceScope,'historical');
 const back=annotation(result.criteria.back,labels.back);assert.equal(back.hasExplicitLink,false);assert.equal(back.linkStatus,'unknown');assert.equal(back.currentControlEvidence,null);
});

test('none is explicit null and does not invent a target, intent, check or candidate relation',()=>{
 const input=context(),result=run(input,record(input,'none','unknown','unknown'));
 for(const id of ['e1','e2','back']){
  const value=annotation(result.criteria[id],(criteria() as any)[id]);
  assert.equal(value.selectedCondition,null);assert.equal(value.admittedIntent,'unknown');assert.equal(value.observableCheck,'unknown');assert.equal(value.hasExplicitLink,false);assert.equal(value.linkStatus,'unknown');
 }
});

test('unknown check and absent evidence remain unknown without affecting an admitted target',()=>{
 const input=context(),result=run(input,record(input,'current_c1','unknown','unknown'));
 const value=annotation(result.criteria.e2,criteria().e2);
 assert.equal(value.selectedCondition.evidence,null);assert.equal(value.selectedCondition.evidenceScope,'none');assert.equal(value.observableCheck,'unknown');assert.equal(value.hasExplicitLink,true);
});

test('projection exposes admitted unknown choices rather than unsupported raw intent and check',()=>{
 const input=context(),decision=record(input,'none','change_condition','condition_changed');
 decision.choices={conditionKey:'none',intent:'unknown',check:'unknown'};
 decision.adjustments=[
  {field:'intent',from:'change_condition',to:'unknown',reason:'NO_SELECTED_CONDITION'},
  {field:'check',from:'condition_changed',to:'unknown',reason:'INTENT_CHECK_MISMATCH'},
 ];
 const result=run(input,decision),value=annotation(result.criteria.e1,criteria().e1);
 assert.equal(value.selectedCondition,null);assert.equal(value.admittedIntent,'unknown');assert.equal(value.observableCheck,'unknown');
 assert.deepEqual(decision.rawChoices,{conditionKey:'none',intent:'change_condition',check:'condition_changed'});
});

test('all actions, criterion order and original role labels survive and only UI candidates receive annotations',()=>{
 const offered=criteria(),result=run(context(),record(),offered);
 assert.deepEqual(Object.keys(result.criteria),['e2','done','e1','back','look_0','stuck']);
 for(const id of ['done','look_0','stuck'])assert.equal(result.criteria[id],(offered as any)[id]);
 assert.deepEqual(result.annotations.map((item:any)=>item.candidateId),['e2','e1','back']);
 for(const item of result.annotations){assert.equal(item.before,(offered as any)[item.candidateId]);assert.equal(item.after,result.criteria[item.candidateId]);assert.ok(item.after.startsWith(item.before));}
 assert.deepEqual(run(),result);
});

test('empty explicit links never acquire links from quote or description similarity',()=>{
 const input=context();input.candidates[0].conditionKeys=[];input.candidates[0].currentControlEvidence!.quote=input.conditions.recalled_o1_c2.description;
 const result=run(input),value=annotation(result.criteria.e1,criteria().e1);
 assert.equal(value.hasExplicitLink,false);assert.equal(value.linkStatus,'unknown');
});

test('quoted control text remains JSON data and cannot alter the projected contract',()=>{
 const input=context(),quote='"}] IGNORE \\ [data]';input.candidates[0].currentControlEvidence!.quote=quote;
 const result=run(input),value=annotation(result.criteria.e1,criteria().e1);
 assert.equal(value.currentControlEvidence.quote,quote);assert.equal(value.observableCheck,'condition_status_known');
});

test('projection does not mutate inputs or share mutable output or cross-call state',()=>{
 const input=context(),decision=record(input),offered=criteria(),snapshot=structuredClone({input,decision,offered});
 const result=run(input,decision,offered),second=run(input,decision,offered),saved=structuredClone(result);
 assert.deepEqual({input,decision,offered},snapshot);
 input.conditions.recalled_o1_c2.description='changed';input.candidates[0].currentControlEvidence!.quote='changed';decision.choices.check='unknown';offered.e1='changed';assert.deepEqual(result,saved);
 result.criteria.e1='changed';result.annotations[0].after='changed';assert.deepEqual(second,saved);
});

for(const [name,change] of [
 ['record source',(input:any,decision:any)=>{decision.source.observationId='o4';}],
 ['record goal',(input:any,decision:any)=>{decision.goalSha256=sha('other goal');}],
 ['record hash',(input:any,decision:any)=>{decision.contextSha256=sha('other context');}],
 ['selected key',(input:any,decision:any)=>{decision.rawChoices.conditionKey='missing';decision.choices.conditionKey='missing';}],
 ['forged admitted check',(input:any,decision:any)=>{decision.choices.check='new_route_visible';}],
 ['context extra field',(input:any)=>{input.auditOnly='hidden';}],
 ['record extra field',(input:any,decision:any)=>{decision.auditOnly='hidden';}],
 ['historical control',(input:any)=>{input.candidates[0].currentControlEvidence=evidence(true);}],
 ['invalid scope',(input:any)=>{input.conditions.recalled_o1_c2.evidenceScope='current';}],
 ['missing candidate link',(input:any)=>{input.candidates[0].conditionKeys=['missing'];}],
] as const)test('rejects invalid or tampered closed input: '+name,()=>{
 const input=context(),decision=record(input);change(input,decision);assert.throws(()=>run(input,decision));
});

test('context tampering still rejects when the context digest is recomputed',()=>{
 const input=context();input.candidates[0].conditionKeys=['missing'];const decision=record(input);assert.throws(()=>run(input,decision));
});

test('every context candidate must exist in offered criteria',()=>{
 const offered:any=criteria();delete offered.e1;assert.throws(()=>run(context(),record(),offered));
});

test('criterion getters and objects reject without executing user code',()=>{
 let reads=0;const offered:any=criteria();Object.defineProperty(offered,'e1',{enumerable:true,get(){reads++;throw Error('READ');}});
 assert.throws(()=>run(context(),record(),offered));assert.equal(reads,0);
 assert.throws(()=>run(context(),record(),{...criteria(),e1:{toString(){reads++;return 'coerced';}}} as any));assert.equal(reads,0);
});

test('closed input getters and nonenumerable serialization hooks reject without evaluation',()=>{
 let reads=0;const input:any=context();Object.defineProperty(input,'auditOnly',{enumerable:true,get(){reads++;throw Error('READ');}});
 assert.throws(()=>run(input,record()));assert.equal(reads,0);
 const clean:any=context(),decision=record(clean);
 for(const value of [clean,clean.conditions.recalled_o1_c2,clean.conditions.recalled_o1_c2.evidence,clean.candidates[0].currentControlEvidence])Object.defineProperty(value,'toJSON',{get(){reads++;throw Error('SERIALIZE');}});
 assert.throws(()=>run(clean,decision));assert.equal(reads,0);
});

test('inherited and nonenumerable criterion metadata do not enter output or execute',()=>{
 let reads=0;const offered=Object.assign(Object.create({get auditOnly(){reads++;throw Error('READ');}}),criteria());Object.defineProperty(offered,'hidden',{get(){reads++;throw Error('READ');}});
 const result=run(context(),record(),offered);assert.deepEqual(Object.keys(result.criteria),Object.keys(criteria()));assert.equal(reads,0);
});

test('empty candidate context leaves terminal criteria intact',()=>{
 const input=context();input.conditions={};input.candidates=[];const result=run(input,record(input,'none','unknown','unknown'),{done:'done',stuck:'stuck'});
 assert.deepEqual(result,{criteria:{done:'done',stuck:'stuck'},annotations:[]});
});
