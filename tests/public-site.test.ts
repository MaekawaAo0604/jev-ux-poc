import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {PublicSitePage} from '../pages/PublicSitePage.js';
import {candidatesFor} from '../jev/types.js';

test('Back waits for the approved landing despite a same-URL unload history event',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();let homeRequests=0;
  await page.route('https://example.test/**',async route=>{
   const home=new URL(route.request().url()).pathname==='/';
   if(home&&++homeRequests>1)await new Promise(r=>setTimeout(r,150));
   await route.fulfill({contentType:'text/html',headers:{'cache-control':'no-store'},body:`<h1>${home?'Home':'Next'}</h1><a href="/next">Next</a><script>addEventListener('beforeunload',()=>history.replaceState({},'',location.href))</script>`});
  });
  const pom=new PublicSitePage(page);await pom.navigateTo('https://example.test/');
  const screen=await pom.observe(false);await pom.act({type:'click',elementId:screen.elements[0].id});
  await pom.act({type:'back'});
  assert.equal(page.url(),'https://example.test/');assert.equal(await page.locator('h1').textContent(),'Home');
  assert.equal(pom.canGoBack,false);
 }finally{await browser.close();}
});

test('Back still rejects a same-origin landing that rewrites the approved URL',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();let homeRequests=0;
  await page.route('https://example.test/**',route=>{
   const home=new URL(route.request().url()).pathname==='/',rewrite=home&&++homeRequests>1;
   return route.fulfill({contentType:'text/html',headers:{'cache-control':'no-store'},body:`<h1>Page</h1><a href="/next">Next</a>${rewrite?'<script>history.replaceState({},"","/unexpected")</script>':''}`});
  });
  const pom=new PublicSitePage(page);await pom.navigateTo('https://example.test/');
  const screen=await pom.observe(false);await pom.act({type:'click',elementId:screen.elements[0].id});
  await assert.rejects(pom.act({type:'back'}),/SAFETY_BOUNDARY: back destination changed/);
 }finally{await browser.close();}
});

for(const bootstrap of ['explicit-navigation','existing-page'] as const)for(const mutation of ['pushState','replaceState'] as const)test(`initial history baseline rejects ${mutation} before the first click (${bootstrap})`,async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();
  await page.route('https://example.test/**',route=>route.fulfill({contentType:'text/html',body:'<h1>Page</h1><a href="/next">Next</a>'}));
  if(bootstrap==='existing-page')await page.goto('https://example.test/');
  const pom=new PublicSitePage(page);
  if(bootstrap==='explicit-navigation')await pom.navigateTo('https://example.test/');
  const screen=await pom.observe(false);
  await page.evaluate(kind=>{history[kind]({},'','/unobserved');},mutation);
  if(bootstrap==='existing-page')await pom.observe(false); // A later observation cannot approve the inserted source.
  await pom.act({type:'click',elementId:screen.elements[0].id});
  await assert.rejects(pom.act({type:'back'}),/SAFETY_BOUNDARY: back destination changed/);
  assert.equal(page.url(),'https://example.test/next','back must never reach the unobserved source URL');
  assert.equal(pom.canGoBack,false);
 }finally{await browser.close();}
});

test('back follows each observed same-hash navigation entry even when the URL did not change',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();
  await page.route('https://example.test/**',route=>route.fulfill({contentType:'text/html',body:route.request().url().endsWith('/next')?'<h1 id="section">Next</h1><a href="/next#section">Again</a>':'<h1>Home</h1><a href="/next#section">Next</a>'}));
  const client=await page.context().newCDPSession(page),pom=new PublicSitePage(page);
  await pom.navigateTo('https://example.test/');
  const initial=await client.send('Page.getNavigationHistory');
  for(let i=0;i<3;i++){
   const screen=await pom.observe(false);await pom.act({type:'click',elementId:screen.elements[0].id});
  }
  const after=await client.send('Page.getNavigationHistory');
  assert.equal(after.currentIndex,initial.currentIndex+3,'each observed same-hash goto adds a native entry');
  assert.equal(new Set(after.entries.slice(-3).map(entry=>entry.id)).size,3);
  for(let i=0;i<3;i++){
   await pom.act({type:'back'});
   assert.equal(page.url(),i<2?'https://example.test/next#section':'https://example.test/');
   assert.equal((await client.send('Page.getNavigationHistory')).currentIndex,after.currentIndex-i-1,'back traverses one actual entry');
   assert.equal(pom.canGoBack,i<2);
  }
 }finally{await browser.close();}
});

test('reloading an observed non-hash URL does not invent another back entry',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();
  await page.route('https://example.test/**',route=>route.fulfill({contentType:'text/html',body:'<h1>Page</h1><a href="/next">Next</a>'}));
  const client=await page.context().newCDPSession(page),pom=new PublicSitePage(page);
  await pom.navigateTo('https://example.test/');
  let screen=await pom.observe(false);await pom.act({type:'click',elementId:screen.elements[0].id});
  const before=await client.send('Page.getNavigationHistory');
  screen=await pom.observe(false);await pom.act({type:'click',elementId:screen.elements[0].id});
  const after=await client.send('Page.getNavigationHistory');
  assert.equal(after.currentIndex,before.currentIndex);
  await pom.act({type:'back'});assert.equal(page.url(),'https://example.test/');
  assert.equal(pom.canGoBack,false);
 }finally{await browser.close();}
});

for(const mutation of ['push-same-url','replace-url'] as const)test(`back refuses unobserved ${mutation} before traversing native history`,async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();
  await page.route('https://example.test/**',route=>route.fulfill({contentType:'text/html',body:'<h1>Page</h1><a href="/next">Next</a>'}));
  const client=await page.context().newCDPSession(page),pom=new PublicSitePage(page);
  await pom.navigateTo('https://example.test/');
  const screen=await pom.observe(false);await pom.act({type:'click',elementId:screen.elements[0].id});
  await page.evaluate(kind=>{if(kind==='push-same-url')history.pushState({},'',location.href);else history.replaceState({},'','/unobserved');},mutation);
  const before=await client.send('Page.getNavigationHistory');
  await assert.rejects(pom.act({type:'back'}),/SAFETY_BOUNDARY: back destination changed/);
  const after=await client.send('Page.getNavigationHistory');
  assert.equal(after.currentIndex,before.currentIndex,'an unobserved entry must be rejected before back');
  assert.equal(after.entries[after.currentIndex].url,before.entries[before.currentIndex].url);
 }finally{await browser.close();}
});

test('back rejects a newly unapproved destination before changing browser history',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();let changed=false;
  await page.route('https://example.test/**',route=>route.fulfill({contentType:'text/html',body:'<h1>Page</h1><a href="/next">Next</a>'}));
  const pom=new PublicSitePage(page,async url=>changed?'https://external.invalid/':url);
  await pom.navigateTo('https://example.test/');
  const screen=await pom.observe(false);await pom.act({type:'click',elementId:screen.elements[0].id});
  changed=true;
  await assert.rejects(pom.act({type:'back'}),/SAFETY_BOUNDARY: back destination changed/);
  assert.equal(page.url(),'https://example.test/next');
 }finally{await browser.close();}
});

test('back rejects a same-document history entry that was not an observed destination',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();
  await page.route('https://example.test/**',route=>route.fulfill({contentType:'text/html',body:route.request().url().endsWith('/next')?'<h1>Next</h1><script>history.pushState({},"","/unobserved");history.pushState({},"","/current")</script>':'<h1>Home</h1><a href="/next">Next</a>'}));
  const pom=new PublicSitePage(page);await pom.prepare();await pom.navigateTo('https://example.test/');
  const screen=await pom.observe(false);await pom.act({type:'click',elementId:screen.elements[0].id});
  await assert.rejects(pom.act({type:'back'}),/SAFETY_BOUNDARY: back destination changed/);
 }finally{await browser.close();}
});

test('image-only controls without observable labels are not offered as blank action choices',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();
  await page.route('https://example.test/**',route=>route.fulfill({contentType:'text/html',body:'<a href="/home" aria-label="SECRET_ROUTE"><svg width="40" height="40"><rect width="40" height="40"/></svg></a><a href="/faq">FAQ</a>'}));
  await page.goto('https://example.test/');
  const screen=await new PublicSitePage(page).observe(false),candidates=candidatesFor(screen,false);
  const blank=screen.elements.find(e=>e.text==='')!;assert.ok(blank);
  assert.equal(candidates[blank.id],undefined);
  assert.ok(Object.values(candidates).some(c=>c.label.includes('FAQ')));
  assert.equal(blank.unavailableReason,'UNOBSERVABLE_LABEL');
  assert.ok(screen.warnings?.includes('UNLABELED_CONTROLS_EXCLUDED'));
  assert.doesNotMatch(JSON.stringify(screen),/SECRET_ROUTE/);
 }finally{await browser.close();}
});

test('public exploration does not execute inline handlers on navigation links',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();
  await page.route('https://example.test/**',route=>route.fulfill({contentType:'text/html',body:'<h1>Home</h1><a href="/pricing" onclick="throw new Error(\'handler executed\')">Pricing</a>'}));
  await page.goto('https://example.test/');
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const pom=new PublicSitePage(page),screen=await pom.observe(false);
  await pom.act({type:'click',elementId:screen.elements[0].id});
  assert.equal(page.url(),'https://example.test/pricing');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('public exploration stops at PDF, different origin and non-navigation buttons',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();
  await page.route('https://example.test/**',route=>route.fulfill({contentType:'text/html',body:'<h1>Home</h1><a href="/guide.pdf">PDF</a><a href="https://example.test:444/">External</a><button aria-expanded="false">Submit</button>'}));
  await page.goto('https://example.test/');
  const pom=new PublicSitePage(page);
  const screen=await pom.observe(false);
  assert.ok(Object.values(candidatesFor(screen,false)).every(c=>c.action.type!=='click'));
  for(const element of screen.elements){
   await assert.rejects(pom.act({type:'click',elementId:element.id}),/UNSUPPORTED_CONTENT|SAFETY_BOUNDARY/);
   assert.equal(page.url(),'https://example.test/');
  }
 }finally{await browser.close();}
});

test('public disclosures expose actual menu and FAQ text only after a click',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();
  await page.route('https://example.test/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:`<h1>Home</h1>
   <li><span role="button" tabindex="0" aria-haspopup="true" aria-expanded="false"
    onclick="this.setAttribute('aria-expanded','true');this.nextElementSibling.hidden=false">利用案内</span>
    <div aria-label="利用案内のサブメニュー" hidden><a href="/fees">料金</a></div></li>
   <li itemscope itemtype="https://schema.org/Question"><h5 itemprop="name"
    onclick="this.nextElementSibling.hidden=false">見学できますか？</h5>
    <p itemprop="acceptedAnswer" itemscope itemtype="https://schema.org/Answer" hidden>見学できます<a href="/tour">詳細</a></p></li>
   <details><summary>詳細案内</summary>追加の案内</details>
   <form><button aria-expanded="false" aria-controls="danger">送信</button></form><div id="danger" hidden>秘密</div>`}));
  await page.goto('https://example.test/');
  const pom=new PublicSitePage(page);
  for(const [label,answer] of [['利用案内','料金'],['見学できますか？','見学できます'],['詳細案内','追加の案内']]){
   const before=await pom.observe(false);
   assert.ok(!before.text.includes(answer));
   const button=before.elements.find(e=>e.text===label)!;
   assert.ok(button,`discovered ${label}`);
   assert.ok(candidatesFor(before,false)[button.id]);
   await pom.act({type:'click',elementId:button.id});
   assert.match((await pom.observe(false)).text.join('\n'),new RegExp(answer));
  }
  const after=await pom.observe(false),submit=after.elements.find(e=>e.text==='送信')!;
  assert.equal(submit.available,false);
  await assert.rejects(pom.act({type:'click',elementId:submit.id}),/SAFETY_BOUNDARY/);
 }finally{await browser.close();}
});

test('disclosures block immediate and delayed network effects and recheck stale controls',async()=>{
 const browser=await chromium.launch();
 try{
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),effects:string[]=[];
  await context.route('https://example.test/**',route=>{
   const path=new URL(route.request().url()).pathname;
   if(path!=='/')effects.push(path);
   return route.fulfill({contentType:'text/html; charset=utf-8',body:`<button type="button" aria-expanded="false" aria-controls="panel" onclick="
    this.setAttribute('aria-expanded','true');document.getElementById('panel').hidden=false;
    fetch('/effect',{method:'POST'}).catch(()=>{});setTimeout(()=>fetch('/late').catch(()=>{}),50)
   ">メニュー</button><div id="panel" hidden><a href="/safe">案内</a></div>`});
  });
  const pom=new PublicSitePage(page);
  await page.goto('https://example.test/');
  const before=await pom.observe(false),button=before.elements[0];
  await pom.act({type:'click',elementId:button.id});
  await page.waitForTimeout(150);await pom.observe(false);
  assert.deepEqual(effects,[]);
  await page.locator('button').evaluate(el=>el.removeAttribute('aria-controls'));
  await assert.rejects(pom.act({type:'click',elementId:button.id}),/SAFETY_BOUNDARY/);
 }finally{await browser.close();}
});

for(const spoof of [false,true])test(`disclosure networking stays blocked during navigation (same-document spoof: ${spoof})`,async()=>{
 const browser=await chromium.launch();
 try{
  const context=await browser.newContext(),page=await context.newPage(),effects:string[]=[];
  await context.route('https://example.test/**',async route=>{
   const path=new URL(route.request().url()).pathname;
   if(path==='/late'){effects.push(path);return route.fulfill({body:'effect'});}
   await new Promise(resolve=>setTimeout(resolve,400));
   return route.fulfill({contentType:'text/html; charset=utf-8',body:`<button type="button" aria-expanded="false" aria-controls="p" onclick="this.setAttribute('aria-expanded','true');document.getElementById('p').hidden=false;setTimeout(()=>{${spoof?`history.pushState({},'', '${path==='/'?'/next':'/'}');`:''}fetch('/late').catch(()=>{});},200)">Menu</button><div id="p" hidden><a href="/next">Next</a></div>`});
  });
  const pom=new PublicSitePage(page);await pom.prepare();await page.goto('https://example.test/');
  let screen=await pom.observe(false);
  await pom.act({type:'click',elementId:screen.elements.find(e=>e.text==='Menu')!.id});
  screen=await pom.observe(false);await pom.act({type:'click',elementId:screen.elements.find(e=>e.text==='Next')!.id});
  assert.deepEqual(effects,[],'outgoing page remained blocked during goto');
  screen=await pom.observe(false);await pom.act({type:'click',elementId:screen.elements.find(e=>e.text==='Menu')!.id});
  // pushState inserted an unobserved history entry: reject that back target.
  if(spoof)await assert.rejects(pom.act({type:'back'}),/ERR_FAILED|SAFETY_BOUNDARY/);
  else await pom.act({type:'back'});
  assert.deepEqual(effects,[],'outgoing page remained blocked during goBack');
  if(!spoof)assert.equal(page.url(),'https://example.test/');
 }finally{await browser.close();}
});
