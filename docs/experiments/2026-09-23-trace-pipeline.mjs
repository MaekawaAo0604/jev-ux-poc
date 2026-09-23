// Repeatable receipts for the real-Jev exploration and credential-free replays.
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile,copyFile,stat} from 'node:fs/promises';
import {resolve,join,basename,dirname} from 'node:path';
import {createHash} from 'node:crypto';

const [mode,manifestPath,kind]=process.argv.slice(2);
const hash=async path=>createHash('sha256').update(await readFile(path)).digest('hex');
async function execute(args,logPath,withoutJev=false){
 const startedAt=new Date().toISOString(),start=performance.now();let output='';
 const env=withoutJev?Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^(AI_GATEWAY_API_KEY|TYPESAFE_API_KEY|OPENAI_API_KEY|JEV_API_KEY)$/i.test(key))):process.env;
 const exitCode=await new Promise((done,reject)=>{
  const child=spawn(process.execPath,args,{windowsHide:true,env,stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',b=>{output+=b;process.stdout.write(b);});
  child.stderr.on('data',b=>{output+=b;process.stderr.write(b);});
  child.on('error',reject);child.on('exit',done);
 });
 await writeFile(logPath,output);
 return {args,startedAt,finishedAt:new Date().toISOString(),elapsedMs:performance.now()-start,exitCode,withoutJev,output};
}
if(mode==='explore'||mode==='recover'){
 const root=mode==='recover'?resolve(manifestPath):resolve('reports',`trace-pipeline-${new Date().toISOString().replaceAll(':','-')}`);await mkdir(root,{recursive:true});
 const receipt=mode==='recover'?{output:await readFile(join(root,'explore.txt'),'utf8'),startedAt:(await stat(root)).birthtime.toISOString(),finishedAt:(await stat(join(root,'explore.txt'))).mtime.toISOString(),elapsedMs:null,exitCode:null,recovered:true,timestampSource:'directory birth time and completed log mtime; wrapper exit code unavailable'}:
  await execute(['--import','tsx','runner/run.ts','--variant','good','--goal','notifications','--font','on','--pom','auto','--success','both','--repeat','1','--max-actions','8','--generate-test'],join(root,'explore.txt'));
 await writeFile(join(root,'explore-receipt.json'),JSON.stringify(receipt,null,2));
 const found=/Report: (.+)/.exec(receipt.output);
 const reportPath=found?.[1].trim();
 const reportRoot=reportPath?.endsWith('.html')?dirname(reportPath):reportPath;
 const resultPath=reportRoot?join(reportRoot,'good-notifications-font-true-1','result.json'):null;
 const result=resultPath?JSON.parse(await readFile(resultPath,'utf8')):null;
 const {output,...exploration}=receipt;
 const raw=result?.generatedTest?.testPath;
 const manifest={root,exploration,resultPath,rawTestPath:raw,rawTracePath:result?.generatedTest?.tracePath,
  rawHash:raw?await hash(raw):null,traceHash:raw?await hash(result.generatedTest.tracePath):null,
  explorationCompletedAt:result?.actionTrace?.completedAt,timing:result?.timing,objectiveSuccess:result?.objectiveSuccess,
  perceivedSuccess:result?.perceivedSuccess,fake:result?.fake,actions:result?.actionTrace?.actions,replays:[]};
 const path=join(root,'validation.json');await writeFile(path,JSON.stringify(manifest,null,2));
 console.log(JSON.stringify({manifest:path,rawTestPath:raw,exitCode:receipt.exitCode}));
 if((mode==='explore'&&receipt.exitCode!==0)||!raw)process.exitCode=1;
}else if(mode==='replay'&&manifestPath&&['raw','regression'].includes(kind)){
 const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
 if(await hash(manifest.rawTestPath)!==manifest.rawHash||await hash(manifest.rawTracePath)!==manifest.traceHash)throw new Error('Raw evidence changed');
 const index=manifest.replays.length+1;
 const args=['node_modules/@playwright/test/cli.js','test',...(kind==='raw'?['--config','playwright.raw.config.ts',basename(manifest.rawTestPath)]:['notifications.spec.ts']),'--repeat-each=3','--workers=1','--retries=0'];
 const receipt=await execute(args,join(manifest.root,`${kind}-${index}.txt`),true);
 const jsonReport=resolve('reports',kind==='raw'?'playwright-raw-results.json':'playwright-results.json');
 const savedReport=join(manifest.root,`${kind}-${index}.json`);await copyFile(jsonReport,savedReport);
 const report=JSON.parse(await readFile(savedReport,'utf8'));
 const {output,...replay}=receipt;
 manifest.replays.push({...replay,kind,report:savedReport,stats:report.stats,
  rawUnchanged:await hash(manifest.rawTestPath)===manifest.rawHash&&await hash(manifest.rawTracePath)===manifest.traceHash});
 manifest.lastUpdatedAt=new Date().toISOString();
 if(kind==='regression'&&receipt.exitCode===0){
  manifest.regressionPath=resolve('tests/regression/notifications.spec.ts');
  manifest.regressionHash=await hash(manifest.regressionPath);
  manifest.goalCompletionToRegressionPassMs=Date.parse(receipt.finishedAt)-Date.parse(manifest.explorationCompletedAt);
  manifest.rawReadyToRegressionPassMs=Date.parse(receipt.finishedAt)-Date.parse(manifest.exploration.finishedAt);
 }
 await writeFile(manifestPath,JSON.stringify(manifest,null,2));
 console.log(JSON.stringify({manifest:manifestPath,kind,stats:report.stats,exitCode:receipt.exitCode}));
 if(receipt.exitCode!==0)process.exitCode=1;
}else throw new Error('Usage: ... explore | replay <validation.json> raw|regression');
