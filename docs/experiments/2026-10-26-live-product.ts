import {chromium} from 'playwright';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {ClientToolPage} from '../../pages/ClientToolPage.js';
import {ExplorationMemory} from '../../runner/exploration-memory.js';
import {CompletionFrames} from '../../jev/completion-frames.js';
import {captureVisualObservation} from '../../runner/visual-evidence.js';
import {VisualDecisionContext} from '../../jev/visual-context.js';
import {experimentDecider,parsePersona,publicExploration,type ExplorationCharter} from '../../jev/persona.js';
import {candidatesFor,type State} from '../../jev/types.js';
import {rememberObservation} from '../../jev/history.js';
import {safeRequestFailure} from '../../jev/client.js';
import {report} from '../../runner/report.js';

// Public product pilot: reuse observation, inference and frontier modules unchanged.
// Native UI clicks are allowed only in this explicit browser-local tool sandbox.

const root=resolve(process.argv[2]??'reports/persona-svgomg-live-2026-10-26');
const fake=process.argv.includes('--fake');if(!fake)process.loadEnvFile('.env');
const spec=JSON.parse(await readFile('experiments/persona/public-svgomg.json','utf8'));
const {repeats,conditions,seed,hypotheses,safety,capabilityLimit,policyReview,comparison,...charter}=spec;
const target=new URL(charter.targetWebsite);await mkdir(root);
const personas:any={};for(const name of ['a','b','c']){const p=parsePersona(JSON.parse(await readFile(`experiments/persona/persona-${name}.json`,'utf8')));personas[p.id]=p;}
const hash=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
let state=seed;const plan=Array.from({length:repeats},(_,i)=>{const block=[...conditions];for(let j=block.length-1;j>0;j--){state=(Math.imul(state,1664525)+1013904223)>>>0;const k=Math.floor(state/4294967296*(j+1));[block[j],block[k]]=[block[k],block[j]];}return block.map(condition=>({condition,repeat:i+1}));}).flat();
const manifest={completionEvidenceMode:'retained-hash-verified-frames',completionContextRecovery:true,maxCompletionFrames:charter.maxActions+1,capabilities:{checkboxLabels:true,nativeBackCompletion:'actual-frame-and-history-entry',actionTypes:['click','back','scroll','done','stuck'],unsupported:['fill','select','range','nested-container-scroll']},schemaVersion:1,kind:'LIVE_PUBLIC_PRODUCT_EXPLORATION',fake,startedAt:new Date().toISOString(),spec,plan,inputs:{charter,personas},viewport:{width:1280,height:900},locale:'ja-JP',timezoneId:'Asia/Tokyo',modelRequested:'jev-1.14.0',observationMode:'numbered-image-and-dom',explorationPipeline:'existing-memory-and-frontier-with-native-local-ui',scopeCaveat:'PublicSitePage read-only link mode cannot operate ordinary app buttons. This isolated runner reuses LocalExplorationPage, with network/form/file boundaries for this client-side tool. Production public-site.ts is unchanged.',sourceHashes:Object.fromEntries(await Promise.all(['docs/experiments/2026-10-26-live-product.ts','jev/persona.ts','jev/decide.ts','jev/visual-context.ts','jev/completion-frames.ts','jev/types.ts','runner/visual-evidence.ts','pages/LocalExplorationPage.ts','pages/ClientToolPage.ts','pages/AutoPage.ts','runner/exploration-memory.ts'].map(async p=>[p,hash(await readFile(p))])))};
await writeFile(join(root,'manifest.json'),JSON.stringify(manifest,null,2));
const browser=await chromium.launch({headless:true});await writeFile(join(root,'environment.json'),JSON.stringify({browser:browser.version(),node:process.version},null,2));
const runs:any[]=[];
try{for(const item of plan){
 const dir=`${item.condition}-${item.repeat}`,path=join(root,dir);await mkdir(path);
 const context=await browser.newContext({viewport:manifest.viewport,locale:manifest.locale,timezoneId:manifest.timezoneId,serviceWorkers:'block',acceptDownloads:false});
 const network:any[]=[],steps:any[]=[],errors:any[]=[],assets:any[]=[],actions:any[]=[];let reason='',actionCount=0,history:State['history']=[],boundary=false;
 const completionFrames=new CompletionFrames(path,charter.maxActions+1),visual=new VisualDecisionContext(),memory=new ExplorationMemory(),started=performance.now();
 const page=await context.newPage();page.setDefaultTimeout(8000);
 page.on('filechooser',chooser=>{network.push({blocked:'FILE_SELECTION',step:steps.length});void chooser.setFiles([]);});
 page.on('download',d=>{network.push({blocked:'DOWNLOAD',step:steps.length});void d.cancel();});
 page.on('dialog',d=>void d.dismiss());context.on('page',p=>{if(p!==page)void p.close();});
 await context.routeWebSocket('**/*',s=>s.close());
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url()),top=req.isNavigationRequest()&&req.frame()===page.mainFrame();
  if(!['GET','HEAD'].includes(req.method())||url.origin!==target.origin||!url.pathname.startsWith(target.pathname)){
   network.push({blocked:'OUTSIDE_SCOPE',method:req.method(),destination:url.origin+url.pathname,step:steps.length});if(top)boundary=true;return route.abort();
  }
  try{const response=await route.fetch({maxRedirects:0,maxRetries:0,timeout:20000}),status=response.status();try{if(status===403||status===429||status>=300&&status<400){boundary=true;network.push({blocked:'HTTP_BOUNDARY',status,step:steps.length});return route.abort();}const body=await response.body();assets.push({url:req.url(),sha256:hash(body),status,bytes:body.length});const headers=response.headers();await route.fulfill({response,headers:{...headers,'content-security-policy':`${headers['content-security-policy']?headers['content-security-policy']+', ':''}form-action 'none'`}});}finally{await response.dispose();}}
  catch{network.push({blocked:'RESOURCE_ERROR',url:url.pathname,step:steps.length});await route.abort().catch(()=>{});}
 });
 try{
  await context.tracing.start({screenshots:true,snapshots:true,sources:false});await page.goto(target.href,{waitUntil:'networkidle',timeout:30000});await page.waitForTimeout(1500);
  const pom=new ClientToolPage(page,true,true),exploration=publicExploration({charter:charter as ExplorationCharter,...(personas[item.condition]?{persona:personas[item.condition]}:{})});
  while(!reason){
   if(boundary){reason='SAFETY_BOUNDARY';break;}
   const screen=await pom.observe(false),raw=candidatesFor(screen,pom.canGoBack),offer=memory.observe(page.url(),screen,raw,pom.explorationActionKeys,pom.explorationNavigationChoices),frontier=memory.frontier(offer);
   const state:State={goal:charter.goal,currentDate:charter.initialState.currentDate,screen,history:[...history],exploration,observedAlternatives:pom.explorationBackUrl?memory.observedAlternatives(offer,pom.explorationBackUrl):[]};
   const number=steps.length+1,screenshot=`step-${String(number).padStart(3,'0')}.png`,capture=await pom.captureDecisionScreenshot(screen,offer.candidates,join(path,screenshot));
   visual.capture(capture.bytes,{step:number,url:page.url(),pageId:screen.pageId,viewport:screen.viewport},screen,frontier);
   const visualObservation=captureVisualObservation(capture.bytes,number,screenshot,page.url());completionFrames.capture(visualObservation);
   const step:any={visualObservation,number,url:page.url(),state,candidates:offer.candidates,offeredCandidates:raw,screenshot,visualTargets:capture.targets,frontier,explorationMemory:{stateId:offer.stateId,revision:offer.revision,exclusions:offer.exclusions,transitChoices:offer.transitChoices},result:'PENDING'};steps.push(step);
   const calls:any[]=[];step.requests=calls;
   try{step.decision=await experimentDecider(async(input,questions)=>{calls.push({input,questions});if(fake){const choice='stuck';return {model:'FAKE',answers:Object.fromEntries(Object.entries(questions).map(([id,q])=>{const selected=id==='decisionBasis'?'uncertainty':id==='completionCoverage'?'incomplete':choice;return [id,{choice:selected,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,Number(k===selected)]))}];}))};}return questions.completionCoverage?completionFrames.evaluate(input,questions):visual.evaluate(input,questions);},true)(state,offer.candidates,{frontier,completionEvidence:()=>completionFrames.evidence()});
   }catch(error){const review=(error as any)?.decisionReview;if(review)step.decisionReview={stage:review.stage,initialDecision:review.initialDecision,...(review.response?{response:review.response}:{}),...(review.requests?{requests:review.requests}:{})};throw error;}
   finally{step.visualContext=visual.snapshot();step.completionFrames=completionFrames.snapshot();}
   const decision=step.decision,candidate=offer.candidates[decision.choice];if(!candidate||JSON.stringify(candidate.action)!==JSON.stringify(decision.action))throw new Error('Candidate mismatch');
   if(decision.action.type==='done'){reason='JEV_DONE';step.result=reason;}
   else if(decision.action.type==='stuck'){reason='STUCK';step.result=reason;}
   else if(actionCount>=charter.maxActions){reason='ACTION_LIMIT';step.result=reason;}
   else{
    if(decision.frontier)memory.commit(offer,decision.frontier.targetId,decision.frontier.focus);
    const recorded=await pom.describeAction(decision.action,number);await pom.act(decision.action);if(decision.action.type==='back')step.backTraversal=pom.lastBackTraversal;actionCount++;memory.executed(offer,decision.choice);visual.recordAction(decision.action);await page.waitForTimeout(1500);
    const after=await pom.observe(false),afterScreenshot=`after-${String(number).padStart(3,'0')}.png`;await page.screenshot({path:join(path,afterScreenshot)});
    step.recordedAction={...recorded,urlAfter:page.url()};actions.push(step.recordedAction);step.outcome={url:page.url(),screen:after,screenshot:afterScreenshot};step.result='OK';
    history=rememberObservation(history,screen,candidate.label,`画面: ${after.title||after.text.slice(0,3).join(' / ')}`);
   }
   await writeFile(join(path,`step-${number}.json`),JSON.stringify(step,null,2));
  }
 }catch(e){reason=boundary?'SAFETY_BOUNDARY':steps.at(-1)?.decision?'ACTION_ERROR':steps.length?'DECISION_ERROR':'PAGE_ERROR';errors.push(safeRequestFailure(e));const failed=steps.at(-1);if(failed){if(failed.result==='PENDING')failed.result=reason;await writeFile(join(path,`step-${failed.number}.json`),JSON.stringify(failed,null,2));}} 
 finally{await page.screenshot({path:join(path,'final.png')}).catch(()=>{});await context.tracing.stop({path:join(path,'trace.zip')}).catch(()=>{});await visual.close();}
 const result={condition:item.condition,repeat:item.repeat,dir,fake,variant:'public-product',goalText:charter.goal,model:steps.find(s=>s.decision)?.decision.model??null,reason,objectiveSuccess:null,perceivedSuccess:reason==='JEV_DONE',comparison:'UNVERIFIED',actionCount,backCount:actions.filter(a=>a.action==='back').length,loopCount:0,elapsedMs:performance.now()-started,steps,completionFrames:completionFrames.snapshot(),path:history,actions,errors,network,assets,limitations:[capabilityLimit,'Perceived completion is not independently confirmed. Evidence must be inspected separately.']};
 await writeFile(join(path,'result.json'),JSON.stringify(result,null,2));runs.push(result);await writeFile(join(root,'results.json'),JSON.stringify(runs,null,2));await context.close();
 console.log(`[${runs.length}/${plan.length}] ${item.condition} #${item.repeat}: ${reason}, ${actionCount} actions`);
 await report(root,runs.map(r=>({...r,dir:join(root,r.dir)})));
}}finally{await browser.close();}
console.log('Saved '+root);
