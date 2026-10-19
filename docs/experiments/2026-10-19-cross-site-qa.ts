import {chromium} from 'playwright';
import {writeFile,access,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const dir='reports/cross-site-review-2026-10-19',browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 const response=await page.goto('http://127.0.0.1:5173/reports/cross-site-review-2026-10-19/index.html');assert.equal(response?.status(),200);
 await page.screenshot({path:`${dir}/desktop.png`});
 const urls=await page.locator('a[href],img[src]').evaluateAll(els=>els.map(e=>e instanceof HTMLAnchorElement?e.href:(e as HTMLImageElement).src));
 const broken:string[]=[],files=new Set<string>();
 for(const link of new Set(urls)){
  const u=new URL(link);if(u.hostname!=='127.0.0.1')continue;
  if(u.hash&&u.pathname===new URL(page.url()).pathname&&!await page.locator(`[id="${decodeURIComponent(u.hash.slice(1))}"]`).count())broken.push(link);
  if(!u.pathname.endsWith('/')){const file=resolve('.'+decodeURIComponent(u.pathname));try{await access(file);files.add(file);}catch{broken.push(link);}}
 }
 const count=await page.locator('details.run').count();
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:`${dir}/mobile.png`});
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 const measurements=JSON.parse(await readFile(`${dir}/measurements.json`,'utf8')),partial=JSON.parse(await readFile(`${dir}/partial-evidence.json`,'utf8')),probe=JSON.parse(await readFile(`${dir}/number-association.json`,'utf8'));
 assert.equal(measurements.runs.length,6);assert.equal(measurements.runs.filter((r:any)=>r.imageReview.status==='premature-completion').length,1);
 assert.equal(partial.originalModelEnding,null);assert.equal(partial.observations,34);assert.equal(partial.recordedExecutedSteps,33);assert.equal(partial.lastSavedResult,'PENDING');assert.equal(partial.repeatedImageActions.length,8);
 assert.equal(probe.responses.length,3);for(const p of probe.responses){assert.equal(p.response.answers.faq.choice,'e3');assert.equal(p.response.answers.download.choice,'e2');}
 const qa={reportHTTP:response!.status(),normalRunCards:count,localFilesChecked:files.size,brokenReferences:broken,pageErrors:errors,mobileOverflow:overflow,dataAssertions:'PASS'};
 await writeFile(`${dir}/qa.json`,JSON.stringify(qa,null,2));console.log(JSON.stringify(qa));
 assert.equal(count,6);assert.deepEqual(broken,[]);assert.deepEqual(errors,[]);assert.equal(overflow,false);
}finally{await browser.close();}
