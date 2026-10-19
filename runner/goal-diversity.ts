import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {chromium} from 'playwright';
import {diversityCases,diversityHTML,evaluateDiversityTrial} from './goal-diversity-fixture.js';
import {run} from './engine.js';
import {jevDecide,jevVisualDecide} from '../jev/decide.js';
import {report} from './report.js';

const args=process.argv.slice(2);
if(args.length===1&&args[0]==='--help'){console.log('Usage: npx tsx runner/goal-diversity.ts [--repeat N]\nRuns six owned cases sequentially using the live Jev API. Default: two repeats. Requires AI_GATEWAY_API_KEY.');process.exit(0);}
if(args.length&&!(args.length===2&&args[0]==='--repeat'))throw Error('Unknown options; use --help');
const repeats=args.length?Number(args[1]):2;
if(!Number.isSafeInteger(repeats)||repeats<1)throw Error('Invalid --repeat');
try{process.loadEnvFile('.env');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
if(!process.env.AI_GATEWAY_API_KEY)throw Error('AI_GATEWAY_API_KEY is required');
const root=resolve('reports',`goal-diversity-${new Date().toISOString().replaceAll(':','-')}`);await mkdir(root,{recursive:true});
const server=createServer((req,res)=>{const html=diversityHTML(new URL(req.url||'/','http://localhost').pathname);res.writeHead(html?200:404,{'content-type':'text/html; charset=utf-8'});res.end(html||'Not found');});
await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const port=(server.address() as {port:number}).port;
const results:any[]=[],trials:any[]=[];
try{
 for(let repeat=1;repeat<=repeats;repeat++)for(const scenario of diversityCases){
  const start=performance.now();let result:any;
  console.log(`START ${scenario.id} #${repeat}`);
  if(scenario.operation){
   const browser=await chromium.launch({headless:true});
   try{
    const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'ja-JP'}),page=await context.newPage();page.setDefaultTimeout(10000);
    result=await run(page,jevDecide,{variant:'good',goal:'notifications',font:true,maxActions:0,dir:join(root,`${scenario.id}-${repeat}`),baseURL:`http://127.0.0.1:${port}/${scenario.id}`,repeat,fake:false,pom:'auto',success:'jev',vision:true,imageOnly:true,imageMemory:true,imageMemoryProof:true},undefined,jevVisualDecide);
   }finally{await browser.close();}
  }else{
   const {stdout}=await promisify(execFile)(process.execPath,['--import',import.meta.resolve('tsx'),resolve('runner/public-site.ts'),`http://127.0.0.1:${port}/${scenario.id}/`,scenario.goal,'--reviewed','--vision','--image-only','--image-memory','--image-memory-proof','--max-actions','0','--interval-ms','1000'],{maxBuffer:4*1024*1024});
   const summary=JSON.parse(stdout.trim().split('\n').at(-1)!);result=JSON.parse(await readFile(resolve(summary.report,'../exploration/result.json'),'utf8'));
  }
  const evaluation=evaluateDiversityTrial(scenario.id,result);
  const trial={scenario:scenario.id,family:scenario.family,repeat,reason:result.reason,actions:result.actionCount,explorationMs:result.elapsedMs,totalMs:performance.now()-start,outcomeMs:result.goalOutcome?.elapsedMs??null,outcomeStatus:result.goalOutcome?.status??'NOT_RUN',itemStatuses:result.goalOutcome?.items.map((i:any)=>i.status)??[],evaluation,source:result.dir};
  trials.push(trial);results.push({...result,variant:scenario.id,repeat,diversityEvaluation:evaluation});
  await writeFile(join(root,'measurements.json'),JSON.stringify({schemaVersion:1,repeats,scope:'Owned deterministic fixtures only; all six cases reported. Four task families plus conditional and blocked controls. No routes or expected answers sent to Jev. Different runners for public read-only and owned operations; do not pool their latency as comparable performance.',trials},null,2));
  await report(root,results);console.log(JSON.stringify(trial));
 }
}finally{await new Promise<void>((r,j)=>server.close(e=>e?j(e):r()));}
console.log(`Report: ${join(root,'index.html')}`);
