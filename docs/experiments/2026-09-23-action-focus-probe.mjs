// Captures the actual action request. All goal/evidence judgments must be cached.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {jevDecide} from '../../jev/decide.ts';
import {createEvidenceSession} from '../../jev/evidence-session.ts';
import {evaluateChoices,safeRequestFailure} from '../../jev/client.ts';
process.loadEnvFile('.env');
const source='reports/2026-09-23T07-28-29.669Z-public/exploration';
const snapshot=JSON.parse(await readFile(`${source}/evidence-session.json`,'utf8'));
const root=`reports/action-focus-probe-${new Date().toISOString().replaceAll(':','-')}`;await mkdir(root,{recursive:true});
const results=[];
for(const n of [12,14]){
 const step=JSON.parse(await readFile(`${source}/step-${n}.json`,'utf8'));
 const inputs=[];
 const session=createEvidenceSession({snapshot,evaluate:async(state,questions)=>{
  if(!questions.nextAction)throw new Error('Unexpected uncached assessment');
  inputs.push({state,questions});
  // Return only the previously recorded decision while capturing its inputs.
  return {model:step.decision.model,answers:{nextAction:{choice:step.decision.choice,probabilities:step.decision.probabilities}}};
 }});
 try{
  await jevDecide(step.state,step.candidates,{goalChecks:['2人分の観覧料','入館できる最終時刻','当日の再入館可否'],session});
  const input=inputs[0];if(!input)throw new Error('No action request');
  for(const variant of ['original','lossless-observation-pool']){
   const state=structuredClone(input.state);
   const questions=structuredClone(input.questions);
   if(variant==='lossless-observation-pool'){
    const pool=[],keys=new Map();
    state.history=state.history.map(({observedText,observedWarnings,observationOmitted,...entry})=>{
     const observation={pageId:entry.pageId,observedText,observedWarnings,observationOmitted},key=JSON.stringify(observation);
     if(!keys.has(key)){keys.set(key,`o${pool.length+1}`);pool.push({id:keys.get(key),...observation});}
     return {...entry,observationId:keys.get(key)};
    });
    state.observations=pool;
    questions.nextAction.instructions+='historyのobservationIdはobservations内の同じIDの観察本文を参照する。観察記録は削除せず重複表示だけを共通化している。';
   }
   let response,error;try{response=await evaluateChoices(state,questions,{maxAttempts:6,maxElapsedMs:90000,retryDelaysMs:[1000,2000,5000,10000,15000],retryInvalidResponse:true});}catch(e){error=safeRequestFailure(e);}
   const result={step:n,variant,inputBytes:Buffer.byteLength(JSON.stringify({state,questions})),choice:response?.answers.nextAction.choice,label:step.candidates[response?.answers.nextAction.choice]?.label,response,error};
   results.push(result);console.log(JSON.stringify(result));
  }
 }catch(e){results.push({step:n,error:safeRequestFailure(e)});console.log(JSON.stringify(results.at(-1)));}
}
await writeFile(`${root}/results.json`,JSON.stringify({source,targetSiteCalls:0,results},null,2));console.log(root);
