// Extend an existing diagnostic report from saved evidence only. No API/site calls.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
import {createHash} from 'node:crypto';
const [root,field,...previous]=process.argv.slice(2).map(p=>resolve(p));
if(!root||!field)throw new Error('Usage: resolution-review.ts MATRIX FIELD [PREVIOUS_MATRIX...]');
const read=async(file:string)=>JSON.parse(await readFile(file,'utf8'));
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const href=(file:string)=>esc(relative(root,file).replaceAll('\\','/'));
const cohorts=[];
for(const dir of [root,...previous]){
 const data=await read(join(dir,'measurements.json'));if(data.fake)throw new Error('Only real model cohorts belong in this review');
 const primaryPreservation:{checked:number;stopped:number;examples:{trial:string;step:number;choice:string}[]}={checked:0,stopped:0,examples:[]};
 for(const trial of data.trials){
  const raw=await read(join(dir,`${trial.scenario}-${trial.repeat}.json`));
  for(const step of raw.input.result.steps){
   const request=step.visualContext?.requests?.find((r:any)=>r.step===step.number&&r.stage==='decision'&&r.status==='recorded'&&r.answers?.nextAction);
   const choice=request?.answers.nextAction.choice,action=step.candidates?.[choice]?.action,offer=step.frontier;
   if(!action||!['click','scroll'].includes(action.type)||!offer||!step.decision)continue;
   const continuing=offer.continuation?.focus===JSON.stringify([step.state.goal])&&offer.targets[offer.continuation.targetId];
   const direct=Object.values(offer.targets).filter((t:any)=>t.travelSteps===0&&t.nextChoice===choice&&t.kind===action.type);
   if(continuing||direct.length!==1)continue;
   primaryPreservation.checked++;
   if(step.decision.action.type==='stuck'){primaryPreservation.stopped++;primaryPreservation.examples.push({trial:`${trial.scenario}-${trial.repeat}`,step:step.number,choice});}
  }
 }
 const totals=Object.fromEntries(Object.keys(data.trials[0].metrics).map(key=>[key,{checked:data.trials.reduce((n:number,t:any)=>n+t.metrics[key].checked,0),failed:data.trials.reduce((n:number,t:any)=>n+t.metrics[key].failed,0)}]));
 cohorts.push({dir,trials:data.trials.length,done:data.trials.filter((t:any)=>t.reason==='JEV_DONE').length,affected:data.trials.filter((t:any)=>t.middlewareFailures>0).length,totals,primaryPreservation,observedButStopped:data.trials.filter((t:any)=>t.reason==='STUCK'&&t.evidenceSatisfied).map((t:any)=>`${t.scenario}-${t.repeat}`)});
}
const result=await read(join(field,'exploration/result.json'));
const fieldStage='この実サイト試行は、DOM 空白の境界修正と通常操作の二重判断修正より前の保存原本。最終版で新たに再探索した結果ではない。';
const evidence=[];
for(const text of ['記入用紙は館内','個人番号カード']){
 const step=result.steps.find((s:any)=>s.state?.screen?.text?.some((t:string)=>t.includes(text)));if(!step?.visualObservation)throw new Error('Missing field source');
 const number=step.number;
 const bytes=await readFile(join(result.dir,step.screenshot)),sha256=createHash('sha256').update(bytes).digest('hex');
 if(sha256!==step.visualObservation.sha256)throw new Error('Field source hash changed');
 evidence.push({step:number,file:join(result.dir,step.screenshot),sha256,url:step.url});
}
const requests=result.steps.at(-1)?.visualContext?.requests??[];
const requestMs=(stage:string)=>requests.filter((r:any)=>r.stage===stage).reduce((n:number,r:any)=>n+r.elapsedMs,0);
const review={createdAt:new Date().toISOString(),cohorts,field:{dir:field,reason:result.reason,actions:result.actionCount,explorationMs:result.elapsedMs,literalVerificationMs:requestMs('verification'),decisionMs:requestMs('decision'),otherExplorationMs:result.elapsedMs-requestMs('verification')-requestMs('decision'),domAuditMs:result.completionAudit?.elapsedMs,visualAuditMs:result.visualCompletionAudit?.elapsedMs,modelAudit:result.visualCompletionAudit?.assessment,objectiveVerified:false,evidence,independentReview:'Codexが保存画像で来館時の新規登録と館内の記入用紙、本人確認書類と記載事項・有効期間を照合した。人間の利用者テストやサイト全体の正解認定ではない。'},limits:['画像文字のJev承認は独立検証ではない。Goal・履歴を除いた照合、現在画像の拡大、候補からの選択を試したが、誤字承認を解消できていない。','過去画像を再送せず、情報を切り捨てない方式でも、任意の長さの探索を有限のAPI入力枠へ収める保証はない。','制御サイトのfalseCompletionは必要情報が観測されたかだけを測り、最終回答の意味全体を独立評価していない。','Windows OCRの利用可否と日本語認識は実行環境に依存する。','費用の未返却は0円ではない。OCR時間・ブラウザ時間・待機時間は残余時間の内訳として個別計測していない。']};
await writeFile(join(root,'resolution-review.json'),JSON.stringify({...review,field:{...review.field,sourceStage:fieldStage}},null,2));
const names:Record<string,string>={observation:'DOM観測',images:'現在画像と拡大画像',execution:'選択と実操作',history:'履歴',routeContinuation:'別ルート継続',retention:'必要情報の保持',memoryFidelity:'文字と出典',falseCompletion:'完了主張の必要根拠',separation:'検証用正解の非送信'};
const current=cohorts[0];
const section=`<section class="completion-audit" id="resolution-findings"><h2>修正後の確認と残る限界</h2>
<p>観測の欠落、出典の重複、局所履歴の欠落を修正した。現在の画像と操作記録を分け、過去画像は再送しない。Goal 達成へ誘導する経路や正解は与えていない。</p>
<p>${current.trials} 試行中、Jev の完了判断 ${current.done}、独立照合の不一致がある試行 ${current.affected}。未完了そのものは不具合ではない。不一致を検出した試行はサイトの UX 評価に使わない。</p>
<ul>${Object.entries(current.totals).map(([key,t]:any)=>`<li>${esc(names[key])}：${t.checked} 照合、不一致 ${t.failed}${!t.checked?'（未測定）':''}</li>`).join('')}</ul>
<h3>操作選択を停止へ上書きしていた不具合</h3><p>前版では、画面を見た最初の Jev が下スクロールを選んだ後、別ルート用の二度目の判断が停止へ上書きした。転送・履歴の測定だけではこの上書きを検出できていなかったため、前版をモデルの問題だけとは扱わない。</p><p>現在の未実行対象に一意に対応する click／scroll は、最初の選択をそのまま既存の探索記録へ確定する。確定済み経路、経由移動、Back、対応が曖昧な場合は既存の別ルート判断を使う。完了照合は省略していない。</p><p>保存された最初の API 回答と最終判断を独立に読み比べると、現行 ${current.primaryPreservation.checked} 対象中、停止への上書き ${current.primaryPreservation.stopped}。${cohorts.slice(1).map(c=>`比較原本 ${esc(c.dir.split(/[\\/]/).at(-1))}：${c.primaryPreservation.stopped}/${c.primaryPreservation.checked}`).join('。')}。この追加診断は既存の測定原本を再採点して上書きした値ではない。</p>
<h3>修正した箇所</h3><ul><li>画像文字の照合には Goal・操作履歴・過去メモを渡さず、操作選択より前に行う。</li><li>DOM ですでに観測した文字は再解釈しない。大きな外接矩形ではなく、実際に可視性を確認した連続文字の矩形を使う。画像を挟む空白と混在行は除外しない。</li><li>同じ画像で確認済みの文字に、別 OCR の矛盾する重複候補を重ねて保存しない。</li><li>現在画像の拡大は元画素だけを最近傍法で写す。非整数倍率を含め、検証側が全画素と元ハッシュを照合する。</li><li>ローカル探索も公開サイトと同じ観測履歴の保存処理を使う。</li><li>独立照合で既知の不一致がある試行を、モデル監査が supported でも UX 有効件数に含めない。</li></ul>
<h3>実サイトの保存画像照合</h3><p><a href="${href(join(field,'index.html'))}">国立国会図書館の探索原本</a>：${esc(result.reason)}、${result.actionCount} 操作、探索 ${(result.elapsedMs/1000).toFixed(1)} 秒。${esc(review.field.independentReview)}</p><p>${esc(fieldStage)}</p>
<p>文字照合の通信 ${(requestMs('verification')/1000).toFixed(1)} 秒、判断通信 ${(requestMs('decision')/1000).toFixed(1)} 秒、その他探索 ${(review.field.otherExplorationMs/1000).toFixed(1)} 秒。終了後の画像監査 ${((result.visualCompletionAudit?.elapsedMs??0)/1000).toFixed(1)} 秒は探索時間と別。通信は追加照合も含むが、残余を OCR だけの時間とは扱わない。</p>
<p>${evidence.map(e=>`<a href="${href(e.file)}">保存画像 ${e.step}</a>`).join(' / ')}。モデルの supported と独立した全面達成の保証は区別する。</p>
<h3>まだ解消していないこと</h3><ul>${review.limits.map(s=>`<li>${esc(s)}</li>`).join('')}</ul>
<p>検証側の必要情報を観測済みでも Jev が未完了を選んだ試行：${current.observedButStopped.length}（${esc(current.observedButStopped.join('、')||'該当なし')}）。これは最終回答の意味全体の正しさを認定した値ではない。モデルの終了判断、必要情報の観測、終了後の再評価を同一視しない。</p>
<p>別ルート判断が停止を選んだ際、保存する確率を 100% に置き換えていた表示上の問題も修正した。現行コードは実際の候補別確率と confidence を保持する。上記の実探索原本はこの確率表示修正前の値を残しており、書き換えていない。操作選択の変更ではなく、固定応答の回帰と全体テストで検証する。</p>
<p>画像内の「サポート」を「サポ-ト」、「では」を「ては」と読む候補を、Jev が承認した原本を残した。画像転送や保存処理の取り違えではなく、照合応答の誤承認まで追跡した。ただし、別モデルでも解決不能だと一般化していない。現構成のまま全文字の正しさを保証する修正には到達していない。</p>
<details><summary>修正途中の失敗原本も確認する</summary><ul>${cohorts.map(c=>`<li><a href="${href(join(c.dir,'index.html'))}">${esc(c.dir.split(/[\\/]/).at(-1))}</a>：${c.trials} 試行、不一致あり ${c.affected}。文字と出典 ${c.totals.memoryFidelity.failed}/${c.totals.memoryFidelity.checked} 不一致。</li>`).join('')}</ul></details>
<p><a href="resolution-review.json">集計・実サイト出典・留保の JSON</a> / <a href="measurements.json">試行ごとの全測定原本</a></p></section>`;
const file=join(root,'index.html');let html=await readFile(file,'utf8');
html=html.replace(/<section class="completion-audit" id="resolution-findings">[\s\S]*?<\/section>/,'');
await writeFile(file,html.replace('</header>','</header>'+section));console.log(JSON.stringify({report:file,trials:current.trials,affected:current.affected}));
