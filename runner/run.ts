import {chromium} from 'playwright';
import {createServer} from 'vite';
import {resolve,join} from 'node:path';
import {existsSync} from 'node:fs';
import {jevDecide,jevVisualDecide} from '../jev/decide.js';
import {evaluateChoices} from '../jev/client.js';
import {fakeDecide} from '../jev/fake.js';
import {run} from './engine.js';
import {report} from './report.js';
import {goals,type GoalId} from '../tests/goals.js';
if(existsSync('.env'))process.loadEnvFile('.env');
const args=process.argv.slice(2);const option=(key:string,fallback:string)=>{const i=args.indexOf(key);if(i<0)return fallback;if(!args[i+1]||args[i+1].startsWith('--'))throw new Error(`Missing value: ${key}`);return args[i+1];};
const fake=args.includes('--fake');
const vision=args.includes('--vision');
const visionOCR=args.includes('--vision-ocr');
const imageOnly=args.includes('--image-only');
const imageMemory=args.includes('--image-memory');
const imageMemoryProof=args.includes('--image-memory-proof');
if(visionOCR&&!vision)throw new Error('--vision-ocr requires --vision');
if(imageOnly&&!vision)throw new Error('--image-only requires --vision');
if(imageOnly&&visionOCR)throw new Error('--image-only cannot combine with --vision-ocr');
if(imageMemory&&!imageOnly)throw new Error('--image-memory requires --image-only');
if(imageMemoryProof&&!imageMemory)throw new Error('--image-memory-proof requires --image-memory');
if(vision&&(fake||!process.env.AI_GATEWAY_API_KEY))throw new Error('--vision requires AI_GATEWAY_API_KEY and a real Jev run');
const maxActions=Number(option('--max-actions','20')),repeats=Number(option('--repeat','1'));
if(!Number.isInteger(maxActions)||maxActions<0||!Number.isInteger(repeats)||repeats<1)throw new Error('Invalid numeric option');
const selected=option('--goal','all');if(selected!=='all'&&!Object.hasOwn(goals,selected))throw new Error('Unknown goal');
const variantOption=option('--variant','all'),fontOption=option('--font','all');
const pomOption=option('--pom','manual'),successOption=option('--success','both');
if(!['manual','auto'].includes(pomOption)||!['oracle','jev','both'].includes(successOption))throw new Error('Invalid pom/success mode');
if(!['all','good','bad'].includes(variantOption)||!['all','on','off'].includes(fontOption))throw new Error('Invalid variant/font');
if(!fake&&!process.env.TYPESAFE_API_KEY&&!process.env.AI_GATEWAY_API_KEY)throw new Error('Set AI_GATEWAY_API_KEY or TYPESAFE_API_KEY in .env first. Use npm run demo for the offline plumbing check.');
const server=await createServer({server:{host:'127.0.0.1',port:0},logLevel:'error'});await server.listen();
let browser;
try{
  browser=await chromium.launch({headless:!args.includes('--headed'),...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
  const root=resolve('reports',new Date().toISOString().replaceAll(':','-')+(fake?'-fake':''));const results=[];
  for(let repeat=1;repeat<=repeats;repeat++)for(const variant of (variantOption==='all'?['good','bad']:[variantOption]) as ('good'|'bad')[])for(const font of (fontOption==='all'?[false,true]:[fontOption==='on']))for(const goal of (selected==='all'?Object.keys(goals):[selected]) as GoalId[]){
    const context=await browser.newContext({viewport:{width:1280,height:900},locale:'ja-JP',acceptDownloads:true});
    const page=await context.newPage();
    // Keep the experiment local; external fonts are optional and excluded for repeatability.
    await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(server.resolvedUrls!.local[0]).origin?route.continue():route.abort());
    const result=await run(page,fake?fakeDecide:jevDecide,{variant,font,goal,repeat,fake,maxActions,vision,visionOCR,imageOnly,imageMemory,imageMemoryProof,generateTest:args.includes('--generate-test'),pom:pomOption as 'manual'|'auto',success:successOption as 'oracle'|'jev'|'both',baseURL:server.resolvedUrls!.local[0].replace(/\/$/,''),dir:join(root,`${variant}-${goal}-font-${font}-${repeat}`)},fake?undefined:evaluateChoices,vision?jevVisualDecide:undefined);
    results.push(result);await report(root,results);console.log(`${variant} ${goal} font=${font}: ${result.reason} (${result.actionCount} actions)`);await context.close();
  }
  console.log(`Report: ${join(root,'index.html')}`);
  for(const result of results)if(result.generateTest)console.log(JSON.stringify({generatedTest:result.generatedTest}));
  if(results.some(r=>['PAGE_ERROR','ACTION_ERROR','DECISION_ERROR'].includes(r.reason)||(r.generateTest&&r.generatedTest.status!=='GENERATED')))process.exitCode=1;
}finally{await browser?.close();await server.close();}
