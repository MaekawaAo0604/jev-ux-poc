// Assemble existing evidence; no website visits and no model/API calls.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {report} from '../../runner/report.ts';

const json=async path=>JSON.parse(await readFile(path,'utf8'));
const plan=await json('docs/experiments/2026-09-20-six-case-plan.json');
const before=await json('docs/experiments/2026-09-20-six-case-results.json');
const first=await json('reports/validation-fixes-2026-09-20T06-47-16.688Z/comparison.json');
const review=await json('docs/experiments/2026-09-20-fix-review.json');
const second=await json(join('reports',review.additionalBatch,'comparison.json'));
assert.equal(first.cases.length,6);assert.equal(second.cases.length,2);
assert.equal(first.codeUnchanged,true);assert.equal(second.codeUnchanged,true);
const results=[],rows=[];
const labels={JEV_DONE:'Jev が完了と判断',ACTION_LIMIT:'操作上限',LOOP:'往復で停止',DECISION_ERROR:'判断 API エラー',SAFETY_BOUNDARY:'安全制約で停止',ACTION_ERROR:'操作エラー'};
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
for(const entry of plan.cases){
 const old=before.cases.find(c=>c.id===entry.id),latest=second.cases.find(c=>c.id===entry.id)||first.cases.find(c=>c.id===entry.id);
 const notes=review.cases.find(c=>c.id===entry.id),r=await json(latest.resultPath);
 assert.equal(r.goalText,entry.goal);assert.equal(r.objectiveSuccess,null);
 for(const evidence of notes.evidence||[])assert.ok(r.steps[evidence.step-1].state.screen.regions.some(region=>region.id===evidence.id));
 results.push(r);
 rows.push(`<tr><th>${escape(entry.site)}<small>${escape(old.shortGoal)}</small></th><td>${escape(labels[old.expectedReason]||old.expectedReason)}</td><td>${escape(labels[r.reason]||r.reason)}<small>${r.actionCount} 操作 / ${r.steps.length} 判断</small></td><td>${escape(notes.note)}</td></tr>`);
}
const root=resolve('reports/fix-summary-2026-09-20');await mkdir(root,{recursive:true});await report(root,results);
const intro=`<section class="fix-review"><p class="eyebrow">探索器の修正 / 2026-09-20 / 内部検証</p><h1>見える文字と、実行できる操作を揃える</h1><p>${escape(review.summary)}</p><ul><li>文字に重ならない装飾矢印で、リンク名まで消さない。</li><li>対応するメニューと FAQ は実際に開閉する。未対応操作は候補から除外し、開閉後の通信は制限する。</li><li>同一サイト内の転送を最大 3 回まで検査して進む。外部、ファイル、循環する転送は拒否する。</li><li>根拠確認のエラーを入力・通信・返答形式の段階に分けて記録する。認証情報や生の例外は保存しない。</li></ul><p>自動テスト 41 件通過、OCR 実モデルテスト 1 件スキップ。ビルド成功。</p><h2>確認できたことと、残った制約</h2><div class="fix-table" tabindex="0" role="region" aria-label="目的別の検証結果"><table><thead><tr><th>目的</th><th>修正前</th><th>今回</th><th>別途確認</th></tr></thead><tbody>${rows.join('')}</tbody></table></div><p class="notice">これは一巡の成功率ではありません。最初に同じコードで 6 目的を試し、そこで判明した転送制約を追加修正して博物館の 2 目的だけを再実行しました。各段階のログを残しています。Jev の完了判断を客観的な成功判定には置き換えていません。</p><p>${escape(review.limits)}</p><p><a href="../validation-fixes-2026-09-20T06-47-16.688Z/index.html">最初の 6 目的の比較</a> · <a href="../${escape(review.additionalBatch)}/index.html">転送修正後の 2 目的</a> · <a href="../../docs/experiments/2026-09-20-fix-review.json">照合メモ</a></p><h2>以下は保存した実行ログの操作経路</h2></section>`;
const css='.fix-review{margin-bottom:40px}.fix-review h2{margin-top:28px}.fix-review p{max-width:95ch}.fix-review li{margin:8px 0}.fix-table{overflow:auto}.fix-table table{min-width:820px;width:100%;table-layout:fixed;border-collapse:collapse;text-align:left}.fix-table th,.fix-table td{vertical-align:top;padding:14px 10px;border-bottom:1px solid #dce5df;overflow-wrap:anywhere}.fix-table th:nth-child(1){width:19%}.fix-table th:nth-child(2),.fix-table th:nth-child(3){width:16%}.fix-table small{display:block;font-weight:400;margin-top:5px}';
let html=await readFile(join(root,'index.html'),'utf8');
html=html.replace(/<header>[\s\S]*?<\/header>/,'').replace('<main>',`<main>${intro}`).replace('</style>',`${css}</style>`).replace('<title>Jev UX · 操作経路レポート</title>','<title>Jev UX · 探索器の修正と再検証</title>');
await writeFile(join(root,'index.html'),html);console.log(join(root,'index.html'));
