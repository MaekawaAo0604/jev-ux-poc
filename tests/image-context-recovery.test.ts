import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {captureVisualObservation,recordVisualCompletion} from '../runner/visual-evidence.js';
import {evaluateChoices,ChoiceRequestError,type ChoiceQuestion} from '../jev/client.js';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
const overflow=()=>Response.json({error:{type:'AI_APICallError',message:'{"error_type":"max_tokens_exceeded"}',private:'PRIVATE_PROVIDER_DATA'}},{status:400});
function answer(q:Record<string,ChoiceQuestion>){return {model:'TEST',answers:Object.fromEntries(Object.entries(q).map(([id,v])=>{const choice=id==='readability'?'readable':id==='relevance'?'related':id==='completion'?'insufficient':'irrelevant';return [id,{choice,probabilities:Object.fromEntries(Object.keys(v.criteria).map(k=>[k,Number(k===choice)]))}];}))};}

test('production image audit recovers a context overflow once without dropping or changing images, Goal, questions or ordering',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'jev-context-')),observations=[];
 for(let i=1;i<=2;i++){const file=`step-${i}.png`;await writeFile(join(dir,file),png);observations.push(captureVisualObservation(png,i,file,'http://local.test/'));}
 const original=globalThis.fetch,key=process.env.AI_GATEWAY_API_KEY;process.env.AI_GATEWAY_API_KEY='LOCAL_TEST_ONLY';
 const calls:{body:any;long:boolean}[]=[];let completions=0;
 globalThis.fetch=async(_url,init)=>{
  const body=JSON.parse(String(init?.body)),long=new Headers(init?.headers).get('TypeSafe-Danger-Zone-Long-Context')==='true';calls.push({body,long});
  if(body.questions.completion&&++completions===1)return overflow();
  return Response.json(answer(body.questions));
 };
 try{
  const audit=await recordVisualCompletion('料金と受付時間を知りたい','2026-10-19',dir,observations);
  assert.equal(audit.status,'RECORDED');assert.equal(audit.assessment,'insufficient');assert.equal(audit.objectiveVerified,false);
  assert.equal(calls.length,4);assert.deepEqual(calls.map(c=>c.long),[false,false,false,true]);
  assert.deepEqual(calls[2].body,calls[3].body);assert.equal(Object.keys(calls[3].body.assets).length,2);
  assert.deepEqual(calls[3].body.state.observations.map((o:any)=>o.id),['v1','v2']);assert.equal(calls[3].body.state.goal,'料金と受付時間を知りたい');
  assert.equal((audit.requests.at(-1)?.request as any).longContext,true);
  assert.equal(audit.requests.at(-1)?.request?.attempts,2);
  assert.deepEqual(audit.requests.at(-1)?.request?.failures,[{code:'HTTP_ERROR',statusCode:400,providerCode:'max_tokens_exceeded'}]);
  assert.doesNotMatch(JSON.stringify(audit),/PRIVATE_PROVIDER_DATA|AI_APICallError|LOCAL_TEST_ONLY/);
 }finally{globalThis.fetch=original;if(key===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=key;}
});

test('context recovery never enables long context for ordinary exploration or for unrelated HTTP400 failures',async()=>{
 const original=globalThis.fetch,key=process.env.AI_GATEWAY_API_KEY;process.env.AI_GATEWAY_API_KEY='LOCAL_TEST_ONLY';
 const q={completion:{type:'choice' as const,instructions:'Inspect pixels.',criteria:{insufficient:'Missing information'}}};
 try{
  for(const [optIn,response] of [[false,overflow],[true,()=>Response.json({error:{message:'{"error_type":"invalid_image"}'}},{status:400})],[true,()=>new Response('max_tokens_exceeded PRIVATE',{status:400})]] as const){
   let count=0;globalThis.fetch=async(_url,init)=>{count++;assert.equal(new Headers(init?.headers).has('TypeSafe-Danger-Zone-Long-Context'),false);return response();};
   await assert.rejects(evaluateChoices({goal:'Read'},q,{maxAttempts:3,maxElapsedMs:1000},{images:{opaque:{mediaType:'image/png',data:png.toString('base64')}},recoverContextLimit:optIn}),ChoiceRequestError);
   assert.equal(count,1);
  }
 }finally{globalThis.fetch=original;if(key===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=key;}
});

test('overflow recovery honors the attempt cap and never retries a second long-context overflow',async()=>{
 const original=globalThis.fetch,key=process.env.AI_GATEWAY_API_KEY;process.env.AI_GATEWAY_API_KEY='LOCAL_TEST_ONLY';
 const q={completion:{type:'choice' as const,instructions:'Inspect pixels.',criteria:{insufficient:'Missing information'}}};
 try{
  for(const maxAttempts of [1,3]){
   const modes:boolean[]=[];globalThis.fetch=async(_url,init)=>{modes.push(new Headers(init?.headers).get('TypeSafe-Danger-Zone-Long-Context')==='true');return overflow();};
   await assert.rejects(evaluateChoices({},q,{maxAttempts,maxElapsedMs:1000},{images:{opaque:{mediaType:'image/png',data:png.toString('base64')}},recoverContextLimit:true}),e=>{
    assert.ok(e instanceof ChoiceRequestError);assert.equal(e.request?.attempts,maxAttempts===1?1:2);assert.doesNotMatch(JSON.stringify(e),/PRIVATE/);return true;
   });
   assert.deepEqual(modes,maxAttempts===1?[false]:[false,true]);
  }
 }finally{globalThis.fetch=original;if(key===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=key;}
});

test('a deadline expiring after overflow blocks the long-context attempt within the original request budget',async()=>{
 const original=globalThis.fetch,key=process.env.AI_GATEWAY_API_KEY;process.env.AI_GATEWAY_API_KEY='LOCAL_TEST_ONLY';let calls=0,retries=0;
 globalThis.fetch=async()=>{calls++;return overflow();};
 try{
  await assert.rejects(evaluateChoices({}, {completion:{type:'choice',instructions:'Inspect pixels.',criteria:{insufficient:'Missing information'}}},
   {maxAttempts:3,maxElapsedMs:100,onProgress:async event=>{if(event.phase==='retry'){retries++;await new Promise(r=>setTimeout(r,120));}}},
   {images:{opaque:{mediaType:'image/png',data:png.toString('base64')}},recoverContextLimit:true}),error=>{
    assert.ok(error instanceof ChoiceRequestError);assert.equal(error.request?.attempts,1);assert.equal(error.request?.budgetExhausted,true);
    assert.equal(error.request?.longContext,undefined);assert.doesNotMatch(JSON.stringify(error),/PRIVATE/);return true;
   });
  assert.equal(calls,1);assert.equal(retries,1);
 }finally{globalThis.fetch=original;if(key===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=key;}
});
