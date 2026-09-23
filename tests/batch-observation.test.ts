import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium,type Page} from 'playwright';
import {AutoPage} from '../pages/AutoPage.js';
import {AccountPage} from '../pages/AccountPage.js';
import {PublicSitePage} from '../pages/PublicSitePage.js';
import {candidatesFor} from '../jev/types.js';

// Count real protocol sends while forwarding every call to Chromium. In
// particular, Locator.count/evaluate must not grow with irrelevant controls.
async function protocolCalls<T>(page:Page,run:()=>Promise<T>){
 const connection=(page as any)._connection,send=connection.sendMessageToServer;
 const methods:string[]=[];
 connection.sendMessageToServer=function(owner:unknown,method:string,...args:unknown[]){
  methods.push(method);return send.call(this,owner,method,...args);
 };
 try{return {value:await run(),methods};}
 finally{connection.sendMessageToServer=send;}
}

const fixture=(irrelevant:number)=>`<style>body{font:16px Arial}button,summary,[role]{font:inherit}.offscreen{position:absolute;top:2000px}</style>
 <a href="/next" aria-label="PRIVATE_NAME">Visible<span hidden>PRIVATE_TEXT</span></a>
 <span role="button" tabindex="0" aria-expanded="false" aria-controls="menu" onclick="document.getElementById('menu').hidden=false;this.setAttribute('aria-expanded','true')">Menu</span>
 <div id="menu" hidden><a href="/inside">PRIVATE_PANEL</a></div>
 <details><summary>Details</summary>PRIVATE_DETAILS</details>
 <a href="/file.pdf">PDF</a><a href="https://outside.test/">External</a>
 <a href="/blank" aria-label="PRIVATE_GRAPHIC"><svg width="30" height="30"><rect width="30" height="30"/></svg></a>
 <button>Unsupported</button><span role="link" tabindex="0">ARIA link</span>
 <button disabled>Disabled</button><div inert><button>Inert</button></div>
 <div aria-disabled="true"><button>ARIA disabled</button></div>
 <div style="opacity:0"><button>TRANSPARENT</button></div>
 <button style="position:absolute;top:220px;left:10px">COVERED</button><div style="position:absolute;top:215px;left:0;width:300px;height:50px;background:white;z-index:9"></div>
 <div style="height:2500px"></div>${Array.from({length:irrelevant},(_,i)=>`<button ${i%2?'hidden':'class="offscreen"'}>HIDDEN_${i}</button>`).join('')}`;

test('public observation keeps literal choices and bounds protocol calls with 400 irrelevant controls',async t=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:800,height:600}});
  let body=fixture(0);
  await page.route('https://example.test/**',route=>route.fulfill({contentType:'text/html',body}));
  const pom=new PublicSitePage(page);await pom.prepare();
  const samples:{value:Awaited<ReturnType<typeof pom.observe>>;methods:string[]}[]=[];
  for(const count of [0,400]){
   body=fixture(count);await page.goto('https://example.test/');
   await pom.observe(true); // Both samples include disposal of the previous visible selection.
   samples.push(await protocolCalls(page,()=>pom.observe(true)));
  }
  for(const {value:screen} of samples){
   assert.ok(screen.elements.every(element=>element.context?.landmark==='other'&&element.context.headings.length===0&&/^s\d+$/.test(element.context.section)));
   assert.equal(new Set(screen.elements.map(element=>element.context?.section)).size,1);
   assert.deepEqual(screen.elements.map(({context,...element})=>element),[
    {id:'e1',type:'link',text:'Visible',fontSizePx:16},
    {id:'e2',type:'button',text:'Menu',fontSizePx:16},
    {id:'e3',type:'button',text:'Details',fontSizePx:16},
    {id:'e4',type:'link',text:'PDF',fontSizePx:16,available:false,unavailableReason:'UNSUPPORTED_CONTENT'},
    {id:'e5',type:'link',text:'External',fontSizePx:16,available:false,unavailableReason:'SAFETY_BOUNDARY'},
    {id:'e6',type:'link',text:'',fontSizePx:16,available:false,unavailableReason:'UNOBSERVABLE_LABEL'},
    {id:'e7',type:'button',text:'Unsupported',fontSizePx:16,available:false,unavailableReason:'SAFETY_BOUNDARY'},
    {id:'e8',type:'link',text:'ARIA link',fontSizePx:16,available:false,unavailableReason:'SAFETY_BOUNDARY'},
   ]);
   assert.deepEqual(Object.entries(candidatesFor(screen,false)).filter(([,v])=>v.action.type==='click').map(([id])=>id),['e1','e2','e3']);
   assert.doesNotMatch(JSON.stringify(screen),/PRIVATE_|HIDDEN_|TRANSPARENT|COVERED/);
  }
  const [small,large]=samples.map(sample=>sample.methods.length);
  t.diagnostic(`protocol calls: 0 irrelevant = ${small}; 400 irrelevant = ${large}`);
  assert.ok(large<=small+4,`400 irrelevant controls added ${large-small} protocol calls (${small} -> ${large})`);
  assert.ok(large<=40,`observation used ${large} protocol calls`);
  await pom.act({type:'click',elementId:'e2'});
  assert.equal(await page.locator('#menu').isVisible(),true);
  assert.ok((await pom.observe(false)).text.includes('PRIVATE_PANEL'));
 }finally{await browser.close();}
});

for(const kind of ['auto','public'] as const)test(`${kind} keeps connected targets across hash and pushState but rejects a replacing document`,async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();
  await page.route('https://example.test/**',route=>route.fulfill({contentType:'text/html',body:`
   <button aria-expanded="false" aria-controls="panel" onclick="window.clicks=(window.clicks||0)+1;const panel=document.getElementById('panel');panel.hidden=!panel.hidden;this.setAttribute('aria-expanded',String(!panel.hidden))">Toggle</button>
   <div id="panel" hidden>Panel</div>`}));
  await page.goto('https://example.test/');
  const pom=kind==='auto'?new AutoPage(page):new PublicSitePage(page);
  assert.equal((await pom.observe(false)).elements[0].id,'e1');
  await page.evaluate(()=>{location.hash='anchor';});
  await pom.act({type:'click',elementId:'e1'});
  assert.equal(await page.evaluate(()=>(window as any).clicks),1);
  await page.evaluate(()=>history.pushState({},'', '/same-document'));
  await pom.act({type:'click',elementId:'e1'});
  assert.equal(await page.evaluate(()=>(window as any).clicks),2);
  if(pom instanceof PublicSitePage)await pom.navigateTo('https://example.test/replacement');
  else await page.goto('https://example.test/replacement');
  await assert.rejects(pom.act({type:'click',elementId:'e1'}));
  assert.equal(await page.evaluate(()=>(window as any).clicks||0),0,'the replacement document must not receive the stale click');
  assert.equal((await pom.observe(false)).elements[0].id,'e1');
  await pom.act({type:'click',elementId:'e1'});
  assert.equal(await page.evaluate(()=>(window as any).clicks),1,'a fresh observation binds the replacement target');
 }finally{await browser.close();}
});

for(const kind of ['auto','public'] as const)test(`${kind} actions retain the observed element through DOM reordering and reject replacement`,async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();
  await page.setContent(`<button id="chosen" aria-expanded="false" aria-controls="first" onclick="window.clicked='chosen';document.getElementById('first').hidden=false">Same</button>
   <button id="other" aria-expanded="false" aria-controls="second" onclick="window.clicked='other';document.getElementById('second').hidden=false">Same</button>
   <div id="first" hidden>First panel</div><div id="second" hidden>Second panel</div>`);
  const pom=kind==='auto'?new AutoPage(page):new PublicSitePage(page);
  const screen=await pom.observe(false);assert.deepEqual(screen.elements.map(e=>e.text),['Same','Same']);
  await page.evaluate(()=>document.body.prepend(document.getElementById('other')!));
  const trace=await pom.describeAction({type:'click',elementId:'e1'},1);
  assert.deepEqual(trace.target?.locator,{kind:'css',value:'#chosen'});
  await pom.act({type:'click',elementId:'e1'});
  assert.equal(await page.evaluate(()=>(window as any).clicked),'chosen');
  const next=await pom.observe(false);assert.deepEqual(next.elements.map(e=>e.id),['e1','e2']);
  await page.evaluate(()=>{
   (window as any).clicked='none';
   const original=document.getElementById('other')!,replacement=original.cloneNode(true) as HTMLElement;
   replacement.setAttribute('onclick',"window.clicked='replacement'");original.replaceWith(replacement);
  });
  await assert.rejects(pom.act({type:'click',elementId:'e1'}),/ACTION_ERROR|not attached|detached/);
  assert.equal(await page.evaluate(()=>(window as any).clicked),'none');
 }finally{await browser.close();}
});

test('ordinary AutoPage observes native links without public URL classification',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();
  await page.setContent('<a href="http://[">Malformed destination</a><a href="/relative">Relative destination</a>');
  const elements=(await new AutoPage(page).observe(false)).elements;
  assert.ok(elements.every(element=>element.context?.landmark==='other'&&element.context.headings.length===0&&/^s\d+$/.test(element.context.section)));
  assert.deepEqual(elements.map(({context,...element})=>element),[
   {id:'e1',type:'link',text:'Malformed destination'},
   {id:'e2',type:'link',text:'Relative destination'},
  ]);
 }finally{await browser.close();}
});

test('manual POM preserves declared role/name ordering and visible labels',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();
  await page.setContent('<button aria-label="First">First visible</button><a href="#second" aria-label="Second">Second visible<span hidden>SECRET</span></a><button aria-label="Second" disabled>Disabled</button><button>Unknown</button>');
  class ManualPage extends AccountPage {protected labels=['Second','First'];}
  const pom=new ManualPage(page),screen=await pom.observe(false);
  assert.ok(screen.elements.every(element=>element.context?.landmark==='other'&&element.context.headings.length===0&&/^s\d+$/.test(element.context.section)));
  assert.deepEqual(screen.elements.map(({context,...element})=>element),[{id:'e1',type:'link',text:'Second visible'},{id:'e2',type:'button',text:'First visible'}]);
  await pom.act({type:'click',elementId:'e1'});assert.equal(new URL(page.url()).hash,'#second');
 }finally{await browser.close();}
});
