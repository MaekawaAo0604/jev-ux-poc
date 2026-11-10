import test, {before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer,type ViteDevServer} from 'vite';
import {chromium,type Browser,type BrowserContext,type Page} from 'playwright';
import {transferQuery,type TransferFixture} from '../app/transfer-fixture.js';
let server:ViteDevServer,browser:Browser,baseURL:string,cacheDir:string;
before(async()=>{
 cacheDir=await mkdtemp(join(tmpdir(),'transfer-fixture-vite-'));
 server=await createServer({cacheDir,optimizeDeps:{entries:[],include:['react','react-dom/client','react/jsx-runtime','react/jsx-dev-runtime']},plugins:[{name:'transfer-test-entry',resolveId(id){if(id==='/__transfer-entry.tsx')return '\0transfer-entry';if(id==='https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600;700&display=swap')return '\0empty-fonts';},load(id){if(id==='\0empty-fonts')return '';if(id==='\0transfer-entry')return `import React from 'react';import {createRoot} from 'react-dom/client';import {TransferFixtureView} from '/app/TransferFixture.tsx';import {parseTransferFixture} from '/app/transfer-fixture.ts';createRoot(document.getElementById('root')).render(React.createElement(TransferFixtureView,{fixture:parseTransferFixture(location.search)}));`;},configureServer(vite){vite.middlewares.use((req,res,next)=>{if(!req.url?.startsWith('/__transfer-test'))return next();res.setHeader('Content-Type','text/html');res.end(`<html lang="ja"><head><meta charset="utf-8"></head><body style="margin:0"><div id="root"></div><script type="module" src="/__transfer-entry.tsx"></script></body></html>`);});}}],server:{host:'127.0.0.1',port:0,watch:{ignored:['**/reports/**']}}});
 await server.listen();const address=server.httpServer!.address();assert.ok(address&&typeof address!=='string');baseURL=`http://127.0.0.1:${address.port}`;browser=await chromium.launch({headless:true});
});
after(async()=>{await browser?.close();await server?.close();if(cacheDir)await rm(cacheDir,{recursive:true,force:true});});
async function context(){const c=await browser.newContext({viewport:{width:1280,height:900},locale:'ja-JP'});await c.route('**/*',r=>{const u=new URL(r.request().url());return u.origin===baseURL?r.continue():u.hostname==='fonts.googleapis.com'?r.fulfill({contentType:'text/css',body:''}):r.abort();});return c;}
async function open(c:BrowserContext,f:TransferFixture){const p=await c.newPage();p.setDefaultTimeout(2500);await p.goto(baseURL+'/__transfer-test'+transferQuery(f));await p.locator('.transfer-root').waitFor({timeout:6000});await p.evaluate(()=>document.fonts.ready);return p;}
async function action(p:Page,id:string){await p.locator(`[data-transfer-action="${id}"]`).click();await p.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));}
async function incomplete(p:Page){assert.equal(await p.locator('[data-transfer-complete="true"]').count(),0);}
test('catalog initially has no completed save and provides a visible screening list',async()=>{const c=await context();try{const p=await open(c,{version:1,task:'catalog',variant:'alpha'});await incomplete(p);assert.match(await p.locator('.transfer-root').innerText(),/朝の港/);}finally{await c.close();}});

const cases: {fixture:TransferFixture;want:string}[]=[
 {fixture:{version:1,task:'catalog',variant:'alpha'},want:'「川辺の記録」をマイリストに追加しました'},
 {fixture:{version:1,task:'catalog',variant:'beta'},want:'「風の通り道」をマイリストに追加しました'},
 {fixture:{version:1,task:'draft',variant:'alpha'},want:'「水辺の散歩」の公開範囲をチーム内に保存しました'},
 {fixture:{version:1,task:'draft',variant:'beta'},want:'「水辺の散歩」の公開範囲をチーム内に保存しました'},
 {fixture:{version:1,task:'help',variant:'alpha'},want:'朝の水辺ツアーの集合案内を表示しています'},
 {fixture:{version:1,task:'help',variant:'beta'},want:'朝の水辺ツアーの集合案内を表示しています'},
];
async function fullyVisible(p:Page,selector:string){return p.locator(selector).evaluate(el=>{const b=el.getBoundingClientRect(),s=getComputedStyle(el);return b.width>0&&b.height>0&&b.x>=0&&b.y>=0&&b.right<=innerWidth&&b.bottom<=innerHeight&&s.visibility==='visible'&&s.display!=='none';});}
for(const {fixture,want} of cases)test(`${fixture.task}/${fixture.variant}: real reference clicks complete visibly and reload clears state`,async()=>{
 const {transferReferencePath}=await import('../app/transfer-certification.js');
 const c=await context();try{const p=await open(c,fixture);await incomplete(p);
 for(const id of transferReferencePath(fixture))await action(p,id);
 const completed=p.locator('[data-transfer-complete="true"]');assert.equal(await completed.count(),1);assert.equal(await completed.innerText(),want);assert.equal(await completed.getAttribute('role'),'status');assert.ok(await fullyVisible(p,'[data-transfer-complete="true"]'));
 if(fixture.task==='help'){assert.ok(await fullyVisible(p,'[data-transfer-field="place"]'));assert.ok(await fullyVisible(p,'[data-transfer-field="belongings"]'));assert.equal(await p.locator('[data-transfer-field="place"]').innerText(),fixture.variant==='alpha'?'中央公園・東口案内所':'川辺広場・北側受付');assert.equal(await p.locator('[data-transfer-field="belongings"]').innerText(),fixture.variant==='alpha'?'水筒と帽子':'歩きやすい靴と雨具');}
 await p.reload();await p.locator('.transfer-root').waitFor();await incomplete(p);
 }finally{await c.close();}
});
test('catalog saves the chosen item naturally, rejects both wrong conditions, and supports a later qualifying save',async()=>{
 const c=await context();try{for(const variant of ['alpha','beta'] as const){const p=await open(c,{version:1,task:'catalog',variant});
 const wrong=variant==='alpha'?[['harbor','朝の港'],['night','夜の散歩']]:[['boat','小舟の一日'],['forest','森を歩く']];
 for(const [id,title] of wrong){await action(p,'film-'+id);await action(p,'save-'+id);await incomplete(p);assert.equal(await p.getByRole('status').innerText(),'「'+title+'」をマイリストに追加しました');await action(p,'catalog-home');}
 await action(p,'filter-saturday');assert.equal(await p.locator('[data-transfer-action="film-'+(variant==='alpha'?'night':'forest')+'"]').count(),0);
 const target=variant==='alpha'?'river':'breeze';await action(p,'film-'+target);await action(p,'save-'+target);assert.equal(await p.locator('[data-transfer-complete="true"]').count(),1);await action(p,'catalog-home');assert.match(await p.locator('.transfer-saved').innerText(),/朝の港|小舟の一日/);assert.match(await p.locator('.transfer-saved').innerText(),/川辺の記録|風の通り道/);await p.close();}
 }finally{await c.close();}
});
test('draft pending scope, another memo, and committed wrong scope cannot complete',async()=>{
 const c=await context();try{for(const variant of ['alpha','beta'] as const){const p=await open(c,{version:1,task:'draft',variant});
 await action(p,'memo-other');await action(p,'scope-team');await action(p,'save-scope');await incomplete(p);assert.match(await p.getByRole('status').innerText(),/星を見に行く/);await action(p,'draft-home');
 await action(p,'memo-main');await action(p,'scope-team');await incomplete(p);assert.match(await p.locator('.transfer-committed').innerText(),/全員に公開/);assert.match(await p.locator('.transfer-pending').innerText(),/チーム内/);
 await action(p,'scope-private');await action(p,'save-scope');await incomplete(p);assert.match(await p.locator('.transfer-committed').innerText(),/自分だけ/);
 await action(p,'scope-team');await incomplete(p);await action(p,'save-scope');assert.equal(await p.locator('[data-transfer-complete="true"]').count(),1);
 await action(p,'scope-private');assert.match(await p.locator('.transfer-committed').innerText(),/チーム内/);await action(p,'save-scope');await incomplete(p);await p.close();}
 }finally{await c.close();}
});
test('help partial event information and useful travel guidance do not complete',async()=>{
 const c=await context();try{for(const variant of ['alpha','beta'] as const){const p=await open(c,{version:1,task:'help',variant});await action(p,'travel');await incomplete(p);assert.match(await p.locator('.transfer-root').innerText(),/交通|駅/);await p.goBack();await action(p,'events');await action(p,'meeting');await incomplete(p);assert.ok(await p.locator('[data-transfer-field="place"]').isVisible());assert.equal(await p.locator('[data-transfer-field="belongings"]').count(),0);await action(p,'details');assert.equal(await p.locator('[data-transfer-complete="true"]').count(),1);await p.goBack();await p.locator('[data-transfer-action="details"]').waitFor();await incomplete(p);await action(p,'details');assert.equal(await p.locator('[data-transfer-complete="true"]').count(),1);await p.close();}}finally{await c.close();}
});
test('each family supports native browser Back, local links, distinct layouts and no text entry',async()=>{
 const c=await context();try{for(const task of ['catalog','draft','help'] as const){const pages:Page[]=[];for(const variant of ['alpha','beta'] as const){const p=await open(c,{version:1,task,variant});pages.push(p);const first=task==='catalog'?'film-harbor':task==='draft'?'memo-main':'events';const id=task==='catalog'&&variant==='beta'?'film-forest':first;await action(p,id);await p.goBack();await p.locator(`[data-transfer-action="${id}"]`).waitFor();await incomplete(p);assert.equal(await p.locator('input,select,textarea').count(),0);for(const href of await p.locator('.transfer-root a').evaluateAll(links=>links.map(l=>l.getAttribute('href'))))assert.ok(href?.startsWith('#'));}
 assert.notEqual(await pages[0].locator('.transfer-root').innerText(),await pages[1].locator('.transfer-root').innerText());assert.notDeepEqual(await pages[0].locator('.transfer-content').boundingBox(),await pages[1].locator('.transfer-content').boundingBox());await Promise.all(pages.map(p=>p.close()));}}finally{await c.close();}
});
test('actual application mounts only recognized opt-in transfer routes',async()=>{
 const c=await context();try{const p=await c.newPage();for(const path of ['/good/','/bad/?transfer=t7','/good/?transfer=unknown','/good/?transfer=t7&holdout=s1a','/good/?transfer=t7&transfer=t7']){await p.goto(baseURL+path);await p.locator('#root > *').first().waitFor();assert.equal(await p.locator('.transfer-root').count(),0,path);}
 await p.goto(baseURL+'/good/?transfer=t7');await p.locator('.transfer-root').waitFor();await incomplete(p);
 }finally{await c.close();}
});



test('all six actual application routes agree with independent objective checks and reset',async()=>{
 const {transferReferencePath}=await import('../app/transfer-certification.js');const {checkTransferObjective}=await import('../runner/transfer-oracle.js');
 await mkdir('reports/transfer-evaluation-2026-10-29',{recursive:true});const c=await context();try{for(const {fixture} of cases){const p=await c.newPage();p.setDefaultTimeout(3000);await p.goto(baseURL+'/good/'+transferQuery(fixture));await p.locator('.transfer-root').waitFor();assert.equal(await checkTransferObjective(p,fixture),false);for(const id of transferReferencePath(fixture))await action(p,id);assert.equal(await checkTransferObjective(p,fixture),true,fixture.task+'/'+fixture.variant);
 if(fixture.task==='help'){await p.locator('[data-transfer-field="belongings"]').evaluate(el=>(el as HTMLElement).style.visibility='hidden');assert.equal(await checkTransferObjective(p,fixture),false,'hidden information cannot complete');await p.locator('[data-transfer-field="belongings"]').evaluate(el=>(el as HTMLElement).style.visibility='visible');assert.equal(await checkTransferObjective(p,fixture),true);}
 await p.screenshot({path:'reports/transfer-evaluation-2026-10-29/ui-'+fixture.task+'-'+fixture.variant+'.png'});await p.reload();await p.locator('.transfer-root').waitFor();assert.equal(await checkTransferObjective(p,fixture),false);await p.close();}}finally{await c.close();}
});

