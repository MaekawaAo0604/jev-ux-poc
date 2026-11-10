import test from'node:test';import assert from'node:assert/strict';const api=await import('../runner/persona-beta-comparison.js');
test('initial non-Persona mismatch marks the affected row invalid before path aggregation, while Persona differences are allowed',()=>{
 assert.equal(typeof(api as any).personaInitialInputs,'function');
 const row=(sequence:number,persona:any)=>({sequence,actor:persona?'A':'baseline',initialImageSha256:'product',result:{steps:[{assetFiles:{current:{sha256:'image'}},visualHypotheses:{request:{goal:'same',...(persona?{persona}:{})},assetFiles:{current:{file:'input-1.png',sha256:'image'}}}}]}});
 const rows:any[]=[row(1,null),row(2,{id:'A'})];assert.ok((api as any).personaInitialInputs(rows).every((x:any)=>x.matched));assert.equal(rows[1].error,undefined);
 rows[1].initialImageSha256='changed-product';const checks=(api as any).personaInitialInputs(rows);assert.equal(checks[1].matched,false);assert.equal(rows[1].error.code,'INITIAL_NONPERSONA_INPUT_MISMATCH');assert.equal(rows[0].error,undefined);
});
