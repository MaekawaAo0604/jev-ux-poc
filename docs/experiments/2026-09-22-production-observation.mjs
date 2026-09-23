// Production POM diagnostic: generic observed control only, no model or form actions.
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {PublicSitePage} from '../../pages/PublicSitePage.ts';
import {publicNavigation,navigationFailureCategory} from '../../runner/public-navigation.ts';
const root=resolve('reports',`production-observation-${new Date().toISOString().replaceAll(':','-')}`);
await mkdir(root,{recursive:true});
const files=['pages/controls.ts','pages/PublicSitePage.ts','pages/AutoPage.ts','pages/visible-text.ts','jev/types.ts'];
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async f=>[f,createHash('sha256').update(await readFile(f)).digest('hex')])));
const out={startedAt:new Date().toISOString(),kind:'directed-production-POM-check-not-autonomous',sourceHashes:await hashes(),results:[]};
const browser=await chromium.launch();
try{
 for(const spec of [{id:'home-desktop',path:'/',viewport:{width:1440,height:1000}},{id:'home-mobile',path:'/',viewport:{width:390,height:844}},{id:'join-desktop',path:'/flow/join/',viewport:{width:1440,height:1000}}].filter(c=>!process.argv.includes('--mobile-only')||c.id==='home-mobile')){
  const context=await browser.newContext({viewport:spec.viewport,locale:'ja-JP',serviceWorkers:'block',acceptDownloads:false}),page=await context.newPage();
  const origin='https://www.anytimefitness.co.jp',nav=publicNavigation(context,origin,{'accept-language':'ja-JP',accept:'text/html','user-agent':await page.evaluate(()=>navigator.userAgent)});
  let blockedWrites=0;
  await context.route('**/*',async route=>{
   const request=route.request();
   if(!['GET','HEAD'].includes(request.method())){blockedWrites++;return route.abort();}
   if(request.isNavigationRequest()&&(request.frame().parentFrame()||new URL(request.url()).origin!==origin))return route.abort();
   if(!request.isNavigationRequest())return route.continue();
   try{let response=nav.take(request.url());if(!response){await nav.follow(request.url());response=nav.take(request.url());}if(!response)return route.abort();
    const headers=response.headers(),csp=headers['content-security-policy'];
    await route.fulfill({response,headers:{...headers,'content-security-policy':`${csp?csp+', ':''}form-action 'none'`}});await response.dispose();
   }catch{return route.abort();}
  });
  const result={...spec},pom=new PublicSitePage(page,nav.resolve,nav.release);
  try{
   await pom.prepare();await pom.navigateTo(origin+spec.path);await page.waitForTimeout(1000);
   result.before=await pom.observe(true);
   await page.screenshot({path:join(root,`${spec.id}-before.png`)});
   const controls=result.before.elements.filter(e=>e.available!==false&&e.description);
   result.graphicalControls=controls;result.menuDiscovered=controls.length===1;
   if(controls.length!==1){
    result.graphicDiagnostics=await page.evaluate(()=>Array.from(document.querySelectorAll('header div,header span,header i')).filter(el=>{const r=el.getBoundingClientRect();return getComputedStyle(el).cursor==='pointer'&&r.width>0&&r.width<240&&r.height>0&&r.height<120;}).map(el=>({tag:el.tagName,id:el.id,rect:el.getBoundingClientRect().toJSON(),html:el.outerHTML.slice(0,500),styles:[null,'::before','::after'].map(p=>{const s=getComputedStyle(el,p);return {pseudo:p,content:s.content,display:s.display,background:s.backgroundColor,borders:[s.borderTop,s.borderBottom,s.borderLeft,s.borderRight],width:s.width,height:s.height,position:s.position,transform:s.transform,clipPath:s.clipPath,mask:s.maskImage,opacity:s.opacity};})})));
    console.log(JSON.stringify({id:spec.id,diagnostics:result.graphicDiagnostics}));throw new Error('NO_UNIQUE_OBSERVED_GRAPHIC');
   }
   const beforeURL=page.url();await pom.act({type:'click',elementId:controls[0].id});await page.waitForTimeout(800);
   result.sameURL=page.url()===beforeURL;result.after=await pom.observe(true);
   // IDs are diagnostic-only, never supplied to the production observer or action selection.
   result.menuLabels=[];
   for(const e of result.after.elements){
    const diagnostic=await pom.targets.get(e.id).evaluate(el=>({inMenu:!!el.closest('#header-global-menu')&&el.tagName==='A',hasDOMText:!!el.textContent?.trim(),hasImage:!!el.querySelector('img,svg')}));
    if(diagnostic.inMenu)result.menuLabels.push({...e,...diagnostic});
   }
   result.highschool=result.after.elements.filter(e=>e.available!==false&&/高校生|ハイスクール/.test(e.text));
   result.pass=result.sameURL&&result.highschool.length>0&&result.menuLabels.filter(e=>e.hasDOMText).every(e=>!!e.text.trim());
   result.noTextGraphics=result.menuLabels.filter(e=>!e.hasDOMText&&e.hasImage);
   await page.screenshot({path:join(root,`${spec.id}-after.png`)});
  }catch(error){result.pass=false;result.error={category:navigationFailureCategory(error),message:/NO_UNIQUE_OBSERVED_GRAPHIC|ACTION_ERROR|SAFETY_BOUNDARY/.exec(error.message)?.[0]||'OBSERVATION_FAILED'};}
  finally{result.blockedWrites=blockedWrites;await context.close();}
  out.results.push(result);await writeFile(join(root,'validation.json'),JSON.stringify(out,null,2));
  console.log(JSON.stringify({id:spec.id,pass:result.pass,menu:result.graphicalControls,labels:result.menuLabels?.map(e=>e.text),highschool:result.highschool,error:result.error}));
 }
}finally{await browser.close();}
out.finishedAt=new Date().toISOString();out.codeUnchanged=JSON.stringify(await hashes())===JSON.stringify(out.sourceHashes);out.pass=out.codeUnchanged&&out.results.every(r=>r.pass);
await writeFile(join(root,'validation.json'),JSON.stringify(out,null,2));console.log(JSON.stringify({report:join(root,'validation.json'),pass:out.pass}));
