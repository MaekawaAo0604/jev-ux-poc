// Offline assembly of both resolved and unresolved results. No model/browser calls.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
import {report} from '../../runner/report.ts';
const readJSON=async file=>JSON.parse(await readFile(file,'utf8'));
const firstRoot='reports/remaining-2026-09-20T10-35-46.791Z';
const finalRoot=process.argv[2],replayPath=process.argv[3];
assert.ok(finalRoot&&replayPath,'Pass final validation directory and saved-state replay JSON');
const initial=await readJSON(join(firstRoot,'validation.json')),final=await readJSON(join(finalRoot,'validation.json'));
assert.equal(initial.codeUnchanged,true);assert.equal(final.codeUnchanged,true);
const tour=await readJSON(initial.cases.find(c=>c.id==='anytime-tour').resultPath);
const highschool=await readJSON(final.cases.find(c=>c.id==='anytime-highschool').resultPath);
const auditReplay=await readJSON(join(firstRoot,'museum-audit-replay.json'));
const promptReplay=await readJSON(replayPath);
assert.equal(tour.reason,'JEV_DONE');assert.equal(tour.completionAudit.status,'RECORDED');
assert.equal(highschool.reason,'LOOP');assert.equal(highschool.perceivedSuccess,false);
for(const result of [tour,highschool]){assert.equal(result.objectiveSuccess,null);assert.equal(result.fake,false);}
assert.equal(auditReplay.audit.status,'RECORDED');
assert.equal(promptReplay.navigationRepeated,false);assert.equal(promptReplay.results.length,8);
const recovered=promptReplay.results.filter(r=>r.decision?.request?.attempts>1);
const navChoices=promptReplay.results.filter(r=>r.case==='navigation').map(r=>r.decision?.choice);
const completionChoices=promptReplay.results.filter(r=>r.case==='completion').map(r=>r.decision?.choice);
assert.ok(navChoices.every(c=>c==='e3'));assert.ok(completionChoices.every(c=>c==='scroll_down'));
const verify=(result,requirements)=>requirements.map(({fact,terms})=>{
 const matches=result.steps.flatMap(s=>(s.state.screen.regions||[]).filter(r=>terms.every(term=>r.text.includes(term))).map(r=>({step:s.number,id:`s${s.number}-${r.id}`,text:r.text})));
 assert.ok(matches.length,`Missing recorded fact: ${fact}`);return {fact,matches};
});
const checkedTour=verify(tour,[{fact:'希望店舗へメールまたは電話で見学予約できる',terms:['メール','電話','見学予約']},{fact:'スタッフ受付時間は店舗によって異なる',terms:['スタッフ受付時間','店舗によって異な']}]);
const earlierHighschoolPath='reports/2026-09-20T10-39-44.860Z-public/exploration/result.json';
const earlierHighschool=await readJSON(earlierHighschoolPath);
const checkedEarlierHighschool=verify(earlierHighschool,[{fact:'保護者が会員',terms:['保護者','エニタイムメンバー']},{fact:'高校在学期間中の15歳以上18歳以下',terms:['15歳以上18歳以下','高校在学期間']},{fact:'利用はスタッフ受付時間内のみ',terms:['利用できるのは','スタッフアワー内のみ']},{fact:'利用は保護者の登録店舗のみ',terms:['利用できるのは','保護者の登録店舗のみ']},{fact:'保護者が退会・移籍すると利用できない',terms:['保護者が退会','移籍','利用不可']}]);
const root=resolve('reports','resolution-2026-09-20');await mkdir(root,{recursive:true});
const review={verifiedAt:new Date().toISOString(),overallStatus:'PARTIALLY_RESOLVED',testResult:{passed:55,skipped:1,failed:0,skipReason:'opt-in real OCR integration',build:'passed'},sourceBatches:[firstRoot,finalRoot],auditReplay:join(firstRoot,'museum-audit-replay.json'),promptReplay:replayPath,checkedTour,checkedEarlierHighschool:{source:earlierHighschoolPath,notLatestRun:true,reason:earlierHighschool.reason,facts:checkedEarlierHighschool,screenshotReview:'Codex inspected saved step-14.png and step-15.png; not a human participant study'},latestHighschool:{reason:highschool.reason,actionCount:highschool.actionCount,objectiveSuccess:highschool.objectiveSuccess},limits:['段階的な修正であり、同一コードでの成功率ではない','上限12操作から24操作へ変更','Jevの完了と事後の根拠選択は客観的成功と区別','画像だけの操作は未対応。サイトの欠陥とは判定しない','保存画面の再評価は新しいサイト探索ではない'],earlierIncompleteTrials:['reports/2026-09-20T10-39-44.860Z-public/index.html','reports/2026-09-20T10-51-54.680Z-public/index.html','reports/2026-09-20T10-56-09.556Z-public/index.html']};
await writeFile(join(root,'verification.json'),JSON.stringify(review,null,2));
await report(root,[tour,highschool]);
const link=path=>relative(root,resolve(path)).replaceAll('\\','/');
const intro=`<section class="completion-audit">
<h1>不具合修正後の結果：高校生の制度探索は未解決</h1>
<p>見学方法の探索と、博物館の根拠確認は正常に終了しました。高校生向け制度は、最新の実行でも Jev が店舗検索へ戻り、巡回して停止しました。</p>
<ul>
<li>見学方法：${tour.actionCount} 操作で Jev が完了と判断。メール・電話での予約方法と受付時間の注意書きをログと保存画面で確認。</li>
<li>高校生向け制度：${highschool.actionCount} 操作後に巡回停止。最新の実行では完了していない。</li>
<li>博物館の開館案内：保存済み観察ログの根拠確認だけを再実行し、正常終了。サイトは再訪していない。</li>
</ul>
<h2>修正し、テストした点</h2>
<ul>
<li>過去に観察した本文と読み取り警告を履歴へ保存。未表示の文章や正解は渡さない。</li>
<li>文字を取得できない画像リンクを空欄の選択肢にしない。未対応として記録。</li>
<li>文書切り替え中は本文の準備を待ち、観察だけを回数制限付きで再試行。</li>
<li>API の一時エラーを最大 2 回再試行。認証エラーや不正な返答は再試行せず区別。</li>
<li>操作上限ちょうどの操作後も観察・判断し、追加の操作は実行しない。</li>
</ul>
<p>自動テスト 55 件通過、失敗 0 件、OCR 実モデルの 1 件のみスキップ。ビルド成功。保存画面の比較中にもタイムアウトが ${recovered.length} 件発生し、再試行で復帰しました。</p>
<h2>残っている判断の問題</h2>
<p>同じ保存画面を使い、新旧 2 種類の指示文をそれぞれ 2 回比較しました。制度ページの入り口では 4 回とも店舗検索を選びました。また、以前の実行で条件と利用制限を観察した場面に、実際の観察本文を履歴として復元しても、4 回とも終了せず下へスクロールしました。指示文の長さだけが原因とは確認できません。</p>
<p>以前の試行では必要情報を観察していますが、今回の巡回を成功扱いにはしません。次に比較検証する候補は、完了の判断と次の操作の選択を別の質問にする方式です。現時点では未実装であり、改善効果も未確認です。</p>
<p class="notice">Jev の判断結果を人間の使いやすさやサイトの欠陥と同一視しません。途中でコードと操作上限を変えているため、同一条件での成功率でもありません。画像やログはローカル検証用です。</p>
<p><a href="verification.json">検証メモ</a> ／ <a href="${link(replayPath)}">指示文比較の全 8 判断</a> ／ <a href="${link(review.auditReplay)}">博物館の根拠確認</a></p>
<p>途中の失敗も保存：<a href="${link(review.earlierIncompleteTrials[0])}">履歴修正前の巡回</a> ／ <a href="${link(review.earlierIncompleteTrials[1])}">本文読み取りの例外</a> ／ <a href="${link(review.earlierIncompleteTrials[2])}">空欄リンクでの巡回</a>。</p>
</section>`;
const html=await readFile(join(root,'index.html'),'utf8');await writeFile(join(root,'index.html'),html.replace('<main>',`<main>${intro}`));
console.log(JSON.stringify({report:join(root,'index.html'),status:review.overallStatus,tourActions:tour.actionCount,highschoolReason:highschool.reason}));
