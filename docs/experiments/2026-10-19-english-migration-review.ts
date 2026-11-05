import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join,basename} from 'node:path';
import {chromium} from 'playwright';
import {recordSavedVisualCompletion} from '../../runner/visual-evidence.js';
import {recordGoalOutcome} from '../../runner/goal-outcome.js';
import {report} from '../../runner/report.js';

// Re-audit existing pixels with the migrated prompts; never revisit the public
// site, rewrite source artifacts, or substitute retrospective results for navigation.
assert.ok(process.argv[2]&&process.argv[3],'Pass scope.json and public exploration/result.json');
process.loadEnvFile('.env');
const hash=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
const root=process.argv[4]?resolve(process.argv[4]):resolve('reports',`english-migration-${new Date().toISOString().replaceAll(':','-')}`);
await mkdir(root,{recursive:true});
const scopeFile=resolve(process.argv[2]),publicFile=resolve(process.argv[3]);
const scopeBytes=await readFile(scopeFile),scope=JSON.parse(scopeBytes.toString());
assert.equal(scope.runs.length,5);assert.ok(scope.runs.every((r:any)=>!r.status));
const publicBytes=await readFile(publicFile),publicRun=JSON.parse(publicBytes.toString());
const sources:{file:string;sha256:string}[]=[{file:scopeFile,sha256:hash(scopeBytes)},{file:publicFile,sha256:hash(publicBytes)}];
const codeFiles=['jev/goal-completeness.ts','jev/image-judgments.ts','jev/image-only-input.ts','runner/goal-outcome.ts','runner/visual-evidence.ts'];
const codeHashes=await Promise.all(codeFiles.map(async file=>({file,sha256:hash(await readFile(file))})));
assert.equal(publicRun.reason,'UNSUPPORTED_CONTENT');assert.equal(publicRun.actionCount,26);
const currentDate=publicRun.steps[0].state.currentDate;
assert.ok(typeof currentDate==='string');
console.log(JSON.stringify({stage:process.argv[4]?'reuse-audit-for-report-qa':'retrospective-audit-start',root,source:publicFile}));
const saved=process.argv[4]?JSON.parse(await readFile(join(root,'retrospective-audit.json'),'utf8')):undefined;
if(saved){assert.equal(saved.sourceSha256,hash(publicBytes));assert.deepEqual(saved.codeHashes,codeHashes);}
const visualCompletionAudit=saved?.visualCompletionAudit??await recordSavedVisualCompletion(publicRun.goalText,currentDate,publicRun.dir,publicRun.steps,undefined,publicRun.finalVisualObservation);
const goalOutcome=saved?.goalOutcome??await recordGoalOutcome(publicRun.goalText,currentDate,publicRun.dir,publicRun.steps,publicRun.finalVisualObservation);
await writeFile(join(root,'retrospective-audit.json'),JSON.stringify({source:publicFile,sourceSha256:hash(publicBytes),codeHashes,
 method:'Final English prompts over the unchanged saved screenshots. This is not a new exploration and never changes the original termination.',visualCompletionAudit,goalOutcome},null,2));
const runs=[{...publicRun,visualCompletionAudit,goalOutcome,variant:'実サイト探索・監査は保存画像を再照合'}];
const localChecks=[];
for(const fixture of scope.runs){
 const bytes=await readFile(fixture.source),raw=JSON.parse(bytes.toString());
 assert.equal(hash(bytes),fixture.sha256);sources.push({file:fixture.source,sha256:fixture.sha256});
 if(fixture.mode==='cross'){assert.equal(fixture.answerHits.length,0);assert.equal(raw.reason,'STUCK');}
 else{assert.equal(fixture.answerHits.length,1);assert.equal(raw.reason,'JEV_DONE');}
 assert.equal(raw.visualCompletionAudit.status,'RECORDED');assert.equal(raw.goalOutcome.status,'RECORDED');
 localChecks.push({mode:fixture.mode,reason:raw.reason,actions:raw.actionCount,answerGETs:fixture.answerHits.length,
  audit:raw.visualCompletionAudit.assessment,items:raw.goalOutcome.items.map((i:any)=>({text:i.text,status:i.status})),objectiveSuccess:raw.objectiveSuccess});
 runs.push({...raw,variant:`最終版・所有するローカル対照 ${fixture.mode}`});
}
const repair=publicRun.steps.at(-1).visualContext.imageJudgments.requirements.find((r:any)=>r.id==='g2');
const repairRecords=repair.records.map((r:any)=>({step:r.source.step,status:r.assessment,url:publicRun.steps.find((s:any)=>s.number===r.source.step).url}));
assert.equal(repairRecords.find((r:any)=>r.step===25).status,'observed');
await report(root,runs);
const file=join(root,'index.html'),html=await readFile(file,'utf8');
const notice=`<section class="completion-audit" id="migration-findings"><h2>英語指示への移行結果</h2>
<p>画像専用経路の操作選択、項目確認、別ルート選択、完了照合、探索後の画像監査を英語化した。日本語 Goal、元の断片、画像、選択キーと順番、探索制御、安全制限は変更していない。従来の DOM・OCR 経路は移行対象外。</p>
<p>最終版のローカル 5 試行では、同一サイト内の 2 回と直接回答の 1 回が完了判断、未許可オリジンの 2 回は移動せず停止した。モデルの完了判断は客観的な成功証明ではない。</p>
<p>実サイトは英語化した探索で 26 操作、27 判断、85.8 秒。終了理由は UNSUPPORTED_CONTENT。SDK から .7z ファイルへの遷移を試みて停止した。元の探索後監査は旧版だったため、このレポートでは同じ保存画像を最終版の英語指示で再照合した。新しい探索や遷移は行っていない。</p>
<p>誤判定は残る。判断 25 の FAQ は修復手順への入口だが、項目を確認済みとした。英語化だけで全面解消したとは扱わない。以前の固定画像の言語比較と、この探索経路の結果は別の測定である。</p>
<p>英語版の再監査：全体監査 ${visualCompletionAudit.status}（${visualCompletionAudit.error?.code??visualCompletionAudit.assessment}）、項目別監査 ${goalOutcome.status}。今回の全体監査は複数画像をまとめる呼び出しで HTTP 400 となり、未確定のまま残した。項目別監査ではパスワード復元と修復方法の双方が unconfirmed。選択画像だけの判定であり、全探索画像の内容確認とは区別する。</p>
<p><a href="retrospective-audit.json">英語版の再監査 JSON</a> / <a href="verification.json">出典と検証記録</a></p></section>`;
await writeFile(file,html.replace('<div class="overview">',notice+'<div class="overview">'));
const browser=await chromium.launch();
let qa;
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors:string[]=[],external:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(new URL(r.url()).hostname!=='127.0.0.1')external.push(r.url());});
 const response=await page.goto(`http://127.0.0.1:5173/reports/${basename(root)}/index.html`);
 assert.equal(response?.status(),200);assert.equal(await page.locator('details.run').count(),6);
 // The linked verification file is written below, before final link checking.
 await writeFile(join(root,'verification.json'),'{}');
 const urls=await page.locator('a[href],img[src]').evaluateAll(nodes=>nodes.map(n=>n instanceof HTMLAnchorElement?n.href:(n as HTMLImageElement).src));
 for(const href of new Set(urls)){const u=new URL(href);assert.equal(u.hostname,'127.0.0.1');await access(resolve('.'+decodeURIComponent(u.pathname)));}
 const images=await page.locator('img').evaluateAll(async nodes=>Promise.all(nodes.map(async n=>{const image=n as HTMLImageElement;image.loading='eager';await image.decode();return {loaded:image.complete,width:image.naturalWidth};})));
 assert.ok(images.length>0&&images.every(i=>i.loaded&&i.width>0));
 await page.screenshot({path:join(root,'desktop.png')});await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:join(root,'mobile.png')});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 qa={http:200,runCards:6,images:images.length,localLinksChecked:new Set(urls).size,pageErrors:errors,externalRequests:external,mobileOverflow:false};
}finally{await browser.close();}
for(const source of sources)assert.equal(hash(await readFile(source.file)),source.sha256);
const verification={root,codeHashes,sources,sourceFilesUnchanged:true,localChecks,
 public:{source:publicFile,reason:publicRun.reason,actions:publicRun.actionCount,elapsedMs:publicRun.elapsedMs,repairRecords,
  retrospectiveAudit:{status:visualCompletionAudit.status,assessment:visualCompletionAudit.assessment,error:visualCompletionAudit.error},
  retrospectiveOutcome:{status:goalOutcome.status,items:goalOutcome.items.map((i:any)=>({text:i.text,status:i.status})),error:goalOutcome.error}},qa,
 caveats:['One FAQ link-only frame was still misclassified during navigation.','Public exploration predates the retrospective audit translation; only saved-pixel audits were rerun on final code.','No controlled end-to-end speed or accuracy comparison.','Legacy DOM/OCR prompts remain unchanged.']};
await writeFile(join(root,'verification.json'),JSON.stringify(verification,null,2));
await writeFile('docs/experiments/2026-10-19-english-migration-results.json',JSON.stringify(verification,null,2));
console.log(JSON.stringify({root,qa,localChecks,publicAudit:verification.public.retrospectiveAudit,publicOutcome:verification.public.retrospectiveOutcome}));
