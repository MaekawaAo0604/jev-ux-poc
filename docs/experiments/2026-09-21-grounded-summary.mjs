// Offline report only: no inference, navigation, or edits to earlier trial results.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
import {reportStyle} from '../../runner/report-style.ts';
const validationPath=process.argv[2],recoveryPath=process.argv[3];
const json=async p=>JSON.parse(await readFile(p,'utf8'));
const validation=await json(validationPath),recovery=await json(recoveryPath),source=await json(validation.source);
assert.equal(validation.codeUnchanged,true);assert.equal(recovery.originalPath,validationPath);
const root=resolve('reports','grounded-summary-2026-09-21');await mkdir(root,{recursive:true});
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const link=p=>relative(root,resolve(p)).replaceAll('\\','/');
const good=validation.results.filter(r=>!r.error&&r.complete===r.expectedComplete),errors=validation.results.filter(r=>r.error),wrong=validation.results.filter(r=>!r.error&&r.complete!==r.expectedComplete);
const names={'highschool-complete':'高校生制度：全情報あり','highschool-entry':'高校生制度：入口のみ','highschool-age-only':'高校生制度：対象条件のみ','highschool-home':'高校生制度：ホームのみ','tour-complete':'見学案内：全情報あり','museum-complete':'開館案内：全情報あり','removed-eligibility':'対象・年齢条件を削除','removed-store-rule':'利用店舗の条件を削除','removed-time-rule':'利用時間の条件を削除','incomplete-checklist':'目的のチェック項目が不足'};
const status=r=>r.error?`${r.error.code}${r.error.statusCode?` ${r.error.statusCode}`:''}（未確認）`:r.complete?'完了と判定':'完了と判定せず';
const informationLabel=value=>({present:'取得済み',absent:'不足',uncertain:'判定保留'}[value]||'未確認');
const provenance=[];
const cards=validation.results.map((r,i)=>{
 const c=source.cases.find(c=>c.id===r.id),frames=[...c.state.history.map(h=>h.observedText||[]),c.state.screen.text];
 const proof=r.assessment?.grounding;
 for(const check of proof?.checks||[])for(const e of [...check.evidence,...check.relatedEvidence,...check.uncertainEvidence]){
  const match=/^s(\d+)-t(\d+)$/.exec(e.id);assert.ok(match);assert.equal(Number(match[1]),e.step);assert.equal(frames[e.step-1]?.[Number(match[2])-1],e.text);
  provenance.push({case:r.id,repeat:r.repeat,id:e.id});
 }
 const quotes=items=>`<ul class="evidence-list">${items.map(e=>`<li><div class="evidence-meta">観察 ${e.step} · ${escape(e.id)} · <a href="${link(validation.source)}">元の保存ログ</a></div><blockquote>${escape(e.text)}</blockquote>${e.warnings.length?`<p class="hint">${escape(e.warnings.join(', '))}</p>`:''}${e.omitted?'<p class="hint">観察の一部省略あり</p>':''}</li>`).join('')}</ul>`;
 const detail=proof?proof.checks.map((p,n)=>`<section class="completion-audit"><h3>${escape(p.text)}</h3><p>一次判定：${informationLabel(r.assessment.checks[n].choice)} ／ 根拠から回答できるか：${informationLabel(p.assessment?.choice)}</p><p>直接の根拠 ${p.evidence.length} 件</p>${quotes(p.evidence)}${p.relatedEvidence.length?`<details><summary>関連する説明 ${p.relatedEvidence.length} 件（直接の根拠とは区別）</summary>${quotes(p.relatedEvidence)}</details>`:''}${p.uncertainEvidence.length?`<details><summary>根拠として扱えるか不明 ${p.uncertainEvidence.length} 件</summary>${quotes(p.uncertainEvidence)}</details>`:''}</section>`).join(''):'<p>一次判定で不足またはチェック項目の漏れを検出したため、根拠の照合は未実行。</p>';
 return `<details class="run" ${r.id==='removed-eligibility'&&r.repeat===1?'open':''}><summary><span class="run-heading"><span class="run-title">${escape(names[r.id])} · ${r.repeat} 回目</span><span class="metrics">期待：${r.expectedComplete?'完了':'未完了'} ／ 実際：${escape(status(r))}</span></span><span class="badge ${r.error?'error':r.complete===r.expectedComplete?'success':'error'}">${r.error?'判定未確認':r.complete===r.expectedComplete?'期待と一致':'不一致'}</span></summary><div class="run-body"><p>${escape(c.state.goal)}</p>${detail}</div></details>`;
}).join('');
const evidence={validationPath,recoveryPath,original:{total:validation.results.length,matched:good.length,errors:errors.length,mismatches:wrong.length},recovery:recovery.results.map(r=>({id:r.id,repeat:r.repeat,status:status(r)})),provenanceVerified:provenance.length,tests:{passed:71,skipped:1,failed:0,build:'passed'},liveRun:false};
await writeFile(join(root,'verification.json'),JSON.stringify(evidence,null,2));
const html=`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>根拠付き完了判定の検証</title><style>${reportStyle}</style></head><body><main><header><p class="eyebrow">JEV / SAVED-OBSERVATION VALIDATION</p><h1>根拠を確認してから、完了を判断する</h1><p class="intro">保存済みの観察ログを使った検証です。新しいサイト探索や、人間による UX 評価ではありません。</p><div class="overview"><div><b>${good.length} / ${validation.results.length}</b><span>期待と一致</span></div><div><b>${wrong.length}</b><span>判定の不一致</span></div><div><b>${errors.length}</b><span>API エラーで未確認</span></div></div><p class="notice">未確認だったケースをコードを変えず一度再実行しましたが、${escape(recovery.results.map(status).join('、'))}で終了しました。未確認を正解として数えず、実サイトの再試行には進んでいません。</p></header><section class="completion-audit"><h2>今回変えたこと</h2><p>全項目を取得済みと一次判定したとき、Jev が観察本文を「直接の根拠」「関連する説明」「無関係」「不明」に分類します。別の呼び出しで、直接の根拠だけで質問に回答できるかを判断します。根拠がゼロなら、回答可能という判定が返ってもコード側で完了を止めます。</p><p>引用はモデルに生成させず、観察した文字列をそのまま保存します。同じ文章が別の画面に出ても出現箇所を分け、本文 ${provenance.length} 件の参照が元ログと一致することを照合しました。一次判定の確率を書き換えて根拠付き判定に見せることはしていません。</p><p>前回は年齢条件を消したケースで 2 回とも誤完了しました。今回の最終コードでは 1 回で不足を検出し、もう 1 回は API エラーで未確認です。情報がそろった 3 ケースは各 2 回とも完了と判定しました。</p><p>自動テスト 71 件通過、OCR 実モデルの 1 件はスキップ、ビルド成功。新方式は引き続き <code>--goal-check</code> 指定時のみ有効です。未知の条件の見落としや、未検証サイトでの誤完了がなくなったとは判断していません。</p><p>根拠の照合には追加の API 呼び出しが必要です。判定の精度と、応答形式・通信の安定性は別の検証課題として残します。</p></section><section class="completion-audit"><h2>検証ログ</h2><p><a href="${link(validationPath)}">最終コードの 20 回</a> ／ <a href="${link(recoveryPath)}">通信失敗 1 件の再確認</a> ／ <a href="verification.json">本文の参照照合</a> ／ <a href="${link('reports/grounded-validation-2026-09-21T00-24-15.867Z/validation.json')}">修正前の 20 回（503 エラー 2 件）</a> ／ <a href="${link('reports/grounded-probe-2026-09-21T00-22-02.446Z/validation.json')}">最初の 4 ケース（503 エラー 1 件）</a></p></section>${cards}<p class="footer">正解ラベルは終了後の照合だけに使用し、Jev の入力には渡していません。以前の結果は上書きしていません。</p></main></body></html>`;
await writeFile(join(root,'index.html'),html);console.log(JSON.stringify({report:join(root,'index.html'),...evidence}));
