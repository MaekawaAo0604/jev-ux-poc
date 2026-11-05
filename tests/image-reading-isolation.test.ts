import {test} from 'node:test';
import assert from 'node:assert/strict';
import {VisualDecisionContext} from '../jev/visual-context.js';
import {ChoiceRequestError,InferenceInterruption} from '../jev/client.js';

const goal='料金を知りたい。予約はしない。';
const next={nextAction:{type:'choice' as const,instructions:'DOM_SENTINEL',criteria:{e1:'DOM_SENTINEL',stuck:'stuck'}}};
const state={goal,currentDate:'2026-10-19',screen:{title:'DOM_SENTINEL',text:['DOM_SENTINEL']},history:[{observedText:['DOM_SENTINEL']}]};
function response(body:any,phase=1){
 const reading=!!body.questions.image_check_0;
 return Response.json({model:reading?'READ_MODEL':'ACTION_MODEL',answers:Object.fromEntries(Object.entries(body.questions).map(([id,q]:[string,any])=>{
  const choice=id==='image_check_0'?(phase===1?'observed':'not_shown'):id==='image_check_1'?'context':id.startsWith('image_route_')?'promising':id==='completionCoverage'?'complete':id==='completionBoundary'?'closed':'e1';
  return [id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,Number(k===choice)]))}];
 }))});
}

test('item reading sees only current pixels and Goal while navigation and completion keep executed history and prior judgments',async()=>{
 const original=globalThis.fetch,key=process.env.AI_GATEWAY_API_KEY;process.env.AI_GATEWAY_API_KEY='LOCAL_TEST_ONLY';
 let phase=1;const requests:any[]=[],first=Buffer.from('FIRST'),second=Buffer.from('SECOND');
 globalThis.fetch=async(_url,init)=>{const body=JSON.parse(String(init?.body));requests.push(body);return response(body,phase);};
 const context=new VisualDecisionContext(undefined,true,true,async()=>first);
 try{
  context.capture(first,{step:1,file:'step-1.png',pageId:'PRIVATE_PAGE',url:'https://example.com/PRIVATE_PAGE'},undefined,{targets:{f1:{kind:'click',travelSteps:0,nextChoice:'e1',label:'DOM_SENTINEL',pageTitle:'DOM_SENTINEL'}}});
  await context.evaluate(state,next);context.recordAction({type:'click',elementId:'e1'});
  phase=2;context.capture(second,{step:2,file:'step-2.png',pageId:'OTHER_PRIVATE_PAGE'});
  await context.evaluate(state,next);await context.evaluate(state,next);
  const reads=requests.filter(b=>b.questions.image_check_0),actions=requests.filter(b=>b.questions.nextAction);
  assert.equal(reads.length,2,'read once per frame, not again on secondary action decisions');assert.equal(actions.length,3);
  assert.deepEqual(requests.map(b=>!!b.questions.image_check_0),[true,false,true,false,false]);
  for(const [i,body] of reads.entries()){
   assert.deepEqual(body.state.context,{goal,currentDate:'2026-10-19',observationMode:'image-only'});
   assert.deepEqual(Object.keys(body.questions),['image_check_0','image_check_1']);
   assert.deepEqual(Object.keys(body.assets),[body.state.screenshot]);
   assert.equal(body.assets[body.state.screenshot].data_base64,(i===0?first:second).toString('base64'));
   assert.equal(body.state.observations.length,1);assert.equal(body.state.observations[0].current,true);
   assert.doesNotMatch(JSON.stringify(body.state),/history|imageJudgments|targets|viewport|DOM_SENTINEL|PRIVATE_PAGE/);
  }
  assert.deepEqual(Object.keys(actions[0].questions),['nextAction','image_route_f1']);
  assert.equal(actions[1].state.context.history.length,1);
  assert.equal(actions[1].state.context.imageJudgments.requirements[0].status,'observed');
  const memory=context.snapshot().imageJudgments!;
  assert.deepEqual(memory.requirements[0].records.map(r=>[r.assessment,r.model]),[['observed','READ_MODEL'],['not_shown','READ_MODEL']]);
  assert.equal(memory.routes[0].model,'ACTION_MODEL');
  await context.evaluate(state,{completionCoverage:{type:'choice',instructions:'',criteria:{complete:'yes',incomplete:'no',uncertain:'unknown'}}});
  const proof=requests.at(-1);assert.equal(proof.state.context.history.length,1);assert.ok(proof.state.context.imageJudgments);
  assert.equal(Object.keys(proof.assets).length,2);assert.deepEqual(proof.state.observations.map((o:any)=>o.id),['v2','v1']);
  assert.equal(context.completionEvidence().supported,true);
  assert.deepEqual(context.snapshot().requests.map(r=>r.stage),['image-check','decision','image-check','decision','decision','decision']);
  for(const body of requests)assert.doesNotMatch(JSON.stringify(body),/DOM_SENTINEL|PRIVATE_PAGE/);
 }finally{await context.close();globalThis.fetch=original;if(key===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=key;}
});

for(const failedStage of ['reading','action'] as const)test(`a failed ${failedStage} cannot commit partial frame judgments or issue further decisions`,async()=>{
 const original=globalThis.fetch,key=process.env.AI_GATEWAY_API_KEY;process.env.AI_GATEWAY_API_KEY='LOCAL_TEST_ONLY';let calls=0;
 globalThis.fetch=async(_url,init)=>{calls++;const body=JSON.parse(String(init?.body));return (failedStage==='reading'?calls===1:calls===2)?Response.json({answers:{}},{status:200}):response(body);};
 const context=new VisualDecisionContext(undefined,true,true);
 try{
  context.capture(Buffer.from('PIXELS'),{step:1});
  await assert.rejects(context.evaluate(state,next,{maxAttempts:1,maxElapsedMs:1000}),ChoiceRequestError);
  assert.equal(calls,failedStage==='reading'?1:2);assert.ok(context.snapshot().imageJudgments!.requirements.every(r=>r.records.length===0));
  const log=context.snapshot().requests;assert.equal(log[0].stage,'image-check');assert.equal(log[0].status,failedStage==='reading'?'error':'recorded');
  assert.equal(log.at(-1)?.status,'error');
 }finally{await context.close();globalThis.fetch=original;if(key===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=key;}
});

test('observation-change interruption during isolated reading propagates without navigation or memory commit',async()=>{
 const original=globalThis.fetch,key=process.env.AI_GATEWAY_API_KEY;process.env.AI_GATEWAY_API_KEY='LOCAL_TEST_ONLY';let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response('PRIVATE',{status:503});};const context=new VisualDecisionContext(undefined,true,true);
 try{
  context.capture(Buffer.from('PIXELS'),{step:1});
  await assert.rejects(context.evaluate(state,next,{maxAttempts:2,maxElapsedMs:1000,retryDelaysMs:[1],onProgress:async e=>{if(e.phase==='retry')throw new InferenceInterruption('OBSERVATION_CHANGED');}}),InferenceInterruption);
  assert.equal(calls,1);assert.ok(context.snapshot().imageJudgments!.requirements.every(r=>r.records.length===0));
  assert.equal(context.snapshot().requests[0].stage,'image-check');assert.doesNotMatch(JSON.stringify(context.snapshot()),/PRIVATE/);
 }finally{await context.close();globalThis.fetch=original;if(key===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=key;}
});
