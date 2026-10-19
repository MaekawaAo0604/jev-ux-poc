import {test} from 'node:test';
import assert from 'node:assert/strict';
import {VisualDecisionContext} from '../jev/visual-context.js';
import type {ChoiceQuestion} from '../jev/client.js';

test('image-only model boundary uses English guidance across actions, image checks, routes and completion without translating Goal or leaking DOM',async()=>{
 const goal='料金を知りたい。予約はしない。',fragments=['料金を知りたい','予約はしない'];
 const first=Buffer.from('FIRST_PIXELS'),second=Buffer.from('SECOND_PIXELS'),requests:any[]=[];
 const original=globalThis.fetch,key=process.env.AI_GATEWAY_API_KEY;process.env.AI_GATEWAY_API_KEY='LOCAL_TEST_ONLY';
 globalThis.fetch=async(_url,init)=>{
  const body=JSON.parse(String(init?.body));requests.push(body);
  return Response.json({model:'TEST',answers:Object.fromEntries(Object.entries(body.questions).map(([id,q]:[string,any])=>{
   const choice=id==='image_check_0'?'observed':id==='image_check_1'?'context':id.startsWith('image_route_')?'promising':
    id==='completionCoverage'?'complete':id==='completionBoundary'?'closed':Object.hasOwn(q.criteria,'f1')?'f1':'e1';
   assert.ok(Object.hasOwn(q.criteria,choice));
   return [id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,Number(k===choice)]))}];
  }))});
 };
 const context=new VisualDecisionContext(undefined,true,true,async()=>first);
 const state={goal,currentDate:'2026-10-19',screen:{title:'DOM_SENTINEL',text:['DOM_SENTINEL']},history:[]};
 const next:Record<string,ChoiceQuestion>={nextAction:{type:'choice',instructions:'DOM_SENTINEL',criteria:{e1:'DOM_SENTINEL',back:'戻る',scroll_up:'上',scroll_down:'下',done:'完了',stuck:'停止'}}};
 try{
  context.capture(first,{step:1,file:'step-1.png',pageId:'PRIVATE_PAGE'},undefined,{targets:{f1:{kind:'click',nextChoice:'e1',label:'DOM_SENTINEL',pageTitle:'DOM_SENTINEL',travelSteps:0}}});
  await context.evaluate(state,next);context.recordAction({type:'click',elementId:'e1'});
  context.capture(second,{step:2,file:'step-2.png',pageId:'PRIVATE_PAGE_2'});
  await context.evaluate(state,{completionCoverage:{type:'choice',instructions:'DOM_SENTINEL',criteria:{complete:'完了',incomplete:'未完了',uncertain:'不明'}}});
  await context.evaluate({...state,targets:{f1:{kind:'click',travelSteps:1,pageId:'PRIVATE_PAGE',label:'DOM_SENTINEL'}}},
   {nextAction:{type:'choice',instructions:'DOM_SENTINEL',criteria:{f1:'DOM_SENTINEL',stuck:'停止'}}});
  assert.equal(requests.length,3);
  assert.deepEqual(Object.keys(requests[0].questions.nextAction.criteria),['e1','back','scroll_up','scroll_down','done','stuck']);
  assert.deepEqual(Object.keys(requests[0].questions.image_check_0.criteria),['observed','not_shown','context','contradicted','uncertain']);
  assert.deepEqual(Object.keys(requests[0].questions.image_route_f1.criteria),['promising','unrelated','uncertain']);
  assert.deepEqual(Object.keys(requests[1].questions.completionCoverage.criteria),['complete','incomplete','uncertain']);
  assert.deepEqual(Object.keys(requests[1].questions.completionBoundary.criteria),['closed','open','uncertain']);
  assert.deepEqual(Object.keys(requests[2].questions.nextAction.criteria),['f1','stuck']);
  assert.equal(Object.keys(requests[0].assets).length,1);assert.equal(Object.keys(requests[1].assets).length,2);assert.equal(Object.keys(requests[2].assets).length,1);
  assert.equal(context.completionEvidence().supported,true);
  for(const body of requests){
   assert.equal(body.state.context.goal,goal);assert.doesNotMatch(JSON.stringify(body),/DOM_SENTINEL|PRIVATE_PAGE/);
   for(const q of Object.values(body.questions) as ChoiceQuestion[]){
    const guidance=fragments.reduce((text,fragment)=>text.replaceAll(fragment,'[ORIGINAL_GOAL]'),q.instructions);
    assert.doesNotMatch(guidance,/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u,'scaffolding must be English; literal Goal fragments stay unchanged');
    assert.match(guidance,/[A-Za-z]/);
    for(const description of Object.values(q.criteria))assert.doesNotMatch(description,/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u);
   }
   for(const assetId of Object.keys(body.assets))assert.ok(!JSON.stringify(body.questions).includes(assetId),'opaque image IDs must not collide with words in prompts');
  }
  assert.ok(requests[0].questions.image_check_0.instructions.includes(fragments[0]));
  assert.deepEqual(requests[2].state.context.history,[{step:1,pageId:'p1',action:{type:'click',elementId:'e1'},result:'executed'}]);
 }finally{await context.close();globalThis.fetch=original;if(key===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=key;}
});
