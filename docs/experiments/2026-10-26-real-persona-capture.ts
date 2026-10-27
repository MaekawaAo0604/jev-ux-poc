import {chromium} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {PublicSitePage} from '../../pages/PublicSitePage.js';
import {ClientToolPage} from '../../pages/ClientToolPage.js';
import {candidatesFor} from '../../jev/types.js';
const root=resolve(process.argv[2]??'reports/persona-real-pages-capture-2026-10-26'),spec=JSON.parse(await readFile('experiments/persona/real-pages.json','utf8'));
await mkdir(root);await writeFile(join(root,'spec.json'),JSON.stringify(spec,null,2));
const hash=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex'),browser=await chromium.launch({headless:true}),records:any[]=[];
try{for(const scene of spec.scenes){
 const path=join(root,scene.id);await mkdir(path);const target=new URL(scene.url),context=await browser.newContext({viewport:spec.viewport,locale:spec.locale,timezoneId:spec.timezoneId,serviceWorkers:'block',acceptDownloads:false});
 const page=await context.newPage(),assets:any[]=[],blocked:any[]=[];page.setDefaultTimeout(10000);
 await context.routeWebSocket('**/*',s=>s.close());page.on('filechooser',c=>void c.setFiles([]));page.on('download',d=>void d.cancel());page.on('dialog',d=>void d.dismiss());context.on('page',p=>{if(p!==page)void p.close();});
 await context.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());if(!['GET','HEAD'].includes(req.method())||u.origin!==target.origin){blocked.push({method:req.method(),url:u.origin+u.pathname});return route.abort();}try{const response=await route.fetch({maxRedirects:0,maxRetries:0,timeout:30000});try{const status=response.status();if(status===403||status===429||status>=300&&status<400)throw new Error('HTTP_BOUNDARY');const bytes=await response.body();assets.push({url:u.href,status,sha256:hash(bytes),bytes:bytes.length});const headers=response.headers();await route.fulfill({response,headers:{...headers,'content-security-policy':(headers['content-security-policy']?headers['content-security-policy']+', ':'')+"form-action 'none'"}});}finally{await response.dispose();}}catch{blocked.push({url:u.pathname,error:'RESOURCE_ERROR'});await route.abort();}});
 await context.tracing.start({screenshots:true,snapshots:true,sources:false});
 try{
  const pom=scene.id==='control'?new ClientToolPage(page,true,true):new PublicSitePage(page,async url=>{if(new URL(url).origin!==target.origin)throw new Error('SCOPE');return url;},async()=>{},true);
  if(pom instanceof PublicSitePage)await pom.navigateTo(scene.url);else await page.goto(scene.url,{waitUntil:'networkidle',timeout:30000});
  await page.waitForTimeout(1200);const screen=await pom.observe(false),candidates=candidatesFor(screen,false),capture=await pom.captureDecisionScreenshot(screen,candidates,join(path,'before.png'));
  const descriptions=Object.fromEntries(await Promise.all(Object.entries(candidates).filter(([,c])=>c.action.type!=='done'&&c.action.type!=='stuck').map(async([id,c])=>[id,await pom.describeAction(c.action,1)])));
  const charter={schemaVersion:1,id:'real-'+scene.id,targetWebsite:scene.url,goal:scene.goal,initialState:{description:'公開サイトの初期画面。履歴なし。',currentDate:spec.date},scope:[scene.id==='control'?'サイト内のサンプルを使う':'公開認証ガイド内の情報を調べる'],prohibitedActions:{actionTypes:[],controlTexts:[],downloads:true},maxActions:spec.explorationMaxActions};
  const state={goal:scene.goal,currentDate:spec.date,screen,history:[],exploration:{charter}};
  const record={scene:scene.id,url:page.url(),capturedAt:new Date().toISOString(),state,candidates,descriptions,visualTargets:capture.targets,imageSha256:hash(capture.bytes),inputWithoutPersonaSha256:hash(JSON.stringify({state,candidates})),assets,blocked,environment:{browser:browser.version(),node:process.version}};
  await writeFile(join(path,'capture.json'),JSON.stringify(record,null,2));records.push(record);console.log(JSON.stringify({scene:scene.id,title:screen.title,text:screen.text.slice(0,5),candidates:Object.entries(candidates).map(([id,c])=>({id,label:c.label})),imageSha256:record.imageSha256,blocked}));
 }finally{await context.tracing.stop({path:join(path,'trace.zip')}).catch(()=>{});await context.close();}
}}finally{await browser.close();}await writeFile(join(root,'captures.json'),JSON.stringify(records,null,2));
