// Renders the existing journey report with this batch's separate review notes.
// No browser navigation and no model/API call.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile, mkdir, access} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {report} from '../../runner/report.ts';

const readJSON = async path => JSON.parse(await readFile(path, 'utf8'));
const plan = await readJSON('docs/experiments/2026-09-20-six-case-plan.json');
const review = await readJSON('docs/experiments/2026-09-20-six-case-results.json');
const diagnostics = await readJSON('docs/experiments/2026-09-20-diagnostics.json');
const root = resolve('reports/validation-2026-09-20');
const results = [];
for (const [i, entry] of review.cases.entries()) {
  const expected = plan.cases[i];
  const result = await readJSON(join('reports', entry.directory, 'exploration/result.json'));
  assert.equal(entry.id, expected.id);
  assert.equal(result.goalText, expected.goal);
  assert.equal(result.settings.url, expected.url);
  assert.equal(result.reason, entry.expectedReason);
  assert.equal(result.settings.maxActions, 12);
  assert.equal(result.settings.intervalMs, 3000);
  assert.equal(result.settings.navigationMode, 'links-only');
  assert.equal(result.objectiveSuccess, null);
  assert.equal(result.fake, false);
  for (const step of result.steps) {
    await access(join(result.dir, step.screenshot));
    assert.equal(step.state.goal, expected.goal);
    assert.deepEqual(Object.keys(step.state).sort(), ['currentDate','goal','history','screen']);
    assert.equal(step.decision.model, 'typesafe-ai/jev');
  }
  for (const id of entry.regionIds) assert.ok(result.steps[entry.evidenceStep-1].state.screen.regions.some(region => region.id === id));
  results.push(result);
}
assert.equal(results.length, 6);
assert.equal(results.filter(r => r.reason === 'JEV_DONE').length, 2);
assert.equal(results.filter(r => r.completionAudit.status === 'ERROR').length, 2);
const hashChecks = [];
for (const [path, baseline] of Object.entries(diagnostics.baselineHashesRecordedDuringExecution)) {
  const actual = createHash('sha256').update(await readFile(path)).digest('hex').toUpperCase();
  assert.equal(actual, baseline, `Source changed during experiment: ${path}`);
  hashChecks.push(path);
}
await mkdir(root, {recursive:true});
await report(root, results);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rows = review.cases.map((entry, i) => {
  const r = results[i];
  return `<tr><th scope="row">${escape(plan.cases[i].site)}<small>${escape(entry.shortGoal)}</small></th><td><span class="badge ${entry.category==='REFERENCE_MATCH'?'success':'limit'}">${escape(entry.reviewStatus)}</span><small>${r.actionCount} 操作 / ${r.steps.length} 判断</small></td><td>${escape(entry.review)}<small><a href="../${entry.directory}/index.html">この試行の図を開く</a> · <a href="../${entry.directory}/exploration/result.json">元ログ</a></small></td></tr>`;
}).join('');
const notes = `<section class="batch-review" aria-labelledby="review-title">
<p class="eyebrow">3 業種 × 2 目的 / 2026-09-20 / ローカル検証</p>
<h1 id="review-title">実サイト 6 目的：結果と切り分け</h1>
<p class="intro">必要情報を確認できたのは 2 件。残る 4 件は、こちらの観察・操作の制約を含むためサイト評価を保留。</p>
<div class="overview"><div><b>2</b><span>必要情報を確認</span></div><div><b>4</b><span>サイト評価を保留</span></div><div><b>0</b><span>確定したサイト側の問題</span></div></div>
<p class="notice">営業用の指摘はまだ作りません。停止をサイトの欠陥として数えず、まず探索器を直す必要があります。</p>
<h2>目的別の結果</h2>
<div class="batch-table" tabindex="0" role="region" aria-label="6 目的の結果"><table><thead><tr><th>サイト・目的</th><th>別途照合の結果</th><th>確認したこと</th></tr></thead><tbody>${rows}</tbody></table></div>
<h2>画面にはあるのに、Jev に渡していなかった</h2>
<p>フィットネスサイトでは、フッターに FAQ と高校生制度のリンクが見えます。しかし観察入力ではその文字が抜け、操作候補も空欄になっていました。</p>
<a class="batch-shot" href="../2026-09-20T05-03-12.645Z-public/exploration/step-11.png"><img src="../2026-09-20T05-03-12.645Z-public/exploration/step-11.png" alt="見学試行の画面11。中央に高校生制度、右に FAQ のリンクが表示されている。" loading="lazy"></a>
<p class="hint">画像：見学試行の画面 11。元の画面全体を表示しています。<a href="../2026-09-20T05-03-12.645Z-public/exploration/step-11.json">この画面の入力 JSON</a>では、該当リンクの文言を確認できません。</p>
<p>原因は文字抽出処理です。リンク左の 8 × 14 px の矢印は CSS の疑似要素で描かれており、「背景を持つ絶対配置の疑似要素」の除外条件に一致します。現在の処理は文字との重なりを調べずにリンクの文字まで捨てます。これは OCR の誤読でも、Jev の選択ミスと確定した例でもありません。</p>
<h2>読めるボタンでも実行できない</h2>
<p>博物館の 2 件では、Jev は最初に「利用案内」を選びました。これはメニューを開くボタンですが、探索器はリンク以外を実行せず停止しました。通常ブラウザーでは、そのボタンでメニューを開き、入館案内へ進めることを確認しています。</p>
<p class="hint">今回の安全停止は、サイトのアクセス拒否ではありません。送信や購入の禁止を維持しながら、表示切替だけの操作を分けて扱う必要があります。</p>
<h2>完了後の根拠記録は、2 件ともエラー</h2>
<p>esa の必要情報は、公式案内・画面・観察入力を別途照合して確認しました。一方、自動の事後監査は 2 件とも失敗しています。保存入力で 1 回再実行したところ成功しましたが、元の例外詳細がないため原因は未確定です。元ログの ERROR はそのまま残しています。</p>
<h2>次に直す順番</h2><ol>${review.nextPriorities.map(v=>`<li>${escape(v)}</li>`).join('')}</ol>
<details class="technical"><summary>検証条件と限界</summary><ul>${review.limits.map(v=>`<li>${escape(v)}</li>`).join('')}</ul><p>${escape(review.reviewer)}</p><p>事前の答え・参照 URL は Jev 入力から分離。30 回の探索判断と、終了した 2 件の事後監査を実施し、別に監査の診断用再実行を 1 回行いました。</p><p><a href="../../docs/experiments/2026-09-20-six-case-plan.json">事前計画と参照情報</a> · <a href="../../docs/experiments/2026-09-20-six-case-results.json">照合結果</a> · <a href="../../docs/experiments/2026-09-20-diagnostics.json">原因調査の記録</a></p></details>
<h2>以下は元ログから描画した操作経路</h2><p class="hint">下の「処理成功は未検証」は探索器が記録した値です。上の別途照合によって、その値を書き換えてはいません。</p>
</section>`;
const style = `.batch-review{margin-bottom:52px}.batch-review h2{margin-top:32px}.batch-review p{max-width:100ch;line-height:1.8}.batch-review li{margin:12px 0;line-height:1.7}.batch-review .overview{grid-template-columns:repeat(3,minmax(0,1fr))}.batch-table{overflow-x:auto}.batch-table table{width:100%;border-collapse:collapse;min-width:680px;text-align:left}.batch-table th,.batch-table td{vertical-align:top;padding:18px 12px;border-bottom:1px solid #d4ddd8;line-height:1.7}.batch-table th:first-child{width:23%}.batch-table small{display:block;margin-top:8px;font-weight:400}.batch-shot{display:block;max-width:900px}.batch-shot img{width:100%;height:auto;border:1px solid #d4ddd8}.batch-review .badge{white-space:normal}.batch-review summary{cursor:pointer}@media(max-width:640px){.batch-review .overview{grid-template-columns:1fr}.batch-review h1{font-size:28px}}`;
let html = await readFile(join(root,'index.html'),'utf8');
const columnStyle = '.batch-table th:nth-child(2){width:24%}';
html = html.replace('<title>Jev UX · 操作経路レポート</title>', '<title>Jev UX · 3 業種 6 目的の検証結果</title>')
  .replace(/<header>[\s\S]*?<\/header>/, '')
  .replace('</style>', `${style}${columnStyle}</style>`)
  .replace('<main>', `<main>${notes}`);
await writeFile(join(root,'index.html'), html);
const verification = {verifiedAt:new Date().toISOString(), trials:results.length, actions:results.reduce((n,r)=>n+r.actionCount,0), decisions:results.reduce((n,r)=>n+r.steps.length,0), casesMatchPlan:true, codeHashesMatch:hashChecks, originalAuditErrors:results.filter(r=>r.completionAudit.status==='ERROR').length, elapsedSecondsExcludingAudit:results.reduce((n,r)=>n+r.elapsedMs,0)/1000, report:join(root,'index.html')};
await writeFile(join(root,'verification.json'), JSON.stringify(verification,null,2));
console.log(JSON.stringify(verification,null,2));
