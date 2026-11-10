import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {jevDecide,jevVisualDecide} from '../jev/decide.js';
import {evaluateChoices} from '../jev/client.js';
import {run} from './engine.js';
import {report} from './report.js';

try{process.loadEnvFile('.env');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
const root=resolve('reports',`vision-validation-${new Date().toISOString().replaceAll(':','-')}`);
await mkdir(root,{recursive:true});
const template=await readFile('tests/fixtures/vision-site.html','utf8');
const server=createServer((request,response)=>{
 const target=request.url?.startsWith('/b/')?'B':'A';
 response.writeHead(200,{'content-type':'text/html; charset=utf-8'});
 response.end(template.replace('__TARGET__',target));
});
await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=(server.address() as {port:number}).port;
const browser=await chromium.launch({headless:true}),results:any[]=[],measurements:any[]=[];
const textDecide=(state:Parameters<typeof jevDecide>[0],candidates:Parameters<typeof jevDecide>[1])=>jevDecide(state,candidates,undefined,(input,questions)=>evaluateChoices(input,questions,undefined,{gatewayHTTP:true}));
try{
 for(let repeat=1;repeat<=3;repeat++)for(const target of ['A','B'])for(const vision of (repeat%2?[false,true]:[true,false])){
  const context=await browser.newContext({viewport:{width:1280,height:900},locale:'ja-JP'});
  try{
   const page=await context.newPage();
   const result=await run(page,textDecide,{variant:'good',goal:'notifications',font:true,maxActions:0,repeat,fake:false,pom:'auto',success:'both',vision,baseURL:`http://127.0.0.1:${port}/${target.toLowerCase()}`,dir:join(root,`${target}-${vision?'image':'dom'}-${repeat}`),generateTest:true,rawDir:resolve('generated/vision')},undefined,vision?jevVisualDecide:undefined);
   results.push(result);
   const first=result.actionTrace.actions.find(action=>action.action==='click');
   const firstTarget=first?.target?.accessibleName||first?.target?.text;
   const measured={target,vision,repeat,firstTarget:firstTarget??null,firstCorrect:firstTarget===target,objectiveSuccess:result.objectiveSuccess,perceivedSuccess:result.perceivedSuccess,falseCompletion:result.perceivedSuccess&&!result.objectiveSuccess,reason:result.reason,actions:result.actionCount,elapsedMs:result.elapsedMs,decisionMs:result.timing.decisionMs,inputTokens:result.steps.reduce((sum,s)=>sum+(s.decision?.usage?.inputTokens||0),0),rawStatus:result.generatedTest.status};
   measurements.push(measured);
   await writeFile(join(root,'measurements.json'),JSON.stringify({model:'jev-1.14.0',note:'Both arms use identical DOM observations, questions, model and HTTP transport. Only the screenshot differs. The correct button is not provided to Jev. Eventual success can result from trying both buttons; firstCorrect measures image guidance.',measurements},null,2));
   await report(root,results);
   console.log(JSON.stringify(measured));
  }finally{await context.close();}
 }
}finally{await browser.close();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
console.log(`Report: ${join(root,'index.html')}`);
