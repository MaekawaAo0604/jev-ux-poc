import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {resolve,join,relative,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {report} from '../../runner/report.js';

assert.ok(process.argv[2]&&process.argv[3],'Pass benchmark.json and scope.json');
const sources=process.argv.slice(2,4).map(f=>resolve(f)),buffers=await Promise.all(sources.map(f=>readFile(f)));
const [benchmark,scope]=buffers.map(b=>JSON.parse(b.toString())),hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
assert.equal(benchmark.responses.length,30);assert.ok(benchmark.responses.every((r:any)=>r.status==='RECORDED'));
assert.ok(benchmark.responses.every((r:any)=>r.calls.every((c:any)=>c.model==='jev-1.14.0'&&c.status===200)));
assert.equal(scope.runs.length,5);assert.ok(scope.runs.every((r:any)=>!r.status));
const publicBytes=await readFile(benchmark.source),raw=JSON.parse(publicBytes.toString());assert.equal(hash(publicBytes),benchmark.sourceSha256);
for(const file of benchmark.codeHashes)assert.equal(hash(await readFile(file.file)),file.sha256,'production code changed after benchmark');
const groups=benchmark.fixtures.flatMap((f:any)=>['joint','isolated'].map(mode=>{
 const draws=benchmark.responses.filter((r:any)=>r.step===f.step&&r.mode===mode),times=draws.map((r:any)=>r.inferenceMs).sort((a:number,b:number)=>a-b);
 return {step:f.step,mode,valid:draws.length,observed:draws.filter((r:any)=>r.repair==='observed').length,matches:draws.filter((r:any)=>r.repair===f.expectedRepair).length,
  medianInferenceMs:times[Math.floor(times.length/2)],apiCalls:draws.reduce((sum:number,r:any)=>sum+r.calls.length,0)};
}));
const root=process.argv[4]?resolve(process.argv[4]):resolve('reports',`reading-isolation-review-${new Date().toISOString().replaceAll(':','-')}`);await mkdir(root,{recursive:true});
const localRuns=[],localChecks=[];
for(const fixture of scope.runs){
 const bytes=await readFile(fixture.source),run=JSON.parse(bytes.toString());assert.equal(hash(bytes),fixture.sha256);
 const logs=run.steps.flatMap((s:any)=>s.visualContext.requests.filter((r:any)=>r.step===s.number));
 assert.equal(logs.filter((r:any)=>r.stage==='image-check').length,run.steps.length);
 if(fixture.mode==='cross'){assert.equal(fixture.answerHits.length,0);assert.equal(run.reason,'STUCK');}
 else{assert.equal(fixture.answerHits.length,1);assert.equal(run.reason,'JEV_DONE');}
 localChecks.push({mode:fixture.mode,source:fixture.source,sha256:fixture.sha256,reason:run.reason,actions:run.actionCount,readingCalls:logs.filter((r:any)=>r.stage==='image-check').length,answerGETs:fixture.answerHits.length,objectiveSuccess:run.objectiveSuccess});
 localRuns.push({...run,variant:`分離後・所有するローカル対照 ${fixture.mode}`});
}
await report(root,localRuns);
const url=(file:string)=>relative(root,file).replaceAll('\\','/').split('/').map(encodeURIComponent).join('/');
const group=(step:number,mode:string)=>groups.find((g:any)=>g.step===step&&g.mode===mode)!;
const labels:Record<number,string>={25:'修復手順への入口だけの FAQ',6:'具体的な修復手順',3:'修復方法の見出し付近'};
const blocks=benchmark.fixtures.map((fixture:any)=>{
 const old=group(fixture.step,'joint'),next=group(fixture.step,'isolated'),image=join(raw.dir,raw.steps[fixture.step-1].screenshot);
 return `<section class="completion-audit"><h2>${labels[fixture.step]}</h2><p>確認済みと判定：旧方式 ${old.observed} / ${old.valid} 回、分離後 ${next.observed} / ${next.valid} 回。開発者の画像確認による参照判定：${fixture.expectedRepair}。</p><p>操作判断までの中央値：旧方式 ${(old.medianInferenceMs/1000).toFixed(2)} 秒、分離後 ${(next.medianInferenceMs/1000).toFixed(2)} 秒（＋${((next.medianInferenceMs-old.medianInferenceMs)/1000).toFixed(2)} 秒）。</p><details><summary>比較した同じ保存画像を見る</summary><a href="${url(image)}"><img loading="lazy" src="${url(image)}" alt="比較画像 ${fixture.step}" style="max-width:100%;height:auto"></a></details></section>`;
}).join('');
const note=`<section class="completion-audit"><h2>項目の読み取りを操作判断から分離した結果</h2><p>本番の画像専用経路のうち image-memory を使う場合を変更した。項目確認は現在画像と Goal だけの独立呼び出し、操作選択と完了照合は従来どおり履歴と過去の判断を使う。Goal、画像、選択キーと順番、安全制限は変えていない。読み取りだけ成功しても、操作判断が失敗したフレームの記憶は確定しない。</p><p>固定した 3 画像で各方式 5 回、合計 30 試行・45 API 呼び出しを比較した。FAQ の誤判定は 5/5 回から 0/5 回に減り、具体的な手順は 5/5 回を維持した。見出しだけの画像も誤判定は両方式 0/5 回だった。1 画面の判断時間は中央値で約 0.5～0.6 秒増えた。</p><p>実装後の本番 CLI も実 Jev で 5 試行した。同一サイト内の 2 回と直接回答の 1 回は完了判断、未許可オリジンの 2 回は移動せず停止した。画像の読み取り段階が各画面で 1 回記録された。</p><p>精度の集計は修復方法の項目だけで、パスワード復元側や Goal 全体の到達率は測っていない。同じ保存画像での判定であり、再探索や人間の UX 評価ではない。3 画像だけなので一般的な精度を保証せず、時間も探索全体の速度ではない。モデルの完了判断を客観的な成功とは扱わない。</p><p><a href="${url(sources[0])}">送信した全入力・実 Jev の全返答・時間</a> / <a href="${url(sources[1])}">本番 CLI のローカル検証</a> / <a href="verification.json">出典と検証記録</a></p></section>${blocks}`;
const htmlFile=join(root,'index.html'),html=await readFile(htmlFile,'utf8');await writeFile(htmlFile,html.replace('<div class="overview">',note+'<div class="overview">'));
await writeFile(join(root,'verification.json'),'{}');
const browser=await chromium.launch();let qa;
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors:string[]=[],external:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(new URL(r.url()).hostname!=='127.0.0.1')external.push(r.url());});
 const response=await page.goto(`http://127.0.0.1:5173/reports/${basename(root)}/index.html`);assert.equal(response?.status(),200);assert.equal(await page.locator('details.run').count(),5);
 const links=await page.locator('a[href],img[src]').evaluateAll(nodes=>nodes.map(n=>n instanceof HTMLAnchorElement?n.href:(n as HTMLImageElement).src));
 for(const link of new Set(links)){const u=new URL(link);assert.equal(u.hostname,'127.0.0.1');await access(resolve('.'+decodeURIComponent(u.pathname)));}
 const images=await page.locator('img').evaluateAll(async nodes=>Promise.all(nodes.map(async n=>{const img=n as HTMLImageElement;img.loading='eager';await img.decode();return img.naturalWidth;})));assert.ok(images.every(width=>width>0));
 await page.screenshot({path:join(root,'desktop.png')});await page.setViewportSize({width:390,height:844});await page.screenshot({path:join(root,'mobile.png')});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 qa={http:200,images:images.length,localLinks:new Set(links).size,pageErrors:errors,externalRequests:external,mobileOverflow:false};
}finally{await browser.close();}
for(const [i,file] of sources.entries())assert.deepEqual(await readFile(file),buffers[i]);assert.deepEqual(await readFile(benchmark.source),publicBytes);
const verification={root,sources:sources.map((file,i)=>({file,sha256:hash(buffers[i])})),publicSource:{file:benchmark.source,sha256:hash(publicBytes)},codeHashes:benchmark.codeHashes,groups,localChecks,sourceFilesUnchanged:true,objectiveVerified:false,qa,
 limits:['Three fixed English screenshots with one Japanese Goal; five repeats per condition, not population accuracy.','Only the repair fragment was scored; password-recovery accuracy and whole-Goal completion were not measured.','New mode uses production VisualDecisionContext; old mode reconstructs its previous joint request.','Serial paired inference timing excludes local trace replay and is not end-to-end exploration latency.','No new public-site exploration; five owned-loopback live CLI runs check wiring and scope only.']};
await writeFile(join(root,'verification.json'),JSON.stringify(verification,null,2));await writeFile('docs/experiments/2026-10-19-reading-isolation-results.json',JSON.stringify(verification,null,2));
console.log(JSON.stringify({root,groups,qa}));
