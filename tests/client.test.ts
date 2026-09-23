import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evaluateChoices,ChoiceRequestError} from '../jev/client.js';
import {parseDecision} from '../jev/decide.js';
import {recordCompletion} from '../jev/completion.js';

const questions={nextAction:{type:'choice' as const,instructions:'Choose',criteria:{done:'Done',stuck:'Stuck'}}};
const answer={answers:{nextAction:{type:'choice',choice:'done',probabilities:{done:1,stuck:0}}},warnings:[]};
// Replace only the external provider. Keep SDK validation and the production client.
async function provider(run:()=>Promise<void>,respond:(input:any)=>Promise<any>){
 const previous=globalThis.AI_SDK_DEFAULT_PROVIDER,key=process.env.AI_GATEWAY_API_KEY;
 globalThis.AI_SDK_DEFAULT_PROVIDER={evaluationModel:()=>({specificationVersion:'v4',provider:'TEST',modelId:'TEST',supportedQuestionTypes:['choice'],doEvaluate:respond})} as any;
 process.env.AI_GATEWAY_API_KEY='LOCAL_TEST_ONLY';
 try{await run();}finally{globalThis.AI_SDK_DEFAULT_PROVIDER=previous;if(key===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=key;}
}

test('a transient failure retries the same judgment and preserves safe recovery metadata',async()=>{
 let calls=0;const state={goal:'Read the page'};
 await provider(async()=>{
  const result=await evaluateChoices(state,questions);
  assert.equal(result.answers.nextAction.choice,'done');
  assert.equal(calls,2);
  assert.deepEqual((result as any).request,{attempts:2,failures:[{code:'HTTP_ERROR',statusCode:503}]});
  const decision=parseDecision(result,{done:{action:{type:'done'},label:'Done'},stuck:{action:{type:'stuck'},label:'Stuck'}});
  assert.deepEqual((decision as any).request,(result as any).request);
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE/);
 },async input=>{
  assert.deepEqual(input.state,state);assert.deepEqual(input.questions,questions);
  if(++calls===1)throw Object.assign(new Error('PRIVATE_KEY'),{statusCode:503,requestBody:'PRIVATE_BODY'});
  return answer;
 });
});

test('persistent transient failure stops after three requests and never exposes raw errors',async()=>{
 let calls=0;
 await provider(async()=>{
  await assert.rejects(evaluateChoices({},questions),e=>{
   assert.ok(e instanceof ChoiceRequestError);assert.equal(calls,3);
   assert.deepEqual((e as any).request,{attempts:3,failures:Array.from({length:3},()=>({code:'HTTP_ERROR',statusCode:503}))});
   assert.doesNotMatch(JSON.stringify(e),/PRIVATE/);return true;
  });
 },async()=>{calls++;throw Object.assign(new Error('PRIVATE'),{statusCode:503});});
});

test('authentication and invalid response failures are not retried',async()=>{
 for(const statusCode of [400,401,403,404]){
  let calls=0;
  await provider(async()=>{await assert.rejects(evaluateChoices({},questions));assert.equal(calls,1);},async()=>{calls++;throw Object.assign(new Error('PRIVATE'),{statusCode});});
 }
 let calls=0;
 await provider(async()=>{
  await assert.rejects(evaluateChoices({},questions),e=>{
   assert.ok(e instanceof ChoiceRequestError);assert.equal(e.failure.code,'INVALID_RESPONSE');assert.equal(calls,1);return true;
  });
 },async()=>{calls++;return {...answer,answers:{nextAction:{type:'choice',choice:'done',probabilities:{done:0.2,stuck:0.2}}}};});
});

test('audit keeps retry exhaustion metadata independently of the completion decision',async()=>{
 let calls=0;
 await provider(async()=>{
  const audit=await recordCompletion([{goal:'Read',currentDate:'2026-09-20',history:[],screen:{title:'Read',text:['text'],elements:[],canScrollDown:false,canScrollUp:false}}],evaluateChoices);
  assert.equal(audit.status,'ERROR');assert.equal(calls,3);
  assert.equal((audit as any).request.attempts,3);
  assert.deepEqual(audit.error,{stage:'request',code:'HTTP_ERROR',statusCode:503});
 },async()=>{calls++;throw Object.assign(new Error('PRIVATE'),{statusCode:503});});
});

test('direct provider invalid JSON and invalid answers are response failures with attempt history',async()=>{
 const gateway=process.env.AI_GATEWAY_API_KEY,key=process.env.TYPESAFE_API_KEY,originalFetch=globalThis.fetch;
 process.env.AI_GATEWAY_API_KEY='';process.env.TYPESAFE_API_KEY='LOCAL_TEST_ONLY';
 try{
  for(const invalid of ['not JSON',JSON.stringify({model:'TEST',answers:{}})]){
   let calls=0;
   globalThis.fetch=async()=>++calls===1?new Response('unavailable',{status:503}):new Response(invalid,{status:200});
   await assert.rejects(evaluateChoices({},questions),e=>{
    assert.ok(e instanceof ChoiceRequestError);assert.equal(e.failure.code,'INVALID_RESPONSE');
    assert.equal(calls,2);assert.equal((e as any).request.attempts,2);
    assert.deepEqual((e as any).request.failures,[{code:'HTTP_ERROR',statusCode:503},{code:'INVALID_RESPONSE'}]);return true;
   });
  }
 }finally{
  globalThis.fetch=originalFetch;
  if(gateway===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=gateway;
  if(key===undefined)delete process.env.TYPESAFE_API_KEY;else process.env.TYPESAFE_API_KEY=key;
 }
});

test('direct provider body timeout retries instead of being classified as invalid JSON',async()=>{
 const gateway=process.env.AI_GATEWAY_API_KEY,key=process.env.TYPESAFE_API_KEY,originalFetch=globalThis.fetch;
 process.env.AI_GATEWAY_API_KEY='';process.env.TYPESAFE_API_KEY='LOCAL_TEST_ONLY';let calls=0;
 globalThis.fetch=async()=>++calls===1?new Response(new ReadableStream({start(controller){controller.error(new DOMException('PRIVATE','AbortError'));}})):new Response(JSON.stringify({model:'TEST',answers:answer.answers}));
 try{
  const result=await evaluateChoices({},questions);
  assert.equal(result.answers.nextAction.choice,'done');assert.equal(calls,2);
  assert.deepEqual(result.request,{attempts:2,failures:[{code:'TIMEOUT'}]});
 }finally{
  globalThis.fetch=originalFetch;
  if(gateway===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=gateway;
  if(key===undefined)delete process.env.TYPESAFE_API_KEY;else process.env.TYPESAFE_API_KEY=key;
 }
});
