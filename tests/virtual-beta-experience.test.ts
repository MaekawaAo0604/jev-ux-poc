import {test} from 'node:test';
import assert from 'node:assert/strict';
import {beginExperience,arriveExperience,experienceQuestions,admitExperience,experienceContext,experienceCriteria,experienceInstructions} from '../jev/virtual-beta/experience.js';
import type {ExperienceConfig,ExperienceMemory,ExperienceSource,ExperienceTransition} from '../jev/virtual-beta/experience-contracts.js';
import type {BetaAction,UserObservation} from '../jev/virtual-beta/contracts.js';
import type {DeliberationAssessment} from '../jev/virtual-beta/deliberation-contracts.js';
import type {ChoiceAnswers} from '../jev/client.js';

const config={enabled:true,capacity:3};
const source=(id:string,hash=id):ExperienceSource=>({observationId:id,imageSha256:hash});
const observation=(id:string,hash=id):UserObservation=>({id,imageSha256:hash,visibleText:[],fixation:{x:20,y:30},candidateIds:['e1','e2','back','look_0','done','wait','scroll_down']});
function assessment(id='1',hash=id):DeliberationAssessment{return {schemaVersion:1,kind:'model-assessment-not-fact',observationId:id,imageSha256:hash,knowledge:'insufficient',goal:'uncertain',effects:{e1:{prediction:'advances',evidence:source(id,hash)}},adjustments:[]};}
function episode(from='1',to='2',fromHash=from,toHash=to):ExperienceTransition{return {intent:{source:source(from,fromHash),candidateId:'e1',action:{type:'click',elementId:'e1'},prediction:'advances'},result:source(to,toHash),execution:'performed'};}
const memory=(transitions:ExperienceTransition[]=[episode()]):ExperienceMemory=>({schemaVersion:1,transitions});
function answer(choices:Record<string,string>={}):ChoiceAnswers{
 const selected={experienceProgress:'neutral',experienceExpectation:'not_supported',experienceEvidence:'2',...choices};
 const keys:Record<string,string[]>={experienceProgress:['advances','neutral','conflicts','unknown'],experienceExpectation:['supported','not_supported','unknown'],experienceEvidence:['2','none']};
 return {model:'LOCAL_NO_API',answers:Object.fromEntries(Object.entries(keys).map(([id,options])=>[id,{choice:selected[id as keyof typeof selected],probabilities:Object.fromEntries(options.map(option=>[option,option===selected[id as keyof typeof selected]?1:0]))}]))};
}

// Catches using a stale evaluation as a prediction for a new page or an unoffered control.
test('begin binds a copied intent to a currently offered candidate and matching assessment only',()=>{
 const obs=observation('1'),action={type:'click' as const,elementId:'e1',hiddenDOM:'SECRET'},evaluation=assessment();
 const intent=beginExperience({...obs,hiddenDOM:'SECRET'} as UserObservation,'e1',action,evaluation);
 assert.deepEqual(intent,{source:source('1'),candidateId:'e1',action:{type:'click',elementId:'e1'},prediction:'advances'});
 obs.imageSha256='mutated';action.elementId='e2';evaluation.effects.e1.prediction='conflicts';assert.equal(intent.source.imageSha256,'1');assert.equal(intent.action.type==='click'&&intent.action.elementId,'e1');assert.equal(intent.prediction,'advances');
 assert.equal(beginExperience(observation('1'),'e1',{type:'click',elementId:'e1'}).prediction,'unknown');
 assert.equal(beginExperience(observation('1'),'e1',{type:'click',elementId:'e1'},assessment('stale')).prediction,'unknown');
 assert.equal(beginExperience(observation('1'),'e1',{type:'click',elementId:'e1'},assessment('1','other-image')).prediction,'unknown');
 assert.throws(()=>beginExperience(observation('1'),'unoffered',{type:'back'}));
 assert.throws(()=>beginExperience(observation('1'),'e1',{type:'click',elementId:'e2'}));
 assert.ok(!JSON.stringify(intent).includes('SECRET'));
});

// Catches shallow copying look points or retaining runtime-only action/audit properties.
test('begin allowlists every supported action and rejects malformed runtime actions',()=>{
 const point={x:12,y:34,hiddenDOM:'SECRET'};
 const intent=beginExperience(observation('1'),'look_0',{type:'look',point,hiddenDOM:'SECRET'} as BetaAction);
 point.x=99;assert.deepEqual(intent.action,{type:'look',point:{x:12,y:34}});
 for(const action of [{type:'back'},{type:'done'},{type:'wait'},{type:'scroll',direction:'down'}] as BetaAction[]){const id=action.type==='scroll'?'scroll_down':action.type;assert.deepEqual(beginExperience(observation('1'),id,action).action,action);}
 for(const action of [{type:'secret'},{type:'scroll',direction:'sideways'},{type:'look',point:{x:NaN,y:3}},{type:'click',elementId:''}])assert.throws(()=>beginExperience(observation('1'),'e1',action as BetaAction));
});

// Catches inventing an action on initial observation or appending without a pending actual event.
test('arrive records only supplied pending intent and clears disabled or fresh experience',()=>{
 const empty=arriveExperience(undefined,undefined,observation('1'),'unchanged',config);assert.deepEqual(empty,{schemaVersion:1,transitions:[]});
 const intent=beginExperience(observation('1'),'e1',{type:'click',elementId:'e1'},assessment());
 const next=arriveExperience(empty,intent,observation('2'),'performed',config);assert.deepEqual(next,memory());assert.deepEqual(empty.transitions,[]);
 const copied=arriveExperience(next,undefined,observation('3'),'unchanged',config);assert.deepEqual(copied,next);assert.notEqual(copied,next);assert.notEqual(copied.transitions[0],next.transitions[0]);
 assert.deepEqual(arriveExperience(next,intent,observation('2'),'performed',{enabled:false,capacity:3}),{schemaVersion:1,transitions:[]});
 assert.deepEqual(arriveExperience(undefined,undefined,observation('new'),'performed',config),{schemaVersion:1,transitions:[]});
});

// Catches off-by-one retention and aliases from events/current observations into experience.
test('arrive retains newest bounded episodes and copies nested action, evidence and result values',()=>{
 const old=memory([episode('0','1'),episode('1','2')]),intent=beginExperience(observation('2'),'look_0',{type:'look',point:{x:1,y:2}}),current=observation('3');
 const actual=arriveExperience(old,intent,current,'unchanged',{enabled:true,capacity:2});
 assert.deepEqual(actual.transitions.map(t=>[t.intent.source.observationId,t.result.observationId]),[['1','2'],['2','3']]);assert.equal(actual.transitions[1].execution,'unchanged');
 if(intent.action.type==='look')intent.action.point.x=90;current.imageSha256='changed';actual.transitions[0].intent.source.imageSha256='mutated';
 assert.deepEqual(actual.transitions[1].intent.action,{type:'look',point:{x:1,y:2}});assert.equal(actual.transitions[1].result.imageSha256,'3');assert.equal(old.transitions[1].intent.source.imageSha256,'1');
});

// Catches invalid capacities or reusing a source observation as a fabricated arrival.
test('invalid experience configuration, execution and same observation arrival fail closed',()=>{
 const intent=beginExperience(observation('1'),'e1',{type:'click',elementId:'e1'});
 for(const capacity of [0,-1,1.5,9,NaN,Infinity])assert.throws(()=>arriveExperience(undefined,intent,observation('2'),'performed',{enabled:true,capacity}));
 assert.throws(()=>arriveExperience(undefined,intent,observation('2'),'performed',{enabled:'yes' as never,capacity:3}));
 assert.throws(()=>arriveExperience(undefined,intent,observation('2'),'failed' as never,config));
 assert.throws(()=>arriveExperience(undefined,intent,observation('1'),'unchanged',config));
});

// Catches deriving a goal judgment from one unattached endpoint or historical/cross-page evidence.
test('experience questions require both exact attached endpoints and cite only the latest result',()=>{
 const m=memory([episode('0','1'),episode()]),q=experienceQuestions(m,[source('0'),source('1'),source('2'),source('future')]);
 assert.deepEqual(Object.keys(q),['experienceProgress','experienceExpectation','experienceEvidence']);
 assert.deepEqual(Object.keys(q.experienceProgress.criteria),['advances','neutral','conflicts','unknown']);assert.deepEqual(Object.keys(q.experienceExpectation.criteria),['supported','not_supported','unknown']);assert.deepEqual(Object.keys(q.experienceEvidence.criteria),['2','none']);
 assert.match(JSON.stringify(q),/mere navigation/i);assert.match(JSON.stringify(q),/prediction/i);
 for(const sources of [[],[source('1')],[source('2')],[source('1','changed'),source('2')],[source('1'),source('2','changed')]])assert.deepEqual(experienceQuestions(m,sources),{});
 assert.deepEqual(experienceQuestions(memory([]),[]),{});
 assert.throws(()=>experienceQuestions(m,[source('1'),source('1','conflicting'),source('2')]));
 assert.ok(!JSON.stringify(q).includes('SECRET'));
});

// Catches updating any episode other than the latest or accepting self-reported text into memory.
test('admission validates and copies the three choices while ignoring ordinary assessment answer keys',()=>{
 const m=memory([episode('0','1'),episode()]),before=structuredClone(m),response=answer();
 response.answers.knowledge={choice:'untrusted explanation',probabilities:{untrusted:1}};Object.assign(response.answers.experienceProgress,{reason:'SECRET'});Object.assign(response,{reason:'SECRET'});
 const actual=admitExperience(response,m,[source('1'),source('2')]);
 assert.deepEqual(actual.transitions[0],before.transitions[0]);assert.equal(actual.transitions[0].judgment,undefined);
 assert.deepEqual(actual.transitions[1].judgment,{kind:'model-assessment-not-fact',progress:'neutral',expectation:'not_supported',evidence:source('2'),adjustments:[]});
 assert.deepEqual(m,before);response.answers.experienceProgress.choice='conflicts';actual.transitions[0].intent.source.imageSha256='mutated';assert.equal(m.transitions[0].intent.source.imageSha256,'0');assert.ok(!JSON.stringify(actual).includes('SECRET'));
});

// Catches unsupported claims becoming a result when no admitted result citation was chosen.
test('none evidence downgrades both model claims with bounded controlled adjustments',()=>{
 const actual=admitExperience(answer({experienceProgress:'advances',experienceExpectation:'supported',experienceEvidence:'none'}),memory(),[source('1'),source('2')]);
 assert.deepEqual(actual.transitions[0].judgment,{kind:'model-assessment-not-fact',progress:'unknown',expectation:'unknown',adjustments:['NO_ADMITTED_EVIDENCE:progress=advances->unknown','NO_ADMITTED_EVIDENCE:expectation=supported->unknown']});
 const unknown=admitExperience(answer({experienceProgress:'unknown',experienceExpectation:'unknown',experienceEvidence:'none'}),memory(),[source('1'),source('2')]);assert.deepEqual(unknown.transitions[0].judgment!.adjustments,[]);
});

// Catches claiming an unknown earlier prediction was supported simply because navigation occurred.
test('an unknown intent permits observed progress but cannot acquire a supported expectation',()=>{
 const m=memory();m.transitions[0].intent.prediction='unknown';
 const actual=admitExperience(answer({experienceProgress:'advances',experienceExpectation:'supported'}),m,[source('1'),source('2')]);
 assert.deepEqual(actual.transitions[0].judgment,{kind:'model-assessment-not-fact',progress:'advances',expectation:'unknown',evidence:source('2'),adjustments:['UNKNOWN_PREDICTION:expectation=supported->unknown']});
});

// Catches missing or malformed auxiliary distributions, non-string coercion and forged result citations.
test('all experience distributions and citation identities fail closed before judgment',()=>{
 for(const id of ['experienceProgress','experienceExpectation','experienceEvidence']){
  const missing=answer();delete missing.answers[id];assert.throws(()=>admitExperience(missing,memory(),[source('1'),source('2')]));
  const bad=answer();bad.answers[id].probabilities={bad:1};assert.throws(()=>admitExperience(bad,memory(),[source('1'),source('2')]));
  const coerced=answer();coerced.answers[id].choice=[coerced.answers[id].choice] as never;assert.throws(()=>admitExperience(coerced,memory(),[source('1'),source('2')]));
  const nonfinite=answer();nonfinite.answers[id].probabilities[Object.keys(nonfinite.answers[id].probabilities)[0]]=NaN;assert.throws(()=>admitExperience(nonfinite,memory(),[source('1'),source('2')]));
 }
 for(const evidence of ['1','future','forged'])assert.throws(()=>admitExperience(answer({experienceEvidence:evidence}),memory(),[source('1'),source('2'),source('future')]));
 for(const sources of [[],[source('1')],[source('2')],[source('1'),source('2','wrong')]])assert.throws(()=>admitExperience(answer(),memory(),sources));
 assert.throws(()=>admitExperience(answer(),memory([]),[source('1'),source('2')]));
});

// Catches action/audit extras and mutable judgment adjustment arrays leaking into the model context.
test('context returns only independent allowlisted transition data',()=>{
 const dirty=admitExperience(answer(),memory(),[source('1'),source('2')]);Object.assign(dirty,{hiddenDOM:'SECRET'});Object.assign(dirty.transitions[0],{reason:'SECRET'});Object.assign(dirty.transitions[0].intent.action,{label:'SECRET'});Object.assign(dirty.transitions[0].judgment!,{reason:'SECRET'});
 const context=experienceContext(dirty,observation('2'));
 assert.equal(context.kind,'bounded-model-experience-not-fact');assert.ok(!JSON.stringify(context).includes('SECRET'));
 context.transitions[0].judgment!.adjustments.push('changed');context.transitions[0].intent.source.imageSha256='changed';assert.deepEqual(dirty.transitions[0].judgment!.adjustments,[]);assert.equal(dirty.transitions[0].intent.source.imageSha256,'1');
 assert.deepEqual(experienceContext(undefined,observation('fresh')),{kind:'bounded-model-experience-not-fact',transitions:[],returnedRoutes:[]});
});

// Catches treating image recurrence as task failure or presenting a disconnected/unfinished route as returned.
test('context derives a bounded actual return path without inferring goal failure',()=>{
 const m=memory([episode('1','2','A','B'),episode('2','3','B','C'),episode('3','4','C','A')]);
 const context=experienceContext(m,observation('4','A'));
 assert.deepEqual(context.returnedRoutes,[{fromObservationId:'1',toObservationId:'4',path:[{source:source('1','A'),candidateId:'e1',prediction:'advances',result:source('2','B')},{source:source('2','B'),candidateId:'e1',prediction:'advances',result:source('3','C')},{source:source('3','C'),candidateId:'e1',prediction:'advances',result:source('4','A')}]}]);
 assert.doesNotMatch(JSON.stringify(context),/failure|failed|unproductive/);
 context.returnedRoutes[0].path[0].source.imageSha256='changed';assert.equal(context.transitions[0].intent.source.imageSha256,'A');assert.equal(m.transitions[0].intent.source.imageSha256,'A');
 assert.deepEqual(experienceContext(m,observation('fresh','A')).returnedRoutes,[]);
 const disconnected=memory([episode('1','2','A','B'),episode('elsewhere','4','C','A')]);assert.deepEqual(experienceContext(disconnected,observation('4','A')).returnedRoutes,[]);
});

// Catches unbounded route duplication while retaining a same-image unchanged event as an observation fact.
test('recurrence stays bounded by eight retained transitions and does not prohibit unchanged revisits',()=>{
 let m:ExperienceMemory|undefined;
 for(let i=0;i<12;i++){const current=observation(String(i),'A'),intent=beginExperience(current,'wait',{type:'wait'});m=arriveExperience(m,intent,observation(String(i+1),'A'),'unchanged',{enabled:true,capacity:8});}
 const context=experienceContext(m,observation('12','A'));assert.equal(context.transitions.length,8);assert.ok(context.returnedRoutes.length<=8);assert.ok(context.returnedRoutes.every(route=>route.path.length<=8));assert.equal(context.transitions.at(-1)!.execution,'unchanged');
});

// Catches transferring a local e1 experience to another image with the same candidate ID or forcing novelty.
test('criteria annotate only matching current image and candidate while preserving order, labels and revisits',()=>{
 const m=admitExperience(answer(),memory(),[source('1'),source('2')]),criteria={done:'Done unchanged',look_0:'Look unchanged',e2:'Unvisited alternative',e1:'First original label',back:'Back unchanged'},before=structuredClone(criteria);
 const actual=experienceCriteria(criteria,m,observation('returned','1'));
 assert.deepEqual(Object.keys(actual),Object.keys(criteria));assert.ok(actual.e1.startsWith('First original label'));assert.match(actual.e1,/prediction=advances/);assert.match(actual.e1,/progress=neutral/);assert.match(actual.e1,/expectation=not_supported/);assert.match(actual.e1,/model hypothes/i);
 for(const id of ['done','look_0','e2','back'] as const)assert.equal(actual[id],criteria[id]);
 assert.deepEqual(experienceCriteria(criteria,m,observation('other','other-image')),criteria);assert.deepEqual(criteria,before);actual.e1='changed';assert.equal(criteria.e1,'First original label');
 assert.doesNotMatch(JSON.stringify(actual),/must choose|force|prohibited|remove|unvisited first/i);
 assert.match(experienceInstructions,/predicted/i);assert.match(experienceInstructions,/observed/i);assert.match(experienceInstructions,/return.*not.*failure/i);assert.match(experienceInstructions,/persona/i);
});

// Catches presenting a known return route on the wrong entry candidate or another page's recycled ID.
test('criteria expose the recorded return path only for its image and entry candidate',()=>{
 const m=memory([episode('1','2','A','B'),episode('2','3','B','C'),episode('3','4','C','A')]),criteria={done:'Done',look_0:'Look',back:'Back',e2:'Other option',e1:'Tried entry'};
 const actual=experienceCriteria(criteria,m,observation('4','A'));
 assert.match(actual.e1,/previous observed return route/);
 assert.ok(actual.e1.includes('1 --e1--> 2'));assert.ok(actual.e1.includes('2 --e1--> 3'));assert.ok(actual.e1.includes('3 --e1--> 4'));
 for(const id of ['done','look_0','back','e2'] as const)assert.equal(actual[id],criteria[id]);
 assert.deepEqual(Object.keys(actual),Object.keys(criteria));
 const otherPage=experienceCriteria(criteria,m,observation('elsewhere','UNSEEN_IMAGE'));
 assert.deepEqual(otherPage,criteria);assert.doesNotMatch(otherPage.e1,/previous observed return route/);
});

// Catches erasing bounded hypotheses when old image bytes expire or judging an older eligible transition instead.
test('expired images retain bounded semantic recollection but cannot ground a fresh experience judgment',()=>{
 const judged=admitExperience(answer(),memory(),[source('1'),source('2')]);
 assert.deepEqual(experienceQuestions(judged,[source('2')]),{});
 assert.equal(experienceContext(judged,observation('2')).transitions[0].judgment!.expectation,'not_supported');
 const latestMissing=memory([episode('0','1'),episode('1','2')]);
 assert.deepEqual(experienceQuestions(latestMissing,[source('0'),source('1')]),{});
});

// Catches silently repairing corrupt retained adjustment records instead of rejecting them.
test('retained unknown, duplicate or oversized adjustment records fail closed',()=>{
 const valid='NO_ADMITTED_EVIDENCE:progress=advances->unknown';
 for(const adjustments of [['SECRET'],[valid,valid],[valid,'NO_ADMITTED_EVIDENCE:expectation=supported->unknown','UNKNOWN_PREDICTION:expectation=not_supported->unknown']]){
  const corrupt=admitExperience(answer(),memory(),[source('1'),source('2')]);corrupt.transitions[0].judgment!.adjustments=adjustments;
  assert.throws(()=>experienceContext(corrupt,observation('2')),/EXPERIENCE.*ADJUSTMENT|INVALID_EXPERIENCE/);
  assert.throws(()=>arriveExperience(corrupt,undefined,observation('2'),'unchanged',config));
  assert.throws(()=>experienceCriteria({e1:'original'},corrupt,observation('1')));
 }
});



// Catches altering saved legacy request text when the new evidence interpretation is not selected.
test('omitted evidence mode keeps the legacy evidence question text and descriptions exactly',()=>{
 const legacy=experienceQuestions(memory(),[source('1'),source('2')]);
 assert.deepEqual(experienceQuestions(memory(),[source('1'),source('2')],undefined),legacy);
 assert.deepEqual(legacy.experienceEvidence,{type:'choice',instructions:experienceInstructions+' Select only the current result observation supporting both judgments; otherwise choose none.',criteria:{'2':'The attached current result image supports these judgments.',none:'There is no admitted current result evidence supporting these judgments.'}});
});

// Catches a basis mode that changes result choices, adds progress guidance, or equates evidence with success.
test('basis mode changes only evidence explanations while preserving all question and distribution keys',()=>{
 const sources=[source('1'),source('2')],legacy=experienceQuestions(memory(),sources),basis=experienceQuestions(memory(),sources,'basis');
 assert.deepEqual(Object.keys(basis),Object.keys(legacy));
 assert.deepEqual(basis.experienceProgress,legacy.experienceProgress);assert.deepEqual(basis.experienceExpectation,legacy.experienceExpectation);
 assert.equal(basis.experienceEvidence.type,legacy.experienceEvidence.type);assert.deepEqual(Object.keys(basis.experienceEvidence.criteria),['2','none']);
 assert.notEqual(basis.experienceEvidence.instructions,legacy.experienceEvidence.instructions);
 assert.notEqual(basis.experienceEvidence.criteria['2'],legacy.experienceEvidence.criteria['2']);assert.notEqual(basis.experienceEvidence.criteria.none,legacy.experienceEvidence.criteria.none);
 assert.match(basis.experienceEvidence.instructions,/basis/i);assert.match(basis.experienceEvidence.instructions,/source.*result/i);assert.match(basis.experienceEvidence.instructions,/not proof of goal completion/i);assert.match(basis.experienceEvidence.instructions,/prior prediction/i);
 for(const category of ['neutral','conflicts','not_supported','unknown'])assert.ok(basis.experienceEvidence.instructions.toLowerCase().includes(category));
 assert.match(basis.experienceEvidence.instructions,/not visible|cannot be identified/i);assert.match(basis.experienceEvidence.instructions,/none/);
 assert.doesNotMatch(basis.experienceEvidence.instructions,/must (?:select|choose) (?:the )?current|always (?:select|choose)|notification|settings route/i);
});

// Catches changing admitted semantics rather than just the evidence question wording.
test('basis and legacy modes admit the same grounded progress and expectation distributions',()=>{
 const sources=[source('1'),source('2')];
 for(const [progress,expectation] of [['neutral','not_supported'],['conflicts','not_supported'],['unknown','unknown'],['advances','supported']]){
  const response=answer({experienceProgress:progress,experienceExpectation:expectation}),before=structuredClone(response);
  const legacy=admitExperience(response,memory(),sources),basis=admitExperience(response,memory(),sources,'basis');
  assert.deepEqual(basis,legacy);assert.deepEqual(response,before);assert.equal(basis.transitions[0].judgment!.progress,progress);assert.equal(basis.transitions[0].judgment!.expectation,expectation);
 }
});

// Catches coercing none into a result citation or making unknown prior predictions suddenly supported.
test('basis mode preserves none downgrades and unknown-prediction adjustments',()=>{
 const sources=[source('1'),source('2')],noEvidence=answer({experienceProgress:'neutral',experienceExpectation:'not_supported',experienceEvidence:'none'});
 const legacy=admitExperience(noEvidence,memory(),sources),basis=admitExperience(noEvidence,memory(),sources,'basis');
 assert.deepEqual(basis,legacy);assert.deepEqual(basis.transitions[0].judgment,{kind:'model-assessment-not-fact',progress:'unknown',expectation:'unknown',adjustments:['NO_ADMITTED_EVIDENCE:progress=neutral->unknown','NO_ADMITTED_EVIDENCE:expectation=not_supported->unknown']});
 const unknown=memory();unknown.transitions[0].intent.prediction='unknown';
 const response=answer({experienceProgress:'neutral',experienceExpectation:'supported'});
 assert.deepEqual(admitExperience(response,unknown,sources,'basis'),admitExperience(response,unknown,sources));
 assert.equal(admitExperience(response,unknown,sources,'basis').transitions[0].judgment!.expectation,'unknown');
});

// Catches an unrecognized mode silently selecting either evidence interpretation or a budget path.
test('unknown evidence modes fail closed at question, admission and arrival boundaries',()=>{
 for(const mode of ['legacy','unknown','',null,true,{},['basis']]){
  assert.throws(()=>experienceQuestions(memory(),[source('1'),source('2')],mode as never));
  assert.throws(()=>admitExperience(answer(),memory(),[source('1'),source('2')],mode as never));
  const invalidConfig={...config,evidenceMode:mode} as ExperienceConfig;
  assert.throws(()=>arriveExperience(undefined,undefined,observation('1'),'unchanged',invalidConfig));
 }
});

// Catches admitting unattached/future evidence under the more permissive wording.
test('basis mode still requires both exact attached endpoints and result-only valid distributions',()=>{
 for(const sources of [[],[source('1')],[source('2')],[source('1'),source('2','wrong')]]){
  assert.deepEqual(experienceQuestions(memory(),sources,'basis'),{});assert.throws(()=>admitExperience(answer(),memory(),sources,'basis'));
 }
 const sources=[source('1'),source('2'),source('future')];
 assert.deepEqual(Object.keys(experienceQuestions(memory(),sources,'basis').experienceEvidence.criteria),['2','none']);
 for(const evidence of ['1','future'])assert.throws(()=>admitExperience(answer({experienceEvidence:evidence}),memory(),sources,'basis'));
 const malformed=answer();malformed.answers.experienceEvidence.probabilities={'2':0.5,none:0.25};assert.throws(()=>admitExperience(malformed,memory(),sources,'basis'));
 const basisConfig={...config,evidenceMode:'basis'} as ExperienceConfig;
 assert.deepEqual(arriveExperience(undefined,undefined,observation('1'),'unchanged',basisConfig),{schemaVersion:1,transitions:[]});
});
