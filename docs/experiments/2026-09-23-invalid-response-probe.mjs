// Restore saved inference cache and inspect only the interrupted request.
// No browser or target-site calls. No raw provider exception/headers persisted.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {experimental_evaluate as evaluate} from 'ai';
import {assessGoal} from '../../jev/goal-status.ts';
import {createEvidenceSession} from '../../jev/evidence-session.ts';
import {validateChoice,safeRequestFailure} from '../../jev/client.ts';
process.loadEnvFile('.env');
const source='reports/2026-09-22T21-15-08.509Z-public/exploration/result.json';
const result=JSON.parse(await readFile(source,'utf8')),step=result.steps.at(-1);
let captured;
const session=createEvidenceSession({snapshot:result.evidenceSession,evaluate:async(state,questions)=>{captured={state,questions};throw new Error('Capture only');}});
try{await assessGoal(step.state,result.settings.goalChecks,session);}catch{}
if(!captured)throw new Error('No interrupted request was found');
const root=`reports/invalid-response-probe-${new Date().toISOString().replaceAll(':','-')}`;
await mkdir(root,{recursive:true});const rows=[];
for(let i=0;i<2;i++){
 const row={attempt:i+1};
 try{
  const r=await evaluate({model:process.env.JEV_GATEWAY_MODEL||'typesafe-ai/jev',state:captured.state,questions:captured.questions,maxRetries:0,abortSignal:AbortSignal.timeout(15000)});
  row.answers=Object.fromEntries(Object.entries(captured.questions).map(([id,q])=>{
   const a=r.answers[id];let validation='valid';
   try{validateChoice(a,q.criteria);}catch(e){validation=e.message;}
   return [id,{choice:a?.choice,probabilities:a?.probabilities,sum:a?.probabilities?Object.values(a.probabilities).reduce((x,y)=>x+y,0):null,validation}];
  }));
 }catch(e){row.error=safeRequestFailure(e);}
 rows.push(row);console.log(JSON.stringify(row));
 await writeFile(`${root}/diagnostics.json`,JSON.stringify({source,step:step.number,targetSiteCalls:0,maxCalls:2,captured,rows},null,2));
 if([401,402,403].includes(row.error?.statusCode))break;
 await new Promise(resolve=>setTimeout(resolve,1000));
}
console.log(JSON.stringify({report:`${root}/diagnostics.json`}));
