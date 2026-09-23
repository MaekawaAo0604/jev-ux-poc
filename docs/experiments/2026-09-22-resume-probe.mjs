import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {gateway} from '@ai-sdk/gateway';
import {assessGoal,isGoalComplete} from '../../jev/goal-status.ts';
import {createEvidenceSession} from '../../jev/evidence-session.ts';
import {safeRequestFailure} from '../../jev/client.ts';
process.loadEnvFile('.env');
const snapshot=JSON.parse(await readFile('reports/contextual-replay-2026-09-22T07-39-56.309Z/recorded-live-full-627-fragments-1-session.json','utf8'));
const live=JSON.parse(await readFile('reports/2026-09-21T00-46-14.646Z-public/exploration/result.json','utf8'));
const root=`reports/resume-probe-${new Date().toISOString().replaceAll(':','-')}`;await mkdir(root,{recursive:true});
const traces=[];
globalThis.AI_SDK_DEFAULT_PROVIDER={evaluationModel(id){
 const base=gateway.evaluationModel(id);
 return {specificationVersion:base.specificationVersion,provider:base.provider,modelId:base.modelId,supportedQuestionTypes:base.supportedQuestionTypes,
  async doEvaluate(input){
   const result=await base.doEvaluate(input);
   const answers=Object.entries(input.questions).map(([id,q])=>{
    const a=result.answers?.[id],p=a?.probabilities??{};
    return {id,choice:Object.hasOwn(q.criteria,a?.choice??'')?a.choice:'UNKNOWN',expectedKeys:Object.keys(q.criteria),returnedKeys:Object.keys(p).filter(k=>Object.hasOwn(q.criteria,k)),probabilities:Object.fromEntries(Object.entries(p).filter(([k,v])=>Object.hasOwn(q.criteria,k)&&typeof v==='number')),sum:Object.values(p).filter(v=>typeof v==='number').reduce((a,b)=>a+b,0)};
   });
   traces.push({questions:Object.keys(input.questions).length,returnedCount:Object.keys(result.answers??{}).length,answers});
   await writeFile(`${root}/safe-responses.json`,JSON.stringify(traces,null,2));
   return result;
  }};
}};
const session=createEvidenceSession({snapshot,checkpoint:async s=>writeFile(`${root}/session.json`,JSON.stringify(s,null,2))});
try{
 const assessment=await assessGoal(live.steps.at(-1).state,live.settings.goalChecks,session);
 await writeFile(`${root}/assessment.json`,JSON.stringify(assessment,null,2));console.log(JSON.stringify({complete:isGoalComplete(assessment),calls:traces.length,report:root}));
}catch(error){console.log(JSON.stringify({error:safeRequestFailure(error),stage:session.snapshot().interruptedStage,calls:traces.length,last:traces.at(-1),report:root}));}
