import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {resolve,join,relative,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {report} from '../../runner/report.js';

// Derivative report only: no API inference, public browsing or source rewrite.
const referenceFile=resolve(process.argv[2]??'reports/reference-closure-2026-10-19T15-44-00.423Z/reference.json');
const controlsFile=resolve(process.argv[3]??'reports/live-outcome-controls-2026-10-19T15-43-57.117Z/controls.json');
const publicFile=resolve('reports/2026-10-19T13-27-02.965Z-public/exploration/result.json');
const sources:any[]=[],hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
async function load(file:string){const bytes=await readFile(file);sources.push({file,sha256:hash(bytes)});return JSON.parse(bytes.toString());}
const reference=await load(referenceFile),controls=await load(controlsFile),publicRun=await load(publicFile);
assert.equal(reference.completed,true);assert.equal(reference.pages.length,8);assert.deepEqual(reference.errors,[]);assert.deepEqual(reference.pending,[]);
const refUrls=new Set(reference.pages.map((p:any)=>p.url));
for(const p of reference.pages){
 assert.equal(hash(await readFile(join(reference.root,p.html))),p.htmlSha256);
 assert.equal(hash(await readFile(join(reference.root,p.text))),p.textSha256);
 for(const url of p.links)assert.ok(refUrls.has(url),'uninspected linked HTML');
}
assert.equal(controls.runs.length,6);assert.ok(controls.runs.every((r:any)=>!r.status));
const runs:any[]=[],checks:any[]=[];
for(const entry of controls.runs){
 const raw=await load(entry.source);assert.equal(sources.at(-1).sha256,entry.sha256);assert.equal(raw.objectiveSuccess,null);
 const positive=['complete','direct'].includes(entry.mode);
 assert.equal(raw.reason,positive?'JEV_DONE':'STUCK');assert.equal(raw.visualCompletionAudit.assessment,positive?'supported':'insufficient');
 assert.equal(raw.goalOutcome.items[0].status,positive?'confirmed':'unconfirmed');assert.equal(raw.goalOutcome.items[1].status,'confirmed');
 if(entry.mode==='complete'){
  const back=raw.steps.find((s:any)=>s.decision?.action.type==='back');assert.ok(back?.decision.frontier);
  const next=raw.steps.find((s:any)=>s.number===back.number+1);assert.equal(next.decision.action.type,'click');
  assert.equal(next.decision.frontier.targetId,back.decision.frontier.targetId);
 }
 if(entry.mode==='blocked')assert.equal(entry.answerHits.length,0);
 for(const o of raw.visualCompletionAudit.observations)assert.equal(hash(await readFile(join(raw.dir,o.file))),o.sha256);
 checks.push({mode:entry.mode,reason:raw.reason,actions:raw.actionCount,elapsedMs:raw.elapsedMs,wholeGoalAudit:raw.visualCompletionAudit.assessment,
  items:raw.goalOutcome.items.map((i:any)=>({text:i.text,status:i.status})),nativeBack:raw.steps.some((s:any)=>s.decision?.action.type==='back'),answerGETs:entry.answerHits.length,objectiveSuccess:raw.objectiveSuccess});
 runs.push({...raw,variant:`架空の所有ローカル対照 ${entry.mode} ${entry.token}`});
}
const forumStep=publicRun.steps.find((s:any)=>s.url==='https://www.7-zip.org/support.html');
assert.ok(forumStep.state.screen.elements.some((e:any)=>/Forum at SourceForge/.test(e.text)&&e.available===false&&e.unavailableReason==='SAFETY_BOUNDARY'));
assert.ok(reference.excluded.some((e:any)=>e.from==='https://www.7-zip.org/support.html'&&e.url.includes('sourceforge.net/p/sevenzip/discussion/')));
const root=resolve('reports',`scope-closure-review-${new Date().toISOString().replaceAll(':','-')}`);await mkdir(root,{recursive:true});
await report(root,runs);
const href=(file:string)=>relative(root,file).replaceAll('\\','/');
const forum='https://sourceforge.net/p/sevenzip/discussion/45797/thread/a5e2f404f7/';
const notice=`<section class="completion-audit" id="scope-findings"><h2>今回の停止について確認したこと</h2>
<p>元の実行は、パスワード復元可否が未確認のまま停止した。「Web 上に回答がない」「利用者も見つけられない」という結論ではない。</p>
<h3>回答を含む参照先が探索範囲外にある</h3>
<p><a href="${forum}" target="_blank" rel="noopener noreferrer">公式プロジェクトのフォーラム</a>で、開発者 Igor Pavlov が 2020 年 12 月 14 日に、短いパスワードの復元可能性、外部ソフトの必要性、7-Zip 本体の対応について回答している。これは日付のある説明の存在確認で、現行版の機能を実行検証したものではない。</p>
<p>公式 Support からフォーラムへの入口がある一方、元の判断 ${forumStep.number} では、その入口を同一オリジン制限で操作不能にしていた。したがって、探索結果をサイト全体の UX 不良や Jev の読解不能と断定することはできない。許可すれば Jev が自力で該当スレッドを見つけるかは別の試験である。</p>
<h3>未探索側のページも独立に調べた</h3>
<p>トップからリンクで到達する、同一オリジンのルートと .html だけを 2 秒間隔で一度ずつ取得した。8 ページでリンク集合を閉じ、全文を開発者が点検した。この範囲では、失念したパスワードの復元可否を直接答える記述は確認できなかった。7z Format には暗号化や総当たり対策の説明があるが、それを復元可否の明示回答に置き換えない。ファイル、未リンク文書、動的画面、別言語サイト、外部フォーラムは網羅の主張から除く。</p>
<p>この参照調査は現在のページに対するもので、元の探索時刻の HTML 全体が同一だったとは証明しない。調査で読んだ本文や正解経路は Jev の探索に渡していない。</p>
<h3>本番の探索と完了判定を対照で確認した</h3>
<p>同じ日本語 Goal のまま架空のローカルサイトを使い、本番 CLI と実 Jev で 6 回試した。2 ページに回答を分けた 2 回は、実際に Back して選んだ別ルートをクリックし、両項目を照合して完了した。直接回答の 1 回も完了した。片方の回答を欠かせた 2 回は未確認で停止した。回答先を未許可オリジンにした 1 回も停止し、その回答先への GET は 0 件だった。</p>
<p>この 6 回では誤完了はなかった。一般のサイトやすべての Goal に対する保証ではない。対照の文章は合成データであり、7-Zip の実機能の説明として利用しない。post-run の禁止事項断片は、完了した 3 回で unconfirmed となった。操作履歴上の違反確認と、このモデルによる断片分類は区別する。</p>
<h3>結論と残す境界</h3>
<p>今回確認したのは、回答を含む外部参照先が存在すること、その入口が実行範囲の制限で閉じられていたこと、対照では別ルート移動と部分達成での停止が動くこと。本番の制限を外す修正は行っていない。元の終了理由と客観的成功未判定も書き換えていない。</p>
<p><a href="${href(referenceFile)}">参照したページと保存ハッシュ</a> / <a href="${href(controlsFile)}">本番 CLI の対照結果</a> / <a href="${href(resolve(publicRun.dir,'../index.html'))}">元の実サイト実行</a> / <a href="verification.json">検証記録</a></p></section>`;
const htmlFile=join(root,'index.html');await writeFile(htmlFile,(await readFile(htmlFile,'utf8')).replace('<div class="overview">',notice+'<div class="overview">'));
await writeFile(join(root,'verification.json'),'{}');
const browser=await chromium.launch();let qa;
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors:string[]=[],external:string[]=[];
 await page.route('**/*',route=>{if(new URL(route.request().url()).hostname!=='127.0.0.1'){external.push(route.request().url());return route.abort();}return route.continue();});
 page.on('pageerror',e=>errors.push(e.message));
 assert.equal((await page.goto(`http://127.0.0.1:5173/reports/${basename(root)}/index.html`))?.status(),200);
 assert.equal(await page.locator('details.run').count(),6);
 const links=await page.locator('a[href],img[src]').evaluateAll(nodes=>nodes.map(n=>n instanceof HTMLAnchorElement?n.href:(n as HTMLImageElement).src));
 for(const link of new Set(links)){const u=new URL(link);if(u.hostname==='127.0.0.1')await access(resolve('.'+decodeURIComponent(u.pathname)));else assert.equal(link,forum);}
 const images=await page.locator('img').evaluateAll(async nodes=>Promise.all(nodes.map(async n=>{const img=n as HTMLImageElement;img.loading='eager';await img.decode();return img.naturalWidth;})));assert.ok(images.length>0&&images.every(w=>w>0));
 await page.screenshot({path:join(root,'desktop.png')});await page.setViewportSize({width:390,height:844});await page.screenshot({path:join(root,'mobile.png')});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 qa={http:200,runCards:6,images:images.length,links:new Set(links).size,pageErrors:errors,externalRequests:external,mobileOverflow:false};
}finally{await browser.close();}
for(const s of sources)assert.equal(hash(await readFile(s.file)),s.sha256);
const verification={root,sources,sourceFilesUnchanged:true,referenceDocuments:reference.pages.length,referenceClosureComplete:true,checks,
 externalReferences:[{url:forum,author:'Igor Pavlov',postDate:'2020-12-14',verification:'Read-only public-page lookup, separate from Jev exploration; dated statement, not current software execution.'},{url:'https://sourceforge.net/p/sevenzip/discussion/45797/thread/454670b0f9/',author:'Igor Pavlov',postDate:'2023-08-31',verification:'Read-only public-page lookup; conditions depend on archive/password, not an unconditional recovery guarantee.'}],
 originalForumEntry:{step:forumStep.number,available:false,reason:'SAFETY_BOUNDARY'},positiveControls:3,negativeControls:3,falseCompletionInNegativeControls:0,
 productionCodeChanged:false,objectiveVerified:false,qa,
 limits:['Reference closure covers eight linked same-origin static HTML documents at inspection time, not the entire website or historical HTML.','External thread discovery used independent web search, not Jev; lifting a restriction does not prove Jev will find/read that thread.','Synthetic controls validate these six cases, not general navigation accuracy.','Original STUCK, scope restrictions and null objectiveSuccess remain unchanged.']};
await writeFile(join(root,'verification.json'),JSON.stringify(verification,null,2));
console.log(JSON.stringify(verification,null,2));
