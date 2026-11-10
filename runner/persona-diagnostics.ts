import {createHash} from 'node:crypto';
import type {ExperimentRun} from './persona-report.js';
export type DiagnosticRun=Pick<ExperimentRun,'condition'|'repeat'|'dir'|'reason'|'actionCount'|'objectiveSuccess'|'steps'>;
export const hash=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
const signature=(s:any)=>JSON.stringify([s.url,s.state.screen,s.decision.action]);
const cleanURL=(value:string)=>{const u=new URL(value);return u.pathname+u.hash;};
export function diagnoseRun(run:DiagnosticRun){
 const seen=new Map<string,number[]>(),identities=new Map<string,Set<string>>();
 const decisions=run.steps.map(s=>{
  const key=s.decision?signature(s):undefined,prior=key?[...(seen.get(key)??[])]:[];
  if(key)seen.set(key,[...prior,s.number]);
  const pageId=s.state.screen.pageId;
  if(pageId){const routes=identities.get(pageId)??new Set<string>();routes.add(cleanURL(s.url)+' | '+s.state.screen.title);identities.set(pageId,routes);}
  const chosen=s.decision?s.candidates?.[s.decision.choice]:undefined;
  const bans=s.state.exploration?.charter.prohibitedActions,action=s.decision?.action,text=String(chosen?.label??'');
  const prohibitedChoice=!!bans&&!!action&&(bans.actionTypes.includes(action.type)||action.type==='click'&&(bans.controlTexts.some((t:string)=>text===`「${t}」をクリック`)||bans.downloads&&/^「\d{4}-\d{2} の請求書をPDFで保存」をクリック$/.test(text)));
  return {step:s.number,url:cleanURL(s.url),screen:s.state.screen.title,pageId,action:chosen?.label??null,choice:s.decision?.choice??null,actionType:s.decision?.action.type??null,reason:s.decision?.decisionReason??null,probabilities:s.decision?.probabilities??null,result:s.result,executed:s.result==='OK'&&!!s.recordedAction,occurrence:key?prior.length+1:null,matchingPreviousSteps:prior,signatureSha256:key?hash(key):null,guardWouldBlock:s.loopCheck?.enabled!==false&&!!key&&prior.length+1>=3,historyLength:s.state.history.length,offeredOther:s.state.screen.elements.some((e:any)=>e.text==='その他'),otherChosen:chosen?.label==='「その他」をクリック',after:s.outcome?{url:cleanURL(s.outcome.url),screen:s.outcome.screen.title,visibleTextChanged:JSON.stringify(s.state.screen.text)!==JSON.stringify(s.outcome.screen.text),screenshot:s.outcome.screenshot}:null,objectiveSuccess:s.objectiveSuccess??null,evidence:{run:run.dir,step:s.number,json:`step-${s.number}.json`,screenshot:s.screenshot,afterScreenshot:s.outcome?.screenshot},prohibitedChoice,candidateIsValid:!!chosen&&JSON.stringify(chosen.action)===JSON.stringify(s.decision.action)};
 });
 const expected=decisions.find(d=>d.guardWouldBlock),actual=decisions.find(d=>d.result==='LOOP');
 const initial=run.steps[0],returned=run.steps.find(s=>s.number>1&&s.state.screen.title===initial?.state.screen.title);
 return {run:run.dir,condition:run.condition,repeat:run.repeat,reason:run.reason,objectiveSuccess:run.objectiveSuccess,selectedActions:decisions.filter(d=>['click','back','scroll'].includes(d.actionType)).length,executedActions:decisions.filter(d=>d.executed).length,reportedActionCount:run.actionCount,loopReconstructionMatches:run.reason==='LOOP'?!!expected&&expected.step===actual?.step:!expected,loop:{threshold:3,observedAt:actual?.step??null,predictedAt:expected?.step??null,previousSteps:actual?.matchingPreviousSteps??[],blockedBeforeExecution:actual?actual.executed===false:null,signatureFields:['url','screen','decision.action'],excluded:['goal','history','persona','decision probabilities']},initialAndReturnedHome:{initialURL:initial?.url,returnedURL:returned?.url,sameURL:initial?.url===returned?.url,sameObservation:!!returned&&JSON.stringify(initial.state.screen)===JSON.stringify(returned.state.screen)},identityCollisions:[...identities].filter(([,screens])=>new Set([...screens].map(s=>s.split(' | ')[1]).filter(Boolean)).size>1).map(([pageId,screens])=>({pageId,screens:[...screens]})),decisions};
}
export type ProbabilityRow={condition:string;repeat:number;probabilities:Record<string,number>};
const mean=(v:number[])=>v.length?v.reduce((a,b)=>a+b,0)/v.length:null;
export function distributionComparison(rows:ProbabilityRow[]){
 const keys=[...new Set(rows.flatMap(r=>Object.keys(r.probabilities)))].sort();
 const groups=[...new Set(rows.map(r=>r.condition))].sort(),pairs:{a:number;b:number;distance:number}[]=[];
 for(let a=0;a<rows.length;a++)for(let b=a+1;b<rows.length;b++)pairs.push({a,b,distance:keys.reduce((sum,k)=>sum+Math.abs((rows[a].probabilities[k]??0)-(rows[b].probabilities[k]??0)),0)/2});
 const statistic=(labels:string[])=>{
  const within:number[]=[],between:number[]=[];
  for(const p of pairs)(labels[p.a]===labels[p.b]?within:between).push(p.distance);
  const w=mean(within),b=mean(between),d=w===null||b===null?null:b-w;
  return {withinDistance:w,betweenDistance:b,effect:d!==null&&Math.abs(d)<1e-12?0:d};
 };
 const observed=statistic(rows.map(r=>r.condition));
 const permutations=(values:string[]):string[][]=>values.length?values.flatMap((v,i)=>permutations(values.filter((_,j)=>i!==j)).map(rest=>[v,...rest])):[[]];
 const repeats=[...new Set(rows.map(r=>r.repeat))],blocks=repeats.map(repeat=>rows.flatMap((r,i)=>r.repeat===repeat?[i]:[]));
 const valid=groups.length>1&&groups.length<=4&&repeats.length>1&&repeats.length<=3&&blocks.every(ids=>ids.length===groups.length&&new Set(ids.map(i=>rows[i].condition)).size===groups.length);
 let assignments=0,extreme=0;
 if(valid&&observed.effect!==null){
  const orders=permutations(groups),labels=rows.map(r=>r.condition);
  const visit=(level:number)=>{
   if(level===blocks.length){assignments++;if(statistic(labels).effect!>=observed.effect!-1e-12)extreme++;return;}
   for(const order of orders){blocks[level].forEach((index,j)=>labels[index]=order[j]);visit(level+1);}
  };visit(0);
 }
 const conditions=groups.map(condition=>{
  const samples=rows.filter(r=>r.condition===condition);
  return {condition,n:samples.length,probabilities:Object.fromEntries(keys.map(k=>{const values=samples.map(r=>r.probabilities[k]??0),avg=mean(values)!;return [k,{mean:avg,min:Math.min(...values),max:Math.max(...values),sd:values.length>1?Math.sqrt(values.reduce((sum,x)=>sum+(x-avg)**2,0)/(values.length-1)):null}];}))};
 });
 return {...observed,conditions,permutationP:assignments?extreme/assignments:null,assignments,method:'total variation distance; between minus within; exact condition-label permutations within repeat blocks',interpretation:'探索的な出力感度の比較。確率差は操作変更、内部推論の利用、人間の再現を意味しない。複数指標を検討しており、p値から効果を確定しない。'};
}
export function matchedInitialComparison(runs:(DiagnosticRun&{model:string|null;imageSha256:string;fake?:boolean})[]){
 const observations=runs.map(run=>{
  const s=run.steps[0],state=structuredClone(s.state);if(state.exploration)delete state.exploration.persona;
  return {condition:run.condition,repeat:run.repeat,run:run.dir,step:s.number,model:run.model,inputWithoutPersonaSha256:hash(JSON.stringify({state,candidates:s.candidates})),imageSha256:run.imageSha256,choice:s.decision.choice,reasonCategory:s.decision.decisionReason?.category??null,actionProbabilities:s.decision.probabilities,reasonProbabilities:s.decision.decisionReason?.probabilities??{},personaReceived:!!s.state.exploration?.persona,historyLength:s.state.history.length,evidence:{run:run.dir,step:s.number,screenshot:s.screenshot,json:`step-${s.number}.json`}};
 });
 const modelInferenceEligible=runs.every(r=>!r.fake&&!!r.model);
 const matched=new Set(observations.map(r=>r.inputWithoutPersonaSha256)).size===1&&new Set(observations.map(r=>r.imageSha256)).size===1&&new Set(observations.map(r=>r.model)).size===1;
 const compare=(get:(r:typeof observations[number])=>Record<string,number>)=>matched&&modelInferenceEligible?distributionComparison(observations.map(r=>({condition:r.condition,repeat:r.repeat,probabilities:get(r)}))):null;
 return {modelInferenceEligible,scene:'各試行の最初の画面。事後分析の一次比較として選択。履歴なし。',matched,uniqueStateHashes:new Set(observations.map(r=>r.inputWithoutPersonaSha256)).size,uniqueImageHashes:new Set(observations.map(r=>r.imageSha256)).size,observations,chosenActions:compare(r=>({[r.choice]:1})),reasonCategories:compare(r=>({[r.reasonCategory??'unavailable']:1})),actionProbabilities:compare(r=>r.actionProbabilities),reasonProbabilities:compare(r=>r.reasonProbabilities),knowledgeUse:'UNOBSERVABLE',softPersonaConsistency:'NOT_ESTABLISHED',limits:['理由カテゴリと確率は自己申告。知識や制約の内部利用を証明しない。','初心者が用語を理解したか、慎重な利用者が安全性を確認したかは、操作ログだけでは確定できない。','同じ人物内の一貫性や人格の正しさを自動判定する検証済み基準がない。','個人情報入力や認証操作の場面がなく、プライバシー制約の遵守能力は未検証。']};
}
