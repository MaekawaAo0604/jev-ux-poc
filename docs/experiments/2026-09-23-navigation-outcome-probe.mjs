// Saved-input diagnostic only: no target-site requests or browser actions.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {jevDecide} from '../../jev/decide.ts';
import {createEvidenceSession} from '../../jev/evidence-session.ts';
import {evaluateChoices,safeRequestFailure} from '../../jev/client.ts';
process.loadEnvFile('.env');
const source='reports/2026-09-23T08-05-05.851Z-public/exploration';
const snapshot=JSON.parse(await readFile(`${source}/evidence-session.json`,'utf8'));
const root=`reports/navigation-outcome-probe-${new Date().toISOString().replaceAll(':','-')}`;
await mkdir(root,{recursive:true});
const results=[];
for(const n of [18,19,20]){
 const step=JSON.parse(await readFile(`${source}/step-${n}.json`,'utf8'));
 let captured;
 const session=createEvidenceSession({snapshot,evaluate:async(state,questions)=>{
  if(!questions.nextAction)throw new Error('Unexpected uncached assessment');
  captured={state,questions};
  return {model:step.decision.model,answers:{nextAction:{choice:step.decision.choice,probabilities:step.decision.probabilities}}};
 }});
 try{
  await jevDecide(step.state,step.candidates,{goalChecks:['2人分の観覧料','入館できる最終時刻','当日の再入館可否'],session});
  if(!captured)throw new Error('Missing action request');
  for(const variant of ['unchanged','observed-transition-notes']){
   const input=structuredClone(captured);
   if(variant==='observed-transition-notes'){
    const outcomes={};
    for(const [id,candidate] of Object.entries(step.candidates)){
     if(candidate.action.type!=='click')continue;
     const matches=step.state.history.flatMap((entry,index)=>{
      if(entry.pageId!==step.state.screen.pageId||entry.action!==candidate.label)return [];
      const next=step.state.history[index+1];
      return [{actionStep:index+1,result:entry.result,resultPageId:next?.pageId??step.state.screen.pageId,resultViewport:next?.viewport??step.state.screen.viewport,remainingAfter:next?.remainingGoalChecks??input.state.remainingGoalChecks}];
     });
     if(matches.length){
      outcomes[id]={match:'Same observed page and visible label, not proof of identical element',observedTransitions:matches};
      input.questions.nextAction.criteria[id]+=`（このページで同じ表示名の操作を${matches.length}回実行済み。観察済みの移動結果はcandidateHistoryを参照）`;
     }
    }
    input.state.candidateHistory=outcomes;
   }
   let response,error;
   try{response=await evaluateChoices(input.state,input.questions,{maxAttempts:6,maxElapsedMs:90000,retryDelaysMs:[1000,2000,5000,10000,15000],retryInvalidResponse:true});}catch(e){error=safeRequestFailure(e);}
   const choice=response?.answers.nextAction.choice;
   const item={step:n,variant,inputBytes:Buffer.byteLength(JSON.stringify(input)),choice,label:step.candidates[choice]?.label,response,error};
   results.push(item);console.log(JSON.stringify(item));
  }
 }catch(e){const item={step:n,error:safeRequestFailure(e)};results.push(item);console.log(JSON.stringify(item));}
}
await writeFile(`${root}/results.json`,JSON.stringify({source,targetSiteCalls:0,browserActions:0,results},null,2));
console.log(root);
