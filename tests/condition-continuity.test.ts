import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const api=await import('../jev/virtual-beta/condition-continuity.js').catch(()=>({} as any));
const goal='案内を確認して設定を保存する',hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const source=(n:number)=>({observationId:'o'+n,imageSha256:hash('image'+n)});
const evidence=(n:number)=>({...source(n),quote:'条件の案内'+n,quoteStatus:'model-transcribed-unverified'});
const condition=(id='c1',status='unmet',n=2)=>({id,description:'利用条件を確認する',status,evidence:evidence(n),uncertainty:''});
const record=(conditions:any[]=[condition()],n=2)=>({schemaVersion:1,kind:'model-visual-hypotheses-not-fact',source:source(n),goalSha256:hash(goal),conditions,relations:[],unknowns:[]});
const memory=()=>({schemaVersion:1,goalSha256:hash(goal),lastObservation:source(1),entries:[{id:'o1_c1',description:'元の条件',lastGrounded:{status:'unmet',evidence:evidence(1)},currentStatus:'unmet',lastAssessed:source(1),transition:'introduced'}]});
const context=(capacity=3)=>({schemaVersion:1,capacity,memory:memory()});
const transition=(change='persists',conditionId:any='c1',priorId='o1_c1')=>({priorId,conditionId,change,explanation:'現在画像をもとに再評価した仮説'});

test('empty memory is copied, goal bound and has no implicit source or claims',()=>{
 assert.equal(typeof api.emptyConditionContinuity,'function');const first=api.emptyConditionContinuity(goal),second=api.emptyConditionContinuity(goal);
 assert.deepEqual(first,{schemaVersion:1,goalSha256:hash(goal),lastObservation:null,entries:[]});(first.entries as unknown[]).push({});assert.deepEqual(second.entries,[]);
 for(const g of ['', ' ', 'x'.repeat(4001),'a\0b'])assert.throws(()=>api.emptyConditionContinuity(g));
});
test('unobserved retains fallible historical grounding and description, but not current unmet status',()=>{
 const ctx=context(),before=structuredClone(ctx),raw=[transition('unobserved',null)],result=api.admitConditionContinuity(raw,ctx,record([]));
 assert.deepEqual(result.before,ctx.memory);assert.deepEqual(result.after.entries[0].lastGrounded,ctx.memory.entries[0].lastGrounded);assert.equal(result.after.entries[0].description,'元の条件');assert.equal(result.after.entries[0].currentStatus,'uncertain');assert.equal(result.after.entries[0].transition,'unobserved');assert.deepEqual(result.after.entries[0].lastAssessed,source(2));assert.deepEqual(result.after.lastObservation,source(2));assert.deepEqual(ctx,before);assert.deepEqual(result.evictions,[]);
 raw[0].explanation='changed';ctx.memory.entries[0].lastGrounded.evidence.quote='changed';assert.equal(result.transitions[0].explanation,'現在画像をもとに再評価した仮説');assert.equal(result.after.entries[0].lastGrounded.evidence.quote,'条件の案内1');result.before.entries[0].description='before only';assert.equal(result.after.entries[0].description,'元の条件');
});
for(const [change,status]of [['persists','unmet'],['resolved','satisfied'],['revised','unmet']]as const)test(change+' requires current grounding and preserves stable claim ID',()=>{
 const result=api.admitConditionContinuity([transition(change)],context(),record([condition('c1',status)]));assert.equal(result.after.entries[0].id,'o1_c1');assert.equal(result.after.entries[0].description,'利用条件を確認する');assert.equal(result.after.entries[0].currentStatus,status);assert.deepEqual(result.after.entries[0].lastGrounded,{status,evidence:evidence(2)});assert.equal(result.after.entries[0].transition,change);
});
test('uncertain revised claim retains lastGrounded and cannot turn uncertain evidence into a fact',()=>{
 const result=api.admitConditionContinuity([transition('revised')],context(),record([condition('c1','uncertain')]));assert.equal(result.after.entries[0].currentStatus,'uncertain');assert.deepEqual(result.after.entries[0].lastGrounded,memory().entries[0].lastGrounded);
});
test('new current claims are introduced with observation-scoped stable IDs',()=>{
 const ctx={schemaVersion:1,capacity:3,memory:api.emptyConditionContinuity(goal)},result=api.admitConditionContinuity([],ctx,record([condition('c3','satisfied',1)],1));assert.equal(result.after.entries[0].id,'o1_c3');assert.equal(result.after.entries[0].transition,'introduced');assert.equal(result.after.entries[0].currentStatus,'satisfied');assert.deepEqual(result.after.entries[0].lastGrounded,{status:'satisfied',evidence:evidence(1)});
});
test('new historical claims retain prior grounding while current status remains uncertain',()=>{
 const ctx={schemaVersion:1,capacity:3,memory:api.emptyConditionContinuity(goal)},result=api.admitConditionContinuity([],ctx,record([condition('c1','unmet',1)],2));assert.equal(result.after.entries[0].id,'o2_c1');assert.equal(result.after.entries[0].currentStatus,'uncertain');assert.deepEqual(result.after.entries[0].lastGrounded,{status:'unmet',evidence:evidence(1)});assert.equal(api.validateConditionContinuityContext({schemaVersion:1,capacity:3,memory:result.after},source(3),goal).memory.entries.length,1);
});
test('capacity evicts oldest claims explicitly and never calls eviction resolution',()=>{
 const result=api.admitConditionContinuity([transition('unobserved',null)],context(1),record([condition('c2'),condition('c3')]));assert.deepEqual(result.evictions,[{id:'o1_c1',reason:'capacity'},{id:'o2_c2',reason:'capacity'}]);assert.deepEqual(result.after.entries.map((entry:any)=>entry.id),['o2_c3']);assert.equal(result.after.entries[0].transition,'introduced');assert.equal(result.transitions[0].change,'unobserved');
});
test('mapping order does not reorder prior claims; additional conditions append in current record order',()=>{
 const ctx=context();ctx.memory.entries.push({...structuredClone(ctx.memory.entries[0]),id:'o1_c2'});
 const result=api.admitConditionContinuity([transition('persists','c2','o1_c2'),transition()],ctx,record([condition(),condition('c2'),condition('c3')]));assert.deepEqual(result.after.entries.map((e:any)=>e.id),['o1_c1','o1_c2','o2_c3']);
});
for(const [name,mutate]of [
 ['capacity0',(c:any)=>c.capacity=0],['capacity4',(c:any)=>c.capacity=4],['fractional capacity',(c:any)=>c.capacity=1.5],['extra context',(c:any)=>c.audit={}],['extra memory',(c:any)=>c.memory.fullHistory=[]],['extra claim',(c:any)=>c.memory.entries[0].confidence=.9],['extra source',(c:any)=>c.memory.lastObservation.label='hidden'],['extra grounding',(c:any)=>c.memory.entries[0].lastGrounded.extra=true],['extra evidence',(c:any)=>c.memory.entries[0].lastGrounded.evidence.label='hidden'],['wrong goal',(c:any)=>c.memory.goalSha256=hash('other')],['duplicate ID',(c:any)=>c.memory.entries.push(structuredClone(c.memory.entries[0]))],['future last observation',(c:any)=>c.memory.lastObservation=source(3)],['same observation',(c:any)=>c.memory.lastObservation=source(2)],['null last observation with entries',(c:any)=>c.memory.lastObservation=null],['cross-source hash conflict',(c:any)=>c.memory.entries[0].lastAssessed.imageSha256=hash('other')],['last assessed not latest',(c:any)=>c.memory.lastObservation=source(0)],['forged grounding hash',(c:any)=>c.memory.entries[0].lastGrounded.evidence.imageSha256=hash('other')],['future grounding',(c:any)=>c.memory.entries[0].lastGrounded.evidence=evidence(3)],['unverified marker forged',(c:any)=>c.memory.entries[0].lastGrounded.evidence.quoteStatus='verified'],['long description',(c:any)=>c.memory.entries[0].description='x'.repeat(201)],['control quote',(c:any)=>c.memory.entries[0].lastGrounded.evidence.quote='a\nb'],['false status',(c:any)=>c.memory.entries[0].currentStatus='satisfied'],['invalid stable ID',(c:any)=>c.memory.entries[0].id='c1'],['duplicate/mismatched origin',(c:any)=>c.memory.entries[0].id='o3_c1'],['over capacity',(c:any)=>{c.capacity=1;c.memory.entries.push({...structuredClone(c.memory.entries[0]),id:'o1_c2'});}],
]as const)test('context rejects '+name,()=>{const c=context();mutate(c);assert.throws(()=>api.validateConditionContinuityContext(c,source(2),goal));});
for(const [name,raw]of [
 ['missing prior',[]],['duplicate prior',[transition(),transition()]],['unknown prior',[transition('persists','c1','o9_c1')]],['unknown condition',[transition('persists','c3')]],['unobserved linked condition',[transition('unobserved','c1')]],['non-unobserved null',[transition('persists',null)]],['extra transition',[{...transition(),audit:'hidden'}]],['blank explanation',[{...transition(),explanation:' '}]],['long explanation',[{...transition(),explanation:'x'.repeat(161)}]],['control explanation',[{...transition(),explanation:'a\tb'}]],['bad change',[transition('invented')]],
]as const)test('admission rejects '+name,()=>assert.throws(()=>api.admitConditionContinuity(raw,context(),record())));
test('multiple prior claims cannot bind the same current condition',()=>{const ctx=context();ctx.memory.entries.push({...structuredClone(ctx.memory.entries[0]),id:'o1_c2'});assert.throws(()=>api.admitConditionContinuity([transition(),transition('persists','c1','o1_c2')],ctx,record()));});
test('historical, null or mismatched-hash evidence cannot revise, persist or resolve current status',()=>{
 for(const change of ['persists','resolved','revised'])for(const basis of [evidence(1),null,{...evidence(2),imageSha256:hash('forged')}]){const value=condition('c1',change==='resolved'?'satisfied':'unmet');value.evidence=basis as any;assert.throws(()=>api.admitConditionContinuity([transition(change)],context(),record([value])));}
 for(const [change,status]of [['persists','satisfied'],['persists','uncertain'],['resolved','unmet'],['resolved','uncertain'],['revised','satisfied']])assert.throws(()=>api.admitConditionContinuity([transition(change)],context(),record([condition('c1',status)])));
});
test('record goal/source/condition forgery is rejected before updating memory',()=>{
 for(const mutate of [(r:any)=>r.goalSha256=hash('other'),(r:any)=>r.source=source(1),(r:any)=>r.conditions.push(r.conditions[0]),(r:any)=>r.conditions[0].evidence.observationId='o9',(r:any)=>r.conditions[0].evidence.quoteStatus='verified',(r:any)=>r.conditions[0].extra=true]){const r=record();mutate(r);assert.throws(()=>api.admitConditionContinuity([transition()],context(),r));}
});
test('validation and every record field have independent ownership; instances do not share memory',()=>{
 const ctx=context(),copy=api.validateConditionContinuityContext(ctx,source(2),goal);copy.memory.entries[0].lastAssessed.imageSha256=hash('changed');assert.deepEqual(ctx,context());
 const r=record(),a=api.admitConditionContinuity([transition()],ctx,r),b=api.admitConditionContinuity([transition()],ctx,r);a.after.entries[0].lastGrounded.evidence.quote='a only';assert.equal(b.after.entries[0].lastGrounded.evidence.quote,'条件の案内2');r.conditions[0].description='changed';assert.equal(b.after.entries[0].description,'利用条件を確認する');assert.notEqual(a.before,a.after);
});
test('schema is closed and bounded for nonempty and empty prior memory; no empty enum is emitted',()=>{
 const schema=api.conditionContinuitySchema(context());assert.equal(schema.type,'array');assert.equal(schema.minItems,1);assert.equal(schema.maxItems,1);
 for(const branch of schema.items.anyOf){assert.equal(branch.additionalProperties,false);assert.deepEqual(branch.required,['priorId','conditionId','change','explanation']);assert.deepEqual(branch.properties.priorId.enum,['o1_c1']);}
 const empty=api.conditionContinuitySchema({schemaVersion:1,capacity:3,memory:api.emptyConditionContinuity(goal)});assert.equal(empty.minItems,0);assert.equal(empty.maxItems,0);assert.ok(!JSON.stringify(empty).includes('"enum":[]'));
});
/** Independent evaluator for the declared supported JSON Schema subset. */
function schemaAccepts(schema:any,value:unknown):boolean{
 for(const key of Object.keys(schema))assert.ok(['type','properties','required','additionalProperties','enum','anyOf','items','minItems','maxItems','pattern'].includes(key),'Unexpected schema keyword '+key);
 if(schema.anyOf)return schema.anyOf.some((branch:any)=>schemaAccepts(branch,value));
 if(schema.enum&&!schema.enum.some((item:unknown)=>Object.is(item,value)))return false;
 if(schema.type==='null')return value===null;
 if(schema.type==='string')return typeof value==='string'&&(!schema.pattern||new RegExp(schema.pattern,'u').test(value));
 if(schema.type==='array')return Array.isArray(value)&&value.length>=schema.minItems&&value.length<=schema.maxItems&&value.every(item=>schemaAccepts(schema.items,item));
 if(schema.type==='object'){if(value===null||typeof value!=='object'||Array.isArray(value))return false;const object=value as Record<string,unknown>;return schema.required.every((key:string)=>Object.hasOwn(object,key))&&Object.keys(object).every(key=>Object.hasOwn(schema.properties,key))&&Object.entries(object).every(([key,item])=>schemaAccepts(schema.properties[key],item));}
 throw Error('Unsupported schema type');
}
test('schema/admission agree on supported structural bounds and valid transition cases',()=>{
 const schema=api.conditionContinuitySchema(context());
 for(const change of ['persists','resolved','revised','unobserved']){const raw=[transition(change,change==='unobserved'?null:'c1')],r=record(change==='unobserved'?[]:[condition('c1',change==='resolved'?'satisfied':'unmet')]);assert.equal(schemaAccepts(schema,raw),true);assert.equal(api.admitConditionContinuity(raw,context(),r).transitions.length,1);}
 for(const raw of [[],[transition(),transition()],[transition('unobserved','c1')],[transition('persists',null)],[transition('unknown')],[transition('persists','c1','o9_c1')],[{...transition(),extra:true}],[{...transition(),explanation:''}],[{...transition(),explanation:' '}],[{...transition(),explanation:'x'.repeat(161)}],[{...transition(),explanation:'a\nb'}]]){assert.equal(schemaAccepts(schema,raw),false);assert.throws(()=>api.admitConditionContinuity(raw,context(),record()));}
 const valid=[{...transition(),explanation:'あ'.repeat(160)}];assert.equal(schemaAccepts(schema,valid),true);assert.equal(api.admitConditionContinuity(valid,context(),record()).transitions[0].explanation.length,160);
 const ctx={schemaVersion:1,capacity:3,memory:api.emptyConditionContinuity(goal)};assert.equal(schemaAccepts(api.conditionContinuitySchema(ctx),[]),true);assert.equal(api.admitConditionContinuity([],ctx,record([],1)).after.entries.length,0);
});
test('reappearing condition is explicitly reassessed with stable ID after uncertainty, then resolved',()=>{
 const unseen=api.admitConditionContinuity([transition('unobserved',null)],context(),record([]));
 const ctx={schemaVersion:1,capacity:3,memory:unseen.after},visible=api.admitConditionContinuity([transition('persists','c3')],ctx,record([condition('c3','unmet',3)],3));
 assert.equal(visible.after.entries[0].id,'o1_c1');assert.equal(visible.after.entries[0].currentStatus,'unmet');assert.deepEqual(visible.after.entries[0].lastGrounded.evidence,evidence(3));
 const resolved=api.admitConditionContinuity([transition('resolved','c2')],{...ctx,memory:visible.after},record([condition('c2','satisfied',4)],4));assert.equal(resolved.after.entries[0].id,'o1_c1');assert.equal(resolved.after.entries[0].currentStatus,'satisfied');assert.deepEqual(resolved.after.entries[0].lastGrounded.evidence,evidence(4));assert.equal(unseen.after.entries[0].lastGrounded.evidence.observationId,'o1');
});
test('new uncertain condition without evidence never invents grounded status',()=>{
 const value=condition('c1','uncertain',1);value.evidence=null as any;const result=api.admitConditionContinuity([],{schemaVersion:1,capacity:3,memory:api.emptyConditionContinuity(goal)},record([value],1));assert.equal(result.after.entries[0].lastGrounded,null);assert.equal(result.after.entries[0].currentStatus,'uncertain');
});
test('nonenumerable serialization hooks are neither invoked nor carried into validated snapshots',()=>{
 const ctx=context();for(const object of [ctx,ctx.memory,ctx.memory.entries[0],ctx.memory.entries[0].lastGrounded,ctx.memory.entries[0].lastGrounded.evidence])Object.defineProperty(object,'toJSON',{get(){throw Error('Serialization hook must never be read');}});
 const clean=api.validateConditionContinuityContext(ctx,source(2),goal);assert.doesNotThrow(()=>JSON.stringify(clean));assert.doesNotThrow(()=>JSON.stringify(api.admitConditionContinuity([transition()],ctx,record())));
 Object.defineProperty(ctx.memory.entries[0],'audit',{enumerable:true,get(){throw Error('UNKNOWN_GETTER_WAS_READ');}});assert.throws(()=>api.validateConditionContinuityContext(ctx,source(2),goal),/^Error: INVALID_CONDITION_CONTINUITY_DATA$/);
});
