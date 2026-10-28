import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer, type ViteDevServer} from 'vite';
import {chromium, type Browser, type BrowserContext, type Page} from 'playwright';
import {holdoutQuery, parseHoldoutFixture, holdoutDefinition, holdoutReferencePath, type HoldoutFixture} from '../app/holdout-fixture.js';

const fixtures:HoldoutFixture[]=(['switch','revisit','direct'] as const).flatMap(task=>(['alpha','beta'] as const).map(variant=>({task,variant})));
const expected={switch:'定期便のお届け曜日を土曜日に変更しました',revisit:'共有リンクを無効にしました',direct:'次回の予約を2026年11月14日に変更しました'};

test('holdout opt-in roundtrips all six assignments and fails closed for ambiguous values',()=>{
 const tokens=['s1a','s1b','r1a','r1b','d1a','d1b'];
 for(const [i,f] of fixtures.entries()){assert.equal(holdoutQuery(f),'?holdout='+tokens[i]);assert.deepEqual(parseHoldoutFixture(holdoutQuery(f)),f);}
 for(const query of ['', '?holdout=', '?holdout=switch','?holdout=__proto__','?holdout=toString','?holdout=S1A','?holdout=s1a&holdout=s1a','?holdout=s1a&holdout=unknown','?holdout=s1a&semanticFixture=q7','?holdout=s1a&betaUI=r'])assert.equal(parseHoldoutFixture(query),undefined,query);
 assert.deepEqual(parseHoldoutFixture('?unrelated=1&holdout=s1a'),{task:'switch',variant:'alpha'});
 for(const value of [{task:'other',variant:'alpha'},{task:'switch',variant:'other'}])assert.throws(()=>holdoutQuery(value as HoldoutFixture),/fixture/i);
});

test('definitions expose a local task goal and independent reference paths',()=>{
 for(const f of fixtures){const d=holdoutDefinition(f);assert.equal(d.version,1);assert.equal(d.task,f.task);assert.equal(d.variant,f.variant);assert.equal(d.objectiveText,expected[f.task]);assert.ok(d.goal.length>10);assert.ok(d.title.length>2);assert.doesNotMatch(d.goal,/data-holdout|primary|alternative|#|API/);}
 assert.deepEqual(holdoutReferencePath({task:'switch',variant:'alpha'}),['alternative','apply']);
 assert.deepEqual(holdoutReferencePath({task:'revisit',variant:'beta'}),['primary','home','account','verify','home','primary','apply']);
 assert.deepEqual(holdoutReferencePath({task:'direct',variant:'alpha'}),['primary','apply']);
 const path=holdoutReferencePath({task:'switch',variant:'alpha'});path.push('forged');assert.equal(holdoutReferencePath({task:'switch',variant:'alpha'}).length,2);
});

let server:ViteDevServer,browser:Browser,baseURL:string,cacheDir:string;
before(async()=>{
 cacheDir=await mkdtemp(join(tmpdir(),'holdout-fixture-vite-'));server=await createServer({cacheDir,optimizeDeps:{entries:[],include:['react','react-dom/client','react/jsx-runtime','react/jsx-dev-runtime']},plugins:[{name:'holdout-test-entry',resolveId(id){if(id==='/__holdout-entry.tsx')return '\0holdout-entry';},load(id){if(id==='\0holdout-entry')return `import React from 'react';import {createRoot} from 'react-dom/client';import {HoldoutFixtureView} from '/app/HoldoutFixture.tsx';import {parseHoldoutFixture} from '/app/holdout-fixture.ts';createRoot(document.getElementById('root')).render(React.createElement(HoldoutFixtureView,{fixture:parseHoldoutFixture(location.search)}));`;},configureServer(vite){vite.middlewares.use((req,res,next)=>{if(!req.url?.startsWith('/__holdout-test'))return next();res.setHeader('Content-Type','text/html');res.end(`<html lang="ja"><head><meta charset="utf-8"></head><body style="margin:0"><div id="root"></div><script type="module" src="/__holdout-entry.tsx"></script></body></html>`);});}}],server:{host:'127.0.0.1',port:0}});
 await server.listen();const address=server.httpServer!.address();assert.ok(address&&typeof address!=='string');baseURL=`http://127.0.0.1:${address.port}`;browser=await chromium.launch({headless:true});
});
after(async()=>{await browser?.close();await server?.close();if(cacheDir)await rm(cacheDir,{recursive:true,force:true});});
async function context(){const c=await browser.newContext({viewport:{width:1280,height:900},locale:'ja-JP'});await c.route('**/*',r=>new URL(r.request().url()).origin===baseURL?r.continue():r.abort());return c;}
async function open(c:BrowserContext,f:HoldoutFixture){const p=await c.newPage();p.setDefaultTimeout(2000);p.setDefaultNavigationTimeout(30000);await p.goto(baseURL+'/__holdout-test'+holdoutQuery(f));await p.locator('.holdout-fixture').waitFor({timeout:15000});await p.evaluate(()=>document.fonts.ready);return p;}
async function action(p:Page,id:string){const link=p.locator(`[data-holdout-action="${id}"]`);await link.click();if(await link.count())await p.waitForTimeout(30);}
async function image(p:Page){return createHash('sha256').update(await p.screenshot()).digest('hex');}
async function sameImage(p:Page,expected:string){assert.equal(await image(p),expected,'home pixels must be identical across a real return');}
async function incomplete(p:Page){assert.equal(await p.getByRole('status').count(),0);assert.equal(await p.locator('[data-holdout-complete="true"]').count(),0);}

for(const f of fixtures)test(`${f.task}/${f.variant}: reference path causes visible objective completion and reload resets`,async()=>{
 const c=await context();try{const p=await open(c,f);await incomplete(p);
 for(const id of holdoutReferencePath(f)){await action(p,id);}
 assert.equal(await p.getByRole('status').innerText(),expected[f.task]);assert.equal(await p.getByRole('status').isVisible(),true);assert.equal(await p.locator('[data-holdout-complete="true"]').count(),1);
 const visible=await p.locator('.holdout-content').innerText();assert.match(visible,f.task==='switch'?/土曜日/:f.task==='revisit'?/無効/:/2026年11月14日/);
 await p.reload();await p.locator('.holdout-fixture').waitFor();await incomplete(p);await action(p,'home');await incomplete(p);
 }finally{await c.close();}
});

test('delivery settings are informative and a real home return preserves an identical home image',async()=>{
 const c=await context();try{for(const variant of ['alpha','beta'] as const){const p=await open(c,{task:'switch',variant});const initial=await image(p);await action(p,'primary');await incomplete(p);assert.match(await p.locator('.holdout-content').innerText(),/配送料|配送エリア/);assert.equal(await p.locator('[data-holdout-action="apply"]').count(),0);await action(p,'home');await sameImage(p,initial);await action(p,'alternative');await action(p,'apply');assert.equal(await p.getByRole('status').innerText(),expected.switch);await p.close();}}finally{await c.close();}
});

test('shared-link prerequisite cannot be bypassed; useful revisit returns to exactly the original home pixels',async()=>{
 const c=await context();try{for(const variant of ['alpha','beta'] as const){const p=await open(c,{task:'revisit',variant}),initial=await image(p);
 await action(p,'account');assert.equal(await p.locator('[data-holdout-action="verify"]').isEnabled(),false);await incomplete(p);await action(p,'home');
 await p.evaluate(()=>{location.hash='apply';});await p.waitForTimeout(40);await incomplete(p);assert.equal(await p.locator('[data-holdout-action="apply"]').count(),0);await action(p,'home');
 await action(p,'primary');assert.match(await p.locator('.holdout-content').innerText(),/本人確認/);assert.equal(await p.locator('[data-holdout-action="apply"]').count(),0);await p.evaluate(()=>{location.hash='account';});await p.waitForTimeout(40);assert.equal(await p.locator('[data-holdout-action="verify"]').isEnabled(),false,'must return home after requesting verification');await action(p,'home');await sameImage(p,initial);
 await action(p,'account');assert.equal(await p.locator('[data-holdout-action="verify"]').isEnabled(),true);await action(p,'verify');await incomplete(p);assert.match(await p.locator('.holdout-content').innerText(),/本人確認が完了/);
 await p.evaluate(()=>{location.hash='primary';});await p.waitForTimeout(40);assert.equal(await p.locator('[data-holdout-action="apply"]').count(),0,'must return home after completing verification');await incomplete(p);await action(p,'home');await sameImage(p,initial);await action(p,'primary');await incomplete(p);assert.match(await p.locator('.holdout-content').innerText(),/有効/);await action(p,'apply');assert.equal(await p.getByRole('status').innerText(),expected.revisit);
 await p.reload();await p.locator('.holdout-fixture').waitFor();await action(p,'home');await action(p,'account');assert.equal(await p.locator('[data-holdout-action="verify"]').isEnabled(),false);await p.close();
 }}finally{await c.close();}
});

test('variants change visible wording and layout while retaining native local navigation and stable pointer rendering',async()=>{
 const c=await context();try{for(const task of ['switch','revisit','direct'] as const){const a=await open(c,{task,variant:'alpha'}),b=await open(c,{task,variant:'beta'});assert.notEqual(await a.locator('.holdout-content').innerText(),await b.locator('.holdout-content').innerText());assert.notDeepEqual(await a.locator('[data-holdout-action="primary"]').boundingBox(),await b.locator('[data-holdout-action="primary"]').boundingBox());
 for(const p of [a,b]){for(const href of await p.locator('a').evaluateAll(links=>links.map(l=>l.getAttribute('href'))))assert.ok(href?.startsWith('#'));const pixels=await image(p);await p.locator('[data-holdout-action="primary"]').hover();assert.deepEqual(await image(p),pixels);assert.equal(await p.locator('input').count(),0);}await a.close();await b.close();}}finally{await c.close();}
});
