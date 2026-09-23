// Diagnostic only: observed DOM details are NOT sent to Jev.
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {chromium} from 'playwright';
import {PublicSitePage} from '../../pages/PublicSitePage.ts';
import {publicControl,controlSelector} from '../../pages/controls.ts';
import {publicNavigation} from '../../runner/public-navigation.ts';

const root=resolve('reports/measurement-2026-09-22');
const outputName=process.argv.includes('--fixtures-only')?'observation-fixtures.json':process.argv.includes('--link-source')?'observation-link-source.json':process.argv.includes('--menu-open')?'observation-final.json':process.argv.includes('--paint-source')?'observation-paint-source.json':process.argv.includes('--menu-source')?'observation-menu-source.json':process.argv.includes('--external')?'observation-live.json':'observation.json';
await mkdir(root,{recursive:true});
const out={startedAt:new Date().toISOString(),kind:'directed-observation-diagnostic',live:[],fixtures:[]};
const browser=await chromium.launch({headless:true});
try {
 for(const spec of process.argv.includes('--fixtures-only')?[]:[
  {id:'home-desktop',path:'/',viewport:{width:1440,height:1000}},
  {id:'home-mobile',path:'/',viewport:{width:390,height:844}},
  {id:'join-desktop',path:'/flow/join/',viewport:{width:1440,height:1000}},
 ]) {
  const context=await browser.newContext({viewport:spec.viewport,locale:'ja-JP',serviceWorkers:'block'});
  const page=await context.newPage(),origin='https://www.anytimefitness.co.jp';
  const nav=publicNavigation(context,origin,{'accept-language':'ja-JP',accept:'text/html','user-agent':await page.evaluate(()=>navigator.userAgent)});
  let blockedWrites=0;
  await context.route('**/*',async route=>{
   const request=route.request();
   if(!['GET','HEAD'].includes(request.method())){blockedWrites++;return route.abort();}
   if(request.isNavigationRequest()&&(request.frame().parentFrame()||new URL(request.url()).origin!==origin))return route.abort();
   if(!request.isNavigationRequest())return route.continue();
   try {
    let response=nav.take(request.url());
    if(!response){await nav.follow(request.url());response=nav.take(request.url());}
    if(!response)return route.abort();
    const headers=response.headers(),csp=headers['content-security-policy'];
    await route.fulfill({response,headers:{...headers,'content-security-policy':`${csp?csp+', ':''}form-action 'none'`}});
    await response.dispose();
   }catch{return route.abort();}
  });
  const pom=new PublicSitePage(page,nav.resolve,nav.release);
  try {
   await pom.prepare();await pom.navigateTo(origin+spec.path);
   const screen=await pom.observe(true),diagnostics=[];
   const menuSources=await page.evaluate(selector=>{
    const result=[];
    for(const el of document.querySelectorAll('body *')){
     const directText=[...el.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent).join('').trim();
     const generated=['::before','::after'].map(p=>({pseudo:p,content:getComputedStyle(el,p).content})).filter(p=>/MENU/i.test(p.content));
     const r=el.getBoundingClientRect(),s=getComputedStyle(el);
     const headerPointer=r.width>0&&r.height>0&&r.width<500&&r.top>=0&&r.bottom<165&&s.cursor==='pointer'&&s.display!=='none'&&s.visibility==='visible'&&!el.closest(selector);
     if(!/^MENU$/i.test(directText)&&!generated.length&&!headerPointer)continue;
     result.push({tag:el.tagName,directText,generated,rect:r.toJSON(),display:s.display,visibility:s.visibility,
      backgroundImage:s.backgroundImage,src:el.getAttribute('src'),pseudoPaint:['::before','::after'].map(p=>({pseudo:p,content:getComputedStyle(el,p).content,backgroundImage:getComputedStyle(el,p).backgroundImage})),
      cursor:s.cursor,matchedControl:el.matches(selector),controlAncestor:el.closest(selector)?.outerHTML.slice(0,1000)||null,
      ancestors:[el,el.parentElement,el.parentElement?.parentElement].filter(Boolean).map(a=>({tag:a.tagName,id:a.id,class:a.className,role:a.getAttribute('role'),tabindex:a.getAttribute('tabindex'),html:a.outerHTML.slice(0,2000)}))});
    }
    return result;
   },controlSelector);
   for(const element of screen.elements){
    const target=pom.targets.get(element.id);
    const dom=await target.evaluate(el=>({tag:el.tagName,text:el.textContent,innerText:el.innerText,
     ariaLabel:el.getAttribute('aria-label'),ariaExpanded:el.getAttribute('aria-expanded'),ariaControls:el.getAttribute('aria-controls'),
     html:el.outerHTML.slice(0,1500),rect:el.getBoundingClientRect().toJSON(),
     generated:[el,...el.querySelectorAll('*')].flatMap(node=>['::before','::after'].map(pseudo=>{
      const style=getComputedStyle(node,pseudo);return {tag:node.tagName,pseudo,content:style.content,display:style.display,visibility:style.visibility,opacity:style.opacity};
     })).filter(p=>!['none','normal','""',"''"].includes(p.content))}));
    diagnostics.push({...element,classification:await target.evaluate(publicControl),dom});
   }
   await page.screenshot({path:join(root,`${spec.id}.png`)});
   let menuProbe;
   if(process.argv.includes('--menu-open')){
    // Known visual control from the preceding diagnostic, NOT a Jev action.
    const menu=page.locator('#site-menu-btn'),beforeURL=page.url();
    menuProbe={kind:'directed-local-menu-toggle',productionClassification:await menu.evaluate(publicControl),beforeURL};
    let blockedAfterClick=0;
    // All network is closed before the diagnostic click, including navigation.
    await page.route('**/*',route=>{blockedAfterClick++;return route.abort();});
    await menu.click({timeout:5000});
    await page.waitForTimeout(700);
    menuProbe.afterURL=page.url();assert.equal(menuProbe.afterURL,beforeURL);
    menuProbe.screen=await pom.observe(true);
    menuProbe.linkLabels=[];
    for(const e of menuProbe.screen.elements){
     const dom=await pom.targets.get(e.id).evaluate(el=>({text:el.textContent?.replace(/\s+/g,' ').trim(),inMenu:!!el.closest('#header-global-menu')}));
     menuProbe.linkLabels.push({id:e.id,extracted:e.text,available:e.available!==false,...dom});
    }
    const highschool=page.locator('#header-global-menu a').filter({hasText:'高校生無料制度'});
    if(await highschool.count())menuProbe.highschoolPaint=await highschool.first().evaluate(el=>{
     const chain=[];for(let a=el;a;a=a.parentElement){const s=getComputedStyle(a);chain.push({tag:a.tagName,id:a.id,class:a.className,clip:s.clip,clipPath:s.clipPath,maskImage:s.maskImage,transform:s.transform,
      pseudo:['::before','::after'].map(p=>{const q=getComputedStyle(a,p);return {pseudo:p,content:q.content,position:q.position,backgroundColor:q.backgroundColor,backgroundImage:q.backgroundImage,left:q.left,top:q.top,width:q.width,height:q.height,transform:q.transform,outline:q.outlineStyle,borderWidths:[q.borderTopWidth,q.borderRightWidth,q.borderBottomWidth,q.borderLeftWidth]};})});}return {rect:el.getBoundingClientRect().toJSON(),chain};
    });
    menuProbe.visibleHighschoolLinks=menuProbe.screen.elements.filter(e=>/高校生|ハイスクール/.test(e.text));
    menuProbe.blockedRequests=blockedAfterClick;
    menuProbe.screenshot=`${spec.id}-menu-open.png`;
    await page.screenshot({path:join(root,menuProbe.screenshot)});
   }
   out.live.push({...spec,url:page.url(),screen,diagnostics,menuSources,menuProbe,blockedWrites,screenshot:`${spec.id}.png`});
   console.log(JSON.stringify({id:spec.id,total:screen.elements.length,available:screen.elements.filter(e=>e.available!==false).length,unlabeled:screen.elements.filter(e=>e.unavailableReason==='UNOBSERVABLE_LABEL').length,menuFound:menuSources.some(e=>e.ancestors[0].id==='site-menu-btn'),menuProbe:menuProbe?{classification:menuProbe.productionClassification,newControls:menuProbe.screen.elements.length,highschool:menuProbe.visibleHighschoolLinks}:null}));
  }catch(error){out.live.push({...spec,error:error.name,message:String(error.message).slice(0,200)});}
  finally{await context.close();}
  await writeFile(join(root,outputName),JSON.stringify(out,null,2));
 }
 const variants=[
  {id:'normal-text',label:'MENU',markup:'<button aria-expanded="false" aria-controls="panel">MENU</button>'},
  {id:'generated-text',label:'MENU',markup:'<style>button::before{content:"MENU"}</style><button aria-expanded="false" aria-controls="panel"></button>'},
  {id:'outside-text',label:'MENU',markup:'<span>MENU</span><button aria-expanded="false" aria-controls="panel">☰</button>'},
  {id:'hidden-text',label:null,markup:'<button aria-expanded="false" aria-controls="panel"><span hidden>MENU</span></button>'},
  {id:'custom-div-text',label:'MENU',markup:'<div style="width:130px;height:50px;cursor:pointer">MENU</div>'},
  {id:'custom-div-image',label:'MENU',markup:'<div style="width:130px;height:50px;cursor:pointer"><img alt="MENU" width="100" height="30" src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%2230%22%3E%3Ctext x=%222%22 y=%2222%22%3EMENU%3C/text%3E%3C/svg%3E"></div>'},
  {id:'button-image',label:'MENU',markup:'<button aria-expanded="false" aria-controls="panel"><img alt="MENU" width="100" height="30" src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%2230%22%3E%3Ctext x=%222%22 y=%2222%22%3EMENU%3C/text%3E%3C/svg%3E"></button>'},
  {id:'role-button-text',label:'MENU',markup:'<div role="button" aria-expanded="false" aria-controls="panel" style="width:130px;height:50px">MENU</div>'},
  {id:'absolute-bullet',label:'高校生制度',markup:'<style>a.test{display:inline-block;position:relative;padding-left:24px;font:20px Arial}a.test::before{content:"・";position:absolute;left:0;top:0}</style><a class="test" href="https://example.invalid/">高校生制度</a>'},
  {id:'no-bullet',label:'高校生制度',markup:'<style>a.test{display:inline-block;position:relative;padding-left:24px;font:20px Arial}</style><a class="test" href="https://example.invalid/">高校生制度</a>'},
 ];
 for(const fixture of variants){
  const context=await browser.newContext({viewport:{width:800,height:500}}),page=await context.newPage();
  const pom=new PublicSitePage(page);await pom.prepare();
  await page.setContent(`<style>button{width:130px;height:50px;margin:20px;font:20px Arial}</style>${fixture.markup}<nav id="panel" hidden><a href="https://example.invalid/">Local example</a></nav>`);
  const screen=await pom.observe(true);
  await page.screenshot({path:join(root,`${fixture.id}.png`)});
  out.fixtures.push({...fixture,screen,screenshot:`${fixture.id}.png`});
  await context.close();
 }
 assert.equal(out.fixtures.find(f=>f.id==='normal-text').screen.elements[0].text,'MENU');
 assert.equal(out.fixtures.find(f=>f.id==='generated-text').screen.elements[0].text,'');
 assert.equal(out.fixtures.find(f=>f.id==='hidden-text').screen.elements[0].available,false);
 assert.equal(out.fixtures.find(f=>f.id==='custom-div-text').screen.elements.length,0);
 assert.equal(out.fixtures.find(f=>f.id==='custom-div-image').screen.elements.length,0);
 assert.equal(out.fixtures.find(f=>f.id==='button-image').screen.elements[0].available,false);
 assert.equal(out.fixtures.find(f=>f.id==='role-button-text').screen.elements[0].text,'MENU');
 if(out.fixtures.some(f=>f.id==='absolute-bullet')){
  assert.equal(out.fixtures.find(f=>f.id==='absolute-bullet').screen.elements[0].text,'');
  assert.equal(out.fixtures.find(f=>f.id==='no-bullet').screen.elements[0].text,'高校生制度');
 }
 out.finishedAt=new Date().toISOString();
 await writeFile(join(root,outputName),JSON.stringify(out,null,2));
 console.log(JSON.stringify({report:join(root,outputName),live:out.live.length,fixtures:out.fixtures.length}));
}finally{await browser.close();}
