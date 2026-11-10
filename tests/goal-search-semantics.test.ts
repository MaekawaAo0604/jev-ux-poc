import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import type {ChoiceAnswers,ChoiceQuestion} from '../jev/client.js';
import type {BetaCandidates,UserObservation} from '../jev/virtual-beta/contracts.js';
import type {ExperienceMemory,ExperienceSource,ExperienceTransition} from '../jev/virtual-beta/experience-contracts.js';
import type {GoalSearchConfig,GoalSearchEntry,GoalSearchMemory} from '../jev/virtual-beta/goal-search-contracts.js';
import {goalSearchQuestions,admitGoalSearch,rememberGoalSearch,goalSearchCriteria} from '../jev/virtual-beta/goal-search.js';

const mode='role-state-v2' as const;
const goal='メール通知を停止し、停止したことを確認したい。';
const cfg={enabled:true,capacity:8,interpretation:mode};
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const src=(n:number,key=`image-${n}`):ExperienceSource=>({observationId:`o${n}`,imageSha256:hash(key)});
function observation(n=5,key=`image-${n}`):UserObservation{return {id:`o${n}`,imageSha256:hash(key),candidateIds:['e1','e2','back','done'],fixation:{x:0,y:0},get visibleText():string[]{throw Error('DOM_READ');}};}
const candidates:BetaCandidates={e1:{action:{type:'click',elementId:'e1'},get label():string{throw Error('LABEL_READ');}},e2:{action:{type:'scroll',direction:'down'},get label():string{throw Error('LABEL_READ');}},back:{action:{type:'back'},label:'back'},done:{action:{type:'done'},label:'done'}};
// The implementation must retain these independently chosen roles and states, not infer one from another.
const questions=(n=5,g=goal,key=`image-${n}`)=>goalSearchQuestions(g,observation(n,key),candidates,[src(n,key)],mode);
function answer(q:Record<string,ChoiceQuestion>,choices:Record<string,string>={}):ChoiceAnswers{return {model:'offline',answers:Object.fromEntries(Object.entries(q).map(([id,v])=>{const choice=choices[id]??(id==='goalSearch_finding'?'uncertain':id.startsWith('goalSearch_role_')?'required':'not_shown');return [id,{choice,probabilities:Object.fromEntries(Object.keys(v.criteria).map(k=>[k,Number(k===choice)]))}];}))};}
function entry(n=5,finding='uncertain',choices:Record<string,string>={},g=goal,key=`image-${n}`):GoalSearchEntry{const q=questions(n,g,key);return admitGoalSearch(answer(q,{...choices,goalSearch_finding:finding}),g,observation(n,key),candidates,[src(n,key)],mode);}
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
function fixture(n=5):GoalSearchEntry{return {kind:'model-goal-search-not-fact',interpretation:mode,source:src(n),goalSha256:hash(goal),scope:'delivered-current-view-only',requirements:[{id:'g1',text:'メール通知を停止し',role:'required',assessment:'not_shown'},{id:'g2',text:'停止したことを確認したい',role:'required',assessment:'not_shown'}],finding:{kind:'uncertain'}};}
function transition():ExperienceTransition{return {intent:{source:src(1,'same'),candidateId:'e1',action:{type:'click',elementId:'e1'},prediction:'unknown'},result:src(2),execution:'performed',judgment:{kind:'model-assessment-not-fact',progress:'unknown',expectation:'unknown',adjustments:[]}};}

test('v2 independently stores required conjunction actions that are not visible',()=>{
 const q=questions(),a=answer(q),before=clone(a),e=admitGoalSearch(a,goal,observation(),candidates,[src(5)],mode);
 assert.equal(e.interpretation,mode);assert.deepEqual(e.requirements,[{id:'g1',text:'メール通知を停止し',role:'required',assessment:'not_shown'},{id:'g2',text:'停止したことを確認したい',role:'required',assessment:'not_shown'}]);assert.deepEqual(a,before);
 const m=rememberGoalSearch(undefined,e,cfg),out=goalSearchCriteria({e1:'click',back:'back',done:'done'},m,goal,observation(),undefined);
 assert.deepEqual(Object.keys(out),['e1','back','done']);for(const v of Object.values(out)){assert.match(v,/interpretation=role-state-v2/);assert.match(v,/g1.*role=required assessment=not_shown/);assert.match(v,/g2.*role=required assessment=not_shown/);}
});
for(const role of ['context','uncertain'] as const)test(`v2 preserves a model's ${role} role instead of forcing required`,()=>{
 const e=entry(5,'uncertain',{'goalSearch_role_0':role,'goalSearch_image_check_0':'observed'}),m=rememberGoalSearch(undefined,e,cfg);
 assert.equal(m.entries[0].requirements[0].role,role);assert.equal(m.entries[0].requirements[0].assessment,'observed');assert.match(goalSearchCriteria({e1:'click'},m,goal,observation(),undefined).e1,new RegExp(`role=${role} assessment=observed`));
});
for(const [choice,expected] of [['execute_e1',{kind:'target',candidateId:'e1'}],['navigate_e1',{kind:'navigation',candidateId:'e1'}],['prerequisite',{kind:'prerequisite'}],['guidance',{kind:'guidance'}],['no_target_in_view',{kind:'no-target-in-view'}],['uncertain',{kind:'uncertain'}]] as const)test(`v2 admits ${choice} distinctly and replays its candidate annotation`,()=>{
 const q=questions(),a=answer(q,{goalSearch_finding:choice}),before=clone(a),e=admitGoalSearch(a,goal,observation(),candidates,[src(5)],mode),m=rememberGoalSearch(undefined,e,cfg);
 assert.deepEqual(e.finding,expected);assert.deepEqual(a,before);const label=goalSearchCriteria({e1:'click'},clone(m),goal,observation(),undefined).e1;
 assert.match(label,new RegExp(`finding=${expected.kind}`));if(choice.startsWith('navigate')){assert.match(label,/navigation=e1/);assert.doesNotMatch(label,/target=e1/);}if(choice.startsWith('execute'))assert.match(label,/target=e1/);
});
test('v2 output survives serialization, remains detached and bounded, and allows reconsidered roles',()=>{
 const first=fixture(1),m=rememberGoalSearch(undefined,first,{...cfg,capacity:2});first.requirements[0].role='context';assert.equal(m.entries[0].requirements[0].role,'required');
 const second=fixture(2);second.requirements[0].role='uncertain';const n=rememberGoalSearch(clone(m),second,{...cfg,capacity:2});second.requirements[0].assessment='contradicted';assert.equal(n.entries[1].requirements[0].role,'uncertain');assert.equal(n.entries[1].requirements[0].assessment,'not_shown');
 const bounded=rememberGoalSearch(n,fixture(3),{...cfg,capacity:2});assert.deepEqual(bounded.entries.map(e=>e.source.observationId),['o2','o3']);assert.equal(bounded.entries[0].interpretation,mode);assert.equal(bounded.entries[0].requirements[0].role,'uncertain');
 assert.deepEqual(goalSearchCriteria({e1:'click'},bounded,goal,observation(3),undefined),goalSearchCriteria({e1:'click'},clone(bounded),goal,observation(3),undefined));
});
test('v2 historical navigation and current execution retain roles without rewriting candidate membership',()=>{
 const result=entry(2,'navigate_e1',{'goalSearch_role_0':'context'}),now=entry(5,'execute_e1',{},goal,'same'),memory=rememberGoalSearch(rememberGoalSearch(undefined,result,cfg),now,cfg),experience:ExperienceMemory={schemaVersion:1,transitions:[transition()]},criteria={e1:'click',done:'done'},before=clone(memory);
 const out=goalSearchCriteria(criteria,memory,goal,observation(5,'same'),experience);assert.deepEqual(Object.keys(out),['e1','done']);assert.match(out.e1,/current.*finding=target; target=e1/);assert.match(out.e1,/historical.*finding=navigation; navigation=e1/);assert.match(out.e1,/historical.*role=context assessment=not_shown/);assert.match(out.e1,/revisit/);assert.doesNotMatch(out.done,/result=o2/);assert.deepEqual(memory,before);
 assert.deepEqual(out,goalSearchCriteria(criteria,clone(memory),goal,observation(5,'same'),clone(experience)));
});
for(const variant of ['missing-role','invalid-role','context-evidence','invalid-mode','legacy-role','legacy-navigation','missing-navigation-id','bad-navigation-id','non-navigation-id'] as const)test(`v2 memory rejects ${variant} instead of silently dropping semantic data`,()=>{
 const e=fixture();if(variant==='missing-role')delete e.requirements[0].role;if(variant==='invalid-role')e.requirements[0].role='optional' as any;if(variant==='context-evidence')e.requirements[0].assessment='context';if(variant==='invalid-mode')e.interpretation='v3' as any;if(variant==='legacy-role')delete e.interpretation;if(variant==='legacy-navigation'){delete e.interpretation;for(const r of e.requirements)delete r.role;e.finding={kind:'navigation',candidateId:'e1'};}if(variant==='missing-navigation-id')e.finding={kind:'navigation'};if(variant==='bad-navigation-id')e.finding={kind:'navigation',candidateId:'done'};if(variant==='non-navigation-id')e.finding={kind:'guidance',candidateId:'e1'};
 assert.throws(()=>rememberGoalSearch(undefined,e,cfg));assert.throws(()=>goalSearchCriteria({e1:'click'},{schemaVersion:1,entries:[e]},goal,observation(),undefined));
});
test('v2 memory and configured mode reject mixed legacy/v2 entries in either order',()=>{
 const legacy=(n:number)=>{const e=fixture(n);delete e.interpretation;for(const r of e.requirements)delete r.role;return e;};
 for(const entries of [[legacy(1),fixture(2)],[fixture(1),legacy(2)]]){const m:GoalSearchMemory={schemaVersion:1,entries};assert.throws(()=>goalSearchCriteria({e1:'click'},m,goal,observation(),undefined));assert.throws(()=>rememberGoalSearch(m,fixture(3),cfg));}
 assert.throws(()=>rememberGoalSearch(undefined,legacy(1),cfg));assert.throws(()=>rememberGoalSearch(undefined,fixture(1),{enabled:true,capacity:8}));assert.throws(()=>rememberGoalSearch(undefined,fixture(1),{...cfg,interpretation:'bad'} as any));
});
for(const variant of ['missing-role-answer','extra-role-answer','invalid-role','context-evidence','legacy-target','scroll-navigation','unknown-navigation','missing-role-probability','NaN','negative','bad-total','extra-probability'] as const)test(`v2 admission rejects ${variant} atomically`,()=>{
 const q=questions(),a=answer(q);if(variant==='missing-role-answer')delete a.answers.goalSearch_role_0;if(variant==='extra-role-answer')a.answers.goalSearch_role_9={choice:'required',probabilities:{required:1}};if(variant==='invalid-role')a.answers.goalSearch_role_0={choice:'optional',probabilities:{optional:1}};if(variant==='context-evidence')a.answers.goalSearch_image_check_0={choice:'context',probabilities:{context:1}};if(variant==='legacy-target')a.answers.goalSearch_finding.choice='target_e1';if(variant==='scroll-navigation')a.answers.goalSearch_finding.choice='navigate_e2';if(variant==='unknown-navigation')a.answers.goalSearch_finding.choice='navigate_e99';if(variant==='missing-role-probability'&&a.answers.goalSearch_role_0)delete a.answers.goalSearch_role_0.probabilities.context;if(variant==='NaN'&&a.answers.goalSearch_role_0)a.answers.goalSearch_role_0.probabilities.required=NaN;if(variant==='negative'&&a.answers.goalSearch_role_0)a.answers.goalSearch_role_0.probabilities.required=-1;if(variant==='bad-total'&&a.answers.goalSearch_role_0)a.answers.goalSearch_role_0.probabilities.required=.3;if(variant==='extra-probability'&&a.answers.goalSearch_role_0)a.answers.goalSearch_role_0.probabilities.extra=0;
 assert.throws(()=>admitGoalSearch(a,goal,observation(),candidates,[src(5)],mode));assert.equal(entry().finding.kind,'uncertain');
});
test('invalid requested interpretation cannot fall back to legacy questions or admission',()=>{
 assert.throws(()=>goalSearchQuestions(goal,observation(),candidates,[src(5)],'bad' as any));const q=goalSearchQuestions(goal,observation(),candidates,[src(5)]);assert.throws(()=>admitGoalSearch(answer(q),goal,observation(),candidates,[src(5)],'bad' as any));
});
test('v2 has separate role and evidence questions and only offered click execute/navigation alternatives',()=>{
 const q=questions();assert.deepEqual(Object.keys(q),['goalSearch_role_0','goalSearch_image_check_0','goalSearch_role_1','goalSearch_image_check_1','goalSearch_finding']);assert.deepEqual(Object.keys(q.goalSearch_role_0.criteria),['required','context','uncertain']);assert.deepEqual(Object.keys(q.goalSearch_image_check_0.criteria),['observed','not_shown','contradicted','uncertain']);assert.deepEqual(Object.keys(q.goalSearch_finding.criteria),['execute_e1','navigate_e1','prerequisite','guidance','no_target_in_view','uncertain']);
 q.goalSearch_role_0.criteria.required='mutated';q.goalSearch_image_check_0.criteria.observed='mutated';assert.notEqual(questions().goalSearch_role_0.criteria.required,'mutated');assert.notEqual(questions().goalSearch_image_check_0.criteria.observed,'mutated');
});
