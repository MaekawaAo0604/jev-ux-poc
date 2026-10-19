import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,readdir,access} from 'node:fs/promises';
import {resolve,join,relative,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {report} from '../../runner/report.js';

// Derivative report for active debugging. No public browsing or inference.
const manifest=JSON.parse(await readFile('docs/experiments/2026-10-20-real-site-results.json','utf8'));
const sources:{file:string;sha256:string}[]=[],hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const esc=(v:unknown)=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
async function load(path:string,expected?:string){const file=resolve(path),bytes=await readFile(file),sha256=hash(bytes);if(expected)assert.equal(sha256,expected);sources.push({file,sha256});return JSON.parse(bytes.toString());}
const root=resolve('reports',`real-site-review-${new Date().toISOString().replaceAll(':','-')}`);await mkdir(root,{recursive:true});
const href=(path:string)=>relative(root,resolve(path)).replaceAll('\\','/');
const runs:any[]=[],measurements:any[]=[];
for(const entry of manifest.completed){
 const r=await load(entry.source,entry.sha256);assert.equal(r.reason,entry.reason);assert.equal(r.actionCount,entry.actions);assert.equal(r.elapsedMs,entry.elapsedMs);assert.equal(r.objectiveSuccess,null);
 assert.equal(r.visualCompletionAudit.assessment,'supported');assert.equal(r.settings.observationMode,'image-only');assert.equal(r.settings.maxActions,0);assert.equal(r.settings.intervalMs,2000);
 for(const s of r.steps)assert.equal(hash(await readFile(join(r.dir,s.screenshot))),s.visualObservation.sha256);
 assert.equal(hash(await readFile(join(r.dir,'final.png'))),r.finalVisualObservation.sha256);
 const requests=r.steps.at(-1).visualContext.requests;
 measurements.push({id:entry.id,explorationMs:r.elapsedMs,readingMs:requests.filter((q:any)=>q.stage==='image-check').reduce((a:number,q:any)=>a+q.elapsedMs,0),decisionMs:requests.filter((q:any)=>q.stage==='decision').reduce((a:number,q:any)=>a+q.elapsedMs,0),postRunVisualMs:r.visualCompletionAudit.elapsedMs,postRunItemsMs:r.goalOutcome.elapsedMs,wholeGoalAudit:r.visualCompletionAudit.assessment});
 runs.push({...r,variant:entry.label});
}
assert.equal(runs[0].steps[1].visualObservation.sha256,runs[1].steps[1].visualObservation.sha256);
const partial=manifest.interrupted,files=(await readdir(partial.directory)).filter(f=>/^step-\d+\.json$/.test(f)).sort((a,b)=>parseInt(a.slice(5))-parseInt(b.slice(5))),steps:any[]=[];
for(const file of files){const s=await load(join(partial.directory,file));assert.equal(hash(await readFile(join(partial.directory,s.screenshot))),s.visualObservation.sha256);steps.push(s);}
assert.equal(steps.length,23);assert.equal(steps.at(-1).result,'PENDING');assert.equal(steps.filter(s=>s.result==='OK').length,22);assert.equal(steps.filter(s=>s.recordedAction).length,22);
await assert.rejects(access(join(partial.directory,'result.json')));
assert.equal(steps[7].visualObservation.sha256,steps[10].visualObservation.sha256);
assert.equal(steps[10].visualObservation.sha256,steps[12].visualObservation.sha256);
assert.equal(steps[12].visualObservation.sha256,steps[15].visualObservation.sha256);
const probe=await load(manifest.probe.source,manifest.probe.sha256);await load(manifest.reference.source,manifest.reference.sha256);
assert.equal(probe.original[1].choice,'e4');assert.equal(probe.counterfactual[1].choice,'e10');assert.equal(probe.sameProviderAnswers,true);assert.equal(probe.jevCalls,0);
await report(root,runs);
const flow=[5,6,7,8,10,11].map(n=>{const s=steps[n-1];return `<li>判断 ${n}：${esc(s.decision.choice)} ${s.decision.frontier?`／目的地 ${esc(s.decision.frontier.targetId)}`:''}<br><a href="${esc(href(join(partial.directory,`step-${n}.json`)))}">判断ログ</a> <a href="${esc(href(join(partial.directory,s.screenshot)))}">当時の画像</a></li>`;}).join('');
const notice=`<section class="completion-audit" id="field-findings"><h2>2 サイト・3 種類の目的を実サイトで試した</h2>
<p>esa は料金と試用期間を 2 回とも 1 操作、探索約 13 秒と 12 秒で確認した。宇宙劇場の料金・当日券・遅刻条件は 2 操作、探索約 40 秒で完了判断となった。保存画像を開発者も点検し、求める案内の表示を確認した。モデルの完了判断と客観的な正解は区別し、元の objectiveSuccess は null のまま残した。</p>
<p>別の条件付き目的では、こちらの移動先選択に問題を確認した。下の通常レポート 3 件とは別に、診断中断した 1 件を記録する。成功率やサイトの到達不能率には算入しない。</p>
<h3>車いす利用の目的で、コードが集会室へ寄り道した</h3>
<p>${esc(steps[0].state.goal)}</p>
<p>確認済みの実行記録は 22 操作。判断 23 は PENDING のまま、原因を再現できたため実行者が試行と子ブラウザーを終了した。中断時の未保存処理は否定できないため、22 を正確な最終総数とは扱わない。Jev の STUCK やサイト側の失敗として保存し直していない。元の result.json、終了後監査は存在しない。</p>
<ol>${flow}</ol>
<p>判断 6 の Jev は下スクロールを選んだ。複数の移動先が同じ操作を経由するため、コードが距離で並べた同順位の先頭 f45 を目的地として固定した。f45 は集会室の入口で、過去の画像判断は unrelated、FAQ の f51 は promising だった。判断 7 は固定した f45 を維持し、現在の e4（集会室）を押した。</p>
<p>保存済みの同じ Jev 回答を使い、候補の順番だけを変更すると f51 が目的地になり、次の操作が e10（FAQ）へ変わった。公開サイトへの追加リクエスト、推論は 0 回。この 2 操作の寄り道がコードの一覧順に依存することは再現した。改善後の実探索完了や、FAQ だけで全条件が分かることを証明したわけではない。</p>
<p>同じ集会室への到着画像は判断 8・11・13・16 で SHA-256 が一致した。同じ固定メニューでもスクロール位置が変わると別の未探索対象になる処理が、再訪を増やしている。単に同じ URL を禁止する修正では、必要な再観察や状態を持つ操作まで消すため、実際の到着状態の一致を使う設計を先に検証する。</p>
<h3>範囲の制約と、サイトへの提案を分ける</h3>
<p>アクセス案内にある車いす向け PDF と外部の駐車場案内は、現在の範囲では操作不能だった。ただし、それらに求める回答があるとは確認していない。サイト内の FAQ 自体は操作可能で、試行中は到達していなかった。地図の空白は iframe をこちらが止めた結果であり、サイトの欠陥とは扱わない。</p>
<p>中断後の公式 HTML の独立調査では、手帳を持つ場合の付き添い割引と駐車場案内を確認した。車いす利用だけで手帳所持を仮定しない。HTML には未表示の要素も含まれ、Jev に答えや経路として渡していない。車いすのままの観覧可否、専用駐車場の有無への明示回答は、この調査でも確定していない。</p>
<p>サイト側への提案候補は、観覧条件・付き添い割引の適用条件・駐車場案内を利用案内の HTML にまとめること。ただし、本試行にはこちらの寄り道が混入している。利用者も迷うという断定や営業用の UX 評点には使わず、所有する模擬ページや人のテストで効果を調べる。</p>
<h3>次の改善案と合格条件</h3><ol>
<li>同じ移動を経由する目的地が複数あるとき、一覧の先頭ではなく画像由来の見込みと既存の経路選択で目的地を決める。候補順を入れ替えても、今回の無関係な集会室への固定が再発しないことを保存ログで検査し、同じ Goal を実サイトで再実行する。</li>
<li>同じ固定メニューの到着状態が一致した場合の再探索を整理する。状態を持つタブや開閉は結合せず、必要な再読や次の未探索先を残すテストを先に置く。</li>
<li>禁止操作の有無を情報の画像根拠とは分ける。esa の 2 回とも禁止事項が画像の根拠不足で unconfirmed になったが、保存経路は料金ページへのクリックだけだった。完全な実行記録と安全イベントで検査し、不完全な今回の中断試行は不明のまま残す。</li>
</ol>
<p>本番コードは未変更。関連テスト 30 件とビルドは通過した。今回の修正案は、上記の 2 操作を除き効果未検証。3 回の完了した試行、1 回の中断だけから一般の精度やサイト全体の品質は結論しない。</p>
<p><a href="${esc(href(manifest.probe.source))}">候補順の対照結果</a> ／ <a href="${esc(href(manifest.reference.source))}">開発者の独立参照記録</a> ／ <a href="${esc(href('docs/experiments/2026-10-20-real-site-results.json'))}">試行条件と改善案</a> ／ <a href="verification.json">検証記録</a></p></section>`;
const html=join(root,'index.html');await writeFile(html,(await readFile(html,'utf8')).replace('<div class="overview">',notice+'<div class="overview">'));await writeFile(join(root,'verification.json'),'{}');
const browser=await chromium.launch();let qa;
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors:string[]=[],external:string[]=[];
 await page.route('**/*',route=>{if(new URL(route.request().url()).hostname!=='127.0.0.1'){external.push(route.request().url());return route.abort();}return route.continue();});page.on('pageerror',e=>errors.push(e.message));
 assert.equal((await page.goto(`http://127.0.0.1:5173/reports/${basename(root)}/index.html`))?.status(),200);assert.equal(await page.locator('details.run').count(),3);
 const links=await page.locator('a[href],img[src]').evaluateAll(nodes=>nodes.map(n=>n instanceof HTMLAnchorElement?n.href:(n as HTMLImageElement).src));
 for(const link of new Set(links)){const u=new URL(link);assert.equal(u.hostname,'127.0.0.1');await access(resolve('.'+decodeURIComponent(u.pathname)));}
 const images=await page.locator('img').evaluateAll(async nodes=>Promise.all(nodes.map(async n=>{const img=n as HTMLImageElement;img.loading='eager';await img.decode();return img.naturalWidth;})));assert.ok(images.length>0&&images.every(w=>w>0));
 await page.screenshot({path:join(root,'desktop.png')});await page.setViewportSize({width:390,height:844});await page.screenshot({path:join(root,'mobile.png')});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 qa={http:200,completedRunCards:3,images:images.length,links:new Set(links).size,pageErrors:errors,externalRequests:external,mobileOverflow:false};
}finally{await browser.close();}
for(const s of sources)assert.equal(hash(await readFile(s.file)),s.sha256);
const verification={root,sources,sourceFilesUnchanged:true,completedRuns:3,diagnosticInterruptedRuns:1,interruptionNotCountedAsStuck:true,measurements,interrupted:{persistedCompletedSteps:22,lastStepStatus:'PENDING',completedStepTimeLowerBoundMs:partial.completedStepTimeLowerBoundMs},qa,productionCodeChanged:false};await writeFile(join(root,'verification.json'),JSON.stringify(verification,null,2));console.log(JSON.stringify(verification,null,2));
