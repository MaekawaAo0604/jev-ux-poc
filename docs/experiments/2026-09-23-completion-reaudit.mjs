// Re-audit a saved exploration without changing its decisions or original files.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {recordCompletion} from '../../jev/completion.ts';
import {evaluateChoices,ChoiceRequestError} from '../../jev/client.ts';
import {report} from '../../runner/report.ts';
process.loadEnvFile('.env');
const source=resolve('reports/2026-09-22T20-27-11.261Z-public/exploration/result.json');
const result=JSON.parse(await readFile(source,'utf8'));
const started=performance.now(),deadline=started+120000;let calls=0;
const audit=await recordCompletion(result.steps.map(step=>step.state),async(state,questions)=>{
 const remaining=Math.floor(deadline-performance.now());
 if(remaining<=0||calls>=21)throw new ChoiceRequestError({code:'TIMEOUT'},{attempts:0,failures:[],budgetExhausted:true});
 calls++;
 const response=await evaluateChoices(state,questions,{maxAttempts:3,maxElapsedMs:Math.min(15000,remaining),retryDelaysMs:[1000,2000]});
 console.log(JSON.stringify({call:calls,questions:Object.keys(questions).length,attempts:response.request.attempts}));
 return response;
});
const root=resolve(`reports/completion-reaudit-${new Date().toISOString().replaceAll(':','-')}`);
await mkdir(root,{recursive:true});
const receipt={source,browserActions:0,maxLogicalCalls:21,maxAttemptsPerCall:3,budgetMs:120000,calls,elapsedMs:performance.now()-started,audit};
await writeFile(`${root}/diagnostics.json`,JSON.stringify(receipt,null,2));
await report(root,[{...result,completionAudit:audit}]);
console.log(JSON.stringify({status:audit.status,assessment:audit.assessment,calls,request:audit.request,report:`${root}/index.html`}));
