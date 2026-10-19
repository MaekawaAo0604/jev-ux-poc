import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join,basename} from 'node:path';
import {chromium} from 'playwright';
import {report,measurementForRun} from '../../runner/report.js';
import {assessStop} from '../../runner/stop-assessment.js';

// Offline report regeneration only. Live Jev runs are produced separately by
// scope-isolation.ts on owned loopback origins. Never rewrite source artifacts.
const scopeFile=resolve(process.argv[2]??'');
assert.ok(process.argv[2],'Pass the post-fix scope-isolation scope.json');
const scopeBytes=await readFile(scopeFile),scope=JSON.parse(scopeBytes.toString());
assert.equal(scope.runs.length,5);assert.ok(scope.runs.every((r:any)=>!r.status));
const root=resolve('reports',`stop-assessment-review-${new Date().toISOString().replaceAll(':','-')}`);
await mkdir(root,{recursive:true});
const sources=[{file:resolve('reports/2026-10-19T10-13-03.265Z-public/exploration/result.json'),kind:'archived-real-site'},
 ...scope.runs.map((r:any)=>({file:r.source,kind:`live-local-${r.mode}`,expectedHash:r.sha256}))];
const runs:any[]=[],checks:any[]=[];
for(const [index,source] of sources.entries()){
 const bytes=await readFile(source.file),sha256=createHash('sha256').update(bytes).digest('hex'),raw=JSON.parse(bytes.toString());
 if('expectedHash' in source)assert.equal(sha256,source.expectedHash);
 const assessment=assessStop(raw);
 assert.equal(assessment.rawReason,raw.reason);
 if(index===0){
  assert.equal(raw.reason,'STUCK');assert.equal(assessment.terminalDecision.stage,'route-reselection');
  assert.equal(assessment.terminalDecision.beforeReselection?.choice,'scroll_up');
  assert.equal(assessment.terminalDecision.final?.choice,'stuck');
  assert.ok(assessment.restrictedControls.some(e=>e.step===19&&e.id==='e18'&&e.reason==='SAFETY_BOUNDARY'));
 }else{
  assert.deepEqual(raw.stopAssessment,assessment,'production JSON must contain the same diagnostic as the report');
  assert.equal(assessment.terminalDecision.stage,'action-selection');
  const fixture=scope.runs[index-1];
  if(fixture.mode==='cross'){
   assert.equal(raw.reason,'STUCK');assert.equal(fixture.answerHits.length,0);
   assert.equal(assessment.restrictedControls.length,1);assert.equal(assessment.attribution,'undetermined');
  }else{assert.equal(raw.reason,'JEV_DONE');assert.equal(fixture.answerHits.length,1);}
 }
 checks.push({source:source.file,sha256,kind:source.kind,rawReason:raw.reason,actionCount:raw.actionCount,
  diagnosticOrigin:index===0?'derived-from-archived-steps':'recorded-by-production',
  stage:assessment.terminalDecision.stage,before:assessment.terminalDecision.beforeReselection?.choice,
  final:assessment.terminalDecision.final?.choice,restrictions:assessment.restrictedControls.length,measurement:measurementForRun(raw)});
 runs.push({...raw,variant:index===0?'保存ログの再表示':`所有するローカル対照 ${scope.runs[index-1].mode}`,repeat:index===0?1:index});
}
await report(root,runs);
const htmlFile=join(root,'index.html'),html=await readFile(htmlFile,'utf8');
await writeFile(htmlFile,html.replace('<div class="overview">','<p class="notice">停止理由の表示修正を検証しました。最初の試行は保存済み実サイトログの再表示で、再探索ではありません。残る 5 試行は所有するローカルサイト上の実 Jev です。元の終了理由と Goal は変更していません。制限先に答えがあるか、制限が過去の停止原因かは未確定です。</p><div class="overview">'));
for(const c of checks)assert.equal(createHash('sha256').update(await readFile(c.source)).digest('hex'),c.sha256);
assert.deepEqual(await readFile(scopeFile),scopeBytes);
await writeFile(join(root,'verification.json'),JSON.stringify({scopeFile,scopeSha256:createHash('sha256').update(scopeBytes).digest('hex'),checks,sourceFilesUnchanged:true,
 caveats:['Reading-judgment root cause is unresolved.','Restriction observations do not prove relevance, answer availability, or causal scope failure.','Model completion is not independent objective success.']},null,2));
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors:string[]=[],external:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(new URL(r.url()).hostname!=='127.0.0.1')external.push(r.url());});
 const response=await page.goto(`http://127.0.0.1:5173/reports/${basename(root)}/index.html`);
 assert.equal(response?.status(),200);assert.equal(await page.locator('details.run').count(),6);
 const diagnostic=page.locator('.stop-assessment').first();
 assert.ok((await diagnostic.innerText()).includes('別ルート再選択で停止'));
 assert.ok((await diagnostic.innerText()).includes('再選択前：上にスクロール'));
 assert.ok(!(await diagnostic.innerText()).includes('undefined'));
 const urls=await page.locator('a[href],img[src]').evaluateAll(nodes=>nodes.map(n=>n instanceof HTMLAnchorElement?n.href:(n as HTMLImageElement).src));
 let localLinks=0;for(const href of new Set(urls)){
  const u=new URL(href);assert.equal(u.hostname,'127.0.0.1');
  await access(resolve('.'+decodeURIComponent(u.pathname)));localLinks++;
  if(u.hash&&u.pathname.endsWith('/index.html'))assert.equal(await page.locator(`[id="${decodeURIComponent(u.hash.slice(1))}"]`).count(),1);
 }
 await page.screenshot({path:join(root,'desktop.png')});
 await diagnostic.scrollIntoViewIfNeeded();await page.screenshot({path:join(root,'stop-detail.png')});
 await page.setViewportSize({width:390,height:844});await diagnostic.scrollIntoViewIfNeeded();
 await page.screenshot({path:join(root,'mobile.png')});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 await writeFile(join(root,'qa.json'),JSON.stringify({http:200,runCards:6,localLinksChecked:localLinks,pageErrors:errors,externalRequests:external,mobileOverflow:false},null,2));
}finally{await browser.close();}
await writeFile('docs/experiments/2026-10-19-stop-assessment-results.json',JSON.stringify({root,
 ...JSON.parse(await readFile(join(root,'verification.json'),'utf8')),
 qa:JSON.parse(await readFile(join(root,'qa.json'),'utf8')),
 method:'Post-run diagnostic recording/rendering only. Five live Jev explorations on owned loopback origins plus one unchanged archived real-site result; no fresh public-site exploration.',
 },null,2));
console.log(JSON.stringify({root,checks,sourceFilesUnchanged:true}));
