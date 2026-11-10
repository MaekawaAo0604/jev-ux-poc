import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {compareRuns,comparisonCSV,comparisonHTML,type ExperimentRun} from './persona-report.js';
import {report} from './report.js';
if(process.argv.length!==3)throw new Error('Usage: npm run compare:persona -- EXPERIMENT_DIRECTORY');
const root=resolve(process.argv[2]),manifest=JSON.parse(await readFile(join(root,'manifest.json'),'utf8'));
if(manifest.schemaVersion!==1||!Array.isArray(manifest.plan)||!Number.isSafeInteger(manifest.repeats))throw new Error('Invalid manifest');
const results:any[]=[],runs:ExperimentRun[]=[];
for(const item of manifest.plan){
 if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(item.condition)||!Number.isSafeInteger(item.repeat)||item.repeat<1)throw new Error('Invalid run identity');
 const dir=`${item.condition}-${item.repeat}`;
 let result;
 try{result=JSON.parse(await readFile(join(root,dir,'result.json'),'utf8'));}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')continue;throw error;}
 results.push({...result,dir:join(root,dir)});runs.push({...result,condition:item.condition,dir});
}
const comparison=compareRuns(runs,[...new Set<string>(manifest.plan.map((x:any)=>x.condition))],manifest.repeats);
try{comparison.phase2=JSON.parse(await readFile(join(root,'phase2','summary.json'),'utf8'));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
await writeFile(join(root,'comparison.json'),JSON.stringify(comparison,null,2));
await writeFile(join(root,'comparison.csv'),comparisonCSV(comparison));
await writeFile(join(root,'comparison.html'),comparisonHTML(comparison));
await report(root,results);
console.log(join(root,'comparison.html'));
