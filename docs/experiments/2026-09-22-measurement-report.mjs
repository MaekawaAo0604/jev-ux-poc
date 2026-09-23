// Rebuild this measurement report from recorded artifacts. No network or model calls.
import assert from 'node:assert/strict';
import {readFile,writeFile,access} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {reportStyle} from '../../runner/report-style.ts';
import {summarizeReplay} from './2026-09-22-path-metrics.mjs';
const root=resolve('reports/measurement-2026-09-22');
const read=async path=>JSON.parse(await readFile(path,'utf8'));
const [observation,fixtures,scoring,paths,baseline]=await Promise.all([
 read(join(root,'observation-link-source.json')),read(join(root,'observation-fixtures.json')),
 read(join(root,'scoring.json')),read(join(root,'path-metrics.json')),
 read('reports/goal-check-live-2026-09-22T08-39-16.695Z/validation.json'),
]);
const source=await read(scoring.source);
const hashes=[];
for(const [path,expected] of Object.entries(baseline.sourceHashes)){
 const actual=createHash('sha256').update(await readFile(path)).digest('hex');
 assert.equal(actual,expected,`Production changed: ${path}`);hashes.push({path,sha256:actual});
}
assert.equal(createHash('sha256').update(await readFile(scoring.source)).digest('hex'),scoring.sourceHash);
assert.equal(scoring.results.length,scoring.planned.length*scoring.repeats);
const gold=summarizeReplay({results:scoring.results.filter(r=>r.expectedComplete!==null).map(r=>({...r,assessment:{accounting:r.accounting}}))});
assert.equal(gold.recorded,16);assert.equal(gold.transportErrors,0);
assert.equal(gold.requests.missingAccounting,0);

const refs=[{name:'メール・電話で見学予約',terms:['メール','電話','見学予約']},
 {name:'受付時間は店舗ごとに異なる',terms:['スタッフ受付時間','店舗によって異な']}];
const regions=source.steps.flatMap(s=>s.state.screen.regions.map(r=>({step:s.number,id:r.id,text:r.text})));
const referenceMatches=refs.map(ref=>({...ref,matches:regions.filter(r=>ref.terms.every(t=>r.text.includes(t)))}));
const selected=source.steps.find(s=>s.number===12).state.screen.regions;
const quote=id=>selected.find(r=>r.id===id).text;
assert.equal(quote('t6'),'施設の無料見学も可能');
assert.ok(quote('t7').includes('スタッフアワー'));
const inventory=[
 {item:'入会前の施設見学が可能',status:'本文を記録',source:'step-12 / t6,t7',quote:quote('t6'),note:'元の質問の可否に対応する。'},
 {item:'スタッフアワー内に店舗を訪れる方法',status:'本文を記録',source:'step-12 / t7',quote:quote('t7'),note:'来店の案内。予約不要と断定する文はない。'},
 {item:'予約すると案内がスムーズ',status:'本文を記録',source:'step-12 / t7',quote:quote('t7'),note:'予約の具体的な手段が分かることとは別。'},
 {item:'予約するための具体的な手段',status:'この引用では未確認',source:'step-12 / t7',note:'予約推奨からメール・電話・フォームを推測しない。これを元の目的の必須条件に追加したわけではない。'},
];
const keywordExamples=[
 {id:'literal-positive',text:'メールまたは電話で見学予約を承ります。',claimSupported:true},
 {id:'paraphrased-positive',text:'見学の予約は電話か電子メールで受け付けています。',claimSupported:true},
 {id:'negated',text:'メールや電話での見学予約は受け付けていません。店頭でお申し込みください。',claimSupported:false},
 {id:'question-not-answer',text:'メールや電話で見学予約ができるかは、次のページで確認してください。',claimSupported:false},
].map(c=>({...c,legacyMatch:refs[0].terms.every(t=>c.text.includes(t))}));
const controls=observation.live.map(c=>{
 assert.ok(!c.error&&c.menuProbe,'All planned live observations must exist');
 const menu=c.menuSources.find(m=>m.ancestors[0]?.id==='site-menu-btn');assert.ok(menu);
 const links=c.menuProbe.linkLabels.filter(l=>l.inMenu);
 const highschool=links.find(l=>l.text.includes('高校生無料制度'));assert.ok(highschool);
 return {id:c.id,viewport:c.viewport,menuDiscovered:menu.matchedControl,menuClassification:c.menuProbe.productionClassification,
  visibleMenuControlTargets:links.length,labeledMenuTargets:links.filter(l=>l.extracted).length,
  highschoolRawText:highschool.text,highschoolExtracted:highschool.extracted,highschoolAvailable:highschool.available,
  warnings:c.menuProbe.screen.warnings,screenshot:c.menuProbe.screenshot};
});
const modelAccounting=scoring.results.reduce((a,r)=>({logical:a.logical+r.accounting.logicalCalls,attempts:a.attempts+r.accounting.attempts,failedAttempts:a.failedAttempts+r.accounting.failures}),{logical:0,attempts:0,failedAttempts:0});
const measured={measuredAt:new Date().toISOString(),productionUnchanged:true,checkedSourceFiles:hashes,
 controls,inventory,referenceMatches,keywordExamples,newJudgment:gold,newModelAccounting:modelAccounting,
 modelTrialErrors:scoring.results.filter(r=>r.error).map(r=>({id:r.id,repeat:r.repeat,error:r.error})),
 annotationReview:{method:'Second agent reviewed only eight fixture goal/text pairs without reading model results',agreement:'8/8 labels agreed',scope:'Method means ability to explain the application channel/procedure, not having a phone number, address and opening hours ready to execute. No independent human annotation.'},
 boundaries:['New calls judge saved observations and constructed examples; they are not new autonomous site explorations.',
  'Keyword counterexamples concern whether the affirmative reference claim is supported, not whether a yes/no goal is answerable.',
  'The body quotes are real observations; the eight judgment fixtures and ten DOM fixtures are deliberately constructed.',
  'All new site clicks were directed menu toggles after network blocking; form submissions were prohibited.',
  'Repeated measurements on one site/case are not independent population samples.'],
};
await writeFile(join(root,'measurement.json'),JSON.stringify(measured,null,2));
const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct=x=>`${(x*100).toFixed(1)}%`;
const rows=(items,render)=>items.map(render).join('');
const labels={'home-desktop':'トップ / PC','home-mobile':'トップ / スマホ','join-desktop':'入会案内 / PC'};
const prettyNames={
 'available-yes':'見学できると明記','available-no-is-an-answer':'見学できないと明記（否定も回答）',
 'availability-navigation-only':'案内への誘導文だけ','method-phone-explicit':'希望店舗へ電話と明記',
 'method-no-reservation-needed':'予約不要・来店方法を明記','method-cta-only':'申込はこちら、の文字だけ',
 'method-recommended-not-how':'事前予約の推奨だけ','wrong-subject':'法人向け案内を高校生に流用しない',
};
const newCases=scoring.planned.filter(c=>c.expectedComplete!==null).map(c=>{
 const runs=scoring.results.filter(r=>r.id===c.id);
 return {id:c.id,expected:c.expectedComplete,complete:runs.filter(r=>r.complete===true).length,correct:runs.filter(r=>!r.error&&r.complete===c.expectedComplete).length,total:runs.length};
});
const docsLink='../../docs/experiments/2026-09-22-measurement-plan.md';
const html=`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Jev UX · 測定方法の検証</title><style>${reportStyle}
section{margin:36px 0}h2{font-size:23px;margin-bottom:14px}h3{margin-top:22px}li{margin:8px 0}blockquote{border-left:3px solid var(--line);margin:16px 0;padding-left:16px}.table-wrap{overflow:auto}table{border-collapse:collapse;width:100%;min-width:640px;text-align:left}th,td{padding:12px;border-bottom:1px solid var(--line);vertical-align:top}small{display:block;color:var(--muted)}.split{display:grid;grid-template-columns:1fr 1fr;gap:24px}.split img{width:100%;height:auto;border:1px solid var(--line)}.callout{border-left:4px solid var(--ink);padding-left:20px}nav a{display:inline-block;margin:6px 18px 6px 0}code{overflow-wrap:anywhere}details{margin:16px 0}summary{cursor:pointer} @media(max-width:700px){.split{grid-template-columns:1fr}body{padding:24px 16px}h1{font-size:28px}}
</style></head><body><main><header><p class="eyebrow">2026-09-22 / 測定器の診断 / 本番コード変更なし</p><h1>未達を、観察・採点・探索に分けて測る</h1><p class="intro">公開 3 画面の診断、DOM 制御例 10 件、実 Jev 判定 28 試行、既存の探索 3 試行の再集計を実施した。サイトの UX 不良を確定する検証ではない。</p><p class="notice">測定は完了。本番の修正と、修正後の自律探索はまだ行っていない。誤完了を抑える一方で、読める情報を取りこぼす問題が残っている。</p><nav><a href="#observation">操作候補</a><a href="#facts">情報と採点</a><a href="#judgment">判定</a><a href="#paths">探索経路</a><a href="#scope">評価範囲</a></nav></header>
<section id="observation"><h2>1. MENU は候補に入らず、開いた先の文字も落ちる</h2><p><b>測定：</b>画面、操作要素の発見、ラベルの抽出、安全な実行可否の 4 段階を照合した。見える MENU を 3 画面で確認し、既知のメニューを診断用に開いた。クリック前に全通信を遮断した。</p>
<div class="table-wrap" tabindex="0" role="region" aria-label="操作候補の照合"><table><thead><tr><th>画面</th><th>MENU の候補収集</th><th>開いたメニューのラベル取得</th><th>高校生制度のリンク</th></tr></thead><tbody>${rows(controls,c=>`<tr><th>${labels[c.id]}</th><td>${c.menuDiscovered?'検出':'未検出'}</td><td>${c.labeledMenuTargets} / ${c.visibleMenuControlTargets} 要素</td><td>${c.highschoolAvailable?'操作可能':'表示されているが空ラベルで除外'}</td></tr>`)}</tbody></table></div>
<p>MENU は画像を含む <code>div</code> で、現在のボタン・リンク収集条件に含まれない。画像の文字も抽出対象外で、この <code>div</code> は既存の安全な開閉操作の分類にも入らない。前の説明で MENU と結び付けた空ラベルの <code>e1</code> は、実際にはチャットボタンだった。</p>
<p>メニューを開くと高校生制度のリンクが画面に現れる。しかし <code>COMPLEX_PAINT_SKIPPED</code> によって本文とラベルが落ちる。該当リンクには絶対配置の「・」がある。制御例でも「・」を付けたリンクは空ラベル、同じリンクから「・」だけ除いたものは文字を取得できた。</p>
<div class="split"><figure><a href="home-desktop-menu-open.png"><img src="home-desktop-menu-open.png" alt="メニューを開いた実サイト。高校生無料制度へのリンクが表示されている"></a><figcaption>実画面。これは既知の操作による診断であり、Jev の自律探索ではない。</figcaption></figure><div class="callout"><h3>評価</h3><p>入口を検出するだけでは足りない。画像ラベル、開閉操作の安全分類、開いた後の文字抽出を別の回帰テストにする必要がある。</p><p>今回の分母は指定した MENU とメニュー内の操作要素だけ。全サイトのボタン取得率ではない。</p><p><a href="observation-link-source.json">実サイトの照合ログ</a> / <a href="observation-fixtures.json">10 件の制御例</a></p></div></div></section>
<section id="facts"><h2>2. 「本文を見た」と「参照語が一致した」を分ける</h2><p><b>測定：</b>見学の保存ログを項目別に注釈し、原文と画面 12 の位置を照合した。元の質問を超える条件は成功要件として追加していない。</p>
<ul>${rows(inventory,i=>`<li><b>${e(i.item)}：${e(i.status)}</b><small>${e(i.note)} (${e(i.source)})</small></li>`)}</ul>
<blockquote>${e(quote('t7'))}</blockquote><p><a href="../2026-09-22T08-46-15.934Z-public/exploration/step-12.png">対応する保存画面</a></p>
<p>従来の 0/2 は「メール・電話・見学予約」などの参照語が同じ領域に全部含まれるかの結果だった。情報を 0 件取得したという意味ではない。今後の表示名は「参照キーワード一致」に限定するのが妥当。</p>
<details><summary>キーワード集計の制御例 4 件</summary><p>ここでは「メール・電話で見学予約できる」という肯定的な参照命題を測る。可否を質問されたときは「できない」も回答になる、という別の問題とは混同しない。</p><div class="table-wrap"><table><thead><tr><th>入力文</th><th>参照命題を裏付けるか</th><th>旧集計</th></tr></thead><tbody>${rows(keywordExamples,c=>`<tr><td>${e(c.text)}</td><td>${c.claimSupported?'はい':'いいえ'}</td><td>${c.legacyMatch?'一致':'不一致'}</td></tr>`)}</tbody></table></div><p>言い換えを落とし、否定や質問を拾う。情報充足の採点としては使えない。</p></details></section>
<section id="judgment"><h2>3. 項目分割は部分到達を捉えるが、判定器の偽陰性が残る</h2><p><b>測定：</b>同じ保存画面 1・12・24 について、目的を丸ごと 1 項目にした条件と、可否・方法に分けた条件を各 2 回比較した。別に、事前注釈した反例 8 件を各 2 回、本番の判定処理と実 Jev で評価した。</p>
<p>画面 12 は、丸ごと判定では 2/2 回とも採用根拠 0 件。分割すると 2/2 回とも「見学できるか」に根拠 2 件を採用した。「申込方法」は未充足のままで、全体完了にはしていない。画面 24 の分割条件でも可否の根拠を保持できたが、丸ごと条件は 2/2 回とも HTTP 503 で中断し、判定比較から除外した。</p>
<div class="overview"><div><b>${gold.confusion.truePositive} / ${gold.positiveCases}</b><span>答えがある試行を完了と判定</span></div><div><b>${gold.confusion.trueNegative} / ${gold.negativeCases}</b><span>答えがない試行を未完了と判定</span></div><div><b>${gold.confusion.falseNegative}</b><span>答えがあるのに未完了</span></div></div>
<div class="table-wrap" tabindex="0" role="region" aria-label="新しい反例の判定結果"><table><thead><tr><th>制御例</th><th>事前の期待</th><th>完了判断</th><th>期待と一致</th></tr></thead><tbody>${rows(newCases,c=>`<tr><th>${prettyNames[c.id]}</th><td>${c.expected?'回答可能':'情報不足'}</td><td>${c.complete} / ${c.total}</td><td>${c.correct} / ${c.total}</td></tr>`)}</tbody></table></div>
<p>「見学できる」「見学を受け付けない」は、どちらも可否への答えになる。しかし情報の種類を「手順」に分類し、その後に手順の根拠を探して本文を落としていた。「電話で申し込む」は根拠には採用したが、十分性の段階で落ちた。</p>
<p class="notice">8 ケースは 4 正例・4 負例で、2 回ずつ繰り返したもの。16 個の独立したサイトではない。誤完了 0 件だけで判定器を合格にはできない。</p>
<p>「方法」は手段・手順を説明できる水準とし、電話番号・住所・具体的受付時刻まで要求しない。別のエージェントがモデル結果を見ずに 8 ラベルを確認し、すべて同意した。ただし人間による独立評価ではない。元ラベルは変更していない。</p>
<p><a href="scoring.json">全 28 試行と各段階の判断</a> / <a href="measurement.json">注釈・集計・コード照合</a></p></section>
<section id="paths"><h2>4. 探索の脱線と反復を、実行した操作だけで数える</h2><p><b>測定：</b>既存 3 試行を再集計した。未実行の最終判断を除き、スクロールはページ再訪に数えない。操作の次に観察した画面内テキストについて、過去にない文字列が増えたかも記録した。以下の表にはヘッダー、フッター、ナビゲーションも含む。</p>
<div class="table-wrap" tabindex="0" role="region" aria-label="探索経路の再集計"><table><thead><tr><th>試行</th><th>実行操作</th><th>健康記事内</th><th>再訪到着 / URL 遷移</th><th>新規文字列 0 の操作</th></tr></thead><tbody>${rows(paths.trials,(r)=>`<tr><th>${r.id==='anytime-tour'?'見学':'高校生制度 '+r.repeat}</th><td>${r.executedActions}</td><td>${r.magazineActions.count} / ${r.executedActions} (${pct(r.magazineActions.rate)})</td><td>${r.revisitArrivals} / ${r.transitions}</td><td>${r.actionsWithZeroNewText} / ${r.actionsWithObservedOutcome}</td></tr>`)}</tbody></table></div>
<p>見学では入会案内から店舗一覧へ進み、戻る経路を繰り返した。最後の 5 操作は新規文字列 0。高校生制度は 2 回とも健康記事内の操作が全体の約 4 割を占めた。</p><p>再訪は必要な場合があり、新規文字列には見出しや切れた文章も含まれる。「新規文字列 0」は無駄の確定ではなく、停滞を調べる手掛かり。健康記事の URL も目的外と断定するための正解ラベルにはしない。</p><p><a href="path-metrics.json">定義・分母・全操作の集計</a> / <a href="../goal-check-live-2026-09-22T08-39-16.695Z/index.html">元の操作経路</a></p></section>
<section id="scope"><h2>5. 判定、探索、通信を別集計にする</h2><ul><li>以前の保存ログ判定：正例 6/6、負例 10/10。作り込んだ 16 ケースへの一致であり、汎用性能ではない。</li><li>今回の新しい判定例：${gold.confusion.truePositive}/${gold.positiveCases} の正例、${gold.confusion.trueNegative}/${gold.negativeCases} の負例に一致。以前の高い一致率では見えていなかった取りこぼしを確認した。</li><li>既存の自律探索：モデル完了 0/3。独立した客観判定は未実施のため、客観成功率は未算出。</li><li>今回のモデル測定：${scoring.results.length} 試行、${modelAccounting.logical} 論理呼び出し、再試行込み ${modelAccounting.attempts} 回。通信失敗は延べ ${modelAccounting.failedAttempts} 回。28 試行中 2 試行（同じ条件の 2 反復）は回復せず HTTP 503 で終了した。疎通確認の 1 呼び出しは別。</li><li>本番コード ${hashes.length} ファイルのハッシュは前回最終試行と一致。比較中の修正はない。</li></ul></section>
<section><h2>測定方法の評価と次の修正順</h2><ol><li><b>操作候補：</b>候補数だけでは不足。見える重要操作の発見率、ラベル取得、安全分類を別々に測る。まず MENU と開いたメニューの 2 段階の欠落を直す。</li><li><b>採点：</b>キーワード一致は検索補助に限定。目的の小項目ごとに、原文・取得位置・採否・未確認内容を表示する。</li><li><b>完了判定：</b>可否を手順にすり替えない。「できない」という回答も含め、誤完了と取りこぼしの両方を回帰試験にする。</li><li><b>探索：</b>新規情報の増分と反復を併記し、候補取得を直した後に同条件で再探索する。今回の数字だけでは探索方針修正の効果を主張しない。</li></ol><p>既知の経路を使ったメニュー診断や保存ログの再判定を、新規自律探索の成功として数えていない。サイトへの申込み・問い合わせ・公開は行っていない。</p><p><a href="${docsLink}">測定計画</a> / <a href="../../docs/experiments/2026-09-22-measurement-report.mjs">レポート再生成スクリプト</a></p></section>
</main></body></html>`;
await writeFile(join(root,'index.html'),html);
for(const c of controls)await access(join(root,c.screenshot));
console.log(JSON.stringify({report:join(root,'index.html'),productionUnchanged:hashes.length,controls:controls.map(c=>({id:c.id,labeled:c.labeledMenuTargets,targets:c.visibleMenuControlTargets})),newJudgment:gold.confusion,modelAccounting}));
