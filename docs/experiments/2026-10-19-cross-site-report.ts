// Reuse the existing report renderer; review notes are separate from raw verdicts.
import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import {join,relative,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {report} from '../../runner/report.js';
const review=JSON.parse(await readFile('docs/experiments/2026-10-19-cross-site-review.json','utf8'));
const root=resolve('reports/cross-site-review-2026-10-19');await mkdir(root,{recursive:true});
const hash=(data:Buffer)=>createHash('sha256').update(data).digest('hex');
const esc=(value:unknown)=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const local=(file:string)=>relative(root,resolve(file)).replaceAll('\\','/').split('/').map(encodeURIComponent).join('/');
const measurements=[],results=[];
for(const run of review.normalRuns){
 const dir=resolve(run.root,'exploration'),raw=await readFile(join(dir,'result.json')),r=JSON.parse(raw.toString());
 const evidence=[];
 for(const file of run.imageReview.files)evidence.push({file,sha256:hash(await readFile(join(dir,file)))});
 results.push({...r,dir,variant:`${run.site} / ${run.id}`,repeat:run.repeat});
 measurements.push({...run,modelEnding:r.reason,objectiveSuccess:r.objectiveSuccess,actions:r.actionCount,explorationMs:r.elapsedMs,finalURL:r.finalURL,resultSha256:hash(raw),traceSha256:hash(await readFile(join(dir,'action-trace.json'))),evidence,errors:r.steps.filter((s:any)=>s.error).map((s:any)=>({step:s.number,result:s.result,error:s.error}))});
}
const partialDir=resolve(review.abortedRun.root,'exploration'),files=(await readdir(partialDir)).filter(f=>/^step-\d+\.(json|png)$/.test(f)).sort();
const snapshots=await Promise.all(files.map(async file=>({file,sha256:hash(await readFile(join(partialDir,file)))})));
const steps=await Promise.all(files.filter(f=>f.endsWith('.json')).map(async file=>JSON.parse(await readFile(join(partialDir,file),'utf8'))));steps.sort((a,b)=>a.number-b.number);
const seen=new Map<string,number>(),repeatedImageActions=[];
for(const s of steps){
 if(s.result!=='OK'||!s.decision)continue;
 const png=await readFile(join(partialDir,s.screenshot)),key=`${hash(png)}:${s.decision.choice}`,prior=seen.get(key);
 if(prior!==undefined)repeatedImageActions.push({step:s.number,priorStep:prior,action:s.decision.choice,sha256:hash(png),url:s.url,viewport:s.state.screen.viewport});else seen.set(key,s.number);
}
const partial={...review.abortedRun,observations:steps.length,recordedExecutedSteps:steps.filter(s=>s.result==='OK').length,lastStep:steps.at(-1)?.number,lastSavedResult:steps.at(-1)?.result,snapshots,repeatedImageActions};
const coreDiff=execFileSync('git',['diff','b6046a6','--','pages','jev','runner','tests'],{encoding:'utf8'});if(coreDiff.trim())throw new Error('PRODUCTION_CHANGED');
await report(root,results);
let html=await readFile(join(root,'index.html'),'utf8');
const normalNotes=measurements.map(r=>`<li><strong>${esc(r.site)} / ${esc(r.id)} / ${r.repeat} 回目</strong><p>${esc(r.imageReview.note)}</p><p>元の終了理由: ${esc(r.modelEnding)}。${r.actions} 操作、探索 ${(r.explorationMs/1000).toFixed(1)} 秒。点検: ${esc(r.imageReview.status)}。</p>${r.imageReview.files.map((f:string)=>`<a href="${local(join(r.root,'exploration',f))}">${esc(f)}</a>`).join(' / ')}</li>`).join('');
const notes=`<section id="independent-review" class="notice"><h2>保存画像の点検</h2><p>計画 ${review.plannedAttempts} 回、開始 ${measurements.length+1} 回。通常終了 ${measurements.length} 回、実験者中断 1 回、未実行 1 回。Jev の完了判定を客観的成功とは扱わない。</p><ol>${normalNotes}</ol><h3>番号の誤対応</h3><p>${esc(review.associationProbe.note)}</p><p>FAQ は e4、Download は e3。独立照合は 3 回とも FAQ=e3、Download=e2 だった。</p><a href="${local(review.associationProbe.source)}">照合に使った画像</a> / <a href="number-association.json">照合結果</a><h3>実験者が中断した試行</h3><p>${esc(partial.note)}</p><p>${esc(partial.counterEvidence)}</p><p>${esc(partial.partialFinding)}</p><p>同一画像と同一操作の再出現: ${repeatedImageActions.length} 件。元のモデル終了理由は存在しない。</p>${partial.selectedFiles.map((f:string)=>`<a href="${local(join(review.abortedRun.root,'exploration',f))}">${esc(f)}</a>`).join(' / ')}<p><a href="partial-evidence.json">中断時の証跡とハッシュ</a></p><h3>次に切り分ける項目</h3><ol>${review.priorities.map((s:string)=>`<li>${esc(s)}</li>`).join('')}</ol><p>${review.limits.map(esc).join('<br>')}</p></section>`;
html=html.replace('<span>全試行</span>','<span>通常終了</span>').replace('</header>',`</header>${notes}`);await writeFile(join(root,'index.html'),html);
await writeFile(join(root,'measurements.json'),JSON.stringify({productionHead:'b6046a6',productionChanged:false,planned:8,normalTerminations:6,experimenterAborted:1,notLaunched:1,runs:measurements},null,2));
await writeFile(join(root,'partial-evidence.json'),JSON.stringify(partial,null,2));
await writeFile(join(root,'review.json'),JSON.stringify(review,null,2));
for(const r of measurements)if(hash(await readFile(resolve(r.root,'exploration/result.json')))!==r.resultSha256)throw new Error('ORIGINAL_CHANGED');
for(const s of snapshots)if(hash(await readFile(join(partialDir,s.file)))!==s.sha256)throw new Error('PARTIAL_CHANGED');
console.log(JSON.stringify({root,runs:measurements.map(r=>({id:r.id,repeat:r.repeat,actions:r.actions,explorationMs:r.explorationMs,ending:r.modelEnding,review:r.imageReview.status})),partial:{observations:steps.length,executedSteps:partial.recordedExecutedSteps,repeatedImageActions:repeatedImageActions.length,lastStep:partial.lastStep,lastResult:partial.lastSavedResult},originalsUnchanged:true}));
