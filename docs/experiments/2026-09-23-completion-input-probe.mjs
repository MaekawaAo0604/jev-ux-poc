// Saved evidence only; no browser, target-site calls, retries, or production edits.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {completionRequestFor} from '../../jev/completion.ts';
import {evaluateChoices} from '../../jev/client.ts';
process.loadEnvFile('.env');
const source='reports/2026-09-22T20-27-11.261Z-public/exploration/result.json';
const result=JSON.parse(await readFile(source,'utf8'));
const input=completionRequestFor(result.steps.map(step=>step.state));
const root=`reports/completion-input-probe-${new Date().toISOString().replaceAll(':','-')}`;
await mkdir(root,{recursive:true});const rows=[];
for(const sample of [
 {id:'completion-only',state:input.state,questions:{completion:input.questions.completion}},
 {id:'first-eight-evidence',state:{...input.state,evidence:input.state.evidence.slice(0,8)},questions:Object.fromEntries(Object.entries(input.questions).slice(1,9))},
 {id:'completion-only-repeat',state:input.state,questions:{completion:input.questions.completion}},
]){
 const row={id:sample.id,inputBytes:Buffer.byteLength(JSON.stringify(sample)),questions:Object.keys(sample.questions).length};
 try{const response=await evaluateChoices(sample.state,sample.questions,{maxAttempts:1,maxElapsedMs:30000});Object.assign(row,{ok:true,answers:response.answers,request:response.request});}
 catch(error){Object.assign(row,{ok:false,failure:error.failure,request:error.request});}
 rows.push(row);console.log(JSON.stringify(row));
 if([401,402,403].includes(row.failure?.statusCode))break;
 await new Promise(resolve=>setTimeout(resolve,1000));
}
await writeFile(`${root}/diagnostics.json`,JSON.stringify({source,originalInputBytes:Buffer.byteLength(JSON.stringify(input)),originalQuestionCount:Object.keys(input.questions).length,maxCalls:3,browserActions:0,rows},null,2));
console.log(JSON.stringify({report:`${root}/diagnostics.json`}));
