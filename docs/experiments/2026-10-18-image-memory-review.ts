import assert from 'node:assert/strict';
import {readFile,stat,writeFile} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {measurementForRun,report} from '../../runner/report.js';

// Offline verification only: no model calls, original result bytes unchanged.
const root=resolve(process.argv[2]),file=join(root,'exploration/result.json');
const original=await readFile(file),result=JSON.parse(original.toString('utf8'));
assert.equal(result.settings.observationMode,'image-only');
assert.equal(result.settings.visualJudgmentMemory,'enabled');
assert.equal(result.completionAudit.status,'NOT_RUN');
assert.ok(result.steps.every((s:any)=>s.visualContext.ocrStatus==='disabled'));
const last=result.steps.at(-1).visualContext.imageJudgments;
const sources=new Map<string,any>();
for(const step of result.steps){
 const m=step.visualContext.imageJudgments;
 for(const r of [...m.requirements.flatMap((r:any)=>r.records),...m.routes])sources.set(r.source.id,r.source);
}
for(const source of sources.values()){
 const step=result.steps.find((s:any)=>s.number===source.step);
 assert.ok(step,`Missing source step ${source.step}`);
 const bytes=await readFile(join(root,'exploration',step.screenshot));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),source.sha256);
}
await report(root,[result]);
const reportFile=join(root,'index.html'),html=await readFile(reportFile,'utf8');
let checkedLinks=0;const missing:string[]=[];
for(const match of html.matchAll(/(?:href|src)="([^"]+)"/g)){
 const path=match[1].split('#')[0];if(!path||/^(?:https?:|data:)/.test(path))continue;
 checkedLinks++;try{await stat(resolve(dirname(reportFile),decodeURIComponent(path)));}catch{missing.push(path);}
}
assert.deepEqual(missing,[]);
const browser=await chromium.launch();
let overflow=false;const errors:string[]=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(pathToFileURL(reportFile).href);await page.locator('.image-judgments').waitFor();
 assert.equal(await page.locator('.image-judgments').count(),1);
 for(const source of sources.values())assert.equal(await page.locator(`#trial-0-screen-${source.step}`).count(),1,`Missing source anchor ${source.id}`);
 await page.locator('.image-judgments').scrollIntoViewIfNeeded();
 await page.screenshot({path:join(root,'image-memory-desktop.png')});
 await page.setViewportSize({width:390,height:844});
 await page.locator('.image-judgments').scrollIntoViewIfNeeded();
 overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 await page.screenshot({path:join(root,'image-memory-mobile.png')});
}finally{await browser.close();}
assert.deepEqual(errors,[]);assert.equal(overflow,false);
assert.deepEqual(await readFile(file),original);
const lastRequest=result.steps.flatMap((s:any)=>s.visualContext.requests).filter((r:any)=>r.status==='recorded').at(-1);
const summary={reason:result.reason,actions:result.actionCount,explorationMs:result.elapsedMs,measurement:measurementForRun(result),requirements:last.requirements.map((r:any)=>({id:r.id,text:r.text,status:r.status,updates:r.records.length,last:r.records.at(-1)})),routes:last.routes.length,verifiedImageSources:sources.size,lastRecordedUsage:lastRequest?.usage,visualAudit:{status:result.visualCompletionAudit?.status,assessment:result.visualCompletionAudit?.assessment,elapsedMs:result.visualCompletionAudit?.elapsedMs},qa:{checkedLinks,missing,errors,overflow,sourceSha256:createHash('sha256').update(original).digest('hex')}};
await writeFile(join(root,'image-memory-review.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary));
