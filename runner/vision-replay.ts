import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {resolve,join,basename,dirname} from 'node:path';
import {saveRawTest} from './generate-test.js';
import {report} from './report.js';

const root=resolve(process.argv[2]);
const summary=JSON.parse(await readFile(join(root,'summary.json'),'utf8'));
const results=await Promise.all(summary.map((r:any)=>readFile(join(r.dir,'result.json'),'utf8').then(JSON.parse)));
const paths:string[]=[];
const rawDir=resolve('generated/vision');await mkdir(rawDir,{recursive:true});
for(const r of results)if(r.vision&&r.objectiveSuccess&&r.perceivedSuccess){
 if(r.generatedTest?.status==='GENERATED'){
  // Preserve the generated source while placing fixture tests beside, rather
  // than among, ordinary application regressions. Both directories have the
  // same depth, as required by the existing raw generator's shared-goal import.
  const old=r.generatedTest;
  if(![resolve('generated/raw'),rawDir,join(root,'raw')].includes(dirname(resolve(old.testPath))))throw new Error('Unexpected raw output directory');
  const testPath=join(rawDir,basename(old.testPath)),tracePath=join(rawDir,basename(old.tracePath));
  if(resolve(old.testPath)!==testPath){await rename(old.testPath,testPath);await rename(old.tracePath,tracePath);}
  r.generatedTest={...old,testPath,tracePath};
 }else r.generatedTest={status:'GENERATED',...await saveRawTest(r.actionTrace,rawDir)};
 await writeFile(join(r.dir,'result.json'),JSON.stringify(r,null,2));
 paths.push(basename(r.generatedTest.testPath));
}
if(!paths.length)throw new Error('No successful image traces to replay');
const template=await readFile('tests/fixtures/vision-site.html','utf8');
const server=createServer((request,response)=>{
 response.writeHead(200,{'content-type':'text/html; charset=utf-8'});
 response.end(template.replace('__TARGET__',request.url?.startsWith('/b/')?'B':'A'));
});
await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=(server.address() as {port:number}).port;
const {AI_GATEWAY_API_KEY,TYPESAFE_API_KEY,...environment}=process.env;
const started=performance.now();
try{
 const child=await promisify(execFile)(process.execPath,[resolve('node_modules/@playwright/test/cli.js'),'test','--config','playwright.vision.config.ts','--repeat-each=3',...paths],{env:{...environment,VISION_REPLAY_BASE_URL:`http://127.0.0.1:${port}`,VISION_REPLAY_OUTPUT_DIR:join(root,'playwright-results'),VISION_REPLAY_RESULT_FILE:join(root,'playwright-results.json')},maxBuffer:4*1024*1024});
 console.log(child.stdout);
 const output=JSON.parse(await readFile(join(root,'playwright-results.json'),'utf8'));
 await writeFile(join(root,'replay-summary.json'),JSON.stringify({credentialsRemoved:true,traces:paths.length,repeats:3,elapsedMs:performance.now()-started,stats:output.stats,files:paths},null,2));
 await report(root,results);
}catch(error){console.error('Replay failed. Inspect Playwright results in',root);process.exitCode=1;}
finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
