// Bounded saved-observation experiment. No browser or target-site requests.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {evaluateChoices} from '../../jev/client.ts';
import {requestFor,parseDecision} from '../../jev/decide.ts';
import {explorationProgress} from '../../jev/progress.ts';
process.loadEnvFile('.env');
const source='reports/2026-09-22T20-10-22.081Z-public/exploration/step-7.json';
const step=JSON.parse(await readFile(source,'utf8'));
const state=structuredClone(step.state);
delete state.screen.regions;for(const entry of state.history)delete entry.observedRegions;
state.explorationProgress=explorationProgress(step.state);
const base=requestFor(step.state,step.candidates,'').questions;
const contextual=structuredClone(base);
// These are literal range-coverage facts from this saved run, not target-page answers.
contextual.nextAction.criteria.scroll_up+='（移動先の範囲は既に観察済み。過去にもここから上へ移動済み）';
contextual.nextAction.criteria.scroll_down+='（現在の表示より下には、まだ観察していない範囲がある）';
const compact={goal:state.goal,currentDate:state.currentDate,screen:state.screen,
 observedText:[...new Set(state.history.flatMap(entry=>entry.observedText||[]))],
 observedWarnings:[...new Set(state.history.flatMap(entry=>entry.observedWarnings||[]))],
 explorationProgress:state.explorationProgress};
const root=`reports/navigation-input-probe-${new Date().toISOString().replaceAll(':','-')}`;
await mkdir(root,{recursive:true});const rows=[];
for(const sample of [
 {id:'baseline',state,questions:base},
 {id:'candidate-context',state,questions:contextual},
 {id:'deduplicated-context',state:compact,questions:contextual},
 {id:'candidate-context-repeat',state,questions:contextual},
]){
 const started=performance.now(),row={id:sample.id,inputBytes:Buffer.byteLength(JSON.stringify(sample))};
 try{
  const result=await evaluateChoices(sample.state,sample.questions,{maxAttempts:1,maxElapsedMs:30000});
  const decision=parseDecision(result,step.candidates);
  Object.assign(row,{ok:true,choice:decision.choice,probabilities:decision.probabilities,request:result.request});
 }catch(error){Object.assign(row,{ok:false,failure:error.failure,request:error.request});}
 row.elapsedMs=performance.now()-started;rows.push(row);console.log(JSON.stringify(row));
 await writeFile(`${root}/${sample.id}.json`,JSON.stringify({sample,result:row},null,2));
 if([401,402,403].includes(row.failure?.statusCode))break;
 await new Promise(resolve=>setTimeout(resolve,1000));
}
await writeFile(`${root}/diagnostics.json`,JSON.stringify({source,maxCalls:4,browserActions:0,providedAnswerOrRoute:false,rows},null,2));
console.log(JSON.stringify({report:`${root}/diagnostics.json`}));
