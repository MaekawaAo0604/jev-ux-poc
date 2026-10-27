import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {CompletionFrames} from '../../jev/completion-frames.js';
import {explorationProgress} from '../../jev/progress.js';
import {safeRequestFailure} from '../../jev/client.js';
process.loadEnvFile('.env');
const source=resolve('reports/persona-svgomg-memory-fixed-2026-10-26/baseline-3'),root=resolve(process.argv[2]??'reports/svgomg-completion-replay-2026-10-26');await mkdir(root);
const run=JSON.parse(await readFile(join(source,'result.json'),'utf8')),last=run.steps.at(-1),frames=new CompletionFrames(source,run.steps.length);
for(const step of run.steps)frames.capture(step.visualObservation);
const questions=run.steps.flatMap((s:any)=>s.requests??[]).find((c:any)=>c.questions.completionCoverage).questions;
const {observedAlternatives,...base}=last.state,{regions,...screen}=base.screen;
const history=base.history.map(({observedRegions,...entry}:any)=>entry),input={...base,screen,history,explorationProgress:explorationProgress(last.state)};
const record:any={kind:'SAVED_SCREEN_COMPLETION_DIAGNOSTIC',source,sourceFailure:run.errors,step:last.number,input,questions,notLiveExploration:true,objectiveVerified:false};
try{record.response=await frames.evaluate(input,questions);record.status='RECORDED';}catch(error){record.status='ERROR';record.error=safeRequestFailure(error);process.exitCode=1;}
record.completionFrames=frames.snapshot();await writeFile(join(root,'replay.json'),JSON.stringify(record,null,2));
console.log(JSON.stringify({status:record.status,assessment:record.response?.answers.completionCoverage.choice,request:record.response?.request,error:record.error,imageCount:record.completionFrames.requests.at(-1)?.imageCount}));
