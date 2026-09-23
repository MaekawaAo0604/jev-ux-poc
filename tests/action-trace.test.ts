import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createServer} from 'vite';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AutoPage} from '../pages/AutoPage.js';
import {GoodPage} from '../pages/GoodPage.js';
import {PublicSitePage} from '../pages/PublicSitePage.js';
import {run} from '../runner/engine.js';
import {fakeDecide} from '../jev/fake.js';
import type {Decider} from '../jev/types.js';

test('trace captures a unique locator for the chosen element without exposing metadata to Jev',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage();
  await page.setContent('<button data-testid="primary" aria-label="秘密の名前">表示</button><button aria-label="秘密の名前">表示</button>');
  const pom=new AutoPage(page);
  const screen=await pom.observe(false);
  assert.equal(typeof (pom as any).describeAction,'function','POM must expose trace-only target metadata');
  assert.ok(!JSON.stringify(screen).includes('秘密の名前'));
  assert.ok(!JSON.stringify(screen).includes('primary'));
  const draft=await (pom as any).describeAction({type:'click',elementId:screen.elements[0].id},1);
  assert.equal(draft.target.testId,'primary');
  assert.equal(draft.target.accessibleName,'秘密の名前');
  assert.deepEqual(draft.target.locator,{kind:'testId',value:'primary'});
  await page.setContent('<button aria-labelledby="label">可視文字</button><span id="label">複合 名前</span>');
  const next=await pom.observe(false);
  const role=await (pom as any).describeAction({type:'click',elementId:next.elements[0].id},2);
  assert.deepEqual(role.target.locator,{kind:'role',role:'button',value:'複合 名前'});
  await page.setContent('<button>重複</button><button>重複</button>');
  const ambiguous=await pom.observe(false);
  const missing=await (pom as any).describeAction({type:'click',elementId:ambiguous.elements[0].id},3);
  assert.equal(missing.target.locator,undefined,'never silently choose nth for an ambiguous target');
 }finally{await browser.close();}
});

test('existing POM offers the same known controls to exploration and regression tests',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage();await page.setContent('<a href="#notifications" aria-label="通知設定">設定</a>');
  const good=new GoodPage(page);
  assert.equal(typeof (good as any).control,'function');
  await (good as any).control('link','通知設定').click();
  assert.equal(new URL(page.url()).hash,'#notifications');
  assert.throws(()=>(good as any).control('link','存在しない操作'),/Unknown POM control/);
 }finally{await browser.close();}
});

test('public trace distinguishes guarded navigation from actual disclosure clicks',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage();
  await page.route('https://example.test/**',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:'<a href="/next">次へ</a><details><summary>詳細</summary>回答</details>'}));
  await page.goto('https://example.test/');
  const pom=new PublicSitePage(page),screen=await pom.observe(false);
  const chosen=screen.elements.find(e=>e.text==='次へ');assert.ok(chosen,JSON.stringify(screen.elements));
  const link=await pom.describeAction({type:'click',elementId:chosen.id},1);
  assert.deepEqual(link.execution,{kind:'navigate',url:'https://example.test/next'});
  const disclosure=await pom.describeAction({type:'click',elementId:screen.elements.find(e=>e.text==='詳細')!.id},2);
  assert.deepEqual(disclosure.execution,{kind:'local-disclosure'});
 }finally{await browser.close();}
});

test('engine persists only executed actions and keeps failed completion out of successful traces',async()=>{
 const server=await createServer({server:{host:'127.0.0.1',port:0},logLevel:'error'});await server.listen();
 const browser=await chromium.launch({headless:true});
 const dir=await mkdtemp(join(tmpdir(),'jev-action-trace-'));
 const baseURL=server.resolvedUrls!.local[0].replace(/\/$/,'');
 const config={variant:'good' as const,goal:'notifications' as const,font:false,maxActions:8,baseURL,repeat:1,fake:true,pom:'auto' as const,success:'both' as const};
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  await page.route('**/*',r=>new URL(r.request().url()).origin===baseURL?r.continue():r.abort());
  const result=await run(page,fakeDecide,{...config,dir:join(dir,'success')});
  assert.ok(Array.isArray((result as any).actionTrace?.actions),'successful exploration must have an Action Trace');
  const trace=(result as any).actionTrace;
  assert.equal(trace.success.objectiveSuccess,true);
  assert.equal(trace.success.perceivedSuccess,true);
  assert.deepEqual(trace.actions.map((a:any)=>[a.step,a.action,a.target.accessibleName]),[[1,'click','通知設定'],[2,'click','メール通知を停止する']]);
  assert.equal(trace.actions[0].urlBefore,baseURL+'/good/');
  assert.equal(trace.actions[0].urlAfter,baseURL+'/good/#notifications');
  assert.deepEqual(JSON.parse(await readFile(join(dir,'success','action-trace.json'),'utf8')),trace);
  assert.ok(!JSON.stringify(result.steps.map(s=>s.state)).includes('accessibleName'));
  const generated=await run(page,fakeDecide,{...config,dir:join(dir,'generated'),generateTest:true,rawDir:join(dir,'raw')} as any);
  assert.equal((generated as any).generatedTest?.status,'GENERATED','successful exploration with generation enabled must save a raw test');
  assert.match(await readFile((generated as any).generatedTest.testPath,'utf8'),/メール通知を停止したい/);
  const bad:Decider=async(_s,c)=>({action:c.done.action,choice:'done',probabilities:{done:1},model:'TEST'});
  const failed=await run(page,bad,{...config,dir:join(dir,'false-done'),generateTest:true,rawDir:join(dir,'raw')} as any);
  assert.equal((failed as any).actionTrace.success.objectiveSuccess,false);
  assert.deepEqual((failed as any).actionTrace.actions,[]);
  assert.equal((failed as any).generatedTest.status,'REJECTED');
  const invalid:Decider=async()=>({action:{type:'click',elementId:'missing'},choice:'missing',probabilities:{},model:'TEST'});
  const errored=await run(page,invalid,{...config,dir:join(dir,'failed-action')});
  assert.equal(errored.reason,'ACTION_ERROR');
  assert.deepEqual((errored as any).actionTrace.actions,[],'attempted but failed actions cannot be replayed as successful');
  await page.setViewportSize({width:1280,height:400});
  const originalAct=AutoPage.prototype.act,originalEvaluate=page.evaluate.bind(page);
  let metadataFailures=0;
  AutoPage.prototype.act=async function(action){
   await originalAct.call(this,action);
   // Inject only at the post-action metadata boundary, then restore observation.
   if(action.type==='scroll')page.evaluate=(async()=>{page.evaluate=originalEvaluate;metadataFailures++;throw new Error('metadata context replaced');}) as typeof page.evaluate;
  };
  let decisions=0;
  const scrollThenStop:Decider=async(_s,c)=>{
   const choice=decisions++===0?'scroll_down':'stuck';assert.ok(c[choice]);
   return {action:c[choice].action,choice,probabilities:{[choice]:1},model:'TEST'};
  };
  try{
   const metadataFailure=await run(page,scrollThenStop,{...config,dir:join(dir,'metadata-failure')});
   assert.equal(metadataFailures,1);
   assert.equal(metadataFailure.reason,'STUCK','extra trace metadata failure must not stop exploration');
   assert.equal(metadataFailure.actionTrace.actions.length,1);
   assert.equal(metadataFailure.actionTrace.recordingErrors?.length,1);
  }finally{AutoPage.prototype.act=originalAct;page.evaluate=originalEvaluate;}
 }finally{await browser.close();await server.close();}
});
