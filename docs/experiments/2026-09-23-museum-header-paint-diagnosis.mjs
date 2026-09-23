// One read-only homepage visit. Diagnostic labels/CSS never enter Jev.
import * as projectPlaywright from 'playwright';
import {PublicSitePage} from '../../pages/PublicSitePage.ts';
import {candidatesFor} from '../../jev/types.ts';

const homepage='https://www.tnm.jp/';
const browser=await projectPlaywright.chromium.launch({headless:true});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'ja-JP',serviceWorkers:'block',acceptDownloads:false});
 const page=await context.newPage();let navigationSeen=false;
 context.on('page',popup=>{if(popup!==page)void popup.close();});
 await context.routeWebSocket('**/*',socket=>socket.close());
 await context.route('**/*',async route=>{
  const request=route.request();
  if(!['GET','HEAD'].includes(request.method()))return route.abort();
  if(!request.isNavigationRequest())return route.continue();
  if(request.frame().parentFrame()||request.url()!==homepage||navigationSeen)return route.abort();
  navigationSeen=true;
  const response=await route.fetch({maxRedirects:0,timeout:20000});
  if(response.status()>=300&&response.status()<400){await response.dispose();return route.abort();}
  const headers=response.headers(),policy=headers['content-security-policy'];
  await route.fulfill({response,headers:{...headers,'content-security-policy':`${policy?policy+', ':''}form-action 'none'`}});
  await response.dispose();
 });
 await page.goto(homepage,{waitUntil:'domcontentloaded',timeout:30000});
 await page.waitForTimeout(1200);
 const observation=await new PublicSitePage(page).observe(true);
 const candidates=candidatesFor(observation,false);
 const diagnosis=await page.evaluate(()=>{
  const cssKeys=['content','position','display','visibility','opacity','left','top','right','bottom','width','height','marginLeft','marginTop','paddingLeft','paddingRight','paddingTop','paddingBottom','borderLeftWidth','borderRightWidth','borderTopWidth','borderBottomWidth','backgroundColor','backgroundImage','boxSizing','transform','translate','rotate','scale','transformOrigin','perspective','zoom','clipPath','clip','maskImage','boxShadow','filter','outlineStyle','textShadow','borderImageSource','offsetPath'];
  const key=el=>el.tagName.toLowerCase()+(el.id?`#${el.id}`:'')+(typeof el.className==='string'&&el.className?'.'+el.className.trim().split(/\s+/).join('.'):'');
  const css=s=>Object.fromEntries([...cssKeys.map(k=>[k,s[k]]),['boxReflect',s.getPropertyValue('-webkit-box-reflect')]]);
  const ancestors=new Map();
  const labels=[];
  for(const el of document.querySelectorAll('header a,header button,[role="banner"] a,[role="banner"] button')){
   const rect=el.getBoundingClientRect(),label=el.textContent?.replace(/\s+/g,' ').trim();
   if(!label||rect.top<70||rect.bottom>150||rect.width<=0||rect.height<=0)continue;
   const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT),textRects=[];
   for(let node=walker.nextNode();node;node=walker.nextNode()){
    if(!node.textContent?.trim())continue;
    const range=document.createRange();range.selectNodeContents(node);
    textRects.push(...Array.from(range.getClientRects(),r=>({left:r.left,top:r.top,right:r.right,bottom:r.bottom})));
   }
   const chain=[];
   for(let node=el;node;node=node.parentElement){
    const name=key(node);chain.push(name);
    if(ancestors.has(name))continue;
    const normal=getComputedStyle(node),pseudos=[];
    for(const pseudo of ['::before','::after']){
     const style=getComputedStyle(node,pseudo);
     if(!['none','normal'].includes(style.content))pseudos.push({pseudo,css:css(style)});
    }
    if(pseudos.length||normal.clip!=='auto'||normal.clipPath!=='none'||normal.maskImage!=='none'||normal.transform!=='none')ancestors.set(name,{element:name,rect:node.getBoundingClientRect().toJSON(),clientLeft:node.clientLeft,clientTop:node.clientTop,scrollLeft:node.scrollLeft,scrollTop:node.scrollTop,clientRects:node.getClientRects().length,css:css(normal),pseudos});
   }
   labels.push({label,textRects,ancestors:chain.filter(name=>ancestors.has(name))});
  }
  return {labels,ancestors:[...ancestors.values()]};
 });
 console.log(JSON.stringify({warnings:observation.warnings,labels:diagnosis.labels.map(entry=>{
  const control=observation.elements.find(item=>item.text===entry.label);
  return {...entry,observed:observation.text.some(text=>text.includes(entry.label)),candidate:!!control&&Object.hasOwn(candidates,control.id),unavailableReason:control?.unavailableReason};
 }),ancestors:diagnosis.ancestors},null,2));
}finally{await browser.close();}
