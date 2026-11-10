// Summarize only completed saved probes; never rescore or edit their originals.
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve,relative} from 'node:path';
const roots=process.argv.slice(2).map(p=>resolve(p));
if(!roots.length)throw new Error('Pass the completed OCR-off probe root, then optional OCR roots');
const cohorts=await Promise.all(roots.map(async root=>({root,...JSON.parse(await readFile(join(root,'probe.json'),'utf8'))})));
if(cohorts.some(c=>c.fake||!c.experimental||!c.trials.length))throw new Error('Real completed probes only');
const off=cohorts[0];if(off.mode!=='off')throw new Error('First root must be OCR-off');
const esc=(s:unknown)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const link=(root:string,path:string)=>relative(off.root,resolve(root,path)).replaceAll('\\','/');
const median=(ns:number[])=>{const a=[...ns].sort((a,b)=>a-b),i=Math.floor(a.length/2);return a.length%2?a[i]:(a[i-1]+a[i])/2;};
const seconds=(ms:number)=>`${(ms/1000).toFixed(2)} 秒`;
const names:Record<string,string>={'image-links':'画像だけのリンクを選ぶ','image-complete':'画像内に必要情報が揃う','image-partial':'画像内の情報が不足','blocked-operation':'実行できない操作を求める','availability-information':'操作できるかを知る','split-image-history':'スクロール前後の情報を合わせる','branch-image-history':'別ページの情報を合わせる'};
const metrics=Object.fromEntries(Object.keys(off.trials[0].metrics).map(k=>[k,{checked:off.trials.reduce((s:number,t:any)=>s+t.metrics[k].checked,0),failed:off.trials.reduce((s:number,t:any)=>s+t.metrics[k].failed,0)}]));
const comparisons=cohorts.slice(1).flatMap(c=>[...new Set(c.trials.map((t:any)=>t.scenario))].map(id=>{
 const a=off.trials.filter((t:any)=>t.scenario===id),b=c.trials.filter((t:any)=>t.scenario===id);
 if(!a.length)return undefined;
 return {scenario:id,offTrials:a.length,ocrTrials:b.length,offMedianMs:median(a.map((t:any)=>t.elapsedMs)),ocrMedianMs:median(b.map((t:any)=>t.elapsedMs)),offReasons:a.map((t:any)=>t.reason),ocrReasons:b.map((t:any)=>t.reason),ocrVerificationMs:b.reduce((s:number,t:any)=>s+t.verificationMs,0),ocrVerificationRequests:b.reduce((s:number,t:any)=>s+t.verificationRequests,0),...(id==='image-links'?{literalMeasurementLimit:'Canvas link labels and overlaid numbers lack source text in this probe oracle. Original fidelity flags are retained but cannot be interpreted as OCR mistakes.'}:{ocrMemoryFidelity:b.reduce((s:any,t:any)=>({checked:s.checked+t.metrics.memoryFidelity.checked,failed:s.failed+t.metrics.memoryFidelity.failed}),{checked:0,failed:0})}),root:c.root};
}).filter(Boolean));
const clicks=off.trials.filter((t:any)=>t.scenario==='image-links');
const summary={experimental:true,production:!!off.production,sourceRoots:roots,trials:off.trials.length,offProven:off.trials.every((t:any)=>t.offProven),verificationRequests:off.trials.reduce((s:number,t:any)=>s+t.verificationRequests,0),imageLink:{trials:clicks.length,correctFirstClicks:clicks.filter((t:any)=>t.correctFirstClick).length,elapsedMs:clicks.map((t:any)=>t.elapsedMs)},metrics,comparisons};
await writeFile(join(off.root,'direct-image-review.json'),JSON.stringify(summary,null,2));
const rows=Object.entries(names).flatMap(([id,name])=>{
 const trials=off.trials.filter((t:any)=>t.scenario===id);if(!trials.length)return [];
 return [`<tr><th>${esc(name)}</th><td>${trials.map((t:any)=>`<a href="${esc(link(off.root,t.report))}">#${t.repeat}: ${esc(t.reason)}</a>`).join('<br>')}</td><td>${trials.map((t:any)=>seconds(t.elapsedMs)).join('<br>')}</td><td>${trials.map((t:any)=>`${t.actions} 操作`).join('<br>')}</td><td>${trials.map((t:any)=>`<a href="${esc(`${id}-${t.repeat}.json`)}">保持の不一致 ${t.metrics.retention.failed}/${t.metrics.retention.checked}</a>`).join('<br>')}</td></tr>`];
}).join('');
const sample=clicks[0],image=sample?link(off.root,join(sample.report,'../exploration/step-1.png')):undefined;
const note=`<section class="completion-audit" id="direct-image-findings"><h2>${off.production?'本番統合：':'実験：'}OCR なしで画像から操作を選ぶ</h2>
<p>実 Jev と既存の Playwright 探索を使い、${off.trials.length} 試行を順番に実行した。${off.production?'本番の --vision 経路を使用し、OCR や操作を差し替える実験用アダプタは読み込んでいない。読み込んだ計測処理は、実際の画像・操作・送信内容を記録し、実 API の応答は変更しない。':'OCR エンジンの起動、文字候補の照合、OCR 文字メモを実験用アダプタで無効化した。本番の既定動作は変更していない。'}</p>
<p>画像だけのリンクでは、正しい入口を最初に選べたのは ${summary.imageLink.correctFirstClicks}/${clicks.length} 回。操作候補の説明は画像上の番号と対応させ、候補の文字ラベルや遷移先 URL、正解、手順は渡していない。${clicks.map((t:any)=>seconds(t.elapsedMs)).join('、')}で 1 操作の探索を終えた。配置は試行間で変更した。時間は探索部分であり、起動と終了後の画像監査を含まない。</p>
${image?`<figure><img style="max-width:100%;height:auto" src="${esc(image)}" alt="OCR なしの現在画像。番号付きの3つの画像リンクから月額料金を選ぶ"><figcaption>文字は canvas に描いた。DOM の操作候補には文字がなく、Jev は現在画像の番号を選んだ。</figcaption></figure>`:''}
<p>OCR 照合リクエストは ${summary.verificationRequests} 件。現在画像は各判断で 1 枚だけ送り、過去の画像は再送していない。元の画像を使う終了後の監査は探索と別であり、操作判断には戻していない。</p>
<h3>OCR なしの結果</h3><div style="overflow-x:auto"><table><thead><tr><th>課題</th><th>終了状態（各試行）</th><th>探索時間</th><th>操作数</th><th>過去情報の提供</th></tr></thead><tbody>${rows}</tbody></table></div>
<p>選択と実操作の照合は ${metrics.execution.checked} 件中 ${metrics.execution.failed} 件不一致、現在画像の照合は ${metrics.images.checked} 件中 ${metrics.images.failed} 件不一致。完了主張に必要な画面観測の欠落は ${metrics.falseCompletion.checked} 件中 ${metrics.falseCompletion.failed} 件。完了していない試行をこの分母へ入れていない。回答内容の意味や数字を独立検証した結果ではない。</p>
<p>画像だけにある過去情報は、画像を外すと入力から消える。保持の不一致は ${metrics.retention.failed}/${metrics.retention.checked} 件だった。同じ欠落を複数の判断で数えるため、独立した不具合数ではない。これは試した入力構成の不足であり、サイトの UX が悪いという証拠には使わない。空の文字メモでは OCR の正確性を測れず、文字照合の失敗がゼロになったとは主張しない。</p>
${comparisons.length?`<h3>同じ課題で OCR を戻した比較</h3><p>OCR なしは各 ${off.repeats} 回、OCR ありの回数は下表の通り。少数かつ実行順を無作為化していない予備比較であり、速度差の一般化や統計的な優位性は主張しない。</p><div style="overflow-x:auto"><table><thead><tr><th>課題</th><th>OCR なしの探索時間中央値</th><th>OCR ありの探索時間中央値</th><th>OCR ありの終了状態</th><th>OCR 照合</th></tr></thead><tbody>${comparisons.map((c:any)=>`<tr><th>${esc(names[c.scenario]??c.scenario)}</th><td>${seconds(c.offMedianMs)} (${c.offTrials} 回)</td><td>${seconds(c.ocrMedianMs)} (${c.ocrTrials} 回)</td><td><a href="${esc(link(c.root,'index.html'))}">${esc(c.ocrReasons.join(', '))}</a></td><td>${c.ocrVerificationRequests} 回、計 ${seconds(c.ocrVerificationMs)}</td></tr>`).join('')}</tbody></table></div><p>文字メモの測定値は比較元の原本に残した。ただし画像リンクの試行は、描画したリンク文字と番号を文字照合用の正解データに登録していないため、その不一致を OCR の誤読とは解釈できない。クリック先と現在画像の照合にはこの制約はない。記憶が提供されること、文字が正確であること、Goal の完了を Jev が認識することは別の測定である。</p>`:''}
<h3>変更範囲と次の判断</h3><p>${off.production?'番号付けは公開サイト用とローカル用が同じ AccountPage.captureDecisionScreenshot を使う。--vision は OCR なし、--vision --vision-ocr は番号なしの画像と OCR を使う従来経路として分離した。画面の番号と対象位置は visualTargets に保存する。':'番号付けと OCR 無効化は docs/experiments 内の実験用アダプタのみ。'}既存の候補収集、Jev の操作選択、完了照合、経路継続、Playwright の操作、安全制限を再利用した。文字のないリンクは既存の安全分類が link の候補に限って番号で提供した。任意座標のクリックや、フォーム送信の許可は追加していない。</p>
<p>現在画像からの操作選択と、過去画面の内容保持を別に扱う構成を検討できる。画像だけの過去情報をどう残すかは未解決であり、OCR を外すだけで全課題が解決したとは言えない。実サイト、混雑した画面、重なった候補では未検証。</p>
<p><a href="probe.json">試行一覧</a> / <a href="direct-image-review.json">集計値</a>。固定応答の配線確認と、初期の描画アダプタのエラー試行は実 Jev の結果に含めていない。</p></section>`;
const file=join(off.root,'index.html'),html=await readFile(file,'utf8');
await writeFile(file,html.replace(/<section class="completion-audit" id="direct-image-findings">[\s\S]*?<\/section>/,'').replace('</header>','</header>'+note));
console.log(JSON.stringify(summary,null,2));
