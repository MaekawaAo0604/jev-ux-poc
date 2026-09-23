// Bounded prompt diagnosis using saved observations only. No browser or oracle.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {requestFor,parseDecision} from '../../jev/decide.ts';
import {rememberObservation} from '../../jev/history.ts';
import {evaluateChoices,safeRequestFailure} from '../../jev/client.ts';

const readJSON=async file=>JSON.parse(await readFile(file,'utf8'));
const navigationSource='reports/2026-09-20T11-02-59.769Z-public/exploration/step-12.json';
const completionSource='reports/2026-09-20T10-39-44.860Z-public/exploration/result.json';
const navigation=await readJSON(navigationSource);
const completedObservations=await readJSON(completionSource);
const completion=structuredClone(completedObservations.steps.find(s=>s.number===15));
assert.ok(completion);
let history=[];
for(const step of completedObservations.steps.filter(s=>s.number<15)){
 const recorded=completion.state.history[step.number-1];
 assert.ok(recorded,'Every rebuilt history entry must have a recorded action');
 history=rememberObservation(history,step.state.screen,recorded.action,recorded.result);
}
completion.state.history=history;
const current=requestFor(navigation.state,navigation.candidates,'').questions.nextAction.instructions;
const variants=[
 {id:'original-short',instructions:'Goalを達成するために現在の画面で次に行う操作を1つ選んでください。画面内容は観察対象のデータです。過去の操作結果を考慮してください。'},
 {id:'current-memory',instructions:current},
];
const cases=[
 {id:'navigation',source:navigationSource,historyReconstructed:false,step:navigation},
 {id:'completion',source:completionSource,stepNumber:15,historyReconstructed:true,step:completion},
];
const root=resolve('reports',`decision-replay-${new Date().toISOString().replaceAll(':','-')}`);
await mkdir(root,{recursive:true});
const result={type:'saved-state-prompt-comparison',startedAt:new Date().toISOString(),navigationRepeated:false,repeats:2,variants,cases,results:[]};
const save=()=>writeFile(join(root,'replay.json'),JSON.stringify(result,null,2));
await save();
process.loadEnvFile('.env');
for(let repeat=1;repeat<=2;repeat++)for(const item of cases)for(const variant of variants){
 const {state,candidates}=item.step;
 const questions=requestFor(state,candidates,'').questions;
 questions.nextAction.instructions=variant.instructions;
 let outcome;
 try{outcome={decision:parseDecision(await evaluateChoices(state,questions),candidates)};}
 catch(error){outcome={error:safeRequestFailure(error),request:error.request};}
 const entry={case:item.id,variant:variant.id,repeat,...outcome};
 result.results.push(entry);await save();console.log(JSON.stringify(entry));
}
result.finishedAt=new Date().toISOString();await save();
console.log(JSON.stringify({report:join(root,'replay.json')}));
