import {chromium} from 'playwright';
import {readFile,writeFile,access} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const dir='reports/scroll-recovery-review-2026-10-19',data=JSON.parse(await readFile(`${dir}/summary.json`,'utf8'));
assert.ok(data.finalRuns.length>=2);assert.equal(data.attempts.length,7);assert.equal(data.tests.fail,0);assert.equal(data.originalsUnchanged,true);
assert.deepEqual(data.attempts.map((a:any)=>a.originalModelEnding),[null,null,'UNSUPPORTED_CONTENT',null,'STUCK','JEV_DONE','STUCK']);
for(const s of data.sources)assert.equal(createHash('sha256').update(await readFile(s.file)).digest('hex'),s.sha256);
for(const [file,hash] of Object.entries(data.codeSha256))assert.equal(createHash('sha256').update(await readFile(file)).digest('hex'),hash);
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const response=await page.goto('http://127.0.0.1:5173/reports/scroll-recovery-review-2026-10-19/index.html');assert.equal(response?.status(),200);
 const actionErrors=data.finalRuns.reduce((n:number,r:any)=>n+r.errors.filter((e:any)=>e.result==='ACTION_ERROR').length,0);
 assert.ok((await page.locator('#action-error-count').innerText()).includes(`操作途中のエラー：${actionErrors} 件`));
 assert.equal(await page.locator('.overview span').filter({hasText:'終了理由が実行エラー'}).count(),1);
 await page.screenshot({path:`${dir}/desktop.png`});
 const urls=await page.locator('a[href],img[src]').evaluateAll(els=>els.map(e=>e instanceof HTMLAnchorElement?e.href:(e as HTMLImageElement).src));
 const files=new Set<string>(),broken:string[]=[];
 for(const href of new Set(urls)){
  const u=new URL(href);if(u.hostname!=='127.0.0.1')continue;
  if(u.hash&&u.pathname===new URL(page.url()).pathname&&!await page.locator(`[id="${decodeURIComponent(u.hash.slice(1))}"]`).count())broken.push(href);
  if(!u.pathname.endsWith('/')){const file=resolve('.'+decodeURIComponent(u.pathname));try{await access(file);files.add(file);}catch{broken.push(href);}}
 }
 const cards=await page.locator('details.run').count();assert.equal(cards,data.finalRuns.length);
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:`${dir}/mobile.png`});
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 const qa={reportHTTP:response!.status(),finalRunCards:cards,localReferencesChecked:files.size,brokenReferences:broken,pageErrors:errors,mobileOverflow:overflow,sourceHashesChecked:data.sources.length,codeHashesChecked:Object.keys(data.codeSha256).length,dataAssertions:'PASS'};
 await writeFile(`${dir}/qa.json`,JSON.stringify(qa,null,2));console.log(JSON.stringify(qa));
 assert.deepEqual(broken,[]);assert.deepEqual(errors,[]);assert.equal(overflow,false);
}finally{await browser.close();}
