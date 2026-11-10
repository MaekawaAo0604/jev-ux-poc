// Saved-record comparison only; never calls Jev or revisits the sites.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {report} from '../../runner/report.js';
const integration=process.argv.includes('--integration');
const root=resolve('reports',`${integration?'vision-integration':'vision-improvement'}-${new Date().toISOString().replaceAll(':','-')}`);await mkdir(root,{recursive:true});
const cases=[
 {name:'気象庁・修正前',source:'2026-10-16T05-07-26.195Z-public',assessment:'未達',steps:[1,2,3],note:'施設等機関の一覧で停止。戻る候補はあったが選ばなかった。'},
 {name:'国立国会図書館・修正前',source:'2026-10-16T05-08-04.004Z-public',assessment:'部分達成を完了と判断',steps:[4,5],note:'登録の必要性と本人確認書類は確認したが、来館前の登録要否は未確認だった。'},
 {name:'気象庁・最終版',source:'2026-10-16T05-26-09.910Z-public',assessment:'未達・別ルートの実行は未解決',steps:[4,5,6],note:'行き止まりからBackを選ぶようになったが、戻った後に同じ枝を選び直して停止。選択した候補への移動を実行まで維持できていない。サイト全体に情報がないとは評価しない。'},
 {name:'国立国会図書館・最終版',source:'2026-10-16T05-26-22.376Z-public',assessment:'今回の保存画像では必要な情報を確認',steps:[5,7,9,10,11],note:'条件照合が判断7・9・10の完了候補を却下。本人確認書類に加え、東京本館の来館時新規登録と館内備付け申請書の説明を確認してから完了した。初期の「事前」は来館前の申込という解釈を維持した。'},
];
if(integration){
 cases[2]={name:'気象庁・統合後',source:'2026-10-16T05-43-00.571Z-public',assessment:'経路継続を確認、Goalは未達',steps:[5,6,7],note:'判断5で未探索位置へのスクロールを選び、その入口まで移動。判断6で元の操作選択が同じ施設一覧を再選択しても、既存のcontinuationでスクロールを実行した。判断7は未探索先を選べず停止。Back後の別ルート実行は制御ブラウザテストで確認したが、この実サイト試行はBack自体を選んでいない。'};
 cases[3]={name:'国立国会図書館・統合後',source:'2026-10-16T05-43-13.192Z-public',assessment:'今回の保存画像では必要な情報を確認',steps:[7,8,10,11],note:'来館時の新規登録の説明を判断7、本人確認書類を判断8で観測。判断8・10の完了候補は条件照合が却下し、判断11で完了。保存画像でも必要な説明を照合した。'};
}
const results:any[]=[],reviews:any[]=[];
for(const c of cases){
 const dir=resolve('reports',c.source,'exploration'),r=JSON.parse(await readFile(join(dir,'result.json'),'utf8')),evidence=[];
 for(const number of c.steps){
  const s=r.steps.find((s:any)=>s.number===number);assert.ok(s?.visualObservation);
  const sha256=createHash('sha256').update(await readFile(join(dir,s.screenshot))).digest('hex');assert.equal(sha256,s.visualObservation.sha256);
  evidence.push({step:number,url:s.url,file:s.screenshot,sha256});
 }
 const checks=r.steps.filter((s:any)=>s.decision?.completionCheck).map((s:any)=>({step:s.number,assessment:s.decision.completionCheck.assessment,proposed:s.decision.completionCheck.initialDecision.choice,chosen:s.decision.choice}));
 reviews.push({...c,goal:r.goalText,reason:r.reason,actions:r.actionCount,backCount:r.backCount,explorationMs:r.elapsedMs,visualAudit:r.visualCompletionAudit?.assessment,completionChecks:checks,evidence});
 results.push({...r,variant:c.name,repeat:1});
}
await report(root,results);
const review={method:'同じURLとGoalを用いた各1回の実探索と、Codexによる保存画像の照合。人間の利用者テストでも、一般精度の推定でもない。',scope:'同一オリジン、GET/HEAD、2秒間隔、max-actions 0。送信・ログイン・予約なし。成功を強制しない。',intermediateFailures:[{source:'2026-10-16T05-19-39.258Z-public',note:'21操作後にモデルAPIのHTTP400で中断。サイトUXの評価には使わない。400の詳細原因は未確定。'},{source:'2026-10-16T05-19-51.641Z-public',note:'説明文の厳密化だけでは、登録抹消の説明を見て誤完了する失敗が残った。'},...(integration?[{source:'2026-10-16T05-39-39.784Z-public',note:'Back回復だけを接続した中間版。通常移動の経路選択は未統合で、23操作後にモデルAPIのHTTP400で中断した。'}]:[])],reviews};
await writeFile(join(root,'review.json'),JSON.stringify(review,null,2));
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const heading=integration?'統合検証：経路継続は動作、気象庁のGoalは未達':'改善結果：完了判定は改善、別ルート探索は未解決が残る';
const notes=`<section class="completion-audit" id="independent-review"><h2>${heading}</h2><p>${esc(review.method)}</p><p>${esc(review.scope)}</p>${integration?'<p>制御ブラウザテストでは、Back後に操作選択が同じ枝を選び直す返答をあえて返し、選択済みの別ルートへ進むことを確認した。モデルの選択精度の検証とは区別する。</p>':''}${reviews.map((r,i)=>`<h3>${esc(r.name)}：${esc(r.assessment)}</h3><p>${esc(r.note)}</p><p>${r.actions}操作、Back ${r.backCount}回、探索 ${(r.explorationMs/1000).toFixed(1)}秒。終了後の監査時間は含まない。</p>${r.completionChecks.length?`<p>完了条件の別照合：${r.completionChecks.map((c:any)=>`判断${c.step} ${esc(c.assessment)} → ${esc(c.chosen)}`).join(' / ')}。この照合もJevの判断であり、客観的な成功証明ではない。</p>`:''}<p>${r.evidence.map((e:any)=>`<a href="#trial-${i}-screen-${e.step}">保存画面 ${e.step}</a>`).join(' / ')}</p>`).join('')}<h3>途中の失敗も保存</h3>${review.intermediateFailures.map(f=>`<p><a href="../${esc(f.source)}/index.html">中間版レポート</a>：${esc(f.note)}</p>`).join('')}<p><a href="review.json">独立照合・完了照合・画像ハッシュの記録</a></p></section>`;
const file=join(root,'index.html'),html=await readFile(file,'utf8');assert.ok(html.includes('</header>'));
// The base report's automated UX classification cannot incorporate this
// independent review of false completion. Do not advertise that count here.
await writeFile(file,html.replace(/<div><b>\d+<\/b><span>UX指標として有効<\/span><\/div>/,'').replace('</header>','</header>'+notes));
console.log(JSON.stringify({root,reviews:reviews.map(({name,assessment,actions,explorationMs})=>({name,assessment,actions,explorationMs}))}));
