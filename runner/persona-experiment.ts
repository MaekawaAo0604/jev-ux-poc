import {chromium} from 'playwright';
import {createServer} from 'vite';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve,join,dirname,relative} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {parsePersona,parseCharter,publicExploration,experimentDecider,type Persona} from '../jev/persona.js';
import {evaluateChoices,type ChoiceEvaluator} from '../jev/client.js';
import {fakeDecide} from '../jev/fake.js';
import {run,type VisualDecider} from './engine.js';
import {compareRuns,comparisonCSV,comparisonHTML,extractFindings,type ExperimentRun} from './persona-report.js';
import {report} from './report.js';

const args=process.argv.slice(2);
if(args.includes('--help')){
 console.log('npm run experiment:persona -- [--charter FILE] [--persona FILE ... | --baseline-only] [--repeat 3] [--vision] [--exploration-memory on|off] [--page-identity document|hash-route] [--fake] [--out NEW_DIRECTORY] [--headed]\nDefault: baseline + A/B/C, 3 repeats, local Bad UI, fixed 1280x900 viewport. --fake checks plumbing only. --vision uses the existing numbered screenshot + DOM mode; image-only is not enabled by this runner.');process.exit(0);
}
const values=new Map<string,string[]>(),flags=new Set<string>();
for(let i=0;i<args.length;i++){
 const arg=args[i];
 if(['--fake','--vision','--headed','--baseline-only'].includes(arg)){flags.add(arg);continue;}
 if(!['--charter','--persona','--repeat','--out','--page-identity','--exploration-memory'].includes(arg)||!args[i+1]||args[i+1].startsWith('--'))throw new Error(`Unknown option or missing value: ${arg}`);
 if(arg!=='--persona'&&values.has(arg))throw new Error(`Duplicate option: ${arg}`);
 values.set(arg,[...(values.get(arg)??[]),args[++i]]);
}
const option=(key:string,fallback:string)=>values.get(key)?.[0]??fallback;
const repeats=Number(option('--repeat','3'));
const memoryOption=option('--exploration-memory','on');
if(!['on','off'].includes(memoryOption))throw new Error('--exploration-memory must be on or off');
const explorationMemory=memoryOption==='on';
const pageIdentity=option('--page-identity','hash-route');
if(!['document','hash-route'].includes(pageIdentity))throw new Error('--page-identity must be document or hash-route');
if(!Number.isSafeInteger(repeats)||repeats<1||repeats>30)throw new Error('--repeat must be 1..30');
if(flags.has('--baseline-only')&&values.has('--persona'))throw new Error('--baseline-only cannot combine with --persona');
if(existsSync('.env'))process.loadEnvFile('.env');
const fake=flags.has('--fake'),vision=flags.has('--vision');
if(fake&&vision)throw new Error('--fake cannot combine with --vision');
if(!fake&&!process.env.AI_GATEWAY_API_KEY&&!process.env.TYPESAFE_API_KEY)throw new Error('Set AI_GATEWAY_API_KEY or TYPESAFE_API_KEY, or use --fake for plumbing only.');
if(vision&&!process.env.AI_GATEWAY_API_KEY)throw new Error('--vision requires AI_GATEWAY_API_KEY');
const charterPath=option('--charter','experiments/persona/charter.json');
const charter=parseCharter(JSON.parse(await readFile(charterPath,'utf8')));
const personaPaths=flags.has('--baseline-only')?[]:values.get('--persona')??['experiments/persona/persona-a.json','experiments/persona/persona-b.json','experiments/persona/persona-c.json'];
const personas=await Promise.all(personaPaths.map(async path=>parsePersona(JSON.parse(await readFile(path,'utf8')))));
if(new Set(personas.map(p=>p.id)).size!==personas.length)throw new Error('Persona ids must be unique');
const conditions:{id:string;persona?:Persona}[]=[{id:'baseline'},...personas.map(persona=>({id:persona.id,persona}))];
const root=resolve(option('--out',join('reports',new Date().toISOString().replaceAll(':','-')+'-persona'+(fake?'-fake':'')+'-'+randomUUID().slice(0,8))));
await mkdir(dirname(root),{recursive:true});await mkdir(root); // Never overwrite previous experiments.
const hash=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const inputs={charter,personas};
const sourceHashes:Record<string,string>={};
async function hashSources(directory:string){
 for(const entry of (await readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
  const path=join(directory,entry.name);
  if(entry.isDirectory())await hashSources(path);
  else if(entry.isFile()&&/\.(tsx?|css|html)$/.test(entry.name))sourceHashes[path.replaceAll('\\','/')]=hash(await readFile(path));
 }
}
for(const directory of ['app','pages','jev','runner'])await hashSources(directory);
for(const file of ['package.json','package-lock.json','index.html','tsconfig.json','tests/goals.ts'])sourceHashes[file]=hash(await readFile(file));
const sourceHash=hash(JSON.stringify(sourceHashes));
let revision='unknown',workingTreeHash='unknown';
try{revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();workingTreeHash=hash(execFileSync('git',['diff','--','app','pages','jev','runner','package.json','package-lock.json']));}catch{}
// Randomize within each repeat block. The saved order and seed permit auditing.
let orderState=20261026;
const plan=Array.from({length:repeats},(_,i)=>{
 const block=[...conditions];for(let j=block.length-1;j>0;j--){orderState=(Math.imul(orderState,1664525)+1013904223)>>>0;const k=Math.floor(orderState/4294967296*(j+1));[block[j],block[k]]=[block[k],block[j]];}
 return block.map(c=>({condition:c.id,repeat:i+1}));
}).flat();
const model=vision?'jev-1.14.0':process.env.JEV_MODEL||'jev-1.14.0';
process.env.JEV_MODEL=model;
const manifest={schemaVersion:1,startedAt:new Date().toISOString(),fake,pageIdentity,explorationMemory,loopPolicy:explorationMemory?'existing-memory-with-action-limit':'legacy-triple-signature',explorationPipeline:explorationMemory?'existing-memory-and-frontier':'legacy-local',observationMode:vision?'numbered-image-and-dom':'dom',modelRequested:model,viewport:{width:1280,height:900},locale:'ja-JP',timezoneId:'Asia/Tokyo',repeats,orderSeed:20261026,plan,inputs,inputHash:hash(JSON.stringify(inputs)),revision,workingTreeHash,sourceHash,sourceHashes,lockfileHash:hash(await readFile('package-lock.json')),node:process.version,reset:'fresh browser context and page per run, no shared storage; local demo home and notification state reset',reasonLogging:'same extra Choice question for all conditions; category is model self-report',limitations:['Persona A smartphone use is descriptive; viewport is held constant for experiment 1.','Only bundled local Good/Bad sites are supported. No fill action is added.','No generation seed is available in the existing Jev client; run variation is measured.']};
await writeFile(join(root,'manifest.json'),JSON.stringify(manifest,null,2));
await writeFile(join(root,'inputs.json'),JSON.stringify(inputs,null,2));
const results:Awaited<ReturnType<typeof run>>[]=[],runs:ExperimentRun[]=[];
const server=await createServer({server:{host:'127.0.0.1',port:0},logLevel:'error'});await server.listen();
let browser;
try{
 browser=await chromium.launch({headless:!flags.has('--headed'),...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
 await writeFile(join(root,'environment.json'),JSON.stringify({browser:browser.version(),platform:process.platform,arch:process.arch},null,2));
 const baseURL=server.resolvedUrls!.local[0].replace(/\/$/,''),origin=new URL(baseURL).origin,variant=charter.targetWebsite==='local:good'?'good':'bad';
 const evaluate:ChoiceEvaluator=(state,questions)=>evaluateChoices(state,questions,undefined,process.env.AI_GATEWAY_API_KEY?{gatewayHTTP:true,model}:undefined);
 for(const item of plan){
  const condition=conditions.find(c=>c.id===item.condition)!;
  const runDir=join(root,`${condition.id}-${item.repeat}`),dir=relative(root,runDir).replaceAll('\\','/');
  await mkdir(runDir,{recursive:true});
  const context=await browser.newContext({viewport:manifest.viewport,locale:manifest.locale,timezoneId:manifest.timezoneId,acceptDownloads:!charter.prohibitedActions.downloads,serviceWorkers:'block'});
  const boundaries:string[]=[];
  try{
   await context.route('**/*',route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin!==origin||!['GET','HEAD'].includes(request.method())||(request.isNavigationRequest()&&url.pathname!==`/${variant}/`)){
     boundaries.push(`${request.method()} ${url.origin===origin?url.pathname:'external-origin'}`);return route.abort();
    }
    return route.continue();
   });
   const page=await context.newPage();page.setDefaultTimeout(10000);
   await context.tracing.start({screenshots:true,snapshots:true,sources:false});
   const exploration=publicExploration({charter,...(condition.persona?{persona:condition.persona}:{})});
   const visual:VisualDecider=async(state,candidates,_bytes,visualContext,frontier)=>{
    if(!visualContext)throw new Error('Missing existing visual context');
    return experimentDecider((input,questions)=>visualContext.evaluate(input,questions),true)(state,candidates,{frontier});
   };
   const result=await run(page,fake?fakeDecide:experimentDecider(evaluate),{variant,goal:charter.oracle,font:false,maxActions:charter.maxActions,dir:runDir,baseURL,repeat:item.repeat,fake,explorationMemory,pageIdentity:pageIdentity as 'document'|'hash-route',pom:'auto',success:'both',vision,exploration},undefined,vision?visual:undefined);
   results.push(result);
   const recorded:ExperimentRun={...result,condition:condition.id,dir};runs.push(recorded);
   await writeFile(join(runDir,'findings.json'),JSON.stringify({schemaVersion:1,evidence:fake?'PLUMBING_ONLY':'LIVE_MODEL',findings:extractFindings(recorded),boundaries},null,2));
   await writeFile(join(runDir,'events.jsonl'),result.steps.map(s=>JSON.stringify({schemaVersion:1,condition:condition.id,repeat:item.repeat,...s})).join('\n')+'\n');
   console.log(`[${runs.length}/${plan.length}] ${condition.id} #${item.repeat}: ${result.reason}, success=${result.objectiveSuccess}, ${result.actionCount} actions`);
  }finally{
   try{await context.tracing.stop({path:join(runDir,'trace.zip')});}finally{await context.close();}
  }
  const comparison=compareRuns(runs,conditions.map(c=>c.id),repeats);
  await writeFile(join(root,'comparison.json'),JSON.stringify(comparison,null,2));
  await writeFile(join(root,'comparison.csv'),comparisonCSV(comparison));
  await writeFile(join(root,'comparison.html'),comparisonHTML(comparison));
  await report(root,results);
 }
 if(runs.some(r=>['PAGE_ERROR','ACTION_ERROR','DECISION_ERROR'].includes(r.reason)))process.exitCode=1;
 console.log(`Comparison: ${join(root,'comparison.html')}`);
 console.log(`Screenshots/report: ${join(root,'index.html')}`);
}finally{await browser?.close();await server.close();}
