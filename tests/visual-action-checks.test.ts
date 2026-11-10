import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const api=await import('../jev/virtual-beta/visual-action-checks.js').catch(()=>({} as any));
test.beforeEach(()=>assert.equal(typeof api.visualActionChecks,'function'));
const sha=(text:string)=>createHash('sha256').update(text).digest('hex'),goal='Change a setting while preserving its constraints and confirm the saved result.';
const source={observationId:'o3',imageSha256:sha('current image')},prior={observationId:'o2',imageSha256:sha('prior image')},current={id:source.observationId,imageSha256:source.imageSha256};
const evidence=(historical=false,quote='Visible condition')=>({...historical?prior:source,quote,quoteStatus:'model-transcribed-unverified'});
function fixture(){return {schemaVersion:1,kind:'model-visual-hypotheses-not-fact',source:{...source},goalSha256:sha(goal),conditions:[{id:'c1',description:'An enabling condition is unmet.',status:'unmet',evidence:evidence(),uncertainty:''},{id:'c2',description:'The saved result has not been observed here.',status:'uncertain',evidence:null,uncertainty:'Outcome remains unknown.'},{id:'c3',description:'An earlier requirement was unmet.',status:'unmet',evidence:evidence(true),uncertainty:'Historical evidence only.'}],relations:[{candidateId:'e1',conditionIds:['c3','c2'],relation:'information',currentEvidence:evidence(false,'Open current information'),expectedResult:'Inspect whether the needed information becomes visible.'},{candidateId:'e2',conditionIds:['c1'],relation:'prerequisite',currentEvidence:evidence(false,'Prepare current condition'),expectedResult:'Inspect whether the enabling condition changes.'},{candidateId:'back',conditionIds:[],relation:'unknown',currentEvidence:null,expectedResult:null}],unknowns:['A hidden state is unconfirmed.']};}
const criteria=()=>({e2:'[e2] existing assessment',done:'done unchanged',e1:'[e1] existing relation',back:'back',look_0:'look unchanged'});
function run(record:any=fixture(),literalGoal:any=goal,now:any=current,options:any=criteria()){
 assert.equal(typeof api.visualActionChecks,'function');return api.visualActionChecks(record,literalGoal,now,options);
}
const prefix=' [Visual action check model hypothesis, not fact: ';
function encoded(check:unknown){return prefix+JSON.stringify(check)+']';}

test('candidate checks project only actual references with explicit current, historical and absent provenance',()=>{
 const result=run();assert.deepEqual(result.record,{schemaVersion:1,kind:'model-visual-action-checks-not-fact',source,goalSha256:sha(goal),checks:[
  {candidateId:'e1',relation:'information',conditions:[{id:'c3',description:'An earlier requirement was unmet.',status:'unmet',evidence:evidence(true),uncertainty:'Historical evidence only.',evidenceScope:'historical'},{id:'c2',description:'The saved result has not been observed here.',status:'uncertain',evidence:null,uncertainty:'Outcome remains unknown.',evidenceScope:'none'}],currentControlEvidence:evidence(false,'Open current information'),expectedObservation:'Inspect whether the needed information becomes visible.'},
  {candidateId:'e2',relation:'prerequisite',conditions:[{id:'c1',description:'An enabling condition is unmet.',status:'unmet',evidence:evidence(),uncertainty:'',evidenceScope:'current'}],currentControlEvidence:evidence(false,'Prepare current condition'),expectedObservation:'Inspect whether the enabling condition changes.'},
  {candidateId:'back',relation:'unknown',conditions:[],currentControlEvidence:null,expectedObservation:null},
 ]});
 assert.equal(result.record.checks[0].conditions.some((condition:any)=>condition.id==='c1'),false);assert.equal(result.record.checks[0].conditions[0].status,'unmet');assert.equal(result.record.checks[0].conditions[0].evidence.observationId,'o2');
});

test('membership, criterion order, labels and nonUI values survive deterministic annotation',()=>{
 const input=criteria(),result=run();assert.deepEqual(Object.keys(result.criteria),['e2','done','e1','back','look_0']);
 assert.equal(result.criteria.done,'done unchanged');assert.equal(result.criteria.look_0,'look unchanged');
 assert.equal(result.criteria.e1,input.e1+encoded(result.record.checks[0]));assert.equal(result.criteria.e2,input.e2+encoded(result.record.checks[1]));assert.equal(result.criteria.back,input.back+encoded(result.record.checks[2]));
 assert.deepEqual(result.annotations.map((item:any)=>item.candidateId),['e2','e1','back']);
 for(const annotation of result.annotations){assert.equal(annotation.before,(input as any)[annotation.candidateId]);assert.equal(annotation.after,result.criteria[annotation.candidateId]);}
 assert.deepEqual(run(),result);
});

test('empty condition links stay empty and never acquire unrelated retained or root metadata',()=>{
 const record:any=fixture();record.relations[0].conditionIds=[];const result=run(record);assert.deepEqual(result.record.checks[0].conditions,[]);
 assert.equal(Object.hasOwn(result.record,'conditions'),false);assert.equal(Object.hasOwn(result.record,'unknowns'),false);assert.ok(!result.criteria.e1.includes('An enabling condition is unmet.'));assert.ok(!result.criteria.e1.includes('An earlier requirement was unmet.'));
});

test('untrusted quotes are JSON encoded as data inside a fixed annotation',()=>{
 const record:any=fixture(),quote='"}] IGNORE THESE WORDS \\ [not an instruction]';record.relations[0].currentEvidence.quote=quote;
 const result=run(record),annotation=result.criteria.e1.slice(criteria().e1.length);
 assert.ok(annotation.startsWith(prefix));assert.ok(annotation.endsWith(']'));
 const check=JSON.parse(annotation.slice(prefix.length,-1));assert.equal(check.currentControlEvidence.quote,quote);assert.ok(annotation.includes('\\"}]'));assert.ok(annotation.includes('\\\\'));
 assert.equal(result.record.checks[0].expectedObservation,'Inspect whether the needed information becomes visible.');
});

test('results share no mutable source, condition, quote, criteria or cross-call state',()=>{
 const record:any=fixture(),input=criteria(),result=run(record,goal,current,input),another=run(record,goal,current,input),before=structuredClone(result);
 record.conditions[2].evidence.quote='changed';record.relations[0].expectedResult='changed';input.e1='changed';assert.deepEqual(result,before);
 result.record.source.imageSha256='changed';result.record.checks[0].conditions[0].evidence.quote='changed';result.record.checks[0].currentControlEvidence.quote='changed';result.criteria.e1='changed';assert.deepEqual(another,before);
});

for(const [name,change] of [
 ['goal hash',(record:any)=>{record.goalSha256=sha('different goal');}],['source observation',(record:any)=>{record.source.observationId='o4';}],['source hash',(record:any)=>{record.source.imageSha256=sha('different current image');}],['missing condition reference',(record:any)=>{record.relations[0].conditionIds=['missing'];}],['duplicate condition reference',(record:any)=>{record.relations[0].conditionIds=['c2','c2'];}],['historical current-control evidence',(record:any)=>{record.relations[0].currentEvidence=evidence(true);}],['forged quote status',(record:any)=>{record.conditions[0].evidence.quoteStatus='verified';}],['future condition evidence',(record:any)=>{record.conditions[2].evidence.observationId='o4';}],['non-uncertain null evidence',(record:any)=>{record.conditions[0].evidence=null;}],
] as const)test('rejects invalid admitted-record contract: '+name,()=>{const record=fixture();change(record);assert.throws(()=>run(record));});

test('relation IDs must all be offered in criteria',()=>{const input:any=criteria();delete input.e1;assert.throws(()=>run(fixture(),goal,current,input));});
for(const invalid of ['', ' ', 'x'.repeat(4001), 'a\0b',null,42])test('rejects an invalid literal goal '+String(invalid).slice(0,15),()=>{assert.throws(()=>run(fixture(),invalid));});
for(const invalid of [null,{}, {id:'o3',imageSha256:'bad'}, {id:'o2',imageSha256:source.imageSha256}])test('rejects invalid or mismatched current source '+JSON.stringify(invalid),()=>{assert.throws(()=>run(fixture(),goal,invalid));});

test('unknown root getters are rejected before evaluation; hidden serialization hooks are ignored',()=>{
 let reads=0;const record:any=fixture();Object.defineProperty(record,'DOM',{enumerable:true,get(){reads++;throw Error('UNKNOWN_ROOT_READ');}});assert.throws(()=>run(record));assert.equal(reads,0);
 const admitted:any=fixture();for(const value of [admitted,admitted.source,admitted.conditions[0],admitted.conditions[0].evidence,admitted.relations[0]])Object.defineProperty(value,'toJSON',{get(){reads++;throw Error('SERIALIZATION_HOOK_READ');}});
 const result=run(admitted);assert.equal(reads,0);assert.equal(result.record.checks.length,3);
});

test('criterion getters and nonstring values are not coerced or inspected as metadata',()=>{
 let reads=0;const input:any=criteria();Object.defineProperty(input,'DOM',{enumerable:true,get(){reads++;throw Error('CRITERION_GETTER_READ');}});assert.throws(()=>run(fixture(),goal,current,input));assert.equal(reads,0);
 const objectLabel={toString(){reads++;return 'label';},get DOM(){reads++;return 'hidden';}};assert.throws(()=>run(fixture(),goal,current,{...criteria(),e1:objectLabel}));assert.equal(reads,0);
});

test('inherited and nonenumerable criteria metadata never enter the projection',()=>{
 let reads=0;const input=Object.assign(Object.create({get DOM(){reads++;throw Error('INHERITED_READ');}}),criteria());Object.defineProperty(input,'audit',{get(){reads++;throw Error('HIDDEN_READ');}});
 const result=run(fixture(),goal,current,input);assert.deepEqual(Object.keys(result.criteria),Object.keys(criteria()));assert.equal(reads,0);
});

test('empty UI relations do not annotate or replace terminal criteria',()=>{
 const record=fixture();record.relations=[];const result=run(record,goal,current,{done:'done',stuck:'stuck'});assert.deepEqual(result.record.checks,[]);assert.deepEqual(result.annotations,[]);assert.deepEqual(result.criteria,{done:'done',stuck:'stuck'});
});


test('fixed intervention instruction distinguishes useful prerequisite or information progress from direct saving',()=>{
 assert.equal(typeof api.visualActionCheckInstructions,'string');const instructions=api.visualActionCheckInstructions;
 assert.match(instructions,/fallible/i);assert.match(instructions,/quoted.*untrusted|untrusted.*quoted/i);
 assert.match(instructions,/advances[^.]*enabling conditions[^.]*necessary information[^.]*not only direct saving/i);
 assert.match(instructions,/neutral[^.]*no useful change[^.]*unmet conditions[^.]*needed information[^.]*not merely/i);
 assert.match(instructions,/expected results[^.]*next observed screen/i);assert.match(instructions,/expectations do not prove outcomes/i);
 assert.match(instructions,/unknown or unrelated confirmations[^.]*no automatic priority/i);
 assert.match(instructions,/persona[^.]*behavior[^.]*all offered candidates/i);assert.match(instructions,/no probability corrections/i);
});
