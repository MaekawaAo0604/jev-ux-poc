import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import {request} from 'playwright';
import {publicNavigation} from '../runner/public-navigation.js';

// Real local sockets reproduce Playwright's loss of ECONNRESET: it exposes
// "apiRequestContext.get: socket hang up", without an error.code property.
for(const mode of ['recover','persistent','denied','redirect'] as const)test(`navigation transport: ${mode}`,async()=>{
 const hits:string[]=[],times:number[]=[],events:any[]=[];
 const server=createServer((req,res)=>{
  hits.push(req.url!);times.push(performance.now());
  if(mode==='persistent'||hits.length===1&&mode!=='denied'){req.socket.destroy();return;}
  if(mode==='denied'){res.writeHead(403);res.end('Denied');return;}
  if(mode==='redirect'){res.writeHead(302,{location:'http://127.0.0.1:1/forbidden'});res.end();return;}
  res.writeHead(200,{'content-type':'text/html'});res.end('<h1>Recovered</h1>');
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`,context=await request.newContext();
 // Only BrowserContext.request is used; use a real APIRequestContext rather
 // than replacing get() or pretending that a fake socket is Playwright.
 const navigation=publicNavigation({request:context} as any,origin,{},e=>events.push(e));
 try{
  if(mode==='recover'){
   assert.equal(await navigation.resolve(`${origin}/recover`),`${origin}/recover`);
   const response=navigation.take(`${origin}/recover`)!;
   assert.equal(await response.text(),'<h1>Recovered</h1>');await response.dispose();
   assert.deepEqual(events,[{phase:'retry',category:'CONNECTION_RESET',attempt:1},{phase:'recovered',category:'CONNECTION_RESET',attempt:2}]);
  }else if(mode==='persistent'){
   await assert.rejects(navigation.resolve(`${origin}/recover`),/PAGE_ERROR: navigation request failed \(CONNECTION_RESET/);
   assert.deepEqual(events,[{phase:'retry',category:'CONNECTION_RESET',attempt:1},{phase:'failed',category:'CONNECTION_RESET',attempt:2}]);
   assert.equal(navigation.take(`${origin}/recover`),undefined);
   await assert.rejects(navigation.follow(`${origin}/late`),/SAFETY_BOUNDARY/);
  }else if(mode==='denied'){
   await navigation.resolve(`${origin}/recover`);const response=navigation.take(`${origin}/recover`)!;
   assert.equal(response.status(),403);await response.dispose();assert.deepEqual(events,[]);
  }else{
   await assert.rejects(navigation.resolve(`${origin}/recover`),/SAFETY_BOUNDARY/);
   assert.deepEqual(hits,['/recover','/recover']);
   await assert.rejects(navigation.follow(`${origin}/late`),/SAFETY_BOUNDARY/);
  }
  assert.equal(hits.length,mode==='denied'?1:2);
  if(hits.length===2)assert.ok(times[1]-times[0]>=950,'reset recovery must wait, not hammer the server');
 }finally{await navigation.release();await context.dispose();await new Promise<void>((r,e)=>server.close(err=>err?e(err):r()));}
});

test('release during reset backoff prevents a second request',async()=>{
 let hits=0,signal!:()=>void;const retry=new Promise<void>(r=>{signal=r;});
 const server=createServer((req)=>{hits++;req.socket.destroy();});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`,context=await request.newContext();
 const navigation=publicNavigation({request:context} as any,origin,{},event=>{if(event.phase==='retry')signal();});
 try{
  const pending=navigation.resolve(`${origin}/recover`);
  const first=await Promise.race([retry.then(()=> 'retry'),pending.then(()=> 'settled',()=> 'settled')]);
  assert.equal(first,'retry');await navigation.release();await assert.rejects(pending,/SAFETY_BOUNDARY/);assert.equal(hits,1);
  await delay(20);assert.equal(navigation.take(`${origin}/recover`),undefined);
 }finally{await navigation.release();await context.dispose();await new Promise<void>((r,e)=>server.close(err=>err?e(err):r()));}
});

test('HTTP redirect hops share one reset retry allowance',async()=>{
 const hits:string[]=[],events:any[]=[];
 const server=createServer((req,res)=>{
  hits.push(req.url!);
  if(hits.length===1||req.url==='/next'){req.socket.destroy();return;}
  res.writeHead(302,{location:'/next'});res.end();
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`,context=await request.newContext();
 const navigation=publicNavigation({request:context} as any,origin,{},event=>events.push(event));
 try{
  await assert.rejects(navigation.resolve(`${origin}/start`),/PAGE_ERROR: navigation request failed \(CONNECTION_RESET/);
  assert.deepEqual(hits,['/start','/start','/next']);
  assert.deepEqual(events,[{phase:'retry',category:'CONNECTION_RESET',attempt:1},{phase:'recovered',category:'CONNECTION_RESET',attempt:2},{phase:'failed',category:'CONNECTION_RESET',attempt:1}]);
  assert.equal(navigation.take(`${origin}/next`),undefined);
 }finally{await navigation.release();await context.dispose();await new Promise<void>((r,e)=>server.close(err=>err?e(err):r()));}
});

test('non-reset transport errors are not retried or exposed as free-form diagnostics',async()=>{
 for(const message of ['certificate expired PRIVATE','getaddrinfo ENOTFOUND PRIVATE','Timeout 15000ms PRIVATE','connect EACCES PRIVATE','unexpected PRIVATE']){
  let calls=0;const events:any[]=[];
  const context={request:{get:async()=>{calls++;throw new Error(message);}}} as any;
  const navigation=publicNavigation(context,'https://example.org',{},event=>events.push(event));
  await assert.rejects(navigation.resolve('https://example.org/'),/PAGE_ERROR/);
  assert.equal(calls,1);assert.equal(events.length,1);assert.equal(events[0].phase,'failed');
  assert.doesNotMatch(JSON.stringify(events),/PRIVATE/);
  await assert.rejects(navigation.follow('https://example.org/late'),/SAFETY_BOUNDARY/);
 }
});

test('a superseding resolve survives an older reset backoff without a stale retry',async()=>{
 const hits:string[]=[];let signal!:()=>void;const retry=new Promise<void>(r=>{signal=r;});
 const server=createServer((req,res)=>{
  hits.push(req.url!);if(req.url==='/old'){req.socket.destroy();return;}
  res.writeHead(200,{'content-type':'text/html'});res.end('<h1>New</h1>');
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`,context=await request.newContext();
 const navigation=publicNavigation({request:context} as any,origin,{},event=>{if(event.phase==='retry')signal();});
 try{
  const old=navigation.resolve(`${origin}/old`),rejected=assert.rejects(old,/SAFETY_BOUNDARY/);
  await retry;assert.equal(await navigation.resolve(`${origin}/new`),`${origin}/new`);await rejected;
  assert.deepEqual(hits,['/old','/new']);assert.equal(navigation.take(`${origin}/old`),undefined);
  const response=navigation.take(`${origin}/new`)!;assert.equal(await response.text(),'<h1>New</h1>');await response.dispose();
 }finally{await navigation.release();await context.dispose();await new Promise<void>((r,e)=>server.close(err=>err?e(err):r()));}
});
