import {createHash} from 'node:crypto';

export type Phase2Summary={reportPath:string;loopSummary:string;personaSummary:string;abilitySummary:string};
export type ExperimentRun={condition:string;repeat:number;dir:string;fake:boolean;reason:string;objectiveSuccess:boolean;perceivedSuccess:boolean;actionCount:number;backCount:number;loopCount:number;elapsedMs:number;model:string|null;steps:any[]};
export type Finding={kind:string;key:string;priority:number;observedFacts:string[];inference:string;improvementCandidate:string;evidence:{run:string;step:number|null;screenshot?:string;afterScreenshot?:string}[]};
const mean=(v:number[])=>v.length?v.reduce((a,b)=>a+b,0)/v.length:null;
const normalizedURL=(url:string)=>{try{const u=new URL(url);return u.pathname+u.hash;}catch{return url;}};
const actionLabel=(step:any)=>{
 const a=step.decision?.action;
 if(!a)return 'no-decision';
 if(a.type==='click')return 'click:'+String(step.state.screen.elements.find((e:any)=>e.id===a.elementId)?.text??a.elementId).trim();
 return a.type+(a.direction?':'+a.direction:'');
};
export const routeFor=(run:ExperimentRun)=>run.steps.filter(s=>s.decision&&['click','back','scroll'].includes(s.decision.action.type)&&s.result==='OK').map(s=>`${normalizedURL(s.url)} | ${s.state.screen.title} | ${actionLabel(s)}`);
export function routeDistance(a:string[],b:string[]):number {
 if(!a.length&&!b.length)return 0;
 let previous=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=1;i<=a.length;i++){
  const current=[i];for(let j=1;j<=b.length;j++)current[j]=Math.min(current[j-1]+1,previous[j]+1,previous[j-1]+(a[i-1]===b[j-1]?0:1));previous=current;
 }
 return previous[b.length]/Math.max(a.length,b.length);
}
const visible=(s:any)=>JSON.stringify({title:s.title,text:s.text,elements:s.elements.map((e:any)=>[e.type,e.text]),viewport:s.viewport});
export function extractFindings(run:ExperimentRun):Finding[]{
 const findings:Finding[]=[],seen=new Set<string>();
 const add=(kind:string,step:any,facts:string[],inference:string,improvementCandidate:string,priority=1)=>{
  const location=step?`${normalizedURL(step.url)} | ${step.state.screen.title} | ${actionLabel(step)}`:'termination';
  const key=createHash('sha256').update(kind+'|'+location).digest('hex').slice(0,16);
  findings.push({kind,key,priority,observedFacts:facts,inference,improvementCandidate,evidence:[{run:run.dir,step:step?.number??null,...(step?{screenshot:step.screenshot,...(step.outcome?{afterScreenshot:step.outcome.screenshot}:{})}:{})}]});
 };
 for(const step of run.steps){
  if(!step.decision)continue;
  const label=actionLabel(step),sig=normalizedURL(step.url)+'|'+visible(step.state.screen)+'|'+label;
  if(step.result==='OK'&&step.decision.action.type==='back')add('backtracking',step,['ブラウザーの戻る操作を実行した。'],'前の画面に戻って別の手掛かりを探した可能性がある。誤操作や迷いとは断定できない。','この画面の見出しや入口のラベルが目的と対応しているか確認する。');
  if(seen.has(sig))add('repeated_action',step,['同じ表示内容と表示位置で、同じ操作を再び選択した。'],'操作結果が分かりにくいか、必要な再確認を行った可能性がある。','操作後の状態表示と、再操作が必要になる理由を確認する。');
  if(step.result==='OK')seen.add(sig);
  if(step.result==='OK'&&['click','back'].includes(step.decision.action.type)&&step.outcome&&normalizedURL(step.url)===normalizedURL(step.outcome.url)&&visible(step.state.screen)===visible(step.outcome.screen))add('no_visible_change',step,['操作前後のURL、観測テキスト、操作候補、表示位置が一致した。'],'観測範囲内では変化を確認できなかった。ダウンロードや画像の変化はこの判定に含まれない。','操作に対する確認メッセージや表示変化を確認する。');
  const ps=Object.values(step.decision.probabilities??{}).filter((x):x is number=>typeof x==='number').sort((a,b)=>b-a);
  if(ps.length>=2&&ps[0]-ps[1]<=0.15)add('close_choices',step,[`Jevの上位2候補の選択確率差は${(ps[0]-ps[1]).toFixed(3)}だった（閾値0.15以下）。`],'モデルの候補評価が近かった。人間が迷うことの直接の証拠ではない。','候補同士のラベルや説明を並べ、区別できるか確認する。');
  if(step.decision.decisionReason?.category==='uncertainty')add('reported_uncertainty',step,['モデルが判断理由カテゴリuncertaintyを選択した。'],'モデルが探索上の不確実性を自己申告した。実際の内的理由や人間の感情は検証していない。','この画面から目的への手掛かりが読み取れるか確認する。');
 }
 const last=run.steps.at(-1);
 if(run.perceivedSuccess&&!run.objectiveSuccess)add('completion_mismatch',last,['Jevは完了を選択したが、独立した達成確認はfalseだった。'],'Jevの完了判断と、要求した実際の状態に不一致がある。','操作結果の説明と完了表示を確認する。',3);
 if(['STUCK','LOOP','ACTION_LIMIT'].includes(run.reason)&&!run.objectiveSuccess)add('goal_not_reached',last,[`終了理由は${run.reason}で、独立した達成確認はfalseだった。`],'今回の操作範囲では目的に到達できなかった。原因をUIだけに帰属できない。','直前の選択や経路を確認し、目的へつながる入口を検討する。',2);
 return findings;
}
const pairs=(n:number)=>Array.from({length:n},(_,i)=>Array.from({length:n-i-1},(_,k)=>[i,i+k+1] as const)).flat();
export function compareRuns(runs:ExperimentRun[],expectedConditions:string[],expectedRepeats:number){
 const infra=['PAGE_ERROR','ACTION_ERROR','DECISION_ERROR'];
 const usable=runs.filter(r=>!infra.includes(r.reason));
 const complete=runs.length===expectedConditions.length*expectedRepeats&&expectedConditions.every(c=>runs.filter(r=>r.condition===c).length===expectedRepeats&&Array.from({length:expectedRepeats},(_,i)=>i+1).every(n=>runs.some(r=>r.condition===c&&r.repeat===n)));
 const evidence=runs.some(r=>r.fake)?'PLUMBING_ONLY':'LIVE_MODEL';
 const routes=usable.map(routeFor),pairList=pairs(usable.length),distances=pairList.map(([a,b])=>routeDistance(routes[a],routes[b]));
 const variationFor=(labels:string[])=>{
  const within:number[]=[],between:number[]=[];
  pairList.forEach(([a,b],i)=>(labels[a]===labels[b]?within:between).push(distances[i]));
  const w=mean(within),b=mean(between),delta=w===null||b===null?null:b-w;return {withinRouteDistance:w,betweenRouteDistance:b,effect:delta!==null&&Math.abs(delta)<1e-12?0:delta};
 };
 const labels=usable.map(r=>r.condition),variation=variationFor(labels);
 const models=[...new Set(usable.map(r=>r.model))];
 const comparable=complete&&usable.length===runs.length&&models.length===1&&!!models[0];
 const balanced=comparable&&expectedConditions.length>1&&expectedRepeats>1;
 let permutationP:number|null=null;
 if(balanced&&variation.effect!==null&&evidence==='LIVE_MODEL'){
  let randomState=20261026,extreme=0;
  const random=()=>{randomState=(Math.imul(randomState,1664525)+1013904223)>>>0;return randomState/4294967296;};
  for(let n=0;n<1999;n++){
   const shuffled=[...labels];
   // Preserve repeat blocks to avoid treating run-order drift as a persona effect.
   for(const repeat of new Set(usable.map(r=>r.repeat))){
    const ids=usable.flatMap((r,i)=>r.repeat===repeat?[i]:[]);
    for(let i=ids.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[shuffled[ids[i]],shuffled[ids[j]]]=[shuffled[ids[j]],shuffled[ids[i]]];}
   }
   if(variationFor(shuffled).effect!>=variation.effect-1e-12)extreme++;
  }
  permutationP=(extreme+1)/2000;
 }
 const findings=runs.flatMap(run=>extractFindings(run).map(f=>({...f,condition:run.condition,repeat:run.repeat})));
 const grouped=new Map<string,typeof findings>();for(const f of findings)grouped.set(f.key,[...(grouped.get(f.key)??[]),f]);
 const issues=[...grouped].map(([key,items])=>{
  const conditions=[...new Set(items.map(f=>f.condition))],occurrences=new Set(items.map(f=>f.condition+':'+f.repeat)).size;
  return {key,kind:items[0].kind,conditions,coverage:!balanced?'provisional':conditions.length===expectedConditions.length?'common':conditions.length===1?'condition-specific':'shared',occurrences,priorityScore:Math.max(...items.map(f=>f.priority))*conditions.length+occurrences,priorityBasis:'人手確認のための暫定値。影響度係数×条件数＋発生試行数。UX品質の確定評価ではない。',observedFacts:[...new Set(items.flatMap(f=>f.observedFacts))],inference:items[0].inference,improvementCandidate:items[0].improvementCandidate,evidence:items.flatMap(f=>f.evidence)};
 }).sort((a,b)=>b.priorityScore-a.priorityScore||a.key.localeCompare(b.key));
 const conditions=expectedConditions.map(condition=>{
  const all=runs.filter(r=>r.condition===condition),valid=usable.filter(r=>r.condition===condition),paths=valid.map(routeFor),counts=new Map<string,number>();
  paths.forEach(p=>{const key=JSON.stringify(p);counts.set(key,(counts.get(key)??0)+1);});
  const actions=valid.map(r=>r.actionCount),avg=mean(actions);
  const basisCounts:Record<string,number>={};valid.forEach(r=>r.steps.forEach(s=>{const category=s.decision?.decisionReason?.category;if(category)basisCounts[category]=(basisCounts[category]??0)+1;}));
  return {condition,runs:all.length,usableRuns:valid.length,infrastructureErrors:all.length-valid.length,objectiveSuccesses:valid.filter(r=>r.objectiveSuccess).length,successRate:mean(valid.map(r=>r.objectiveSuccess?1:0)),meanActions:avg,actionRange:actions.length?[Math.min(...actions),Math.max(...actions)]:null,actionSD:avg===null||actions.length<2?null:Math.sqrt(actions.reduce((sum,x)=>sum+(x-avg)**2,0)/(actions.length-1)),meanBacks:mean(valid.map(r=>r.backCount)),uniqueRoutes:counts.size,modalRouteFraction:valid.length?Math.max(...counts.values())/valid.length:null,withinRouteDistance:mean(pairs(paths.length).map(([a,b])=>routeDistance(paths[a],paths[b]))),basisCounts};
 });
 const screens=new Map<string,Record<string,number>>();
 for(const r of usable)for(const s of r.steps){const category=s.decision?.decisionReason?.category;if(!category)continue;const key=normalizedURL(s.url)+' | '+s.state.screen.title;const by=screens.get(key)??{};by[r.condition+':'+category]=(by[r.condition+':'+category]??0)+1;screens.set(key,by);}
 return {schemaVersion:1,phase2:undefined as Phase2Summary|undefined,evidence,complete,comparable,models,expectedConditions,expectedRepeats,conditions,variation:{...variation,permutationP,permutations:permutationP===null?0:1999,seed:20261026,method:'normalized Levenshtein distance; mean between minus mean within; one-sided label permutation within repeat blocks',humanValidity:'NOT_EVALUATED',interpretation:'3回ずつの探索的な比較。正の差でもペルソナ効果や人間の再現成功を断定しない。確率値や理由カテゴリはモデル出力。'},issues,evaluationDifferences:[...screens].map(([screen,basisCounts])=>({screen,basisCounts,interpretation:'同じ画面タイトル・URLにおける理由カテゴリの自己申告。表示位置や表示内容が同一とは限らず、UX評価の一致・不一致を直接示さない。'})),runs:runs.map(r=>({condition:r.condition,repeat:r.repeat,dir:r.dir,reason:r.reason,objectiveSuccess:r.objectiveSuccess,perceivedSuccess:r.perceivedSuccess,actionCount:r.actionCount,model:r.model,route:routeFor(r)})),limitations:['操作経路の差は人間の体験との一致を示さない。','禁止操作で選択肢が変わる条件同士は比較しない。','最大操作回数による打ち切りは失敗原因を特定しない。','誤操作や期待した画面変化は行動だけでは確定できない。','実行時間は推論・通信・描画を含み、人間の迷い時間ではない。']};
}
export function comparisonCSV(report:ReturnType<typeof compareRuns>){
 const columns=['condition','runs','usableRuns','infrastructureErrors','objectiveSuccesses','successRate','meanActions','actionSD','meanBacks','uniqueRoutes','modalRouteFraction','withinRouteDistance'] as const;
 const cell=(x:unknown)=>'"'+String(x??'').replaceAll('"','""')+'"';
 return '\uFEFF'+[columns.join(','),...report.conditions.map(row=>columns.map(c=>cell(row[c])).join(','))].join('\r\n')+'\r\n';
}

export function comparisonHTML(report:ReturnType<typeof compareRuns>){
 const escape=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
 const number=(v:number|null)=>v===null?'未計測':v.toFixed(3);
 const evidenceLink=(e:Finding['evidence'][number])=>`<a href="${escape(e.run)}/result.json">${escape(e.run)} / step ${e.step??'終端'}</a>${e.screenshot?` · <a href="${escape(e.run)}/${escape(e.screenshot)}">操作前</a>`:''}${e.afterScreenshot?` · <a href="${escape(e.run)}/${escape(e.afterScreenshot)}">操作後</a>`:''}`;
 return `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Jev ペルソナ比較</title><style>body{font:15px/1.7 system-ui,sans-serif;color:#19242f;background:#f6f8fa;margin:0}main{max-width:1150px;margin:auto;padding:32px 24px}h1{font-size:26px}h2{font-size:20px;margin-top:36px}a{color:#155e85}table{border-collapse:collapse;background:white;width:100%}th,td{text-align:left;padding:12px;border-bottom:1px solid #dce2e7}th{font-size:13px}article{padding:20px 0;border-bottom:1px solid #c9d2da}small{color:#52606d}.scroll{overflow:auto}.notice{padding:16px;border-left:4px solid #527389;background:white}code{overflow-wrap:anywhere}summary{cursor:pointer}</style><main><h1>Jev ペルソナ比較</h1><p class="notice">${report.evidence==='PLUMBING_ONLY'?'FAKE：配線の動作確認。ペルソナ効果の実験結果ではありません。':'実モデルの探索記録。人間の体験との一致は未検証です。'} ${report.complete?'予定した試行の記録が揃っています。':'未完了：一部の試行記録がありません。'} 計測エラーの試行は行動指標から除外します。</p><p><a href="comparison.json">比較JSON</a> · <a href="comparison.csv">集計CSV</a> · <a href="manifest.json">実験条件</a> · <a href="index.html">全操作の画面レポート</a></p>${report.phase2?`<section><h2>第2フェーズ検証</h2><p>${escape(report.phase2.loopSummary)}</p><p>${escape(report.phase2.personaSummary)}</p><p>${escape(report.phase2.abilitySummary)}</p><p><a href="${escape(report.phase2.reportPath)}">LOOP分析・ペルソナ整合性・追加対照の詳細</a></p></section>`:''}<h2>実験1：行動の違い</h2><div class="scroll"><table><thead><tr><th>条件</th><th>有効/記録</th><th>達成</th><th>平均操作数</th><th>操作数SD</th><th>経路種類</th><th>最頻経路率</th><th>条件内の経路差</th></tr></thead><tbody>${report.conditions.map(c=>`<tr><td>${escape(c.condition)}</td><td>${c.usableRuns}/${c.runs}</td><td>${c.objectiveSuccesses}/${c.usableRuns}</td><td>${number(c.meanActions)}</td><td>${number(c.actionSD)}</td><td>${c.uniqueRoutes}</td><td>${number(c.modalRouteFraction)}</td><td>${number(c.withinRouteDistance)}</td></tr>`).join('')}</tbody></table></div><p>経路差は操作列の編集距離を長い方の操作数で割った値（0＝同一、1＝全て異なる）。平均：条件内 ${number(report.variation.withinRouteDistance)}、条件間 ${number(report.variation.betweenRouteDistance)}、差 ${number(report.variation.effect)}。置換検定の参考p値 ${number(report.variation.permutationP)}。</p><p>${escape(report.variation.interpretation)}</p><h2>実験2・3：根拠付き問題候補</h2><p>common＝全条件、condition-specific＝今回1条件だけ、shared＝複数条件、provisional＝比較未成立。今回の未検出は、他のペルソナが問題を経験しない証拠にはなりません。優先度は人手確認用の暫定値です。</p>${report.issues.map(issue=>`<article><h3>${escape(issue.kind)} <small>${escape(issue.coverage)} / ${escape(issue.conditions.join(', '))} / ${issue.occurrences}試行 / 優先度 ${issue.priorityScore}</small></h3><b>観測事実</b><ul>${issue.observedFacts.map(f=>`<li>${escape(f)}</li>`).join('')}</ul><p><b>推測：</b>${escape(issue.inference)}</p><p><b>改善候補：</b>${escape(issue.improvementCandidate)}</p><details><summary>根拠 ${issue.evidence.length}件</summary><ul>${issue.evidence.map(e=>`<li>${evidenceLink(e)}</li>`).join('')}</ul></details></article>`).join('')||'<p>設定した検出規則に該当する問題候補はありませんでした。問題が存在しないことは確認していません。</p>'}<h2>各試行</h2><div class="scroll"><table><thead><tr><th>条件</th><th>試行</th><th>終了理由</th><th>達成確認</th><th>操作数</th><th>ログ</th></tr></thead><tbody>${report.runs.map(r=>`<tr><td>${escape(r.condition)}</td><td>${r.repeat}</td><td>${escape(r.reason)}</td><td>${r.objectiveSuccess}</td><td>${r.actionCount}</td><td><a href="${escape(r.dir)}/result.json">JSON</a> · <a href="${escape(r.dir)}/events.jsonl">JSONL</a> · <a href="${escape(r.dir)}/trace.zip">trace</a></td></tr>`).join('')}</tbody></table></div><h2>比較上の制約</h2><ul>${report.limitations.map(x=>`<li>${escape(x)}</li>`).join('')}</ul><small>データソース：この実験フォルダーのmanifest.jsonと各result.json。記録された全試行を対象に集計。</small></main></html>`;
}
