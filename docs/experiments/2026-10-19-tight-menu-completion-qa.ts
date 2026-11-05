import {chromium} from 'playwright';
import {readFile,writeFile,access} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const dir='reports/tight-menu-completion-review-2026-10-19',data=JSON.parse(await readFile(`${dir}/summary.json`,'utf8'));
assert.equal(data.runs.length,4);assert.equal(data.tests.fail,0);assert.equal(data.originalsUnchanged,true);
assert.deepEqual(data.runs.map((r:any)=>r.actions),[5,5,0,3]);
for(const r of data.runs.filter((r:any)=>r.id==='library-card')){
 const check=r.checks.find((q:any)=>q.step===4);assert.equal(check.coverage,'complete');assert.equal(check.boundary,'open');assert.equal(check.evidenceGuard.supported,false);assert.equal(check.choice,'scroll_down');
}
for(const s of data.sources)assert.equal(createHash('sha256').update(await readFile(s.file)).digest('hex'),s.sha256);
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const response=await page.goto('http://127.0.0.1:5173/reports/tight-menu-completion-review-2026-10-19/index.html');assert.equal(response?.status(),200);
 await page.screenshot({path:`${dir}/desktop.png`});
 const links=await page.locator('a[href],img[src]').evaluateAll(els=>els.map(e=>e instanceof HTMLAnchorElement?e.href:(e as HTMLImageElement).src));
 const broken:string[]=[],files=new Set<string>();
 for(const link of new Set(links)){
  const u=new URL(link);if(u.hostname!=='127.0.0.1')continue;
  if(u.hash&&u.pathname===new URL(page.url()).pathname&&!await page.locator(`[id="${decodeURIComponent(u.hash.slice(1))}"]`).count())broken.push(link);
  if(!u.pathname.endsWith('/')){const file=resolve('.'+decodeURIComponent(u.pathname));try{await access(file);files.add(file);}catch{broken.push(link);}}
 }
 const cards=await page.locator('details.run').count();assert.equal(cards,4);
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:`${dir}/mobile.png`});
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 const qa={reportHTTP:response!.status(),runCards:cards,localReferencesChecked:files.size,brokenReferences:broken,pageErrors:errors,mobileOverflow:overflow,sourceHashesChecked:data.sources.length,dataAssertions:'PASS'};
 await writeFile(`${dir}/qa.json`,JSON.stringify(qa,null,2));console.log(JSON.stringify(qa));
 assert.deepEqual(broken,[]);assert.deepEqual(errors,[]);assert.equal(overflow,false);
}finally{await browser.close();}
