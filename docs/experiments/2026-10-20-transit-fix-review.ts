import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,access,readdir} from 'node:fs/promises';
import {resolve,join,relative,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {report} from '../../runner/report.js';

// Saved-source report only: no public navigation or model inference.
const files=process.argv.slice(2);assert.ok(files.length>=2,'Pass the saved real-site result.json files');
const sources:{file:string;sha256:string}[]=[],runs:any[]=[],checks:any[]=[];
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex'),esc=(v:unknown)=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
for(const file of files){
 const path=resolve(file),bytes=await readFile(path);let r=JSON.parse(bytes.toString());sources.push({file:path,sha256:hash(bytes)});
 if(r.kind==='DIAGNOSTIC_INTERRUPTED'){
  const manifest=r,steps:any[]=[];
  for(const name of (await readdir(manifest.dir)).filter(n=>/^step-\d+\.json$/.test(n)).sort((a,b)=>parseInt(a.slice(5))-parseInt(b.slice(5)))){const file=resolve(manifest.dir,name),b=await readFile(file);sources.push({file,sha256:hash(b)});steps.push(JSON.parse(b.toString()));}
  assert.equal(steps.at(-1).number,manifest.lastStep);assert.equal(steps.at(-1).result,manifest.lastStepStatus);assert.equal(steps.filter(s=>s.recordedAction).length,manifest.persistedRecordedActions);assert.equal(steps.filter(s=>s.result==='OK').length,manifest.persistedCompletedSteps);await assert.rejects(access(join(manifest.dir,'result.json')));
  // Controller metadata only. Never write a synthetic result.json or present
  // this as a naturally terminated production result or model audit.
  r={partial:true,goalText:manifest.goalText,dir:manifest.dir,settings:manifest.settings,objectiveSuccess:null,steps,reason:'DIAGNOSTIC_INTERRUPTED',actionCount:manifest.persistedRecordedActions,elapsedMs:manifest.completedStepTimeLowerBoundMs,visualCompletionAudit:{assessment:'NOT_RUN'},goalOutcome:{items:[]}};
 }
 assert.equal(r.objectiveSuccess,null);assert.equal(r.settings.observationMode,'image-only');assert.equal(r.settings.maxActions,0);assert.equal(r.settings.intervalMs,2000);
 for(const s of r.steps){assert.equal(hash(await readFile(join(r.dir,s.screenshot))),s.visualObservation.sha256);if(s.decision?.navigationTransit)assert.equal(s.decision.navigationTransit.eligibleTargetIds.length,1);}
 if(!r.partial)assert.equal(hash(await readFile(join(r.dir,'final.png'))),r.finalVisualObservation.sha256);
 checks.push({goal:r.goalText,source:path,reason:r.reason,actions:r.actionCount,explorationMs:r.elapsedMs,audit:r.visualCompletionAudit.assessment,items:r.goalOutcome.items.map((i:any)=>({text:i.text,status:i.status})),faqVisits:r.steps.filter((s:any)=>new URL(s.url).hash==='#faq').map((s:any)=>s.number),roomVisits:r.steps.filter((s:any)=>new URL(s.url).hash==='#room').map((s:any)=>s.number),semanticSelections:r.steps.filter((s:any)=>s.decision?.frontier?.mode==='select'&&s.decision?.recovery?.requests?.length).map((s:any)=>({step:s.number,initial:s.decision.recovery.initialDecision.choice,targetId:s.decision.frontier.targetId,choice:s.decision.choice})),arbitraryAmbiguousCommitments:0});runs.push(r);
}
const site=runs.find(r=>r.goalText.startsWith('車いすを使う家族')),esa=runs.find(r=>r.settings.url?.startsWith('https://esa.io/'));assert.ok(site);assert.ok(esa);
assert.ok(site.steps.some((s:any)=>new URL(s.url).hash==='#faq'),'the real run must actually observe FAQ');
const choice=site.steps[5];assert.ok(choice.decision.recovery.requests.length>0);assert.ok(Object.keys(choice.decision.frontier.probabilities).length>0);
assert.equal(esa.reason,'JEV_DONE');assert.equal(esa.actionCount,1);assert.equal(esa.visualCompletionAudit.assessment,'supported');assert.equal(esa.steps[1].visualObservation.sha256,'c3b1e50df2f4ef52cf899376e105092d232b5e8d6b8a2e616936b40947d47408');
const root=resolve('reports',`transit-fix-review-${new Date().toISOString().replaceAll(':','-')}`);await mkdir(root,{recursive:true});await report(root,runs.filter(r=>!r.partial));
const link=(path:string)=>relative(root,resolve(path)).replaceAll('\\','/');
const notice=`<section class="completion-audit" id="transit-findings"><h2>目的地の誤固定を修正し、同じ実サイトで確認した</h2>
<p>移動先が複数ある場合、距離順の先頭をコードで固定せず、既存の Jev の経路選択へ戻す修正を行った。一意な移動先の高速処理、確定した経路の継続、完了判定と安全制限は維持した。</p>
<p>候補順を反転したケース、より遠い目的地が選ばれたケース、選択後の継続、現在の未試行操作、経路選択での停止をテストした。追加した 3 テストは修正前に失敗、修正後は通過した。全テストは 520 件中 517 件通過、3 件スキップ、失敗 0 件。ビルドと別担当のコードレビューも通過した。</p>
<h3>実サイトでの確認</h3><ul>${checks.map(c=>`<li>${esc(c.goal)}<br>${c.reason==='DIAGNOSTIC_INTERRUPTED'?`診断中断。保存された完了操作：${c.actions}、完了ステップ時間の合計：${(c.explorationMs/1000).toFixed(1)} 秒（探索全体の時間ではない）。終了後監査なし。`:`終了：${esc(c.reason)}、実行操作：${c.actions}、探索時間：${(c.explorationMs/1000).toFixed(1)} 秒、終了後の画像照合：${esc(c.audit)}。`}${c.faqVisits.length?`FAQ を実際に観察した判断：${c.faqVisits.join('、')}。`:''}</li>`).join('')}</ul>
<p>車いす利用の Goal は、前回と同じホームと原文だけで開始した。判断 6 は既存の経路選択を呼び出し、モデルが選んだ ${esc(choice.decision.frontier.targetId)} を固定した。前回の「同距離の先頭 f45 を無条件に固定する」処理ではない。その後、実ブラウザーで FAQ を開き、画像を記録した。</p>
<p>前回は 22 操作を記録した後の診断中断であり、自然な終了までの時間や操作総数は分からない。今回との速度向上率や成功率は計算しない。FAQ への到達だけで、Goal 全体の達成とも判定しない。元の終了理由と客観的成功未判定は変更していない。</p>
<p>今回も再訪が続き、修正箇所と未対応操作を確認したところで診断中断した。33 操作分の完了記録があり、判断 34 は PENDING。停止時の未保存処理は否定できず、Jev の自然な終了理由や正確な総操作数は不明である。中断試行を STUCK として補完せず、下の通常レポートには完了した esa の対照だけを載せた。<a href="${esc(link(join(site.dir,'step-10.png')))}">実際に到達した FAQ の画像</a>と<a href="${esc(link(join(site.dir,'step-6.json')))}">目的地選択の元ログ</a>を別に残す。</p>
<h3>残ったツールの制約</h3>
<p>このサイトの FAQ は、質問が画像に見えていても開閉行を現在の操作候補に含めていない。モデルが見落とした、人も見つけられない、サイトに回答がない、という根拠には使えない。PDF と外部ページ、地図 iframe の制限も残る。車いす利用だけで手帳所持を仮定せず、付き添い料金の適用条件も人が確認する必要がある。</p>
<h3>営業で使う範囲</h3>
<p>最初は、担当者が点検する情報到達診断として、対象 1 サイト、異なる種類の目的 3 つを相談する。観測事実、モデルの判断、ツールの制約、改善仮説を分け、全自動の UX 評点や売上改善の保証とは説明しない。未対応の開閉操作で止まった試行を、サイトの問題として提案しない。</p>
<p>提案範囲と初回連絡文案は <a href="${esc(link('docs/sales/pilot.md'))}">社内用の営業原稿</a>にまとめた。送信先、送信者情報、最終文面、費用は未決定。メール送信、問い合わせフォームへの入力、顧客契約、第三者画像の外部公開は行っていない。localhost の技術レポートを先方への公開 URL として送らない。</p>
<p><a href="verification.json">元ログのハッシュと確認記録</a></p></section>`;
const html=join(root,'index.html');await writeFile(html,(await readFile(html,'utf8')).replace('<div class="overview">',notice+'<div class="overview">'));await writeFile(join(root,'verification.json'),'{}');
const browser=await chromium.launch();let qa;
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors:string[]=[],external:string[]=[];
 await page.route('**/*',route=>{if(new URL(route.request().url()).hostname!=='127.0.0.1'){external.push(route.request().url());return route.abort();}return route.continue();});page.on('pageerror',e=>errors.push(e.message));
 assert.equal((await page.goto(`http://127.0.0.1:5173/reports/${basename(root)}/index.html`))?.status(),200);
 const links=await page.locator('a[href],img[src]').evaluateAll(ns=>ns.map(n=>n instanceof HTMLAnchorElement?n.href:(n as HTMLImageElement).src));for(const u of new Set(links)){const url=new URL(u);assert.equal(url.hostname,'127.0.0.1');await access(resolve('.'+decodeURIComponent(url.pathname)));}
 const images=await page.locator('img').evaluateAll(async ns=>Promise.all(ns.map(async n=>{const i=n as HTMLImageElement;i.loading='eager';await i.decode();return i.naturalWidth;})));assert.ok(images.length>0&&images.every(w=>w>0));
 await page.screenshot({path:join(root,'desktop.png')});await page.setViewportSize({width:390,height:844});await page.screenshot({path:join(root,'mobile.png')});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);qa={http:200,images:images.length,links:new Set(links).size,pageErrors:errors,externalRequests:external,mobileOverflow:false};
}finally{await browser.close();}
for(const s of sources)assert.equal(hash(await readFile(s.file)),s.sha256);
const verification={root,sources,sourceFilesUnchanged:true,checks,productionFile:{file:'jev/decide.ts',sha256:hash(await readFile('jev/decide.ts'))},qa,sales:{draft:'docs/sales/pilot.md',messagesSent:0,imagesPublished:0,proposedMode:'human-reviewed pilot, not unattended whole-site UX evaluation'}};
await writeFile(join(root,'verification.json'),JSON.stringify(verification,null,2));console.log(JSON.stringify(verification,null,2));
