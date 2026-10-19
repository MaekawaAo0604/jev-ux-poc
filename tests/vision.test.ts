import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evaluateChoices,ChoiceRequestError} from '../jev/client.js';
import {run} from '../runner/engine.js';
import {jevVisualDecide} from '../jev/decide.js';
import {chromium} from 'playwright';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

for(const proof of [false,true])test(`local image judgment memory is wired into the real visual decider without enabling DOM evidence (proof: ${proof})`,async()=>{
 const browser=await chromium.launch(),dir=await mkdtemp(join(tmpdir(),'jev-local-judgments-'));
 const original=globalThis.fetch,key=process.env.AI_GATEWAY_API_KEY;process.env.AI_GATEWAY_API_KEY='LOCAL_TEST_ONLY';let receivedMemory=false;
 globalThis.fetch=async(_url,init)=>{
  const body=JSON.parse(String(init?.body)),c=body.state.context;
  assert.equal(c.observationMode,'image-only');assert.ok(c.imageJudgments);assert.ok(!JSON.stringify(body).includes('DOM_SENTINEL'));
  assert.equal(Object.keys(body.assets).length,1);
  if(proof&&body.questions.completionCoverage){assert.equal(body.state.observations.length,1);assert.ok(body.assets[body.state.observations[0].screenshot]);}
  if(c.history.length)receivedMemory=c.imageJudgments.requirements[0].records.length>0;
  return Response.json({model:'TEST',answers:Object.fromEntries(Object.entries(body.questions).map(([id,q]:[string,any])=>{
   const choice=id==='image_check_0'?(c.history.length?'observed':'not_shown'):id==='completionCoverage'?'complete':c.history.length?'done':'e1';
   return [id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,Number(k===choice)]))}];
  }))});
 };
 try{
  const page=await browser.newPage({viewport:{width:640,height:480}});
  await page.route('http://fixture.test/**',r=>r.fulfill({contentType:'text/html',body:'<h1>DOM_SENTINEL</h1><button onclick="this.remove()">DOM_SENTINEL</button>'}));
  const result=await run(page,async()=>{throw new Error('Text decider used');},{variant:'good',goal:'notifications',font:false,maxActions:0,dir,baseURL:'http://fixture.test',repeat:1,fake:true,pom:'auto',success:'jev',vision:true,imageOnly:true,imageMemory:true,imageMemoryProof:proof},undefined,jevVisualDecide);
  assert.equal(result.reason,'JEV_DONE');assert.equal(result.actionCount,1);assert.equal(receivedMemory,true);assert.equal(result.completionAudit.status,'NOT_RUN');
  assert.equal(result.steps[1].decision.completionCheck.evidenceGuard.supported,true);
  if(proof)assert.equal(result.steps[1].visualContext.requests.at(-1).completionProof.imageCount,1);
 }finally{await browser.close();await rm(dir,{recursive:true,force:true});globalThis.fetch=original;if(key===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=key;}
});

test('local image-only config uses isolated requests and skips its DOM completion audit',async()=>{
 const browser=await chromium.launch(),dir=await mkdtemp(join(tmpdir(),'jev-image-only-local-'));
 const original=globalThis.fetch,key=process.env.AI_GATEWAY_API_KEY;process.env.AI_GATEWAY_API_KEY='LOCAL_TEST_ONLY';let calls=0;
 globalThis.fetch=async(_url,init)=>{
  const body=JSON.parse(String(init?.body));calls++;
  assert.ok(!JSON.stringify(body.state).includes('DOM_SENTINEL'));assert.ok(!JSON.stringify(body.questions).includes('DOM_SENTINEL'));
  assert.equal(body.state.context.observationMode,'image-only');assert.equal(Object.keys(body.assets).length,1);
  const choice=body.questions.completionCoverage?'complete':body.state.context.history.length?'done':'e1';
  return Response.json({model:'TEST',answers:Object.fromEntries(Object.entries(body.questions).map(([id,q]:[string,any])=>[id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,Number(k===choice)]))}]))});
 };
 try{
  const page=await browser.newPage({viewport:{width:640,height:480}});
  await page.route('http://fixture.test/**',r=>r.fulfill({contentType:'text/html',body:'<h1>DOM_SENTINEL title</h1><button onclick="this.remove()">DOM_SENTINEL label</button>'}));
  const config={variant:'good' as const,goal:'notifications' as const,font:false,maxActions:0,dir,baseURL:'http://fixture.test',repeat:1,fake:true,pom:'auto' as const,success:'jev' as const,vision:true,imageOnly:true};
  const result=await run(page,async()=>{throw new Error('Text decider used');},config,async()=>{throw new Error('DOM audit used');},jevVisualDecide);
  assert.equal(result.reason,'JEV_DONE');assert.equal(result.actionCount,1);assert.equal(calls,3);assert.equal(result.completionAudit.status,'NOT_RUN');
  await assert.rejects(()=>run(page,async()=>{throw new Error('unused');},{...config,visionOCR:true}),/imageOnly.*visionOCR/);
  await assert.rejects(()=>run(page,async()=>{throw new Error('unused');},{...config,vision:false}),/imageOnly.*vision/);
 }finally{await browser.close();await rm(dir,{recursive:true,force:true});globalThis.fetch=original;if(key===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=key;}
});

const questions={color:{type:'choice' as const,instructions:'Which color is visible?',criteria:{red:'Red',blue:'Blue',unknown:'No image'}}};
const image={mediaType:'image/png' as const,data:'iVBORw0KGgo='};

test('the local explorer uses shared numbering and no OCR in its production visual path',async()=>{
 const browser=await chromium.launch(),dir=await mkdtemp(join(tmpdir(),'jev-numbered-local-'));
 try{
  const page=await browser.newPage({viewport:{width:640,height:480}});
  await page.route('http://fixture.test/**',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:'<h1>通知</h1><button onclick="this.remove();document.querySelector(\'p\').textContent=\'メール通知を停止しました\'">停止</button><p>受信中</p>'}));
  let calls=0;
  const result=await run(page,async()=>{throw new Error('Text-only path used');},{variant:'good',goal:'notifications',font:false,maxActions:0,dir,baseURL:'http://fixture.test',repeat:1,fake:true,pom:'auto',success:'jev',vision:true},undefined,async(state,candidates,bytes,context)=>{
   calls++;assert.equal(context!.snapshot().ocrStatus,'disabled');
   const done=state.screen.text.includes('メール通知を停止しました');
   if(!done)assert.notDeepEqual(bytes,await page.screenshot(),'the visual decider receives the numbered capture');
   return {action:done?{type:'done'}:{type:'click',elementId:'e1'},choice:done?'done':'e1',probabilities:{},model:'TEST'};
  });
  assert.equal(calls,2);assert.equal(result.reason,'JEV_DONE');assert.equal(result.actionCount,1);
  assert.deepEqual(result.steps[0].visualTargets.map((t:any)=>t.id),['e1']);
 }finally{await browser.close();await rm(dir,{recursive:true,force:true});}
});

test('local exploration keeps current images only and scopes structured memory to a run',async()=>{
 const browser=await chromium.launch(),dir=await mkdtemp(join(tmpdir(),'jev-visual-memory-'));
 const previous=globalThis.fetch,key=process.env.AI_GATEWAY_API_KEY;process.env.AI_GATEWAY_API_KEY='LOCAL_TEST_ONLY';
 const requests:any[]=[];
 globalThis.fetch=async(_url,init)=>{
  const body=JSON.parse(String(init?.body));requests.push(body);
  const choice=body.questions.completionCoverage?'complete':body.state.context.screen?.text.includes('Condition B')?'done':'scroll_down';
  return Response.json({model:'TEST',answers:Object.fromEntries(Object.entries(body.questions).map(([id,q]:[string,any])=>{const selected=id.startsWith('visual_note_')?'confirmed':choice;return [id,{choice:selected,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,Number(k===selected)]))}];}))});
 };
 try{
  const page=await browser.newPage({viewport:{width:640,height:480}});
  await page.route('http://fixture.test/**',route=>route.fulfill({contentType:'text/html',body:'<h1>Guide</h1><p>Condition A</p><div style="height:600px"></div><p>Condition B</p><div style="height:200px"></div>'}));
  const config={variant:'good' as const,goal:'notifications' as const,font:false,maxActions:0,dir,baseURL:'http://fixture.test',repeat:1,fake:true,pom:'auto' as const,success:'jev' as const,vision:true};
  const result=await run(page,async()=>{throw new Error('Unexpected text decider');},config,undefined,jevVisualDecide);
  assert.equal(result.reason,'JEV_DONE');assert.ok(result.actionCount>0);
  const decisions=requests.filter(b=>b.questions.nextAction),review=requests.find(b=>b.questions.completionCoverage);
  assert.ok(decisions.every(b=>Object.keys(b.assets).length===1),'navigation must not resend past images');
  assert.match(decisions.at(-1).state.context.history.flatMap((h:any)=>h.observedText??[]).join('\n'),/Condition A/,'DOM information excluded from OCR memory must survive scrolling in executed history');
  assert.equal(Object.keys(review.assets).length,1,'completion also uses the current image only');
  requests.length=0;
  await run(page,async()=>{throw new Error('Unexpected text decider');},{...config,dir:join(dir,'second')},undefined,jevVisualDecide);
  assert.equal(Object.keys(requests.find(b=>b.questions.nextAction).assets).length,1,'memory is scoped to a run, not a singleton');
 }finally{await browser.close();await rm(dir,{recursive:true,force:true});globalThis.fetch=previous;if(key===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=key;}
});

test('local visual runs persist a failed completion review without claiming completion',async()=>{
 const browser=await chromium.launch(),dir=await mkdtemp(join(tmpdir(),'jev-review-error-'));
 try{
  const page=await browser.newPage();await page.route('http://fixture.test/**',route=>route.fulfill({contentType:'text/html',body:'<h1>Instructions</h1>'}));
  const decisionReview={stage:'completion',initialDecision:{action:{type:'done'},choice:'done',model:'TEST'},response:{model:'TEST',answers:{completionCoverage:{choice:'incomplete'}}}};
  const result=await run(page,async()=>{throw new Error('Unexpected text decider');},{variant:'good',goal:'notifications',font:false,maxActions:0,dir,baseURL:'http://fixture.test',repeat:1,fake:true,success:'jev',vision:true},undefined,async()=>{throw Object.assign(new Error('Review unavailable'),{decisionReview});});
  assert.equal(result.reason,'DECISION_ERROR');assert.equal(result.perceivedSuccess,false);assert.equal(result.actionCount,0);
  assert.deepEqual(result.steps[0].decisionReview,decisionReview);
 }finally{await browser.close();await rm(dir,{recursive:true,force:true});}
});

test('visual audit includes the post-action final capture when oracle termination skips another decision',async()=>{
 const browser=await chromium.launch(),dir=await mkdtemp(join(tmpdir(),'jev-final-audit-'));
 const previous=globalThis.fetch,key=process.env.AI_GATEWAY_API_KEY;process.env.AI_GATEWAY_API_KEY='LOCAL_TEST_ONLY';
 globalThis.fetch=async(_url,init)=>{const body=JSON.parse(String(init?.body));return Response.json({model:'TEST',answers:Object.fromEntries(Object.entries(body.questions).map(([id,q]:[string,any])=>{const choice=id==='readability'?'readable':id==='relevance'?'related':id==='completion'?'supported':id==='evidence_final'?'relevant':'irrelevant';return [id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k===choice?1:0]))}];}))});};
 try{
  const page=await browser.newPage({viewport:{width:640,height:480}});
  await page.route('http://fixture.test/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<h1>通知</h1><button onclick="document.querySelector(\'p\').textContent=\'メール通知を停止しました\'">停止</button><p role="status">受信中</p>'}));
  const result=await run(page,async(state)=>({action:{type:'click',elementId:state.screen.elements[0].id},choice:state.screen.elements[0].id,probabilities:{},model:'TEST'}),{variant:'good',goal:'notifications',font:false,maxActions:1,dir,baseURL:'http://fixture.test',repeat:1,fake:false,pom:'auto',success:'oracle',vision:true});
  assert.equal(result.reason,'SUCCESS');assert.equal(result.steps.length,1);
  const observations=result.visualCompletionAudit!.observations;
  assert.deepEqual(observations.map(o=>o.id),['v1','final']);assert.equal(observations[1].file,'final.png');
  assert.notEqual(observations[0].sha256,observations[1].sha256);assert.equal(result.visualCompletionAudit!.assessment,'supported');
 }finally{await browser.close();await rm(dir,{recursive:true,force:true});globalThis.fetch=previous;if(key===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=key;}
});

test('multi-image audits preserve every named asset and its single state reference',async()=>{
 const previous=globalThis.fetch,key=process.env.AI_GATEWAY_API_KEY;
 process.env.AI_GATEWAY_API_KEY='LOCAL_TEST_ONLY';let sent:any;
 globalThis.fetch=async(_url,init)=>{sent=JSON.parse(String(init?.body));return Response.json({model:'jev-1.14.0',answers:{color:{type:'choice',choice:'red',probabilities:{red:1,blue:0,unknown:0}}}});};
 try{
  await evaluateChoices({observations:[{id:'v1',screenshot:'unique-first-image'},{id:'v2',screenshot:'unique-second-image'}]},questions,{maxAttempts:1,maxElapsedMs:1000},{images:{'unique-first-image':image,'unique-second-image':{mediaType:'image/jpeg',data:'/9j/'}}} as any);
  assert.deepEqual(sent.assets,{'unique-first-image':{type:'image',format:'png',data_base64:'iVBORw0KGgo='},'unique-second-image':{type:'image',format:'jpg',data_base64:'/9j/'}});
  assert.deepEqual(sent.state.observations,[{id:'v1',screenshot:'unique-first-image'},{id:'v2',screenshot:'unique-second-image'}]);
 }finally{globalThis.fetch=previous;if(key===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=key;}
});

test('image evaluation sends referenced image assets and preserves structured context',async()=>{
 const previous=globalThis.fetch,key=process.env.AI_GATEWAY_API_KEY;
 process.env.AI_GATEWAY_API_KEY='LOCAL_TEST_ONLY';let sent:any;
 globalThis.fetch=async(url,init)=>{
  assert.equal(String(url),'https://ai-gateway.vercel.sh/typesafe/v1/systemone');sent=JSON.parse(String(init?.body));
  assert.equal(new Headers(init?.headers).get('TypeSafe-Danger-Zone-Images'),'true');
  return Response.json({model:'typesafe-ai/jev-1.14.0',answers:{color:{type:'choice',choice:'red',probabilities:{red:1,blue:0,unknown:0}}},usage:{inputTokens:123,outputTokens:8},providerMetadata:{gateway:{cost:'0.00001'}}});
 };
 try{
  const result=await evaluateChoices({goal:'Inspect color'},questions,undefined,{image});
  assert.deepEqual(sent.state.context,{goal:'Inspect color'});
  assert.deepEqual(sent.assets[sent.state.screenshot],{type:'image',format:'png',data_base64:'iVBORw0KGgo='});
  assert.equal(Object.keys(sent.assets).length,1);
  assert.equal(sent.model,'jev-1.14.0');assert.equal(result.answers.color.choice,'red');
  assert.deepEqual(result.usage,{inputTokens:123,outputTokens:8});assert.equal(result.costUSD,0.00001);
 }finally{globalThis.fetch=previous;if(key===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=key;}
});

test('the explorer supplies its saved current screenshot to the visual decider',async()=>{
 const browser=await chromium.launch({headless:true}),dir=await mkdtemp(join(tmpdir(),'jev-vision-'));
 try{
  const page=await browser.newPage({viewport:{width:640,height:480}});
  await page.route('http://fixture.test/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<h1>Test</h1><p role="status">メール通知を停止しました</p>'}));
  let calls=0;
  const result=await run(page,async()=>{throw new Error('Unexpected text decider');},{variant:'good',goal:'notifications',font:false,maxActions:0,dir,baseURL:'http://fixture.test',repeat:1,fake:true,success:'both'},undefined,async(state,candidates,bytes)=>{
   calls++;assert.equal(state.screen.title,'Test');assert.ok(candidates.done);
   assert.equal(bytes.subarray(1,4).toString(),'PNG');
   return {action:{type:'done'},choice:'done',probabilities:{done:1},model:'TEST'};
  });
  assert.equal(calls,1);assert.equal(result.objectiveSuccess,true);assert.equal(result.perceivedSuccess,true);
 }finally{await browser.close();await rm(dir,{recursive:true,force:true});}
});

test('image transport hides provider error bodies and does not retry authentication failures',async()=>{
 const previous=globalThis.fetch,key=process.env.AI_GATEWAY_API_KEY;
 process.env.AI_GATEWAY_API_KEY='LOCAL_TEST_ONLY';let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response('PRIVATE PROVIDER BODY',{status:401});};
 try{
  await assert.rejects(evaluateChoices({},questions,undefined,{image}),e=>{
   assert.ok(e instanceof ChoiceRequestError);assert.equal(e.failure.statusCode,401);assert.doesNotMatch(String(e),/PRIVATE/);return true;
  });assert.equal(calls,1);
 }finally{globalThis.fetch=previous;if(key===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=key;}
});
