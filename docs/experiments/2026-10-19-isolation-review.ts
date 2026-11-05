import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {resolve,join,dirname,relative} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {report} from '../../runner/report.js';

const roots=process.argv.slice(2);assert.equal(roots.length,4,'Pass memory/action, history, position and scope experiment roots');
const root=resolve('reports/isolation-review-2026-10-19');await mkdir(root,{recursive:true});
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex'),sources:{file:string;sha256:string}[]=[];
async function source(file:string){const b=await readFile(file);sources.push({file,sha256:hash(b)});return b;}
const esc=(s:unknown)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const link=(file:string,label:string)=>`<a href="${relative(root,resolve(file)).replaceAll('\\','/').split('/').map(encodeURIComponent).join('/')}">${esc(label)}</a>`;
const phases=[];
for(const [i,dir] of roots.slice(0,3).entries()){
 const data=JSON.parse((await source(join(dir,'isolation.json'))).toString());
 assert.equal(data.responses.length,[36,18,18][i]);assert.equal(data.responses.filter((r:any)=>r.status==='ERROR').length,0);
 for(const [file,sha] of Object.entries(data.codeSha256))assert.equal(hash(await readFile(file)),sha);
 const groups=new Map<string,any>();
 for(const r of data.responses){
  const condition=r.historyVariant??r.geometryVariant??`memory:${r.withMemory},action:${r.joint}`,key=`${r.step}:${condition}`;
  const group=groups.get(key)??{step:r.step,condition,password:[],repair:[]};
  group.password.push(r.response.answers.image_check_0.choice);group.repair.push(r.response.answers.image_check_1.choice);groups.set(key,group);
 }
 for(const request of data.requests){
  const step=JSON.parse((await source(join(data.source,`step-${request.step}.json`))).toString());
  const png=await source(join(data.source,step.screenshot));assert.equal(hash(png),request.imageSha256);
 }
 phases.push({phase:data.phase??['memory-action','history-control','position-and-wrapper'][i],source:join(dir,'isolation.json'),groups:[...groups.values()],replay:data.replay,scrollProjection:data.scrollProjection,codeSha256:data.codeSha256});
}
const scope=JSON.parse((await source(join(roots[3],'scope.json'))).toString());assert.equal(scope.runs.length,5);
const results=[];
for(const r of scope.runs){
 assert.ok(!r.status,'scope experiment must finish before interpretation');
 const bytes=await source(r.source);assert.equal(hash(bytes),r.sha256);const result=JSON.parse(bytes.toString());
 assert.equal(result.reason,r.reason);assert.equal(result.objectiveSuccess,null);
 if(r.mode==='cross')assert.equal(r.answerHits.length,0);
 results.push({...result,dir:dirname(r.source),variant:r.mode,repeat:Number(r.token.slice(4))});
}
const same=scope.runs.filter((r:any)=>r.mode==='same'),cross=scope.runs.filter((r:any)=>r.mode==='cross'),direct=scope.runs.find((r:any)=>r.mode==='direct-answer');
const conclusion={
 baseCommit:'38c3a84',productionModified:false,publicSiteRequests:0,savedImageEvaluations:72,localLiveExplorations:5,
 scope:scope.runs,phases,
 findings:[
  {code:'SCOPE_CONFOUNDS_STUCK',status:'REPRODUCED_IN_LOCAL_FIXTURE',detail:'The same displayed start page and answer content produces JEV_DONE inside origin and STUCK when the destination origin is disallowed; directly starting at the answer also produces JEV_DONE. No disallowed answer request was sent.'},
  {code:'FRONTIER_CHANGES_PRIMARY_ACTION',status:'REPRODUCED_WITH_PINNED_REPLIES',detail:'The recorded primary scroll_up is returned without frontier and replaced by a secondary stuck with frontier. The projected scroll destination had already been seen in steps 15 and 17. This does not prove that removing the frontier would find the answer.'},
  {code:'SINGLE_READING_CAUSE',status:'UNRESOLVED',detail:'Removing prior image judgments, the simultaneous action question, or executed history did not consistently remove observed on the FAQ sample. Position/context ablations changed some results but did not isolate one sufficient cause. The actual repair-content positive control remained observed.'},
 ],
 limits:['Saved reply replay tests control flow, not model performance.','All current-image evaluations are reconstructed diagnostic requests, not exact original API replays.','Three repeats per reading condition and two per scope condition do not establish population success rates.','The local scope comparison holds page text and answer content fixed, not exact pixels: generated badges and offered candidates change normally when a link is blocked. This measures the combined scope-policy path.','The 7-Zip forum was not fetched and whether it contains the requested answer remains unknown.','Artificial local answer pages are fixture facts, not real-site facts.','Do not equate model JEV_DONE with independently verified overall product success, or local scope causality with the cause of the historical 7-Zip failure.'],
 sources,originalsUnchanged:true,
};
await report(root,results);
const cells=(g:any)=>`<tr><td>${g.step}</td><td>${esc(g.condition)}</td><td>${g.repair.filter((v:string)=>v==='observed').length} / ${g.repair.length}</td><td>${g.password.filter((v:string)=>v==='observed').length} / ${g.password.length}</td></tr>`;
const notes=`<section class="notice" id="isolation-findings"><h2>停止原因の対照実験</h2><p>保存画像の評価 72 回と、管理下のローカルサイトでの探索 5 回を行った。本番コード、Goal の達成基準、外部サイトの許可範囲は変えていない。上段の件数と下の操作図はローカル 5 回だけの集計で、全件とも客観的成功は未検証。</p>
<h3>探索範囲の制限は停止に影響した</h3><p>同じ本文と答えを持つローカル対照では、同一オリジンは ${same.filter((r:any)=>r.reason==='JEV_DONE').length} / ${same.length} 回が JEV_DONE。別オリジンのリンクは ${cross.filter((r:any)=>r.reason==='STUCK').length} / ${cross.length} 回が STUCK で、答えの取得は 0 回だった。答えの画面から直接始めた対照は ${esc(direct.reason)}。同一オリジン制限は解除していない。禁止リンクでは生成する番号と候補集合も変わるため、画素まで同一の比較ではなく、探索範囲制御全体の対照である。</p>
<h3>制御の差し替えと、成功するかは別</h3><p>実サイトの同じ一次返答を固定した再生では、制御なしは上スクロール、現行制御は二次判断を経て STUCK になった。ただし、上スクロールの予測到達位置は既に step 15 と 17 で見ていた。制御を外せば答えが見つかる、とは確認していない。</p>
<h3>読解の単独原因は未確定</h3><p>修復方法の説明がある画像では、全条件で observed だった。一方、FAQ の画像は、過去判断・同時の操作質問・履歴を除いても observed が残った。位置情報や入力形式で一部の回答は変わったが、「記憶だけ」「履歴だけ」が原因という説明は支持できなかった。下表の observed は、正しさを独立確認した件数ではなく、Jev がその項目を現在画像で確認できたと答えた件数。</p>
${phases.map(p=>`<details><summary>${esc(({'memory-action':'過去判断と同時操作質問','history-control':'操作履歴','position-and-wrapper':'位置情報と入力形式'} as Record<string,string>)[p.phase])}の条件別結果</summary><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse"><thead><tr><th>画面 step</th><th>変更条件</th><th>修復 observed</th><th>パスワード observed</th></tr></thead><tbody>${p.groups.map(cells).join('')}</tbody></table></div>${link(p.source,'元の入力と全返答')}</details>`).join('')}
<h3>次の修正候補</h3><ol><li>探索範囲の制限で選べなかった入口を、Jev の自然な行き詰まりと区別して記録する。</li><li>一次の操作提案、コードの差し替え理由、二次判断を別々に表示する。往復防止を一律には外さない。</li><li>読解は原因が未確定のため、本番の確認済み条件を緩めない。</li></ol><p>7-Zip の外部フォーラムの内容や、サイト全体に答えがあるかは未確認。ローカルの対照から、その実サイトの停止原因や人間の UX を断定しない。</p><p><a href="summary.json">測定値と元データのハッシュ</a></p></section>`;
let html=await readFile(join(root,'index.html'),'utf8');html=html.replace('<h1>目的までの道のりを、見える形に。</h1>','<h1>停止原因を、条件を変えて確かめる。</h1>').replace('</header>',`</header>${notes}`);
await writeFile(join(root,'index.html'),html);
for(const s of sources)assert.equal(hash(await readFile(s.file)),s.sha256);
await writeFile(join(root,'summary.json'),JSON.stringify(conclusion,null,2));
const compact={...conclusion,sources:[...new Map(sources.map(s=>[s.file,s])).values()]};
await writeFile('docs/experiments/2026-10-19-isolation-results.json',JSON.stringify(compact,null,2));
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const response=await page.goto('http://127.0.0.1:5173/reports/isolation-review-2026-10-19/index.html');assert.equal(response?.status(),200);
 assert.equal(await page.locator('details.run').count(),5);
 assert.equal(await page.locator('#isolation-findings details').count(),3);assert.ok(!(await page.locator('#isolation-findings').innerText()).includes('undefined'));
 await page.screenshot({path:join(root,'desktop.png')});
 const urls=await page.locator('a[href],img[src]').evaluateAll(els=>els.map(e=>e instanceof HTMLAnchorElement?e.href:(e as HTMLImageElement).src));
 let checked=0;for(const href of new Set(urls)){const u=new URL(href);if(u.hostname!=='127.0.0.1'||u.pathname.endsWith('/'))continue;await access(resolve('.'+decodeURIComponent(u.pathname)));checked++;}
 await page.locator('#isolation-findings details').evaluateAll(nodes=>nodes.forEach(node=>(node as HTMLDetailsElement).open=true));
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:join(root,'mobile.png')});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
 await writeFile(join(root,'qa.json'),JSON.stringify({http:200,runCards:5,localLinksChecked:checked,pageErrors:errors,mobileOverflow:false,sourceHashesChecked:sources.length},null,2));
}finally{await browser.close();}
console.log(JSON.stringify({root,savedImageEvaluations:72,localLiveExplorations:5,findings:conclusion.findings,originalsUnchanged:true}));
