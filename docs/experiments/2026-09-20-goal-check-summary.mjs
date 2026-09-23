// Offline post-run comparison. Reference terms below are never sent to Jev.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
const root=resolve(process.argv[2]||'');assert.ok(process.argv[2],'Pass completed live batch directory');
const json=async file=>JSON.parse(await readFile(file,'utf8'));
const manifest=await json(join(root,'validation.json'));assert.equal(manifest.codeUnchanged,true);assert.equal(manifest.cases.length,3);
const negativePath='reports/goal-check-validation-2026-09-20T11-35-17.953Z/validation.json';
const negative=await json(negativePath);
const facts={
 'anytime-highschool':[
  {name:'保護者の会員条件',terms:['保護者','エニタイムメンバー']},
  {name:'年齢と高校在学の条件',terms:['15歳以上18歳以下','高校在学期間']},
  {name:'利用できる時間帯',terms:['利用できるのは','スタッフアワー内のみ']},
  {name:'利用できる店舗',terms:['利用できるのは','保護者の登録店舗のみ']},
  {name:'保護者の退会・移籍時の制限',terms:['保護者が退会','移籍','利用不可']},
 ],
 'anytime-tour':[
  {name:'メール・電話で見学予約',terms:['メール','電話','見学予約']},
  {name:'受付時間は店舗ごとに異なる',terms:['スタッフ受付時間','店舗によって異な']},
 ],
};
const checked=[];
for(const c of manifest.cases){
 const result=await json(c.resultPath);
 const observedFacts=facts[c.id].map(f=>({...f,matches:result.steps.flatMap(s=>(s.state.screen.regions||[]).filter(r=>f.terms.every(term=>r.text.includes(term))).map(r=>({step:s.number,region:r.id,text:r.text,screenshot:join(result.dir,s.screenshot)})))}));
 checked.push({id:c.id,repeat:c.repeat,reason:result.reason,actionCount:result.actionCount,observedFacts,allReferenceFactsRecorded:observedFacts.every(f=>f.matches.length),goalAssessment:result.steps.at(-1)?.decision?.goalAssessment,completionAudit:result.completionAudit});
}
const evidence={checkedAt:new Date().toISOString(),type:'offline-reference-text-check',notHumanParticipantStudy:true,tests:{pass:63,skip:1,fail:0,build:'passed'},live:checked,negativeValidation:negativePath,negativeFailures:negative.results.filter(r=>r.error||r.complete!==r.expectedComplete).map(r=>({id:r.id,repeat:r.repeat,expectedComplete:r.expectedComplete,actualComplete:r.complete})),notes:['参照条件は探索終了後の文字列照合にだけ使用。Jevには渡していない','文字列の一致は人間によるUX評価と区別する','元のobjectiveSuccess:nullと実行結果は変更しない']};
await writeFile(join(root,'verification.json'),JSON.stringify(evidence,null,2));
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const link=p=>relative(root,resolve(p)).replaceAll('\\','/');
const highschool=checked.filter(c=>c.id==='anytime-highschool');
const completed=highschool.filter(c=>c.reason==='JEV_DONE'&&c.allReferenceFactsRecorded).length;
const disagreed=checked.filter(c=>c.reason==='JEV_DONE'&&c.completionAudit?.assessment!=='supported');
const intro=`<section class="completion-audit"><h1>項目別の到達判定を追加して再検証</h1>
<p>高校生の制度は、${highschool.length} 回中 ${completed} 回で、参照条件に対応する本文の取得と Jev の完了判断を両方確認できました。新しいセッションから各回 24 操作まで実行し、途中でコードは変更していません。</p>
<ul>${checked.map(c=>`<li>${c.id==='anytime-highschool'?'高校生向け制度':'見学方法'}・${c.repeat} 回目：${c.actionCount} 操作、${escape(c.reason)}。参照条件の本文は${c.allReferenceFactsRecorded?'すべて記録あり':'不足あり'}。</li>`).join('')}</ul>
<h2>変えた判断処理</h2><p>「制度の対象条件」「利用できる店舗」「時間帯」をそれぞれ判断します。項目の網羅性を確認し、すべて取得済みなら追加操作をせず終了します。不足があれば、その項目を次の操作判断に渡します。設定したのは目的文の抜き出しであり、年齢や店名などの正解や操作手順ではありません。</p>
<p>レポートに各項目の取得状況を表示し、操作選択の確率とは分けて記録します。自動テスト 63 件通過、OCR 実モデルの 1 件スキップ、ビルド成功。既定は従来方式のままで、<code>--goal-check</code> を指定したときだけ新方式を使います。</p>
${disagreed.length?`<p>終了後に従来の一括質問で根拠を確認した結果は、${disagreed.length} 件で項目別の完了判断と一致しませんでした。本文の記録、探索中の判断、終了後の再評価を分けて掲載しています。</p>`:''}
<h2>残る誤完了</h2><p class="notice">不足情報をわざと作った保存ログの検証では、年齢条件を消したケースで ${evidence.negativeFailures.filter(r=>r.id==='removed-eligibility').length} 回、誤って完了と判断しました。大まかな「対象条件」の完全性は保証できません。今回の到達結果から、任意のサイトで安定して正しく終了できるとは結論づけません。</p>
<p>旧方式は、同じ取得済み本文を履歴に復元した比較でも終了せず探索を続けました。項目別判定では取得済みを認識できましたが、未取得の一部を見落とす問題は残っています。これは判断方式の検証であり、サイトの欠陥の判定ではありません。</p>
<p><a href="verification.json">参照条件と観察本文の照合</a> ／ <a href="validation.json">実行条件とコードの記録</a> ／ <a href="${link(negativePath)}">誤完了を含む保存ログ検証</a> ／ <a href="${link('reports/resolution-2026-09-20/index.html')}">以前の結果</a></p></section>`;
const html=await readFile(join(root,'index.html'),'utf8');assert.ok(!html.includes('項目別の到達判定を追加して再検証'),'Do not duplicate the summary');await writeFile(join(root,'index.html'),html.replace('<main>',`<main>${intro}`));
console.log(JSON.stringify({report:join(root,'index.html'),highschoolCompleted:completed,total:highschool.length,checks:checked.map(({id,repeat,reason,allReferenceFactsRecorded})=>({id,repeat,reason,allReferenceFactsRecorded}))}));
