import {writeFile,access} from 'node:fs/promises';
import {join,relative,resolve} from 'node:path';
import {reportStyle} from './report-style.js';

const escape=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function probabilityLabels(step:any){
  return Object.entries(step.decision?.probabilities||{}).sort((a,b)=>Number(b[1])-Number(a[1])).map(([id,p])=>`${step.candidates?.[id]?.label||id} (${id}): ${(Number(p)*100).toFixed(1)}%`).join('\n');
}
type Outcome={label:string;kind:string;note:string};
function outcome(reason:string):Outcome{
  const labels:Record<string,Outcome>={
    SUCCESS:{label:'処理成功',kind:'success',note:'スクリプトの成功条件を満たしました。'},
    STUCK:{label:'途中停止',kind:'stuck',note:'Jevが次の操作を選べず終了しました。'},
    LOOP:{label:'ループで停止',kind:'loop',note:'同じ状態・操作の繰り返しを検知し、実行せず停止しました。'},
    JEV_DONE:{label:'Jevが完了と判断',kind:'unverified',note:'Jevの判断による終了です。処理成功の確認とは区別します。'},
    DONE_WITHOUT_SUCCESS:{label:'未達で完了判断',kind:'unverified',note:'Jevは完了と判断しましたが、成功条件を満たしていません。'},
    DECISION_ERROR:{label:'判断APIエラー',kind:'error',note:'判断処理に失敗しました。UXの問題とは区別します。'},
    REOBSERVE:{label:'画面の変化を再観測',kind:'unverified',note:'API待機中に表示が変わったため、古い判断では操作せず、次の画面で判断し直しました。'},
    GOAL_CONFIG_ERROR:{label:'目的の項目分けが不十分',kind:'error',note:'チェック項目が目的を網羅していると確認できず、操作を停止しました。サイトの問題とは区別します。'},
    ACTION_ERROR:{label:'操作エラー',kind:'error',note:'操作の実行中に失敗しました。操作が完了したとは限りません。'},
    PAGE_ERROR:{label:'ページエラー',kind:'error',note:'ページの読み込み・実行などで問題が発生しました。'},
    ACTION_LIMIT:{label:'操作上限',kind:'limit',note:'設定された操作数の上限で終了しました。'},
    UNSUPPORTED_CONTENT:{label:'未対応コンテンツ',kind:'limit',note:'PDFなど、ツールが読めない内容です。UXの問題とは区別します。'},
    SAFETY_BOUNDARY:{label:'探索範囲外で停止',kind:'limit',note:'外部遷移・未対応の操作・アクセス制限などにより停止しました。UXの問題とは区別します。'},
  };
  return labels[reason]||{label:reason||'終了理由不明',kind:'unknown',note:'記録された結果を確認してください。'};
}
function completionLabel(r:any){
  if(!r.successMode)return 'Jevの完了認識は未計測（旧形式のログ）';
  const labels:Record<string,string>={CONFIRMED_SUCCESS:'処理成功・Jevの完了認識あり',FALSE_COMPLETION:'成功条件を満たさず完了と判断',SUCCESS_NOT_RECOGNIZED:'処理成功・Jevの完了認識なし',NOT_ASSESSED:'処理成功・完了認識は未計測',NOT_ACHIEVED:'成功条件は未達',ASSESSMENT_INTERRUPTED:'処理成功・完了認識の確認中にエラー',UNVERIFIED:'処理成功は未検証'};
  return labels[r.comparison]||'処理成功と完了認識の照合結果なし';
}
function completionEvidence(r:any,index:number){
 const audit=r.completionAudit;
 if(!audit||audit.status==='NOT_RUN')return '<p class="hint">完了判断の根拠の記録なし（未実行または旧形式のログ）。</p>';
 const labels:Record<string,string>={supported:'記録に達成の根拠があると再評価',insufficient:'記録では達成の根拠が不足',uncertain:'記録からは判断できない'};
 if(audit.status==='ERROR'){
  const stages:Record<string,string>={input:'入力の組み立て',request:'API通信','response-validation':'返答形式の検証'};
  const failure=audit.error?`<p>失敗箇所：${escape(stages[audit.error.stage]||'不明')} · ${escape(audit.error.code)}${audit.error.statusCode?` (HTTP ${escape(audit.error.statusCode)})`:''}</p>`:'';
  const partial=labels[audit.assessment]?`<p><span class="badge unverified">${escape(labels[audit.assessment])}</span></p><p>全体の再評価は記録済みですが、詳細の確認は未完了です。客観的な成功確認ではありません。</p>`:'';
  return `<section class="completion-audit"><h2>完了判断の根拠</h2><p>根拠の確認に失敗しました。探索時の完了判断は変更していません。保存済みの入力・画像を確認してください。</p>${partial}${failure}</section>`;
 }
 const warningLabels:Record<string,string>={NO_EVIDENCE_SELECTED:'達成を裏付けるという回答ですが、根拠の表示が選ばれていません。',AUDIT_INPUT_TRUNCATED:'入力上限により観察記録の一部を省略しました。全記録を確認した結果ではありません。'};
 const entries=(audit.evidence||[]).map((entry:any)=>{
  const number=Number(entry.step),source=entry.source==='action-result'?'操作結果の記録':'DOM由来の表示';
  const link=Number.isInteger(number)&&number>0&&number<=(r.steps?.length||0)?`<a href="#trial-${index}-screen-${number}">画面 ${number} を確認</a>`:escape(source);
  return `<li><div class="evidence-meta">${link} · ${escape(entry.id)} · ${escape(source)}</div><blockquote>${escape(entry.text)}</blockquote></li>`;
 }).join('');
 return `<section class="completion-audit"><h2>完了判断の根拠（終了後の確認）</h2><p><span class="badge unverified">${escape(labels[audit.assessment]||'再評価の記録')}</span></p><p class="hint">探索終了後に、観察記録をJevで再評価した結果です。探索時の思考過程の記録でも、客観的な成功確認ではありません。</p>${(audit.warnings||[]).map((w:string)=>`<p class="notice">${escape(warningLabels[w]||w.replace('PARTIAL_TEXT','一部が隠れた文字を含むため、表示の一部だけを記録しています。').replace('POSSIBLE_PAINT_OVERLAP','重なりを判定しきれない描画要素があるため、一部の文字を除外しています。'))}</p>`).join('')}${entries?`<ul class="evidence-list">${entries}</ul>`:'<p>根拠として選ばれた表示はありません。</p>'}${audit.uncertainEvidence?.length?`<p class="hint">根拠として扱えるか判断できなかった表示：${audit.uncertainEvidence.length}件。詳細は実行ログに記録しています。</p>`:''}</section>`;
}
const badge=(o:Outcome)=>`<span class="badge ${o.kind}">${escape(o.label)}</span>`;
function goalProgress(step:any,trialIndex:number,stepCount:number){
 const assessment=step?.decision?.goalAssessment||step?.goalAssessment;
 if(!assessment)return '';
 const labels:Record<string,string>={present:'取得済み',absent:'未取得・不足',uncertain:'判定保留'};
 const quotes=(entries:any[])=>`<ul class="evidence-list">${entries.map(e=>{
  const number=Number(e.step),link=Number.isInteger(number)&&number>0&&number<=stepCount?`<a href="#trial-${trialIndex}-screen-${number}">画面 ${number} を確認</a>`:'観察本文';
  return `<li><div class="evidence-meta">${link} · ${escape(e.id)}</div><blockquote>${escape(e.text)}</blockquote>${e.warnings?.length?`<p class="hint">${escape(e.warnings.join(', '))}</p>`:''}${e.omitted?'<p class="hint">観察の一部省略あり</p>':''}</li>`;
 }).join('')}</ul>`;
 const checks=(assessment.checks||[]).map((c:any,i:number)=>{
  const proof=assessment.grounding?.checks?.[i];
  if(!proof)return `<li>${escape(c.text)}：${escape(labels[c.choice]||c.choice)}（一次判定。根拠の照合は未実行）</li>`;
  const scopeLabels:Record<string,string>={match:'対象一致',mismatch:'対象不一致',uncertain:'対象の適用は不明'};
  const scope=scopeLabels[proof.scope?.choice]||'未判定';
  const scopeAudit=proof.scopeEvidence?.length?`<details><summary>引用ごとの対象確認 ${proof.scopeEvidence.length} 件</summary>${proof.scopeEvidence.map((entry:any)=>`<p>${escape(scopeLabels[entry.assessment?.choice]||'未判定')}</p>${quotes([entry.quote])}`).join('')}</details>`:'';
  const label=!proof.evidence?.length?'直接の根拠なし':proof.scope?.choice!=='match'?scope:!proof.assessment?'根拠の照合未完了':proof.assessment.choice!=='present'?labels[proof.assessment.choice]||'判定保留':!proof.contradictions?'矛盾・例外の照合未完了':proof.contradictions.choice!=='present'?'矛盾・例外の確認が必要':labels[c.choice]||'判定保留';
  const batchLabels:Record<string,string>={present:'矛盾なしと判断',absent:'矛盾・例外ありと判断',uncertain:'判定保留'};
  const batchAudit=Array.isArray(proof.contradictionBatches)?`<details><summary>矛盾・例外の確認：${proof.contradictionBatches.length} / ${escape(proof.contradictionBatchCount??'?')} バッチ</summary><p class="hint">全バッチの確認が済むまで、この項目を取得済みにはしません。</p>${proof.contradictionBatches.map((batch:any,i:number)=>`<p>バッチ ${i+1}：${escape(batchLabels[batch.assessment?.choice]||'未判定')} · ${escape((batch.blockKeys||[]).join(', '))}</p>`).join('')}</details>`:'';
  return `<li><h3>${escape(c.text)}：${escape(label)}</h3><p class="hint">一次判定：${escape(labels[c.choice]||c.choice)}。対象の適合性：${escape(scope)}。情報の十分性：${escape(proof.assessment?labels[proof.assessment.choice]||proof.assessment.choice:'未判定')}。直接の根拠・対象一致・十分性・矛盾の確認が済まなければ完了にはしません。</p>${quotes(proof.evidence||[])}${scopeAudit}${batchAudit}${proof.relatedEvidence?.length?`<details><summary>関連する説明（直接の根拠とは区別）${proof.relatedEvidence.length} 件</summary>${quotes(proof.relatedEvidence)}</details>`:''}${proof.uncertainEvidence?.length?`<details><summary>根拠として扱えるか不明 ${proof.uncertainEvidence.length} 件</summary>${quotes(proof.uncertainEvidence)}</details>`:''}</li>`;
 }).join('');
 const screening=assessment.grounding?.screening;
 const focus=step.decision?.navigationFocus;
 const priorities=focus?`<p class="hint">今回の探索で優先：${escape(focus.priorityGoalChecks.join(' / '))}</p>${focus.verificationPendingGoalChecks.length?`<p class="hint">一次判定では情報あり・根拠確認は未完了：${escape(focus.verificationPendingGoalChecks.join(' / '))}</p>`:''}`:'';
 return `<section class="completion-audit"><h2>探索中の到達判定</h2><p class="hint">観察済み情報についての Jev の判断です。客観的な成功確認とは区別します。項目の網羅性：${assessment.coverage?.choice==='complete'?'確認済み':'未確認'}。</p>${priorities}${step.decisionStage?`<p>中断した段階：${escape(step.decisionStage)}</p>`:''}${screening?`<details><summary>スクリーニング：${screening.length} ブロック（関連 ${screening.filter((b:any)=>b.assessment.choice==='relevant').length}・保留 ${screening.filter((b:any)=>b.assessment.choice==='uncertain').length}・対象外 ${screening.filter((b:any)=>b.assessment.choice==='irrelevant').length}）</summary>${screening.map((b:any)=>`<p>${escape(b.assessment.choice)}</p>${quotes(b.evidence)}`).join('')}</details>`:''}<ul>${checks}</ul>${step.decision?.action?.type==='done'?'<p>全項目を取得済みと判断したため、追加の操作選択は行っていません。</p>':''}</section>`;
}
function evidenceAccounting(r:any){
 const session=r.evidenceSession,a=session?.accounting;if(!a)return '';
 const audit=r.completionAudit?.request;
 return `<section class="completion-audit"><h2>判断 API の実行記録</h2><p>探索全体：論理呼出し ${escape(a.logicalCalls)}・通信試行 ${escape(a.attempts)}・失敗 ${escape(a.failures)}・質問 ${escape(a.questions)}。再利用 ${escape(a.reusedCalls)} 呼出し / ${escape(a.reusedQuestions)} 質問。</p><p>終了後の確認：${audit?`通信試行 ${escape(audit.attempts)}・失敗 ${escape(audit.failures?.length||0)}`:'通信記録なし'}。探索の集計とは別に記録しています。</p>${session.interruptedStage?`<p>中断した段階：${escape(session.interruptedStage)}</p>`:''}</section>`;
}
const clean=(v:unknown)=>String(v??'').replace(/\s+/g,' ').trim();
async function screenshot(dir:string,urlDir:string,name:unknown,alt:string){
  // Only recorded local image names; never embed remote URLs or path traversal.
  if(typeof name==='string'&&/^[\w.-]+\.png$/i.test(name)){
    try{
      await access(join(dir,name));
      const url=escape(`${urlDir}/${encodeURIComponent(name)}`);
      return `<a class="shot" href="${url}" target="_blank" rel="noopener"><img loading="lazy" src="${url}" alt="${escape(alt)}"></a>`;
    }catch{/* Older/interrupted trials can lack screenshots. */}
  }
  return '<div class="placeholder">スクリーンショットなし</div>';
}
function explorationNotes(step:any){
  const excluded:string[]=step.loopAvoidance?.excludedChoices||[];
  const label=(key:string)=>escape(step.loopAvoidance?.offeredCandidates?.[key]?.label||step.candidates?.[key]?.label||key);
  const memory=step.explorationMemory;
  if(!memory)return excluded.length?`<p class="hint">繰り返しを回避：同じ観察状態で2回実行した操作を候補から除外し、残る候補をJevが判断しました。${excluded.map(label).join(' / ')}</p>`:'';
  const reasons:Record<string,string>={explored:'探索済みの遷移','transit-route':'未試行の操作へ進む再通過経路から外れる操作',duplicate:'同じ遷移の重複候補'};
  const avoided=excluded.length?`<p class="hint">探索履歴から除外：${excluded.map(key=>`${label(key)}（${escape(reasons[memory.exclusions?.[key]]||'探索履歴に基づく除外')}）`).join(' / ')}</p>`:'';
  const transit=memory.transitChoices?.length?`<p class="hint">未探索候補へ向かう再通過を候補に残しました：${memory.transitChoices.map(label).join(' / ')}</p>`:'';
  return `${avoided}${transit}${avoided||transit?'<p class="hint">探索履歴は操作・遷移の記録です。目的達成や対象内容の確認完了を示すものではありません。</p>':''}`;
}
async function journey(r:any,dir:string,urlDir:string,index:number){
  const steps:any[]=r.steps||[],seen=new Map<string,number>(),nodes:string[]=[];
  const end=outcome(r.reason);
  for(const [i,s] of steps.entries()){
    const screen=s.state?.screen,number=i+1,id=`trial-${index}-screen-${number}`;
    // Same title alone does not imply the same screen; compare the recorded observation too.
    const key=screen?JSON.stringify([s.url||'',screen]):null;
    const previous=key?seen.get(key):undefined;
    if(key&&!previous)seen.set(key,number);
    const chosen=clean(s.candidates?.[s.decision?.choice]?.label||s.decision?.choice||'選択の記録なし');
    const executed=s.result==='OK';
    const last=i===steps.length-1;
    const title=clean(screen?.title)||'画面名の記録なし';
    const revisit=previous?`<a class="revisit" href="#trial-${index}-screen-${previous}">再訪 · 画面 ${previous} と同じ観察状態</a>`:'';
    const avoided=explorationNotes(s);
    const stop=!executed?`<div class="stop-note">${badge(last?end:outcome(s.result))}<div>${escape(chosen)}</div><p>${escape((last?end:outcome(s.result)).note)}</p></div>`:'';
    const connector=executed?`<div class="connector" data-action-state="executed"><small>実行済み</small><strong>${escape(chosen)}</strong><span class="arrow" aria-hidden="true"></span></div>`:'';
    nodes.push(`<li><section class="screen" id="${id}"><span class="screen-number">画面 ${number} / 判断 ${escape(s.number??number)}</span><h3>${escape(title)}</h3>${revisit}${avoided}${await screenshot(dir,urlDir,s.screenshot,`画面 ${number}：${title}`)}${stop}</section>${connector}</li>`);
  }
  // Screenshots in steps are PRE-action. Add the actual final capture after the last executed action.
  if(steps.length&&steps.at(-1).result==='OK'){
    const title=clean(r.path?.at(-1)?.result).replace(/^画面:\s*/,'')||'最終画面';
    nodes.push(`<li><section class="screen"><span class="screen-number">操作後の最終画面</span><h3>${escape(title)}</h3>${await screenshot(dir,urlDir,'final.png','操作後の最終画面')}<div class="stop-note">${badge(end)}<p>${escape(end.note)}</p></div></section></li>`);
  }
  if(!steps.length)return `<div class="placeholder">画面の記録なし</div><p>${escape(end.note)}</p>`;
  return `<div class="journey" tabindex="0" role="region" aria-label="操作経路"><ol class="flow">${nodes.join('')}</ol></div>`;
}
export async function report(root:string,results:any[]){
  await writeFile(join(root,'summary.json'),JSON.stringify(results.map(({steps,...r})=>r),null,2));
  const cards=await Promise.all(results.map(async(r,index)=>{
    const dir=resolve(r.dir),rel=relative(root,dir).replaceAll('\\','/');
    const urlDir=rel.split('/').map(encodeURIComponent).join('/')||'.',end=outcome(r.reason);
    const seconds=Number.isFinite(r.elapsedMs)?(r.elapsedMs/1000).toFixed(1):'—';
    const stats=`${r.actionCount??0} 操作 · ${r.steps?.length??0} 判断 · ${seconds} 秒`;
    const technical=(r.steps||[]).map((s:any)=>`<section><h3>判断 ${escape(s.number)} · ${escape(s.result)}</h3><p>${escape(s.error||'')}</p>${goalProgress(s,index,r.steps.length)}<pre>${escape(probabilityLabels(s)||'操作の選択確率なし')}</pre><a href="${escape(urlDir)}/step-${encodeURIComponent(String(s.number))}.json">判断時の入力・結果 JSON</a></section>`).join('');
    return `<details class="run" data-outcome="${end.kind}"${index===0?' open':''}><summary><span class="run-heading"><span class="tag">${escape(String(r.variant||'対象').toUpperCase())} · 文字サイズ情報 ${r.font?'あり':'なし'} · 試行 ${escape(r.repeat??1)}${r.fake?' · FAKE':''}</span><span class="run-title">${escape(r.goalText)}</span><span class="metrics">${escape(stats)}</span></span>${badge(end)}</summary><div class="run-body"><p class="completion">${escape(completionLabel(r))}</p>${evidenceAccounting(r)}${goalProgress(r.steps?.at(-1),index,r.steps?.length||0)}<h2>目的までの操作経路</h2><p class="hint">画面 → 選んだ操作 → 次の画面。画像を押すと拡大表示できます。<span class="hint-scroll"> 長い経路は横にスクロールできます。</span></p>${await journey(r,dir,urlDir,index)}${completionEvidence(r,index)}<details class="technical"><summary>判断の詳細・選択確率を見る</summary><p>確率はJevの出力です。人間の離脱率やUXスコアではありません。画面の再訪は、同一URL・同一観察情報に基づく表示です。</p><a href="${escape(urlDir)}/result.json">試行全体の実行ログ JSON</a>${technical}</details></div></details>`;
  }));
  const counts=[['全試行',results.length],['処理成功',results.filter(r=>r.reason==='SUCCESS').length],['停止・未確認',results.filter(r=>!['success','error'].includes(outcome(r.reason).kind)).length],['実行エラー',results.filter(r=>outcome(r.reason).kind==='error').length]];
  await writeFile(join(root,'index.html'),`<!doctype html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Jev UX · 操作経路レポート</title><style>${reportStyle}</style></head><body><main><header><p class="eyebrow">JEV / NAVIGATION REPORT</p><h1>目的までの道のりを、見える形に。</h1><p class="intro">何を選び、どこへ進み、どこで止まったか。試行を開いて、画面と操作を順番にたどれます。</p>${results.some(r=>r.fake)?'<p class="notice">FAKE実行を含みます。固定ルールによる配線確認は、Jevの性能・UX評価の証拠には使えません。</p>':''}<div class="overview">${counts.map(([label,n])=>`<div><b>${n}</b><span>${label}</span></div>`).join('')}</div><p class="hint">Jevの行動は人間の行動を再現したものではありません。停止理由と実行エラーを区別して確認してください。</p></header>${cards.join('')}<p class="footer">保存済みログから生成したレポートです。図の描画にモデルの呼び出しはありません。</p></main></body></html>`);
}
