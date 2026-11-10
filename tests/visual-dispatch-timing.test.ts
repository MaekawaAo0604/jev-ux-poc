import test from 'node:test';
import assert from 'node:assert/strict';
const api=await import('../runner/visual-dispatch-timing.js').catch(()=>({} as any));
function planner(){assert.equal(typeof api.planVisualDispatch,'function');return api.planVisualDispatch as (maximum:unknown,elapsed:unknown)=>any;}
function validator(){assert.equal(typeof api.validateVisualDispatch,'function');return api.validateVisualDispatch as (value:unknown,maximum:unknown)=>any;}
function timing(){return {schemaVersion:1,maxRunMs:180000,elapsedRunMs:150000,remainingRunMs:30000,requestCapMs:30000,timeoutMs:30000,limit:'run-remaining'};}
const cases=[
 ['full run',180000,0,180000,30000,'request-cap'],
 ['one millisecond above request cap',180000,149999,30001,30000,'request-cap'],
 ['equal request cap',180000,150000,30000,30000,'run-remaining'],
 ['fractional elapsed',180000,150000.25,29999,29999,'run-remaining'],
 ['floor creates cap tie',30001,0.5,30000,30000,'run-remaining'],
 ['run equals cap',30000,0,30000,30000,'run-remaining'],
 ['run below cap',29999,0,29999,29999,'run-remaining'],
 ['one millisecond run',1,0,1,1,'run-remaining'],
 ['fractional remaining floors to one',2,0.25,1,1,'run-remaining'],
 ['late fractional elapsed',180000,179998.75,1,1,'run-remaining'],
 ['largest safe run',Number.MAX_SAFE_INTEGER,0,Number.MAX_SAFE_INTEGER,30000,'request-cap'],
] as const;
for(const [name,maximum,elapsed,remaining,timeout,limit] of cases)test('plans '+name+' using literal floor and cap expectations',()=>{
 assert.deepEqual(planner()(maximum,elapsed),{schemaVersion:1,maxRunMs:maximum,elapsedRunMs:elapsed,remainingRunMs:remaining,requestCapMs:30000,timeoutMs:timeout,limit});
});
for(const [name,maximum,elapsed] of [
 ['fractional final millisecond',100,99.1],['one-millisecond fractional run',1,0.1],['deadline',100,100],['past deadline',100,100.001],['finite elapsed beyond safe integer',100,Number.MAX_VALUE],
] as const)test('does not dispatch at '+name,()=>{assert.equal(planner()(maximum,elapsed),null);});
for(const [name,value] of [
 ['zero',0],['negative',-1],['fraction',1.25],['NaN',NaN],['positive infinity',Infinity],['negative infinity',-Infinity],['unsafe integer',Number.MAX_SAFE_INTEGER+1],['string','180000'],['null',null],['undefined',undefined],['object',{}],['array',[]],['bigint',180000n],
] as const)test('rejects invalid maxRunMs '+name,()=>{assert.throws(()=>planner()(value,0),/INVALID_VISUAL_DISPATCH_TIMING/);});
for(const [name,value] of [
 ['negative',-1],['negative fraction',-0.25],['NaN',NaN],['positive infinity',Infinity],['negative infinity',-Infinity],['string','0'],['null',null],['undefined',undefined],['object',{}],['array',[]],['bigint',0n],
] as const)test('rejects invalid elapsedRunMs '+name,()=>{assert.throws(()=>planner()(180000,value),/INVALID_VISUAL_DISPATCH_TIMING/);});

test('validated timing is an independent copy with exact arithmetic',()=>{
 const input=timing(),output=validator()(input,180000);assert.deepEqual(output,{schemaVersion:1,maxRunMs:180000,elapsedRunMs:150000,remainingRunMs:30000,requestCapMs:30000,timeoutMs:30000,limit:'run-remaining'});assert.notEqual(output,input);
 input.timeoutMs=1;assert.equal(output.timeoutMs,30000);
 const fractional={schemaVersion:1,maxRunMs:180000,elapsedRunMs:150000.25,remainingRunMs:29999,requestCapMs:30000,timeoutMs:29999,limit:'run-remaining'};
 assert.deepEqual(validator()(fractional,180000),fractional);
});

test('planner has no shared result state across runs',()=>{
 const first=planner()(180000,0),second=planner()(180000,0);assert.notEqual(first,second);first.timeoutMs=1;assert.equal(second.timeoutMs,30000);
});
for(const [key,value] of [
 ['schemaVersion',2],['maxRunMs',180001],['elapsedRunMs',150001],['remainingRunMs',30001],['requestCapMs',30001],['timeoutMs',29999],['limit','request-cap'],
] as const)test('rejects tampered '+key,()=>{assert.throws(()=>validator()({...timing(),[key]:value},180000),/INVALID_VISUAL_DISPATCH_TIMING/);});
for(const [name,value] of [
 ['null',null],['array',[]],['empty object',{}],['extra field',{...timing(),httpReceived:true}],['expired',{...timing(),elapsedRunMs:180000,remainingRunMs:0,timeoutMs:0}],['unknown limit',{...timing(),limit:'provider-start'}],['string timeout',{...timing(),timeoutMs:'30000'}],['string maximum',{...timing(),maxRunMs:'180000'}],['NaN elapsed',{...timing(),elapsedRunMs:NaN}],['infinite remaining',{...timing(),remainingRunMs:Infinity}],
] as const)test('closed validator rejects '+name,()=>{assert.throws(()=>validator()(value,180000),/INVALID_VISUAL_DISPATCH_TIMING/);});
for(const key of ['schemaVersion','maxRunMs','elapsedRunMs','remainingRunMs','requestCapMs','timeoutMs','limit'])test('rejects missing '+key,()=>{
 const value:any=timing();delete value[key];assert.throws(()=>validator()(value,180000),/INVALID_VISUAL_DISPATCH_TIMING/);
});
for(const expected of [179999,0,-1,1.5,NaN,Infinity,'180000',null,undefined])test('validator rejects mismatched or invalid expected maximum '+String(expected),()=>{
 assert.throws(()=>validator()(timing(),expected),/INVALID_VISUAL_DISPATCH_TIMING/);
});

test('closed validator rejects unknown getters without reading them or coercing values',()=>{
 let reads=0;const value:any=timing();Object.defineProperty(value,'audit',{enumerable:true,get(){reads++;throw Error('UNKNOWN_FIELD_READ');}});
 assert.throws(()=>validator()(value,180000),/INVALID_VISUAL_DISPATCH_TIMING/);assert.equal(reads,0);
 const numeric={valueOf(){reads++;return 0;},toString(){reads++;return '0';}};
 assert.throws(()=>planner()(180000,numeric),/INVALID_VISUAL_DISPATCH_TIMING/);assert.equal(reads,0);
});
