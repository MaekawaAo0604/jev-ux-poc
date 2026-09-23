// Bounded repeat of the registered six goals. Answers/reference routes are not
// passed to the explorer. Old logs/reports are never overwritten.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {join,resolve,relative} from 'node:path';
import {report} from '../../runner/report.ts';

const readJSON=async path=>JSON.parse(await readFile(path,'utf8'));
const plan=await readJSON('docs/experiments/2026-09-20-six-case-plan.json');
const before=await readJSON('docs/experiments/2026-09-20-six-case-results.json');
const selectedIds=new Set(process.argv.slice(2));
for(const id of selectedIds)assert.ok(plan.cases.some(entry=>entry.id===id),`Unknown case: ${id}`);
const paths=['package-lock.json',...(await Promise.all(['pages','jev','runner'].map(async dir=>(await readdir(dir)).filter(f=>f.endsWith('.ts')).map(f=>join(dir,f))))).flat()];
const hashes=async()=>Object.fromEntries(await Promise.all(paths.map(async path=>[path,createHash('sha256').update(await readFile(path)).digest('hex')])));
const stamp=new Date().toISOString().replaceAll(':','-');
const root=resolve('reports',`validation-fixes-${stamp}`);
await mkdir(root,{recursive:true});
const manifest={startedAt:new Date().toISOString(),sourceHashes:await hashes(),settings:{...plan.settings,navigationMode:'links-and-local-disclosures',redirectMode:'same-origin-up-to-3'},cases:[]};
const results=[];
for(const [i,entry] of plan.cases.entries()){
 if(selectedIds.size&&!selectedIds.has(entry.id))continue;
 assert.deepEqual(await hashes(),manifest.sourceHashes,'Code changed during comparison');
 console.log(`CASE ${entry.id}`);
 const output=await new Promise((ok,fail)=>{
  const child=spawn(process.execPath,['--import','tsx','runner/public-site.ts',entry.url,entry.goal,'--reviewed','--max-actions','12','--interval-ms','3000'],{stdio:['ignore','pipe','pipe'],windowsHide:true});
  let stdout='';child.stdout.on('data',data=>{stdout+=data;process.stdout.write(data);});child.stderr.on('data',data=>process.stderr.write(data));
  child.on('error',fail);child.on('exit',code=>code===0?ok(stdout):fail(new Error(`Explorer exit ${code}`)));
 });
 const summary=JSON.parse(output.trim().split(/\r?\n/).at(-1));
 const resultPath=join(summary.report,'../exploration/result.json');
 const result=await readJSON(resultPath);
 assert.equal(result.goalText,entry.goal);assert.equal(result.settings.url,entry.url);
 assert.equal(result.objectiveSuccess,null);assert.equal(result.fake,false);
 for(const step of result.steps)assert.deepEqual(Object.keys(step.state).sort(),['currentDate','goal','history','screen']);
 results.push(result);manifest.cases.push({id:entry.id,beforeDirectory:before.cases[i].directory,resultPath,reason:result.reason,actionCount:result.actionCount,judgments:result.steps.length,audit:result.completionAudit});
 await writeFile(join(root,'comparison.json'),JSON.stringify(manifest,null,2));
}
assert.deepEqual(await hashes(),manifest.sourceHashes,'Code changed during comparison');
manifest.finishedAt=new Date().toISOString();manifest.codeUnchanged=true;
await writeFile(join(root,'comparison.json'),JSON.stringify(manifest,null,2));
await report(root,results);
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rows=await Promise.all(manifest.cases.map(async(entry,i)=>{
 const registered=plan.cases.find(c=>c.id===entry.id),prior=before.cases.find(c=>c.id===entry.id);
 const previous=await readJSON(join('reports',entry.beforeDirectory,'exploration/result.json'));
 const link=relative(root,join(results[i].dir,'../index.html')).replaceAll('\\','/');
 return `<li><h3>${escape(registered.site)}：${escape(prior.shortGoal)}</h3><p>修正前 ${escape(previous.reason)}（${previous.actionCount} 操作） → 修正後 ${escape(entry.reason)}（${entry.actionCount} 操作）</p><p>終了後の根拠確認：${escape(entry.audit.status)}${entry.audit.assessment?` / ${escape(entry.audit.assessment)}`:''}${entry.audit.error?` / ${escape(entry.audit.error.stage)} / ${escape(entry.audit.error.code)}`:''}</p><a href="${escape(link)}">今回の操作経路</a> · <a href="../${escape(entry.beforeDirectory)}/index.html">修正前</a></li>`;
}));
const intro=`<section class="completion-audit"><h1>探索器の修正：${results.length} 目的で再検証</h1><p>Jev に正解や経路を渡さず、前回と同じ目的、画面サイズ、上限 12 操作、待機 3 秒で各 1 回実行しました。修正前のログは残しています。${selectedIds.size?'今回は同一サイト内の転送に対応した後の追加検証です。':''}</p><p class="notice">JEV_DONE は Jev の完了判断です。人間の成功率や、サイト側の UX の良し悪しを示す値ではありません。画像とログは内部検証用で、公開・営業送付は行っていません。</p><ol>${rows.join('')}</ol><p><a href="comparison.json">比較条件・コードのハッシュ・実行ログの一覧</a></p></section>`;
const html=await readFile(join(root,'index.html'),'utf8');
await writeFile(join(root,'index.html'),html.replace('<main>',`<main>${intro}`));
console.log(JSON.stringify({comparison:join(root,'index.html')}));
