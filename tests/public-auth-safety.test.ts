import {test,type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {chromium,request} from 'playwright';
import {PublicSitePage} from '../pages/PublicSitePage.js';
import {candidatesFor} from '../jev/types.js';
import {publicNavigation} from '../runner/public-navigation.js';

async function fixture(t:TestContext,body:string,resources:Record<string,{mime:string;body:string}>={}){
 const hits:string[]=[];
 const server=createServer((req,res)=>{
  hits.push(req.url!);
  if(req.url==='/jump'){res.writeHead(302,{location:'/auth/google'});res.end();return;}
  const resource=resources[req.url!];
  res.writeHead(200,{'content-type':resource?.mime??'text/html; charset=utf-8'});
  res.end(resource?.body??(req.url==='/client'?"<script>location.replace('/auth/google')</script>":body));
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 t.after(()=>new Promise<void>((r,e)=>server.close(error=>error?e(error):r())));
 return {origin:`http://127.0.0.1:${(server.address() as {port:number}).port}`,hits};
}

test('public candidates exclude authentication endpoints and opaque login actions without excluding informational help',async t=>{
 const blocked=[['/auth/google','Googleアカウントでログイン'],['/users/sign_in','Sign in'],['/LOGIN','Login'],['/?action=login','アカウント認証'],['/#/login','SPAログイン'],['/au%74h/google','符号化された入口'],['/%2fauth/google','先頭区切り'],['/%5cauth/google','逆向き区切り'],['/opaque','Continue with Google']];
 const safe=[['/pricing','料金'],['/help/login','ログイン方法'],['/help?q=login','ログインに関するヘルプ'],['/products/authenticator','認証器の説明']];
 const f=await fixture(t,[...blocked,...safe].map(([url,label])=>`<a style="display:block" href="${url}">${label}</a>`).join(''));
 const browser=await chromium.launch();t.after(()=>browser.close());
 const page=await browser.newPage(),pom=new PublicSitePage(page,undefined,undefined,true);
 await pom.navigateTo(f.origin);const screen=await pom.observe(false),candidates=candidatesFor(screen,false);
 for(const [,label] of blocked){const e=screen.elements.find(e=>e.text===label)!;assert.ok(e,label);assert.equal(e.available,false,label);assert.equal(e.unavailableReason,'SAFETY_BOUNDARY');assert.equal(candidates[e.id],undefined);}
 for(const [,label] of safe){const e=screen.elements.find(e=>e.text===label)!;assert.ok(candidates[e.id],label);}
 assert.deepEqual(f.hits,['/']);
});

test('a retained safe link changed to an authentication endpoint is rejected before its GET',async t=>{
 const f=await fixture(t,'<a href="/pricing">料金</a>'),browser=await chromium.launch();t.after(()=>browser.close());
 const page=await browser.newPage(),pom=new PublicSitePage(page);
 await pom.navigateTo(f.origin);const screen=await pom.observe(false);
 await page.locator('a').evaluate(a=>a.setAttribute('href','/auth/google'));
 await assert.rejects(pom.act({type:'click',elementId:screen.elements[0].id}),/SAFETY_BOUNDARY/);
 assert.deepEqual(f.hits,['/']);assert.equal(page.url(),f.origin+'/');
});

test('PublicSitePage refuses an explicit initial authentication URL without a custom resolver',async t=>{
 const f=await fixture(t,'<h1>Auth must not load</h1>'),browser=await chromium.launch();t.after(()=>browser.close());
 const pom=new PublicSitePage(await browser.newPage());
 await assert.rejects(pom.navigateTo(f.origin+'/auth/google'),/SAFETY_BOUNDARY/);
 assert.deepEqual(f.hits,[]);
});

test('navigation rejects direct, encoded, query, fragment and redirected auth destinations before requesting them',async t=>{
 const f=await fixture(t,'<h1>Public information</h1>'),api=await request.newContext();t.after(()=>api.dispose());
 const navigation=publicNavigation({request:api} as any,f.origin,{});t.after(()=>navigation.release());
 for(const path of ['/auth/google','/users/sign_in','/wp-login.php','/au%74h/google','/%2561uth/google','/?action=login','/#/login','/%2fauth/google','/%5cauth/google','//auth/google']){
  await assert.rejects(navigation.resolve(f.origin+path),/SAFETY_BOUNDARY/,path);
 }
 assert.deepEqual(f.hits,[],'not even the first authentication GET is allowed');
 await assert.rejects(navigation.resolve(f.origin+'/jump'),/SAFETY_BOUNDARY/);
 assert.deepEqual(f.hits,['/jump'],'the redirect response is fetched, but not its auth target');
 for(const path of ['/pricing','/help/login','/help?q=login']){
  assert.equal(await navigation.resolve(f.origin+path),f.origin+path);await navigation.release();
 }
 assert.deepEqual(f.hits,['/jump','/pricing','/help/login','/help?q=login']);
});

test('a client redirect cannot enter authentication after an approved public navigation',async t=>{
 const f=await fixture(t,'<h1>Public information</h1>'),api=await request.newContext();t.after(()=>api.dispose());
 const navigation=publicNavigation({request:api} as any,f.origin,{});t.after(()=>navigation.release());
 await navigation.resolve(f.origin+'/safe');
 await assert.rejects(navigation.follow(f.origin+'/auth/google'),/SAFETY_BOUNDARY/);
 assert.deepEqual(f.hits,['/safe']);
});

test('the production CLI stops a script redirect to authentication without a model call or auth request',async t=>{
 const f=await fixture(t,'<h1>Authentication entry must not be fetched</h1>');
 const cwd=await mkdtemp(resolve(tmpdir(),'jev-auth-'));t.after(()=>rm(cwd,{recursive:true,force:true}));
 const {stdout}=await promisify(execFile)(process.execPath,['--import',import.meta.resolve('tsx'),resolve('runner/public-site.ts'),f.origin+'/client','Read public information without signing in','--reviewed','--interval-ms','1000'],{cwd,env:{...process.env,AI_GATEWAY_API_KEY:'',TYPESAFE_API_KEY:''},timeout:30000});
 const summary=JSON.parse(stdout.trim().split('\n').at(-1)!);
 assert.equal(summary.reason,'SAFETY_BOUNDARY');assert.equal(summary.actionCount,0);
 const result=JSON.parse(await readFile(resolve(summary.report,'../exploration/result.json'),'utf8'));
 assert.equal(result.steps.length,0);assert.equal(result.perceivedSuccess,false);
 assert.ok(f.hits.includes('/client'));assert.ok(!f.hits.includes('/auth/google'));
});

test('the production CLI blocks a script authentication fetch before any auth request',async t=>{
 const f=await fixture(t,'<h1>Public page</h1><script>fetch("/auth/google").catch(()=>{})</script>');
 const cwd=await mkdtemp(resolve(tmpdir(),'jev-auth-fetch-'));t.after(()=>rm(cwd,{recursive:true,force:true}));
 const {stdout}=await promisify(execFile)(process.execPath,['--import',import.meta.resolve('tsx'),resolve('runner/public-site.ts'),f.origin,'Read public information without signing in','--reviewed','--interval-ms','1000'],{cwd,env:{...process.env,AI_GATEWAY_API_KEY:'',TYPESAFE_API_KEY:''},timeout:30000});
 const summary=JSON.parse(stdout.trim().split('\n').at(-1)!);
 assert.equal(summary.reason,'SAFETY_BOUNDARY');assert.equal(summary.actionCount,0);
 assert.ok(!f.hits.includes('/auth/google'));
});

test('the production CLI never lets Chromium follow a subresource redirect into authentication',async t=>{
 const f=await fixture(t,'<h1>Public page</h1><script>fetch("/jump").catch(()=>{})</script>');
 const cwd=await mkdtemp(resolve(tmpdir(),'jev-auth-redirect-'));t.after(()=>rm(cwd,{recursive:true,force:true}));
 const {stdout}=await promisify(execFile)(process.execPath,['--import',import.meta.resolve('tsx'),resolve('runner/public-site.ts'),f.origin,'Read public information without signing in','--reviewed','--interval-ms','1000'],{cwd,env:{...process.env,AI_GATEWAY_API_KEY:'',TYPESAFE_API_KEY:''},timeout:30000});
 const summary=JSON.parse(stdout.trim().split('\n').at(-1)!);
 assert.equal(summary.reason,'SAFETY_BOUNDARY');assert.equal(summary.actionCount,0);
 assert.ok(f.hits.includes('/jump'));assert.ok(!f.hits.includes('/auth/google'));
});

test('normal stylesheet and script resources are loaded exactly once and retain their browser effects',async t=>{
 const f=await fixture(t,'<link rel="stylesheet" href="/style.css"><h1>Loading</h1><p class="hidden">HIDDEN_SECRET</p><script src="/asset.js"></script>',{
  '/style.css':{mime:'text/css',body:'.hidden{display:none}'},
  '/asset.js':{mime:'text/javascript',body:'document.querySelector("h1").textContent="Assets loaded"'},
 });
 const cwd=await mkdtemp(resolve(tmpdir(),'jev-auth-assets-'));t.after(()=>rm(cwd,{recursive:true,force:true}));
 const {stdout}=await promisify(execFile)(process.execPath,['--import',import.meta.resolve('tsx'),resolve('runner/public-site.ts'),f.origin,'Read public information','--reviewed','--interval-ms','1000'],{cwd,env:{...process.env,AI_GATEWAY_API_KEY:'',TYPESAFE_API_KEY:''},timeout:30000});
 const summary=JSON.parse(stdout.trim().split('\n').at(-1)!);
 assert.equal(summary.reason,'DECISION_ERROR','no model credentials, not a resource safety failure');
 const result=JSON.parse(await readFile(resolve(summary.report,'../exploration/result.json'),'utf8'));
 assert.ok(result.steps[0].state.screen.text.includes('Assets loaded'));
 assert.ok(!result.steps[0].state.screen.text.includes('HIDDEN_SECRET'));
 for(const path of ['/style.css','/asset.js'])assert.equal(f.hits.filter(p=>p===path).length,1,path);
});
