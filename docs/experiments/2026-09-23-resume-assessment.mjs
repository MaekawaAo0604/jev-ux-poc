// Resume only the failed assessment with saved observations and cached decisions.
// No browser, no website requests, no executed actions.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {assessGoal,pendingGoalChecks} from '../../jev/goal-status.ts';
import {createEvidenceSession} from '../../jev/evidence-session.ts';
import {createBudgetedEvaluator,safeRequestFailure} from '../../jev/client.ts';
process.loadEnvFile('.env');
const source='reports/2026-09-22T21-15-08.509Z-public/exploration/result.json';
const result=JSON.parse(await readFile(source,'utf8')),step=result.steps.at(-1);
const root=`reports/resumed-assessment-${new Date().toISOString().replaceAll(':','-')}`;
await mkdir(root,{recursive:true});
const evaluate=createBudgetedEvaluator({maxAttempts:3,maxElapsedMs:20000,retryDelaysMs:[1000,2000],retryInvalidResponse:true},60000);
let calls=0;const started=performance.now();
const session=createEvidenceSession({snapshot:result.evidenceSession,evaluate:async(state,questions)=>{
 if(++calls>16)throw new Error('Diagnostic call budget exhausted');
 return evaluate(state,questions);
}});
const output={source,step:step.number,maxNewCalls:16,targetSiteCalls:0,browserActions:0};
try{
 const assessment=await assessGoal(step.state,result.settings.goalChecks,session);
 Object.assign(output,{status:'RECORDED',assessment,pending:pendingGoalChecks(assessment)});
}catch(e){Object.assign(output,{status:'ERROR',error:safeRequestFailure(e),stage:e.stage,assessment:e.goalAssessment});}
Object.assign(output,{newCalls:calls,elapsedMs:performance.now()-started,session:session.snapshot()});
await writeFile(`${root}/result.json`,JSON.stringify(output,null,2));
console.log(JSON.stringify({status:output.status,error:output.error,pending:output.pending,newCalls:calls,elapsedMs:output.elapsedMs,report:`${root}/result.json`}));
