import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import type {ChoiceAnswers,ChoiceQuestion} from '../jev/client.js';
import type {BetaCandidates,UserObservation} from '../jev/virtual-beta/contracts.js';
import type {ExperienceSource} from '../jev/virtual-beta/experience-contracts.js';
import type {GoalSearchEntry,GoalSearchMemory} from '../jev/virtual-beta/goal-search-contracts.js';
import {goalSearchQuestions,admitGoalSearch,rememberGoalSearch,goalSearchCriteria} from '../jev/virtual-beta/goal-search.js';

const interpretation='role-state-v2' as const,evidenceMode='source-grounded' as const;
const goal='通知を停止し、停止を確認したい。';
const cfg={enabled:true,capacity:8,interpretation,evidenceMode};
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const source=(n:number):ExperienceSource=>({observationId:`o${n}`,imageSha256:hash(`image-${n}`)});
function observation(n=5):UserObservation{return {id:`o${n}`,imageSha256:source(n).imageSha256,candidateIds:['e1','done'],fixation:{x:0,y:0},get visibleText():string[]{throw Error('DOM_READ');}};}
const candidates:BetaCandidates={e1:{action:{type:'click',elementId:'e1'},get label():string{throw Error('LABEL_READ');}},done:{action:{type:'done'},label:'done'}};
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
function fixture(n=1,assessment='observed'):GoalSearchEntry{return {kind:'model-goal-search-not-fact',interpretation,evidenceMode,source:source(n),goalSha256:hash(goal),scope:'delivered-current-view-only',requirements:[{id:'g1',text:'通知を停止し',role:'required',assessment},{id:'g2',text:'停止を確認したい',role:'required',assessment:'not_shown'}],finding:{kind:'navigation',candidateId:'e1'}} as GoalSearchEntry;}
const memory=(...entries:GoalSearchEntry[]):GoalSearchMemory=>({schemaVersion:1,entries});
const context=(prior?:GoalSearchMemory)=>({mode:evidenceMode,prior});
const questions=(prior?:GoalSearchMemory,n=5)=>goalSearchQuestions(goal,observation(n),candidates,[source(n)],interpretation,context(prior));
function answer(q:Record<string,ChoiceQuestion>,choices:Record<string,string>={}):ChoiceAnswers{return {model:'offline',answers:Object.fromEntries(Object.entries(q).map(([id,v])=>{const choice=choices[id]??(id==='goalSearch_finding'?'navigate_e1':id.startsWith('goalSearch_role_')?'required':'not_shown');return [id,{choice,probabilities:Object.fromEntries(Object.keys(v.criteria).map(k=>[k,Number(k===choice)]))}];}))};}
function admit(prior?:GoalSearchMemory,choice='not_shown',n=5):GoalSearchEntry{const q=questions(prior,n);return admitGoalSearch(answer(q,{goalSearch_image_check_0:choice}),goal,observation(n),candidates,[source(n)],interpretation,context(prior));}

test('source-grounded mode offers no contradiction with no retained observed evidence',()=>{
 for(const prior of [undefined,memory(fixture(1,'not_shown')),memory(fixture(1,'uncertain'))]){
  assert.deepEqual(Object.keys(questions(prior).goalSearch_image_check_0.criteria),['observed','not_shown','uncertain']);
  const e=admit(prior);assert.equal(e.evidenceMode,evidenceMode);assert.equal(e.requirements[0].assessment,'not_shown');assert.equal(e.requirements[0].contradicts,undefined);
 }
});
test('source-grounded choices cite only observed sources for that exact fragment',()=>{
 const prior=memory(fixture(1),fixture(2,'not_shown'),fixture(3));const q=questions(prior),before=clone(prior);
 assert.deepEqual(Object.keys(q.goalSearch_image_check_0.criteria),['observed','not_shown','contradicted_o1','contradicted_o3','uncertain']);assert.deepEqual(Object.keys(q.goalSearch_image_check_1.criteria),['observed','not_shown','uncertain']);assert.deepEqual(prior,before);
});
test('a grounded contradiction retains its exact prior source and role through admission, memory, criteria and serialization',()=>{
 const prior=memory(fixture(1)),q=questions(prior),a=answer(q,{goalSearch_image_check_0:'contradicted_o1'}),raw=clone(a),e=admitGoalSearch(a,goal,observation(),candidates,[source(5)],interpretation,context(prior));
 assert.deepEqual(e.requirements[0],{id:'g1',text:'通知を停止し',role:'required',assessment:'contradicted',contradicts:source(1)});assert.equal(e.evidenceMode,evidenceMode);assert.deepEqual(a,raw);
 const retained=rememberGoalSearch(prior,e,cfg);e.requirements[0].contradicts!.imageSha256=hash('mutation');assert.deepEqual(retained.entries[1].requirements[0].contradicts,source(1));
 const out=goalSearchCriteria({e1:'click',done:'done'},retained,goal,observation(),undefined);assert.match(out.e1,/evidenceMode=source-grounded/);assert.match(out.e1,/assessment=contradicted/);assert.ok(out.e1.includes('o1'));assert.ok(out.e1.includes(source(1).imageSha256));assert.deepEqual(Object.keys(out),['e1','done']);assert.deepEqual(out,goalSearchCriteria({e1:'click',done:'done'},clone(retained),goal,observation(),undefined));
});
test('an evicted observed source stays a sourced old judgment without being recreated in memory',()=>{
 const prior=memory(fixture(1)),e=admit(prior,'contradicted_o1',2),retained=rememberGoalSearch(prior,e,{...cfg,capacity:1});
 assert.deepEqual(retained.entries.map(v=>v.source.observationId),['o2']);assert.deepEqual(retained.entries[0].requirements[0].contradicts,source(1));assert.doesNotThrow(()=>goalSearchCriteria({e1:'click'},clone(retained),goal,observation(2),undefined));
 assert.deepEqual(Object.keys(questions(retained,3).goalSearch_image_check_0.criteria),['observed','not_shown','uncertain']);assert.throws(()=>admit(retained,'contradicted_o1',3));
});
for(const choice of ['observed','not_shown','uncertain'])test(`grounded ${choice} remains independently admissible with no history`,()=>{const e=admit(undefined,choice);assert.equal(e.requirements[0].assessment,choice);assert.equal(e.requirements[0].contradicts,undefined);assert.equal(e.evidenceMode,evidenceMode);});
for(const choice of ['contradicted','contradicted_o2','contradicted_o5','contradicted_o99','contradicted_o01'])test(`unsolicited ${choice} cannot become an admitted contradiction`,()=>{const prior=memory(fixture(1));assert.throws(()=>admit(prior,choice));});
for(const variant of ['wrong-goal','wrong-fragment','future','current','bad-source','nine-entries','wrong-schema','duplicate-source','wrong-mode','legacy-mode'] as const)test(`grounded prior rejects ${variant} before forming questions or admitting responses`,()=>{
 const prior=memory(fixture(1));if(variant==='wrong-goal')prior.entries[0].goalSha256=hash('other');if(variant==='wrong-fragment')prior.entries[0].requirements[0].text='other';if(variant==='future')prior.entries[0].source=source(6);if(variant==='current')prior.entries[0].source=source(5);if(variant==='bad-source')prior.entries[0].source.imageSha256='bad';if(variant==='nine-entries')prior.entries=Array.from({length:9},(_,i)=>fixture(i+1));if(variant==='wrong-schema')prior.schemaVersion=2 as any;if(variant==='duplicate-source')prior.entries.push(fixture(1));if(variant==='wrong-mode')prior.entries[0].evidenceMode='bad' as any;if(variant==='legacy-mode')delete prior.entries[0].evidenceMode;
 const valid=answer(questions());assert.throws(()=>questions(prior));assert.throws(()=>admitGoalSearch(valid,goal,observation(),candidates,[source(5)],interpretation,context(prior)));
});
for(const variant of ['missing-reference','noncontradicted-reference','bad-reference-id','bad-reference-hash','future-reference','current-reference','legacy-reference','invalid-mode','no-interpretation'] as const)test(`grounded retained memory rejects ${variant} without dropping evidence fields`,()=>{
 const e=fixture(3,'contradicted');e.requirements[0].contradicts=source(1);if(variant==='missing-reference')delete e.requirements[0].contradicts;if(variant==='noncontradicted-reference')e.requirements[0].assessment='observed';if(variant==='bad-reference-id')e.requirements[0].contradicts!.observationId='bad';if(variant==='bad-reference-hash')e.requirements[0].contradicts!.imageSha256='bad';if(variant==='future-reference')e.requirements[0].contradicts=source(4);if(variant==='current-reference')e.requirements[0].contradicts=source(3);if(variant==='legacy-reference')delete e.evidenceMode;if(variant==='invalid-mode')e.evidenceMode='bad' as any;if(variant==='no-interpretation')delete e.interpretation;
 assert.throws(()=>rememberGoalSearch(undefined,e,cfg));assert.throws(()=>goalSearchCriteria({e1:'click'},memory(e),goal,observation(),undefined));
});
test('grounded and original v2 memories cannot be mixed or silently converted by configuration',()=>{
 const old=fixture(1);delete old.evidenceMode;for(const entries of [[old,fixture(2)],[fixture(1),{...old,source:source(2)}]]){assert.throws(()=>goalSearchCriteria({e1:'click'},memory(...entries),goal,observation(),undefined));assert.throws(()=>rememberGoalSearch(memory(...entries),fixture(3),cfg));}
 assert.throws(()=>rememberGoalSearch(undefined,old,cfg));assert.throws(()=>rememberGoalSearch(undefined,fixture(),{enabled:true,capacity:8,interpretation}));assert.throws(()=>rememberGoalSearch(undefined,fixture(),{...cfg,interpretation:undefined}));assert.throws(()=>rememberGoalSearch(undefined,fixture(),{...cfg,evidenceMode:'bad'} as any));
});
for(const variant of ['NaN','negative','bad-total','missing-source-key','unsolicited-source-key'] as const)test(`grounded source answer rejects ${variant} distribution atomically`,()=>{
 const prior=memory(fixture(1)),q=questions(prior),a=answer(q,{goalSearch_image_check_0:'contradicted_o1'}),p=a.answers.goalSearch_image_check_0.probabilities;
 if(variant==='NaN')p.contradicted_o1=NaN;if(variant==='negative')p.not_shown=-1;if(variant==='bad-total')p.contradicted_o1=.2;if(variant==='missing-source-key')delete p.contradicted_o1;if(variant==='unsolicited-source-key')p.contradicted_o99=0;
 assert.throws(()=>admitGoalSearch(a,goal,observation(),candidates,[source(5)],interpretation,context(prior)));assert.deepEqual(admit(prior,'contradicted_o1').requirements[0].contradicts,source(1));
});
test('grounded mode requires v2 and rejects an unknown requested evidence mode',()=>{
 for(const roleMode of [undefined,'bad'] as const){assert.throws(()=>goalSearchQuestions(goal,observation(),candidates,[source(5)],roleMode as any,context()));}
 assert.throws(()=>goalSearchQuestions(goal,observation(),candidates,[source(5)],interpretation,{mode:'bad'} as any));
});
test('omitted or undefined evidence mode preserves original questions, copies and plain contradicted admission',()=>{
 for(const roleMode of [undefined,interpretation]){
  const q=goalSearchQuestions(goal,observation(),candidates,[source(5)],roleMode),inert={get prior():GoalSearchMemory{throw Error('UNREQUESTED_PRIOR_READ');}};
  assert.deepEqual(goalSearchQuestions(goal,observation(),candidates,[source(5)],roleMode,inert),q);
  const a=answer(q,{goalSearch_image_check_0:'contradicted',goalSearch_finding:roleMode?'navigate_e1':'target_e1'});if(!roleMode)for(const [id,v] of Object.entries(a.answers))if(id.startsWith('goalSearch_role_'))delete a.answers[id];
  const old=admitGoalSearch(a,goal,observation(),candidates,[source(5)],roleMode);assert.equal(old.requirements[0].assessment,'contradicted');assert.equal(old.evidenceMode,undefined);assert.deepEqual(admitGoalSearch(a,goal,observation(),candidates,[source(5)],roleMode,inert),old);
 }
});
test('source grounding changes only evidence choices while retaining role/navigation question contracts and offered action identities',()=>{
 const base=goalSearchQuestions(goal,observation(),candidates,[source(5)],interpretation),q=questions(memory(fixture(1)));
 assert.deepEqual(Object.keys(q),Object.keys(base));assert.deepEqual(q.goalSearch_role_0,base.goalSearch_role_0);assert.deepEqual(q.goalSearch_role_1,base.goalSearch_role_1);assert.deepEqual(q.goalSearch_finding,base.goalSearch_finding);assert.deepEqual(Object.keys(q.goalSearch_finding.criteria),['execute_e1','navigate_e1','prerequisite','guidance','no_target_in_view','uncertain']);
});
test('unattached observed history is exposed as fallible record with exact provenance rather than an attached current fact',()=>{
 const q=questions(memory(fixture(1))),text=q.goalSearch_image_check_0.criteria.contradicted_o1;
 assert.ok(text,'source-backed alternative missing');assert.ok(text.includes('o1'));assert.ok(text.includes(source(1).imageSha256));assert.match(text,/fallible|hypothesis|model record/i);assert.match(text,/not attached|unattached|not supplied|not asserted.*attached/i);
});

test('attached source identity cannot conflict with retained observed provenance',()=>{
 const prior=memory(fixture(1)),attached=[{...source(1),imageSha256:hash('wrong')},source(5)],q=questions(prior),a=answer(q,{goalSearch_image_check_0:'contradicted_o1'});
 assert.throws(()=>goalSearchQuestions(goal,observation(),candidates,attached,interpretation,context(prior)));assert.throws(()=>admitGoalSearch(a,goal,observation(),candidates,attached,interpretation,context(prior)));
});
for(const variant of ['retained-not-observed','retained-hash-conflict'] as const)test(`grounded memory rejects ${variant} reference while its source remains available`,()=>{
 const first=fixture(1,variant==='retained-not-observed'?'not_shown':'observed'),last=fixture(3,'contradicted');last.requirements[0].contradicts=source(1);if(variant==='retained-hash-conflict')last.requirements[0].contradicts!.imageSha256=hash('wrong');
 const prior=memory(first,last);assert.throws(()=>questions(prior));assert.throws(()=>rememberGoalSearch(memory(first),last,cfg));assert.throws(()=>goalSearchCriteria({e1:'click'},prior,goal,observation(),undefined));
});

test('storage cannot introduce a grounded contradiction without retained observed support',()=>{
 const entry=fixture(3,'contradicted');entry.requirements[0].contradicts=source(1);
 assert.throws(()=>rememberGoalSearch(undefined,entry,cfg));assert.throws(()=>rememberGoalSearch(memory(),entry,cfg));
});
test('storage cannot newly cite an observed source after it was evicted',()=>{
 const observed=memory(fixture(1)),second=admit(observed,'contradicted_o1',2),retained=rememberGoalSearch(observed,second,{...cfg,capacity:1}),third=fixture(3,'contradicted');third.requirements[0].contradicts=source(1);
 assert.throws(()=>rememberGoalSearch(retained,third,cfg));assert.deepEqual(retained.entries[0].requirements[0].contradicts,source(1));
});
test('storage checks every newly contradicted fragment against the retained observed fragment',()=>{
 const current=fixture(3,'contradicted');for(const r of current.requirements){r.assessment='contradicted';r.contradicts=source(1);}
 assert.throws(()=>rememberGoalSearch(memory(fixture(1)),current,cfg));
});
test('already stored evicted provenance survives appending a new noncontradicted observation',()=>{
 const observed=memory(fixture(1)),second=admit(observed,'contradicted_o1',2),retained=rememberGoalSearch(observed,second,{...cfg,capacity:1}),next=rememberGoalSearch(retained,fixture(3,'not_shown'),{...cfg,capacity:2});
 assert.deepEqual(next.entries.map(e=>e.source.observationId),['o2','o3']);assert.deepEqual(next.entries[0].requirements[0].contradicts,source(1));assert.equal(next.entries[1].requirements[0].contradicts,undefined);
});
