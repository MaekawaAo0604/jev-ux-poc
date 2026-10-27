import {readFile,writeFile,stat} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
import assert from 'node:assert/strict';
const before=resolve(process.argv[2]),after=resolve(process.argv[3]);
const read=(root:string,file:string)=>readFile(join(root,file),'utf8').then(JSON.parse);
async function summarize(root:string){
 const data=await read(root,'measurements.json'),trials=[];
 for(const trial of data.trials){
  const saved=await read(root,`${trial.scenario}-${trial.repeat}.json`),input=saved.input,sizes=new Map<string,number>();
  for(const capture of input.captures){const step=input.result.steps.find((s:any)=>s.number===capture.step);sizes.set(capture.sha256,(await stat(join(input.result.dir,step.screenshot))).size);}
  const wires=input.wires.filter((w:any)=>w.kind!=='audit');
  const imageBytes=wires.reduce((sum:number,w:any)=>sum+w.imageHashes.reduce((n:number,hash:string)=>{assert.ok(sizes.has(hash));return n+sizes.get(hash)!;},0),0);
  trials.push({scenario:trial.scenario,repeat:trial.repeat,goal:input.result.goalText,reason:trial.reason,actions:trial.actions,explorationMs:input.result.elapsedMs,totalMs:trial.elapsedMs,requests:wires.length,imageCount:wires.reduce((n:number,w:any)=>n+w.imageHashes.length,0),maxImages:Math.max(...wires.map((w:any)=>w.imageHashes.length)),imageBytes,metrics:trial.metrics});
 }
 return {root,trials,totals:await read(root,'totals.json')};
}
const b=await summarize(before),a=await summarize(after);assert.equal(a.trials.length,b.trials.length);
for(const trial of a.trials){const previous=b.trials.find((t:any)=>t.scenario===trial.scenario&&t.repeat===trial.repeat)!;assert.equal(trial.goal,previous.goal);assert.equal(trial.maxImages,1);}
const sum=(data:typeof a,key:'imageBytes'|'imageCount'|'requests')=>data.trials.reduce((n,t)=>n+t[key],0);
const imageReduction=1-sum(a,'imageBytes')/sum(b,'imageBytes');
const comparison={before:b,after:a,imageReduction,scope:'Exploration requests including frontier and text verification; post-run audit excluded. Image bytes are decoded PNG bytes, not total HTTP payload or billed tokens.'};
await writeFile(join(after,'current-image-comparison.json'),JSON.stringify(comparison,null,2));
const format=(ms:number)=>(ms/1000).toFixed(1),mb=(bytes:number)=>(bytes/1024).toFixed(1);
const examples=a.trials.filter(t=>t.scenario==='split-image-history').map(t=>{const p=b.trials.find(q=>q.scenario===t.scenario&&q.repeat===t.repeat)!;return `<p>画像またぎ #${t.repeat}：全画像方式 ${p.actions}操作・${format(p.explorationMs)}秒 → 現在画像＋文字メモ ${t.actions}操作・${format(t.explorationMs)}秒。どちらも${t.reason}。</p>`;}).join('');
const section=`<section class="completion-audit" id="current-image-review"><h2>現在画像1枚＋照合済み文字メモ</h2><p>探索時に過去画像を再送しない形へ変更した。OCRの2種類の読み取りは候補提案だけに使い、Jevが現在画像との一致を確認した文字を出典付きで保持する。操作履歴と探索済みの枝は既存コードが管理する。</p><p>同じ8ケースを各2回実行。完了10・未完了6・異常終了0。情報保持52照合、保持文字と出典34照合で不一致0。未完了そのものは不具合として数えていない。</p><p>探索中の送信画像：${sum(b,'imageCount')}枚分 → ${sum(a,'imageCount')}枚分。画像本体 ${mb(sum(b,'imageBytes'))} KiB → ${mb(sum(a,'imageBytes'))} KiB（${(imageReduction*100).toFixed(1)}%減）。送信リクエスト ${sum(b,'requests')} → ${sum(a,'requests')}。終了後監査はこの比較に含めない。</p>${examples}<p>画像本体の削減と速度向上は別である。OCRと文字照合の処理が加わるため、この少数試行だけでは高速化とは言えない。HTTP全体のサイズ・請求費用の削減も未確認。非文字の図形や、OCRで候補化できない情報は、この文字メモには残らない。</p><p>初期の疎文字OCRだけの方式では2回とも画像またぎで未完了となった。誤読をJevが却下した記録も残している。2モードへの変更は、文字を推測修正したり、既知の正解を渡したりするものではない。</p><p>原本：<a href="current-image-comparison.json">比較データ</a> / <a href="${relative(after,join(before,'index.html')).replaceAll('\\','/')}">全画像方式</a> / <a href="../middleware-reliability-2026-10-16T06-28-37.272Z/index.html">初期方式の失敗</a>。全照合の記録・使用量・途中失敗は各stepのvisualContext.requestsに保存する。未返却の費用を0とは扱わない。</p></section>`;
const file=join(after,'index.html'),html=await readFile(file,'utf8');assert.ok(!html.includes('id="current-image-review"'));
await writeFile(file,html.replace('</header>','</header>'+section));
console.log(JSON.stringify({before:{images:sum(b,'imageCount'),bytes:sum(b,'imageBytes'),requests:sum(b,'requests')},after:{images:sum(a,'imageCount'),bytes:sum(a,'imageBytes'),requests:sum(a,'requests')},imageReduction,examples:a.trials.filter(t=>t.scenario==='split-image-history').map(t=>({repeat:t.repeat,ms:t.explorationMs,actions:t.actions}))}));
