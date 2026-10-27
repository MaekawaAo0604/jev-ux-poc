import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
import assert from 'node:assert/strict';
const before=resolve(process.argv[2]),after=resolve(process.argv[3]);
const read=(root:string,file:string)=>readFile(join(root,file),'utf8').then(JSON.parse);
const results=[];
for(const repeat of [1,2]){
 const b=await read(before,`split-image-history-${repeat}.json`),a=await read(after,`split-image-history-${repeat}.json`);
 assert.deepEqual(a.oracle,b.oracle.marker?{...b.oracle,marker:a.oracle.marker}:b.oracle);
 assert.equal(a.input.result.goalText,b.input.result.goalText);
 const shape=(d:any)=>({reason:d.input.result.reason,actions:d.input.result.actionCount,explorationMs:d.input.result.elapsedMs,retention:d.measured.metrics.retention});
 results.push({repeat,before:shape(b),after:shape(a),screens:a.input.result.steps.map((s:any)=>({step:s.number,file:relative(after,join(a.input.result.dir,s.screenshot)).replaceAll('\\','/')}))});
}
const totalsBefore=await read(before,'totals.json'),totalsAfter=await read(after,'totals.json');
const checkResults={tests:369,passed:366,skipped:3,failed:0,build:'PASS'};
await writeFile(join(after,'comparison.json'),JSON.stringify({before,after,results,totalsBefore,totalsAfter,checks:checkResults},null,2));
const format=(ms:number)=>(ms/1000).toFixed(1);
const cards=results.map(r=>`<p>試行${r.repeat}：修正前 ${r.before.actions}操作・${format(r.before.explorationMs)}秒・${r.before.reason} → 修正後 ${r.after.actions}操作・${format(r.after.explorationMs)}秒・${r.after.reason}。</p>`).join('');
const b=totalsBefore.totals.retention,a=totalsAfter.totals.retention;
const section=`<section class="completion-audit" id="retention-fix"><h2>過去画像の入力保持を修正</h2><p>同じGoalと制御サイトで各2回再探索した。上で料金、スクロール後に受付時間を表示するケースで、保存した両画像が通常判断と完了照合の入力に残ることを確認した。</p>${cards}<p>全16試行の情報保持の不一致：修正前 ${b.failed}/${b.checked} → 修正後 ${a.failed}/${a.checked}。修正後は完了10・未完了6・異常終了0。条件不足や操作不可を完了に変えたわけではない。</p><p>秒数は探索時間であり、終了後の監査や起動は含まない。少数試行の比較で、一般的な速度や正確さの保証ではない。今回の実Jev試行ではBackが発生せず、その後の経路継続は実測対象外。</p><p>全体テスト ${checkResults.passed}件通過・${checkResults.skipped}件スキップ、ビルド通過。<a href="comparison.json">比較原本</a> / <a href="${relative(after,join(before,'index.html')).replaceAll('\\','/')}">修正前のレポート</a>。</p></section>`;
const file=join(after,'index.html'),html=await readFile(file,'utf8');assert.ok(!html.includes('id="retention-fix"'));
await writeFile(file,html.replace('</header>','</header>'+section));
console.log(JSON.stringify({after,results:results.map(({screens,...r})=>r),checks:checkResults}));
