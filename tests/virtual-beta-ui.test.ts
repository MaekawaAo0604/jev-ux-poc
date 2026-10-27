import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer, type ViteDevServer} from 'vite';
import {chromium, type Browser, type BrowserContext, type Page} from 'playwright';
import {LocalExplorationPage} from '../pages/LocalExplorationPage.js';

let server:ViteDevServer,browser:Browser,baseURL:string;
before(async()=>{
 server=await createServer({server:{host:'127.0.0.1',port:0}});await server.listen();
 const address=server.httpServer!.address();assert.ok(address&&typeof address!=='string');baseURL=`http://127.0.0.1:${address.port}`;
 browser=await chromium.launch({headless:true});
});
after(async()=>{await browser?.close();await server?.close();});
async function context(){
 const c=await browser.newContext({viewport:{width:1280,height:900},locale:'ja-JP',timezoneId:'Asia/Tokyo'});
 await c.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname==='fonts.googleapis.com'&&route.request().resourceType()==='stylesheet')return route.fulfill({contentType:'text/css',body:''});if(url.origin===baseURL)return route.continue();return route.abort();});return c;
}
async function open(c:BrowserContext,path:string){const page=await c.newPage();await page.goto(baseURL+path);await page.locator('main h1').waitFor();await page.evaluate(()=>document.fonts.ready);return page;}
const entry='a[href="#notifications"]',stop='button[data-beta-roi="notification-stop"]';
async function snapshot(page:Page){
 return page.evaluate(()=>{
  const elements=Array.from(document.querySelectorAll('body *')).filter(el=>el.getBoundingClientRect().width&&el.getBoundingClientRect().height);
  return {text:document.body.innerText,viewport:{width:innerWidth,height:innerHeight},scroll:{width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight},elements:elements.map(el=>{
   const r=el.getBoundingClientRect(),s=getComputedStyle(el),target=el.closest('a[href="#notifications"]');
   return {tag:el.tagName,target:!!target,label:!!target&&el===target.querySelector('span'),rect:{x:r.x,y:r.y,width:r.width,height:r.height},style:{color:s.color,background:s.backgroundColor,border:s.border,font:s.font,padding:s.padding,display:s.display,transform:s.transform}};
  })};
 });
}
test('all comparison UIs support ordinary notification stopping and reset after reload/new context',async()=>{
 for(const [token,label] of [['r','通知設定'],['p','通知設定'],['w','メール受信設定']]){
  const c=await context();try{const page=await open(c,`/good/?betaUI=${token}`);
   assert.equal(await page.locator('[data-beta-roi="notification-entry"]').count(),1);
   await page.getByRole('link',{name:label,exact:true}).click();
   assert.match(await page.locator('.panel').innerText(),/現在の設定：受信する/);
   assert.equal(await page.locator(stop).count(),1);await page.getByRole('button',{name:'メール通知を停止する',exact:true}).click();
   assert.equal(await page.getByRole('status').innerText(),'メール通知を停止しました');
   await page.reload();await page.getByRole('button',{name:'メール通知を停止する',exact:true}).waitFor();
   assert.match(await page.locator('.panel').innerText(),/現在の設定：受信する/);assert.equal(await page.getByRole('status').count(),0);
  }finally{await c.close();}
  const fresh=await context();try{const p=await open(fresh,`/good/?betaUI=${token}#notifications`);assert.match(await p.locator('.panel').innerText(),/現在の設定：受信する/);assert.equal(await p.getByRole('status').count(),0);}finally{await fresh.close();}
 }
});
test('reference preserves the existing page pixels; query opt-in does not modify legacy or bad UI',async()=>{
 const c=await context();try{const legacy=await open(c,'/good/'),reference=await open(c,'/good/?betaUI=r');
  assert.deepEqual(await snapshot(reference),await snapshot(legacy));assert.deepEqual(await reference.screenshot(),await legacy.screenshot());
  assert.equal(await legacy.locator('[data-beta-roi]').count(),0);
  for(const path of ['/good/?betaUI=unknown','/bad/?betaUI=w','/bad/?betaUI=p']){const p=await open(c,path);assert.equal(await p.locator('[data-beta-roi]').count(),0);if(path.startsWith('/bad/'))assert.equal(await p.getByRole('link',{name:'メール受信設定',exact:true}).count(),0);await p.close();}
 }finally{await c.close();}
});
test('position-only moves only the notification tile and stays within the same unscrolled viewport',async t=>{
 const c=await context();try{const ref=await open(c,'/good/?betaUI=r'),pos=await open(c,'/good/?betaUI=p'),a=await snapshot(ref),b=await snapshot(pos);
  assert.equal(b.text,a.text);assert.deepEqual(b.viewport,a.viewport);assert.deepEqual(b.scroll,a.scroll);assert.equal(b.scroll.height,900);assert.equal(b.scroll.width,1280);assert.equal(b.elements.length,a.elements.length);
  const dy=(await pos.locator(entry).boundingBox())!.y-(await ref.locator(entry).boundingBox())!.y;assert.ok(dy>=80);
  for(let i=0;i<a.elements.length;i++){const old=a.elements[i],next=b.elements[i];if(!old.target)assert.deepEqual(next,old,`non-target element ${i}`);else{assert.deepEqual(next.rect,{...old.rect,y:old.rect.y+dy});assert.deepEqual({...next.style,transform:old.style.transform},old.style);}}
  const box=(await pos.locator(entry).boundingBox())!;assert.ok(box.y>=0&&box.y+box.height<=900);
  t.diagnostic(JSON.stringify({reference:await ref.locator(entry).boundingBox(),positionOnly:box,viewport:b.viewport,scroll:b.scroll}));
  const controls=await pos.locator('a,button,input,select,textarea').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {target:el.matches('a[href="#notifications"]'),x:r.x,y:r.y,w:r.width,h:r.height};}));
  for(const r of controls.filter(r=>!r.target))assert.ok(box.x+box.width<=r.x||r.x+r.w<=box.x||box.y+box.height<=r.y||r.y+r.h<=box.y,'target must not overlap another control');
 }finally{await c.close();}
});
test('comparison controls preserve live POM DOM-order identities and expose no audit labels as visible observations',async()=>{
 const c=await context();try{
  const legacy=await open(c,'/good/'),original=(await new LocalExplorationPage(legacy).observe(false)).elements;
  for(const token of ['r','p','w']){
   const p=await open(c,`/good/?betaUI=${token}`),screen=await new LocalExplorationPage(p).observe(false);
   assert.deepEqual(screen.elements.map(e=>({...e,text:e.text.replace('メール受信設定','通知設定')})),original);
   assert.doesNotMatch(JSON.stringify({elements:screen.elements,text:screen.text}),/notification-entry|notification-stop|reference|position-only|wording-only|良いUI|悪いUI|正解位置/);
  }
 }finally{await c.close();}
});
test('wording-only changes one label without wrapping, changing tile geometry, other text, or styles',async()=>{
 const c=await context();try{const ref=await open(c,'/good/?betaUI=r'),word=await open(c,'/good/?betaUI=w'),a=await snapshot(ref),b=await snapshot(word);
  assert.equal(b.text,a.text.replace('通知設定','メール受信設定'));assert.deepEqual(b.viewport,a.viewport);assert.deepEqual(b.scroll,a.scroll);assert.equal(b.elements.length,a.elements.length);
  for(let i=0;i<a.elements.length;i++){const old=a.elements[i],next=b.elements[i];assert.deepEqual(next.style,old.style,`styles ${i}`);if(!old.label)assert.deepEqual(next.rect,old.rect,`bounds ${i}`);else assert.equal(next.rect.height,old.rect.height);}
  assert.equal(await word.locator(entry+' span').evaluate(el=>{const r=document.createRange();r.selectNodeContents(el);return r.getClientRects().length;}),1);
  for(const p of [ref,word])assert.doesNotMatch(await p.locator('body').innerText(),/reference|position-only|wording-only|betaUI|良いUI|悪いUI|正解位置/);
 }finally{await c.close();}
});
test('registry maps only explicit supported query tokens to audit-owned UI identities',async()=>{
 const {comparisonUIs,comparisonUIFromSearch,roiSelectors}=await import('../app/virtual-beta-ui.js');
 assert.deepEqual(Object.keys(comparisonUIs),['reference','position-only','wording-only']);
 for(const variant of Object.values(comparisonUIs))assert.equal(comparisonUIFromSearch(`?betaUI=${variant.token}`),variant);
 for(const query of ['','?betaUI=reference','?betaUI=R','?betaUI=','?else=w','?betaUI=w&betaUI=p'])assert.equal(comparisonUIFromSearch(query),undefined);
 assert.deepEqual(roiSelectors,{'notification-entry':'[data-beta-roi="notification-entry"]','notification-stop':'[data-beta-roi="notification-stop"]'});
});
