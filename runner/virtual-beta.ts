import {analyzeDeliberationRun} from './deliberation-analysis.js';
import {chromium} from 'playwright';
import {createServer} from 'vite';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
import {PhaseBudget} from './virtual-beta-budget.js';
import {analyzeRun} from './virtual-beta-analysis.js';
import {sourceIdentity} from './virtual-beta-source.js';
import {createSemanticTrials,semanticMockEvaluator} from './semantic-protocol.js';
import {compareSemanticRuns} from './semantic-analysis.js';
import type {SemanticTrial} from '../jev/virtual-beta/semantic-types.js';
import {comparisonUIs,roiSelectors} from '../app/virtual-beta-ui.js';
import type {BetaUIId,BetaUIIdentity} from '../jev/virtual-beta/ui-types.js';
import {pathToFileURL} from 'node:url';
import {parsePersona,parseCharter} from '../jev/persona.js';
import {evaluateBetaRequest} from './virtual-beta-evaluator.js';
import {comparisonConfigs,validateConfig} from '../jev/virtual-beta/config.js';
import type {BetaConfig} from '../jev/virtual-beta/contracts.js';
import {runBeta,sha,BetaBudgetError,BetaAdmissionError,type BetaEvaluator,type BetaResult} from './virtual-beta-core.js';
function parseArgs(args:string[]){const values=new Map<string,string>(),flags=new Set<string>();for(let i=0;i<args.length;i++){const k=args[i];if(['--mock','--headed','--help','--semantic','--preserve-display'].includes(k)){flags.add(k);continue;}if(!['--charter','--persona','--config','--out','--seed','--vision','--env-file','--repeat','--max-total-api','--conditions','--ui','--phase-budget','--order-seed'].includes(k)||!args[i+1]||args[i+1].startsWith('--')||values.has(k))throw new Error('INVALID_OPTION '+k);values.set(k,args[++i]);}return {values,flags};}
export function mockEvaluator():BetaEvaluator{
 let n=0;return async({questions,input})=>{const options=questions.nextAction.criteria;const constrained=!(input.observation as any)?.screen;const script=constrained?['look_3','e5','look_2','e3','done']:['e5','e3','done'];let choice=script[n]??'done';n++;if(!(choice in options))choice=Object.keys(options).find(k=>/^e[1-9]\d*$/.test(k))??'done';return {model:'MOCK_SCRIPTED_FIXTURE',answers:Object.fromEntries(Object.entries(questions).map(([key,q])=>{const selected=key==='nextAction'?choice:'goal';return [key,{choice:selected,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k===selected?1:0]))}];}))};};
}
export function comparisonHTML(results:BetaResult[]){
 const esc=(x:unknown)=>String(x??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!));
 const analyses=results.map(analyzeRun),fmt=(v:unknown)=>esc(typeof v==='object'?JSON.stringify(v):v);
 return '<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Jev observation comparison</title><style>body{font:15px system-ui;max-width:1400px;margin:24px auto;padding:0 16px}table{border-collapse:collapse;display:block;overflow:auto}td,th{padding:10px;border:1px solid #ccc;vertical-align:top}code{overflow-wrap:anywhere}img{max-width:340px;width:100%}a{color:#0759a8}section{margin-top:36px}summary{cursor:pointer}</style><h1>Jev 観察・注視・操作の比較</h1><p>各試行の観測事例です。認識・理解・記憶の人間再現や性能差は実証していません。API時間は人間の迷い時間ではありません。UI名は変更の種類を示し、優劣を意味しません。</p><table><tr><th>Run / UI</th><th>Code</th><th>Model</th><th>Objective / subjective</th><th>Validity / stop</th><th>UI / looks / decisions / API</th></tr>'+results.map((r,i)=>'<tr><td><a href="'+esc(r.runId)+'/result.json">'+esc(r.runId)+'</a><br>'+esc(r.semantic?.trial.fixture.ui??r.uiVersion?.id??'legacy')+'</td><td>'+esc(r.code?.revision?.slice(0,8))+'<br><code>'+esc(r.code?.sourceHash?.slice(0,12))+'</code></td><td>'+esc([...new Set(r.steps.map(s=>s.response?.model).filter(Boolean))].join(', '))+'</td><td>'+esc(r.objectiveAssessment?.value)+' / '+r.perceivedDone+'</td><td>'+esc(analyses[i].classification.artifactValidity)+' / '+esc(analyses[i].classification.behavior)+'<br>'+esc(r.termination)+'</td><td>'+[r.uiActions,r.looks,r.decisions,r.apiCalls].join(' / ')+'</td></tr>').join('')+'</table>'+results.map((r,i)=>{
 const a=analyses[i];return '<section><h2>'+esc(r.runId)+'</h2><p><a href="'+esc(r.runId)+'/analysis.json">時系列JSON</a> / <a href="'+esc(r.runId)+'/trace.zip">Playwright trace</a></p><p>初期fingerprint: <code>'+esc(r.initialFingerprint)+'</code> / 設定: '+esc(r.config.vision.mode)+' / '+esc(r.config.state.enabled)+' / '+esc(r.config.selection.mode)+'</p><p>ROI（事前定義の要素領域、幾何測定のみ）: '+fmt(a.roiMetrics)+'</p><p>予算による終了・分布変更: '+fmt(a.budgetInfluence)+'</p><p>注視前後の証拠: '+fmt(a.lookEffectPairs)+'</p><table><tr><th>判断 / 入力</th><th>注視 / 鮮明領域</th><th>利用可能な記憶</th><th>提案 → 実選択</th><th>実行 / 結果</th><th>API ms</th></tr>'+a.timeline.map(t=>'<tr><td><a href="'+esc(r.runId)+'/step-'+t.decision+'.json">'+t.decision+' / '+esc(t.observationId)+'</a><br>'+(t.assets?.current?'<a href="'+esc(r.runId)+'/'+esc(t.assets.current.file)+'"><img loading="lazy" alt="実際のモデル入力" src="'+esc(r.runId)+'/'+esc(t.assets.current.file)+'"></a>':'入力画像なし')+'</td><td>'+fmt(t.fixation)+'<br>'+fmt(t.clearRect)+'</td><td>revision '+esc(t.memory?.revision)+' / entries '+esc(t.memory?.entries.length)+'<details><summary>候補・記憶</summary>'+fmt({candidates:t.offeredCandidates,memory:t.memory})+'</details></td><td>'+esc(t.modelProposal)+' → '+esc(t.selected)+(t.proposalDiffersFromSelection?'（相違）':'')+'</td><td>'+fmt(t.action)+'<br>'+esc(t.outcome)+'<br>客観結果 '+esc(t.objectiveSuccess)+'</td><td>'+esc(t.timing?.apiMs)+'</td></tr>').join('')+'</table></section>';
 }).join('')+'</html>';
}
export async function main(args=process.argv.slice(2)){
 const {values:v,flags:f}=parseArgs(args);
 if(f.has('--help')){console.log('npm run experiment:virtual-beta -- [--mock] [--charter FILE] [--persona FILE] [--config ARRAY_JSON] [--vision crop|foveated] [--seed UINT32] [--repeat 1..3] [--max-total-api 1..48] [--env-file FILE] [--conditions current,combined] [--ui reference,position-only,wording-only] [--phase-budget APPROVED_JSON] [--semantic --order-seed UINT32] [--preserve-display] [--out NEW_DIRECTORY] [--headed]');return;}
 const semanticMode=f.has('--semantic'),preserveDisplay=f.has('--preserve-display'),orderSeed=Number(v.get('--order-seed')??20261028);
 const mock=f.has('--mock'),seed=Number(v.get('--seed')??20261027),repeat=Number(v.get('--repeat')??1),maxTotalAPI=Number(v.get('--max-total-api')??24),vision=v.get('--vision')??'foveated';
 if(!Number.isInteger(repeat)||repeat<1||repeat>3||!Number.isInteger(maxTotalAPI)||maxTotalAPI<1||maxTotalAPI>48||!['crop','foveated'].includes(vision))throw new Error('INVALID_BUDGET');
 if(!mock){const env=v.get('--env-file')??'.env';if(existsSync(env))process.loadEnvFile(env);if(!process.env.AI_GATEWAY_API_KEY)throw new Error('AI_GATEWAY_API_KEY required (or use --mock)');}
 const charter=parseCharter(JSON.parse(await readFile(v.get('--charter')??'experiments/persona/charter-good.json','utf8'))),persona=parsePersona(JSON.parse(await readFile(v.get('--persona')??'experiments/persona/persona-a.json','utf8')));
 if(charter.oracle!=='notifications')throw new Error('Virtual beta v1 supports only the bundled notification oracle; invoice download requires a separate audit adapter');
 const configs:BetaConfig[]=v.has('--config')?JSON.parse(await readFile(v.get('--config')!,'utf8')).map(validateConfig):comparisonConfigs(seed,vision as 'crop'|'foveated');
 if(configs.length!==4||new Set(configs.map(c=>c.id)).size!==4)throw new Error('Four unique conditions required');
 const conditionIds=(v.get('--conditions')??configs.map(c=>c.id).join(',')).split(',');if(!conditionIds.length||new Set(conditionIds).size!==conditionIds.length||conditionIds.some(id=>!configs.some(c=>c.id===id)))throw new Error('INVALID_CONDITIONS');
 const selectedConfigs=configs.filter(c=>conditionIds.includes(c.id));
 const uiIds=v.has('--ui')?v.get('--ui')!.split(','):[];if(new Set(uiIds).size!==uiIds.length||uiIds.some(id=>!Object.hasOwn(comparisonUIs,id)))throw new Error('INVALID_UI_VARIANTS');
 const uiVariants:(BetaUIIdentity|undefined)[]=uiIds.length?uiIds.map(id=>({...comparisonUIs[id as BetaUIId],definitionHash:sha(JSON.stringify(comparisonUIs[id as BetaUIId]))})):[undefined];
 if(semanticMode&&(selectedConfigs.length!==1||selectedConfigs[0].maxAPICalls>8))throw new Error('SEMANTIC_REQUIRES_ONE_CONDITION_MAX_EIGHT_REQUESTS');
 if(preserveDisplay&&!semanticMode)throw new Error('PRESERVATION_REQUIRES_SEMANTIC_FIXTURE');
 const semanticTrials=semanticMode?createSemanticTrials((uiIds.length?uiIds:['reference','position-only','wording-only']) as BetaUIId[],repeat,orderSeed):[];
 const scenarios:{uiVersion?:BetaUIIdentity;semanticTrial?:SemanticTrial;iteration:number;config:BetaConfig;runId:string}[]=semanticMode?semanticTrials.map(t=>({semanticTrial:t,iteration:t.replicate,config:selectedConfigs[0],runId:t.id})):uiVariants.flatMap(uiVersion=>Array.from({length:repeat},(_,i)=>selectedConfigs.map(config=>({uiVersion,iteration:i+1,config,runId:(uiVersion?uiVersion.id+'-':'')+config.id+'-'+(i+1)}))).flat());
 if(mock&&v.has('--phase-budget'))throw new Error('MOCK_MUST_NOT_CONSUME_REAL_BUDGET');
 const phaseBudget=v.has('--phase-budget')?await PhaseBudget.open(v.get('--phase-budget')!):undefined;
 try{
 const root=resolve(v.get('--out')??join('reports','virtual-beta-'+(mock?'mock-':'live-')+randomUUID()));await mkdir(dirname(root),{recursive:true});await mkdir(root);
 const {revision,sourceHashes,sourceHash}=await sourceIdentity();
 const manifest={schemaVersion:1,createdAt:new Date().toISOString(),revision,sourceHashes,sourceHash,mock,model:mock?'MOCK_SCRIPTED_FIXTURE':'jev-1.14.0',charter,persona,configs:selectedConfigs,allConfigs:configs,uiVariants:semanticMode?[]:uiVariants.map(ui=>ui??null),semantic:semanticMode?{version:1,objectivePolicy:preserveDisplay?'mail-and-display-preserved':'mail-only',assignment:'factorial treatments randomized to fixed slots before outcomes',orderSeed,trials:semanticTrials}:null,repeat,maxTotalAPI,phaseBudget:phaseBudget?{file:resolve(v.get('--phase-budget')!),before:phaseBudget.snapshot()}:null,viewport:{width:1280,height:900},locale:'ja-JP',timezoneId:'Asia/Tokyo',modelSeedAvailable:false,concurrency:1,externalFonts:'Google Fonts stylesheet replaced by empty CSS; fixed OS fallback font',baseline:'Controlled harness using existing goal instructions, numbered image, DOM, POM and charter filter; no frontier or automatic revisit suppression. Legacy CLI regression tested separately.'};
 await writeFile(join(root,'manifest.json'),JSON.stringify(manifest,null,2));
 const server=await createServer({server:{host:'127.0.0.1',port:0}});await server.listen();const address=server.httpServer!.address();if(!address||typeof address==='string')throw new Error('NO_LOCAL_PORT');const baseURL='http://127.0.0.1:'+address.port;
 let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined,totalCalls=0;const results:BetaResult[]=[];
 try{browser=await chromium.launch({headless:!f.has('--headed')});
 for(const {uiVersion,semanticTrial,config,runId} of scenarios){
  const dir=join(root,runId),context=await browser.newContext({viewport:manifest.viewport,locale:manifest.locale,timezoneId:manifest.timezoneId,acceptDownloads:false});let safety=false;
  await context.route('**/*',route=>{const request=route.request();const url=new URL(request.url());if(url.hostname==='fonts.googleapis.com'&&request.resourceType()==='stylesheet')return route.fulfill({contentType:'text/css',body:''});if(url.origin===baseURL&&['GET','HEAD'].includes(request.method()))return route.continue();safety=true;return route.abort();});
  const page=await context.newPage();page.on('download',download=>{safety=true;void download.cancel();});await context.tracing.start({screenshots:true,snapshots:true,sources:false});
  const fake=semanticTrial?semanticMockEvaluator(semanticTrial.fixture.mapping):mockEvaluator(),evaluate:BetaEvaluator=async request=>{if(totalCalls>=maxTotalAPI)throw new BetaBudgetError('API_LIMIT');if(mock){totalCalls++;if(request.questions.knowledge)return {model:'MOCK_SCRIPTED_FIXTURE',answers:Object.fromEntries(Object.entries(request.questions).map(([id,q])=>{const choice=id==='knowledge'?'insufficient':id==='goal'?'uncertain':id.startsWith('effect_')?'unknown':'none';return [id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k===choice?1:0]))}];}))};return fake(request);}
   const dispatchDeadline=performance.now()+request.timeoutMs;
   const reservation=phaseBudget?await phaseBudget.reserve({runKey:root+'/'+runId,condition:config.id,revision:manifest.revision,sourceHash:manifest.sourceHash,...((semanticTrial||uiVersion)?{uiVersion:semanticTrial?.fixture.ui??uiVersion!.id}:{})}):undefined;
   const remaining=Math.floor(dispatchDeadline-performance.now());
   if(remaining<=0){
    // Keep the durable debit conservative, but record that no HTTP started.
    if(phaseBudget&&reservation)try{await phaseBudget.settle(reservation,'ERROR',{attempts:0,failureCode:'DEADLINE_BEFORE_REQUEST'});}catch{throw new BetaAdmissionError();}
    throw new BetaBudgetError('TIME_LIMIT');
   }
   totalCalls++;
   let response;try{response=await evaluateBetaRequest({...request,timeoutMs:remaining});}catch(error){if(phaseBudget&&reservation)await phaseBudget.settle(reservation,'ERROR',{failureCode:typeof (error as any)?.code==='string'?(error as any).code:typeof (error as any)?.failure?.code==='string'?(error as any).failure.code:'REQUEST_FAILED'});throw error;}
   if(phaseBudget&&reservation)await phaseBudget.settle(reservation,'OK',{attempts:response.request?.attempts??1});return response;};
  try{const result=await runBeta(page,{runId,dir,baseURL,charter,persona,config,evaluate,...(semanticTrial?{semanticTrial,preserveDisplay}:{}),...(uiVersion?{uiVersion,roiSelectors}:{}),code:{revision:manifest.revision,sourceHash:manifest.sourceHash},isSafetyStopped:()=>safety});results.push(result);console.log(runId+': '+result.termination+' objective='+result.objectiveSuccess+' UI='+result.uiActions+' looks='+result.looks+' API='+result.apiCalls);}
  finally{await context.tracing.stop({path:join(dir,'trace.zip')});await context.close();}
 }
 }finally{await browser?.close();await server.close();if(phaseBudget){await writeFile(join(root,'phase-budget-after.json'),JSON.stringify(phaseBudget.snapshot(),null,2));}}
 const analyses=results.map(analyzeRun);for(const [i,result] of results.entries())await writeFile(join(root,result.runId,'analysis.json'),JSON.stringify(analyses[i],null,2));
 const groupKeys=[...new Set(results.map(r=>r.semantic?r.semantic.trial.fixture.ui+'-'+r.semantic.trial.fixture.mapping:r.uiVersion?.id??'legacy'))];
 const initialStateGroups=groupKeys.map(key=>{const group=results.filter(r=>(r.semantic?r.semantic.trial.fixture.ui+'-'+r.semantic.trial.fixture.mapping:r.uiVersion?.id??'legacy')===key);return {uiVersion:key,count:group.length,fingerprints:[...new Set(group.map(r=>r.initialFingerprint))],match:group.length>0&&group.every(r=>!!r.initialFingerprint)&&new Set(group.map(r=>r.initialFingerprint)).size===1};});
 const semanticComparison=semanticMode?{...compareSemanticRuns(results),dataSource:mock?'SCRIPTED_FIXTURE_NOT_MODEL_PERFORMANCE':'REAL_JEV'}:null;
 if(semanticComparison)await writeFile(join(root,'semantic-comparison.json'),JSON.stringify(semanticComparison,null,2));
 const deliberationAnalyses=results.map(analyzeDeliberationRun);
 if(results.some(r=>r.config.deliberation?.enabled))await writeFile(join(root,'deliberation-comparison.json'),JSON.stringify({schemaVersion:1,dataSource:mock?'SCRIPTED_FIXTURE_NOT_MODEL_PERFORMANCE':'REAL_JEV',analyses:deliberationAnalyses},null,2));
 const summary={schemaVersion:1,semanticComparison,deliberationAnalyses,mock,actualAPIRequests:mock?0:totalCalls,analyses,initialStateGroups,crossUIFingerprintMatchRequired:false,sourceHash:manifest.sourceHash,model:manifest.model,totalCalls,initialStatesMatch:initialStateGroups.every(g=>g.match),runs:results.map(({steps,...r})=>r),humanValidity:'UNVERIFIED',probabilitiesAreHumanFrequencies:false};
 await writeFile(join(root,'comparison.json'),JSON.stringify(summary,null,2));
 const cols=['ui','artifactValidity','behavior','terminalBudgetInfluenced','runId','condition','objectiveSuccess','perceivedDone','termination','uiActions','looks','decisions','apiCalls','apiMs','uiMs','modeledUserMs','validForComparison'] as const;
 await writeFile(join(root,'comparison.csv'),cols.join(',')+'\n'+results.map((r,i)=>{const row={...r,ui:r.semantic?.trial.fixture.ui??r.uiVersion?.id??'legacy',artifactValidity:analyses[i].classification.artifactValidity,behavior:analyses[i].classification.behavior,terminalBudgetInfluenced:analyses[i].budgetInfluence.terminalBudgetInfluenced};return cols.map(c=>row[c]??'').join(',');}).join('\n')+'\n');
 await writeFile(join(root,'comparison.html'),comparisonHTML(results));console.log('Artifacts: '+root);
 return {root,results};
 }finally{await phaseBudget?.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
