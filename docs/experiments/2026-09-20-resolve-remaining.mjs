// Two bounded fresh explorations, plus a separate replay of the failed audit.
// Reference answers/routes are never passed to the explorer or audit.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {join,resolve,relative} from 'node:path';
import {recordCompletion} from '../../jev/completion.ts';
import {evaluateChoices} from '../../jev/client.ts';
import {report} from '../../runner/report.ts';

const readJSON=async path=>JSON.parse(await readFile(path,'utf8'));
const plan=await readJSON('docs/experiments/2026-09-20-six-case-plan.json');
const args=process.argv.slice(2),skipAudit=args.includes('--skip-audit');
const selected=args.filter(a=>!a.startsWith('--'));
assert.ok(args.every(a=>a==='--skip-audit'||['anytime-tour','anytime-highschool'].includes(a)),'Unknown argument');
const caseIds=selected.length?selected:['anytime-tour','anytime-highschool'];
const root=resolve('reports',`remaining-${new Date().toISOString().replaceAll(':','-')}`);
await mkdir(root,{recursive:true});
const files=['package-lock.json',...(await Promise.all(['pages','jev','runner'].map(async dir=>(await readdir(dir)).filter(f=>f.endsWith('.ts')).map(f=>join(dir,f))))).flat()];
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async file=>[file,createHash('sha256').update(await readFile(file)).digest('hex')])));
const manifest={startedAt:new Date().toISOString(),sourceHashes:await hashes(),settings:{maxActions:24,previousMaxActions:24,intervalMs:3000,viewport:{width:1440,height:1000},ocr:false,repeats:1,observationMemory:'visible-body-text-up-to-20000-characters'},cases:[]};
const save=()=>writeFile(join(root,'validation.json'),JSON.stringify(manifest,null,2));
await save();
process.loadEnvFile('.env');
const previousAuditPath='reports/2026-09-20T07-16-31.780Z-public/exploration/result.json';
let audit;
if(!skipAudit){
const previous=await readJSON(previousAuditPath);
console.log('AUDIT REPLAY: museum hours (saved observations only)');
audit=await recordCompletion(previous.steps.map(s=>s.state),evaluateChoices);
const replay={type:'saved-observations-audit-replay',source:previousAuditPath,previousAudit:previous.completionAudit,audit,executedAt:new Date().toISOString(),navigationRepeated:false};
await writeFile(join(root,'museum-audit-replay.json'),JSON.stringify(replay,null,2));
manifest.auditReplay={path:'museum-audit-replay.json',status:audit.status,assessment:audit.assessment,request:audit.request,error:audit.error};
await save();console.log(JSON.stringify(manifest.auditReplay));
}
const results=[];
for(const id of caseIds){
 assert.deepEqual(await hashes(),manifest.sourceHashes,'Source changed during run');
 const entry=plan.cases.find(c=>c.id===id);
 console.log(`CASE ${id}`);
 const output=await new Promise((ok,fail)=>{
  const child=spawn(process.execPath,['--import','tsx','runner/public-site.ts',entry.url,entry.goal,'--reviewed','--max-actions','24','--interval-ms','3000'],{stdio:['ignore','pipe','pipe'],windowsHide:true});
  let stdout='';child.stdout.on('data',data=>{stdout+=data;process.stdout.write(data);});child.stderr.on('data',data=>process.stderr.write(data));
  child.on('error',fail);child.on('exit',code=>code===0?ok(stdout):fail(new Error(`Explorer exit ${code}`)));
 });
 const summary=JSON.parse(output.trim().split(/\r?\n/).at(-1));
 const resultPath=join(summary.report,'../exploration/result.json'),result=await readJSON(resultPath);
 assert.equal(result.goalText,entry.goal);assert.equal(result.settings.url,entry.url);assert.equal(result.objectiveSuccess,null);assert.equal(result.fake,false);
 results.push(result);manifest.cases.push({id,resultPath,reason:result.reason,actionCount:result.actionCount,judgments:result.steps.length,audit:result.completionAudit});
 await save();
}
assert.deepEqual(await hashes(),manifest.sourceHashes,'Source changed during run');
manifest.finishedAt=new Date().toISOString();manifest.codeUnchanged=true;await save();
await report(root,results);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const auditURL=relative(root,resolve(previousAuditPath,'../../index.html')).replaceAll('\\','/');
const intro=`<section class="completion-audit"><h1>観察履歴を修正し、${results.length} 目的を再検証</h1><p>直前の検証と同じ上限 24 操作で、各目的につき新規セッションから 1 回実行しました。以前の 12 操作の検証とは条件が異なります。正解や経路は Jev に渡していません。</p><p>過去の画面名だけでなく、実際に観察した本文も履歴に残すよう修正しました。直近の表示から合計 20,000 文字まで保存し、省略した履歴は明示します。OCR や、未表示の文章は使っていません。</p><p>上限ちょうどの操作後も判断しますが、追加操作は実行しません。API の一時エラーは 2 秒、4 秒待って最大 2 回再試行し、ブラウザー操作は繰り返しません。失敗履歴は JSON に記録しています。</p><p class="notice">単発の再検証であり、人間の成功率を示すものではありません。Jev の完了判断と、画面に必要情報があることの確認は区別しています。</p>${audit?`<h2>博物館の根拠確認だけを再実行</h2><p>保存済み観察記録の再評価：${escape(audit.status)} / ${escape(audit.assessment||audit.error?.code)}。サイト探索は繰り返していません。</p><a href="museum-audit-replay.json">新旧の根拠確認</a> · <a href="${escape(auditURL)}">元の探索</a> · `:''}<a href="validation.json">今回の条件と記録</a></section>`;
const html=await readFile(join(root,'index.html'),'utf8');await writeFile(join(root,'index.html'),html.replace('<main>',`<main>${intro}`));
console.log(JSON.stringify({report:join(root,'index.html')}));
