import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {recordVisualCompletion,type VisualObservation} from '../../runner/visual-evidence.js';

// Diagnostic only, separate from exploration: inspect the source pixels named
// by the latest positive judgments, plus the actual terminal screen.
// No DOM, OCR, answer hints, navigation, or changes to original result data.
try{process.loadEnvFile('.env');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
const source=resolve(process.argv[2]),file=join(source,'exploration/result.json'),original=await readFile(file),result=JSON.parse(original.toString('utf8'));
const memory=result.steps.at(-1).visualContext.imageJudgments;
const ids=new Set<number>(memory.requirements.filter((r:any)=>r.status==='observed').map((r:any)=>[...r.records].reverse().find((v:any)=>v.assessment==='observed').source.step));
const observations:VisualObservation[]=result.steps.filter((s:any)=>ids.has(s.number)).map((s:any)=>s.visualObservation);
if(result.finalVisualObservation)observations.push(result.finalVisualObservation);
const audit=await recordVisualCompletion(result.goalText,result.steps.at(-1).state.currentDate,join(source,'exploration'),observations);
const root=resolve('reports',`memory-evidence-audit-${new Date().toISOString().replaceAll(':','-')}`);await mkdir(root,{recursive:true});
await writeFile(join(root,'audit.json'),JSON.stringify({source,scope:'latest-positive-judgment-sources-and-final-only',audit},null,2));
if(!(await readFile(file)).equals(original))throw new Error('Original result unexpectedly changed');
console.log(JSON.stringify({root,source,selectedSteps:observations.map(o=>o.step),status:audit.status,assessment:audit.assessment,modelAssessment:audit.modelAssessment,error:audit.error,elapsedMs:audit.elapsedMs,evidence:audit.evidence.map(o=>o.id)}));
