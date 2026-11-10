import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer,type ViteDevServer} from 'vite';
import {chromium,type Browser,type BrowserContext,type Page} from 'playwright';
import {recoveryFixtures,recoveryQuery,recoveryDefinition,type RecoveryFixture} from '../app/recovery-fixture.js';
let server:ViteDevServer,browser:Browser,baseURL:string,cacheDir:string;
before(async()=>{
 assert.ok(existsSync(new URL('../app/RecoveryFixture.tsx',import.meta.url)),'recovery UI must exist');
 cacheDir=await mkdtemp(join(tmpdir(),'recovery-fixture-'));
 server=await createServer({cacheDir,optimizeDeps:{entries:[],include:['react','react-dom/client','react/jsx-runtime','react/jsx-dev-runtime']},plugins:[{name:'recovery-test-entry',resolveId(id){if(id==='/__recovery-entry.tsx')return '\0recovery-entry';},load(id){if(id==='\0recovery-entry')return `import React from 'react';import {createRoot} from 'react-dom/client';import {RecoveryFixtureView} from '/app/RecoveryFixture.tsx';import {parseRecoveryFixture} from '/app/recovery-fixture.ts';createRoot(document.getElementById('root')).render(React.createElement(RecoveryFixtureView,{fixture:parseRecoveryFixture(location.search)}));`;},configureServer(vite){vite.middlewares.use((req,res,next)=>{if(!req.url?.startsWith('/__recovery-test'))return next();res.setHeader('Content-Type','text/html');res.end('<html lang="ja"><head><meta charset="utf-8"></head><body style="margin:0"><div id="root"></div><script type="module" src="/__recovery-entry.tsx"></script></body></html>');});}}],server:{host:'127.0.0.1',port:0,watch:{ignored:['**/reports/**']}}});
 await server.listen();const a=server.httpServer!.address();assert.ok(a&&typeof a!=='string');baseURL=`http://127.0.0.1:${a.port}`;browser=await chromium.launch({headless:true});
});
after(async()=>{await browser?.close();await server?.close();if(cacheDir)await rm(cacheDir,{recursive:true,force:true});});
async function context(){const c=await browser.newContext({viewport:{width:1280,height:900},locale:'ja-JP'});await c.route('**/*',r=>new URL(r.request().url()).origin===baseURL?r.continue():r.abort());return c;}
async function open(c:BrowserContext,f:RecoveryFixture){const p=await c.newPage();p.setDefaultTimeout(3500);await p.goto(baseURL+'/__recovery-test'+recoveryQuery(f));await p.locator('[data-recovery-root]').waitFor();await p.evaluate(()=>document.fonts.ready);return p;}
async function settle(p:Page){await p.evaluate(()=>new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r()))));}
async function action(p:Page,id:string){await p.locator(`[data-recovery-action="${id}"]`).click();await settle(p);}
async function state(p:Page){return JSON.parse((await p.locator('[data-recovery-root]').getAttribute('data-recovery-state'))!);}
async function incomplete(p:Page){assert.equal(await p.locator('[data-recovery-complete="true"]').count(),0);assert.equal((await state(p)).complete,false);}
for(const f of recoveryFixtures())test(`${f.task}/${f.condition}: initial block, reachable saved result and reset`,async()=>{
 const c=await context();try{const p=await open(c,f),d=recoveryDefinition(f);const s=await state(p);assert.deepEqual(s,{schemaVersion:1,route:'primary',eligible:false,verificationAttempts:0,recordChecks:0,savedValue:d.originalValue,complete:false});await incomplete(p);assert.equal(await p.locator('[data-recovery-action="apply"]').count(),0);
 const {recoveryReferencePath}=await import('../app/recovery-certification.js');const steps=recoveryReferencePath(f);assert.equal(steps.length,f.condition==='switch'?3:f.condition==='changed'?6:9);
 for(const id of steps)await action(p,id);
 const final=await state(p);assert.equal(final.savedValue,d.desiredValue);assert.equal(final.complete,true);const status=p.locator('[data-recovery-complete="true"]');assert.equal(await status.innerText(),d.objectiveText);assert.equal(await status.getAttribute('role'),'status');const box=await status.boundingBox();assert.ok(box&&box.y>=0&&box.y+box.height<=900);
 await p.reload();await p.locator('[data-recovery-root]').waitFor();await incomplete(p);assert.deepEqual(await state(p),s);
 }finally{await c.close();}
});
test('changed/unchanged screen, goal and action candidates first diverge only after confirmation',async()=>{
 const c=await context();try{for(const task of ['library','workshop'] as const){const a=await open(c,{version:1,task,condition:'changed'}),b=await open(c,{version:1,task,condition:'unchanged'});for(const path of [[],['home'],['account']] as string[][]){for(const id of path)await Promise.all([action(a,id),action(b,id)]);assert.equal(await a.locator('[data-recovery-root]').innerText(),await b.locator('[data-recovery-root]').innerText());assert.deepEqual(await a.screenshot(),await b.screenshot());assert.deepEqual(await a.locator('a,button').allTextContents(),await b.locator('a,button').allTextContents());}
 await action(a,'confirm');await action(b,'confirm');assert.notEqual(await a.getByRole('status').innerText(),await b.getByRole('status').innerText());assert.equal((await state(a)).eligible,true);assert.equal((await state(b)).eligible,false);await incomplete(a);await incomplete(b);await a.close();await b.close();}}finally{await c.close();}
});
test('unchanged confirmation and unproductive revisit cannot save; records changes eligibility',async()=>{
 const c=await context();try{const p=await open(c,{version:1,task:'library',condition:'unchanged'});for(const id of ['home','account','confirm','home','primary'])await action(p,id);assert.equal((await state(p)).eligible,false);assert.equal((await state(p)).verificationAttempts,1);assert.equal(await p.locator('[data-recovery-action="apply"]').count(),0);await incomplete(p);for(const id of ['home','records','reconcile'])await action(p,id);assert.equal((await state(p)).eligible,true);assert.equal((await state(p)).recordChecks,1);await incomplete(p);for(const id of ['home','primary','apply'])await action(p,id);assert.equal((await state(p)).complete,true);}finally{await c.close();}
});
test('browser back/forward preserve local state, separate pages do not share it, reload returns primary',async()=>{
 const c=await context();try{for(const task of ['library','workshop'] as const){const f={version:1,task,condition:'changed'} as const,p=await open(c,f);await action(p,'home');await action(p,'account');await action(p,'confirm');await p.goBack();await settle(p);assert.equal((await state(p)).route,'home');assert.equal((await state(p)).eligible,true);await p.goForward();await settle(p);assert.equal((await state(p)).route,'account');assert.equal((await state(p)).verificationAttempts,1);const fresh=await open(c,f);assert.equal((await state(fresh)).eligible,false);await p.reload();await p.locator('[data-recovery-root]').waitFor();assert.equal((await state(p)).route,'primary');assert.equal((await state(p)).eligible,false);await p.close();await fresh.close();}}finally{await c.close();}
});


test('record reconciliation is unavailable before account confirmation and cannot bypass the blocked prerequisite',async()=>{
 const c=await context();try{for(const condition of ['changed','unchanged'] as const){const p=await open(c,{version:1,task:'library',condition});await action(p,'home');await action(p,'records');assert.equal(await p.locator('[data-recovery-action="reconcile"]').isDisabled(),true);assert.match(await p.locator('[data-recovery-root]').innerText(),/確認申請がまだありません/);assert.equal((await state(p)).eligible,false);await incomplete(p);await p.close();}}finally{await c.close();}
});
test('actual app routes and independent oracle agree for all six certified paths and reset',async()=>{
 const {recoveryReferencePath}=await import('../app/recovery-certification.js'),{checkRecoveryObjective}=await import('../runner/recovery-oracle.js');
 const c=await context();try{for(const f of recoveryFixtures()){const p=await c.newPage();p.setDefaultTimeout(4000);await p.goto(baseURL+'/good/'+recoveryQuery(f));await p.locator('[data-recovery-root]').waitFor();assert.equal(await checkRecoveryObjective(p,f),false);for(const id of recoveryReferencePath(f))await action(p,id);assert.equal(await checkRecoveryObjective(p,f),true);await p.reload();await p.locator('[data-recovery-root]').waitFor();assert.equal(await checkRecoveryObjective(p,f),false);await p.close();}
 const p=await c.newPage();for(const path of ['/good/?recovery=unknown','/bad/?recovery=p4','/good/?recovery=p4&transfer=t7','/good/?recovery=p4&holdout=s1a','/good/?recovery=p4&semanticFixture=x','/good/?recovery=p4&betaUI=x','/good/?recovery=p4&recovery=p4']){await p.goto(baseURL+path);await p.locator('#root > *').first().waitFor();assert.equal(await p.locator('[data-recovery-root]').count(),0,path);}
 }finally{await c.close();}
});


test('repeated account confirmation after completed reconciliation preserves ready state with consistent feedback',async()=>{
 const c=await context();try{const p=await open(c,{version:1,task:'library',condition:'unchanged'});for(const id of ['home','account','confirm','home','records','reconcile','home','account','confirm'])await action(p,id);assert.equal((await state(p)).eligible,true);assert.equal((await state(p)).verificationAttempts,2);assert.doesNotMatch(await p.getByRole('status').innerText(),/まだ完了していません/);assert.match(await p.getByRole('status').innerText(),/変更を利用できます/);await incomplete(p);}finally{await c.close();}
});
test('switch account confirmation is neutral and does not suggest irrelevant blocking prerequisites',async()=>{
 const c=await context();try{const p=await open(c,{version:1,task:'workshop',condition:'switch'});await action(p,'home');await action(p,'records');assert.doesNotMatch(await p.locator('[data-recovery-root]').innerText(),/確認申請|予約内容に反映/);await action(p,'home');await action(p,'account');assert.doesNotMatch(await p.locator('[data-recovery-root]').innerText(),/変更に必要/);await action(p,'confirm');assert.doesNotMatch(await p.getByRole('status').innerText(),/まだ完了していません|予約記録をご確認/);assert.equal((await state(p)).eligible,false);await action(p,'home');await action(p,'alternative');await action(p,'apply');assert.equal((await state(p)).complete,true);}finally{await c.close();}
});

