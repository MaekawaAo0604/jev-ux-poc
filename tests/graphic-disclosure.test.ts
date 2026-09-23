import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {PublicSitePage} from '../pages/PublicSitePage.js';
import {candidatesFor} from '../jev/types.js';

const graphic='<span><svg aria-label="SECRET_MENU" width="48" height="24"><path d="M0 4h48M0 12h48M0 20h48" stroke="black" stroke-width="3"/></svg></span>';
const fixture=(extra='',handler="document.querySelector('#panel').hidden=!document.querySelector('#panel').hidden")=>`
 <meta http-equiv="Content-Security-Policy" content="form-action 'none'">
 <style>#trigger{cursor:pointer;width:104px;height:24px}#trigger span{display:inline-block}body{margin:20px}</style>
 <header><div><a href="/">Home</a><div id="trigger" onclick="${handler}">${graphic}</div></div>
 <div id="panel" hidden><a href="/one">秘密の案内一</a><a href="/two">秘密の案内二</a>${extra}</div></header><main><h1>公開ページ</h1></main>`;

test('custom header graphic is described without reading image labels or hidden panel text, then toggled for real',async()=>{
 const browser=await chromium.launch();
 try{
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),effects:string[]=[];
  await context.route('https://example.test/**',route=>{
   const path=new URL(route.request().url()).pathname;
   if(path!=='/')effects.push(path);
   return route.fulfill({contentType:'text/html; charset=utf-8',body:path!=='/'?'<h1>次の案内</h1>':fixture('<form role="search" method="get"><input name="s"><input type="submit" value="検索"></form>',"document.querySelector('#panel').hidden=false;fetch('/effect',{method:'POST'}).catch(()=>{});setTimeout(()=>fetch('/late').catch(()=>{}),40)")});
  });
  const pom=new PublicSitePage(page);await pom.prepare();await pom.navigateTo('https://example.test/');
  const before=await pom.observe(false),choices=candidatesFor(before,false);
  const descriptions=before.elements.filter(e=>e.available!==false&&e.description);
  assert.equal(descriptions.length,1,'only the outer graphical trigger is offered');
  const trigger=descriptions[0];
  assert.equal(trigger.text,'','image text is not fabricated');
  assert.match(trigger.description!,/画像.*文字.*未取得/);
  assert.match(choices[trigger.id].label,/画像/);
  assert.doesNotMatch(JSON.stringify(before),/SECRET_MENU|秘密の案内|\/one|\/two/);
  await pom.act({type:'click',elementId:trigger.id});
  await page.waitForTimeout(100);
  assert.deepEqual(effects,[],'custom disclosure blocks immediate and delayed requests');
  const after=await pom.observe(false);
  assert.match(after.text.join('\n'),/秘密の案内一/);
  const link=after.elements.find(e=>e.text==='秘密の案内一')!;
  await pom.act({type:'click',elementId:link.id});
  assert.equal(page.url(),'https://example.test/one');
  assert.deepEqual(effects,['/one']);
 }finally{await browser.close();}
});

test('graphic heuristics reject ambiguous, hidden, non-header and editable panels',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage(),pom=new PublicSitePage(page);
  const cases=[
   fixture('<form><input type="password"></form>'),
   fixture('<form role="search" method="post"><input name="s"></form>'),
   fixture('<input name="s">'),
   fixture('<div contenteditable="true">編集</div>'),
   fixture().replace('</header>','<div hidden><a href="/a">A</a><a href="/b">B</a></div></header>'),
   fixture().replace('<header>','<section>').replace('</header>','</section>'),
   fixture().replace('width="48"','style="visibility:hidden" width="48"'),
   fixture().replace('id="trigger"','id="trigger" role="checkbox"'),
   fixture().replace('</header>',`<div style="cursor:pointer;width:60px;height:30px">${graphic}</div></header>`),
  ];
  for(const body of cases){
   await page.route('https://example.test/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body}));
   await page.goto('https://example.test/');
   const screen=await pom.observe(false);
   assert.equal(screen.elements.filter(e=>e.available!==false&&e.description).length,0,body);
   await page.unrouteAll();
  }
 }finally{await browser.close();}
});

test('custom graphical disclosure cannot report success without an actual visibility change',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();
  await page.route('https://example.test/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:fixture('','void 0')}));
  await page.goto('https://example.test/');
  const pom=new PublicSitePage(page),screen=await pom.observe(false),trigger=screen.elements.find(e=>e.description)!;
  assert.ok(trigger);
  await assert.rejects(pom.act({type:'click',elementId:trigger.id}),/ACTION_ERROR/);
  assert.equal(await page.locator('#panel').isVisible(),false);
 }finally{await browser.close();}
});

test('a CSS-painted header icon remains observable when responsive CSS hides its image text',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const body=fixture().replace(graphic,`${graphic}<i></i>`)+`<style>#trigger{width:32px;height:24px}#trigger span{display:none}#trigger i{display:block;position:relative;width:32px;height:16px;border-top:2px solid black;border-bottom:2px solid black}#trigger i:before{content:'';position:absolute;left:0;top:6px;width:32px;height:2px;background:black}</style>`;
  await page.route('https://example.test/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body}));
  await page.goto('https://example.test/');
  const pom=new PublicSitePage(page),before=await pom.observe(false),trigger=before.elements.find(e=>e.description)!;
  assert.ok(trigger);assert.equal(trigger.text,'');assert.doesNotMatch(JSON.stringify(before),/SECRET_MENU|秘密の案内/);
  await pom.act({type:'click',elementId:trigger.id});
  assert.match((await pom.observe(false)).text.join('\n'),/秘密の案内一/);
 }finally{await browser.close();}
});

test('two empty generated bars can identify a local header icon without treating their content as text',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const body=fixture('',"document.querySelector('#panel').hidden=false;this.classList.add('open')").replace(graphic,'<i></i>')+`<style>#trigger{width:32px;height:24px}#trigger i{display:block;position:relative;width:32px;height:16px}#trigger i:before,#trigger i:after{content:'';position:absolute;left:0;width:32px;height:1px;background:black}#trigger i:before{top:0}#trigger i:after{bottom:0}.open i:before{transform:rotate(45deg)}.open i:after{transform:rotate(-45deg)}</style>`;
  await page.route('https://example.test/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body}));
  await page.goto('https://example.test/');
  const pom=new PublicSitePage(page),before=await pom.observe(false),trigger=before.elements.find(e=>e.description)!;
  assert.ok(trigger);assert.equal(trigger.text,'');
  await pom.act({type:'click',elementId:trigger.id});
  assert.match((await pom.observe(false)).text.join('\n'),/秘密の案内一/);
 }finally{await browser.close();}
});

test('unpainted, offscreen, transformed or clipped CSS icons are not offered',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage(),pom=new PublicSitePage(page);
  for(const css of ['i:before,i:after{left:-10000px!important}','i:before,i:after{transform:scale(0)}','i{clip:rect(0,0,0,0)}','i{border-image:linear-gradient(transparent,transparent) 1}','i:before,i:after{background:transparent!important}','i:before,i:after{background:color(srgb 0 0 0 / 0)!important}','i:before,i:after{background:color(display-p3 0 0 0 / 0)!important}']){
   const body=fixture().replace(graphic,'<i></i>')+`<style>#trigger i{display:block;position:relative;width:32px;height:16px}#trigger i:before,#trigger i:after{content:'';position:absolute;left:0;width:32px;height:1px;background:black}#trigger i:before{top:0}#trigger i:after{bottom:0}${css}</style>`;
   await page.route('https://example.test/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body}));await page.goto('https://example.test/');
   assert.equal((await pom.observe(false)).elements.filter(e=>e.available!==false&&e.description).length,0,css);await page.unrouteAll();
  }
 }finally{await browser.close();}
});

test('a sliding panel is closed while outside the viewport, and stays bound when the trigger changes shape',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage(),pom=new PublicSitePage(page);
  const body=fixture('',"document.querySelector('#panel').style.left='0px';this.style.visibility='hidden'").replace('id="panel" hidden','id="panel" style="position:fixed;left:-10000px;top:100px;width:300px;height:300px;background:white"');
  await page.route('https://example.test/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body}));await page.goto('https://example.test/');
  const before=await pom.observe(false),trigger=before.elements.find(e=>e.description)!;assert.ok(trigger);
  await pom.act({type:'click',elementId:trigger.id});
  assert.match((await pom.observe(false)).text.join('\n'),/秘密の案内一/);
 }finally{await browser.close();}
});
