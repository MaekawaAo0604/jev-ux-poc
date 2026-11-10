import test from 'node:test';import assert from 'node:assert/strict';
const api=await import('../runner/persona-task-comparison.js').catch(()=>({}as any));
test('36 scheduled slots preserve each task/actor/replicate and do not encode actor-specific actions',()=>{
 assert.equal(typeof api.personaTaskSchedule,'function');const s=api.personaTaskSchedule();assert.equal(s.length,36);assert.equal(new Set(s.map((x:any)=>x.id)).size,36);
 for(const task of ['sessions','preferences','privacy'])for(const actor of ['baseline','A','B','C'])assert.deepEqual(s.filter((x:any)=>x.fixture.task===task&&x.actor===actor).map((x:any)=>x.replicate),[1,2,3]);
 assert.deepEqual(s.map((x:any)=>x.sequence),Array.from({length:36},(_,i)=>i+1));assert.ok(s.every((x:any)=>!Object.hasOwn(x,'actions')));
});
test('initial input equality is within task, removes only Persona, and invalidates mismatches',()=>{
 assert.equal(typeof api.personaTaskInitialInputs,'function');let ordinal=0;const row=(task:string,actor:string,hash:string,input:any)=>({sequence:++ordinal,actor,fixture:{version:1,task},initialImageSha256:hash,result:{steps:[{assetFiles:{current:{sha256:hash}},visualHypotheses:{request:input,assetFiles:{current:{file:'s1-current.png',sha256:hash}}}}]}});
 const a=row('sessions','baseline','a',{goal:'g',persona:null}),b=row('sessions','A','a',{goal:'g',persona:{id:'A'}}),c=row('privacy','baseline','b',{goal:'h'});assert.ok(api.personaTaskInitialInputs([a,b,c]).every((x:any)=>x.matched));
 const wrong=row('sessions','C','a',{goal:'leaked'});api.personaTaskInitialInputs([a,wrong]);assert.equal((wrong as any).error.code,'INITIAL_NONPERSONA_INPUT_MISMATCH');
});
