import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createServer} from 'vite';
import {mkdir,mkdtemp,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import {run} from '../runner/engine.js';
import {parseCharter,publicExploration} from '../jev/persona.js';
import {fakeDecide} from '../jev/fake.js';

test('persona initial navigation waits through one eleven-second HTML delay while other operations keep ten seconds',async t=>{
 const charter=parseCharter(JSON.parse(await readFile('experiments/persona/charter.json','utf8')));
 const parent=resolve('reports/goal-search-evidence-persistence-fixed-2026-10-29');await mkdir(parent,{recursive:true});
 const dir=await mkdtemp(join(parent,'persona-initial-load-'));
 let fetchCalls=0,externalRequests=0,delayed=0,delayMs=0,releaseHTML!:()=>void;const htmlReleased=new Promise<void>(done=>{releaseHTML=done;});
 t.mock.method(globalThis,'fetch',async()=>{fetchCalls++;throw Error('EXTERNAL_FETCH_FORBIDDEN');});
 const server=await createServer({server:{host:'127.0.0.1',port:0},logLevel:'error'});await server.listen();
 const browser=await chromium.launch({headless:true});
 try{
  const baseURL=server.resolvedUrls!.local[0].replace(/\/$/,''),origin=new URL(baseURL).origin;
  // Warm the real application and Vite optimizer before introducing the controlled delay.
  const warm=await browser.newContext({serviceWorkers:'block'});
  try{
   await warm.route('**/*',route=>{const request=route.request(),url=new URL(request.url());if(url.protocol==='https:'&&url.hostname==='fonts.googleapis.com'&&url.pathname==='/css2'&&request.resourceType()==='stylesheet')return route.fulfill({contentType:'text/css',body:''});if(url.origin!==origin){externalRequests++;return route.abort();}return route.continue();});
   const page=await warm.newPage();await page.goto(baseURL+'/bad/',{waitUntil:'networkidle',timeout:30000});await page.locator('h1').waitFor({state:'visible',timeout:30000});
  }finally{await warm.close();}
  const context=await browser.newContext({viewport:{width:1280,height:900},locale:'ja-JP',timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
  try{
   await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.protocol==='https:'&&url.hostname==='fonts.googleapis.com'&&url.pathname==='/css2'&&request.resourceType()==='stylesheet'){await route.fulfill({contentType:'text/css',body:''});return;}
    if(url.origin!==origin){externalRequests++;await route.abort();return;}
    if(delayed===0&&request.isNavigationRequest()&&url.pathname==='/bad/'){
     delayed++;const started=performance.now();await new Promise(r=>setTimeout(r,11000));delayMs=performance.now()-started;releaseHTML();
    }
    try{await route.continue();}catch(error){if(!context.pages().every(page=>page.isClosed()))throw error;}
   });
   const page=await context.newPage();page.setDefaultTimeout(10000);
   // A missing locator observes the unchanged non-navigation default concurrently with the held HTML.
   const uiStarted=performance.now(),uiProbe=page.locator('[data-persona-initial-load-absent]').waitFor({state:'attached'}).then(()=>({name:'UNEXPECTED_SUCCESS',message:'',elapsedMs:performance.now()-uiStarted}),error=>({name:error.name,message:error.message,elapsedMs:performance.now()-uiStarted}));
   const result=await run(page,fakeDecide,{variant:'bad',goal:charter.oracle,font:false,maxActions:charter.maxActions,dir,baseURL,repeat:1,fake:true,pom:'auto',success:'both',pageIdentity:'hash-route',explorationMemory:true,exploration:publicExploration({charter})});
   const ui=await uiProbe;if(delayed===1)await htmlReleased;
   assert.equal(ui.name,'TimeoutError');assert.match(ui.message,/Timeout 10000ms exceeded/);assert.ok(ui.elapsedMs>=9000);
   assert.equal(delayed,1);assert.ok(delayMs>=10900,'the actual initial HTML must be delayed past the old ten-second boundary');
   console.log(JSON.stringify({kind:'persona-initial-load-controlled',dir,delayMs,delayed,reason:result.reason,errors:result.errors,objectiveSuccess:result.objectiveSuccess,fetchCalls,externalRequests,uiTimeoutError:ui.message,uiElapsedMs:ui.elapsedMs}));
   assert.equal(fetchCalls,0);assert.equal(externalRequests,0);
   assert.equal(result.reason,'SUCCESS');assert.equal(result.objectiveSuccess,true);assert.equal(result.actionCount,3);
   assert.ok(result.steps.length>0&&result.steps.every(step=>step.decision?.model==='FAKE-scripted'));
   assert.equal(fetchCalls,0);assert.equal(externalRequests,0);
  }finally{await context.close();}
 }finally{await browser.close();await server.close();}
});
