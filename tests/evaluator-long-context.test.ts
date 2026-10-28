import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateBetaRequest} from '../runner/virtual-beta-evaluator.js';
import {ChoiceRequestError} from '../jev/client.js';
import type {ModelRequest} from '../runner/virtual-beta-core.js';
const request:ModelRequest={input:{goal:'Inspect the attached fixture'},questions:{nextAction:{type:'choice',instructions:'Choose from the visible controls',criteria:{done:'Done',stuck:'Stuck'}}},images:{current:{mediaType:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD1sAAAAASUVORK5CYII='}},timeoutMs:3000};

test('explicit long context preserves the exact request body and uses a single counted attempt; default stays unchanged',async()=>{
 const previousFetch=globalThis.fetch,previousKey=process.env.AI_GATEWAY_API_KEY,calls:Array<{headers:Record<string,string>;body:unknown}>=[];
 process.env.AI_GATEWAY_API_KEY='LOCAL_TEST_ONLY';
 globalThis.fetch=async(_url,options)=>{calls.push({headers:options!.headers as Record<string,string>,body:JSON.parse(String(options!.body))});return Response.json({model:'jev-1.14.0',answers:{nextAction:{choice:'done',probabilities:{done:1,stuck:0}}}});};
 try{
  const normal=await evaluateBetaRequest(request),long=await (evaluateBetaRequest as any)(request,{longContext:true});
  assert.equal(calls.length,2);assert.equal(calls[0].headers['TypeSafe-Danger-Zone-Long-Context'],undefined);assert.equal(calls[1].headers['TypeSafe-Danger-Zone-Long-Context'],'true');
  assert.deepEqual(calls[0].body,calls[1].body);assert.equal(normal.request?.attempts,1);assert.equal(normal.request?.longContext,undefined);assert.equal(long.request?.attempts,1);assert.equal(long.request?.longContext,true);
 }finally{globalThis.fetch=previousFetch;if(previousKey===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=previousKey;}
});

test('a long-context failure retains safe evidence and never hides a retry outside the phase budget',async()=>{
 const previousFetch=globalThis.fetch,previousKey=process.env.AI_GATEWAY_API_KEY;let calls=0;process.env.AI_GATEWAY_API_KEY='LOCAL_TEST_ONLY';
 globalThis.fetch=async(_url,options)=>{calls++;assert.equal((options!.headers as Record<string,string>)['TypeSafe-Danger-Zone-Long-Context'],'true');return Response.json({error:{code:'max_tokens_exceeded',private:'DO_NOT_RETAIN_PROVIDER_DATA'}},{status:400});};
 try{
  await assert.rejects((evaluateBetaRequest as any)(request,{longContext:true}),(error:unknown)=>{assert.ok(error instanceof ChoiceRequestError);assert.equal(error.failure.code,'HTTP_ERROR');assert.equal(error.failure.providerCode,'max_tokens_exceeded');assert.equal(error.request?.attempts,1);assert.equal(error.request?.longContext,true);assert.ok(!JSON.stringify(error).includes('DO_NOT_RETAIN_PROVIDER_DATA'));return true;});
  assert.equal(calls,1);
 }finally{globalThis.fetch=previousFetch;if(previousKey===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=previousKey;}
});
