import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {PublicSitePage} from '../../pages/PublicSitePage.js';
import {publicNavigation} from '../../runner/public-navigation.js';

// Read-only reproduction of the two recorded links, not a Jev exploration.
const origin='https://www.ndl.go.jp',root=resolve('reports',`back-probe-${new Date().toISOString().replaceAll(':','-')}`);
await mkdir(root,{recursive:true});
const browser=await chromium.launch(),context=await browser.newContext({serviceWorkers:'block',acceptDownloads:false}),page=await context.newPage();
const navigation=publicNavigation(context,origin,{'user-agent':await page.evaluate(()=>navigator.userAgent)}),events:any[]=[];
page.on('framenavigated',frame=>{if(frame===page.mainFrame())events.push({event:'framenavigated',url:frame.url(),at:performance.now()});});
page.on('domcontentloaded',()=>events.push({event:'domcontentloaded',url:page.url(),at:performance.now()}));
await context.route('**/*',async route=>{
 const r=route.request();
 if(!['GET','HEAD'].includes(r.method())||new URL(r.url()).origin!==origin)return route.abort();
 if(!r.isNavigationRequest())return route.continue();
 if(r.frame().parentFrame())return route.abort();
 try{
  let response=navigation.take(r.url());if(!response){await navigation.follow(r.url());response=navigation.take(r.url());}
  if(!response)return route.abort();
  try{
   if(response.status()>=300||!/text\/html/.test(response.headers()['content-type']??''))return route.abort();
   const headers=response.headers(),csp=headers['content-security-policy'];
   return await route.fulfill({response,headers:{...headers,'content-security-policy':`${csp?csp+', ':''}form-action 'none'`}});
  }finally{await response.dispose();}
 }catch(error){events.push({routeError:String(error)});return route.abort();}
});
const pom=new PublicSitePage(page,navigation.resolve,navigation.release,true),client=await context.newCDPSession(page);
const record=async(stage:string)=>events.push({stage,at:performance.now(),url:page.url(),history:await client.send('Page.getNavigationHistory'),approved:structuredClone({previous:(pom as any).previousEntries,current:(pom as any).currentEntry,changed:(pom as any).historyChanged})});
try{
 await pom.prepare();await pom.navigateTo(origin+'/help/data#anchor05');await page.waitForTimeout(2000);
 const screen=await pom.observe(true);await record('source');
 const target=screen.elements.find(e=>e.text.includes('書誌データの利用方法')&&e.text.includes('書誌データの利用について'));
 if(!target)throw new Error('Recorded target not visible; no guessed navigation');
 await pom.act({type:'click',elementId:target.id});await page.waitForTimeout(2000);await pom.observe(true);await record('destination');
 try{await pom.act({type:'back'});await record('back');}catch(error){events.push({backError:String(error),at:performance.now()});await record('failed-back');await page.waitForTimeout(1000);await record('after-one-second');}
}catch(error){events.push({error:String(error)});}
finally{await writeFile(join(root,'diagnostic.json'),JSON.stringify(events,null,2));await browser.close();console.log(JSON.stringify({root,events}));}
