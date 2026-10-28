import {chromium} from 'playwright';
import {createServer} from 'vite';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import {parseCharter} from '../jev/persona.js';
import {safeRequestFailure,safeProviderType,ChoiceRequestError} from '../jev/client.js';
import {humanJevProfile,type HumanJevMode} from './human-jev-profiles.js';
import {runBeta,sha,BetaBudgetError,BetaAdmissionError,BetaResponseError,type BetaEvaluator,type ModelRequest} from './virtual-beta-core.js';
import {evaluateBetaRequest} from './virtual-beta-evaluator.js';
import {PhaseBudget} from './virtual-beta-budget.js';
import {sourceIdentity} from './virtual-beta-source.js';
import {buildBlindReview,validateBlindReview,type ReviewFrame} from './human-jev-review.js';

export const humanJevConfig=humanJevProfile().config;
type Options={out:string;mock:boolean;phaseBudget?:string;envFile?:string;mode?:HumanJevMode;longContext?:boolean};
function failureEvidence(error:unknown){
 const f=safeRequestFailure(error);
 const code=['HTTP_ERROR','TIMEOUT','REQUEST_FAILED','MISSING_CREDENTIALS','INVALID_RESPONSE'].includes(f.code)?f.code:'REQUEST_FAILED';
 const providerType=safeProviderType(f.providerType),attempts=error instanceof ChoiceRequestError?error.request?.attempts:error instanceof BetaResponseError?error.response.request?.attempts:undefined;
 return {code,...(Number.isInteger(f.statusCode)&&f.statusCode!>=400&&f.statusCode!<=599?{statusCode:f.statusCode}:{}),...(providerType?{providerType}:{}),...(f.providerCode==='max_tokens_exceeded'?{providerCode:f.providerCode}:{}),...(Number.isSafeInteger(attempts)&&attempts!>=0&&attempts!<=1?{attempts}:{} )};
}

/** One ordinary baseline exploration, followed by a separate prompted categorical review.
 * This module never opens participant records or accepts participant expectations.
 */
export async function runHumanJev(options:Options,injected?:BetaEvaluator){
 const mode=options.mode??'baseline',profile=humanJevProfile(mode),config=profile.config;
 if(injected&&!options.mock)throw new Error('INJECTED_EVALUATOR_MOCK_ONLY');
 if(!options.mock&&!options.phaseBudget)throw new Error('PHASE_BUDGET_REQUIRED');
 if(options.mock&&options.phaseBudget)throw new Error('MOCK_MUST_NOT_CONSUME_REAL_BUDGET');
 if(!options.mock){if(options.envFile)process.loadEnvFile(options.envFile);if(!process.env.AI_GATEWAY_API_KEY)throw new Error('AI_GATEWAY_API_KEY_REQUIRED');}
 const budget=options.phaseBudget?await PhaseBudget.open(options.phaseBudget):undefined;
 let server:Awaited<ReturnType<typeof createServer>>|undefined,browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
 const root=resolve(options.out),dir=join(root,'exploration');let calls=0,outputCreated=false;
 try{
  if(budget){const snapshot=budget.snapshot();if(snapshot.newMaximum!==profile.maximumRequests||snapshot.perRunMaximum!==profile.perRunMaximum)throw new Error('EXPECTED_APPROVED_'+profile.maximumRequests+'_REQUEST_PHASE');}
  await mkdir(root);outputCreated=true;const charter=parseCharter(JSON.parse(await readFile('experiments/persona/charter.json','utf8')));
  const code=await sourceIdentity();
  const manifest={schemaVersion:1,mode,transport:{longContext:options.longContext===true,maxAttemptsPerRequest:1},createdAtUTC:new Date().toISOString(),...code,mock:options.mock,model:options.mock?'MOCK_SCRIPTED_FIXTURE':'jev-1.14.0',charter,config,persona:null,humanInputsRead:false,actualAPIRequests:0,maximumRequests:profile.maximumRequests,explorationMaximum:profile.explorationMaximum,reviewMaximum:profile.reviewMaximum,viewport:{width:1280,height:900},locale:'ja-JP',timezoneId:'Asia/Tokyo',comparisonLimits:['Baseline goal policy, not a fitted participant persona','Full viewport images with number markers; human used unnumbered native screen','Current runner memory3; human memory and gaze unmeasured','Prompted categorical review, not unprompted free-text discovery'],reviewFramePolicy:'First four and last four distinct delivered images, maximum8, chronological order; no participant-conditioned selection',phaseBudgetBefore:budget?.snapshot()??null};
  await writeFile(join(root,'manifest.json'),JSON.stringify(manifest,null,2));
  server=await createServer({server:{host:'127.0.0.1',port:0},logLevel:'error'});await server.listen();
  const address=server.httpServer!.address();if(!address||typeof address==='string')throw new Error('NO_LOCAL_PORT');
  const baseURL='http://127.0.0.1:'+address.port;browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:manifest.viewport,locale:manifest.locale,timezoneId:manifest.timezoneId,acceptDownloads:false,serviceWorkers:'block'});let safety=false;
  await context.route('**/*',route=>{const req=route.request(),url=new URL(req.url());if(url.hostname==='fonts.googleapis.com'&&req.resourceType()==='stylesheet')return route.fulfill({contentType:'text/css',body:''});if(url.origin===baseURL&&['GET','HEAD'].includes(req.method()))return route.continue();safety=true;return route.abort();});
  await context.tracing.start({screenshots:true,snapshots:true,sources:false});
  const page=await context.newPage();page.on('download',d=>{safety=true;void d.cancel();});
  // Capture the unnumbered, unoperated UI; runBeta then reloads and starts its own trial.
  await page.goto(baseURL+'/bad/',{waitUntil:'networkidle'});const initial=await page.screenshot();await writeFile(join(root,'initial-product.png'),initial);
  await writeFile(join(root,'initial-product.json'),JSON.stringify({sha256:sha(initial),capture:'preparatory unoperated load; exploration reloads the same initial UI'},null,2));
  const frames:ReviewFrame[]=[];
  const dispatch:BetaEvaluator=async request=>{
   if(safety)throw new BetaBudgetError('TIME_LIMIT');
   const stage=request.questions.nextAction?(mode!=='baseline'?'action':'exploration'):request.questions.knowledge?'assessment':'review';
   if(stage==='assessment'&&mode==='baseline'||stage==='review'&&profile.reviewMaximum===0)throw new Error('PROFILE_STAGE_NOT_ALLOWED');
   if(calls>=profile.maximumRequests)throw new BetaBudgetError('API_LIMIT');
   if(options.mock){calls++;return injected?injected(request):{model:'MOCK_SCRIPTED_FIXTURE',answers:Object.fromEntries(Object.entries(request.questions).map(([id,q])=>{const choice=id==='nextAction'?'done':id==='decisionBasis'?'goal':id==='experienceProgress'||id==='experienceExpectation'?'unknown':id==='knowledge'?'insufficient':id==='goal'?'uncertain':id.startsWith('effect_')?'unknown':'none';return [id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k===choice?1:0]))}];}))};}
   const deadline=performance.now()+request.timeoutMs;
   const reservation=await budget!.reserve({runKey:root+'/'+stage,condition:stage==='review'?'blind-categorical-review':config.id,revision:code.revision,sourceHash:code.sourceHash});
   const remaining=Math.floor(deadline-performance.now());
   if(remaining<=0){try{await budget!.settle(reservation,'ERROR',{attempts:0,failureCode:'DEADLINE_BEFORE_REQUEST'});}catch{throw new BetaAdmissionError();}throw new BetaBudgetError('TIME_LIMIT');}
   calls++;
   let response;
   try{response=await evaluateBetaRequest({...request,timeoutMs:remaining},{longContext:options.longContext===true});}
   catch(error){await budget!.settle(reservation,'ERROR',{attempts:1,failureCode:failureEvidence(error).code});throw error;}
   try{await budget!.settle(reservation,'OK',{attempts:response.request?.attempts??1});}catch{throw new Error('BUDGET_SETTLEMENT_AFTER_REQUEST');}
   return response;
  };
  const evaluate:BetaEvaluator=async request=>{
   const response=await dispatch(request);
   if(request.questions.nextAction){const o=request.input.observation as {id:string;candidateIds:string[]};const image=request.images.current;if(!image)throw new Error('CURRENT_IMAGE_MISSING');const imageSha256=sha(Buffer.from(image.data,'base64'));if(!frames.some(f=>f.imageSha256===imageSha256))frames.push({observationId:o.id,imageSha256,image:structuredClone(image),candidateIds:[...o.candidateIds]});}
   return response;
  };
  const result=await runBeta(page,{runId:'exploration',dir,baseURL,charter,config,evaluate,code:{revision:code.revision,sourceHash:code.sourceHash},isSafetyStopped:()=>safety});
  await context.tracing.stop({path:join(dir,'trace.zip')});await context.close();
  const selected=frames.length<=8?frames:[...frames.slice(0,4),...frames.slice(-4)];
  let review:Record<string,unknown>={status:'NOT_RUN',reason:profile.reviewMaximum===0?'PROFILE_DISABLED':safety?'SAFETY_STOP':selected.length?'BUDGET_UNAVAILABLE':'NO_VALID_DELIVERED_FRAMES'};
  if(profile.reviewMaximum>0&&!safety&&selected.length&&calls<profile.maximumRequests&&(options.mock||budget!.remaining>0)){
   const request=buildBlindReview(selected,charter.goal);
   const assets=Object.fromEntries(selected.map(frame=>[frame.observationId,{file:'exploration/input-'+frame.observationId.slice(1)+'.png',sha256:frame.imageSha256}]));
   await writeFile(join(root,'review-input.json'),JSON.stringify({input:request.input,questions:request.questions,assets,inputSha256:sha(JSON.stringify({input:request.input,questions:request.questions,assets}))},null,2));
   let stage='REQUEST';
   try{
    const response=await dispatch(request);await writeFile(join(root,'review-response.json'),JSON.stringify(response,null,2));
    stage='VALIDATION';review={status:'OK',...validateBlindReview(response,request)};
   }catch(error){
    if(error instanceof BetaResponseError)await writeFile(join(root,'review-response.json'),JSON.stringify(error.response,null,2));
    const evidence=failureEvidence(error);review={status:'ERROR',stage,code:stage==='VALIDATION'?'INVALID_REVIEW':error instanceof BetaResponseError?error.code:evidence.code,error:evidence};
   }
  }
  await writeFile(join(root,'review.json'),JSON.stringify(review,null,2));
  manifest.actualAPIRequests=options.mock?0:calls;await writeFile(join(root,'manifest.json'),JSON.stringify({...manifest,totalEvaluatorCalls:calls},null,2));
  return {root,result,review};
 }finally{
  await browser?.close();await server?.close();
  if(budget){try{if(outputCreated)await writeFile(join(root,'phase-budget-after.json'),JSON.stringify(budget.snapshot(),null,2));}finally{await budget.close();}}
 }
}
async function main(){
 const args=process.argv.slice(2),options:Options={out:'',mock:false};
 for(let i=0;i<args.length;i++){const key=args[i];if(key==='--mock'){options.mock=true;continue;}if(key==='--long-context'){options.longContext=true;continue;}if(!['--out','--phase-budget','--env-file','--mode'].includes(key)||!args[i+1]||args[i+1].startsWith('--'))throw new Error('INVALID_OPTION');const value=args[++i];if(key==='--out')options.out=value;if(key==='--phase-budget')options.phaseBudget=value;if(key==='--env-file')options.envFile=value;if(key==='--mode')options.mode=value as HumanJevMode;}
 if(!options.out)throw new Error('NEW_OUTPUT_DIRECTORY_REQUIRED');
 const saved=await runHumanJev(options);console.log(JSON.stringify({root:saved.root,termination:saved.result.termination,objectiveSuccess:saved.result.objectiveAssessment.value,reviewStatus:saved.review.status}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
