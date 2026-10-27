// Join completed portions of the same interrupted validation. Never rerun an
// inference, rescore stored results, or overwrite either source report.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {report} from '../../runner/report.js';
import {measureReliability} from '../../runner/reliability-measurement.js';

const sources=process.argv.slice(2).map(p=>resolve(p));
assert.equal(sources.length,2,'Supply the interrupted portion and its completed continuation');
const expected=['dom-complete','dom-partial','image-complete','image-partial','blocked-operation','availability-information','navigation-history','split-image-history','long-image-history','long-image-partial','branch-image-history','replacement-information'];
const entries:any[]=[],provenance:any[]=[],seen=new Set<string>();
for(const source of sources){
 const bytes=await readFile(join(source,'measurements.json')),data=JSON.parse(bytes.toString());
 assert.equal(data.fake,false);assert.equal(data.repeats,1);
 const keys=[];
 for(const trial of data.trials){
  assert.ok(expected.includes(trial.scenario));assert.equal(trial.repeat,1);
  const key=`${trial.scenario}-${trial.repeat}`;assert.ok(!seen.has(key),`Duplicate completed trial: ${key}`);seen.add(key);keys.push(key);
  const file=join(source,`${key}.json`),raw=JSON.parse(await readFile(file,'utf8'));
  assert.deepEqual(measureReliability(raw.input),raw.measured,'Changed measurement semantics require a separately labelled report');
  assert.equal(trial.middlewareFailures,raw.measured.middlewareFailures);assert.deepEqual(trial.metrics,raw.measured.metrics);
  entries.push({trial,file,raw});
 }
 provenance.push({source,completedTrials:keys,measurementsSha256:createHash('sha256').update(bytes).digest('hex')});
}
assert.equal(entries.length,expected.length);for(const name of expected)assert.ok(seen.has(`${name}-1`));
entries.sort((a,b)=>expected.indexOf(a.trial.scenario)-expected.indexOf(b.trial.scenario));
const root=resolve('reports',`middleware-reliability-resumed-${new Date().toISOString().replaceAll(':','-')}`);await mkdir(root);
const trials=entries.map(e=>e.trial),results=entries.map(e=>({...e.raw.input.result,variant:e.trial.scenario,repeat:1,fake:false,reliability:e.raw.measured}));
for(const e of entries)await copyFile(e.file,join(root,`${e.trial.scenario}-1.json`));
const totals=Object.fromEntries(Object.keys(trials[0].metrics).map(key=>[key,{checked:trials.reduce((n,t)=>n+t.metrics[key].checked,0),failed:trials.reduce((n,t)=>n+t.metrics[key].failed,0)}]));
const note='同じ最終修正版の検証を中断前3試行と再開後9試行に分けて実行し、完了した原本だけを重複なしに連結した。連続12試行の実行ではなく、中断中の未完了試行は集計していない。元の測定結果、試行時間、判定は変更していない。';
await writeFile(join(root,'measurements.json'),JSON.stringify({fake:false,repeats:1,trials},null,2));
await writeFile(join(root,'totals.json'),JSON.stringify({fake:false,repeats:1,totals,trials:trials.length},null,2));
await writeFile(join(root,'resume-provenance.json'),JSON.stringify({note,parts:provenance},null,2));
await report(root,results);
const labels:Record<string,string>={observation:'DOM観測の一致',images:'現在画像と拡大画像の一致',execution:'選択と実操作の一致',history:'履歴・画面IDの整合',routeContinuation:'確定済み経路の継続',retention:'必要情報の保持',memoryFidelity:'保持文字と出典の一致',falseCompletion:'完了主張の必要根拠',separation:'検証用正解の非送信'};
const failed=trials.filter(t=>t.middlewareFailures>0).length,done=trials.filter(t=>t.reason==='JEV_DONE').length;
const section=`<section class="completion-audit" id="reliability"><h2>ミドルウェアの信頼性検証（中断後の継続分を統合）</h2><p>${note}</p><p>12 条件を各 1 回。完了判断 ${done}、未完了 ${trials.length-done}。独立照合の不一致がある試行 ${failed}。Goal 未達自体を不具合には数えない。</p>${Object.entries(totals).map(([key,t]:any)=>`<p>${labels[key]}：照合 ${t.checked}、不一致 ${t.failed}${!t.checked?'（未測定）':''}</p>`).join('')}<p>情報保持は後続判断への提供、文字と出典は承認済みメモの完全一致を検証する。不一致の重複検出は毎回数え、独立した不具合の数とは区別する。完了主張は必要情報の観測を確認し、回答全体の意味の正しさを保証しない。分母 0 は未測定。実サイト一般の信頼性や画像判読全体の精度を保証する結果ではない。</p><p><a href="measurements.json">全測定原本</a> / <a href="resume-provenance.json">中断・再開の出典とハッシュ</a></p><details><summary>試行ごとの測定原本</summary><ul>${trials.map(t=>`<li><a href="${t.scenario}-1.json">${t.scenario}</a>：${t.reason}、不一致 ${t.middlewareFailures}</li>`).join('')}</ul></details></section>`;
const file=join(root,'index.html'),html=await readFile(file,'utf8');
await writeFile(file,html.replace('</header>','</header>'+section).replace(/<div class="overview">[\s\S]*?<\/div><p class="hint">/,'<p class="hint">'));
console.log(JSON.stringify({root,trials:trials.length,totals,affected:failed}));
