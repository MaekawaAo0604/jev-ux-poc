import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import type {InquiryOutcomeContext,InquiryOutcomeMemory,InquiryOutcomeRecord,PendingInquiryOperation} from '../jev/virtual-beta/inquiry-outcome-contracts.js';
const api=await import('../jev/virtual-beta/inquiry-outcome-projection.js').catch(()=>({} as any));

const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
const source=(n:number)=>({observationId:`o${n}`,imageSha256:sha(`image o${n}`)});
const goalSha256=sha('Enable the prerequisite and finish the goal.');
const empty=():InquiryOutcomeMemory=>({schemaVersion:1,entries:[]});
function pending(n=1):PendingInquiryOperation{return {
 schemaVersion:1,kind:'pending-inquiry-operation',source:source(n),goalSha256,
 condition:{key:'current_c1',scope:'current-hypothesis',conditionId:'c1',description:'The enabling condition was unmet.',status:'unmet',evidence:{...source(n),quote:'Earlier prerequisite',quoteStatus:'model-transcribed-unverified'},evidenceScope:'current'},
 intent:'change_condition',check:'condition_changed',action:{candidateId:'e1',type:'click',execution:'performed'},expectedObservation:'Observe the prerequisite after changing it.',explicitLink:true,
};}
function context(n=2,memory=empty(),operation:PendingInquiryOperation|null=pending(n-1)):InquiryOutcomeContext{
 return {schemaVersion:1,kind:'bounded-inquiry-outcome-context',source:source(n),goalSha256,pending:operation,memory};
}
function record(n=2):InquiryOutcomeRecord{
 const ctx=context(n);
 return {schemaVersion:1,kind:'model-inquiry-outcome-not-fact',source:source(n),goalSha256,contextSha256:sha(JSON.stringify(ctx)),pending:pending(n-1),rawChoices:{result:'condition_satisfied',basis:'current_image'},choices:{result:'condition_satisfied',basis:'current_image'},adjustments:[]};
}
function requireApi(){for(const name of ['inquiryOutcomeUserContext','inquiryOutcomeUserMemory','inquiryOutcomeCriteria'])assert.equal(typeof api[name],'function',`${name} export exists`);}
test.beforeEach(requireApi);
function userContext(ctx=context()){requireApi();return api.inquiryOutcomeUserContext(ctx);}
function userMemory(memory:InquiryOutcomeMemory={schemaVersion:1,entries:[record()]}){requireApi();return api.inquiryOutcomeUserMemory(memory);}
const labels=()=>({e2:'[e2] prerequisite role',done:'done untouched',e1:'[e1] information role',back:'navigate back',look_0:'look untouched',stuck:'stuck untouched'});
function criteria(offered=labels(),candidateIds=['e1','back','e2'],memory:InquiryOutcomeMemory={schemaVersion:1,entries:[record()]}){requireApi();return api.inquiryOutcomeCriteria(offered,candidateIds,memory);}

// Break caught: leaking the operation's formerly current hypothesis as current evidence.
test('context carries the previous tuple with historical condition and quote source scopes',()=>{
 const result=userContext();assert.deepEqual(result.source,source(2));assert.equal(result.goalSha256,goalSha256);
 assert.equal(result.kind,'model-inquiry-outcome-context-not-fact');
 assert.equal(result.pending.scope,'historical-at-source');assert.deepEqual(result.pending.source,source(1));
 assert.equal(result.pending.condition.scope,'historical-at-operation-source');assert.equal(result.pending.condition.originalScope,'current-hypothesis');
 assert.deepEqual(result.pending.condition.lastAssessedAt,source(1));assert.equal(result.pending.condition.evidenceScope,'historical-at-evidence-source');
 assert.equal(result.pending.condition.evidence.scope,'historical-at-evidence-source');assert.deepEqual({observationId:result.pending.condition.evidence.observationId,imageSha256:result.pending.condition.evidence.imageSha256},source(1));
 assert.equal(result.pending.condition.evidence.quote,'Earlier prerequisite');assert.equal(result.pending.condition.evidence.quoteStatus,'model-transcribed-unverified');
 assert.equal(result.pending.intent,'change_condition');assert.equal(result.pending.check,'condition_changed');
 assert.deepEqual(result.pending.action,{candidateId:'e1',type:'click',execution:'performed'});assert.equal(result.pending.explicitLink,true);
 assert.equal(result.pending.expectedObservation,'Observe the prerequisite after changing it.');assert.deepEqual(result.inquiryOutcomeMemory.entries,[]);
});

// Break caught: promoting an assessment made on the currently seen frame into a validated fact.
test('memory retains admitted model hypotheses as last assessed at their actual sources',()=>{
 const memory={schemaVersion:1 as const,entries:[record(2),record(3),record(4)]},result=userMemory(memory);
 assert.equal(result.kind,'bounded-model-inquiry-outcome-memory-not-fact');assert.equal(result.entries.length,3);
 assert.deepEqual(result.entries.map((entry:any)=>entry.source),[source(2),source(3),source(4)]);
 for(const entry of result.entries){assert.equal(entry.kind,'model-inquiry-outcome-not-fact');assert.equal(entry.assessmentScope,'last-assessed-at-source');assert.deepEqual(entry.choices,{result:'condition_satisfied',basis:'current_image'});assert.equal(entry.pending.scope,'historical-at-source');}
 const current=userContext(context(4,{schemaVersion:1,entries:[record(2),record(3)]}));
 assert.equal(current.inquiryOutcomeMemory.entries[1].assessmentScope,'last-assessed-at-source');
});

test('first observation and empty memories project no invented operation or judgment',()=>{
 const result=userContext(context(1,empty(),null));assert.equal(result.pending,null);assert.deepEqual(result.inquiryOutcomeMemory.entries,[]);
 assert.deepEqual(userMemory(empty()).entries,[]);assert.deepEqual(criteria(labels(),[],empty()),{criteria:labels(),annotations:[]});
});

// Break caught: using raw incompatible results instead of the admitted downgrade.
test('raw outcomes, adjustments and context digests never enter model visible output',()=>{
 const entry=record();entry.rawChoices={result:'route_found',basis:'current_image'};entry.choices={result:'unknown',basis:'current_image'};entry.adjustments=['RESULT_CHECK_MISMATCH'];
 const memory:InquiryOutcomeMemory={schemaVersion:1,entries:[entry]};
 const projected=userMemory(memory);assert.deepEqual(projected.entries[0].choices,{result:'unknown',basis:'current_image'});
 for(const result of [projected,userContext(context(3,memory)),criteria(labels(),['e1'],memory)]){
  const text=JSON.stringify(result);for(const omitted of ['rawChoices','adjustments','contextSha256','route_found','RESULT_CHECK_MISMATCH'])assert.ok(!text.includes(omitted),omitted+' must stay private');
 }
});

test('unknown evidence and null conditions remain explicit and never invent a relation',()=>{
 const operation=pending();operation.condition=null;operation.intent='find_route';operation.check='new_route_visible';operation.explicitLink=false;
 const projected=userContext(context(2,empty(),operation));assert.equal(projected.pending.condition,null);assert.equal(projected.pending.explicitLink,false);
 const value=record();value.rawChoices={result:'unknown',basis:'none'};value.choices={result:'unknown',basis:'none'};
 assert.deepEqual(userMemory({schemaVersion:1,entries:[value]}).entries[0].choices,{result:'unknown',basis:'none'});
});

// Break caught: inferring that today's e1 identifies the prior frame's executed e1.
test('criteria preserve IDs, order and roles with the same compact memory pointer on each supplied UI row',()=>{
 const offered=labels(),result=criteria(offered);assert.deepEqual(Object.keys(result.criteria),Object.keys(offered));
 assert.deepEqual(result.annotations.map((entry:any)=>entry.candidateId),['e2','e1','back']);
 for(const id of ['done','look_0','stuck'])assert.equal(result.criteria[id],(offered as any)[id]);
 const suffixes=result.annotations.map((entry:any)=>{assert.equal(entry.before,(offered as any)[entry.candidateId]);assert.equal(entry.after,result.criteria[entry.candidateId]);assert.ok(entry.after.startsWith(entry.before));return entry.after.slice(entry.before.length);});
 assert.equal(new Set(suffixes).size,1);assert.ok(suffixes[0].includes('inquiryOutcomeMemory'));assert.ok(suffixes[0].length<300);
 for(const forbidden of ['condition_satisfied','Earlier prerequisite','current_c1','candidateId','route_found'])assert.ok(!suffixes[0].includes(forbidden));
 assert.deepEqual(offered,labels());assert.deepEqual(criteria(labels(),['e1'],empty()),{criteria:labels(),annotations:[]});
});

test('projections are deterministic independent copies and cannot mutate source or another call',()=>{
 const ctx=context(3,{schemaVersion:1,entries:[record(2)]}),saved=structuredClone(ctx),a=userContext(ctx),b=userContext(ctx),memory=userMemory(ctx.memory);
 assert.deepEqual(ctx,saved);const original=structuredClone(a);ctx.pending!.condition!.description='mutated';ctx.memory.entries[0].choices.result='unknown';assert.deepEqual(a,original);
 a.pending.condition.evidence.quote='mutated';a.inquiryOutcomeMemory.entries[0].choices.result='unknown';assert.deepEqual(b,original);assert.equal(memory.entries[0].choices.result,'condition_satisfied');
});

for(const [name,change] of [
 ['extra field',(ctx:any)=>{ctx.hidden='secret';}],['future pending',(ctx:any)=>{ctx.pending.source=source(4);}],['pending goal',(ctx:any)=>{ctx.pending.goalSha256=sha('other');}],
 ['current memory',(ctx:any)=>{ctx.memory.entries=[record(3)];}],['wrong memory goal',(ctx:any)=>{ctx.memory.entries[0].goalSha256=sha('other');}],
 ['malformed condition',(ctx:any)=>{ctx.pending.condition.status='satisfied';}],['condition evidence mismatch',(ctx:any)=>{ctx.pending.condition.evidenceScope='historical';}],
] as const)test('rejects malformed context before projecting: '+name,()=>{const ctx=context(3,{schemaVersion:1,entries:[record(2)]});change(ctx);assert.throws(()=>userContext(ctx));});

for(const [name,change] of [
 ['too many',(memory:any)=>{memory.entries=[record(2),record(3),record(4),record(5)];}],['duplicate source',(memory:any)=>{memory.entries=[record(2),record(2)];}],
 ['unordered',(memory:any)=>{memory.entries=[record(3),record(2)];}],['extra record',(memory:any)=>{memory.entries[0].extra='secret';}],
 ['forged result',(memory:any)=>{memory.entries[0].choices.result='route_found';}],['invalid digest',(memory:any)=>{memory.entries[0].contextSha256='invalid';}],
] as const)test('rejects malformed admitted memory: '+name,()=>{const memory:InquiryOutcomeMemory={schemaVersion:1,entries:[record()]};change(memory);assert.throws(()=>userMemory(memory));assert.throws(()=>criteria(labels(),['e1'],memory));});

for(const ids of [['e1','e1'],['missing'],['bad id'],[3],['']])test('rejects invalid, duplicate or unknown current candidate IDs '+JSON.stringify(ids),()=>assert.throws(()=>criteria(labels(),ids as any)));

test('rejects accessors, hidden hooks and malformed criteria without evaluating user code',()=>{
 let reads=0;const getter={enumerable:true,get(){reads++;throw Error('READ');}};
 const ctx:any=context();Object.defineProperty(ctx.pending.condition.evidence,'quote',getter);assert.throws(()=>userContext(ctx));
 const memory:any={schemaVersion:1,entries:[record()]};Object.defineProperty(memory.entries[0],'toJSON',{get(){reads++;throw Error('READ');}});assert.throws(()=>userMemory(memory));
 const offered:any=labels();Object.defineProperty(offered,'e1',getter);assert.throws(()=>criteria(offered));
 const ids:any=['e1'];Object.defineProperty(ids,'0',getter);assert.throws(()=>criteria(labels(),ids));
 assert.throws(()=>criteria({...labels(),e1:17} as any));assert.equal(reads,0);
});

test('criterion inherited and hidden metadata stay out of projection without running hooks',()=>{
 let reads=0;const offered=Object.assign(Object.create({get inherited(){reads++;throw Error('READ');}}),labels());Object.defineProperty(offered,'hidden',{get(){reads++;throw Error('READ');}});
 const result=criteria(offered);assert.deepEqual(Object.keys(result.criteria),Object.keys(labels()));assert.equal(reads,0);
});

