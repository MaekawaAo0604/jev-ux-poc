/** Offline QA of existing production-run outputs; no site access or Jev calls. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import {report,measurementForRun} from '../../runner/report.js';
const roots=process.argv.slice(2).map(p=>resolve(p));
assert.equal(roots.length,3,'Supply exactly the three completed trial directories');
const manifest=JSON.parse(await readFile(new URL('./2026-10-19-small-sites.json',import.meta.url),'utf8'));
const originals:Buffer[]=[],results:any[]=[],summaries:any[]=[];
for(const [i,root] of roots.entries()){
 const bytes=await readFile(join(root,'exploration/result.json'));originals.push(bytes);
 const r=JSON.parse(bytes.toString('utf8'));results.push(r);
 assert.equal(r.goalText,manifest.sites[i].goal);assert.equal(r.settings.url,manifest.sites[i].url);
 assert.equal(r.settings.maxActions,0);assert.equal(r.settings.intervalMs,2000);
 assert.equal(r.settings.observationMode,'image-only');assert.equal(r.settings.completionEvidenceImages,'selected-sources');
 assert.equal(r.completionAudit.status,'NOT_RUN');
 const sources=new Map<string,any>();
 for(const step of r.steps){
  if(!step.visualContext)continue;
  assert.equal(step.visualContext.ocrStatus,'disabled');
  const memory=step.visualContext.imageJudgments;
  for(const record of [...memory.requirements.flatMap((q:any)=>q.records),...memory.routes])sources.set(record.source.id,record.source);
 }
 for(const source of sources.values()){
  const step=r.steps.find((s:any)=>s.number===source.step);assert.ok(step);
  assert.equal(createHash('sha256').update(await readFile(join(root,'exploration',step.screenshot))).digest('hex'),source.sha256);
 }
 const requests=r.steps.at(-1)?.visualContext?.requests??[];
 const proof=requests.filter((q:any)=>q.completionProof);
 for(const q of proof)if(q.completionProof.status==='verified')assert.equal(q.completionProof.imageCount,new Set([q.step,...q.completionProof.sources.map((s:any)=>s.step)]).size);
 summaries.push({site:manifest.sites[i].id,root,reason:r.reason,actions:r.actionCount,steps:r.steps.length,elapsedMs:r.elapsedMs,measurement:measurementForRun(r),finalURL:r.finalURL,requests:requests.length,completionChecks:proof.map((q:any)=>({step:q.step,status:q.status,assessment:q.answers?.completionCoverage?.choice,sourceSteps:q.completionProof.sources.map((s:any)=>s.step),imageCount:q.completionProof.imageCount})),sourceHashesVerified:sources.size,finalCapture:r.finalCapture,independentAudit:{status:r.visualCompletionAudit?.status,assessment:r.visualCompletionAudit?.assessment,error:r.visualCompletionAudit?.error},originalSha256:createHash('sha256').update(bytes).digest('hex')});
}
const root=resolve('reports',`small-sites-${new Date().toISOString().replaceAll(':','-')}`);await mkdir(root,{recursive:true});
await report(root,results);
const html=await readFile(join(root,'index.html'),'utf8');let links=0;
for(const match of html.matchAll(/(?:href|src)="([^"]+)"/g)){
 const path=match[1].split('#')[0];if(!path||/^(https?:|data:)/.test(path))continue;
 await stat(resolve(root,decodeURIComponent(path)));links++;
}
const browser=await chromium.launch();const pageErrors:string[]=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>pageErrors.push(e.message));
 await page.goto(pathToFileURL(join(root,'index.html')).href);assert.equal(await page.locator('.run').count(),3);
 await page.screenshot({path:join(root,'desktop.png')});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:join(root,'mobile.png')});assert.deepEqual(pageErrors,[]);
}finally{await browser.close();}
for(const [i,source] of roots.entries())assert.deepEqual(await readFile(join(source,'exploration/result.json')),originals[i]);
const manualReview=[{
 site:'tanemaki',classification:'instrument-evidence-provenance-needs-investigation',
 observationSteps:[3,8],
 finding:'The final current-only judgment marked reservation-required evidence as observed on v8 and replaced its earlier source. Manual inspection of step-8.png shows pricing and 24-hour availability but no explicit reservation requirement; step-3.png shows reservation-method information. The final completion request therefore attached only v8, not the earlier reservation-source image.',
 limitation:'The full saved-image audit supported completion and earlier frames contain reservation information. This is a provenance/selected-source sufficiency concern, not proof that the overall Goal was unmet or the site UX was poor. The causal contribution of earlier judgment context has not been isolated.',
 nextCheck:'Test current-frame judgments with and without earlier observed statuses while holding pixels and question criteria fixed; do not silently replace the original run.'
},{
 site:'esa',classification:'scope-and-model-capability-unresolved',
 finding:'The run did not confirm a minimum user count. The visible Help/Documents links use another origin and were outside the same-origin scope. No claim is made that the answer is absent from the public service documentation.'
},{
 site:'iwano',classification:'model-navigation-and-retrospective-audit-limitations',
 finding:'The model confirmed price and duration but not weekend availability, revisited company/contact/booking pages, and stopped. The old retrospective multi-image completion audit returned HTTP 400. Neither outcome proves missing information or poor UX on the website.'
}];
const summary={scope:'goal-only production exploration, not an objective UX score or public endorsement',manifest,results:summaries,manualReview,qa:{localLinks:links,pageErrors,mobileOverflow:false,originalsUnchanged:true}};
await writeFile(join(root,'summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify({root,...summary}));
