import test, {type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,writeFile,rm,symlink,unlink} from 'node:fs/promises';
import {resolve,join,relative,isAbsolute} from 'node:path';
import {chromium,errors,type Browser} from 'playwright';

const modulePath='../runner/capture-public-passkeys';
let capture:any;
test.before(async()=>{try{capture=await import(modulePath);}catch{}assert.equal(typeof capture?.capturePublicPasskeys,'function','readonly capture CLI must expose its capture operation');});
async function temp(t:TestContext){const root=await mkdtemp(resolve('reports/capture-cli-test-'));t.after(async()=>{const rel=relative(resolve('reports'),root);assert.ok(rel&&!rel.startsWith('..')&&!isAbsolute(rel));await rm(root,{recursive:true,force:true});});return root;}
const base='https://docs.github.com/ja/authentication/authenticating-with-a-passkey';
const urls=[base,base+'/about-passkeys',base+'/managing-your-passkeys',base+'/signing-in-with-a-passkey'];

test('robots honors matching groups, merged wildcard groups, longest allow, wildcards, anchors and escaped octets',()=>{
 const cases:[string,string,boolean][]=[
 ['User-agent: *',base,true],
 ['User-agent: OtherBot\nDisallow: /\nUser-agent: *\nAllow: /',base,true],
 ['User-agent: *\nUser-agent: OtherBot\nDisallow: /ja',base,false],
 ['User-agent: *\nDisallow: /ja\nUser-agent: OtherBot\nAllow: /',base,false],
 ['User-agent: *\nDisallow: /ja\nUser-agent: *\nAllow: /ja/authentication',base,true],
 ['User-agent: *\nDisallow: /ja/*/authenticating-with-a-passkey$',base,false],
 ['User-agent: *\nDisallow: /ja/*/authenticating-with-a-passkey$',base+'/about-passkeys',true],
 ['User-agent: *\nDisallow: /ja\nAllow: /ja',base,true],
 ['User-agent: *\nDisallow: /%6Aa',base,false],
 ['User-agent: *\nDisallow: /a.b','https://docs.github.com/axb',true],
 ['User-agent: *\nDisallow: /a%2Fb','https://docs.github.com/a/b',true],
 ['User-agent: *\nDisallow: /パス','https://docs.github.com/%E3%83%91%E3%82%B9',false],
 ['User-agent: *\nDisallow: /\nUser-agent: ExplorationCapture\nAllow: /',base,true],
 ['User-agent: *\nDisallow:',base,true],
 ['User-agent: *\nDisallow:\nUser-agent: OtherBot\nDisallow: /',base,true],
 ];
 for(const [robots,url,allowed] of cases)assert.equal(capture.robotsDecision(robots,url).allowed,allowed,robots+' / '+url);
 for(const robots of ['', '<html>unavailable</html>', 'User-agent: OtherBot\nAllow: /','User-agent: *\nDisallow: relative','User-agent: *\nDisallow: /%XX'])assert.throws(()=>capture.robotsDecision(robots,base),/ROBOTS_/);
});
test('output must be a new directory under real reports ancestors, never existing or symlink escapes',async t=>{
 const root=await temp(t);let launches=0;const factory=async()=>{launches++;throw Error('must not launch');};
 await writeFile(join(root,'marker'),'original');
 for(const out of [root,resolve('package.json'),resolve('reports'),join(root,'missing','out')])await assert.rejects(capture.capturePublicPasskeys({out},factory),/CAPTURE_OUTPUT_/);
 const link=join(root,'linked');try{await symlink(resolve('.'),link,'junction');t.after(()=>unlink(link).catch(()=>{}));await assert.rejects(capture.capturePublicPasskeys({out:join(link,'outside')},factory),/CAPTURE_OUTPUT_/);}catch(error){if((error as NodeJS.ErrnoException).code==='EPERM')t.diagnostic('Account disallows junction creation');else throw error;}
 assert.equal(launches,0);assert.equal(await readFile(join(root,'marker'),'utf8'),'original');
});
async function browserFixture(t:TestContext,robots='User-agent: *',robotsStatus=200,docStatus=200,hostile=false){
 const hits:string[]=[],browser=await chromium.launch({headless:true});t.after(()=>browser.close());
 const server=createServer((req,res)=>{hits.push(req.method+' '+req.url);if(req.url==='/robots.txt'){res.writeHead(robotsStatus,{'content-type':'text/plain'});res.end(robots);return;}
 if(req.url==='/assets/site.css'){res.writeHead(200,{'content-type':'text/css'});res.end('body{font-family:system-ui}');return;}
 res.writeHead(docStatus,{'content-type':'text/html; charset=utf-8'});res.end('<!doctype html><title>Passkey fixture</title><link rel="stylesheet" href="/assets/site.css"><h1>Passkeys</h1><a href="'+base+'">Passkeys</a>'+(hostile?`<script>fetch('/sent',{method:'POST'}).catch(()=>{});fetch('https://outside.invalid/x').catch(()=>{});fetch('/login').catch(()=>{});const f=document.createElement('iframe');f.src='${base}';document.body.append(f);window.open('${base}/about-passkeys');new WebSocket('wss://docs.github.com/socket');</script>`:''));
 });await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise<void>(r=>server.close(()=>r())));const local='http://127.0.0.1:'+(server.address() as any).port;
 const originalNew=browser.newContext.bind(browser);browser.newContext=async options=>{const context=await originalNew(options),get=context.request.get.bind(context.request);context.request.get=async(url,opts)=>{assert.equal(url,'https://docs.github.com/robots.txt');assert.equal(opts?.maxRedirects,0);assert.equal(opts?.maxRetries,0);return get(local+'/robots.txt',opts);};
  await context.route('**/*',async route=>{const q=route.request();const u=new URL(q.url());if(u.origin!=='https://docs.github.com')throw Error('Guard leaked foreign request');const response=await route.fetch({url:local+u.pathname+u.search,maxRedirects:0,maxRetries:0});await route.fulfill({response});});return context;};
 return {hits,factory:async()=>browser as Browser};
}
test('requires successful robots before any document and rejects robots restrictions without implicit permission',async t=>{
 const root=await temp(t);
 for(const [body,status] of [['User-agent: *',404],['User-agent: *',302],['User-agent: *\nDisallow: /ja/*',200],['',200]] as const){const fixture=await browserFixture(t,body,status);await assert.rejects(capture.capturePublicPasskeys({out:join(root,'capture-'+status+'-'+body.length)},fixture.factory),/ROBOTS_/);assert.deepEqual(fixture.hits,['GET /robots.txt']);}
});
test('captures exactly four sequential documents, aborts side effects, preserves originals and hashes embedded replay evidence',async t=>{
 const root=await temp(t),fixture=await browserFixture(t,'User-agent: *',200,200,true),out=join(root,'fresh');const result=await capture.capturePublicPasskeys({out},fixture.factory);
 assert.deepEqual(fixture.hits.filter(x=>!x.includes('/assets/')),['GET /robots.txt',...urls.map(u=>'GET '+new URL(u).pathname)]);
 assert.equal(result.captures.length,4);assert.ok(result.blocked.some((e:any)=>e.code==='METHOD_BLOCKED'));assert.ok(result.blocked.some((e:any)=>e.code==='ORIGIN_BLOCKED'));assert.ok(result.blocked.some((e:any)=>e.code==='FRAME_BLOCKED'||e.code==='POPUP_BLOCKED'));assert.ok(result.blocked.some((e:any)=>e.code==='WEBSOCKET_BLOCKED'));
 const original=await readFile(join(out,'original.har')),replay=await readFile(join(out,'site.har')),spec=JSON.parse(await readFile(join(out,'site-spec.json'),'utf8'));
 assert.equal(spec.harSha256,createHash('sha256').update(replay).digest('hex'));assert.equal(result.originalHarSha256,createHash('sha256').update(original).digest('hex'));assert.deepEqual(spec.allowedDocuments,urls);assert.equal(result.attribution.license,'CC-BY-4.0');assert.match(result.attribution.licenseURL,/LICENSE/);assert.equal(result.robots.status,200);assert.equal(result.robots.decisions.length,4);assert.equal(result.networkMode,'capture-once-replay-offline-no-fallback');
 const har=JSON.parse(replay.toString());assert.ok(har.log.entries.length>=4);for(const e of har.log.entries){assert.equal(new URL(e.request.url).origin,'https://docs.github.com');assert.ok(['GET','HEAD'].includes(e.request.method));assert.equal(typeof e.response.content.text,'string');assert.equal(e.response.content._file,undefined);}
 assert.equal((await readFile(join(out,'page-0.png'))).subarray(1,4).toString(),'PNG');assert.equal(await readFile(join(out,'original.har'),'utf8'),original.toString());
});
test('HTTP errors fail the capture without visiting later documents and keep partial original evidence',async t=>{
 const root=await temp(t),fixture=await browserFixture(t,'User-agent: *',200,503),out=join(root,'failed');await assert.rejects(capture.capturePublicPasskeys({out},fixture.factory),/DOCUMENT_NOT_200/);
 assert.deepEqual(fixture.hits.filter(x=>!x.includes('/assets/')),['GET /robots.txt','GET '+new URL(base).pathname]);assert.ok((await readFile(join(out,'original.har'))).length);assert.equal(JSON.parse(await readFile(join(out,'capture-failure.json'),'utf8')).status,'failed');
});
test('HAR filtering records every omitted unsafe or nonembedded entry without changing input',()=>{
 const entry=(url:string,method='GET',status=200,content:any={text:'x',size:1,mimeType:'text/plain'})=>({request:{url,method},response:{status,content}});
 const input=Buffer.from(JSON.stringify({log:{entries:[entry('https://docs.github.com/assets/a'),entry('https://docs.github.com/assets/download.zip'),entry('https://outside.invalid/a'),entry('https://docs.github.com/assets/a','POST'),entry('https://docs.github.com/assets/a','GET',302),entry('https://docs.github.com/assets/a','GET',200,{_file:'body.txt',size:1}),entry('https://docs.github.com/assets/a','GET',200,{size:1}),entry('https://docs.github.com/elsewhere','GET',200,{text:'<h1>x</h1>',mimeType:'text/html'})]}}));const before=input.toString(),result=capture.normalizeCaptureHAR(input);
 assert.equal(result.retainedEntries,1);assert.equal(result.omitted.length,7);assert.ok(result.omitted.every((e:any)=>typeof e.reason==='string'));assert.equal(input.toString(),before);
});
test('CLI accepts only one explicit --out destination and capture bounds cannot be increased',async t=>{
 assert.deepEqual(capture.parseCaptureArgs(['--out','reports/new']),{out:'reports/new'});for(const args of [[],['--out'],['--out','reports/new','--out','reports/again'],['--url','https://outside.invalid'],['--out','reports/new','--force']])assert.throws(()=>capture.parseCaptureArgs(args),/CAPTURE_USAGE/);
 const root=await temp(t);await assert.rejects(capture.capturePublicPasskeys({out:join(root,'bad-bound'),timeoutMs:45001},async()=>{throw Error('no launch');}),/CAPTURE_TIMEOUT_INVALID/);
});

test('a tighter total deadline stops acquisition and preserves a failed manifest without completing four pages',async t=>{
 const root=await temp(t),fixture=await browserFixture(t),out=join(root,'bounded');const started=Date.now();
 await assert.rejects(capture.capturePublicPasskeys({out,timeoutMs:100},fixture.factory),/CAPTURE_TIMEOUT/);
 assert.ok(Date.now()-started<2000);assert.ok(fixture.hits.filter(x=>x.includes('/ja/')).length<4);const failure=JSON.parse(await readFile(join(out,'capture-failure.json'),'utf8'));assert.equal(failure.status,'failed');assert.equal(failure.error,'CAPTURE_TIMEOUT');
});

test('a browser launched after the deadline is closed instead of leaking or starting requests',async t=>{
 const root=await temp(t);let closed=false,contexts=0;const late={close:async()=>{closed=true;},newContext:async()=>{contexts++;throw Error('late context');}};
 await assert.rejects(capture.capturePublicPasskeys({out:join(root,'late'),timeoutMs:10},async()=>{await new Promise(r=>setTimeout(r,50));return late as unknown as Browser;}),/CAPTURE_TIMEOUT/);
 await new Promise(r=>setTimeout(r,75));assert.equal(closed,true);assert.equal(contexts,0);
});

test('Playwright deadline errors normalize to capture timeout with only safe structured cause',async t=>{
 const root=await temp(t),out=join(root,'operation-timeout');const unsafe='Timeout 3ms exceeded at https://docs.github.com/private?token=do-not-record';
 await assert.rejects(capture.capturePublicPasskeys({out},async()=>{throw new errors.TimeoutError(unsafe);}),{message:'CAPTURE_TIMEOUT'});
 const serialized=await readFile(join(out,'capture-failure.json'),'utf8'),failure=JSON.parse(serialized);
 assert.equal(failure.status,'failed');assert.equal(failure.error,'CAPTURE_TIMEOUT');assert.deepEqual(failure.cause,{name:'TimeoutError',code:'PLAYWRIGHT_OPERATION_TIMEOUT'});assert.equal(serialized.includes('do-not-record'),false);assert.equal(serialized.includes('private'),false);assert.equal(serialized.includes('https://'),false);
});
