// Adds diagnostic findings to the existing report; no model or browser calls.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
const [root,field,failed]=process.argv.slice(2).map(p=>resolve(p));
const esc=(value:unknown)=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const link=(file:string)=>esc(relative(root,file).replaceAll('\\','/'));
const measured=JSON.parse(await readFile(join(root,'measurements.json'),'utf8'));
const result=JSON.parse(await readFile(join(field,'exploration/result.json'),'utf8'));
const before=JSON.parse(await readFile(join(failed,'request-diagnostic-step-4-inline.json'),'utf8'));
const after=JSON.parse(await readFile(join(failed,'request-diagnostic-step-4-pooled.json'),'utf8'));
const advanced=resolve('reports/middleware-reliability-2026-10-16T14-08-25.989Z');
const rows=measured.trials.map((trial:any)=>`<li><a href="${esc(trial.scenario)}-${trial.repeat}.json">${esc(trial.scenario)}</a>：${esc(trial.reason)}、${trial.actions} 操作、不一致 ${trial.middlewareFailures}</li>`).join('');
const section=`<section class="completion-audit" id="extended-findings"><h2>今回、何が分かったか</h2>
<p>短いケースだけで区切らず、長いページ、Back 後の別枝、旧料金と現行料金、実サイトを追加した。Goal 未達そのものは不具合に数えていない。</p>
<h3>修正した入力欠落</h3><p>通常判断には表示位置と観察済み範囲があったが、最後の別ルート選択にはなかった。同じ位置情報を最終選択にも渡した。上へ戻る候補は禁止せず、正解の方向も教えていない。</p>
<p><a href="${link(join(advanced,'index.html'))}">修正後の追加 4 ケース各 2 回</a>では、Back 後に選択した別枝を維持して実操作した回数は 2 回、測定不一致は 0 件だった。長いページは 2 回とも途中で停止した。未観察の範囲は残っており、情報を渡せたことと Jev が進む判断をすることは別である。</p>
<h3>実サイトで見つかった入力肥大</h3><p>国立国会図書館を Goal だけで探索した最初の試行は、登録制度のページで HTTP 400 になった。サイトの UX 判定には使えない。保存入力の再送では、出典個別形式は質問 8 個・1 個とも max_tokens_exceeded で拒否された。</p>
<p>同じ画像の出典情報を visualSources に共有し、各文字メモから参照する形式へ変更した。文字、順序、位置、観測 step、URL、画面 ID、画像ハッシュは削っていない。ログは従来の展開形式を維持した。state は ${before[0].stateBytes.toLocaleString()} bytes から ${after[0].stateBytes.toLocaleString()} bytes になり、同じ画面の再送は質問 8 個・1 個とも HTTP 200 だった。入力上限の拡張ヘッダーは使っていない。</p>
<p>出典：<a href="https://www.ndl.go.jp/">国立国会図書館</a>。再探索の Goal は「${esc(result.goalText)}」。<a href="${link(join(field,'index.html'))}">開始ページからの再探索</a>は ${esc(result.reason)}、${result.actionCount} 操作、探索時間 ${(result.elapsedMs/1000).toFixed(1)} 秒。探索と終了後の監査は区別する。</p>
<details><summary>API 入力の対照原本</summary><ul><li><a href="${link(join(failed,'index.html'))}">最初の失敗した探索</a></li><li><a href="${link(join(failed,'request-diagnostic-step-4-inline.json'))}">出典個別形式の再送</a></li><li><a href="${link(join(failed,'request-diagnostic-step-4-pooled.json'))}">出典共有形式の再送</a></li></ul></details>
<h3>最終形式の再検証</h3><p>${measured.trials.length} 試行の結果は以下のとおり。必要情報の保持と出典の一致は下の測定欄を参照。</p><ul>${rows}</ul>
<p>別枝ケースの 4 件の情報保持不一致は、2 画面目の料金候補を Jev が却下して文字メモへ記録せず、受付時間も正確な OCR 候補が得られずに却下したためだった。記録済みの文字や出典が参照共有化で消えたわけではないが、この試行もサイトの UX 評価に使えない。</p>
<p>実サイトの再探索は、前回の停止画面を越えた後、6 観測目で再び max_tokens_exceeded になった。<a href="${link(join(field,'request-diagnostic-step-6-pooled.json'))}">その画面の再送診断</a>も質問 8 個・1 個とも HTTP 400。出典の共有だけでは長い探索の容量問題を解決していない。繰り返しサイトへ再アクセスして成功例だけを採用することはせず、原本を残した。</p>
<h3>評価できない範囲</h3><p>複雑な実サイトの正解は、この制御サイト用の測定器では独立検証できない。未完了だけを根拠にサイトの UX が悪いとは言えない。画像の非文字情報、OCR が拾えない文字、意味の矛盾、さらに長い探索での入力上限は残る。出典共有化は上限そのものを無くす修正ではない。</p>
<p>最初の診断行列 14-01-09 は逐次実行中に修正が入り、均一な修正前群ではない。また、当時の照合器は同じ行に並ぶ 2 リンクの文字を不一致扱いしていた。旧原本は書き換えず、位置を使う照合器で新規実行した結果と分けた。</p></section>`;
const file=join(root,'index.html');let html=await readFile(file,'utf8');
html=html.replace(/<section class="completion-audit" id="extended-findings">[\s\S]*?<\/section>/,'');
await writeFile(file,html.replace('</header>','</header>'+section));
console.log(JSON.stringify({report:file,trials:measured.trials.length,fieldReason:result.reason}));
