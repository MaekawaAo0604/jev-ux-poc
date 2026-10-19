import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {PublicSitePage} from '../pages/PublicSitePage.js';
import {AutoPage} from '../pages/AutoPage.js';
import {candidatesFor} from '../jev/types.js';
import {VisualDecisionContext} from '../jev/visual-context.js';

test('default image evaluation sends no OCR questions or remembered OCR text',async()=>{
 const previous=globalThis.fetch,key=process.env.AI_GATEWAY_API_KEY;process.env.AI_GATEWAY_API_KEY='LOCAL_TEST_ONLY';const sent:any[]=[];
 globalThis.fetch=async(_url,init)=>{const body=JSON.parse(String(init?.body));sent.push(body);return Response.json({model:'TEST',answers:{nextAction:{choice:'stuck',probabilities:{stuck:1}}}});};
 const context=new VisualDecisionContext();
 try{
  context.capture(Buffer.from('CURRENT_IMAGE'),{step:1});
  await context.evaluate({goal:'Read',history:[]},{nextAction:{type:'choice',instructions:'Choose',criteria:{stuck:'Stop'}}});
  assert.equal(sent.length,1);assert.equal(sent[0].state.context.visualMemoryStatus,'disabled');
  assert.deepEqual(sent[0].state.context.visualMemory,[]);assert.equal(Object.keys(sent[0].assets).length,1);
  assert.equal(context.snapshot().requests.filter(r=>r.stage==='verification').length,0);
 }finally{await context.close();globalThis.fetch=previous;if(key===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=key;}
});

test('public vision offers numbered image links without exposing hidden labels or unblocking forbidden controls',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();
  await page.route('http://fixture.test/**',r=>r.fulfill({contentType:'text/html',body:'<h1>Guide</h1><a href="/next" aria-label="SECRET_LABEL"><canvas width="150" height="60"></canvas></a><a href="https://elsewhere.test/"><canvas width="150" height="60"></canvas></a><button><canvas width="150" height="60"></canvas></button><a href="/file.pdf"><canvas width="150" height="60"></canvas></a>'}));
  await page.goto('http://fixture.test/');
  const pom=new (PublicSitePage as any)(page,undefined,undefined,true),screen=await pom.observe(false),candidates=candidatesFor(screen,false);
  assert.equal(screen.elements[0].available!==false,true);assert.ok(candidates.e1);
  assert.match(candidates.e1.label,/\[e1\]/);
  assert.deepEqual(Object.keys(candidates),['e1','done','stuck']);
  assert.doesNotMatch(JSON.stringify(screen),/SECRET_LABEL|elsewhere|file\.pdf|\/next/);
  const captured=await pom.captureDecisionScreenshot(screen,candidates);
  assert.deepEqual(captured.targets.map((t:any)=>t.id),['e1']);
  await pom.act(candidates.e1.action);assert.equal(page.url(),'http://fixture.test/next');
 }finally{await browser.close();}
});

test('numbered screenshots use only offered targets, preserve candidate identity and leave no DOM changes',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:640,height:480}});
  await page.setContent('<style>body{margin:40px}a{display:inline-block;padding:40px}</style><a href="#a">Alpha</a><a href="#b">Beta</a>');
  const pom=new AutoPage(page),screen=await pom.observe(false),candidates=candidatesFor(screen,false);delete candidates.e2;
  const before=await page.content(),plain=await page.screenshot();
  const result=await (pom as any).captureDecisionScreenshot(screen,candidates);
  assert.deepEqual(result.targets.map((t:any)=>t.id),['e1']);
  assert.equal(result.bytes.subarray(1,4).toString(),'PNG');assert.notDeepEqual(result.bytes,plain);
  assert.equal(await page.content(),before);assert.deepEqual(await page.screenshot(),plain);
  await pom.act(candidates.e1.action);assert.equal(new URL(page.url()).hash,'#a');
 }finally{await browser.close();}
});

test('numbering is removed even when screenshot capture fails',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();await page.setContent('<a href="#a">Alpha</a>');
  const pom=new AutoPage(page),screen=await pom.observe(false),before=await page.content(),original=page.screenshot.bind(page);
  page.screenshot=async()=>{throw new Error('CAPTURE_FAILED');};
  await assert.rejects((pom as any).captureDecisionScreenshot(screen,candidatesFor(screen,false)),/CAPTURE_FAILED/);
  page.screenshot=original;assert.equal(await page.content(),before);
 }finally{await browser.close();}
});

test('a detached numbered target cannot silently become a different element',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();await page.setContent('<a href="#a">Alpha</a>');
  const pom=new AutoPage(page),screen=await pom.observe(false);
  await page.locator('a').evaluate(el=>{const replacement=el.cloneNode(true);el.replaceWith(replacement);});
  await assert.rejects((pom as any).captureDecisionScreenshot(screen,candidatesFor(screen,false)),/replaced|detached/);
 }finally{await browser.close();}
});

test('dense image controls retain nonoverlapping visible badges with recorded target associations',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:400,height:300}});
  await page.setContent('<style>body{margin:0;padding:80px 0 0 290px}a{display:inline-block;width:24px;height:24px;background:navy}</style><a href="#a"></a><a href="#b"></a><a href="#c"></a>');
  const pom=new AutoPage(page,true),screen=await pom.observe(false);
  const capture=await pom.captureDecisionScreenshot(screen,candidatesFor(screen,false));
  const badges=capture.targets.map((t:any)=>t.badge);
  assert.equal(badges.length,3);assert.ok(badges.every((b:any)=>b&&b.x>=0&&b.y>=0&&b.x+b.width<=400&&b.y+b.height<=300));
  for(let i=0;i<badges.length;i++)for(let j=i+1;j<badges.length;j++){
   const a=badges[i],b=badges[j];assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y,'numbers must not overlap');
  }
  for(const t of capture.targets){
   assert.equal(t.connector.to.x,t.x+t.width/2);
   assert.equal(t.connector.from.x,t.badge.x+t.badge.width/2);
   assert.ok(t.connector.to.y===t.y-4||t.connector.to.y===t.y+t.height+4);
  }
 }finally{await browser.close();}
});

test('a full-viewport image link can be numbered inside its bounds',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:640,height:480}});
  await page.setContent('<a href="#whole" style="position:fixed;inset:0;background:navy"></a>');
  const pom=new AutoPage(page,true),screen=await pom.observe(false);
  const capture=await pom.captureDecisionScreenshot(screen,candidatesFor(screen,false));
  assert.equal(capture.targets.length,1);const t=capture.targets[0];
  assert.ok(t.badge.x>=0&&t.badge.y>=0&&t.badge.x+t.badge.width<=640&&t.badge.y+t.badge.height<=480);
  assert.deepEqual(t.connector.to,{x:320,y:240});
  await pom.act({type:'click',elementId:'e1'});assert.equal(new URL(page.url()).hash,'#whole');
 }finally{await browser.close();}
});

test('numbering remains visible above modal content without closing it or changing focus',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:640,height:480}});
  await page.setContent('<dialog style="position:fixed;inset:0;margin:0;width:100vw;height:100vh;max-width:none;max-height:none;box-sizing:border-box;background:white"><a style="display:inline-block;margin:80px" href="#a">Alpha</a></dialog><script>document.querySelector("dialog").showModal()</script>');
  const pom=new AutoPage(page),screen=await pom.observe(false),plain=await page.screenshot(),focus=await page.evaluate(()=>document.activeElement?.outerHTML);
  const capture=await pom.captureDecisionScreenshot(screen,candidatesFor(screen,false));
  assert.equal(capture.targets.length,1);assert.notDeepEqual(capture.bytes,plain,'labels must actually be painted above the full-viewport modal');
  assert.equal(await page.locator('dialog').evaluate((el:any)=>el.open),true);
  assert.equal(await page.evaluate(()=>document.activeElement?.outerHTML),focus);
  assert.deepEqual(await page.screenshot(),plain);
 }finally{await browser.close();}
});
