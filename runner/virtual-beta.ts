import {chromium} from 'playwright';
import {createServer} from 'vite';
import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {parsePersona,parseCharter} from '../jev/persona.js';
import {evaluateBetaRequest} from './virtual-beta-evaluator.js';
import {comparisonConfigs,validateConfig} from '../jev/virtual-beta/config.js';
import type {BetaConfig} from '../jev/virtual-beta/contracts.js';
import {runBeta,sha,BetaBudgetError,type BetaEvaluator,type BetaResult} from './virtual-beta-core.js';
function parseArgs(args:string[]){const values=new Map<string,string>(),flags=new Set<string>();for(let i=0;i<args.length;i++){const k=args[i];if(['--mock','--headed','--help'].includes(k)){flags.add(k);continue;}if(!['--charter','--persona','--config','--out','--seed','--vision','--env-file','--repeat','--max-total-api'].includes(k)||!args[i+1]||args[i+1].startsWith('--')||values.has(k))throw new Error('INVALID_OPTION '+k);values.set(k,args[++i]);}return {values,flags};}
export function mockEvaluator():BetaEvaluator{
 let n=0;return async({questions,input})=>{const options=questions.nextAction.criteria;const constrained=!(input.observation as any)?.screen;const script=constrained?['look_3','e5','look_2','e3','done']:['e5','e3','done'];let choice=script[n]??'done';n++;if(!(choice in options))choice=Object.keys(options).find(k=>/^e[1-9]\d*$/.test(k))??'done';return {model:'MOCK_SCRIPTED_FIXTURE',answers:Object.fromEntries(Object.entries(questions).map(([key,q])=>{const selected=key==='nextAction'?choice:'goal';return [key,{choice:selected,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k===selected?1:0]))}];}))};};
}
export function comparisonHTML(results:BetaResult[]){const esc=(x:unknown)=>String(x).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!));return '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Jev virtual beta comparison</title><style>body{font:16px system-ui;max-width:1200px;margin:24px auto;padding:0 16px}table{border-collapse:collapse;display:block;overflow:auto}td,th{padding:12px;border:1px solid #ccc}code{overflow-wrap:anywhere}img{max-width:100%}a{color:#0759a8}</style><h1>Jev virtual beta</h1><p>Implementation smoke comparison. Model probabilities and scripted behavior do not establish human behavior. API milliseconds are not user hesitation time. Objective and perceived outcomes are independent.</p><table><tr><th>Run</th><th>Vision</th><th>State / selection</th><th>Objective</th><th>Perceived done</th><th>Termination</th><th>UI / looks</th><th>API calls / ms</th><th>Audit validity</th></tr>'+results.map(r=>'<tr><td><a href="'+esc(r.runId)+'/result.json">'+esc(r.runId)+'</a></td><td>'+esc(r.config.vision.mode)+'</td><td>'+esc(r.config.state.enabled)+' / '+esc(r.config.selection.mode)+'</td><td>'+r.objectiveSuccess+'</td><td>'+r.perceivedDone+'</td><td>'+esc(r.termination)+'</td><td>'+r.uiActions+' / '+r.looks+'</td><td>'+r.apiCalls+' / '+Math.round(r.apiMs)+'</td><td>'+esc(r.validForComparison)+' / '+esc(r.terminalObservation.status)+' / '+esc(r.objectiveAssessment.status)+'</td></tr>').join('')+'</table>'+results.map(r=>'<h2>'+esc(r.runId)+'</h2><p>Initial fingerprint: <code>'+esc(r.initialFingerprint)+'</code></p>'+r.steps.filter(s=>s.assetFiles?.current).map(s=>'<details><summary>Decision '+s.number+' — '+esc(s.action?.type??s.error)+'</summary><a href="'+esc(r.runId)+'/step-'+s.number+'.json">Evidence / payload / distribution</a><p><img loading="lazy" src="'+esc(r.runId)+'/'+esc(s.assetFiles!.current.file)+'"></p></details>').join('')).join('');}
export async function main(args=process.argv.slice(2)){
 const {values:v,flags:f}=parseArgs(args);
 if(f.has('--help')){console.log('npm run experiment:virtual-beta -- [--mock] [--charter FILE] [--persona FILE] [--config ARRAY_JSON] [--vision crop|foveated] [--seed UINT32] [--repeat 1..3] [--max-total-api 1..48] [--env-file FILE] [--out NEW_DIRECTORY] [--headed]');return;}
 const mock=f.has('--mock'),seed=Number(v.get('--seed')??20261027),repeat=Number(v.get('--repeat')??1),maxTotalAPI=Number(v.get('--max-total-api')??24),vision=v.get('--vision')??'foveated';
 if(!Number.isInteger(repeat)||repeat<1||repeat>3||!Number.isInteger(maxTotalAPI)||maxTotalAPI<1||maxTotalAPI>48||!['crop','foveated'].includes(vision))throw new Error('INVALID_BUDGET');
 if(!mock){const env=v.get('--env-file')??'.env';if(existsSync(env))process.loadEnvFile(env);if(!process.env.AI_GATEWAY_API_KEY)throw new Error('AI_GATEWAY_API_KEY required (or use --mock)');}
 const charter=parseCharter(JSON.parse(await readFile(v.get('--charter')??'experiments/persona/charter-good.json','utf8'))),persona=parsePersona(JSON.parse(await readFile(v.get('--persona')??'experiments/persona/persona-a.json','utf8')));
 if(charter.oracle!=='notifications')throw new Error('Virtual beta v1 supports only the bundled notification oracle; invoice download requires a separate audit adapter');
 const configs:BetaConfig[]=v.has('--config')?JSON.parse(await readFile(v.get('--config')!,'utf8')).map(validateConfig):comparisonConfigs(seed,vision as 'crop'|'foveated');
 if(configs.length!==4||new Set(configs.map(c=>c.id)).size!==4)throw new Error('Four unique conditions required');
 const root=resolve(v.get('--out')??join('reports','virtual-beta-'+(mock?'mock-':'live-')+randomUUID()));await mkdir(dirname(root),{recursive:true});await mkdir(root);
 const sourceHashes:Record<string,string>={};
 async function sources(path:string){for(const entry of (await readdir(path,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const file=join(path,entry.name);if(entry.isDirectory())await sources(file);else if(/\.(tsx?|css|html)$/.test(entry.name))sourceHashes[file.replaceAll('\\','/')]=sha(await readFile(file));}}
 for(const p of ['app','pages','jev','runner'])await sources(p);for(const p of ['package.json','package-lock.json','tests/goals.ts','index.html'])sourceHashes[p]=sha(await readFile(p));
 const manifest={schemaVersion:1,createdAt:new Date().toISOString(),revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceHashes,sourceHash:sha(JSON.stringify(sourceHashes)),mock,model:mock?'MOCK_SCRIPTED_FIXTURE':'jev-1.14.0',charter,persona,configs,repeat,maxTotalAPI,viewport:{width:1280,height:900},locale:'ja-JP',timezoneId:'Asia/Tokyo',modelSeedAvailable:false,concurrency:1,externalFonts:'Google Fonts stylesheet replaced by empty CSS; fixed OS fallback font',baseline:'Controlled harness using existing goal instructions, numbered image, DOM, POM and charter filter; no frontier or automatic revisit suppression. Legacy CLI regression tested separately.'};
 await writeFile(join(root,'manifest.json'),JSON.stringify(manifest,null,2));
 const server=await createServer({server:{host:'127.0.0.1',port:0}});await server.listen();const address=server.httpServer!.address();if(!address||typeof address==='string')throw new Error('NO_LOCAL_PORT');const baseURL='http://127.0.0.1:'+address.port;
 let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined,totalCalls=0;const results:BetaResult[]=[];
 try{browser=await chromium.launch({headless:!f.has('--headed')});
 for(let iteration=1;iteration<=repeat;iteration++)for(const config of configs){
  const runId=config.id+'-'+iteration,dir=join(root,runId),context=await browser.newContext({viewport:manifest.viewport,locale:manifest.locale,timezoneId:manifest.timezoneId,acceptDownloads:false});let safety=false;
  await context.route('**/*',route=>{const request=route.request();const url=new URL(request.url());if(url.hostname==='fonts.googleapis.com'&&request.resourceType()==='stylesheet')return route.fulfill({contentType:'text/css',body:''});if(url.origin===baseURL&&['GET','HEAD'].includes(request.method()))return route.continue();safety=true;return route.abort();});
  const page=await context.newPage();page.on('download',download=>{safety=true;void download.cancel();});await context.tracing.start({screenshots:true,snapshots:true,sources:false});
  const fake=mockEvaluator(),evaluate:BetaEvaluator=async request=>{if(totalCalls>=maxTotalAPI)throw new BetaBudgetError('API_LIMIT');totalCalls++;if(mock)return fake(request);return evaluateBetaRequest(request);};
  try{const result=await runBeta(page,{runId,dir,baseURL,charter,persona,config,evaluate,isSafetyStopped:()=>safety});results.push(result);console.log(runId+': '+result.termination+' objective='+result.objectiveSuccess+' UI='+result.uiActions+' looks='+result.looks+' API='+result.apiCalls);}
  finally{await context.tracing.stop({path:join(dir,'trace.zip')});await context.close();}
 }
 }finally{await browser?.close();await server.close();}
 const summary={schemaVersion:1,mock,sourceHash:manifest.sourceHash,model:manifest.model,totalCalls,initialStatesMatch:new Set(results.map(r=>r.initialFingerprint)).size===1,runs:results.map(({steps,...r})=>r),humanValidity:'UNVERIFIED',probabilitiesAreHumanFrequencies:false};
 await writeFile(join(root,'comparison.json'),JSON.stringify(summary,null,2));
 const cols=['runId','condition','objectiveSuccess','perceivedDone','termination','uiActions','looks','decisions','apiCalls','apiMs','uiMs','modeledUserMs','validForComparison'] as const;
 await writeFile(join(root,'comparison.csv'),cols.join(',')+'\n'+results.map(r=>cols.map(c=>r[c]??'').join(',')).join('\n')+'\n');
 await writeFile(join(root,'comparison.html'),comparisonHTML(results));console.log('Artifacts: '+root);
 return {root,results};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
