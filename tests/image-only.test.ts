import {test} from 'node:test';
import assert from 'node:assert/strict';
import {VisualDecisionContext} from '../jev/visual-context.js';
import {jevDecide} from '../jev/decide.js';
import {parsePublicOptions} from '../runner/public-options.js';
import type {State} from '../jev/types.js';

test('image-only flags require vision and reject OCR rather than silently mixing inputs',()=>{
 assert.equal(parsePublicOptions(['https://example.com','Goal','--reviewed','--vision','--image-only']).imageOnly,true);
 assert.throws(()=>parsePublicOptions(['https://example.com','Goal','--reviewed','--image-only']),/image-only.*vision/);
 assert.throws(()=>parsePublicOptions(['https://example.com','Goal','--reviewed','--vision','--image-only','--vision-ocr']),/image-only.*vision-ocr/);
});

test('all image-only wire requests exclude DOM content, including completion and frontier selection',async()=>{
 const secret='DOM_SENTINEL_DO_NOT_SEND',requests:any[]=[];
 const state:State={goal:'Find the required information',currentDate:'2026-10-18',screen:{title:secret,text:[secret],pageId:`https://example.com/${secret}`,viewport:{top:0,bottom:800,height:800},elements:[{id:'e1',type:'link',text:secret,description:secret,context:{section:secret,headings:[secret],landmark:'main'}}],canScrollUp:false,canScrollDown:false},history:[{screen:secret,action:secret,result:secret,observedText:[secret],pageId:secret,recoveryTarget:secret}]};
 const candidates={e1:{label:secret,action:{type:'click' as const,elementId:'e1'}},done:{label:'done',action:{type:'done' as const}},stuck:{label:'stuck',action:{type:'stuck' as const}}};
 const original=globalThis.fetch,key=process.env.AI_GATEWAY_API_KEY;process.env.AI_GATEWAY_API_KEY='LOCAL_TEST_ONLY';
 let next='done';
 globalThis.fetch=async(_url,init)=>{
  const body=JSON.parse(String(init?.body));requests.push(body);
  const choice=body.questions.completionCoverage?'complete':body.state.context.targets?'f1':next;
  return Response.json({model:'TEST',answers:Object.fromEntries(Object.entries(body.questions).map(([id,q]:[string,any])=>[id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,Number(k===choice)]))}]))});
 };
 const context=new VisualDecisionContext(undefined,true);
 try{
  context.capture(Buffer.from('pixels'),{step:2,url:`https://example.com/${secret}`,pageId:state.screen.pageId,viewport:state.screen.viewport},state.screen);
  context.recordAction({type:'click',elementId:'e1'});
  const evaluate=(input:unknown,questions:any)=>context.evaluate(input,questions);
  assert.equal((await jevDecide(state,candidates,{verifyCompletion:true},evaluate)).action.type,'done');
  next='stuck';
  const branch=await jevDecide(state,candidates,{frontier:{targets:{f1:{label:secret,kind:'click',pageTitle:secret,pageId:secret,travelSteps:1,nextChoice:'e1',context:{section:secret,headings:[secret],landmark:'main'}},f2:{label:secret,kind:'click',pageTitle:secret,pageId:state.screen.pageId,travelSteps:0,nextChoice:'e1'}}}},evaluate);
  assert.equal(branch.choice,'e1');
  assert.equal(requests.length,4);
  for(const body of requests){
   assert.ok(!JSON.stringify(body.state).includes(secret),'DOM must not leak through state, frame URL, progress or history');
   assert.ok(!JSON.stringify(body.questions).includes(secret),'DOM must not leak through criteria');
   assert.equal(Object.keys(body.assets).length,1);
   assert.equal(body.state.context.observationMode,'image-only');
   assert.deepEqual(body.state.context.history,[{step:2,pageId:'p1',action:{type:'click',elementId:'e1'},result:'executed'}]);
  }
  assert.equal(requests[0].state.context.screen.pageId,'p1');
  assert.deepEqual(Object.keys(requests[0].questions.nextAction.criteria),['e1','done','stuck']);
  assert.equal(requests[3].state.context.targets.f1.pageId,'p2');
  assert.equal(requests[3].state.context.targets.f2.visualTargetId,'e1','a current frontier target must still identify its screenshot badge');
  assert.equal(context.snapshot().ocrStatus,'disabled');
  assert.throws(()=>new VisualDecisionContext(true,true),/image-only.*OCR/);
 }finally{await context.close();globalThis.fetch=original;if(key===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=key;}
});
