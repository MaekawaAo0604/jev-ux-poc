// Post-run checks only. Never imported by the explorer or provided to Jev.
import assert from 'node:assert/strict';
import {readFile, writeFile, access} from 'node:fs/promises';
import {join, resolve, relative} from 'node:path';

assert.ok(process.argv[2], 'Pass a completed live batch directory');
const root = resolve(process.argv[2]);
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const manifest = await json(join(root, 'validation.json'));
assert.equal(manifest.codeUnchanged, true);
assert.equal(manifest.cases.length, manifest.plannedRuns.length);
const baselinePath = 'reports/goal-check-live-2026-09-21T00-46-13.375Z/validation.json';
const baselineManifest = await json(baselinePath);
const traceTotals = traces => ({logicalCalls:traces.length,
  attempts:traces.reduce((sum,t)=>sum+t.attempts,0),
  failures:traces.reduce((sum,t)=>sum+t.failures.length,0)});
const auditMetrics = result => traceTotals(result.completionAudit?.request?[result.completionAudit.request]:[]);
const baselineMetrics = result => traceTotals(result.steps.flatMap(s=>{
  const a = s.decision?.goalAssessment || s.goalAssessment;
  return [s.decision?.request,a?.request,...(a?.grounding?.requests||[]),s.error?s.request:null].filter(Boolean);
}));
const combinedMetrics = (exploration,audit) => Object.fromEntries(
  ['logicalCalls','attempts','failures'].map(key=>[key,exploration[key]+audit[key]]));
const facts = {
  'anytime-highschool': [
    {name:'保護者の会員条件', terms:['保護者','エニタイムメンバー']},
    {name:'年齢と高校在学の条件', terms:['15歳以上18歳以下','高校在学期間']},
    {name:'利用できる時間帯', terms:['利用できるのは','スタッフアワー内のみ']},
    {name:'利用できる店舗', terms:['利用できるのは','保護者の登録店舗のみ']},
    {name:'保護者の退会・移籍時の制限', terms:['保護者が退会','移籍','利用不可']},
  ],
  'anytime-tour': [
    {name:'メール・電話で見学予約', terms:['メール','電話','見学予約']},
    {name:'受付時間は店舗ごとに異なる', terms:['スタッフ受付時間','店舗によって異な']},
  ],
};
const checked = [];
let quoteCount = 0;
for (const c of manifest.cases) {
  const result = await json(c.resultPath);
  assert.equal(result.objectiveSuccess, null);
  assert.equal(result.fake, false);
  const explorationMetrics = result.evidenceSession?.accounting;
  assert.ok(explorationMetrics,'New runs must include evidence-session accounting');
  const oldCase = baselineManifest.cases.find(b=>b.id===c.id&&b.repeat===c.repeat);
  assert.ok(oldCase);
  const oldResult = await json(oldCase.resultPath);
  const audit = auditMetrics(result),oldAudit = auditMetrics(oldResult);
  const metrics = {exploration:explorationMetrics,audit,total:combinedMetrics(explorationMetrics,audit),
    baseline:{resultPath:oldCase.resultPath,reason:oldResult.reason,actionCount:oldResult.actionCount,
      elapsedMs:oldResult.elapsedMs,total:combinedMetrics(baselineMetrics(oldResult),oldAudit)}};
  const observedFacts = facts[c.id].map(f => ({...f, matches:result.steps.flatMap(s =>
    (s.state.screen.regions || []).filter(r => f.terms.every(t => r.text.includes(t)))
      .map(r => ({step:s.number, region:r.id, text:r.text, context:r.context,
        screenshot:join(result.dir,s.screenshot)})))}));
  const assessments = [];
  for (const s of result.steps) {
    const a = s.decision?.goalAssessment || s.goalAssessment;
    if (!a) continue;
    for (const check of a.grounding?.checks || []) {
      for (const field of ['evidence','relatedEvidence','uncertainEvidence']) {
        for (const e of check[field] || []) {
          const match = /^s(\d+)-t(\d+)$/.exec(e.id);
          assert.ok(match, 'Quote IDs must preserve observed occurrence');
          assert.equal(Number(match[1]),e.step);
          const source = e.step === s.number ? s.state.screen.text : s.state.history[e.step-1]?.observedText;
          assert.equal(source?.[Number(match[2])-1],e.text,'Quote must equal its actual model input');
          const original = result.steps[e.step-1];
          assert.ok(original.state.screen.text.includes(e.text),'Quote must exist on its source screen');
          await access(join(result.dir,original.screenshot));
          quoteCount++;
        }
      }
    }
    assessments.push({step:s.number, assessment:a, error:s.error, decisionStage:s.decisionStage});
  }
  const last = result.steps.at(-1);
  checked.push({id:c.id,repeat:c.repeat,resultPath:c.resultPath,reason:result.reason,
    actionCount:result.actionCount,elapsedMs:result.elapsedMs,observedFacts,metrics,
    allReferenceFactsRecorded:observedFacts.every(f=>f.matches.length),assessments,
    finalGoalAssessment:last?.decision?.goalAssessment || last?.goalAssessment || null,
    error:last?.error || null,decisionStage:last?.decisionStage || null,
    completionAudit:result.completionAudit});
}
let replay;
if (process.argv[3]) {
  const data = await json(resolve(process.argv[3]));
  replay = {path:resolve(process.argv[3]),total:data.results.length,
    correct:data.results.filter(r=>!r.error&&r.complete===r.expectedComplete).length,
    errors:data.results.filter(r=>r.error).length,
    falseCompletions:data.results.filter(r=>!r.error&&r.complete&&!r.expectedComplete).length};
}
const verification = {checkedAt:new Date().toISOString(),codeUnchanged:true,
  selectedQuoteOccurrencesVerified:quoteCount,live:checked,replay,
  notes:['参照条件は終了後の照合だけに使用。Jev に正解や経路は渡していない。',
    '本文の取得・探索中の判定・終了後の再評価は別の結果。',
    '少数回の実行から人間の UX や普遍的な成功率は結論づけない。']};
await writeFile(join(root,'verification.json'),JSON.stringify(verification,null,2));
const esc = v => String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const title = c => `${c.id==='anytime-highschool'?'高校生向け制度':'見学方法'} ${c.repeat} 回目`;
const reasons = {JEV_DONE:'Jev が完了と判断',ACTION_LIMIT:'操作上限',DECISION_ERROR:'判断 API エラー',STUCK:'次の操作を選べず停止',LOOP:'繰り返しで停止',SAFETY_BOUNDARY:'安全制限による停止',PAGE_ERROR:'ページ取得エラー',UNSUPPORTED_CONTENT:'未対応のコンテンツ'};
const foundAndDone = checked.filter(c=>c.reason==='JEV_DONE'&&c.allReferenceFactsRecorded).length;
const link = path => relative(root,resolve(path)).replaceAll('\\','/');
const intro = `<section class="completion-audit" id="contextual-verification"><h1>引用の内容・対象・十分性を分けた判定の検証</h1>
<p>新しいブラウザーセッションで ${checked.length} 回実行。参照条件に対応する本文をすべて記録し、Jev も完了と判断したのは ${foundAndDone} 回でした。各回 24 操作まで。実行中に探索コードは変更していません。</p>
<ul>${checked.map((c,i)=>`<li><h2>${esc(title(c))}</h2><p>${c.actionCount} 操作、${esc(reasons[c.reason]||c.reason)}。本文の記録は ${c.observedFacts.filter(f=>f.matches.length).length}/${c.observedFacts.length} 項目。所要時間 ${(c.elapsedMs/1000).toFixed(1)} 秒（終了後の再評価は除く）。</p>
<p>API の呼び出し ${c.metrics.total.logicalCalls} 回、再試行込み ${c.metrics.total.attempts} 回。前回の同じ目的・同じ回数目では ${c.metrics.baseline.total.logicalCalls} 回、再試行込み ${c.metrics.baseline.total.attempts} 回でした（どちらも終了後の再評価を含む）。経路と終了理由が異なるため、同一入力での速度比較ではありません。</p>
<p>探索中に判定結果を再利用した処理は ${c.metrics.exploration.reusedCalls} 件、質問は ${c.metrics.exploration.reusedQuestions} 件。再利用回数は通信削減の内訳であり、判定の正しさを表す数字ではありません。</p>
${c.error?`<p class="notice">${esc(c.decisionStage)}：${esc(c.error)}。この試行を成功には数えていません。</p>`:''}
<details><summary>条件ごとの本文と画面</summary><ul>${c.observedFacts.map(f=>`<li>${esc(f.name)}：${f.matches.length?`記録あり。<a href="#trial-${i}-screen-${f.matches[0].step}">画面 ${f.matches[0].step}</a><blockquote>${esc(f.matches[0].text)}</blockquote>`:'照合できる本文の記録なし'}</li>`).join('')}</ul></details></li>`).join('')}</ul>
<p>${quoteCount?`引用 ${quoteCount} 件について、判定時の入力と出典画面の本文が一致し、出典画像が保存されていることを確認しました。引用が正確でも、その制度に適用できる根拠とは限りません。`:'今回の探索では根拠候補の引用が記録されていないため、引用照合の対象はありません。必要情報を取得できたことの証明にはなりません。'}対象の一致と情報の充足は、下の各ステップの判定記録で分けて表示します。</p>
${replay?`<p>保存ログの実モデル検証：${replay.total} 件中 ${replay.correct} 件が期待どおり。誤完了 ${replay.falseCompletions} 件、API エラー ${replay.errors} 件。<a href="${link(replay.path)}">検証ログ</a></p>`:''}
<p>本文の取得、探索中の完了判断、終了後の再評価は別の結果です。処理成功は未検証のまま記録しています。少数回の結果から人間にとっての分かりやすさや普遍的な成功率は結論づけません。</p>
<p><a href="verification.json">本文と引用の照合記録</a> ／ <a href="validation.json">実行条件とコードの記録</a> ／ <a href="${link('reports/goal-check-live-2026-09-21T00-46-13.375Z/index.html')}">変更前の 3 回</a></p></section>`;
const html = await readFile(join(root,'index.html'),'utf8');
assert.ok(!html.includes('id="contextual-verification"'),'Do not duplicate summary');
await writeFile(join(root,'index.html'),html.replace('<main>',`<main>${intro}`));
console.log(JSON.stringify({report:join(root,'index.html'),foundAndDone,quoteCount,
  cases:checked.map(({id,repeat,reason,actionCount,allReferenceFactsRecorded,error})=>
    ({id,repeat,reason,actionCount,allReferenceFactsRecorded,error}))}));
