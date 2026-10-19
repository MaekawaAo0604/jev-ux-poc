// Local evidence review. Raw model verdicts and original source files stay unchanged.
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {report} from '../../runner/report.js';
const root=resolve('reports/tight-menu-completion-review-2026-10-19');
await mkdir(root,{recursive:true});
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const esc=(x:unknown)=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const local=(p:string)=>relative(root,resolve(p)).replaceAll('\\','/').split('/').map(encodeURIComponent).join('/');
const read=async(p:string)=>JSON.parse(await readFile(p,'utf8'));
const pinned:Record<string,string>={
 'jev/image-only-input.ts':'649ecbdcbc7ff10c561ce6d301c1d044bce420c5f158958aca36dacfa4efbb14',
 'jev/visual-context.ts':'3ab3b4a69d8e650734055e2788562ffb7d8354e7ed37a947e3a524105f32638b',
 'pages/visual-numbering.ts':'ddce4801f03206edde19a909eab1651d2447bb04dc0906b12b30a39d308adc61',
 'tests/completion-proof.test.ts':'21b5c1eec69876caeb927e89245a9048291d2fbdacc59ca4c3b4fde5694f5ee0',
 'tests/fixtures/image-memory-provider.mjs':'8d9e06488915b94d8ac3b22cd515d1366037154fccb63f1d5d95de9694d280b9',
 'tests/vision-numbering.test.ts':'9aa8b5cc8e91a7f8bd0c4f0185b55fb38878602f3019a082d3fe8f0f160ce523',
 'tests/vision.test.ts':'acf4739dfa14885fa91d4ac966d249bcd9e3a5e911d9d9b299ff260fc890bf07',
};
for(const [p,h] of Object.entries(pinned))assert.equal(sha(await readFile(p)),h,`CODE_CHANGED: ${p}`);
const cases=[
 {id:'library-card',repeat:1,root:'reports/2026-10-19T07-52-42.271Z-public',images:['step-4.png','step-5.png','step-6.png'],note:'1 と 2 の持参を求める画面で 1 しか見えていないとき、coverage=complete でも boundary=open として終了を阻止した。次に 2 の申請書を表示し、さらにスクロールしてから終了した。'},
 {id:'library-card',repeat:2,root:'reports/2026-10-19T07-53-31.637Z-public',images:['step-4.png','step-5.png','step-6.png'],note:'新規ブラウザの再試行でも、部分表示時の complete を阻止し、2 の申請書を表示してから終了した。'},
 {id:'software-license-formats',repeat:1,root:'reports/2026-10-19T07-54-19.330Z-public',images:['step-1.png'],note:'商用利用と圧縮形式が最初の画像に揃っている。boundary=closed と判断し、追加操作なしで終了した。'},
 {id:'museum-family',repeat:1,root:'reports/2026-10-19T07-54-39.506Z-public',images:['step-4.png'],note:'体験作品の説明と「遊べるのは小学生まで」「雨の日もだよ」を表示した。Goal にない残りの注意事項の全読は要求しなかった。営業日の例外などを網羅した確認ではない。'},
];
const sources:{file:string;sha256:string}[]=[];
async function remember(file:string){await access(file);const bytes=await readFile(file);sources.push({file,sha256:sha(bytes)});return bytes;}
const results=[],runs=[];
for(const c of cases){
 const dir=resolve(c.root,'exploration'),r=JSON.parse((await remember(join(dir,'result.json'))).toString());
 await remember(join(dir,'action-trace.json'));for(const img of c.images)await remember(join(dir,img));
 const checks=r.steps.flatMap((s:any)=>(s.visualContext?.requests??[]).filter((q:any)=>q.step===s.number&&q.completionBoundary).map((q:any)=>({step:s.number,choice:s.decision?.choice,coverage:q.answers?.completionCoverage?.choice,boundary:q.completionBoundary.choice,sourceIds:q.completionBoundary.sourceIds,evidenceGuard:s.decision?.completionCheck?.evidenceGuard??s.decision?.completion?.evidenceGuard})));
 assert.equal(r.reason,'JEV_DONE');assert.equal(r.objectiveSuccess,null);assert.equal(r.steps.filter((s:any)=>s.error).length,0);
 if(c.id==='library-card'){
  assert.equal(r.steps[3].decision.choice,'scroll_down');
  assert.ok(checks.some((q:any)=>q.step===4&&q.coverage==='complete'&&q.boundary==='open'));
 }
 runs.push({...c,reason:r.reason,actions:r.actionCount,elapsedMs:r.elapsedMs,objectiveSuccess:r.objectiveSuccess,checks});
 results.push({...r,dir,variant:c.id,repeat:c.repeat});
}
const menuDir='reports/tight-menu-pair-2026-10-19T07-44-27.363Z',menu=await read(`${menuDir}/probe.json`),execution=await read(`${menuDir}/execution.json`);
for(const v of menu.responses){assert.equal(v.response.answers.faq.choice,v.variant==='before'?'e3':'e4');assert.equal(v.response.answers.download.choice,v.variant==='before'?'e2':'e3');}
assert.equal(execution.chosen,'e4');assert.equal(execution.urlAfter,'https://www.7-zip.org/faq.html');
for(const f of ['probe.json','execution.json','plain.png','before.png','after.png','selected-destination.png'])await remember(`${menuDir}/${f}`);
const first='reports/completion-boundary-pair-2026-10-19T07-48-14.725Z',final='reports/completion-boundary-pair-2026-10-19T07-49-05.089Z';
const failedPositive=await read(`${first}/positive.json`),boundary=await read(`${final}/probe.json`),positive=await read(`${final}/positive.json`);
assert.equal(failedPositive.positives.length,3);for(const p of failedPositive.positives)assert.equal(p.response.answers.completionBoundary.choice,'open');
for(const p of boundary.responses.filter((r:any)=>r.variant==='after'))assert.equal(p.response.answers.completionBoundary.choice,'open');
assert.equal(positive.positives.length,3);for(const p of positive.positives)assert.equal(p.response.answers.completionBoundary.choice,'closed');
for(const d of [first,final])for(const f of ['probe.json','positive.json'])await remember(`${d}/${f}`);
for(const p of positive.sources)await remember(p);
const testFile='reports/tight-menu-completion-final-tests-2026-10-19.log',test=(await remember(testFile)).toString('utf8');
const count=(key:string)=>{const m=test.match(new RegExp(`(?:ℹ |# )${key} (\\d+)`));assert.ok(m,`MISSING_TEST_SUMMARY: ${key}`);return Number(m[1]);};
const tests={total:count('tests'),pass:count('pass'),fail:count('fail'),skip:count('skipped')};assert.equal(tests.fail,0);
const buildFile='reports/tight-menu-completion-final-build-2026-10-19.log',build=(await remember(buildFile)).toString();assert.match(build,/built in/);
const limitations=[
 '4 試行は小標本であり、人間の利用者を対象にした UX 評価や成功率ではない。JEV_DONE と終了後の画像監査はモデル判断として残し、objectiveSuccess は null のまま。',
 '番号の対照実験は同一ページの旧描画と新描画を比較した 3 組。選択した FAQ の操作確認は 1 回。元の複合 Goal 全体を再実行した結果ではない。',
 '一覧の保存画像実験は再構成した文脈による切り分けであり、過去 API リクエストの完全再送ではない。正例は独立した 2 画像の対照。最初の案が正例を 3 回とも拒否した記録も保存した。',
 '欠落チェック自体も Jev の判断。列挙を読み落とす場合、一覧ではない複合条件、選択されなかった過去画像の情報欠落は残る。',
 '長い説明ページの往復スクロールは未解決。前回の中断試行では後に別経路も試しており、永久ループとは断定できない。この修正の解決済み項目には含めない。',
 '操作判断は現在画像 1 枚のまま。今回の追加質問は --image-memory-proof の完了照合だけに入る。同じ選択済み根拠画像と API 呼出しを再利用し、OCR、DOM 本文、正解経路は追加していない。',
 '外部サイトは既存の規約点検記録に基づく低頻度の閲覧限定検証。明示許諾を得たという意味ではない。画像と生返答はローカル保管し、外部公開しない。',
];
const policies=['docs/experiments/2026-10-19-cross-site-protocol.json','docs/experiments/2026-10-19-cross-site-software-protocol.json','docs/experiments/2026-10-19-real-goals-v2.json'];
for(const p of policies)await remember(p);
const summary={baseCommit:'b2b291e',codeSha256:pinned,settings:{model:'jev-1.14.0',viewport:{width:1440,height:1000},locale:'ja-JP',sequential:true,intervalMs:2000,maxActions:0,flags:['--reviewed','--vision','--image-only','--image-memory','--image-memory-proof']},policies,runs,tests,focusedTests:{total:51,pass:51,fail:0},probes:{menuDir,firstBoundary:first,finalBoundary:final},limitations,sources};
await report(root,results);
const evidenceLink=(p:string,label:string)=>`<a href="${local(p)}">${esc(label)}</a>`;
const notes=`<section class="notice" id="fix-review"><h2>修正と検証</h2><p>小さい縦メニューの番号ずれと、一覧を途中まで見て終了する問題を修正した。元の探索判断は書き換えず、下に実行記録を残す。</p><h3>番号の対応</h3><p>16 px 高のリンクにも 26 px 高の番号を置いていたため、衝突を避けた番号が次の行へずれた。行の高さに番号を合わせ、空いている左右へ同じ行で配置する。</p><p>同一ページの対照 3 組で、旧描画は FAQ=e3・Download=e2、新描画は FAQ=e4・Download=e3。実際に e4 を操作し FAQ に到達した。</p>${evidenceLink(`${menuDir}/before.png`,'旧描画')} / ${evidenceLink(`${menuDir}/after.png`,'新描画')} / ${evidenceLink(`${menuDir}/probe.json`,'返答原本')} / ${evidenceLink(`${menuDir}/execution.json`,'実操作')}<h3>一覧の欠落チェック</h3><p>全体の coverage とは別に、画像が明示する必須の列挙に未表示項目が残るかを照合する。open・uncertain・返答欠落では完了を許可しない。Goal にない別手続や配布ファイルの閲覧は要求しない。</p><p>最初の案は必要情報が揃う正例も 3 回とも拒否した。質問を絞った最終案では、部分表示を 3 回とも open、2 画像で揃う正例を 3 回とも closed とした。</p>${evidenceLink(`${first}/positive.json`,'最初の案の誤拒否')} / ${evidenceLink(`${final}/probe.json`,'部分表示の対照')} / ${evidenceLink(`${final}/positive.json`,'必要項目が揃う対照')}<h3>本番処理の再探索</h3><ul>${runs.map(r=>`<li><strong>${esc(r.id)} / ${r.repeat} 回目</strong><p>${esc(r.note)}</p><p>${r.actions} 操作、${(r.elapsedMs/1000).toFixed(1)} 秒。元の終了理由: ${esc(r.reason)}。</p>${r.images.map(f=>evidenceLink(join(r.root,'exploration',f),f)).join(' / ')}</li>`).join('')}</ul><h3>回帰確認</h3><p>全テスト ${tests.total} 件。PASS ${tests.pass}、FAIL ${tests.fail}、SKIP ${tests.skip}。関連テストは別実行で 51 件 PASS。ビルドも通過。</p>${evidenceLink(testFile,'全テストのログ')} / ${evidenceLink(buildFile,'ビルドのログ')}<h3>未解決と検証範囲</h3><ul>${limitations.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><p>${evidenceLink('docs/experiments/2026-10-19-cross-site-protocol.json','図書館の事前確認')} / ${evidenceLink('docs/experiments/2026-10-19-cross-site-software-protocol.json','7-Zip の事前確認')} / <a href="summary.json">ハッシュと測定値</a></p></section>`;
const html=await readFile(join(root,'index.html'),'utf8');await writeFile(join(root,'index.html'),html.replace('</header>',`</header>${notes}`));
for(const s of sources)assert.equal(sha(await readFile(s.file)),s.sha256,`SOURCE_CHANGED: ${s.file}`);
await writeFile(join(root,'summary.json'),JSON.stringify({...summary,originalsUnchanged:true},null,2));
// Keep the concise, reproducible measurements in Git; screenshots/raw responses stay local.
await writeFile('docs/experiments/2026-10-19-tight-menu-completion-results.json',JSON.stringify({...summary,originalsUnchanged:true},null,2));
console.log(JSON.stringify({root,tests,runs:runs.map(({id,repeat,actions,elapsedMs})=>({id,repeat,actions,elapsedMs})),originalsUnchanged:true}));
