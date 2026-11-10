import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {report} from '../../runner/report.js';
const root=resolve('reports/scroll-recovery-review-2026-10-19');await mkdir(root,{recursive:true});
const finalRoots=process.argv.slice(2);assert.ok(finalRoots.length,'Pass completed final-code public report roots');
const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const esc=(s:unknown)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const local=(p:string)=>relative(root,resolve(p)).replaceAll('\\','/').split('/').map(encodeURIComponent).join('/');
const link=(p:string,label:string)=>`<a href="${local(p)}">${esc(label)}</a>`;
const sources:{file:string;sha256:string}[]=[];
async function source(file:string){const bytes=await readFile(file);sources.push({file,sha256:hash(bytes)});return bytes;}
const code:Record<string,string>={
 'jev/image-only-input.ts':'5714ee3379924903bdc4b710182adc082225fd0bf62d6495f5b3752583b9d55e',
 'jev/navigation-context.ts':'b2e6bea86fafa05ebbf252638a3271189c53e54284baba02ed51f97e3fd56bfb',
 'runner/exploration-memory.ts':'4571ccdad877ad704f57fc0f0ccd1d5b29be71c1226bad48176c955b57c2b54e',
 'tests/image-scroll-progress.test.ts':'8be067a2891e4f766525fcb3e0b0cf4d8874cfa495aab3b99bfc3d275477b3bf',
 'tests/scroll-frontier.test.ts':'f51ec4c20b4737e8393f779f006b5a3714339a7de4bbde778e50cb96053dec8f',
 'tests/image-only.test.ts':'c5d9d4d447c0a3395968c764499e18477418b2ce0c649774c61ec3a99124c62c',
 'tests/public-vision.test.ts':'63ddbe484c417fc3cf615724ec9d406a0189756a2720051a1c313c4adbe56949',
};
for(const [file,sha] of Object.entries(code))assert.equal(hash(await readFile(file)),sha,`CODE_CHANGED: ${file}`);
const intermediate=[
 {root:'reports/2026-10-19T07-25-20.426Z-public',version:'修正前の元試行',status:'EXPERIMENTER_ABORTED',note:'このターン以前の保存記録。後で別の枝も試したため、永久ループとは断定しない。'},
 {root:'reports/2026-10-19T08-22-39.686Z-public',version:'位置ヒントのみ',status:'EXPERIMENTER_ABORTED',note:'情報を渡しても、コードによる遠隔の逆スクロール計画が再現したため実験者が中断。'},
 {root:'reports/2026-10-19T08-27-17.809Z-public',version:'遠隔スクロール省略の初期案',status:'NORMAL_TERMINATION',expectedEnding:'UNSUPPORTED_CONTENT',note:'操作エラーを含み、未対応形式で終了。必要な戻り道を消す境界問題も別途テストで再現したため、最終版の成功検証には使わない。'},
 {root:'reports/2026-10-19T08-35-57.628Z-public',version:'入れ子経路保持、出発点除外前',status:'EXPERIMENTER_ABORTED',note:'コードを読み込んだ後にレビューで循環による誤保持が見つかった。最終コードの試行と区別するため実験者が中断。'},
 {root:'reports/2026-10-19T08-38-59.306Z-public',version:'重複目的地の排除前 / 複合 Goal 1',status:'NORMAL_TERMINATION',expectedEnding:'STUCK',note:'20 操作で Jev 自身が途中停止。操作エラーが 1 件あり、Goal 達成やサイトの UX 不良の検証には使わない。'},
 {root:'reports/2026-10-19T08-41-27.924Z-public',version:'重複目的地の排除前 / 修復説明の対照',status:'NORMAL_TERMINATION',expectedEnding:'JEV_DONE',note:'修復ページから開始した独立の単一 Goal。1 スクロールで説明を表示し完了判断。元の複合 Goal の成功とは区別する。'},
 {root:'reports/2026-10-19T08-42-21.426Z-public',version:'重複目的地の排除前 / 複合 Goal 2',status:'NORMAL_TERMINATION',expectedEnding:'STUCK',note:'23 操作で Jev 自身が途中停止。現在も選べるリンクを過去位置の用事として数える重複を見つけ、追加の再現テストと修正を行った。'},
];
async function inspect(runRoot:string){
 const dir=join(runRoot,'exploration'),files=(await readdir(dir)).filter(f=>/^step-\d+\.json$/.test(f));
 const steps=await Promise.all(files.map(async file=>JSON.parse((await source(join(dir,file))).toString())));steps.sort((a,b)=>a.number-b.number);
 const repeats:{step:number;priorStep:number;choice:string;sha256:string}[]=[],seen=new Map<string,number>();
 for(const s of steps){
  const raw=await source(join(dir,s.screenshot)),sha=hash(raw);
  if(s.result==='OK'&&s.decision){const key=`${sha}:${s.decision.choice}`,prior=seen.get(key);if(prior!==undefined)repeats.push({step:s.number,priorStep:prior,choice:s.decision.choice,sha256:sha});else seen.set(key,s.number);}
 }
 const remoteScrollCommitments=steps.flatMap(s=>{const t=s.frontier?.targets?.[s.decision?.frontier?.targetId];return t?.kind==='scroll'&&t.travelSteps>0?[{step:s.number,choice:s.decision.choice,targetId:s.decision.frontier.targetId,mode:s.decision.frontier.mode,target:t}]:[];});
 const errors=steps.filter(s=>s.error).map(s=>({step:s.number,result:s.result,error:s.error}));
 return {dir,steps,observations:steps.length,executedOK:steps.filter(s=>s.result==='OK').length,lastSavedResult:steps.at(-1)?.result,repeatedImageActions:repeats,remoteScrollCommitments,errors};
}
const attempts=[];
for(const c of intermediate){
 const s=await inspect(c.root);let modelEnding:null|string=null;
 if(c.status==='NORMAL_TERMINATION'){const r=JSON.parse((await source(join(s.dir,'result.json'))).toString());modelEnding=r.reason;assert.equal(modelEnding,c.expectedEnding);await source(join(s.dir,'action-trace.json'));}
 else assert.ok(!(await readdir(s.dir)).includes('result.json'),'do not relabel a normal ending as an experimenter abort');
 attempts.push({...c,originalModelEnding:modelEnding,observations:s.observations,executedOK:s.executedOK,lastSavedResult:s.lastSavedResult,errors:s.errors,remoteScrollCommitments:s.remoteScrollCommitments,repeatedImageActions:s.repeatedImageActions,exactCodeSnapshotAvailable:c.version==='修正前の元試行'});
}
const results=[],finalRuns=[];
for(const [i,runRoot] of finalRoots.entries()){
 const s=await inspect(runRoot),r=JSON.parse((await source(join(s.dir,'result.json'))).toString());await source(join(s.dir,'action-trace.json'));
 assert.equal(r.objectiveSuccess,null);
 results.push({...r,dir:resolve(s.dir),variant:`最終コード / ${i+1}`,repeat:i+1});
 finalRuns.push({root:runRoot,goal:r.goalText,reason:r.reason,actions:r.actionCount,elapsedMs:r.elapsedMs,objectiveSuccess:r.objectiveSuccess,errors:s.errors,remoteScrollCommitments:s.remoteScrollCommitments,repeatedImageActions:s.repeatedImageActions,steps:s.steps.map(x=>({step:x.number,url:x.url,pageId:x.state.screen.pageId,viewport:x.state.screen.viewport,choice:x.decision?.choice,result:x.result,frontier:x.decision?.frontier}))});
}
const probeFile='reports/scroll-progress-pair-2026-10-19T08-27-29.897Z/probe.json',probe=JSON.parse((await source(probeFile)).toString());
assert.equal(probe.responses.length,6);for(const p of probe.responses)assert.equal(p.response.answers.nextAction.choice,'scroll_up');
const testFile='reports/scroll-recovery-final-tests-2026-10-19.log',test=(await source(testFile)).toString();
const count=(key:string)=>{const m=test.match(new RegExp(`(?:ℹ |# )${key} (\\d+)`));assert.ok(m,`MISSING_SUMMARY: ${key}`);return Number(m[1]);};
const tests={total:count('tests'),pass:count('pass'),fail:count('fail'),skip:count('skipped')};assert.equal(tests.fail,0);
const buildFile='reports/scroll-recovery-final-build-2026-10-19.log';assert.match((await source(buildFile)).toString(),/built in/);
await source('docs/experiments/2026-10-19-cross-site-software-protocol.json');
const limits=['位置の観察済みは読解完了ではない。動的な表示変更や、画面情報の読み落としを解消したという検証ではない。','最終版の実サイト結果は小標本。モデルの揺らぎ、表示や経路の違いを含むため、修正前との操作数だけで因果的な速度向上や人間の UX を判定しない。','JEV_DONE でも客観的成功は未検証。未対応形式・安全境界・操作エラー・実験者中断は Goal 達成ともサイトの UX 不良とも扱わない。','位置ヒントだけの保存画像対照は再構成した文脈であり、元の API 要求の完全再送ではない。前後とも 3 回すべて上スクロールだった。','一度行った場所を全面禁止せず、現在画面での再読、未実行のリンク、既知の経路の先にある用事、未観察の隙間を残す。従って正当な移動やモデル自身の再確認までゼロになる保証はない。','既存の依頼範囲で同一オリジンの公開ページを低頻度に閲覧した。明示許諾ではなく、画像や返答はローカル保存のみ。途中版の厳密なコードスナップショットは保存していない。'];
const summary={baseCommit:'577dff5',codeSha256:code,settings:{sequential:true,model:'jev-1.14.0',intervalMs:2000,maxActions:0,observationMode:'image-only',completionEvidenceImages:'selected-sources'},attempts,finalRuns,tests,focusedTests:{total:42,pass:42},probe:{file:probeFile,before:['scroll_up','scroll_up','scroll_up'],after:['scroll_up','scroll_up','scroll_up']},limits,sources};
await report(root,results);
const notes=`<section class="notice" id="scroll-recovery"><h2>往復スクロールの修正</h2><p>既読範囲への未実行スクロールを、コードが新しい探索先として計画していた。位置ヒントの復元だけでは解消せず、遠隔の探索先を列挙する処理も修正した。上段の件数と下の試行カードは最終コードだけの集計。</p><h3>変更した処理</h3><ol><li>匿名ページ ID と数値の表示位置を操作履歴に残し、画像専用入力にも観察範囲を渡す。OCR や DOM 本文は渡さない。</li><li>その方向を端まで観察済みで、戻る先に未実行のリンクや既知の経路を経由した用事がない場合だけ、遠隔のスクロール目的地から省く。</li><li>入れ子の戻り道は循環しない探索で確認する。逆スクロール元や現在の出発点へ戻る循環、現在も選べる同じ操作の重複を、戻る用事の根拠にしない。</li></ol><h3>採用しなかった案も残す</h3><p>位置ヒントだけの対照では、前後とも 3 回すべて上スクロールを選んだ。</p>${link(probeFile,'保存画像の対照結果')}<ul>${attempts.map(a=>`<li><strong>${esc(a.version)}</strong>：${esc(a.note)}<p>保存 ${a.observations} 画面、OK ${a.executedOK} 操作。${a.originalModelEnding?`元の終了理由: ${esc(a.originalModelEnding)}`:'モデルの終了理由なし。実験者中断。'}</p>${link(join(a.root,'exploration','step-1.json'),'先頭の記録')}</li>`).join('')}</ul><h3>最終コードの実行</h3><ul>${finalRuns.map((r,i)=>`<li>${esc(r.goal)}<p>${r.actions} 操作、${(r.elapsedMs/1000).toFixed(1)} 秒。元の終了理由: ${esc(r.reason)}。操作エラー等の記録 ${r.errors.length} 件。</p>${link(join(r.root,'index.html'),`元のレポート ${i+1}`)}</li>`).join('')}</ul><h3>回帰確認</h3><p>全 ${tests.total} 件、PASS ${tests.pass}、FAIL ${tests.fail}、SKIP ${tests.skip}。関連 42 件は別実行でも通過。ビルド通過。</p>${link(testFile,'全テスト')} / ${link(buildFile,'ビルド')}<h3>検証範囲</h3><ul>${limits.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><p><a href="summary.json">測定値と証跡ハッシュ</a></p></section>`;
const actionErrors=finalRuns.reduce((n,r)=>n+r.errors.filter(e=>e.result==='ACTION_ERROR').length,0);
const rendered=await readFile(join(root,'index.html'),'utf8');
assert.ok(rendered.includes('<span>実行エラー</span>'));
await writeFile(join(root,'index.html'),rendered.replace('<span>実行エラー</span>','<span>終了理由が実行エラー</span>').replace('</header>',`<p class="hint" id="action-error-count">操作途中のエラー：${actionErrors} 件（最終コードの全 step）。上段は終了理由別の試行数であり、途中エラーの件数ではありません。</p></header>${notes}`));
for(const s of sources)assert.equal(hash(await readFile(s.file)),s.sha256,`SOURCE_CHANGED: ${s.file}`);
await writeFile(join(root,'summary.json'),JSON.stringify({...summary,originalsUnchanged:true},null,2));
const compact={...summary,attempts:attempts.map(({remoteScrollCommitments,repeatedImageActions,...a})=>({...a,remoteScrollCommitments:remoteScrollCommitments.length,repeatedImageActions:repeatedImageActions.length})),finalRuns:finalRuns.map(({steps,remoteScrollCommitments,repeatedImageActions,...r})=>({...r,remoteScrollCommitments:remoteScrollCommitments.length,repeatedImageActions:repeatedImageActions.length})),sources:sources.filter(s=>/result\.json$|action-trace\.json$|probe\.json$|final-tests|final-build|protocol/.test(s.file)),localSummarySha256:hash(await readFile(join(root,'summary.json'))),originalsUnchanged:true};
await writeFile('docs/experiments/2026-10-19-scroll-recovery-results.json',JSON.stringify(compact,null,2));
console.log(JSON.stringify({root,tests,finalRuns:finalRuns.map(({root,reason,actions,elapsedMs,errors})=>({root,reason,actions,elapsedMs,errors})),originalsUnchanged:true}));
