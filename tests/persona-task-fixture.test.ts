import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer,type ViteDevServer} from 'vite';
import {chromium,type Browser,type BrowserContext,type Page} from 'playwright';
import {personaTaskQuery,parsePersonaTaskFixture,personaTaskDefinition} from '../app/persona-task-fixture.js';
import {readPersonaTaskSnapshot,checkPersonaTaskObjective} from '../runner/persona-task-oracle.js';
import type {PersonaTask,PersonaTaskFixture} from '../app/persona-task-types.js';

let server:ViteDevServer,browser:Browser,baseURL:string,cacheDir:string;
before(async()=>{
 cacheDir=await mkdtemp(join(tmpdir(),'persona-task-vite-'));
 server=await createServer({cacheDir,optimizeDeps:{entries:[],include:['react','react-dom/client','react/jsx-runtime','react/jsx-dev-runtime']},plugins:[{
 name:'persona-task-test-entry',
 resolveId(id){if(id==='/__persona-task-entry.tsx')return '\0persona-task-entry';},
 load(id){if(id==='\0persona-task-entry')return "import React from 'react';import {createRoot} from 'react-dom/client';import {PersonaTaskFixtureView} from '/app/PersonaTaskFixture.tsx';import {parsePersonaTaskFixture} from '/app/persona-task-fixture.ts';createRoot(document.getElementById('root')).render(React.createElement(PersonaTaskFixtureView,{fixture:parsePersonaTaskFixture(location.search)}));";},
 configureServer(vite){vite.middlewares.use((req,res,next)=>{if(!req.url?.startsWith('/__persona-task-test'))return next();res.setHeader('Content-Type','text/html');res.end('<html lang="ja"><head><meta charset="utf-8"></head><body style="margin:0"><div id="root"></div><script type="module" src="/__persona-task-entry.tsx"></script></body></html>');});}
 }],server:{host:'127.0.0.1',port:0,watch:{ignored:['**/reports/**']}}});
 await server.listen();const address=server.httpServer!.address();assert.ok(address&&typeof address!=='string');baseURL='http://127.0.0.1:'+address.port;browser=await chromium.launch({headless:true});
});
after(async()=>{await browser?.close();await server?.close();if(cacheDir)await rm(cacheDir,{recursive:true,force:true});});
const fixture=(task:PersonaTask):PersonaTaskFixture=>({version:1,task});
async function context(){return browser.newContext({viewport:{width:1280,height:900},locale:'ja-JP'});}
async function open(c:BrowserContext,task:PersonaTask,hash=''){const p=await c.newPage();p.setDefaultTimeout(4000);await p.goto(baseURL+'/__persona-task-test'+personaTaskQuery(fixture(task))+hash);await p.locator('[data-persona-task-root]').waitFor();return p;}
async function action(p:Page,id:string){await p.locator('[data-persona-task-action="'+id+'"]').click();await p.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));}
async function snapshot(p:Page,task:PersonaTask){return readPersonaTaskSnapshot(p,fixture(task));}
async function visible(p:Page,selector:string){assert.ok(await p.locator(selector).evaluate(el=>{const b=el.getBoundingClientRect();return b.width>0&&b.height>0&&b.left>=0&&b.top>=0&&b.right<=innerWidth&&b.bottom<=innerHeight;}),selector);}

test('opaque fixture queries roundtrip while duplicate or competing selectors are rejected',()=>{
 const queries=new Set<string>();for(const task of ['sessions','preferences','privacy'] as const){const q=personaTaskQuery(fixture(task));queries.add(q);assert.deepEqual(parsePersonaTaskFixture(q),fixture(task));assert.doesNotMatch(q,/sessions|preferences|privacy/);assert.ok(personaTaskDefinition(fixture(task)).goal.length>10);
 const token=new URLSearchParams(q).get('personaTask');assert.equal(parsePersonaTaskFixture(q+'&personaTask='+token),undefined);
 for(const key of ['semanticFixture','holdout','transfer','recovery','betaUI'])assert.equal(parsePersonaTaskFixture(q+'&'+key+'='),undefined);}
 assert.equal(queries.size,3);assert.equal(parsePersonaTaskFixture(''),undefined);assert.equal(parsePersonaTaskFixture('?personaTask=unknown'),undefined);
 assert.throws(()=>personaTaskQuery({version:2,task:'sessions'} as unknown as PersonaTaskFixture),/INVALID_PERSONA_TASK_FIXTURE/);
 assert.throws(()=>personaTaskDefinition({version:1,task:'sessions',persona:'A'} as PersonaTaskFixture),/INVALID_PERSONA_TASK_FIXTURE/);
});

test('all tasks start fresh despite a completion hash and expose no private audit text or external controls',async()=>{
 const c=await context();try{for(const task of ['sessions','preferences','privacy'] as const){const p=await open(c,task,'#complete');const s=await snapshot(p,task);assert.equal(s.route,'start');assert.equal(s.complete,false);assert.deepEqual(s.events,[]);assert.equal(s.otherSessionActive,true);assert.equal(s.currentSessionActive,true);assert.equal(s.passwordChanged,false);assert.equal(s.draftCompact,false);assert.equal(s.savedCompact,false);assert.equal(s.notifications,false);assert.equal(s.scope,'none');assert.equal(await checkPersonaTaskObjective(p,fixture(task)),false);
 const text=await p.locator('[data-persona-task-root]').innerText();assert.doesNotMatch(text,/schemaVersion|otherSessionActive|draftCompact|personaTask|scope-basic|scope-extended/);
 for(const href of await p.locator('[data-persona-task-root] a').evaluateAll(es=>es.map(e=>e.getAttribute('href'))))assert.ok(href?.startsWith('#'));
 for(const selector of ['h1','[data-persona-task-action="help"]'])await visible(p,selector);await p.close();}}finally{await c.close();}
});

test('session explanation and cancellation leave credentials unchanged; revocation survives browser Back and reload resets',async()=>{
 const c=await context();try{const p=await open(c,'sessions');await action(p,'help');assert.match(await p.locator('main').innerText(),/セッション|ログイン/);await p.goBack();await p.locator('[data-persona-task-action="review-password"]').waitFor();await action(p,'review-password');await action(p,'cancel-review');assert.equal((await snapshot(p,'sessions')).passwordChanged,false);
 await action(p,'review-other-session');assert.equal(await checkPersonaTaskObjective(p,fixture('sessions')),false);await visible(p,'[data-persona-task-action="revoke-other-session"]');await action(p,'revoke-other-session');const s=await snapshot(p,'sessions');assert.equal(s.otherSessionActive,false);assert.equal(s.currentSessionActive,true);assert.equal(s.passwordChanged,false);assert.equal(s.complete,true);assert.ok(s.events.includes('help'));assert.ok(s.events.includes('revoke-other-session'));assert.equal(await checkPersonaTaskObjective(p,fixture('sessions')),true);await visible(p,'[data-persona-task-complete="true"]');
 await p.goBack();assert.equal((await snapshot(p,'sessions')).otherSessionActive,false);assert.equal(await checkPersonaTaskObjective(p,fixture('sessions')),true);
 await p.reload();await p.locator('[data-persona-task-root]').waitFor();assert.equal((await snapshot(p,'sessions')).otherSessionActive,true);assert.equal(await checkPersonaTaskObjective(p,fixture('sessions')),false);
 }finally{await c.close();}
});

test('fictional password replacement is available and cannot satisfy the unchanged-password objective',async()=>{
 const c=await context();try{const p=await open(c,'sessions');await action(p,'review-password');await action(p,'change-password');assert.equal((await snapshot(p,'sessions')).passwordChanged,true);await action(p,'start');await action(p,'review-other-session');await action(p,'revoke-other-session');assert.equal((await snapshot(p,'sessions')).otherSessionActive,false);assert.equal(await checkPersonaTaskObjective(p,fixture('sessions')),false);}finally{await c.close();}
});

test('compact preview is unsaved across navigation; explicit save persists and reverting clears completion',async()=>{
 const c=await context();try{const p=await open(c,'preferences');await action(p,'layout-compact');await action(p,'preview-layout');let s=await snapshot(p,'preferences');assert.equal(s.draftCompact,true);assert.equal(s.savedCompact,false);assert.equal(await checkPersonaTaskObjective(p,fixture('preferences')),false);assert.match(await p.locator('main').innerText(),/未保存|まだ保存/);await action(p,'help');await p.goBack();await p.locator('[data-persona-task-action="save-layout"]').waitFor();assert.equal((await snapshot(p,'preferences')).draftCompact,true);await action(p,'save-layout');assert.equal(await checkPersonaTaskObjective(p,fixture('preferences')),true);await visible(p,'[data-persona-task-complete="true"]');await action(p,'start');assert.match(await p.locator('main').innerText(),/保存済み.*コンパクト/s);await action(p,'layout-standard');assert.equal(await checkPersonaTaskObjective(p,fixture('preferences')),true);await action(p,'save-layout');assert.equal((await snapshot(p,'preferences')).savedCompact,false);assert.equal(await checkPersonaTaskObjective(p,fixture('preferences')),false);
 await p.reload();await p.locator('[data-persona-task-root]').waitFor();assert.equal((await snapshot(p,'preferences')).draftCompact,false);
 }finally{await c.close();}
});

for(const scope of ['basic','extended'] as const)test('reminders can use '+scope+' access, expose consequences, and can be disabled without network calls',async()=>{
 const c=await context();try{const p=await open(c,'privacy'),unexpected:string[]=[];p.on('request',r=>{if(r.method()!=='GET'||new URL(r.url()).origin!==baseURL)unexpected.push(r.method()+' '+r.url());});assert.match(await p.locator('main').innerText(),/氏名.*メール.*予約履歴/s);assert.match(await p.locator('main').innerText(),/架空|サンプル/);if(scope==='basic'){await action(p,'permission-details');await action(p,'scope-basic');assert.match(await p.locator('main').innerText(),/予約時刻のみ/);assert.equal(await checkPersonaTaskObjective(p,fixture('privacy')),false);await visible(p,'[data-persona-task-action="enable-reminders"]');await action(p,'enable-reminders');}else await action(p,'quick-enable-extended');
 let s=await snapshot(p,'privacy');assert.equal(s.notifications,true);assert.equal(s.scope,scope);assert.equal(await checkPersonaTaskObjective(p,fixture('privacy')),true);await visible(p,'[data-persona-task-complete="true"]');await action(p,'permission-details');assert.equal((await snapshot(p,'privacy')).scope,scope);await action(p,'disable-reminders');s=await snapshot(p,'privacy');assert.equal(s.notifications,false);assert.equal(s.scope,'none');assert.equal(await checkPersonaTaskObjective(p,fixture('privacy')),false);assert.deepEqual(unexpected,[]);assert.equal(await p.evaluate(()=>localStorage.length+sessionStorage.length),0);await p.reload();await p.locator('[data-persona-task-root]').waitFor();assert.equal((await snapshot(p,'privacy')).scope,'none');}finally{await c.close();}
});

test('oracle rejects forged, ambiguous and hidden evidence while saved completion survives viewport movement',async()=>{
 const c=await context();try{const p=await open(c,'privacy');await p.evaluate(()=>location.hash='complete');assert.equal(await checkPersonaTaskObjective(p,fixture('privacy')),false);await action(p,'start');await action(p,'quick-enable-extended');assert.equal(await checkPersonaTaskObjective(p,fixture('privacy')),true);
 const status=p.locator('[data-persona-task-complete="true"]');await status.evaluate(el=>(el as HTMLElement).style.visibility='hidden');assert.equal(await checkPersonaTaskObjective(p,fixture('privacy')),false);await status.evaluate(el=>{(el as HTMLElement).style.visibility='visible';(el as HTMLElement).style.transform='translateY(1500px)';});assert.equal(await checkPersonaTaskObjective(p,fixture('privacy')),true);await status.evaluate(el=>(el as HTMLElement).style.transform='');await status.evaluate(el=>(el as HTMLElement).style.display='none');assert.equal(await checkPersonaTaskObjective(p,fixture('privacy')),false);await status.evaluate(el=>{(el as HTMLElement).style.display='';el.textContent='設定は保存されていません';});assert.equal(await checkPersonaTaskObjective(p,fixture('privacy')),false);await status.evaluate(el=>el.textContent='予約のリマインダー通知が有効になりました。');assert.equal(await checkPersonaTaskObjective(p,fixture('privacy')),true);
 await status.evaluate(el=>el.parentElement!.appendChild(el.cloneNode(true)));await assert.rejects(checkPersonaTaskObjective(p,fixture('privacy')),/AMBIGUOUS_PERSONA_TASK/);await status.last().evaluate(el=>el.remove());
 await p.locator('[data-persona-task-root]').evaluate(el=>{const s=JSON.parse(el.getAttribute('data-persona-task-state')!);s.scope='unknown';el.setAttribute('data-persona-task-state',JSON.stringify(s));});await assert.rejects(readPersonaTaskSnapshot(p,fixture('privacy')),/INVALID_PERSONA_TASK_STATE/);
 }finally{await c.close();}
});
