import test from 'node:test';
import assert from 'node:assert/strict';
const api=await import('../jev/virtual-beta/visual-http-timing.js').catch(()=>({} as any));
function planner(){assert.equal(typeof api.planVisualHTTP,'function');return api.planVisualHTTP as (...args:unknown[])=>any;}
function validator(){assert.equal(typeof api.validateVisualHTTPDispatch,'function');return api.validateVisualHTTPDispatch as (value:unknown,expected:unknown)=>any;}
function plan(){return {schemaVersion:1,receivedTimeoutMs:30000,externalRemainingMs:null,adapterTimeoutMs:30000,adapterStartedMs:100,beforeNativeMs:350,reservationElapsedMs:250,plannedTimeoutMs:29750,limit:'extractor-timeout'};}
function dispatch(){return {...plan(),httpTimeoutMs:29750};}
for(const [name,received,external,start,before,adapter,elapsed,planned,limit] of [
 ['no external deadline',30000,null,100,350,30000,250,29750,'extractor-timeout'],
 ['shorter external deadline',30000,10000,100,350,10000,250,9750,'external-deadline'],
 ['later external deadline',30000,50000,100,350,30000,250,29750,'extractor-timeout'],
 ['external tie',30000,30000,100,350,30000,250,29750,'extractor-timeout'],
 ['minimum extractor timeout',1,null,0,0,1,0,1,'extractor-timeout'],
 ['minimum external budget',100,1,0,0,1,0,1,'external-deadline'],
 ['maximum safe external budget',30000,Number.MAX_SAFE_INTEGER,0,0,30000,0,30000,'extractor-timeout'],
 ['fractional clocks',100,null,1000.5,1001.75,100,1.25,98,'extractor-timeout'],
 ['nondecimal elapsed representation',30000,null,0.1,0.35,30000,0.24999999999999997,29999,'extractor-timeout'],
 ['addition before subtraction rounding',30000,null,65535.9,65535.9,30000,0,29999,'extractor-timeout'],
] as const)test('plans '+name+' with literal existing-order arithmetic',()=>{
 assert.deepEqual(planner()(received,external,start,before),{schemaVersion:1,receivedTimeoutMs:received,externalRemainingMs:external,adapterTimeoutMs:adapter,adapterStartedMs:start,beforeNativeMs:before,reservationElapsedMs:elapsed,plannedTimeoutMs:planned,limit});
});
for(const [name,args] of [
 ['zero external remaining',[30000,0,100,100]],['negative external remaining',[30000,-1,100,100]],['minimum safe external remaining',[30000,-Number.MAX_SAFE_INTEGER,100,100]],['exact reservation deadline',[30000,null,100,30100]],['reservation past deadline',[30000,null,100,30100.5]],['submillisecond remainder',[1,null,100,100.25]],['rounding below one millisecond',[1,null,65535.9,65535.9]],['finite clock loses precision',[30000,null,Number.MAX_VALUE,Number.MAX_VALUE]],
] as const)test('does not dispatch for '+name,()=>{assert.equal(planner()(...args),null);});
for(const [name,value] of [
 ['zero',0],['negative',-1],['over cap',30001],['fraction',1.25],['NaN',NaN],['positive infinity',Infinity],['negative infinity',-Infinity],['string','30000'],['null',null],['undefined',undefined],['object',{}],['array',[]],['bigint',30000n],
] as const)test('rejects received timeout '+name,()=>{assert.throws(()=>planner()(value,null,0,0),/INVALID_VISUAL_HTTP_TIMING/);});
for(const [name,value] of [
 ['fraction',1.5],['negative fraction',-0.5],['unsafe integer',Number.MAX_SAFE_INTEGER+1],['unsafe negative integer',-Number.MAX_SAFE_INTEGER-1],['NaN',NaN],['positive infinity',Infinity],['negative infinity',-Infinity],['string','100'],['undefined',undefined],['object',{}],['array',[]],['bigint',100n],
] as const)test('rejects external remaining '+name,()=>{assert.throws(()=>planner()(30000,value,0,0),/INVALID_VISUAL_HTTP_TIMING/);});
for(const [name,value] of [
 ['negative',-1],['negative fraction',-0.1],['NaN',NaN],['positive infinity',Infinity],['negative infinity',-Infinity],['string','0'],['null',null],['undefined',undefined],['object',{}],['array',[]],['bigint',0n],
] as const)for(const field of ['adapterStartedMs','beforeNativeMs'] as const)test('rejects '+field+' '+name,()=>{
 const args:unknown[]=field==='adapterStartedMs'?[30000,null,value,0]:[30000,null,0,value];assert.throws(()=>planner()(...args),/INVALID_VISUAL_HTTP_TIMING/);
});

test('invalid backwards clocks still throw when the external deadline has expired',()=>{
 assert.throws(()=>planner()(30000,0,10,9),/INVALID_VISUAL_HTTP_TIMING/);
 assert.throws(()=>planner()(30000,null,10,9),/INVALID_VISUAL_HTTP_TIMING/);
});

test('validator accepts only recomputed fields and returns an isolated copy',()=>{
 const input=dispatch(),result=validator()(input,30000);assert.deepEqual(result,{schemaVersion:1,receivedTimeoutMs:30000,externalRemainingMs:null,adapterTimeoutMs:30000,adapterStartedMs:100,beforeNativeMs:350,reservationElapsedMs:250,plannedTimeoutMs:29750,limit:'extractor-timeout',httpTimeoutMs:29750});assert.notEqual(result,input);
 input.httpTimeoutMs=1;assert.equal(result.httpTimeoutMs,29750);
 const fractional={schemaVersion:1,receivedTimeoutMs:100,externalRemainingMs:50,adapterTimeoutMs:50,adapterStartedMs:1000.5,beforeNativeMs:1001.75,reservationElapsedMs:1.25,plannedTimeoutMs:48,limit:'external-deadline',httpTimeoutMs:48};
 assert.deepEqual(validator()(fractional,100),fractional);
});

test('planner has no cross-call state and never invents an observed HTTP timeout',()=>{
 const first=planner()(30000,null,100,350),second=planner()(30000,null,100,350);assert.notEqual(first,second);assert.equal(Object.hasOwn(first,'httpTimeoutMs'),false);first.plannedTimeoutMs=1;assert.equal(second.plannedTimeoutMs,29750);
});
for(const [key,value] of [
 ['schemaVersion',2],['receivedTimeoutMs',29999],['externalRemainingMs',20000],['adapterTimeoutMs',29999],['adapterStartedMs',101],['beforeNativeMs',351],['reservationElapsedMs',251],['plannedTimeoutMs',29749],['limit','external-deadline'],['httpTimeoutMs',29749],
] as const)test('validator rejects tampered '+key,()=>{assert.throws(()=>validator()({...dispatch(),[key]:value},30000),/INVALID_VISUAL_HTTP_TIMING/);});
for(const [name,value] of [
 ['null',null],['array',[]],['empty object',{}],['extra key',{...dispatch(),httpReceived:true}],['plan without actual timeout',plan()],['zero external budget',{...dispatch(),externalRemainingMs:0}],['expired clock',{...dispatch(),beforeNativeMs:30100}],['string actual timeout',{...dispatch(),httpTimeoutMs:'29750'}],['NaN elapsed',{...dispatch(),reservationElapsedMs:NaN}],['infinite planned',{...dispatch(),plannedTimeoutMs:Infinity}],['unknown limit',{...dispatch(),limit:'provider-start'}],
] as const)test('closed validator rejects '+name,()=>{assert.throws(()=>validator()(value,30000),/INVALID_VISUAL_HTTP_TIMING/);});
for(const key of ['schemaVersion','receivedTimeoutMs','externalRemainingMs','adapterTimeoutMs','adapterStartedMs','beforeNativeMs','reservationElapsedMs','plannedTimeoutMs','limit','httpTimeoutMs'])test('validator rejects missing '+key,()=>{
 const input:any=dispatch();delete input[key];assert.throws(()=>validator()(input,30000),/INVALID_VISUAL_HTTP_TIMING/);
});
for(const expected of [29999,0,-1,30001,1.5,NaN,Infinity,'30000',null,undefined])test('validator rejects wrong expected timeout '+String(expected),()=>{
 assert.throws(()=>validator()(dispatch(),expected),/INVALID_VISUAL_HTTP_TIMING/);
});

test('unknown getters and implicit numeric coercion are never read',()=>{
 let reads=0;const input:any=dispatch();Object.defineProperty(input,'headers',{enumerable:true,get(){reads++;throw Error('UNKNOWN_FIELD_READ');}});
 assert.throws(()=>validator()(input,30000),/INVALID_VISUAL_HTTP_TIMING/);assert.equal(reads,0);
 const numeric={valueOf(){reads++;return 0;},toString(){reads++;return '0';}};
 assert.throws(()=>planner()(30000,null,numeric,0),/INVALID_VISUAL_HTTP_TIMING/);assert.equal(reads,0);
});
