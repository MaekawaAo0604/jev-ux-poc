import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evaluateChoices,ChoiceRequestError,InferenceInterruption,createBudgetedEvaluator} from '../jev/client.js';
import {createEvidenceSession} from '../jev/evidence-session.js';
import {jevDecide} from '../jev/decide.js';

const questions={nextAction:{type:'choice' as const,instructions:'Choose',criteria:{done:'Done',stuck:'Stuck'}}};
const answer={answers:{nextAction:{type:'choice',choice:'done',probabilities:{done:1,stuck:0}}},warnings:[]};

test('opt-in malformed-response recovery discards the invalid answer and accepts only a freshly validated response',async()=>{
 let calls=0;
 await provider(async()=>{
  const result=await evaluateChoices({},questions,{maxAttempts:6,maxElapsedMs:1000,retryDelaysMs:[0],retryInvalidResponse:true});
  assert.equal(calls,2);assert.equal(result.answers.nextAction.choice,'done');
  assert.deepEqual(result.request?.failures,[{code:'INVALID_RESPONSE'}]);
 },async()=>++calls===1?{answers:{},warnings:[]}:answer);
});

test('malformed-response recovery permits only one retry and remains opt-in',async()=>{
 for(const enabled of [false,true]){
  let calls=0;
  await provider(async()=>{
   await assert.rejects(evaluateChoices({},questions,{maxAttempts:6,maxElapsedMs:1000,retryDelaysMs:[0],retryInvalidResponse:enabled}),e=>e instanceof ChoiceRequestError&&e.failure.code==='INVALID_RESPONSE');
   assert.equal(calls,enabled?2:1);
  },async()=>{calls++;return {answers:{},warnings:[]};});
 }
});

test('malformed-response recovery still checks observation freshness before retrying',async()=>{
 let calls=0;
 await provider(async()=>{
  await assert.rejects(evaluateChoices({},questions,{maxAttempts:6,maxElapsedMs:1000,retryDelaysMs:[0],retryInvalidResponse:true,onProgress:event=>{if(event.phase==='request'&&event.attempt===2)throw new InferenceInterruption('OBSERVATION_CHANGED');}}),e=>e instanceof InferenceInterruption&&e.kind==='OBSERVATION_CHANGED');
  assert.equal(calls,1);
 },async()=>{calls++;return {answers:{},warnings:[]};});
});
async function provider(run:()=>Promise<void>,respond:(input:any)=>Promise<any>){
 const previous=globalThis.AI_SDK_DEFAULT_PROVIDER,key=process.env.AI_GATEWAY_API_KEY;
 globalThis.AI_SDK_DEFAULT_PROVIDER={evaluationModel:()=>({specificationVersion:'v4',provider:'TEST',modelId:'TEST',supportedQuestionTypes:['choice'],doEvaluate:respond})} as any;
 process.env.AI_GATEWAY_API_KEY='LOCAL_TEST_ONLY';
 try{await run();}finally{globalThis.AI_SDK_DEFAULT_PROVIDER=previous;if(key===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=key;}
}
test('budgeted live judgment recovers after three transient failures without losing retry evidence',async()=>{
 let calls=0;const events:any[]=[],state={goal:'Read facts',history:['already performed']};
 await provider(async()=>{
  const result=await (evaluateChoices as any)(state,questions,{maxAttempts:6,maxElapsedMs:5000,retryDelaysMs:[0],onProgress:(event:any)=>events.push(event)});
  assert.equal(result.answers.nextAction.choice,'done');assert.equal(calls,4);
  assert.equal(result.request.attempts,4);assert.equal(result.request.failures.length,3);
  assert.deepEqual(events.filter(e=>e.phase==='request').map(e=>e.attempt),[1,2,3,4]);
  assert.equal(events.at(-1).phase,'recovered');
  assert.doesNotMatch(JSON.stringify({result,events}),/PRIVATE/);
 },async input=>{
  assert.deepEqual(input.state,state);
  if(++calls<=3)throw Object.assign(new Error('PRIVATE'),{statusCode:503});
  return answer;
 });
});
test('recovery deadline bounds in-flight requests and does not start a request after expiry',async()=>{
 let calls=0;const started=performance.now();
 await provider(async()=>{
  await assert.rejects((evaluateChoices as any)({},questions,{maxAttempts:6,maxElapsedMs:80,retryDelaysMs:[0]}),e=>{
   assert.ok(e instanceof ChoiceRequestError);assert.equal(e.failure.code,'TIMEOUT');assert.equal(calls,1);
   assert.equal((e.request as any).budgetExhausted,true);return true;
  });
  assert.ok(performance.now()-started<2000);
 },async input=>{
  calls++;
  await new Promise((_,reject)=>input.abortSignal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));
  return answer;
 });
});
test('recovery cannot outwait its budget or retry permanent input/authentication failures',async()=>{
 for(const statusCode of [400,401,402,403,503]){
  let calls=0;
  await provider(async()=>{
   await assert.rejects((evaluateChoices as any)({},questions,{maxAttempts:6,maxElapsedMs:100,retryDelaysMs:[2000]}),e=>{
    assert.ok(e instanceof ChoiceRequestError);assert.equal(e.failure.statusCode,statusCode);return true;
   });
   assert.equal(calls,1);
  },async()=>{calls++;throw Object.assign(new Error('PRIVATE'),{statusCode});});
 }
});
test('recovery progress guard can halt inference before another request',async()=>{
 let calls=0;
 await provider(async()=>{
  await assert.rejects((evaluateChoices as any)({},questions,{maxAttempts:6,maxElapsedMs:1000,retryDelaysMs:[0],onProgress:(event:any)=>{if(event.phase==='request'&&event.attempt===2)throw new Error('SAFETY_BOUNDARY');}}),/SAFETY_BOUNDARY/);
  assert.equal(calls,1);
 },async()=>{calls++;throw Object.assign(new Error('PRIVATE'),{statusCode:503});});
});

test('a post-recovery safety guard is not relabeled as a provider failure',async()=>{
 let calls=0;
 await provider(async()=>{
  await assert.rejects((evaluateChoices as any)({},questions,{maxAttempts:6,maxElapsedMs:1000,retryDelaysMs:[0],onProgress:(event:any)=>{if(event.phase==='recovered')throw new Error('SAFETY_BOUNDARY');}}),/SAFETY_BOUNDARY/);
  assert.equal(calls,2);
 },async()=>{if(++calls===1)throw Object.assign(new Error('PRIVATE'),{statusCode:503});return answer;});
});

test('evidence session uses the same bounded evaluator and retains request/cache accounting',async()=>{
 let calls=0;
 const session=createEvidenceSession({evaluate:async(state:unknown)=>{
  assert.deepEqual(state,{fact:'Visible'});calls++;
  return {model:'TEST',answers:answer.answers,request:{attempts:4,failures:Array.from({length:3},()=>({code:'HTTP_ERROR' as const,statusCode:503}))}};
 }} as any);
 const first=await session.evaluate('goal-assessment',{fact:'Visible'},questions);
 const second=await session.evaluate('goal-assessment',{fact:'Visible'},questions);
 assert.equal(first.answers.nextAction.choice,'done');assert.equal(second.answers.nextAction.choice,'done');
 assert.equal(calls,1);assert.equal(session.accounting().attempts,4);assert.equal(session.accounting().failures,3);assert.equal(session.accounting().reusedCalls,1);
});

test('goal-check recovery preserves control-flow interruption and actual attempts through every wrapper',async()=>{
 let calls=0;
 await provider(async()=>{
  const session=createEvidenceSession({evaluate:(state,questions)=>evaluateChoices(state,questions,{maxAttempts:6,maxElapsedMs:1000,retryDelaysMs:[0],onProgress:event=>{if(event.phase==='request'&&event.attempt===2)throw new InferenceInterruption('SAFETY_BOUNDARY');}})});
  const state={goal:'Read condition',currentDate:'2026-09-23',history:[],screen:{title:'Condition',text:['Condition'],elements:[],canScrollUp:false,canScrollDown:false}};
  await assert.rejects(jevDecide(state,{done:{action:{type:'done'},label:'Done'}},{goalChecks:['condition'],session}),e=>{
   assert.ok(e instanceof InferenceInterruption);assert.equal(e.kind,'SAFETY_BOUNDARY');assert.equal(e.request?.attempts,1);return true;
  });
  assert.equal(calls,1);assert.equal(session.accounting().attempts,1);assert.equal(session.accounting().failures,1);
 },async()=>{calls++;throw Object.assign(new Error('PRIVATE'),{statusCode:503});});
});

test('an evaluation series shares one deadline across successful, timed-out and later batches',async()=>{
 let calls=0;
 await provider(async()=>{
  const evaluate=createBudgetedEvaluator({maxAttempts:1,maxElapsedMs:100,retryDelaysMs:[0]},40);
  assert.equal((await evaluate({batch:1},questions)).answers.nextAction.choice,'done');
  await assert.rejects(evaluate({batch:2},questions),e=>e instanceof ChoiceRequestError&&e.failure.code==='TIMEOUT');
  await assert.rejects(evaluate({batch:3},questions),e=>{
   assert.ok(e instanceof ChoiceRequestError);assert.equal(e.request?.attempts,0);assert.equal(e.request?.budgetExhausted,true);return true;
  });
  assert.equal(calls,2,'expired series must not start another provider request');
 },async input=>{
  if(++calls===2)await new Promise((_,reject)=>input.abortSignal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));
  return answer;
 });
});

test('an evaluation series rejects invalid aggregate budgets before making requests',()=>{
 for(const totalMs of [0,-1,NaN,Infinity,0.5,300001])assert.throws(()=>createBudgetedEvaluator({maxAttempts:1,maxElapsedMs:100},totalMs));
});
