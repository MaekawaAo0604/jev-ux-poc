import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {workingInquiryQuestions,admitWorkingInquiry,validateWorkingInquiryRecord} from '../jev/virtual-beta/working-inquiry.js';
import {beginInquiryOperation,buildInquiryOutcomeContext,inquiryOutcomeQuestions,admitInquiryOutcome,validateInquiryOutcomeRecord,rememberInquiryOutcome} from '../jev/virtual-beta/inquiry-outcome.js';
import type {ChoiceAnswers,ChoiceQuestion} from '../jev/client.js';
import type {WorkingInquiryContext} from '../jev/virtual-beta/working-inquiry-contracts.js';

const policy='aligned-v1' as const;
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
const source=(n:number)=>({observationId:'o'+n,imageSha256:sha('image'+n)});
function working():WorkingInquiryContext{return {
 schemaVersion:1,kind:'bounded-working-inquiry-context',source:source(2),goalSha256:sha('goal'),
 conditions:{
  current_c1:{scope:'current-hypothesis',conditionId:'c1',description:'Composite supplied condition remains intact',status:'uncertain',evidence:null,evidenceScope:'none'},
  recalled_o1_c2:{scope:'recalled',conditionId:'o1_c2',description:'Earlier unresolved prerequisite',status:'unmet',evidence:{...source(1),quote:'Earlier visible unmet prerequisite',quoteStatus:'model-transcribed-unverified'},evidenceScope:'historical'},
 },
 candidates:[{candidateId:'e1',conditionKeys:['current_c1'],currentControlEvidence:{...source(2),quote:'Inspect details',quoteStatus:'model-transcribed-unverified'},expectedObservation:'Condition status'}],
};}
function response(questions:Record<string,ChoiceQuestion>,selected:Record<string,string>):ChoiceAnswers{return {
 model:'test',answers:Object.fromEntries(Object.entries(questions).map(([id,q])=>[id,{choice:selected[id],probabilities:Object.fromEntries(Object.keys(q.criteria).map(key=>[key,key===selected[id]?1:0]))}])),
};}
function alignedWorking(ctx=working(),plan='p2'){return response(workingInquiryQuestions(ctx,policy),{workingInquiry_plan:plan});}
function outcomeContext(intent='test_condition',check='condition_status_known',conditionKey='current_c1'){
 const ctx=working(),record=admitWorkingInquiry(response(workingInquiryQuestions(ctx),{workingInquiry_condition:conditionKey,workingInquiry_intent:intent,workingInquiry_check:check}),ctx);
 return buildInquiryOutcomeContext(source(3),ctx.goalSha256,beginInquiryOperation({context:ctx,record,candidateId:'e1',actionType:'click',execution:'performed'}),undefined);
}
function alignedOutcome(ctx=outcomeContext(),result='condition_unmet',basis='current_image'){return response(inquiryOutcomeQuestions(ctx,policy),{inquiryOutcome_result:result,inquiryOutcome_basis:basis});}
function trap(object:object,key:string,onRead:()=>void){Object.defineProperty(object,key,{enumerable:true,get(){onRead();throw Error('ACCESSOR_EXECUTED');}});}

test('aligned working offers only coherent joint tuples and decodes every selected option without adjustments',()=>{
 const ctx=working(),questions=workingInquiryQuestions(ctx,policy);
 assert.deepEqual(Object.keys(questions),['workingInquiry_plan']);
 assert.deepEqual(Object.keys(questions.workingInquiry_plan.criteria),['p1','p2','p3','p4','p5','p6','p7','p8']);
 const expected=[
  {conditionKey:'current_c1',intent:'change_condition',check:'condition_changed'},
  {conditionKey:'current_c1',intent:'test_condition',check:'condition_status_known'},
  {conditionKey:'current_c1',intent:'find_route',check:'new_route_visible'},
  {conditionKey:'recalled_o1_c2',intent:'change_condition',check:'condition_changed'},
  {conditionKey:'recalled_o1_c2',intent:'test_condition',check:'condition_status_known'},
  {conditionKey:'recalled_o1_c2',intent:'find_route',check:'new_route_visible'},
  {conditionKey:'none',intent:'find_route',check:'new_route_visible'},
  {conditionKey:'none',intent:'unknown',check:'unknown'},
 ];
 for(let i=0;i<expected.length;i++){
  const id='p'+(i+1),criterion=JSON.parse(questions.workingInquiry_plan.criteria[id]);
  const {condition,...tuple}=criterion;assert.deepEqual(tuple,expected[i]);
  assert.deepEqual(criterion.condition,expected[i].conditionKey==='none'?null:ctx.conditions[expected[i].conditionKey]);
  const res=alignedWorking(ctx,id),before=structuredClone(res),record=admitWorkingInquiry(res,ctx,policy);
  assert.deepEqual(record.rawChoices,expected[i]);assert.deepEqual(record.choices,expected[i]);assert.deepEqual(record.adjustments,[]);
  assert.deepEqual(validateWorkingInquiryRecord(record,ctx),record);assert.deepEqual(res,before);
 }
 assert.match(questions.workingInquiry_plan.instructions,/do not invent|do not decompose/i);
});
test('aligned working plan retains original probability distribution rather than projecting tuple scores',()=>{
 const ctx=working(),res=alignedWorking(ctx,'p2'),keys=Object.keys(res.answers.workingInquiry_plan.probabilities);
 res.answers.workingInquiry_plan.probabilities=Object.fromEntries(keys.map(key=>[key,key==='p2'?0.65:0.35/(keys.length-1)]));
 res.answers.workingInquiry_plan.confidence=0.4;
 const before=structuredClone(res);assert.equal(admitWorkingInquiry(res,ctx,policy).choices.intent,'test_condition');assert.deepEqual(res,before);
});
test('empty conditions offer only route and unknown; maximum six conditions produce twenty bounded plans',()=>{
 const empty=working();empty.conditions={};empty.candidates=[];
 const questions=workingInquiryQuestions(empty,policy);assert.deepEqual(Object.keys(questions.workingInquiry_plan.criteria),['p1','p2']);
 assert.deepEqual(admitWorkingInquiry(alignedWorking(empty,'p1'),empty,policy).choices,{conditionKey:'none',intent:'find_route',check:'new_route_visible'});
 assert.deepEqual(admitWorkingInquiry(alignedWorking(empty,'p2'),empty,policy).choices,{conditionKey:'none',intent:'unknown',check:'unknown'});
 const max=working();
 for(const id of ['c2','c3'])max.conditions['current_'+id]={...max.conditions.current_c1,conditionId:id};
 for(const id of ['c1','c3'])max.conditions['recalled_o1_'+id]={...max.conditions.recalled_o1_c2,conditionId:'o1_'+id};
 assert.equal(Object.keys(workingInquiryQuestions(max,policy).workingInquiry_plan.criteria).length,20);
});
test('aligned outcome result family follows the pending check and rejects incompatible result selections',()=>{
 for(const [intent,check,want] of [
  ['change_condition','condition_changed',['condition_satisfied','condition_unmet','condition_uncertain','unknown']],
  ['test_condition','condition_status_known',['condition_satisfied','condition_unmet','condition_uncertain','unknown']],
  ['find_route','new_route_visible',['route_found','route_not_found','unknown']],
  ['unknown','unknown',['unknown']],
 ] as const){
  const ctx=outcomeContext(intent,check),questions=inquiryOutcomeQuestions(ctx,policy);
  assert.deepEqual(Object.keys(questions),['inquiryOutcome_result','inquiryOutcome_basis']);
  assert.deepEqual(Object.keys(questions.inquiryOutcome_result.criteria),want);
  assert.deepEqual(Object.keys(questions.inquiryOutcome_basis.criteria),['current_image','none']);
  for(const result of want){
   const record=admitInquiryOutcome(alignedOutcome(ctx,result),ctx,policy)!;
   assert.equal(record.choices.result,result);assert.deepEqual(record.adjustments,[]);
   assert.deepEqual(validateInquiryOutcomeRecord(record,ctx),record);assert.equal(rememberInquiryOutcome(ctx,record).entries.length,1);
  }
  const incompatible=check==='new_route_visible'?'condition_unmet':'route_found';
  const res=alignedOutcome(ctx);res.answers.inquiryOutcome_result.choice=incompatible;
  assert.throws(()=>admitInquiryOutcome(res,ctx,policy));
  const instructions=questions.inquiryOutcome_result.instructions;
  assert.ok(instructions.includes(JSON.stringify(ctx.pending!.check)));assert.ok(instructions.includes(JSON.stringify(ctx.pending!.condition)));assert.ok(instructions.includes(JSON.stringify(ctx.pending!.action)));
 }
});
test('aligned outcome permits visible negative and uncertain basis while keeping absent-current-basis guard',()=>{
 const ctx=outcomeContext(),questions=inquiryOutcomeQuestions(ctx,policy);
 assert.match(questions.inquiryOutcome_basis.criteria.current_image,/negative/i);
 assert.match(questions.inquiryOutcome_basis.criteria.current_image,/uncertain/i);
 assert.match(questions.inquiryOutcome_basis.criteria.current_image,/does not mean goal success/i);
 assert.match(questions.inquiryOutcome_basis.criteria.none,/no relevant current-image evidence/i);
 assert.match(questions.inquiryOutcome_basis.instructions,/historical/i);
 for(const result of ['condition_unmet','condition_uncertain']){
  assert.equal(admitInquiryOutcome(alignedOutcome(ctx,result),ctx,policy)!.choices.result,result);
  const guarded=admitInquiryOutcome(alignedOutcome(ctx,result,'none'),ctx,policy)!;
  assert.deepEqual(guarded.choices,{result:'unknown',basis:'none'});assert.deepEqual(guarded.adjustments,['NO_CURRENT_IMAGE_BASIS']);assert.equal(guarded.rawChoices.result,result);
 }
 const route=inquiryOutcomeQuestions(outcomeContext('find_route','new_route_visible'),policy);
 assert.match(route.inquiryOutcome_result.criteria.route_not_found,/displayed view/i);
 assert.match(route.inquiryOutcome_result.criteria.route_not_found,/whole product/i);
});
test('aligned outcome has no questions without pending operation and rejects unexpected outcome IDs',()=>{
 const ctx=buildInquiryOutcomeContext(source(3),sha('goal'),null,undefined);
 assert.deepEqual(inquiryOutcomeQuestions(ctx,policy),{});
 assert.equal(admitInquiryOutcome({model:'test',answers:{}},ctx,policy),null);
 assert.throws(()=>admitInquiryOutcome({model:'test',answers:{inquiryOutcome_result:{choice:'unknown',probabilities:{unknown:1}}}},ctx,policy));
});
test('aligned admissions reject malformed distributions, forbidden extra IDs and free-form fields',()=>{
 const wctx=working(),octx=outcomeContext();
 for(const [ctx,make,admit,id,extra] of [
  [wctx,()=>alignedWorking(wctx),(r:any,c:any)=>admitWorkingInquiry(r,c,policy),'workingInquiry_plan','workingInquiry_condition'],
  [octx,()=>alignedOutcome(octx),(r:any,c:any)=>admitInquiryOutcome(r,c,policy),'inquiryOutcome_result','inquiryOutcome_extra'],
 ] as const){
  for(const mutate of [
   (r:any)=>delete r.answers[id],
   (r:any)=>r.answers[extra]={},
   (r:any)=>r.answers[id].choice='invented',
   (r:any)=>r.answers[id].probabilities={},
   (r:any)=>r.answers[id].probabilities[Object.keys(r.answers[id].probabilities)[0]]=NaN,
   (r:any)=>r.answers[id].probabilities[Object.keys(r.answers[id].probabilities)[0]]=-1,
   (r:any)=>r.answers[id].probabilities[Object.keys(r.answers[id].probabilities)[0]]=2,
   (r:any)=>r.answers[id].probabilities[Object.keys(r.answers[id].probabilities)[0]]=0.5,
   (r:any)=>r.answers[id].confidence=NaN,
   (r:any)=>r.answers[id].confidence=-0.1,
   (r:any)=>r.answers[id].reason='free-form',
  ]){const res=make();mutate(res);assert.throws(()=>admit(res,ctx));}
  const allowed=make();allowed.answers.goal={choice:'unknown',probabilities:{unknown:1}};assert.doesNotThrow(()=>admit(allowed,ctx));
 }
});
test('aligned admissions never execute getters in contexts, answer accessors or probability distributions',()=>{
 let reads=0;const onRead=()=>reads++;
 for(const level of ['answers','answer','probabilities'] as const){
  const wctx=working(),wr=alignedWorking(wctx),octx=outcomeContext(),or=alignedOutcome(octx);
  for(const [ctx,res,admit,id] of [
   [wctx,wr,(r:any,c:any)=>admitWorkingInquiry(r,c,policy),'workingInquiry_plan'],
   [octx,or,(r:any,c:any)=>admitInquiryOutcome(r,c,policy),'inquiryOutcome_result'],
  ] as const){
   if(level==='answers')trap(res,'answers',onRead);
   else if(level==='answer')trap(res.answers,id,onRead);
   else trap(res.answers[id].probabilities,Object.keys(res.answers[id].probabilities)[0],onRead);
   assert.throws(()=>admit(res,ctx));
  }
 }
 const wctx=working();trap(wctx.conditions.current_c1,'description',onRead);assert.throws(()=>workingInquiryQuestions(wctx,policy));
 const octx=outcomeContext();trap(octx.pending!.action,'type',onRead);assert.throws(()=>inquiryOutcomeQuestions(octx,policy));assert.equal(reads,0);
});
test('unknown policy values fail instead of silently using legacy behavior, even without pending operation',()=>{
 const wctx=working(),octx=outcomeContext(),none=buildInquiryOutcomeContext(source(3),sha('goal'),null,undefined),bad='aligned-v2' as any;
 assert.throws(()=>workingInquiryQuestions(wctx,bad));assert.throws(()=>admitWorkingInquiry(alignedWorking(wctx),wctx,bad));
 assert.throws(()=>inquiryOutcomeQuestions(octx,bad));assert.throws(()=>admitInquiryOutcome(alignedOutcome(octx),octx,bad));
 assert.throws(()=>inquiryOutcomeQuestions(none,bad));assert.throws(()=>admitInquiryOutcome({model:'test',answers:{}},none,bad));
});
test('default legacy questions retain their original bytes and legacy contradictory admission remains unchanged',()=>{
 const ctx=working(),instructions='Choose a fallible working hypothesis from the supplied context. Historical evidence describes its earlier observation and does not establish current state. Preserve the persona and all offered actions. No condition, intent or check asserts success or forces an action. A check is an expected observation to assess on the next screen. Use unknown when the evidence is insufficient.';
 const question=(detail:string,criteria:Record<string,string>)=>({type:'choice',instructions:instructions+' '+detail,criteria});
 const expected={
  workingInquiry_condition:question('Which unresolved condition is the present working target?',Object.fromEntries([...Object.entries(ctx.conditions).map(([key,condition])=>[key,JSON.stringify(condition)]),['none','No supplied unresolved condition can be selected.']])),
  workingInquiry_intent:question('What is the intended next step?',{change_condition:'Attempt to change the selected condition.',test_condition:'Inspect whether the selected condition is met or unmet.',find_route:'Find a visible route towards the goal.',unknown:'The intended next step is unknown.'}),
  workingInquiry_check:question('Which observable result would test that intended step?',{condition_changed:'Observe whether the selected condition changed.',condition_status_known:'Observe evidence clarifying the selected condition status.',new_route_visible:'Observe a new visible route towards the goal.',unknown:'No supported observable check can be named.'}),
 };
 assert.equal(JSON.stringify(workingInquiryQuestions(ctx)),JSON.stringify(expected));
 const res=response(workingInquiryQuestions(ctx),{workingInquiry_condition:'current_c1',workingInquiry_intent:'test_condition',workingInquiry_check:'condition_changed'});
 const record=admitWorkingInquiry(res,ctx);assert.deepEqual(record.rawChoices,{conditionKey:'current_c1',intent:'test_condition',check:'condition_changed'});
 assert.deepEqual(record.choices,{conditionKey:'current_c1',intent:'test_condition',check:'unknown'});
 assert.deepEqual(record.adjustments,[{field:'check',from:'condition_changed',to:'unknown',reason:'INTENT_CHECK_MISMATCH'}]);
 const outcomeCtx=outcomeContext(),oi='Assess only the supplied previous selected condition, check and executed action against the current admitted image. This is a fallible model judgment, never a fact. Historical descriptions and past model outcomes do not establish current state. Judge this specific check independently of the entire goal. Use unknown when unsupported; do not invent unseen content or routes.';
 const oq=(detail:string,criteria:Record<string,string>)=>({type:'choice',instructions:oi+' '+detail,criteria});
 const outcomeExpected={
  inquiryOutcome_result:oq('What does the current image support for the previous check?',{condition_satisfied:'The selected condition is now supported as satisfied.',condition_unmet:'The selected condition is now supported as unmet.',condition_uncertain:'The selected condition remains uncertain on this image.',route_found:'A visible route relevant to the previous route check was found.',route_not_found:'The current image supports that the previous route check found no visible route.',unknown:'The previous check cannot be assessed.'}),
  inquiryOutcome_basis:oq('Is this specific result supported by the current admitted image?',{current_image:'The attached current image supports this result.',none:'No current-image basis supports this result.'}),
 };
 assert.equal(JSON.stringify(inquiryOutcomeQuestions(outcomeCtx)),JSON.stringify(outcomeExpected));
 const old=admitInquiryOutcome(response(inquiryOutcomeQuestions(outcomeCtx),{inquiryOutcome_result:'route_found',inquiryOutcome_basis:'current_image'}),outcomeCtx)!;
 assert.equal(old.rawChoices.result,'route_found');assert.equal(old.choices.result,'unknown');assert.deepEqual(old.adjustments,['RESULT_CHECK_MISMATCH']);
});

