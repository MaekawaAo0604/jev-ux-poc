import {chromium} from 'playwright';
import {readFile,writeFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const dir='reports/navigation-recovery-review-2026-10-19',data=JSON.parse(await readFile(`${dir}/summary.json`,'utf8'));
assert.equal(data.baseline.status,'EXPERIMENTER_ABORTED');assert.equal(data.baseline.modelEnding,null);
assert.equal(data.tests.fail,0);assert.ok(data.runs.some((r:any)=>r.navigationRequests.some((e:any)=>e.phase==='recovered')));
for(const s of data.sources)assert.equal(createHash('sha256').update(await readFile(s.file)).digest('hex'),s.sha256);
for(const [file,hash] of Object.entries(data.codeSha256))assert.equal(createHash('sha256').update(await readFile(file)).digest('hex'),hash);
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const response=await page.goto('http://127.0.0.1:5173/reports/navigation-recovery-review-2026-10-19/index.html');assert.equal(response?.status(),200);
 const text=await page.locator('#navigation-recovery').innerText();assert.ok(text.includes('socket hang up'));assert.ok(text.includes('客観的成功'));
 const cards=await page.locator('details.run').count();assert.equal(cards,data.runs.length);
 const urls=await page.locator('a[href],img[src]').evaluateAll(els=>els.map(e=>e instanceof HTMLAnchorElement?e.href:(e as HTMLImageElement).src));
 const broken:string[]=[];let checked=0;
 for(const href of new Set(urls)){
  const u=new URL(href);if(u.hostname!=='127.0.0.1')continue;
  if(u.hash&&u.pathname===new URL(page.url()).pathname&&!await page.locator(`[id="${decodeURIComponent(u.hash.slice(1))}"]`).count())broken.push(href);
  if(!u.pathname.endsWith('/')){try{await access(resolve('.'+decodeURIComponent(u.pathname)));checked++;}catch{broken.push(href);}}
 }
 await page.screenshot({path:`${dir}/desktop.png`});await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:`${dir}/mobile.png`});const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 const qa={http:response!.status(),cards,localLinksChecked:checked,brokenReferences:broken,pageErrors:errors,mobileOverflow:overflow,codeHashesChecked:Object.keys(data.codeSha256).length,sourceHashesChecked:data.sources.length};
 await writeFile(`${dir}/qa.json`,JSON.stringify(qa,null,2));console.log(JSON.stringify(qa));
 assert.deepEqual(broken,[]);assert.deepEqual(errors,[]);assert.equal(overflow,false);
}finally{await browser.close();}
