import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createUserState,updateUserState} from '../jev/virtual-beta/user-state.js';
import {createSampler,replaySelection,InvalidDistributionError} from '../jev/virtual-beta/selection.js';
import type {BetaCandidates,UserObservation} from '../jev/virtual-beta/contracts.js';
import type {Persona} from '../jev/persona.js';

const candidates:BetaCandidates={a:{action:{type:'reread'},label:'Read again'},b:{action:{type:'abandon'},label:'Leave'}};
const observation=(id:string):UserObservation=>({id,imageSha256:`image-${id}`,visibleText:[`visible ${id}`],fixation:{x:30,y:40},candidateIds:['a','b']});
const persona:Persona={schemaVersion:1,id:'P',name:'Person',itLiteracy:'ordinary',serviceExperience:'new',knowledge:[],expectations:['A receipt is available'],behavioralTendencies:[],contextAndConstraints:[]};

test('sampling consumes probability mass even when model choice and argmax differ',()=>{
 const sample=createSampler({mode:'sample',seed:1}).select('a',{a:0.75,b:0.25},candidates);
 assert.equal(sample.selected,'b');
 assert.equal(sample.modelChoice,'a');
 assert.equal(sample.draw,0.8838632628321648);
 assert.equal(createSampler({mode:'sample',seed:1}).select('b',{a:0.75,b:0.25},candidates).selected,'b');
 assert.equal(createSampler({mode:'sample',seed:1}).select('a',{a:0.95,b:0.05},candidates).selected,'a');
 assert.equal(createSampler({mode:'argmax',seed:1}).select('b',{a:0.75,b:0.25},candidates).selected,'a');
});

test('deterministic sampling replays each draw independently and starts fresh per sampler',()=>{
 const sampler=createSampler({mode:'sample',seed:2});
 const records=Array.from({length:8},()=>sampler.select('a',{a:0.4,b:0.6},candidates));
 assert.deepEqual(records.map(r=>r.drawIndex),[0,1,2,3,4,5,6,7]);
 for(const record of records)assert.deepEqual(replaySelection(JSON.parse(JSON.stringify(record)),candidates),record);
 assert.deepEqual(createSampler({mode:'sample',seed:2}).select('a',{a:0.4,b:0.6},candidates),records[0]);
});

test('argmax ties and sampling intervals use sorted candidate keys',()=>{
 const reversed:BetaCandidates={b:candidates.b,a:candidates.a};
 const argmax=createSampler({mode:'argmax',seed:0}).select('b',{b:0.5,a:0.5},reversed);
 assert.equal(argmax.selected,'a');assert.equal(argmax.draw,null);
 const a=createSampler({mode:'sample',seed:2}).select('b',{b:0.5,a:0.5},reversed);
 assert.equal(a.selected,'a');
});

test('records raw normalization separately from safety filtering without removing revisits',()=>{
 const record=createSampler({mode:'sample',seed:0}).select('a',{a:0.5,b:0.49},candidates,{a:'charter prohibits this action'});
 assert.deepEqual(record.raw,{a:0.5,b:0.49});
 assert.deepEqual(record.normalized,{a:0.5/0.99,b:0.49/0.99});
 assert.deepEqual(record.filtered,{a:0,b:1});
 assert.deepEqual(record.normalization,{rawTotal:0.99,filteredTotal:0.49/0.99});
 assert.deepEqual(record.adjustments,[{candidate:'a',reason:'charter prohibits this action'}]);
 assert.equal(record.modelChoice,'a');assert.equal(record.selected,'b');
 assert.deepEqual(replaySelection(record,candidates),record);
 const noFilter=createSampler({mode:'argmax',seed:0}).select('a',{a:1,b:0},candidates);
 assert.equal(noFilter.selected,'a');assert.deepEqual(noFilter.adjustments,[]);
});

test('selection records own deep copies and cannot alter later draws',()=>{
 const raw={a:0.75,b:0.25},config={mode:'sample' as const,seed:1},excluded={a:'forbidden'};
 const sampler=createSampler(config),record=sampler.select('a',raw,candidates,excluded);
 raw.a=0;config.seed=2;excluded.a='changed';
 assert.equal(record.raw.a,0.75);assert.equal(record.seed,1);assert.equal(record.adjustments[0].reason,'forbidden');
 record.raw.a=99;record.filtered.b=0;
 const next=sampler.select('a',{a:0.75,b:0.25},candidates);
 assert.equal(next.seed,1);assert.equal(next.drawIndex,1);assert.equal(next.raw.a,0.75);
});

test('invalid seeds and modes fail closed with recognizable errors',()=>{
 for(const seed of [-1,1.5,NaN,Infinity,4294967296])assert.throws(()=>createSampler({mode:'sample',seed}),InvalidDistributionError);
 assert.throws(()=>createSampler({mode:'other' as 'sample',seed:0}),InvalidDistributionError);
});

test('invalid candidate and distribution shapes fail closed without consuming a draw',()=>{
 const sampler=createSampler({mode:'sample',seed:1});
 const invalid:Record<string,number>[]=[{a:1},{a:1,b:0,c:0},{a:NaN,b:1},{a:Infinity,b:0},{a:-0.1,b:1.1},{a:1.01,b:0},{a:0,b:0},{a:0.2,b:0.2}];
 for(const raw of invalid){
  assert.throws(()=>sampler.select('a',raw,candidates),InvalidDistributionError);
 }
 assert.throws(()=>sampler.select('unknown',{a:0.5,b:0.5},candidates),InvalidDistributionError);
 assert.throws(()=>sampler.select('a',{a:0.5,b:0.5},candidates,{unknown:'forbidden'}),InvalidDistributionError);
 assert.throws(()=>sampler.select('a',{a:0.5,b:0.5},candidates,{a:''}),InvalidDistributionError);
 assert.throws(()=>sampler.select('a',{a:1,b:0},candidates,{a:'forbidden'}),InvalidDistributionError);
 assert.throws(()=>sampler.select('a',{},{}),InvalidDistributionError);
 assert.equal(sampler.select('a',{a:0.75,b:0.25},candidates).drawIndex,0);
});

test('replay rejects modified draw, selection, normalization, exclusions and key sets',()=>{
 const record=createSampler({mode:'sample',seed:1}).select('a',{a:0.75,b:0.25},candidates);
 for(const changed of [{...record,draw:0},{...record,selected:'a'},{...record,drawIndex:-1},{...record,drawIndex:1.1},{...record,normalized:{a:0.5,b:0.5}},{...record,filtered:{a:1,b:0}},{...record,adjustments:[{candidate:'x',reason:'forbidden'}]},{...record,normalization:{rawTotal:99,filteredTotal:1}}])assert.throws(()=>replaySelection(changed,candidates),InvalidDistributionError);
 assert.throws(()=>replaySelection(record,{a:candidates.a}),InvalidDistributionError);
});

test('new user states copy persona expectations and have no cross-run memory',()=>{
 const p=structuredClone(persona),point={x:1,y:2},state=createUserState(p,point);
 p.expectations[0]='changed';point.x=99;
 assert.deepEqual(state.expectations,['A receipt is available']);assert.deepEqual(state.fixation,{x:1,y:2});
 const after=updateUserState(state,observation('1'),{enabled:true,memoryCapacity:2});
 assert.equal(after.memory.length,1);
 assert.deepEqual(createUserState(persona,{x:1,y:2}).memory,[]);
 assert.deepEqual(createUserState(undefined,{x:1,y:2}).expectations,[]);
});

test('state caps observations, copies nested values and preserves fixed expectations',()=>{
 const initial=createUserState(persona,{x:1,y:2}),obs=observation('1'),action={type:'look' as const,point:{x:10,y:20}};
 const first=updateUserState(initial,obs,{enabled:true,memoryCapacity:2},{action,outcome:'performed'});
 obs.visibleText[0]='mutated';obs.fixation.x=99;obs.candidateIds.push('hidden');action.point.x=99;
 assert.deepEqual(first.lastObservation,observation('1'));
 assert.deepEqual(first.memory[0],{observationId:'1',imageSha256:'image-1',visibleText:['visible 1'],action:{type:'look',point:{x:10,y:20}},outcome:'performed'});
 assert.deepEqual(initial.memory,[]);assert.equal(initial.revision,0);assert.equal(first.revision,1);
 const second=updateUserState(first,observation('2'),{enabled:true,memoryCapacity:2});
 second.memory[0].visibleText[0]='second mutated';second.expectations[0]='second expectation';
 assert.equal(first.memory[0].visibleText[0],'visible 1');assert.equal(first.expectations[0],'A receipt is available');
 const third=updateUserState(first,observation('3'),{enabled:true,memoryCapacity:1});
 assert.deepEqual(third.memory.map(m=>m.observationId),['3']);assert.deepEqual(third.fixation,{x:30,y:40});
});

test('disabled state clears all retained observation memory and expectations',()=>{
 const enabled=updateUserState(createUserState(persona,{x:1,y:2}),observation('1'),{enabled:true,memoryCapacity:2});
 const disabled=updateUserState(enabled,observation('2'),{enabled:false,memoryCapacity:2},{action:{type:'wait'},outcome:'unchanged'});
 assert.deepEqual(disabled.memory,[]);assert.deepEqual(disabled.expectations,[]);assert.equal(disabled.lastObservation,undefined);
 assert.deepEqual(disabled.fixation,{x:30,y:40});assert.equal(disabled.revision,2);
 assert.deepEqual(updateUserState(disabled,observation('3'),{enabled:true,memoryCapacity:0}).memory,[]);
});

test('state admits only observation/action fields and never audit history',()=>{
 const dirty={...observation('1'),history:[{secret:'audit'}],hiddenDOM:'unseen',title:'unseen'};
 const dirtyState={...createUserState(persona,{x:1,y:2}),audit:[{secret:'audit'}]};
 const dirtyAction={type:'look' as const,point:{x:10,y:20,hiddenDOM:'unseen'},history:['audit']};
 const state=updateUserState(dirtyState,dirty,{enabled:true,memoryCapacity:2},{action:dirtyAction,outcome:'performed'});
 assert.ok(!JSON.stringify(state).includes('audit'));assert.ok(!JSON.stringify(state).includes('unseen'));
 assert.deepEqual(Object.keys(state).sort(),['expectations','fixation','lastObservation','memory','revision','schemaVersion']);
});

test('invalid memory capacities fail before state mutation',()=>{
 const state=createUserState(persona,{x:1,y:2});
 for(const memoryCapacity of [-1,1.5,NaN,Infinity])assert.throws(()=>updateUserState(state,observation('1'),{enabled:true,memoryCapacity}));
 assert.equal(state.revision,0);
});


test('zero surviving mass preserves validated filter evidence without selecting or consuming a draw',()=>{
 const raw={a:0.5,b:0.49},excluded={b:'look budget exhausted',a:'charter prohibits this action'};
 const sampler=createSampler({mode:'sample',seed:1});
 let failure:InvalidDistributionError|undefined;
 try{sampler.select('a',raw,candidates,excluded);}catch(error){assert.ok(error instanceof InvalidDistributionError);failure=error;}
 assert.ok(failure);
 assert.deepEqual(failure.details,{
  stage:'filter',reason:'ZERO_SURVIVING_MASS',raw:{a:0.5,b:0.49},normalized:{a:0.5/0.99,b:0.49/0.99},filteredWeights:{a:0,b:0},
  normalization:{rawTotal:0.99,filteredTotal:0},adjustments:[{candidate:'a',reason:'charter prohibits this action'},{candidate:'b',reason:'look budget exhausted'}]
 });
 assert.ok(!Object.hasOwn(failure.details!,'selected'));assert.ok(!Object.hasOwn(failure.details!,'draw'));
 raw.a=0;excluded.a='changed';
 assert.equal(failure.details!.raw.a,0.5);assert.equal(failure.details!.adjustments[0].reason,'charter prohibits this action');
 assert.equal(sampler.select('a',{a:0.75,b:0.25},candidates).drawIndex,0);
});

test('invalid raw distributions and malformed exclusions never echo unsafe input as failure details',()=>{
 const sampler=createSampler({mode:'sample',seed:1});
 for(const raw of [{a:NaN,b:1},{a:-1,b:2},{a:0.25,b:0.25}]){
  assert.throws(()=>sampler.select('a',raw,candidates,{a:'forbidden',b:'forbidden'}),(error:unknown)=>error instanceof InvalidDistributionError&&error.details===undefined);
 }
 assert.throws(()=>sampler.select('a',{a:0.5,b:0.5},candidates,{unknown:'untrusted input'}),(error:unknown)=>error instanceof InvalidDistributionError&&error.details===undefined);
});
