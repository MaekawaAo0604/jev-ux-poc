import {readdir,readFile,mkdir,writeFile,copyFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {recordSavedVisualCompletion} from './visual-evidence.js';
import {report} from './report.js';

try{process.loadEnvFile('.env');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
if(!process.argv[2])throw new Error('Usage: npx tsx runner/vision-audit.ts reports/<saved-run>');
const source=resolve(process.argv[2]),root=resolve('reports',`vision-evidence-${new Date().toISOString().replaceAll(':','-')}`),results:any[]=[];
await mkdir(root,{recursive:true});
for(const entry of await readdir(source,{withFileTypes:true}))if(entry.isDirectory()){
 let result:any;
 try{result=JSON.parse(await readFile(join(source,entry.name,'result.json'),'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')continue;throw e;}
 if(!result.vision||result.fake)continue;
 const originalDir=join(source,entry.name),dir=join(root,entry.name);await mkdir(dir,{recursive:true});
 const audit=await recordSavedVisualCompletion(result.goalText,result.steps.at(-1)?.state.currentDate||'',originalDir,result.steps,undefined,result.finalVisualObservation);
 for(const step of result.steps){
  if(/^step-\d+\.png$/.test(step.screenshot||''))try{await copyFile(join(originalDir,step.screenshot),join(dir,step.screenshot));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  await writeFile(join(dir,`step-${step.number}.json`),JSON.stringify(step,null,2));
 }
 try{await copyFile(join(originalDir,'final.png'),join(dir,'final.png'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 const audited={...result,dir,visualCompletionAudit:audit,visualAuditSource:originalDir};
 await writeFile(join(dir,'result.json'),JSON.stringify(audited,null,2));
 if(result.actionTrace)await writeFile(join(dir,'action-trace.json'),JSON.stringify(result.actionTrace,null,2));
 results.push(audited);await report(root,results);
 console.log(JSON.stringify({trial:entry.name,explorationReason:result.reason,auditStatus:audit.status,assessment:audit.assessment,evidence:audit.evidence.map(o=>o.id),error:audit.error,elapsedMs:audit.elapsedMs}));
}
if(!results.length)throw new Error('No real image-input trials found');
console.log(`Report: ${join(root,'index.html')}`);
