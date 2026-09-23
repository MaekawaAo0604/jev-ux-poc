// Post-run checks only. Reference facts are never passed to the explorer or Jev.
import assert from 'node:assert/strict';
import {readFile, writeFile, access} from 'node:fs/promises';
import {resolve, join, relative} from 'node:path';

assert.ok(process.argv[2], 'Pass the completed live batch directory');
const root = resolve(process.argv[2]);
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const manifest = await json(join(root, 'validation.json'));
assert.equal(manifest.codeUnchanged, true);
assert.equal(manifest.cases.length, manifest.plannedRuns.length);
const offlinePath = 'reports/grounded-validation-2026-09-21T00-30-31.538Z/validation.json';
const recoveryPath = 'reports/grounded-recovery-2026-09-21T00-33-36.913Z/validation.json';
const offline = await json(offlinePath);
const recovery = await json(recoveryPath);
const offlineCorrect = offline.results.filter(r => !r.error && r.complete === r.expectedComplete).length;
const offlineErrors = offline.results.filter(r => r.error).length;
const facts = {
  'anytime-highschool': [
    {name: '保護者の会員条件', terms: ['保護者', 'エニタイムメンバー']},
    {name: '年齢と高校在学の条件', terms: ['15歳以上18歳以下', '高校在学期間']},
    {name: '利用できる時間帯', terms: ['利用できるのは', 'スタッフアワー内のみ']},
    {name: '利用できる店舗', terms: ['利用できるのは', '保護者の登録店舗のみ']},
    {name: '保護者の退会・移籍時の制限', terms: ['保護者が退会', '移籍', '利用不可']},
  ],
  'anytime-tour': [
    {name: 'メール・電話で見学予約', terms: ['メール', '電話', '見学予約']},
    {name: '受付時間は店舗ごとに異なる', terms: ['スタッフ受付時間', '店舗によって異な']},
  ],
};
let quoteCount = 0;
const checked = [];
const sourceConfusion = [];
for (const c of manifest.cases) {
  const result = await json(c.resultPath);
  assert.equal(result.objectiveSuccess, null);
  assert.equal(result.fake, false);
  const observedFacts = facts[c.id].map(f => ({...f, matches: result.steps.flatMap(s =>
    (s.state.screen.regions || []).filter(r => f.terms.every(t => r.text.includes(t))).map(r =>
      ({step: s.number, region: r.id, text: r.text, screenshot: join(result.dir, s.screenshot)})))}));
  const groundingEvents = [];
  for (const s of result.steps) {
    const a = s.decision?.goalAssessment || s.goalAssessment;
    if (!a?.grounding) continue;
    for (const check of a.grounding.checks) {
      for (const field of ['evidence', 'relatedEvidence', 'uncertainEvidence']) {
        for (const e of check[field]) {
          const match = /^s(\d+)-t(\d+)$/.exec(e.id);
          assert.ok(match);
          assert.equal(Number(match[1]), e.step);
          const source = e.step === s.number ? s.state.screen.text : s.state.history[e.step - 1]?.observedText;
          assert.equal(source?.[Number(match[2]) - 1], e.text, 'Quote must equal the actual model input');
          const original = result.steps[e.step - 1];
          assert.ok(original.state.screen.text.includes(e.text), 'Quote must exist on the recorded source screen');
          await access(join(result.dir, original.screenshot));
          quoteCount++;
          // A post-run finding checked against the source screenshot, not a new decision rule.
          if (c.id === 'anytime-highschool' && check.text === '利用できる店舗'
            && field === 'evidence' && e.text.includes('世界中の全店舗を利用可能')) {
            sourceConfusion.push({trial: checked.length, id: c.id, repeat: c.repeat,
              decisionStep: s.number, sourceStep: e.step, text: e.text,
              screenshot: join(result.dir, original.screenshot),
              note: '一般向けの全店舗利用案内を、高校生制度の利用店舗の直接の根拠に分類していた。'});
          }
        }
      }
    }
    groundingEvents.push({step: s.number, checks: a.grounding.checks.map(p => ({
      text: p.text, directQuotes: p.evidence.length, assessment: p.assessment?.choice || null,
    })), successfulRequests: a.grounding.requests.length, error: s.error || null});
  }
  const last = result.steps.at(-1);
  checked.push({id: c.id, repeat: c.repeat, resultPath: c.resultPath, reason: result.reason,
    actionCount: result.actionCount, elapsedMs: result.elapsedMs, finalURL: result.finalURL,
    observedFacts, allReferenceFactsRecorded: observedFacts.every(f => f.matches.length),
    groundingEvents, finalGoalAssessment: last?.decision?.goalAssessment || last?.goalAssessment || null,
    error: last?.error || null, decisionStage: last?.decisionStage || null,
    failure: last?.failure || null, completionAudit: {status: result.completionAudit.status,
      assessment: result.completionAudit.assessment || null, error: result.completionAudit.error || null}});
}
const verification = {checkedAt: new Date().toISOString(), type: 'post-run-reference-text-and-quote-check',
  live: checked, selectedQuoteOccurrencesVerified: quoteCount, codeUnchanged: true,
  postRunSourceConfusionFindings: sourceConfusion,
  priorOffline: {path: offlinePath, total: offline.results.length, correct: offlineCorrect,
    errors: offlineErrors, recoveryPath, recoveryPass: recovery.pass},
  notes: ['参照条件は終了後の照合にだけ使用。Jev に正解や経路は渡していない。',
    '文字列照合と Jev の判断は、人間の UX 評価や成功率とは区別する。',
    '元の実行ログと objectiveSuccess:null は変更していない。']};
await writeFile(join(root, 'verification.json'), JSON.stringify(verification, null, 2));
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const link = path => relative(root, resolve(path)).replaceAll('\\', '/');
const title = c => `${c.id === 'anytime-highschool' ? '高校生向け制度' : '見学方法'} ${c.repeat} 回目`;
const reasons = {JEV_DONE:'Jev が完了と判断', ACTION_LIMIT:'操作上限', DECISION_ERROR:'判断 API エラー', STUCK:'次の操作を選べず停止', LOOP:'繰り返しで停止'};
const foundAndDone = checked.filter(c => c.reason === 'JEV_DONE' && c.allReferenceFactsRecorded).length;
const intro = `<section class="completion-audit" id="live-verification"><h1>根拠の照合を入れて実サイトで検証</h1>
<p>新しいセッションで 3 回実行しました。参照条件に対応する本文をすべて記録でき、Jev も完了と判断したのは ${foundAndDone} 回です。
各回 24 操作までとし、途中で探索コードは変更していません。</p>
<ul>${checked.map((c,i) => `<li><h2>${esc(title(c))}</h2><p>${c.actionCount} 操作、${esc(reasons[c.reason] || c.reason)}。
参照条件の本文は ${c.observedFacts.filter(f=>f.matches.length).length}/${c.observedFacts.length} 項目を記録。
根拠の照合は ${c.groundingEvents.length} 回開始しました。</p>
${c.error ? `<p class="notice">${esc(c.decisionStage)}：${esc(c.error)}。この試行を成功には数えていません。</p>` : ''}
<details><summary>条件ごとの本文と画面</summary><ul>${c.observedFacts.map(f => `<li>${esc(f.name)}：${f.matches.length ? `記録あり。<a href="#trial-${i}-screen-${f.matches[0].step}">画面 ${f.matches[0].step}</a><blockquote>${esc(f.matches[0].text)}</blockquote>` : '照合できる本文の記録なし'}</li>`).join('')}</ul></details></li>`).join('')}</ul>
<p>「本文を取得できたか」「探索中に完了と判断したか」「終了後の再評価」は別の結果です。
文字列が一致しただけで、人間にとって分かりやすいサイトだとは結論づけません。
元のログの処理成功は未検証のままです。</p>
<p>探索中に選ばれた引用 ${quoteCount} 件について、判断時の入力と出典画面の本文に一致すること、出典画像が保存されていることを確認しました。</p>
${sourceConfusion.length ? `<h2>残っている根拠の取り違え</h2><p class="notice">高校生制度の「利用できる店舗」の直接の根拠に、一般向けの「世界中の全店舗を利用可能」が混ざりました。
高校生制度の「保護者の登録店舗のみ」とは適用対象が異なります。
出典どおりに引用できても、正しい制度の根拠を選べたとは限りません。</p>
<ul>${sourceConfusion.map(f => `<li>${esc(title(f))}、判断 ${f.decisionStep}。
<a href="#trial-${f.trial}-screen-${f.sourceStep}">引用元の画面 ${f.sourceStep}</a><blockquote>${esc(f.text)}</blockquote></li>`).join('')}</ul>` : ''}
<p>保存ログの事前検証は ${offline.results.length} 件中 ${offlineCorrect} 件が期待どおりで、${offlineErrors} 件は API エラーでした。
再試行の結果も事前検証のレポートに残し、今回の実サイト結果と分けています。</p>
<p><a href="verification.json">条件と引用の照合記録</a> ／ <a href="validation.json">実行条件とコードの記録</a> ／ <a href="${link('reports/grounded-summary-2026-09-21/index.html')}">事前の保存ログ検証</a></p></section>`;
const html = await readFile(join(root, 'index.html'), 'utf8');
assert.ok(!html.includes('id="live-verification"'), 'Do not duplicate the summary');
await writeFile(join(root, 'index.html'), html.replace('<main>', `<main>${intro}`));
console.log(JSON.stringify({report: join(root, 'index.html'), foundAndDone, quoteCount,
  cases: checked.map(({id, repeat, reason, actionCount, allReferenceFactsRecorded, groundingEvents, error}) =>
    ({id, repeat, reason, actionCount, allReferenceFactsRecorded, groundingEvents, error}))}));
