import {test,type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {mkdir,mkdtemp,readFile,writeFile,rm,symlink} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {chromium} from 'playwright';
import {createBetaPublicSite} from '../runner/beta-public-site.js';
import type {BetaPublicSiteSpec} from '../runner/beta-public-contracts.js';
import {candidatesFor} from '../jev/types.js';

const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
async function fixture(t:TestContext,body='<a href="/next" onclick="fetch(\'/sent\',{method:\'POST\'})">Next</a><a href="#part">Anchor</a><a href="/outside">Outside scope</a><details><summary>Details</summary><p>Local answer</p></details><h2 id="part">Part</h2>',scripts=''){
 const hits:string[]=[];
 const server=createServer((req,res)=>{hits.push(`${req.method} ${req.url}`);res.writeHead(200,{'content-type':req.url==='/asset.css'?'text/css':'text/html; charset=utf-8'});res.end(req.url==='/asset.css'?'body{font-family:sans-serif}':req.url==='/next'?'<h1>Next document</h1><a href="/docs">Docs</a>':`<!doctype html><title>Passkey fixture</title><link rel="stylesheet" href="/asset.css"><body>${body}${scripts}</body>`);});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 t.after(()=>new Promise<void>((r,e)=>server.close(error=>error?e(error):r())));
 const origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 await mkdir(resolve('reports'),{recursive:true});const dir=await mkdtemp(resolve('reports/beta-public-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const harPath=join(dir,'snapshot.har'),browser=await chromium.launch();t.after(()=>browser.close());
 const recording=await browser.newContext({recordHar:{path:harPath,content:'embed'},serviceWorkers:'block'}),capture=await recording.newPage();
 const capturedBodies:Promise<Buffer>[]=[];recording.on('response',response=>{capturedBodies.push(response.body());});
 for(const path of ['/docs','/next']){const response=await capture.goto(origin+path,{waitUntil:'networkidle'});assert.ok(response);await response.body();}
 await Promise.all(capturedBodies);await recording.close();hits.length=0;
 const capturedHAR=JSON.parse(await readFile(harPath,'utf8'));
 for(const entry of capturedHAR.log.entries)if(entry.request.method==='GET'&&entry.response.status===200)assert.equal(typeof entry.response.content.text,'string','Fixture must finish embedding every successful response body before replay');
 const spec:BetaPublicSiteSpec={schemaVersion:1,id:'test-passkey',startURL:origin+'/docs',allowedDocuments:[origin+'/docs',origin+'/next'],harPath,harSha256:sha(await readFile(harPath)),capturedAtUTC:'2026-11-06T00:00:00.000Z',sourceDescription:'Local HTTP fixture captured to an embedded HAR; no external source.'};
 const context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block',acceptDownloads:false}),page=await context.newPage();
 // URL resolution must never use the APIRequestContext, even for apparent preflight.
 context.request.get=async()=>{throw new Error('live request forbidden');};
 const rewrite=async(change:(har:any)=>void)=>{const har=JSON.parse(await readFile(harPath,'utf8'));change(har);await writeFile(harPath,JSON.stringify(har));spec.harSha256=sha(await readFile(harPath));};
 return {origin,hits,spec,page,context,dir,rewrite};
}

test('frozen real HTTP HAR replays readonly links, local disclosures, anchors and verified Back without live requests',async t=>{
 const f=await fixture(t),controller=await createBetaPublicSite(f.page,f.spec);await controller.prepare();await controller.prepare();controller.assertReady();
 assert.equal(f.page.url(),f.spec.startURL);let screen=await controller.adapter.observe(false);
 const outside=screen.elements.find(e=>e.text==='Outside scope')!;assert.equal(outside.available,false);assert.equal(candidatesFor(screen,false)[outside.id],undefined);
 const click=async(label:string)=>{screen=await controller.adapter.observe(false);const target=screen.elements.find(e=>e.text===label)!;assert.ok(target);await controller.adapter.act({type:'click',elementId:target.id});controller.assertReady();};
 await click('Details');assert.equal(await f.page.locator('details').getAttribute('open'),'');
 await click('Anchor');assert.equal(f.page.url(),f.spec.startURL+'#part');assert.equal(controller.adapter.canGoBack,true);await controller.adapter.act({type:'back'});assert.equal(f.page.url(),f.spec.startURL);
 await click('Next');assert.equal(f.page.url(),f.origin+'/next');assert.equal(controller.adapter.canGoBack,true);await controller.adapter.act({type:'back'});assert.equal(f.page.url(),f.spec.startURL);
 assert.deepEqual(f.hits,[]);assert.equal(controller.isSafetyStopped(),false);assert.equal(controller.evidence().networkMode,'frozen-har-no-fallback');
});

test('changed HAR hash is rejected before navigation and reports immutable source failure',async t=>{
 const f=await fixture(t);await writeFile(f.spec.harPath,'{}');await assert.rejects(async()=>{const c=await createBetaPublicSite(f.page,f.spec);await c.prepare();},/SITE_SNAPSHOT_HASH_MISMATCH/);assert.deepEqual(f.hits,[]);assert.equal(f.page.url(),'about:blank');
});

test('missing HAR asset is an infrastructure error, with zero live fallback',async t=>{
 const f=await fixture(t);await f.rewrite(har=>{har.log.entries=har.log.entries.filter((e:any)=>!e.request.url.endsWith('/asset.css'));});
 const c=await createBetaPublicSite(f.page,f.spec);let preparationError:unknown;try{await c.prepare();}catch(error){preparationError=error;}assert.ok(preparationError,JSON.stringify({events:c.evidence().events,resources:await f.page.evaluate(()=>performance.getEntriesByType('resource').map(r=>({name:r.name,duration:r.duration}))),html:await f.page.content()}));assert.match(String(preparationError),/SITE_SNAPSHOT_MISS/);assert.throws(()=>c.assertReady(),/SITE_SNAPSHOT_MISS/);assert.ok(c.evidence().events.some(e=>e.code==='SITE_SNAPSHOT_MISS'&&e.url===f.origin+'/asset.css'));assert.equal(c.isSafetyStopped(),false);assert.deepEqual(f.hits,[]);
});

test('POST, off-origin, auth, forms and embedded navigation are separately blocked without leaving the snapshot',async t=>{
 const f=await fixture(t,'<h1>Read only</h1><form action="/next"><button>Send</button></form><input type="file">');const c=await createBetaPublicSite(f.page,f.spec);await c.prepare();
 await f.page.evaluate(async()=>{await Promise.all([fetch('/not-captured',{method:'POST'}).catch(()=>{}),fetch('http://example.invalid/private').catch(()=>{}),fetch('/auth/google').catch(()=>{})]);const frame=document.createElement('iframe');frame.src='/next';document.body.append(frame);(document.querySelector('form') as HTMLFormElement).submit();});
 await f.page.waitForTimeout(100);assert.doesNotThrow(()=>c.assertReady(),JSON.stringify(c.evidence().events));assert.equal(f.page.url(),f.spec.startURL);assert.equal(c.isSafetyStopped(),false);assert.deepEqual(f.hits,[]);
 const codes=c.evidence().events.filter(e=>e.kind==='blocked-side-effect').map(e=>e.code);for(const code of ['METHOD_BLOCKED','ORIGIN_BLOCKED','AUTH_BLOCKED','FRAME_BLOCKED','FORM_BLOCKED'])assert.ok(codes.includes(code),code);
 const screen=await c.adapter.observe(false);assert.equal(screen.elements.find(e=>e.text==='Send')?.available,false);
});

test('late missing resources are detected before another observation and evidence cannot be mutated',async t=>{
 const f=await fixture(t),c=await createBetaPublicSite(f.page,f.spec);await c.prepare();await f.page.evaluate(()=>fetch('/missing.js').catch(()=>{}));
 await assert.rejects(c.adapter.observe(false),/SITE_SNAPSHOT_MISS/);const evidence=c.evidence();evidence.events.length=0;evidence.spec.allowedDocuments.length=0;assert.ok(c.evidence().events.length>0);assert.equal(c.evidence().spec.allowedDocuments.length,2);assert.deepEqual(f.hits,[]);
});

test('safe scoped links changed to out-of-scope fail before execution; unmanaged history never becomes Back permission',async t=>{
 const f=await fixture(t),c=await createBetaPublicSite(f.page,f.spec);await c.prepare();const screen=await c.adapter.observe(false),next=screen.elements.find(e=>e.text==='Next')!;
 await f.page.locator('a').first().evaluate(a=>a.setAttribute('href','/outside'));await assert.rejects(c.adapter.act({type:'click',elementId:next.id}),/SAFETY_BOUNDARY/);assert.equal(f.page.url(),f.spec.startURL);assert.equal(c.adapter.canGoBack,false);assert.deepEqual(f.hits,[]);
});

test('spec validation rejects foreign documents, external HAR resources and attachment bodies',async t=>{
 const f=await fixture(t);for(const change of [{startURL:f.origin+'/login'},{allowedDocuments:[f.origin+'/docs','https://elsewhere.invalid/docs']},{harPath:resolve('package.json')},{harSha256:'invalid'}])await assert.rejects(async()=>{const c=await createBetaPublicSite(f.page,{...f.spec,...change});await c.prepare();},/SITE_SNAPSHOT_SPEC_INVALID/);
 await f.rewrite(har=>{har.log.entries[0].request.url='https://elsewhere.invalid/asset';});await assert.rejects(async()=>{const c=await createBetaPublicSite(f.page,f.spec);await c.prepare();},/SITE_SNAPSHOT_SPEC_INVALID/);assert.deepEqual(f.hits,[]);
});


test('HAR attachment references and missing captured bodies cannot become empty replayed UI',async t=>{
 const f=await fixture(t);const original=await readFile(f.spec.harPath,'utf8');
 for(const mutate of [(har:any)=>{har.log.entries[0].response.content._file='../../outside';},(har:any)=>{har.log.entries[0].response.content.size=200;delete har.log.entries[0].response.content.text;}]){
  await writeFile(f.spec.harPath,original);await f.rewrite(mutate);await assert.rejects(async()=>{const c=await createBetaPublicSite(f.page,f.spec);await c.prepare();},/SITE_SNAPSHOT_SPEC_INVALID/);
 }
 assert.equal(f.page.url(),'about:blank');assert.deepEqual(f.hits,[]);
});

test('disclosure side effects stay blocked and never become snapshot coverage failures',async t=>{
 const f=await fixture(t,'<details><summary onclick="fetch(\'/not-in-har\').catch(()=>{})">Details</summary><p>Local answer</p></details>');
 const c=await createBetaPublicSite(f.page,f.spec);await c.prepare();const screen=await c.adapter.observe(false);await c.adapter.act({type:'click',elementId:screen.elements[0].id});await f.page.waitForTimeout(50);c.assertReady();
 assert.ok(c.evidence().events.some(e=>e.kind==='blocked-side-effect'&&e.code==='LOCAL_DISCLOSURE_NETWORK_BLOCKED'));assert.deepEqual(f.hits,[]);
});

test('script inserted history cannot replace an observed Back destination',async t=>{
 const f=await fixture(t),c=await createBetaPublicSite(f.page,f.spec);await c.prepare();const screen=await c.adapter.observe(false);await c.adapter.act({type:'click',elementId:screen.elements.find(e=>e.text==='Next')!.id});
 await f.page.evaluate(()=>history.pushState({},'', '/docs'));await assert.rejects(c.adapter.act({type:'back'}),/SAFETY_BOUNDARY: back destination changed/);assert.equal(f.page.url(),f.origin+'/docs');assert.deepEqual(f.hits,[]);
});

test('a HAR symlink inside reports is rejected before replay',async t=>{
 const f=await fixture(t),link=join(f.dir,'linked.har');try{await symlink(f.spec.harPath,link,'file');}catch(error){if((error as NodeJS.ErrnoException).code==='EPERM'){t.skip('Windows does not permit file symlinks for this account');return;}throw error;}
 await assert.rejects(async()=>{const c=await createBetaPublicSite(f.page,{...f.spec,harPath:link});await c.prepare();},/SITE_SNAPSHOT_SPEC_INVALID/);assert.deepEqual(f.hits,[]);
});

test('popups, dialogs, websocket and file chooser are blocked as side effects without snapshot misses',async t=>{
 const f=await fixture(t,'<h1>Readonly</h1><input type="file">'),c=await createBetaPublicSite(f.page,f.spec);await c.prepare();
 await f.page.evaluate(()=>{window.open('/next');alert('Fixture dialog');const socket=new WebSocket(location.origin.replace(/^http/,'ws')+'/socket');socket.onerror=()=>{};});
 await f.page.locator('input').click();await f.page.waitForTimeout(100);assert.doesNotThrow(()=>c.assertReady(),JSON.stringify(c.evidence().events));
 for(const code of ['POPUP_BLOCKED','DIALOG_BLOCKED','WEBSOCKET_BLOCKED','FILE_CHOOSER_BLOCKED'])assert.ok(c.evidence().events.some(e=>e.kind==='blocked-side-effect'&&e.code===code),code);assert.deepEqual(f.hits,[]);
});


test('prepare waits for initial HAR resources even when DOM readiness precedes delayed asset replay',async t=>{
 const f=await fixture(t);let assetSettled=false;
 await f.page.route('**/asset.css',async route=>{await new Promise(r=>setTimeout(r,2500));try{await route.fallback();assetSettled=true;}catch{}});
 const c=await createBetaPublicSite(f.page,f.spec);await c.prepare();assert.equal(await f.page.evaluate(()=>document.readyState),'complete','prepare must establish load completion before initial screenshot');assert.equal(assetSettled,true);c.assertReady();assert.deepEqual(f.hits,[]);
});

test('same-document anchors keep delayed disclosure side effects local until a real document navigation',async t=>{
 const f=await fixture(t,'<details><summary onclick="setTimeout(()=>fetch(\'/not-in-har\').catch(()=>{}),150)">Details</summary><p>Local</p></details><a href="#part">Anchor</a><h2 id="part">Part</h2>');const c=await createBetaPublicSite(f.page,f.spec);await c.prepare();let screen=await c.adapter.observe(false);await c.adapter.act({type:'click',elementId:screen.elements.find(e=>e.text==='Details')!.id});screen=await c.adapter.observe(false);await c.adapter.act({type:'click',elementId:screen.elements.find(e=>e.text==='Anchor')!.id});await f.page.waitForTimeout(200);assert.doesNotThrow(()=>c.assertReady(),JSON.stringify(c.evidence().events));assert.ok(c.evidence().events.some(e=>e.code==='LOCAL_DISCLOSURE_NETWORK_BLOCKED'));assert.deepEqual(f.hits,[]);
});

test('verified captured documentation remains clickable despite sign-in wording, without exempting unknown links or auth paths',async t=>{const f=await fixture(t,'<a href="/next">パスキーを使ってサインインする</a><a href="/outside">パスワードでログインする</a><a href="/auth">ログインする</a>');const c=await createBetaPublicSite(f.page,f.spec);await c.prepare();const screen=await c.adapter.observe(false),doc=screen.elements.find(e=>e.text==='パスキーを使ってサインインする')!,outside=screen.elements.find(e=>e.text==='パスワードでログインする')!,auth=screen.elements.find(e=>e.text==='ログインする')!;assert.notEqual(doc.available,false);assert.equal(outside.available,false);assert.equal(auth.available,false);await c.adapter.act({type:'click',elementId:doc.id});assert.equal(f.page.url(),f.origin+'/next');assert.deepEqual(f.hits,[]);});


for(const size of [-1,0])test(`allowed HTML document with size ${size} and no embedded body is rejected before navigation`,async t=>{
 const f=await fixture(t);await f.rewrite(har=>{const entry=har.log.entries.find((e:any)=>e.request.method==='GET'&&e.request.url===f.spec.startURL);assert.ok(entry);entry.response.content={size,mimeType:'text/html'};});
 const controller=await createBetaPublicSite(f.page,f.spec);await assert.rejects(controller.prepare(),/SITE_SNAPSHOT_SPEC_INVALID/);assert.equal(f.page.url(),'about:blank');assert.equal(controller.isSafetyStopped(),false);assert.ok(controller.evidence().events.some(e=>e.kind==='snapshot-error'&&e.code==='SITE_SNAPSHOT_SPEC_INVALID'));assert.ok(!controller.evidence().events.some(e=>e.code==='HAR_VERIFIED'));assert.deepEqual(f.hits,[]);
});
