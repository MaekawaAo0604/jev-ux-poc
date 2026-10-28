import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assessmentQuestions,admitAssessment,carryDeliberation,recordAssessment,actionDeliberationInstructions,assessedCriteria} from '../jev/virtual-beta/deliberation.js';
import type {ChoiceAnswers} from '../jev/client.js';
import type {BetaCandidates,UserObservation,UserState} from '../jev/virtual-beta/contracts.js';
import type {AdmittedObservationSource,DeliberationAssessment,DeliberationMemory} from '../jev/virtual-beta/deliberation-contracts.js';
import {createUserState,updateUserState} from '../jev/virtual-beta/user-state.js';

const config={enabled:true,memoryCapacity:2};
const observation=(id:string):UserObservation=>({id,imageSha256:`image-${id}`,visibleText:[],fixation:{x:20,y:30},candidateIds:['a','b']});
const source=(id:string):AdmittedObservationSource=>({observationId:id,imageSha256:`image-${id}`});
const candidates:BetaCandidates={a:{action:{type:'click',elementId:'button-a'},label:'HIDDEN LABEL OR GEOMETRY'},b:{action:{type:'click',elementId:'button-b'},label:'another hidden label'},scroll:{action:{type:'scroll',direction:'down'},label:'scroll'},back:{action:{type:'back'},label:'back'},look:{action:{type:'look',point:{x:999,y:777}},label:'look'},done:{action:{type:'done'},label:'done'},wait:{action:{type:'wait'},label:'wait'}};
type RememberingState=UserState&{deliberation?:DeliberationMemory};
const state=(ids:string[]):RememberingState=>ids.reduce<UserState>((previous,id)=>updateUserState(previous,observation(id),{enabled:true,memoryCapacity:8}),createUserState(undefined,{x:20,y:30}));
function answers(overrides:Record<string,string>={},sources=[source('1')]):ChoiceAnswers {
 const questions=assessmentQuestions(candidates,sources);
 const defaults:Record<string,string>={knowledge:'insufficient',goal:'unsatisfied',goalEvidence:'1',effect_a:'conflicts',evidence_a:'1',effect_b:'advances',evidence_b:'1',effect_scroll:'unknown',evidence_scroll:'none',effect_back:'neutral',evidence_back:'1'};
 return {model:'fake-no-api',answers:Object.fromEntries(Object.entries(questions).map(([id,q])=>{
  const choice=overrides[id]??defaults[id];
  return [id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(key=>[key,key===choice?1:0]))}];
 }))};
}
const assessment=(id='1'):DeliberationAssessment=>admitAssessment(answers({},[source(id)]),candidates,observation(id),[source(id)]);

// Catches adding non-UI predictions, leaking labels/geometry, or omitting an offered control.
test('questions cover each UI action with fixed choices and admitted image identities only',()=>{
 const q=assessmentQuestions(candidates,[source('1')]);
 assert.deepEqual(Object.keys(q).sort(),['knowledge','goal','goalEvidence','effect_a','evidence_a','effect_b','evidence_b','effect_scroll','evidence_scroll','effect_back','evidence_back'].sort());
 assert.deepEqual(Object.keys(q.knowledge.criteria),['sufficient','insufficient','conflicting']);
 assert.deepEqual(Object.keys(q.goal.criteria),['satisfied','unsatisfied','uncertain']);
 assert.deepEqual(Object.keys(q.effect_a.criteria),['advances','neutral','conflicts','unknown']);
 assert.deepEqual(Object.keys(q.evidence_a.criteria),['1','none']);
 assert.ok(!JSON.stringify(q).includes('HIDDEN'));assert.ok(!JSON.stringify(q).includes('999'));
 assert.match(JSON.stringify(q),/side effects/i);assert.match(JSON.stringify(q),/constraints/i);
 assert.match(actionDeliberationInstructions,/fallible|hypothes/i);assert.match(actionDeliberationInstructions,/information/i);assert.match(actionDeliberationInstructions,/behavior/i);
});

// Catches treating unsupported confidence as grounded knowledge.
test('none evidence downgrades claimed goal status and effects with explicit adjustments',()=>{
 const actual=admitAssessment(answers({goal:'satisfied',goalEvidence:'none',evidence_a:'none',evidence_b:'none'}),candidates,observation('1'),[source('1')]);
 assert.equal(actual.kind,'model-assessment-not-fact');assert.equal(actual.goal,'uncertain');assert.equal(actual.goalEvidence,undefined);
 assert.deepEqual(actual.effects.a,{prediction:'unknown'});assert.deepEqual(actual.effects.b,{prediction:'unknown'});
 assert.deepEqual(actual.adjustments,[{field:'goal',from:'satisfied',to:'uncertain',reason:'NO_ADMITTED_EVIDENCE'},{field:'effect_a',from:'conflicts',to:'unknown',reason:'NO_ADMITTED_EVIDENCE'},{field:'effect_b',from:'advances',to:'unknown',reason:'NO_ADMITTED_EVIDENCE'}]);
 const unknown=admitAssessment(answers({goal:'uncertain',goalEvidence:'none',effect_a:'unknown',evidence_a:'none'}),candidates,observation('1'),[source('1')]);
 assert.deepEqual(unknown.adjustments,[]);
});

// Catches arbitrary response text, provider fields, and source mutation entering memory.
test('admission copies allowlisted categories and evidence without retaining response strings',()=>{
 const sources=[{...source('1'),hiddenDOM:'secret'}],response=answers();
 Object.assign(response.answers.effect_a,{reason:'secret'});Object.assign(response,{internalReasoning:'secret'});
 const actual=admitAssessment(response,candidates,{...observation('1'),hiddenDOM:'secret'} as UserObservation,sources);
 assert.deepEqual(actual.effects.a,{prediction:'conflicts',evidence:source('1')});assert.deepEqual(actual.goalEvidence,source('1'));
 assert.ok(!JSON.stringify(actual).includes('secret'));
 sources[0].imageSha256='changed';response.answers.effect_a.choice='advances';assert.equal(actual.effects.a.evidence!.imageSha256,'image-1');assert.equal(actual.effects.a.prediction,'conflicts');
});

// Catches validating only the selected field and overlooking malformed auxiliary distributions.
test('every assessment answer distribution is validated before admission',()=>{
 const invalid:Record<string,number>[]=[{sufficient:1},{sufficient:NaN,insufficient:0,conflicting:0},{sufficient:-0.1,insufficient:1.1,conflicting:0},{sufficient:0.1,insufficient:0.1,conflicting:0.1},{sufficient:1,insufficient:0,conflicting:0,extra:0}];
 for(const probabilities of invalid){const response=answers();response.answers.knowledge.probabilities=probabilities;assert.throws(()=>admitAssessment(response,candidates,observation('1'),[source('1')]));}
 for(const key of Object.keys(answers().answers)){
  const missing=answers();delete missing.answers[key];assert.throws(()=>admitAssessment(missing,candidates,observation('1'),[source('1')]));
  const malformed=answers();malformed.answers[key].probabilities={unknown:1};assert.throws(()=>admitAssessment(malformed,candidates,observation('1'),[source('1')]));
  const coerced=answers();coerced.answers[key].choice=[coerced.answers[key].choice] as never;assert.throws(()=>admitAssessment(coerced,candidates,observation('1'),[source('1')]));
 }
});

// Catches accepting stale citations, forged observation identity, and unrequested candidate answers.
test('unknown evidence and candidate IDs and unattached current observation fail closed',()=>{
 assert.throws(()=>admitAssessment(answers({evidence_a:'expired'}),candidates,observation('1'),[source('1')]));
 const extra=answers();extra.answers.effect_hidden={choice:'advances',probabilities:{advances:1}};
 assert.throws(()=>admitAssessment(extra,candidates,observation('1'),[source('1')]));
 assert.throws(()=>admitAssessment(answers(),candidates,observation('2'),[source('1')]));
 assert.throws(()=>admitAssessment(answers(),candidates,{...observation('1'),imageSha256:'forged'},[source('1')]));
});

// Catches unbounded assessment fan-out or unusable evidence IDs.
test('24 UI candidates are admitted but larger or unsupported sets and ambiguous sources fail closed',()=>{
 const many=Object.fromEntries(Array.from({length:24},(_,i)=>[`c${i}`,{action:{type:'back' as const},label:'back'}]));
 assert.equal(Object.keys(assessmentQuestions(many,[])).length,51);
 assert.throws(()=>assessmentQuestions({...many,c24:{action:{type:'back'},label:'back'}},[]));
 assert.throws(()=>assessmentQuestions({bad:{action:{type:'type'} as never,label:'unknown'}},[]));
 for(const sources of [[source('1'),source('1')],[source('1'),{...source('1'),imageSha256:'other'}],[source('none')],[{observationId:'',imageSha256:'x'}],[{observationId:'x',imageSha256:''}]])assert.throws(()=>assessmentQuestions(candidates,sources));
 assert.deepEqual(Object.keys(assessmentQuestions({},[]).goalEvidence.criteria),['none']);
});

// Catches retaining an assessment after either its own observation or a citation expires.
test('carry drops records whose own observation or any evidence is absent or has changed hash',()=>{
 const prior=state(['1','2']);
 const a=assessment();const linked={...assessment(),observationId:'2',imageSha256:'image-2'};
 prior.deliberation={schemaVersion:1,assessments:[a,linked]};
 assert.equal((carryDeliberation(prior,state(['1','2']),config) as RememberingState).deliberation!.assessments.length,2);
 assert.deepEqual((carryDeliberation(prior,state(['2']),config) as RememberingState).deliberation!.assessments,[]);
 const changed=state(['1','2']);changed.memory[0].imageSha256='changed';
 assert.deepEqual((carryDeliberation(prior,changed,config) as RememberingState).deliberation!.assessments,[]);
 const lastOnly=state([]);lastOnly.lastObservation=observation('1');
 assert.equal((carryDeliberation(prior,lastOnly,config) as RememberingState).deliberation!.assessments.length,1);
});

// Catches shared nested objects and state/record aliases crossing runs.
test('carry and record return independent state and assessment copies with bounded newest records',()=>{
 const previous=state(['1']);const first=recordAssessment(previous,assessment(),config) as RememberingState;
 const second=recordAssessment(first,{...assessment(),knowledge:'conflicting'},config) as RememberingState;
 const third=recordAssessment(second,{...assessment(),knowledge:'sufficient'},config) as RememberingState;
 assert.equal(previous.deliberation,undefined);assert.equal(third.deliberation!.assessments.length,2);assert.deepEqual(third.deliberation!.assessments.map(item=>item.knowledge),['conflicting','sufficient']);
 third.memory[0].visibleText.push('mutated');third.fixation.x=99;third.lastObservation!.candidateIds.push('hidden');third.deliberation!.assessments[0].effects.a.evidence!.imageSha256='changed';
 assert.deepEqual(second.memory[0].visibleText,[]);assert.equal(second.fixation.x,20);assert.deepEqual(second.lastObservation!.candidateIds,['a','b']);assert.equal(second.deliberation!.assessments[1].effects.a.evidence!.imageSha256,'image-1');
 const fresh=carryDeliberation(state([]),state(['1']),config) as RememberingState;
 assert.deepEqual(fresh.deliberation!.assessments,[]);
});

// Catches using stale external assessments to seed a fresh user's state.
test('record drops expired assessments and strips arbitrary fields from admitted records and state',()=>{
 const current=state(['2']);assert.deepEqual((recordAssessment(current,assessment(),config) as RememberingState).deliberation!.assessments,[]);
 const dirty=assessment();Object.assign(dirty,{reason:'secret'});Object.assign(dirty.effects.a,{hiddenDOM:'secret'});
 const actual=recordAssessment({...state(['1']),hiddenDOM:'secret'} as UserState,dirty,config);
 assert.ok(!JSON.stringify(actual).includes('secret'));
});

// Catches opt-out state carrying assessment data or invalid capacity silently truncating it.
test('disabled deliberation clears assessments without mutating either input and invalid configs fail',()=>{
 const previous=recordAssessment(state(['1']),assessment(),config) as RememberingState;
 for(const actual of [carryDeliberation(previous,previous,{enabled:false,memoryCapacity:2}),recordAssessment(previous,assessment(),{enabled:false,memoryCapacity:2})])assert.equal((actual as RememberingState).deliberation,undefined);
 assert.equal(previous.deliberation!.assessments.length,1);
 for(const memoryCapacity of [0,-1,1.5,9,NaN,Infinity])assert.throws(()=>carryDeliberation(previous,previous,{enabled:true,memoryCapacity}));
 assert.throws(()=>recordAssessment(previous,assessment(),{enabled:'yes' as never,memoryCapacity:2}));
});


// Catches hiding or reordering a control when a hypothesis predicts conflicts or unknown effects.
test('assessed criteria retain every key and original label while displaying fallible local predictions',()=>{
 const choices:BetaCandidates={b:candidates.b,a:candidates.a,done:candidates.done,look:candidates.look,reread:{action:{type:'reread'},label:'Read again'},wait:candidates.wait,back:candidates.back,scroll:candidates.scroll,leave:{action:{type:'abandon'},label:'Leave'}};
 const hypotheses=assessment(),before=structuredClone(choices),beforeAssessment=structuredClone(hypotheses);
 const criteria=assessedCriteria(choices,hypotheses);
 assert.deepEqual(Object.keys(criteria),Object.keys(choices));
 for(const [id,candidate] of Object.entries(choices)){
  assert.ok(criteria[id].startsWith(candidate.label),id);
  assert.match(criteria[id],/model hypothes/i,id);
  assert.match(criteria[id],/knowledge=insufficient/,id);
 }
 assert.match(criteria.a,/effect=conflicts/);assert.match(criteria.a,/evidence=1/);
 assert.match(criteria.b,/effect=advances/);assert.match(criteria.back,/effect=neutral/);
 assert.match(criteria.scroll,/effect=unknown/);assert.match(criteria.scroll,/evidence=none/);
 assert.match(criteria.scroll,/neither safety nor danger|does not establish safety or danger/i);
 assert.match(criteria.done,/goal=unsatisfied/);
 for(const id of ['look','reread','wait'])assert.match(criteria[id],/observation-only\/no UI changes/);
 assert.deepEqual(choices,before);assert.deepEqual(hypotheses,beforeAssessment);
 criteria.a='edited';assert.deepEqual(assessedCriteria(choices,hypotheses).a,assessedCriteria(before,beforeAssessment).a);
});

// Catches copying response explanations, image hashes, or unrelated action effects into labels.
test('assessed criteria admit only model categories and evidence source IDs alongside original labels',()=>{
 const hypotheses=assessment();Object.assign(hypotheses,{reason:'SECRET EXPLANATION'});Object.assign(hypotheses.effects.a,{reason:'SECRET EXPLANATION'});Object.assign(hypotheses.effects.a.evidence!,{reason:'SECRET EXPLANATION'});
 const criteria=assessedCriteria(candidates,hypotheses),serialized=JSON.stringify(criteria);
 assert.ok(!serialized.includes('SECRET EXPLANATION'));assert.ok(!serialized.includes('image-1'));
 assert.ok(!criteria.look.includes('effect='));assert.ok(!criteria.done.includes('effect='));
 const missing=structuredClone(hypotheses);delete missing.effects.a;
 assert.match(assessedCriteria(candidates,missing).a,/effect=unknown/);
 assert.match(assessedCriteria(candidates,missing).a,/evidence=none/);
});
