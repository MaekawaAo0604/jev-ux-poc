import {test} from 'node:test';
import assert from 'node:assert/strict';
import {copyDeferrals,updateDeferrals,deferralDecision} from '../jev/virtual-beta/deferral.js';
import type {DeferralConfig,DeferralEntry,DeferralMemory} from '../jev/virtual-beta/deferral-contracts.js';
import type {ExperienceMemory,ExperienceSource,ExperienceTransition} from '../jev/virtual-beta/experience-contracts.js';
import type {BetaCandidates,UserObservation} from '../jev/virtual-beta/contracts.js';
import type {DeliberationAssessment} from '../jev/virtual-beta/deliberation-contracts.js';
import {InvalidDistributionError,createSampler} from '../jev/virtual-beta/selection.js';

const config:DeferralConfig={enabled:true,capacity:8,weight:0.01,minAlternativeProbability:0.01};
const source=(id:string,hash=id):ExperienceSource=>({observationId:id,imageSha256:hash});
const observation=(id='o4',hash='A'):UserObservation=>({id,imageSha256:hash,visibleText:[],fixation:{x:20,y:30},candidateIds:['e4','e5','done','back','scroll_down','look_0','stuck']});
function assessment(id='o4',hash='A'):DeliberationAssessment{return {schemaVersion:1,kind:'model-assessment-not-fact',observationId:id,imageSha256:hash,knowledge:'insufficient',goal:'unsatisfied',effects:{e4:{prediction:'advances',evidence:source(id,hash)},e5:{prediction:'unknown'}},adjustments:[]};}
const candidates:BetaCandidates={e4:{action:{type:'click',elementId:'e4'},label:'Existing entry'},e5:{action:{type:'click',elementId:'e5'},label:'Another plausible entry'},done:{action:{type:'done'},label:'Done'},back:{action:{type:'back'},label:'Back'},scroll_down:{action:{type:'scroll',direction:'down'},label:'Scroll'},look_0:{action:{type:'look',point:{x:20,y:30}},label:'Look'},stuck:{action:{type:'stuck'},label:'Stuck'}};
const raw={e4:0.95,e5:0.02,done:0.01,back:0.01,scroll_down:0.01,look_0:0,stuck:0};
const entry=(hash='A',candidateId='e4',prefix='o'):DeferralEntry=>({imageSha256:hash,candidateId,fromObservationId:prefix+'1',toObservationId:prefix+'4',evidence:[source(prefix+'2','B'),source(prefix+'4',hash)]});
const memory=(entries:DeferralEntry[]=[entry()]):DeferralMemory=>({schemaVersion:1,entries});
function returnedRoute(hash='A',candidateId='e4',prefix='o'):ExperienceMemory{
 const transition=(from:string,to:string,fromHash:string,toHash:string,id:string,back=false):ExperienceTransition=>({intent:{source:source(from,fromHash),candidateId:id,action:back?{type:'back'}:{type:'click',elementId:id},prediction:'advances'},result:source(to,toHash),execution:'performed'});
 const transitions=[transition(prefix+'1',prefix+'2',hash,'B',candidateId),transition(prefix+'2',prefix+'3','B','C','e1'),transition(prefix+'3',prefix+'4','C',hash,'back',true)];
 transitions[0].judgment={kind:'model-assessment-not-fact',progress:'neutral',expectation:'not_supported',evidence:source(prefix+'2','B'),adjustments:[]};
 transitions[2].judgment={kind:'model-assessment-not-fact',progress:'neutral',expectation:'unknown',evidence:source(prefix+'4',hash),adjustments:[]};
 return {schemaVersion:1,transitions};
}

// Catches retaining aliases or audit fields in independent bounded heuristic memory.
test('copy deferrals admits only declared fields and independently bounds newest records',()=>{
 const previous=memory(Array.from({length:10},(_,i)=>entry('image-'+i,'e4','p'+i))),dirty=previous as DeferralMemory&{hiddenDOM:string};dirty.hiddenDOM='SECRET';Object.assign(dirty.entries[9],{label:'SECRET'});Object.assign(dirty.entries[9].evidence[0],{rawDOM:'SECRET'});
 const copied=copyDeferrals(dirty,{...config,capacity:2});assert.deepEqual(copied.entries.map(value=>value.imageSha256),['image-8','image-9']);assert.ok(!JSON.stringify(copied).includes('SECRET'));
 copied.entries[0].evidence[0].imageSha256='changed';assert.equal(previous.entries[8].evidence[0].imageSha256,'B');
 assert.deepEqual(copyDeferrals(undefined,config),{schemaVersion:1,entries:[]});assert.deepEqual(copyDeferrals(previous,{...config,enabled:false}),{schemaVersion:1,entries:[]});
 assert.equal(copyDeferrals(undefined,config).entries.length,0);
});

// Catches invalid heuristic values being silently clamped or malformed saved source identities being retained.
test('configuration and stored memory fail closed for invalid values',()=>{
 for(const capacity of [0,-1,1.5,9,NaN,Infinity])assert.throws(()=>copyDeferrals(undefined,{...config,capacity}));
 for(const weight of [0,1,-0.1,1.1,NaN,Infinity])assert.throws(()=>copyDeferrals(undefined,{...config,weight}));
 for(const minAlternativeProbability of [-0.1,1.1,NaN,Infinity])assert.throws(()=>copyDeferrals(undefined,{...config,minAlternativeProbability}));
 assert.throws(()=>copyDeferrals(undefined,{...config,enabled:'yes' as never}));
 assert.throws(()=>copyDeferrals({schemaVersion:0,entries:[]} as never,config));
 assert.throws(()=>copyDeferrals(memory([{...entry(),imageSha256:''}]),config));
 assert.throws(()=>copyDeferrals(memory([{...entry(),evidence:[source('none')]}]),config));
});

// Catches learning failure just from returning instead of using admitted non-advancement evidence.
test('a continuous performed-click return with grounded non-progress learns a copied image-local entry',()=>{
 const experience=returnedRoute(),current=observation(),judgment=assessment(),prior=memory([]),before=structuredClone(experience);
 const actual=updateDeferrals(prior,experience,current,judgment,config);assert.deepEqual(actual,memory());assert.deepEqual(prior.entries,[]);assert.deepEqual(experience,before);
 experience.transitions[0].judgment!.evidence!.imageSha256='changed';current.imageSha256='changed';judgment.goal='satisfied';assert.equal(actual.entries[0].imageSha256,'A');assert.equal(actual.entries[0].evidence[0].imageSha256,'B');
 const independent=copyDeferrals(actual,config);independent.entries[0].evidence[0].observationId='mutated';assert.equal(actual.entries[0].evidence[0].observationId,'o2');
});

// Catches refreshing duplicates in place or exceeding the declared independent deferral capacity.
test('learning replaces the same image/candidate at the newest position and caps independent deferrals',()=>{
 const previous=memory([entry('A','e4','old'),entry('OTHER','e5','other')]);
 const replaced=updateDeferrals(previous,returnedRoute('A','e4','new'),observation('new4'),assessment('new4'),{...config,capacity:2});
 assert.deepEqual(replaced.entries.map(value=>[value.imageSha256,value.candidateId,value.fromObservationId]),[['OTHER','e5','other1'],['A','e4','new1']]);assert.equal(previous.entries[0].fromObservationId,'old1');
 let retained=memory([]);
 for(let i=0;i<10;i++)retained=updateDeferrals(retained,returnedRoute('HOME-'+i,'e4','q'+i),observation('q'+i+'4','HOME-'+i),assessment('q'+i+'4','HOME-'+i),config);
 assert.deepEqual(retained.entries.map(value=>value.imageSha256),['HOME-2','HOME-3','HOME-4','HOME-5','HOME-6','HOME-7','HOME-8','HOME-9']);
});

// Catches a return, ungrounded unknown, ordinary transit, or unchanged/observation-only first event becoming deferral.
test('return alone, unknown or none judgments, transit and non-click origins never learn deferral',()=>{
 const variants:ExperienceMemory[]=[];
 const bare=returnedRoute();for(const transition of bare.transitions)delete transition.judgment;variants.push(bare);
 const none=returnedRoute();for(const transition of none.transitions)transition.judgment={kind:'model-assessment-not-fact',progress:'unknown',expectation:'unknown',adjustments:[]};variants.push(none);
 const unknown=returnedRoute();for(const transition of unknown.transitions)transition.judgment={kind:'model-assessment-not-fact',progress:'unknown',expectation:'unknown',evidence:structuredClone(transition.result),adjustments:[]};variants.push(unknown);
 const transit=returnedRoute();transit.transitions[2].result=source('o4','OTHER');transit.transitions[2].judgment!.evidence=source('o4','OTHER');variants.push(transit);
 const disconnected=returnedRoute();disconnected.transitions[1].intent.source=source('elsewhere','B');variants.push(disconnected);
 const unchanged=returnedRoute();unchanged.transitions[0].execution='unchanged';variants.push(unchanged);
 const look=returnedRoute();look.transitions[0].intent.candidateId='look_0';look.transitions[0].intent.action={type:'look',point:{x:1,y:2}};variants.push(look);
 const single=returnedRoute();single.transitions=[{intent:{source:source('o1','A'),candidateId:'e4',action:{type:'click',elementId:'e4'},prediction:'advances'},result:source('o4','A'),execution:'performed',judgment:{kind:'model-assessment-not-fact',progress:'neutral',expectation:'not_supported',evidence:source('o4','A'),adjustments:[]}}];variants.push(single);
 for(const variant of variants)assert.deepEqual(updateDeferrals(undefined,variant,observation(),assessment(),config),memory([]));
});

// Catches classifying productive/legitimate returns or a satisfied goal as a failed branch.
test('any grounded advancement or satisfied current goal prevents learning, without clearing prior hypotheses',()=>{
 const productive=returnedRoute();productive.transitions[1].judgment={kind:'model-assessment-not-fact',progress:'advances',expectation:'supported',evidence:source('o3','C'),adjustments:[]};
 assert.deepEqual(updateDeferrals(undefined,productive,observation(),assessment(),config),memory([]));
 const satisfied=assessment();satisfied.goal='satisfied';assert.deepEqual(updateDeferrals(undefined,returnedRoute(),observation(),satisfied,config),memory([]));
 assert.deepEqual(updateDeferrals(memory(),productive,observation(),assessment(),config),memory());
 const unsupported=returnedRoute();for(const transition of unsupported.transitions)delete transition.judgment;unsupported.transitions[1].judgment={kind:'model-assessment-not-fact',progress:'unknown',expectation:'not_supported',evidence:source('o3','C'),adjustments:[]};
 assert.deepEqual(updateDeferrals(undefined,unsupported,observation(),assessment(),config).entries[0].evidence,[source('o3','C')]);
});

// Catches applying a stale assessment to a different observation or page image.
test('learning and decision require current assessment identity and valid goal/effect categories',()=>{
 for(const evaluation of [assessment('stale'),assessment('o4','WRONG')]){
  assert.throws(()=>updateDeferrals(undefined,returnedRoute(),observation(),evaluation,config));
  assert.throws(()=>deferralDecision(memory(),observation(),candidates,evaluation,raw,config));
 }
 const invalid=assessment();invalid.goal='invented' as never;assert.throws(()=>updateDeferrals(undefined,returnedRoute(),observation(),invalid,config));
 const badEffect=assessment();badEffect.effects.e5.prediction='invented' as never;assert.throws(()=>deferralDecision(memory(),observation(),candidates,badEffect,raw,config));
});

// Catches suppressing an old entry without another model-plausible unheld click or altering non-click controls.
test('with an unheld plausible click only the matching deferred entry receives weight 0.01',()=>{
 const original=structuredClone(raw),decision=deferralDecision(memory(),observation(),candidates,assessment(),raw,config);
 assert.deepEqual(decision,{kind:'temporary-deferral',weights:{e4:0.01,e5:1,done:1,back:1,scroll_down:1,look_0:1,stuck:1},plausibleCandidates:['e4','e5'],deferredCandidates:['e4'],appliedCandidates:['e4'],reason:'DEFER_WITH_ALTERNATIVES'});
 assert.equal(raw.e4*decision.weights.e4,0.0095);assert.equal(raw.e5*decision.weights.e5,0.02);assert.equal(raw.done*decision.weights.done,0.01);assert.equal(raw.look_0*decision.weights.look_0,0);assert.deepEqual(raw,original);assert.deepEqual(Object.keys(decision.weights),Object.keys(candidates));
 decision.weights.e4=0.5;decision.plausibleCandidates.length=0;assert.equal(deferralDecision(memory(),observation(),candidates,assessment(),raw,config).weights.e4,0.01);
});

// Catches permanently forbidding revisits when every plausible entry has already been tried.
test('all plausible alternatives exhausted restores every weight and permits revisiting either entry',()=>{
 const remembered=memory([entry('A','e4'),entry('A','e5','p')]);
 const decision=deferralDecision(remembered,observation(),candidates,assessment(),raw,config);
 assert.equal(decision.reason,'ALTERNATIVES_EXHAUSTED');assert.deepEqual(decision.plausibleCandidates,['e4','e5']);assert.deepEqual(decision.deferredCandidates,['e4','e5']);assert.deepEqual(decision.appliedCandidates,[]);assert.ok(Object.values(decision.weights).every(weight=>weight===1));
});

// Catches treating a zero probability, explicitly conflicting effect, or subthreshold entry as an alternative.
test('zero, conflicting or below-threshold alternatives cannot trigger deferral',()=>{
 const onlyDeferred={...raw,e4:1,e5:0,done:0,back:0,scroll_down:0};
 const zero=deferralDecision(memory(),observation(),candidates,assessment(),onlyDeferred,{...config,minAlternativeProbability:0});assert.equal(zero.reason,'ALTERNATIVES_EXHAUSTED');assert.deepEqual(zero.plausibleCandidates,['e4']);assert.equal(zero.weights.e4,1);
 const conflicting=assessment();conflicting.effects.e5.prediction='conflicts';const blocked=deferralDecision(memory(),observation(),candidates,conflicting,raw,config);assert.equal(blocked.reason,'ALTERNATIVES_EXHAUSTED');assert.equal(blocked.weights.e4,1);
 const threshold=deferralDecision(memory(),observation(),candidates,assessment(),raw,{...config,minAlternativeProbability:0.03});assert.equal(threshold.reason,'ALTERNATIVES_EXHAUSTED');assert.equal(threshold.weights.e4,1);
 const nonClickOnly={...raw,e4:0,e5:0,done:1,back:0,scroll_down:0};const absent=deferralDecision(memory(),observation(),candidates,assessment(),nonClickOnly,config);assert.equal(absent.reason,'NO_PLAUSIBLE_ALTERNATIVE');assert.deepEqual(absent.plausibleCandidates,[]);assert.equal(absent.weights.e4,1);
});

// Catches comparing raw rather than validated normalized probabilities near the threshold.
test('plausibility uses normalized probability and accepts missing/unknown effects',()=>{
 const nearThreshold={...raw,e4:0.98,e5:0.0099,done:0.0001,back:0,scroll_down:0};const evaluation=assessment();delete evaluation.effects.e5;
 const decision=deferralDecision(memory(),observation(),candidates,evaluation,nearThreshold,config);assert.deepEqual(decision.plausibleCandidates,['e4','e5']);assert.equal(decision.reason,'DEFER_WITH_ALTERNATIVES');assert.equal(decision.weights.e4,0.01);
});

// Catches leaking a recycled element ID across images or applying a historical entry to non-click controls.
test('a different image, absent ID or non-click ID never inherits a deferred click weight',()=>{
 const newPage=deferralDecision(memory(),observation('new','NEW'),candidates,assessment('new','NEW'),raw,config);assert.equal(newPage.reason,'NO_DEFERRED_CANDIDATE');assert.deepEqual(newPage.deferredCandidates,[]);assert.equal(newPage.weights.e4,1);
 const other=deferralDecision(memory([entry('A','absent')]),observation(),candidates,assessment(),raw,config);assert.equal(other.reason,'NO_DEFERRED_CANDIDATE');
 const terminal=deferralDecision(memory([entry('A','done')]),observation(),candidates,assessment(),raw,config);assert.equal(terminal.weights.done,1);assert.deepEqual(terminal.appliedCandidates,[]);
 const empty=deferralDecision(undefined,observation(),candidates,assessment(),raw,config);assert.equal(empty.reason,'NO_DEFERRED_CANDIDATE');
 const disabled=deferralDecision(memory(),observation(),candidates,assessment(),raw,{...config,enabled:false});assert.ok(Object.values(disabled.weights).every(weight=>weight===1));assert.deepEqual(disabled.appliedCandidates,[]);
});

// Catches retaining hidden labels/audit text or reading labels when evaluating the explicit heuristic.
test('labels, DOM and audit-only fields are never consulted or retained',()=>{
 const offered=structuredClone(candidates);for(const candidate of Object.values(offered))Object.defineProperty(candidate,'label',{get(){throw new Error('LABEL_MUST_NOT_BE_READ');}});
 const experience=returnedRoute();Object.assign(experience.transitions[0],{hiddenDOM:'SECRET'});Object.assign(experience.transitions[0].intent.action,{label:'SECRET'});
 const learned=updateDeferrals(undefined,experience,{...observation(),visibleText:['SECRET']} as UserObservation,{...assessment(),rawDOM:'SECRET'} as DeliberationAssessment,config);
 const decision=deferralDecision(learned,observation(),offered,assessment(),raw,config);assert.equal(decision.weights.e4,0.01);assert.ok(!JSON.stringify({learned,decision}).includes('SECRET'));
});

// Catches invalid distributions being silently accepted or padded with probability mass.
test('raw distributions require exact candidates, finite probabilities and normalized tolerance',()=>{
 const invalid:Record<string,number>[]=[{},Object.fromEntries(Object.keys(raw).map(key=>[key,0])),{...raw,e4:NaN},{...raw,e4:Infinity},{...raw,e4:-0.1},{...raw,e4:1.01},{...raw,e4:0.5},{...raw,extra:0}];const missing={...raw};delete (missing as Partial<typeof raw>).e5;invalid.push(missing);
 for(const distribution of invalid)assert.throws(()=>deferralDecision(memory(),observation(),candidates,assessment(),distribution,config),InvalidDistributionError);
 assert.throws(()=>deferralDecision(memory(),observation(),{},assessment(),{},config),InvalidDistributionError);
});

// Catches omitting a supported non-advancement category or using an ungrounded/forged record as proof.
test('each admitted neutral, conflict or unsupported-expectation judgment can ground the hypothesis',()=>{
 const cases:NonNullable<ExperienceTransition['judgment']>[]=[{kind:'model-assessment-not-fact',progress:'neutral',expectation:'unknown',evidence:source('o3','C'),adjustments:[]},{kind:'model-assessment-not-fact',progress:'conflicts',expectation:'unknown',evidence:source('o3','C'),adjustments:[]},{kind:'model-assessment-not-fact',progress:'unknown',expectation:'not_supported',evidence:source('o3','C'),adjustments:[]}];
 for(const judgment of cases){const route=returnedRoute();for(const transition of route.transitions)delete transition.judgment;route.transitions[1].judgment=judgment;assert.deepEqual(updateDeferrals(undefined,route,observation(),assessment(),config).entries[0].evidence,[source('o3','C')]);}
 const forged=returnedRoute();forged.transitions[0].judgment!.evidence=source('future','B');assert.throws(()=>updateDeferrals(undefined,forged,observation(),assessment(),config));
});

// Catches corrupted saved hypotheses losing their required grounding through an empty or repeated citation list.
test('stored deferral entries reject empty or duplicate evidence instead of silently repairing it',()=>{
 for(const evidence of [[],[source('o2','B'),source('o2','B')]]){
  const corrupt=memory([{...entry(),evidence}]);assert.throws(()=>copyDeferrals(corrupt,config));
  assert.throws(()=>deferralDecision(corrupt,observation(),candidates,assessment(),raw,config));
 }
});

// Catches a threshold changing solely because policy normalization sums keys in a different order from the sampler.
test('plausibility shares the sampler sorted-sum normalization at a floating point threshold',()=>{
 const offered:BetaCandidates={z:{action:{type:'click',elementId:'z'},label:'z'},b:{action:{type:'click',elementId:'b'},label:'b'},c:{action:{type:'click',elementId:'c'},label:'c'},a:{action:{type:'click',elementId:'a'},label:'a'}};
 const distribution={z:0.1,b:0.2,c:0.3,a:0.4},evaluation=assessment();evaluation.effects={};
 const sampler=createSampler({mode:'argmax',seed:1}).select('b',distribution,offered);
 assert.equal(sampler.normalization.rawTotal,1.0000000000000002);assert.ok(sampler.normalized.z<0.1);
 const decision=deferralDecision(memory([entry('A','b')]),{...observation(),candidateIds:Object.keys(offered)},offered,evaluation,distribution,{...config,minAlternativeProbability:0.1});
 assert.deepEqual(decision.plausibleCandidates,['b','c','a']);assert.deepEqual(Object.keys(decision.weights),['z','b','c','a']);assert.equal(decision.weights.b,0.01);
});
