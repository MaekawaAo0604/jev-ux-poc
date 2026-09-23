// Read-only navigation diagnostic, not a Jev exploration/UX result.
import {chromium} from 'playwright';
import {publicNavigation} from '../../runner/public-navigation.ts';
import {PublicSitePage} from '../../pages/PublicSitePage.ts';
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'ja-JP',serviceWorkers:'block'}),page=await context.newPage();
 const origin='https://www.anytimefitness.co.jp',nav=publicNavigation(context,origin,{'accept-language':'ja-JP',accept:'text/html','user-agent':await page.evaluate(()=>navigator.userAgent)});
 await context.route('**/*',async route=>{
  const request=route.request();
  if(request.isNavigationRequest()&&request.frame().parentFrame())return route.abort();
  if(!['GET','HEAD'].includes(request.method())||request.isNavigationRequest()&&new URL(request.url()).origin!==origin)return route.abort();
  if(!request.isNavigationRequest())return route.continue();
  try{
   let response=nav.take(request.url());
   console.log(JSON.stringify({event:'document-request',url:request.url(),prepared:!!response,current:page.url()}));
   if(!response){await nav.follow(request.url());response=nav.take(request.url());}
   if(!response)return route.abort();
   const headers=response.headers(),policy=headers['content-security-policy'];
   await route.fulfill({response,headers:{...headers,'content-security-policy':`${policy?policy+', ':''}form-action 'none'`}});await response.dispose();
  }catch{await route.abort();}
 });
 const pom=new PublicSitePage(page,nav.resolve,nav.release);
 await pom.prepare();await pom.navigateTo(`${origin}/about/value/`);await page.waitForTimeout(1000);
 const screen=await pom.observe(true),link=screen.elements.find(e=>e.text==='最寄り店舗 検索');
 if(!link)throw new Error('Observed link not found');
 await pom.act({type:'click',elementId:link.id});await page.waitForTimeout(1000);
 console.log(JSON.stringify({event:'after-click',url:page.url()}));
 await pom.act({type:'back'});await page.waitForTimeout(1000);
 console.log(JSON.stringify({event:'after-back',url:page.url()}));
}catch(error){console.log(JSON.stringify({error:error.name}));}
finally{await browser.close();}
