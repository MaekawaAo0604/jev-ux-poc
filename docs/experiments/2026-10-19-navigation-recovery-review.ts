import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {report} from '../../runner/report.js';

const root=resolve('reports/navigation-recovery-review-2026-10-19');await mkdir(root,{recursive:true});
const runRoots=process.argv.slice(2);assert.ok(runRoots.length,'Pass completed final-code report roots');
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const sources:{file:string;sha256:string}[]=[];
async function source(file:string){const b=await readFile(file);sources.push({file,sha256:hash(b)});return b;}
const esc=(s:unknown)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const link=(file:string,label:string)=>`<a href="${relative(root,resolve(file)).replaceAll('\\','/').split('/').map(encodeURIComponent).join('/')}">${esc(label)}</a>`;
const codeSha256={
 'runner/public-navigation.ts':'99ee9580b13f17d335e11265dc9df9ca1530844ef9d264cd34471d71fe636e56',
 'runner/public-site.ts':'9d3b504db01819d3d65879a9ccaf669e8b46364386bf3c17ada498c82c653ce8',
 'tests/navigation-transport.test.ts':'cad7527b41505a2b5dedb048590a7b595deffa2718831d9d5ea852d653465fe1',
 'tests/navigation-cli-recovery.test.ts':'ae46cc417f7f935f6a9d4f2e69e80680c257583b3e54d3a9bf399245375c823a',
 'tests/fixtures/navigation-provider.mjs':'846cbfd3ba1bac92e774ac9a7d0b172d33ecfb54a4140b7356697043380b538a',
};
for(const [file,sha] of Object.entries(codeSha256))assert.equal(hash(await readFile(file)),sha,`CODE_CHANGED: ${file}`);

const baselineRoot='reports/2026-10-19T10-04-56.654Z-public',baselineDir=join(baselineRoot,'exploration');
assert.ok(!(await readdir(baselineDir)).includes('result.json'),'baseline was an experimenter abort, not a model ending');
const diagnosticLog='reports/navigation-diagnostic-baseline-2026-10-19.log';
assert.match((await source(diagnosticLog)).toString(),/NAVIGATION_DIAGNOSTIC .*socket hang up/);
const failed=JSON.parse((await source(join(baselineDir,'step-23.json'))).toString());
assert.equal(failed.result,'ACTION_ERROR');assert.match(failed.error,/navigation request failed \(UNKNOWN\)/);
const baseline={root:baselineRoot,status:'EXPERIMENTER_ABORTED',modelEnding:null,failedStep:23,error:failed.error,rawTransportMessage:'apiRequestContext.get: socket hang up',observations:(await readdir(baselineDir)).filter(x=>/^step-\d+\.json$/.test(x)).length,diagnosticLog};

const results:any[]=[],runs:any[]=[];
for(const [index,runRoot] of runRoots.entries()){
 const dir=join(runRoot,'exploration'),r=JSON.parse((await source(join(dir,'result.json'))).toString());
 await source(join(dir,'action-trace.json'));assert.equal(r.objectiveSuccess,null);
 const events=r.navigationRequests??[];
 assert.ok(events.every((e:any)=>['retry','recovered','failed'].includes(e.phase)&&Number.isInteger(e.attempt)));
 const recoveryEvidence=[];
 for(const event of events.filter((e:any)=>e.phase==='recovered')){
  const after=r.steps.find((s:any)=>s.number===event.step+1);assert.ok(after?.screenshot,'post-recovery observation missing');
  const file=join(dir,after.screenshot),bytes=await source(file);
  assert.equal(hash(bytes),after.visualObservation.sha256,'post-recovery image must match the captured observation hash');
  recoveryEvidence.push({step:event.step,nextObservationStep:after.number,file,sha256:hash(bytes)});
 }
 const repairs=r.steps.filter((s:any)=>s.recordedAction?.execution?.url==='https://www.7-zip.org/recover.html').map((s:any)=>({step:s.number,result:s.result,navigationRequests:s.navigationRequests??[]}));
 const errors=r.steps.filter((s:any)=>s.error).map((s:any)=>({step:s.number,result:s.result,error:s.error}));
 runs.push({root:runRoot,goal:r.goalText,reason:r.reason,objectiveSuccess:r.objectiveSuccess,actions:r.actionCount,elapsedMs:r.elapsedMs,navigationRequests:events,recoveryEvidence,repairNavigations:repairs,errors});
 results.push({...r,dir:resolve(dir),variant:'修正後',repeat:index+1});
}
assert.ok(runs.some(r=>r.navigationRequests.some((e:any)=>e.phase==='recovered')),'live recovery evidence required, not just an error-free run');
assert.ok(runs.some(r=>r.repairNavigations.some((s:any)=>s.result==='OK')),'repair page must actually have opened in the live validation');
const testFile='reports/navigation-fix-tests-2026-10-19.log',testLog=(await source(testFile)).toString();
const count=(key:string)=>{const m=testLog.match(new RegExp(`(?:ℹ |# )${key} (\\d+)`));assert.ok(m,`MISSING_SUMMARY: ${key}`);return Number(m[1]);};
const tests={total:count('tests'),pass:count('pass'),fail:count('fail'),skip:count('skipped')};assert.equal(tests.fail,0);assert.equal(tests.total,tests.pass+tests.skip);
const buildFile='reports/navigation-fix-build-2026-10-19.log';assert.match((await source(buildFile)).toString(),/built in/);
await source('docs/experiments/2026-10-19-cross-site-software-protocol.json');
await source('reports/navigation-fix-live-1-2026-10-19.log');
await source('reports/navigation-fix-live-2-2026-10-19.log');
const limitations=[
 '接続を切った主体（配信元、途中のネットワーク等）は未特定。今回、API 取得層で socket hang up が生じることと、分類漏れを確認した。以前の全 UNKNOWN が同じ原因だったとは断定しない。',
 '通信の復旧と Goal 達成は別。JEV_DONE もモデルの完了判断であり、客観的成功や人間の UX 評価ではない。切断が続く場合は計測側の PAGE_ERROR として止める。',
 '画像のみ、同一オリジンの公開ページを 2 秒間隔で探索した。操作数の上限や、正解の経路・答えは追加していない。完了照合だけ選択済み根拠画像を使う。',
 '公開ページの低負荷な閲覧であり、明示許諾を得たとの主張はしない。元画像やモデル返答はローカル保存のみ。小標本から故障率や速度向上率は算出しない。',
];
await report(root,results);
const notes=`<section class="notice" id="navigation-recovery"><h2>接続切断後の遷移復旧</h2>
<p>実サイトで、Playwright の取得処理が <code>socket hang up</code> で失敗することを再現した。旧コードはこれを UNKNOWN に分類し、リンクを実行済み扱いで除外して探索を続けていた。</p>
<h3>修正した処理</h3><ol><li>接続切断を CONNECTION_RESET に分類する。</li><li>検証済み GET だけ、1 秒後に 1 回再取得する。同じ HTTP リダイレクト列で許す追加取得は合計 1 回。403 等の応答、アクセス拒否、証明書、タイムアウト、原因不明の失敗は再試行しない。</li><li>再試行、復旧、失敗を step と結果 JSON に記録する。復旧できなければ PAGE_ERROR で停止し、サイトの行き止まりに見せない。</li><li>遷移先の同一オリジン制限、既存のファイル制限、リダイレクト制限、無許可の文書遷移の禁止を維持する。</li></ol>
<h3>実サイトでの再検証</h3><ul>${runs.map(r=>`<li>${esc(r.goal)}<p>${r.actions} 操作、${(r.elapsedMs/1000).toFixed(1)} 秒。終了理由 ${esc(r.reason)}。復旧 ${r.navigationRequests.filter((e:any)=>e.phase==='recovered').length} 件、復旧不能 ${r.navigationRequests.filter((e:any)=>e.phase==='failed').length} 件、操作エラー等 ${r.errors.length} 件。</p>${link(join(r.root,'index.html'),'元のレポート')}</li>`).join('')}</ul>
<h3>回帰確認</h3><p>全 ${tests.total} 件、PASS ${tests.pass}、FAIL ${tests.fail}、SKIP ${tests.skip}。ビルド通過。</p><p>実ソケットの切断、継続切断、403、外部へのリダイレクト、遷移終了・世代交代の競合、HTTP 列の追加取得回数、CLI の終了区分をローカルで確認した。ローカルの判断器はテスト用固定実装であり、Jev の性能評価には使わない。</p>${link(testFile,'全テスト')} / ${link(buildFile,'ビルド')}
<details><summary>修正前の再現記録</summary><p>元コード ${esc('8c492ec')} の探索に、取得層の元エラーを記録する計測だけを追加した。step 23 で socket hang up と UNKNOWN の対応を確認。原因を特定したため実験者が中断し、保存 ${baseline.observations} 画面。モデルの終了理由はない。</p>${link(diagnosticLog,'取得層の診断ログ')} / ${link(join(baselineDir,'step-23.json'),'UNKNOWN に置き換わった操作')}</details>
<h3>検証範囲</h3><ul>${limitations.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><p><a href="summary.json">測定値と証跡ハッシュ</a></p></section>`;
const html=await readFile(join(root,'index.html'),'utf8');
await writeFile(join(root,'index.html'),html.replace('<span>実行エラー</span>','<span>終了理由が実行エラー</span>').replace('</header>',`</header>${notes}`));
for(const s of sources)assert.equal(hash(await readFile(s.file)),s.sha256,`SOURCE_CHANGED: ${s.file}`);
const summary={baseCommit:'8c492ec',codeSha256,baseline,runs,tests,build:'PASS',limitations,sources,originalsUnchanged:true};
await writeFile(join(root,'summary.json'),JSON.stringify(summary,null,2));
await writeFile('docs/experiments/2026-10-19-navigation-recovery-results.json',JSON.stringify(summary,null,2));
console.log(JSON.stringify({root,runs,tests,originalsUnchanged:true}));
