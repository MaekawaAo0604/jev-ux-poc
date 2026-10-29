import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {actionRelationQuestions,admitActionRelations,actionRelationCriteria,type ActionRelationRecord} from '../jev/virtual-beta/action-relations.js';
import type {BetaCandidates,UserObservation} from '../jev/virtual-beta/contracts.js';
import type {ExperienceSource} from '../jev/virtual-beta/experience-contracts.js';
import type {ChoiceAnswers,ChoiceQuestion} from '../jev/client.js';

const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const goal='Change the notification destination without changing the delivery schedule.';
const source=(id='o2'):ExperienceSource=>({observationId:id,imageSha256:hash(id)});
const current=():UserObservation=>({id:'o2',imageSha256:hash('o2'),visibleText:[],fixation:{x:0,y:0},candidateIds:['e1','e2','back','scroll_down','look_0','done','wait']});
const candidates=():BetaCandidates=>({e1:{action:{type:'click',elementId:'e1'},label:'PRIVATE LABEL ONE'},e2:{action:{type:'click',elementId:'e2'},label:'PRIVATE LABEL TWO'},back:{action:{type:'back'},label:'Back'},scroll_down:{action:{type:'scroll',direction:'down'},label:'Scroll'},look_0:{action:{type:'look',point:{x:100,y:100}},label:'Look'},done:{action:{type:'done'},label:'Done'},wait:{action:{type:'wait'},label:'Wait'}});
const sources=()=>[source('o1'),source()];
const questions=()=>actionRelationQuestions(goal,current(),candidates(),sources());
function response(overrides:Record<string,string>={},q=questions()):ChoiceAnswers{
 const defaults:Record<string,string>={actionRelation_availability:'blocked',actionRelation_availabilityEvidence:'o2'};
 for(const id of ['e1','e2','back','scroll_down'])Object.assign(defaults,{['actionRelation_role_'+id]:id==='e1'?'prerequisite':'navigation',['actionRelation_evidence_'+id]:'o2',['actionRelation_verify_'+id]:id==='e1'?'availability-change':'navigation'});
 return {model:'LOCAL_NO_API',answers:Object.fromEntries(Object.entries(q).map(([id,question])=>{const choice=overrides[id]??defaults[id];return [id,{choice,probabilities:Object.fromEntries(Object.keys(question.criteria).map(k=>[k,k===choice?1:0]))}];}))};
}
const admit=(r=response())=>admitActionRelations(r,goal,current(),candidates(),sources());
const criteria=()=>Object.fromEntries(Object.entries(candidates()).map(([id,candidate])=>[id,candidate.label]));

// Fails if missing role/verification or if observations/labels rather than IDs are copied.
test('questions preserve UI candidate order, source identity and literal whole goal without reading labels or observation text',()=>{
 const c=candidates(),o=current();
 for(const candidate of Object.values(c))Object.defineProperty(candidate,'label',{get(){throw new Error('LABEL_READ');}});
 Object.defineProperty(o,'visibleText',{get(){throw new Error('TEXT_READ');}});
 Object.defineProperty(o,'fixation',{get(){throw new Error('GEOMETRY_READ');}});
 const q=actionRelationQuestions(goal,o,c,sources());
 assert.deepEqual(Object.keys(q),['actionRelation_availability','actionRelation_availabilityEvidence',...['e1','e2','back','scroll_down'].flatMap(id=>['actionRelation_role_'+id,'actionRelation_evidence_'+id,'actionRelation_verify_'+id])]);
 assert.deepEqual(Object.keys(q.actionRelation_availabilityEvidence.criteria),['o1','o2','none']);
 assert.deepEqual(Object.keys(q.actionRelation_role_e1.criteria),['execute','prerequisite','information','navigation','unrelated','unknown']);
 assert.deepEqual(Object.keys(q.actionRelation_verify_e1.criteria),['goal-change','availability-change','information','navigation','no-goal-change','unknown']);
 const text=JSON.stringify(q);assert.ok(text.includes(goal));assert.ok(!text.includes('PRIVATE'));assert.match(text,/entire Goal/i);assert.match(text,/confirmation/i);assert.match(text,/not.*proof/i);assert.match(text,/persona/i);
});

// Fails if raw model fields, confidence or prototype properties enter the record.
test('admission keeps only source-bound categorical hypotheses and coexists with other assessment answers',()=>{
 const r=response();r.answers.knowledge={choice:'SECRET',probabilities:{SECRET:1}};(r as unknown as Record<string,unknown>).secret='PRIVATE';
 for(const a of Object.values(r.answers))(a as unknown as Record<string,unknown>).explanation='PRIVATE';
 const record=admit(r);
 assert.deepEqual(record,{schemaVersion:1,kind:'model-action-relations-not-fact',source:source(),goalSha256:hash(goal),availability:{status:'blocked',evidence:source()},candidates:Object.fromEntries(['e1','e2','back','scroll_down'].map(id=>[id,{role:id==='e1'?'prerequisite':'navigation',evidence:source(),verify:id==='e1'?'availability-change':'navigation'}])),adjustments:[]});
 assert.ok(!JSON.stringify(record).includes('PRIVATE'));r.answers.actionRelation_role_e1.choice='execute';assert.equal(record.candidates.e1.role,'prerequisite');
});

// Fails if evidence-free predictions are presented as supported role/availability/effect.
test('none evidence demotes each non-unknown category and logs exact adjustments',()=>{
 const record=admit(response({actionRelation_availabilityEvidence:'none',actionRelation_evidence_e1:'none'}));
 assert.deepEqual(record.availability,{status:'unknown'});assert.deepEqual(record.candidates.e1,{role:'unknown',verify:'unknown'});
 assert.deepEqual(record.adjustments,[{field:'availability',from:'blocked',to:'unknown',reason:'NO_ADMITTED_EVIDENCE'},{field:'role_e1',from:'prerequisite',to:'unknown',reason:'NO_ADMITTED_EVIDENCE'},{field:'verify_e1',from:'availability-change',to:'unknown',reason:'NO_ADMITTED_EVIDENCE'}]);
 const unknown=admit(response({actionRelation_availability:'unknown',actionRelation_availabilityEvidence:'none',actionRelation_role_e1:'unknown',actionRelation_verify_e1:'unknown',actionRelation_evidence_e1:'none'}));
 assert.deepEqual(unknown.adjustments,[]);
});

test('unknown may retain attached evidence without implying unsupported knowledge',()=>{
 const record=admit(response({actionRelation_availability:'unknown',actionRelation_role_e1:'unknown',actionRelation_verify_e1:'unknown'}));
 assert.deepEqual(record.availability,{status:'unknown',evidence:source()});assert.deepEqual(record.candidates.e1,{role:'unknown',verify:'unknown',evidence:source()});
});

test('attached historical source references are copied exactly, never inferred from unattached history',()=>{
 const basis=sources(),r=response({actionRelation_evidence_e1:'o1'}),record=admitActionRelations(r,goal,current(),candidates(),basis);
 assert.deepEqual(record.candidates.e1.evidence,source('o1'));basis[0].imageSha256=hash('mutated');assert.deepEqual(record.candidates.e1.evidence,source('o1'));
 assert.throws(()=>admit(response({actionRelation_evidence_e1:'o9'})));
});

test('all requested prefix answers are required and unsolicited prefix answers are rejected',()=>{
 for(const id of Object.keys(questions())){const r=response();delete r.answers[id];assert.throws(()=>admit(r),id);}
 const r=response();r.answers.actionRelation_unrequested={choice:'unknown',probabilities:{unknown:1}};assert.throws(()=>admit(r));
});

test('corrupt probabilities and zero-probability selected choices fail closed',()=>{
 const mutations=[(a:any)=>a.probabilities.blocked=-.1,(a:any)=>a.probabilities.ready=NaN,(a:any)=>a.probabilities.ready=Infinity,(a:any)=>a.probabilities.extra=0,(a:any)=>delete a.probabilities.unknown,(a:any)=>a.probabilities.blocked=.3,(a:any)=>{a.probabilities.blocked=0;a.probabilities.ready=1;},(a:any)=>a.choice={toString:()=> 'blocked'}];
 for(const mutate of mutations){const r=response();mutate(r.answers.actionRelation_availability);assert.throws(()=>admit(r));}
});

test('valid non-maximum selected categories remain model choices rather than argmax rewrite',()=>{
 const r=response(),a=r.answers.actionRelation_availability;a.probabilities={blocked:.3,ready:.5,completed:.1,unknown:.1};assert.equal(admit(r).availability.status,'blocked');
});

test('duplicate conflicting future invalid and unattached current sources are rejected',()=>{
 const invalid=[[],[source('o1')],[source('o2'),source('o2')],[source('o2'),{...source('o2'),imageSha256:hash('other')}],[source('o2'),source('o3')],[source('o2'),{observationId:'none',imageSha256:hash('x')}],[source('o2'),{observationId:'arbitrary',imageSha256:hash('x')}],[{...source('o2'),imageSha256:'bad'}],[{...source('o2'),imageSha256:hash('other')}]];
 for(const basis of invalid)assert.throws(()=>actionRelationQuestions(goal,current(),candidates(),basis));
 const five=[1,2,3,4,5].map(n=>source('o'+n));const o={...current(),id:'o5',imageSha256:hash('o5')};assert.throws(()=>actionRelationQuestions(goal,o,candidates(),five));
});

test('invalid goal observation IDs candidate identity and oversized UI sets fail closed',()=>{
 for(const g of ['',null,{},42])assert.throws(()=>actionRelationQuestions(g as string,current(),candidates(),sources()));
 for(const patch of [{id:'unknown'},{id:'o0'},{imageSha256:'invalid'},{candidateIds:['e1','e1']}])assert.throws(()=>actionRelationQuestions(goal,{...current(),...patch},candidates(),sources()));
 for(const patch of [{e1:{action:{type:'click',elementId:'e2'},label:'x'}},{e1:{action:{type:'unknown'},label:'x'}}])assert.throws(()=>actionRelationQuestions(goal,current(),{...candidates(),...patch} as BetaCandidates,sources()));
 assert.throws(()=>actionRelationQuestions(goal,{...current(),candidateIds:['e1']},candidates(),sources()));
 const many=Object.fromEntries(Array.from({length:25},(_,i)=>['e'+i,{action:{type:'click',elementId:'e'+i},label:'x'}])) as BetaCandidates;
 assert.throws(()=>actionRelationQuestions(goal,{...current(),candidateIds:Object.keys(many)},many,sources()));
});

test('non-UI-only candidates have availability questions without fabricated UI relations',()=>{
 const all={done:candidates().done};const q=actionRelationQuestions(goal,{...current(),candidateIds:['done']},all,sources());assert.deepEqual(Object.keys(q),['actionRelation_availability','actionRelation_availabilityEvidence']);
});

test('criteria preserve candidate membership order labels and availability on all choices',()=>{
 const labels=criteria(),record=admit(),before=structuredClone(labels),rBefore=structuredClone(record),annotated=actionRelationCriteria(labels,record,goal,current());
 assert.deepEqual(Object.keys(annotated),Object.keys(labels));assert.deepEqual(labels,before);assert.deepEqual(record,rBefore);
 for(const id of Object.keys(labels)){assert.ok(annotated[id].startsWith(labels[id]));assert.match(annotated[id],/availability=blocked/);assert.match(annotated[id],/hypothes/i);}
 assert.match(annotated.e1,/role=prerequisite/);assert.match(annotated.e1,/verify=availability-change/);assert.match(annotated.e1,/evidence=o2/);assert.ok(!annotated.done.includes('role=prerequisite'));
});

test('criteria reject stale source goal changed candidate set and invalid categorical record',()=>{
 const changes:((r:ActionRelationRecord)=>void)[]=[r=>r.source.observationId='o1',r=>r.source.imageSha256=hash('other'),r=>r.goalSha256=hash('other'),r=>r.kind='FACT' as never,r=>r.availability.status='ready-now' as never,r=>r.candidates.e1.role='secret' as never,r=>r.candidates.e1.verify='secret' as never,r=>r.candidates.e1.evidence={observationId:'o3',imageSha256:hash('o3')},r=>r.candidates.e1.evidence={observationId:'o2',imageSha256:hash('wrong')},r=>delete r.candidates.e1.evidence,r=>r.adjustments.push({field:'SECRET',from:'SECRET',to:'unknown',reason:'NO_ADMITTED_EVIDENCE'})];
 for(const change of changes){const r=admit();change(r);assert.throws(()=>actionRelationCriteria(criteria(),r,goal,current()));}
 const labels=criteria();delete labels.e1;assert.throws(()=>actionRelationCriteria(labels,admit(),goal,current()));
 const r=admit();r.candidates.not_offered={role:'unknown',verify:'unknown'};assert.throws(()=>actionRelationCriteria(criteria(),r,goal,current()));
});

test('criteria allowlists serialization instead of leaking arbitrary record fields',()=>{
 const r=admit() as ActionRelationRecord&{secret:string};r.secret='RECORD_SECRET';(r.candidates.e1 as any).secret='RECORD_SECRET';(r.availability as any).secret='RECORD_SECRET';
 const annotated=actionRelationCriteria(criteria(),r,goal,current());assert.ok(!JSON.stringify(annotated).includes('RECORD_SECRET'));
});

test('criteria validates and presents explicit evidence demotions without numeric weighting',()=>{
 const record=admit(response({actionRelation_evidence_e1:'none'}));const annotated=actionRelationCriteria(criteria(),record,goal,current());assert.match(annotated.e1,/role=unknown/);assert.match(annotated.e1,/verify=unknown/);assert.match(annotated.e1,/NO_ADMITTED_EVIDENCE/);
 const forged=structuredClone(record);forged.adjustments[0].from='SECRET';assert.throws(()=>actionRelationCriteria(criteria(),forged,goal,current()));
});

// Fails if separately well-shaped historical references conflict or evade the attachment bound.
test('criteria rejects internally conflicting historical evidence and excessive references',()=>{
 const conflict=admit(response({actionRelation_availabilityEvidence:'o1',actionRelation_evidence_e1:'o1'}));
 conflict.candidates.e1.evidence!.imageSha256=hash('conflicting o1');assert.throws(()=>actionRelationCriteria(criteria(),conflict,goal,current()));
 const o={...current(),id:'o9',imageSha256:hash('o9')};
 const excess=admit();excess.source=source('o9');excess.availability.evidence=source('o1');
 for(const [index,id] of Object.keys(excess.candidates).entries())excess.candidates[id].evidence=source('o'+(index+2));
 assert.throws(()=>actionRelationCriteria(criteria(),excess,goal,o));
});

// Same rendered pixels may back several distinct admitted observation IDs.
test('five attached observation IDs sharing four images are admitted and preserved in criteria',()=>{
 const basis=[source('o1'),source('o2'),source('o3'),source('o4'),{observationId:'o5',imageSha256:hash('o4')}];
 const o={...current(),id:'o5',imageSha256:hash('o4')};
 const q=actionRelationQuestions(goal,o,candidates(),basis);
 assert.deepEqual(Object.keys(q.actionRelation_availabilityEvidence.criteria),['o1','o2','o3','o4','o5','none']);
 const r=response({actionRelation_availabilityEvidence:'o5',actionRelation_evidence_e1:'o1',actionRelation_evidence_e2:'o2',actionRelation_evidence_back:'o3',actionRelation_evidence_scroll_down:'o4'},q);
 const record=admitActionRelations(r,goal,o,candidates(),basis);
 assert.deepEqual(Object.values(record.candidates).map(c=>c.evidence?.observationId),['o1','o2','o3','o4']);
 assert.match(actionRelationCriteria(criteria(),record,goal,o).scroll_down,/evidence=o4/);
});

test('five unique attached image hashes and six IDs sharing images fail the separate bounds',()=>{
 const o={...current(),id:'o5',imageSha256:hash('o5')};
 const five=[1,2,3,4,5].map(n=>source('o'+n));
 assert.throws(()=>actionRelationQuestions(goal,o,candidates(),five));
 const sharedSix=[1,2,3,4,5,6].map(n=>({observationId:'o'+n,imageSha256:hash('shared')}));
 assert.throws(()=>actionRelationQuestions(goal,{...o,id:'o6',imageSha256:hash('shared')},candidates(),sharedSix));
 const uniqueRecord=admit();uniqueRecord.source=source('o5');uniqueRecord.availability.evidence=source('o5');
 for(const [index,id] of Object.keys(uniqueRecord.candidates).entries())uniqueRecord.candidates[id].evidence=source('o'+(index+1));
 assert.throws(()=>actionRelationCriteria(criteria(),uniqueRecord,goal,o));
 const sharedRecord=admit();sharedRecord.source={observationId:'o6',imageSha256:hash('shared')};sharedRecord.availability.evidence={observationId:'o1',imageSha256:hash('shared')};
 for(const [index,id] of Object.keys(sharedRecord.candidates).entries())sharedRecord.candidates[id].evidence={observationId:'o'+(index+2),imageSha256:hash('shared')};
 assert.throws(()=>actionRelationCriteria(criteria(),sharedRecord,goal,{...o,id:'o6',imageSha256:hash('shared')}));
});

const currentPolicyQuestions=()=>actionRelationQuestions(goal,current(),candidates(),sources(),'current-candidate');
const currentPolicyResponse=(overrides:Record<string,string>={})=>response(overrides,currentPolicyQuestions());
const admitCurrentPolicy=(r=currentPolicyResponse())=>admitActionRelations(r,goal,current(),candidates(),sources(),'current-candidate');

// Baseline signatures were captured before introducing the optional policy.
test('omitted evidence policy preserves frozen legacy question record and criteria JSON exactly',()=>{
 assert.equal(hash(JSON.stringify(questions())),'65763e19ffe91f77ef165f03ac857d50166dc8e4cbe0c44c68b7655c50667934');
 assert.equal(hash(JSON.stringify(admit())),'63a177f046c62b351ef496fc0aa6848a78beeeaf05c948fc06488c2a3da918fd');
 assert.equal(hash(JSON.stringify(actionRelationCriteria(criteria(),admit(),goal,current()))),'e53be323d010e3c1457e48f9d7a5df2ccf66ccc57f64602d61f6c433faef440e');
 assert.ok(!('evidencePolicy' in admit()));
});

// Contract revision: two real partial phases exceeded context even after text compaction.
// Remove only per-candidate context questions/fields; global availability retains attached context.
// Old raw output must be replayed with its archived producer, not coerced into this contract.
test('current-candidate policy binds relation evidence to current while retaining global availability context at legacy question count',()=>{
 const q=currentPolicyQuestions();assert.deepEqual(Object.keys(q),Object.keys(questions()));
 for(const id of ['e1','e2','back','scroll_down']){
  assert.deepEqual(Object.keys(q['actionRelation_evidence_'+id].criteria),['o2','none']);
  assert.ok(!Object.hasOwn(q,'actionRelation_contextEvidence_'+id));
 }
 assert.deepEqual(Object.keys(q.actionRelation_availabilityEvidence.criteria),['o1','o2','none']);
 const record=admitCurrentPolicy();assert.equal(record.evidencePolicy,'current-candidate');
 for(const relation of Object.values(record.candidates)){assert.deepEqual(relation.evidence,source());assert.ok(!Object.hasOwn(relation,'contextEvidence'));}
 const annotated=actionRelationCriteria(criteria(),record,goal,current());
 assert.match(annotated.e1,/evidence=o2/);assert.match(annotated.e1,/availabilityEvidence=o2/);assert.match(annotated.e1,/current-candidate/);assert.ok(!JSON.stringify(annotated).includes('contextEvidence='));
 assert.deepEqual(Object.keys(annotated),Object.keys(criteria()));
});

test('historical relation evidence rejects even when the same local candidate ID existed before',()=>{
 assert.throws(()=>admitCurrentPolicy(currentPolicyResponse({actionRelation_evidence_e1:'o1'})));
 const forged=admitCurrentPolicy();forged.candidates.e1.evidence=source('o1');assert.throws(()=>actionRelationCriteria(criteria(),forged,goal,current()));
});

test('historical availability evidence never rescues missing current candidate evidence or invents candidate context',()=>{
 const record=admitCurrentPolicy(currentPolicyResponse({actionRelation_availabilityEvidence:'o1',actionRelation_evidence_e1:'none'}));
 assert.deepEqual(record.availability,{status:'blocked',evidence:source('o1')});
 assert.deepEqual(record.candidates.e1,{role:'unknown',verify:'unknown'});
 for(const relation of Object.values(record.candidates))assert.ok(!Object.hasOwn(relation,'contextEvidence'));
 assert.deepEqual(record.adjustments,[{field:'role_e1',from:'prerequisite',to:'unknown',reason:'NO_ADMITTED_EVIDENCE'},{field:'verify_e1',from:'availability-change',to:'unknown',reason:'NO_ADMITTED_EVIDENCE'}]);
 const annotated=actionRelationCriteria(criteria(),record,goal,current());assert.match(annotated.e1,/role=unknown/);assert.match(annotated.e1,/availabilityEvidence=o1/);assert.match(annotated.e1,/NO_ADMITTED_EVIDENCE/);assert.ok(!annotated.e1.includes('contextEvidence'));
});

test('policy admission requires requested evidence answers and rejects obsolete context questions unknown policies or unattached availability',()=>{
 const r=currentPolicyResponse();delete r.answers.actionRelation_evidence_e1;assert.throws(()=>admitCurrentPolicy(r));
 assert.throws(()=>admitCurrentPolicy(currentPolicyResponse({actionRelation_availabilityEvidence:'o9'})));
 for(const policy of ['legacy','current','',null,42]){
  assert.throws(()=>actionRelationQuestions(goal,current(),candidates(),sources(),policy as never));
  assert.throws(()=>admitActionRelations(response(),goal,current(),candidates(),sources(),policy as never));
 }
 for(const admitMode of [admit,admitCurrentPolicy]){
  const extra=admitMode===admit?response():currentPolicyResponse();extra.answers.actionRelation_contextEvidence_e1={choice:'o1',probabilities:{o1:.5,o2:.5,none:0}};assert.throws(()=>admitMode(extra));
 }
});

test('criteria rejects every obsolete candidate-context field including undefined and never copies global context to candidates',()=>{
 for(const make of [admit,admitCurrentPolicy])for(const context of [source('o1'),source('o3'),{...source(),imageSha256:hash('wrong')},{...source('o1'),imageSha256:'bad'},null,undefined]){
  const record=make();Object.defineProperty(record.candidates.e1,'contextEvidence',{value:context,enumerable:true});assert.throws(()=>actionRelationCriteria(criteria(),record,goal,current()));
 }
 const invalid=admitCurrentPolicy();invalid.evidencePolicy='unknown' as never;assert.throws(()=>actionRelationCriteria(criteria(),invalid,goal,current()));
});

test('current-policy questions avoid candidate labels text geometry and arbitrary response/source fields',()=>{
 const c=candidates(),o=current();
 for(const candidate of Object.values(c))Object.defineProperty(candidate,'label',{get(){throw new Error('LABEL_READ');}});
 Object.defineProperty(o,'visibleText',{get(){throw new Error('TEXT_READ');}});
 Object.defineProperty(o,'fixation',{get(){throw new Error('GEOMETRY_READ');}});
 const q=actionRelationQuestions(goal,o,c,sources(),'current-candidate');assert.ok(!JSON.stringify(q).includes('PRIVATE'));
 const r=currentPolicyResponse();(r.answers.actionRelation_evidence_e1 as any).explanation='RECORD_SECRET';
 const record=admitCurrentPolicy(r);(record.availability.evidence as any).text='RECORD_SECRET';
 assert.ok(!JSON.stringify(actionRelationCriteria(criteria(),record,goal,current())).includes('RECORD_SECRET'));
});

const jsonBytes=(value:unknown)=>Buffer.byteLength(JSON.stringify(value),'utf8');
function accountFixture(){
 const c=candidates();delete c.scroll_down;c.e3={action:{type:'click',elementId:'e3'},label:'PRIVATE LABEL THREE'};c.e4={action:{type:'click',elementId:'e4'},label:'PRIVATE LABEL FOUR'};
 return {c,o:{...current(),candidateIds:Object.keys(c)}};
}

test('same five-UI account fixture has17 questions like legacy and a tighter byte cap after removing redundant candidate context',()=>{
 const {c,o}=accountFixture();const literalGoal='予約図書「川沿いの暮らし」の受取館を中央図書館から東分館へ変更し、保存されたことを確認してください。';
 const legacy=actionRelationQuestions(literalGoal,o,c,sources()),compact=actionRelationQuestions(literalGoal,o,c,sources(),'current-candidate');
 assert.equal(Object.keys(compact).length,17);assert.equal(Object.keys(legacy).length,17);
 assert.ok(jsonBytes(compact)<=jsonBytes(legacy),`current ${jsonBytes(compact)} > legacy ${jsonBytes(legacy)}`);
 assert.ok(jsonBytes(compact)<=20000,`five UI question payload ${jsonBytes(compact)} exceeds fixed fixture cap`);
});

test('maximum24 UI keeps legacy74 questions and a lower explicit goal-dependent byte bound',()=>{
 const c=Object.fromEntries(Array.from({length:24},(_,i)=>['e'+(i+1),{action:{type:'click',elementId:'e'+(i+1)},label:'PRIVATE'}])) as BetaCandidates;
 const o={...current(),id:'o5',imageSha256:hash('o4'),candidateIds:Object.keys(c)},basis=[source('o1'),source('o2'),source('o3'),source('o4'),{observationId:'o5',imageSha256:hash('o4')}];
 const q=actionRelationQuestions(goal,o,c,basis,'current-candidate');assert.equal(Object.keys(q).length,74);assert.equal(Object.keys(actionRelationQuestions(goal,o,c,basis)).length,74);
 // Intentional contract change reduces a question per candidate; this bound tightens rather than hides a failure.
 assert.ok(jsonBytes(q)<=75000+74*Buffer.byteLength(JSON.stringify(goal),'utf8'),`maximum fixture payload ${jsonBytes(q)} exceeds size bound`);
 assert.ok(jsonBytes(q)<=jsonBytes(actionRelationQuestions(goal,o,c,basis)),'24 UI payload exceeds the same legacy fixture');
});

test('every compact independent question contains the full goal current identity and hypothesis boundaries',()=>{
 const q=currentPolicyQuestions();
 for(const [id,question] of Object.entries(q)){
  assert.ok(question.instructions.includes(JSON.stringify(goal)),id+' lost literal whole goal');
  assert.ok(question.instructions.includes(current().id),id+' lost current observation identity');
  assert.match(question.instructions,/hypothes/i);assert.match(question.instructions,/images/i);assert.match(question.instructions,/memory/i);assert.match(question.instructions,/persona/i);assert.match(question.instructions,/unknown/i);assert.match(question.instructions,/context/i);assert.match(question.instructions,/not.*guarantee|not.*proof/i);
  const candidateId=id.match(/^actionRelation_(?:role|evidence|verify)_(.+)$/)?.[1];
  if(candidateId)assert.ok(question.instructions.includes(candidateId),id+' depends on hidden question ID');
  assert.ok(Buffer.byteLength(question.instructions,'utf8')<=1000+Buffer.byteLength(JSON.stringify(goal),'utf8'),id+' instructions exceed concise per-question bound');
 }
});

test('revised contract preserves all remaining choice meanings metadata and corrections without candidate context fabrication',()=>{
 const q=currentPolicyQuestions(),record=admitCurrentPolicy(),expectedChoices=Object.fromEntries(Object.entries(questions()).map(([id,question])=>[id,{type:question.type,criteria:id.startsWith('actionRelation_evidence_')?Object.fromEntries(Object.entries(question.criteria).filter(([key])=>key===current().id||key==='none')):question.criteria}]));
 assert.deepEqual(Object.fromEntries(Object.entries(q).map(([id,question])=>[id,{type:question.type,criteria:question.criteria}])),expectedChoices);
 const {schemaVersion,kind,...legacy}=admit();assert.deepEqual(record,{schemaVersion,kind,evidencePolicy:'current-candidate',...legacy});
 const annotated=actionRelationCriteria(criteria(),record,goal,current());assert.equal(Object.keys(annotated).length,Object.keys(criteria()).length);assert.ok(!JSON.stringify(annotated).includes('contextEvidence'));
});
