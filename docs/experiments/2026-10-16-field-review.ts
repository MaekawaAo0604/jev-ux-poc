// Rebuild a local review from saved trials only. No API calls or site access.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {report} from '../../runner/report.js';

const cases=[
 {name:'気象庁',source:'2026-10-16T05-07-26.195Z-public',assessment:'未達（観察した範囲）',checkedSteps:[1,2,3],confirmed:[],missing:['気象科学館の開館時間','休館日','予約の要否'],note:'施設等機関の一覧で停止した。戻る操作は候補に残っていた。サイト全体で情報が見つからないという意味ではない。',rules:'https://www.jma.go.jp/jma/kishou/info/coment.html',robots:'404：robots.txtなし'},
 {name:'国立国会図書館',source:'2026-10-16T05-08-04.004Z-public',assessment:'部分達成／事前条件は未確認',checkedSteps:[4,5],confirmed:['資料閲覧などに利用者登録が必要という説明','本人確認書類と記載事項の説明'],missing:['来館前に申込を済ませることが必須か、当日登録でもよいか'],note:'Goalの「事前」を来館前の申込と解釈して厳密に照合した。登録そのものの必要性と、来館前の申込の要否は同一ではない。Jevは達成と回答したが、保存画像だけでは全面達成を確定しない。',rules:'https://www.ndl.go.jp/sitepolicy',robots:'User-agent: * / Allow: /'},
];
const root=resolve('reports',`vision-field-validation-${new Date().toISOString().replaceAll(':','-')}`);await mkdir(root,{recursive:true});
const results:any[]=[],reviews:any[]=[];
for(const c of cases){
 const dir=resolve('reports',c.source,'exploration');
 const result=JSON.parse(await readFile(join(dir,'result.json'),'utf8'));
 const evidence=[];
 for(const number of c.checkedSteps){
  const step=result.steps.find((s:any)=>s.number===number);assert.ok(step?.visualObservation);
  const bytes=await readFile(join(dir,step.screenshot));const sha256=createHash('sha256').update(bytes).digest('hex');assert.equal(sha256,step.visualObservation.sha256);
  evidence.push({step:number,url:step.url,file:step.screenshot,sha256});
 }
 reviews.push({...c,goal:result.goalText,modelTermination:result.reason,modelAudit:result.visualCompletionAudit?.assessment,actions:result.actionCount,explorationMs:result.elapsedMs,visualAuditMs:result.visualCompletionAudit?.elapsedMs,evidence});
 results.push({...result,variant:c.name,repeat:1});
}
await report(root,results);
const review={method:'Codexによる保存画像の独立照合。人間の利用者テストではなく、サイト全体の不存在を判定したものでもない。',scope:'URLとGoalのみで各1回。正解の手順や回答は探索に渡していない。GET/HEADの閲覧、同一オリジン内、操作間隔2秒。ログイン・送信・予約は未実施。',reviews};
await writeFile(join(root,'review.json'),JSON.stringify(review,null,2));
const escape=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const notes=`<section class="completion-audit" id="independent-review"><h2>実サイト試行の保存画像照合</h2><p>${escape(review.method)}</p><p>${escape(review.scope)}</p>${reviews.map((r,index)=>`<h3>${escape(r.name)}：${escape(r.assessment)}</h3><p>${escape(r.note)}</p><p>Jev探索：${escape(r.modelTermination)}。画像監査：${escape(r.modelAudit)}。${r.actions}操作、探索 ${(r.explorationMs/1000).toFixed(1)}秒。</p><p>確認済み：${escape(r.confirmed.join('、')||'Goalに必要な具体的情報は確認できない')}</p><p>未確認：${escape(r.missing.join('、'))}</p><p>${r.evidence.map((e:any)=>`<a href="#trial-${index}-screen-${e.step}">保存画面 ${e.step}</a>`).join(' / ')}</p>`).join('')}<p><a href="review.json">照合結果・出典・画像ハッシュの記録</a></p></section>`;
const file=join(root,'index.html'),html=await readFile(file,'utf8');assert.ok(html.includes('</header>'));await writeFile(file,html.replace('</header>','</header>'+notes));
console.log(JSON.stringify({root,results:reviews.map(r=>({site:r.name,assessment:r.assessment,modelAudit:r.modelAudit}))}));
