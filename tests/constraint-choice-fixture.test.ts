import test,{before,after} from 'node:test';

import assert from 'node:assert/strict';

import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';

import {resolve,join} from 'node:path';

import {tmpdir} from 'node:os';

import {createHash} from 'node:crypto';

import {createServer,type ViteDevServer} from 'vite';

import {chromium,type Browser,type BrowserContext,type Page} from 'playwright';

import {personaTaskQuery,parsePersonaTaskFixture,personaTaskDefinition} from '../app/persona-task-fixture.js';

import {readPersonaTaskSnapshot,checkPersonaTaskObjective} from '../runner/persona-task-oracle.js';

const fixture={version:1,task:'methods'} as const;

const labels={local:'このPCに保存',phone:'スマートフォンで承認',code:'メールの一時コード'} as const;

const reportRoot=resolve('reports/constraint-choice-2026-11-08/implementation');

let server:ViteDevServer,browser:Browser,baseURL:string,cacheDir:string;

before(async()=>{

 await mkdir(reportRoot,{recursive:true});cacheDir=await mkdtemp(join(tmpdir(),'method-choice-vite-'));

 server=await createServer({cacheDir,optimizeDeps:{entries:[],include:['react','react-dom/client','react/jsx-runtime','react/jsx-dev-runtime']},plugins:[{name:'method-choice-test-entry',resolveId(id){if(id==='/__method-choice-entry.tsx')return '\0method-choice-entry';},load(id){if(id==='\0method-choice-entry')return "import React from 'react';import {createRoot} from 'react-dom/client';import {PersonaTaskFixtureView} from '/app/PersonaTaskFixture.tsx';import {parsePersonaTaskFixture} from '/app/persona-task-fixture.ts';createRoot(document.getElementById('root')).render(React.createElement(PersonaTaskFixtureView,{fixture:parsePersonaTaskFixture(location.search)}));";},configureServer(vite){vite.middlewares.use((req,res,next)=>{if(!req.url?.startsWith('/__method-choice-test'))return next();res.setHeader('Content-Type','text/html');res.end('<html lang="ja"><head><meta charset="utf-8"></head><body style="margin:0"><div id="root"></div><script type="module" src="/__method-choice-entry.tsx"></script></body></html>');});}}],server:{host:'127.0.0.1',port:0,watch:{ignored:['**/reports/**']}}});

 await server.listen();const address=server.httpServer!.address();assert.ok(address&&typeof address!=='string');baseURL='http://127.0.0.1:'+address.port;browser=await chromium.launch({headless:true});

});

after(async()=>{await browser?.close();await server?.close();if(cacheDir)await rm(cacheDir,{recursive:true,force:true});});

async function context(){return browser.newContext({viewport:{width:1280,height:900},locale:'ja-JP',timezoneId:'Asia/Tokyo'});}

async function settle(p:Page){await p.evaluate(()=>new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r()))));}

async function open(c:BrowserContext,hash=''){const p=await c.newPage();p.setDefaultTimeout(4000);await p.goto(baseURL+'/__method-choice-test'+personaTaskQuery(fixture)+hash);await p.locator('[data-persona-task-root]').waitFor();await settle(p);return p;}

async function action(p:Page,id:string){await p.locator('[data-persona-task-action="'+id+'"]').click();await settle(p);}

async function state(p:Page){return readPersonaTaskSnapshot(p,fixture);}

async function rawState(p:Page){return JSON.parse(await p.locator('[data-persona-task-root]').getAttribute('data-persona-task-state')??'');}



test('methods selector is opaque, exclusive and bound to one shared goal',()=>{

 const query=personaTaskQuery(fixture);assert.deepEqual(parsePersonaTaskFixture(query),fixture);assert.doesNotMatch(query,/methods|local|phone|code/);assert.deepEqual(personaTaskDefinition(fixture),{title:'ログイン方法',goal:'自分の利用環境で次回から使うログイン方法を設定し、設定が保存されたことを確認してください。',objectiveText:'ログイン方法の設定を保存しました。'});

 const token=new URLSearchParams(query).get('personaTask');assert.equal(parsePersonaTaskFixture(query+'&personaTask='+token),undefined);for(const key of ['semanticFixture','holdout','transfer','recovery','betaUI'])assert.equal(parsePersonaTaskFixture(query+'&'+key+'='),undefined);

});

test('all three equal alternatives fit the initial viewport with no selection or preferred default',async()=>{

 const c=await context();try{const p=await open(c,'#complete'),s=await rawState(p);assert.equal(s.route,'start');assert.equal(s.method,'none');assert.equal(s.savedMethod,'none');assert.equal(s.complete,false);assert.deepEqual(s.events,[]);assert.equal(await checkPersonaTaskObjective(p,fixture),false);

 const boxes:{x:number;y:number;width:number;height:number}[]=[];for(const method of ['local','phone','code']){const control=p.locator('[data-persona-task-action="method-'+method+'"]');assert.equal(await control.count(),1);assert.equal(await control.getAttribute('aria-pressed'),'false');const b=await control.boundingBox();assert.ok(b&&b.x>=0&&b.y>=0&&b.x+b.width<=1280&&b.y+b.height<=900);boxes.push(b);assert.match(await control.innerText(),new RegExp(labels[method as keyof typeof labels]));}

 assert.ok(boxes.every(b=>b&&Math.abs(b.width-boxes[0]!.width)<1&&Math.abs(b.height-boxes[0]!.height)<1));assert.equal(await p.locator('[aria-pressed="true"]').count(),0);const text=await p.locator('main').innerText();assert.doesNotMatch(text,/おすすめ|推奨|初期選択|schemaVersion|savedMethod|Persona/);for(const word of ['OS','Bluetooth','6桁','5秒','10秒','60秒'])assert.ok(text.includes(word),word);assert.equal(await p.locator('input,textarea,form,[contenteditable="true"]').count(),0);await p.screenshot({path:join(reportRoot,'initial-methods.png')});

 }finally{await c.close();}

});

for(const method of ['local','phone','code'] as const)test(method+' selection remains draft until explicit save and has matching visible confirmation',async()=>{

 const c=await context();try{const p=await open(c);await action(p,'method-'+method);let s=await rawState(p);assert.equal(s.route,'review');assert.equal(s.method,method);assert.equal(s.savedMethod,'none');assert.equal(s.complete,false);assert.equal(await checkPersonaTaskObjective(p,fixture),false);assert.equal(await p.locator('[data-persona-method-saved]').count(),0);assert.match(await p.locator('main').innerText(),new RegExp(labels[method]));

 await action(p,'save-method');s=await state(p);assert.equal(s.method,method);assert.equal(s.savedMethod,method);assert.equal(s.complete,true);assert.equal(await checkPersonaTaskObjective(p,fixture),true);const status=p.locator('[data-persona-task-complete="true"]');assert.equal(await status.getAttribute('role'),'status');assert.equal((await status.innerText()).trim(),'ログイン方法の設定を保存しました。');const saved=p.locator('[data-persona-method-saved="'+method+'"]');assert.equal((await saved.innerText()).trim(),labels[method]);await p.screenshot({path:join(reportRoot,'saved-'+method+'.png')});

 }finally{await c.close();}

});

test('cancel, native Back and later edits never auto-save; reload restores none/none',async()=>{

 const c=await context();try{const p=await open(c);await action(p,'method-local');await p.goBack();await settle(p);let s=await rawState(p);assert.equal(s.route,'start');assert.equal(s.savedMethod,'none');assert.equal(s.complete,false);await action(p,'method-phone');await action(p,'cancel-method');s=await rawState(p);assert.equal(s.route,'start');assert.equal(s.savedMethod,'none');assert.equal(await checkPersonaTaskObjective(p,fixture),false);

 await action(p,'method-code');await action(p,'save-method');await action(p,'change-method');await action(p,'method-phone');s=await state(p);assert.equal(s.method,'phone');assert.equal(s.savedMethod,'code');assert.equal((await p.locator('[data-persona-method-saved="code"]').innerText()).trim(),labels.code);await action(p,'cancel-method');assert.equal((await state(p)).savedMethod,'code');await action(p,'method-local');await p.goBack();await settle(p);assert.equal((await state(p)).savedMethod,'code');await p.reload();await p.locator('[data-persona-task-root]').waitFor();await settle(p);s=await state(p);assert.equal(s.method,'none');assert.equal(s.savedMethod,'none');assert.equal(s.complete,false);assert.equal(s.route,'start');

 }finally{await c.close();}

});

test('fresh contexts have identical initial pixels and all paths stay local without credentials or storage',async()=>{

 const hashes:string[]=[];for(const n of [1,2]){const c=await context();try{const requests:string[]=[];c.on('request',r=>{if(!['GET','HEAD'].includes(r.method())||new URL(r.url()).origin!==baseURL)requests.push(r.method()+' '+r.url());});const p=await open(c);hashes.push(createHash('sha256').update(await p.screenshot()).digest('hex'));for(const method of ['local','phone','code']){await action(p,'method-'+method);await action(p,'cancel-method');}assert.deepEqual(requests,[]);assert.equal(await p.evaluate(()=>localStorage.length+sessionStorage.length),0);assert.equal(await p.locator('input,textarea,form').count(),0);assert.match(await p.locator('main').innerText(),/架空|サンプル/);}finally{await c.close();}}

 assert.equal(new Set(hashes).size,1);await writeFile(join(reportRoot,'initial-pixel-hashes.json'),JSON.stringify(hashes)+'\n');

});


test('normal /good/ router and shared app styles preserve all three visible unselected options',async()=>{
 const c=await context();try{await c.route('https://fonts.googleapis.com/**',route=>route.fulfill({contentType:'text/css',body:''}));const p=await c.newPage();p.setDefaultTimeout(4000);await p.goto(baseURL+'/good/'+personaTaskQuery(fixture));await p.locator('[data-persona-task-root]').waitFor();await settle(p);assert.equal((await state(p)).method,'none');assert.equal((await state(p)).savedMethod,'none');for(const method of ['local','phone','code']){const control=p.locator('[data-persona-task-action="method-'+method+'"]');assert.equal(await control.getAttribute('aria-pressed'),'false');const b=await control.boundingBox();assert.ok(b&&b.x>=0&&b.y>=0&&b.x+b.width<=1280&&b.y+b.height<=900);}await p.screenshot({path:join(reportRoot,'initial-methods-normal-route.png')});await action(p,'method-phone');await action(p,'save-method');assert.equal(await checkPersonaTaskObjective(p,fixture),true);
 }finally{await c.close();}
});
