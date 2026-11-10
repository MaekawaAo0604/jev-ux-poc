import {chromium} from 'playwright';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {PublicSitePage} from '../pages/PublicSitePage.js';
import {publicControl} from '../pages/controls.js';
import {jevDecide} from '../jev/decide.js';
import {recordCompletion} from '../jev/completion.js';
import {evaluateChoices,createBudgetedEvaluator,ChoiceRequestError,InferenceInterruption,type ChoiceEvaluator,type RetryPolicy} from '../jev/client.js';
import {candidatesFor,type State} from '../jev/types.js';
import {report} from './report.js';
import {parsePublicOptions} from './public-options.js';
import {publicNavigation,type NavigationRequestEvent} from './public-navigation.js';
import {rememberObservation} from '../jev/history.js';
import {GoalChecksError,GoalDecisionError,pendingGoalChecks} from '../jev/goal-status.js';
import {createEvidenceSession} from '../jev/evidence-session.js';
import type {ActionTrace,RecordedAction} from './action-trace.js';
import {ExplorationMemory} from './exploration-memory.js';
import {actionOutcome} from './action-recovery.js';
import {captureVisualObservation,recordSavedVisualCompletion,type VisualObservation} from './visual-evidence.js';
import {VisualDecisionContext} from '../jev/visual-context.js';
import {recordGoalOutcome} from './goal-outcome.js';
import {assessStop} from './stop-assessment.js';
if(process.argv.includes('--help')){
 console.log('--vision --image-only --image-memory: retain image-grounded Choice judgments and source hashes; no OCR or past-image resend.');
 console.log('--image-memory-proof: with --image-memory, completionCoverage alone reloads hash-verified requirement-source PNGs; actions still use one current image.');
 console.log('--vision --image-only: Jev receives current numbered pixels and executed actions only; no DOM text/labels/URLs, OCR, past-image memory or DOM audit.');
 console.log('--vision: current image with numbered offered controls, no OCR by default. --vision --vision-ocr: legacy unnumbered image plus OCR-verified text memory. Past images are not resent. Requires AI_GATEWAY_API_KEY, pinned to Jev 1.14. Cannot combine with --goal-check.');
 console.log('Usage: npm run explore -- URL "GOAL" --reviewed [--max-actions 0] [--interval-ms 2000] [--goal-check "EXCERPT" ...]\n--max-actions: optional action limit; 0 means unlimited (default).\n--goal-check: experimental separate information checks; use excerpts of the goal, never answers or routes. Omit to keep legacy decisions.\n--reviewed: site rules and exploration scope have been checked. No automatic policy review.\nDirect links and network-blocked disclosures; no form submission, login, external navigation or file reading.');
 process.exit(0);
}
const {url,goal,maxActions,intervalMs,goalChecks,vision,visionOCR,imageOnly,imageMemory,imageMemoryProof}=parsePublicOptions(process.argv.slice(2));
try{process.loadEnvFile('.env');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
if(vision&&!process.env.AI_GATEWAY_API_KEY)throw new Error('--vision requires AI_GATEWAY_API_KEY');
const origin=new URL(url).origin;
const root=resolve('reports',new Date().toISOString().replaceAll(':','-')+'-public');
const dir=join(root,'exploration');await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'ja-JP',acceptDownloads:false,serviceWorkers:'block'});
const page=await context.newPage();page.setDefaultTimeout(10000);
const navigationRequests:(NavigationRequestEvent&{step:number|null})[]=[];
const navigation=publicNavigation(context,origin,{
 'accept-language':'ja-JP',
 accept:'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
 'user-agent':await page.evaluate(()=>navigator.userAgent),
},event=>{
 navigationRequests.push({step:activeStep?.number??null,...event});
 if(activeStep)(activeStep.navigationRequests??=[]).push(event);
 console.log(`Navigation: ${event.phase} ${event.category} attempt ${event.attempt}`);
});
let boundary='';
const warnings:string[]=[];
await context.route('**/*',async route=>{
 const request=route.request();
 if(boundary){await navigation.release();return route.abort();}
 // Authentication is outside read-only exploration even when a page script,
 // image or prefetch initiates it rather than an offered navigation link.
 const destination=publicControl(request.url(),new URL(request.url()).origin);
 if(destination.kind==='blocked'&&destination.reason==='SAFETY_BOUNDARY'){
  boundary='SAFETY_BOUNDARY';await navigation.release();return route.abort();
 }
 // Embedded frames are outside the POM's observation scope. Block them without
 // treating an unrelated widget as a failed top-level user navigation.
 if(request.isNavigationRequest()&&request.frame().parentFrame()){
  if(!warnings.includes('Embedded frames were blocked and are not evaluated.'))warnings.push('Embedded frames were blocked and are not evaluated.');
  return route.abort();
 }
 if(!['GET','HEAD'].includes(request.method())||(request.isNavigationRequest()&&new URL(request.url()).origin!==origin)){
  if(request.isNavigationRequest()){boundary='SAFETY_BOUNDARY';await navigation.release();}
  return route.abort();
 }
 // Vet bounded client redirects only while an explicit navigation is loading.
 // Each response is reused; the browser never follows an unchecked HTTP chain.
 if(request.isNavigationRequest()){
  try{
   let response=navigation.take(request.url());
   if(!response){await navigation.follow(request.url());response=navigation.take(request.url());}
   if(!response)throw new Error('SAFETY_BOUNDARY');
   try{
    if(response.status()>=300&&response.status()<400){boundary='SAFETY_BOUNDARY';await navigation.release();await route.abort();}
    else {
     const headers=response.headers(),policy=headers['content-security-policy'];
     // An additional CSP policy intersects with (never weakens) site policies.
     // This blocks native and script-triggered GET forms as well as POST forms.
     await route.fulfill({response,headers:{...headers,'content-security-policy':`${policy?policy+', ':''}form-action 'none'`}});
    }
   }finally{await response.dispose();}
  }catch(error){const message=error instanceof Error?error.message:'';boundary=boundary||(['UNSUPPORTED_CONTENT','SAFETY_BOUNDARY'].find(code=>message.includes(code)))||'PAGE_ERROR';await navigation.release();await route.abort().catch(()=>{});}
  return;
 }
 // Chromium may follow subresource HTTP redirects without routing the next
 // hop. Fetch once without redirects/retries and reuse the response instead.
 // Redirected resources are outside this conservative observation scope.
 try{
  const response=await route.fetch({maxRedirects:0,maxRetries:0,timeout:15000});
  try{
   if(response.status()>=300&&response.status()<400&&response.status()!==304){
    boundary='SAFETY_BOUNDARY';
    if(!warnings.includes('Redirected page resources were blocked and are not evaluated.'))warnings.push('Redirected page resources were blocked and are not evaluated.');
    await navigation.release();return route.abort();
   }
   if(boundary)return route.abort();
   return await route.fulfill({response});
  }finally{await response.dispose();}
 }catch{
  boundary=boundary||'PAGE_ERROR';await navigation.release();await route.abort().catch(()=>{});
 }
});
page.on('response',response=>{
 if(response.request().isNavigationRequest()&&response.frame()===page.mainFrame()){
  const mime=response.headers()['content-type']||'';
  if([401,403,429].includes(response.status()))boundary='SAFETY_BOUNDARY';
  else if(response.status()>=400)boundary='PAGE_ERROR';
  else if(mime&&!/text\/html|application\/xhtml\+xml/i.test(mime))boundary='UNSUPPORTED_CONTENT';
  if(boundary)void navigation.release().catch(()=>{});
 }
});
const numberedVision=!!vision&&!visionOCR;
const pom=new PublicSitePage(page,navigation.resolve,navigation.release,numberedVision),steps:any[]=[],explorationMemory=new ExplorationMemory();
const assertSafe=()=>{if(boundary)throw new Error(boundary);pom.assertSafe();};
let activeStep:any,observationChanged=false,consecutiveRefreshes=0,consecutiveActionFailures=0;
const livePolicy:RetryPolicy={
 maxAttempts:6,maxElapsedMs:90000,retryDelaysMs:[1000,2000,5000,10000,15000],retryInvalidResponse:true,
 onProgress:async event=>{
  try{assertSafe();}catch{throw new InferenceInterruption('SAFETY_BOUNDARY');}
  if(activeStep){
   (activeStep.inferenceRecovery??=[]).push(event);
   await writeFile(join(dir,`step-${activeStep.number}.json`),JSON.stringify(activeStep,null,2));
   if((event.phase==='request'&&event.attempt>1)||event.phase==='recovered'){
    const screen=await pom.observe(true);
    try{assertSafe();}catch{throw new InferenceInterruption('SAFETY_BOUNDARY');}
    const imageChanged=!!vision&&!!currentScreenshot&&!currentScreenshot.equals(numberedVision?(await pom.captureDecisionScreenshot(screen,activeStep.candidates)).bytes:await page.screenshot());
    if(page.url()!==activeStep.url||JSON.stringify(screen)!==JSON.stringify(activeStep.state.screen)||imageChanged){
     activeStep.recoveryObservation={url:page.url(),screen,...(imageChanged?{imageChanged:true}:{})};observationChanged=true;
     throw new InferenceInterruption('OBSERVATION_CHANGED');
    }
   }
  }
  if(event.phase==='retry')console.log(`${activeStep?`Step ${activeStep.number}`:'Completion audit'}: inference HTTP ${event.failure?.statusCode??event.failure?.code}; retry ${event.attempt+1}/${event.maxAttempts} in ${event.delayMs}ms`);
  if(event.phase==='recovered')console.log(`${activeStep?`Step ${activeStep.number}`:'Completion audit'}: inference recovered on attempt ${event.attempt}`);
 },
};
let currentScreenshot:Buffer|undefined;
const visualContext=new VisualDecisionContext(visionOCR?true:undefined,imageOnly,imageMemory,imageMemoryProof?file=>readFile(join(dir,file)):undefined);
const liveEvaluate:ChoiceEvaluator=(state,questions)=>vision?visualContext.evaluate(state,questions,livePolicy):evaluateChoices(state,questions,livePolicy);
const evidenceSession=goalChecks?createEvidenceSession({evaluate:liveEvaluate,checkpoint:async snapshot=>{await writeFile(join(dir,'evidence-session.json'),JSON.stringify(snapshot,null,2));}}):undefined;
let history:State['history']=[];
let pendingTransition:{screen:State['screen'];actionLabel:string;remainingGoalChecks?:string[];recoveryTarget?:string}|undefined;
const actions:RecordedAction[]=[],recordingErrors:{step:number;message:string}[]=[];
page.on('pageerror',e=>warnings.push(e.message));
let reason='',actionCount=0,backCount=0,loopCount=0;
const start=performance.now();
let finalVisualObservation:VisualObservation|undefined;
let finalCapture:{status:'NOT_RUN'|'RECORDED'|'ERROR';code?:'SCREENSHOT_FAILED';error?:string}={status:'NOT_RUN'};
try{
 await pom.prepare();
 await pom.navigateTo(url);await page.waitForTimeout(intervalMs);
 reason=boundary;
 while(!reason){
  if(boundary){reason=boundary;break;}
  const t=performance.now(),screen=await pom.observe(true),n=steps.length+1;
  if(boundary){reason=boundary;break;}
  // The fresh next decision screen is also the previous action's result.
  // Complete history here instead of scanning once after the action and again
  // before the decision. No stale screen or target cache crosses a decision.
  if(pendingTransition){
   history=rememberObservation(history,pendingTransition.screen,pendingTransition.actionLabel,`画面: ${screen.title||screen.text.slice(0,3).join(' / ')}`);
   if(pendingTransition.remainingGoalChecks)history[history.length-1].remainingGoalChecks=pendingTransition.remainingGoalChecks;
   if(pendingTransition.recoveryTarget)history[history.length-1].recoveryTarget=pendingTransition.recoveryTarget;
   pendingTransition=undefined;
  }
  const state:State={goal,currentDate:new Date().toISOString().slice(0,10),screen,history:[...history]};
  const offered=candidatesFor(screen,pom.canGoBack);
  const offer=explorationMemory.observe(page.url(),screen,offered,pom.explorationActionKeys,pom.explorationNavigationChoices);
  state.observedAlternatives=pom.explorationBackUrl?explorationMemory.observedAlternatives(offer,pom.explorationBackUrl):[];
  // A user-specified final action-budget judgment still sees the full choices.
  const finalBudget=maxActions>0&&actionCount>=maxActions;
  const candidates=finalBudget?offered:offer.candidates,excludedChoices=finalBudget?[]:Object.keys(offer.exclusions),screenshot=`step-${n}.png`;
  const frontier=(goalChecks||vision)&&!finalBudget?explorationMemory.frontier(offer):undefined;
  const capture=numberedVision?await pom.captureDecisionScreenshot(screen,candidates,join(dir,screenshot)):{bytes:await page.screenshot({path:join(dir,screenshot)}),targets:[]};
  currentScreenshot=capture.bytes;
  const step:any={number:n,url:page.url(),state,candidates,screenshot,...(numberedVision?{visualTargets:capture.targets}:{}),result:'PENDING',explorationMemory:{stateId:offer.stateId,revision:offer.revision,transitChoices:finalBudget?[]:offer.transitChoices,exclusions:finalBudget?{}:offer.exclusions},...(excludedChoices.length?{loopAvoidance:{excludedChoices,reason:'Explored transitions without unused onward exploration, departures from the active frontier route, or duplicate transitions',offeredCandidates:offered}}:{})};steps.push(step);
  if(vision){
   step.visualObservation=captureVisualObservation(currentScreenshot,n,screenshot,page.url());
   visualContext.capture(currentScreenshot,{...step.visualObservation,pageId:screen.pageId,viewport:screen.viewport},screen,frontier);
   step.visualContext=visualContext.snapshot();
  }
  await writeFile(join(dir,`step-${n}.json`),JSON.stringify(step,null,2));
  try{
   assertSafe();
   activeStep=step;observationChanged=false;
   step.frontier=frontier;
   step.decision=await jevDecide(state,candidates,goalChecks?{goalChecks,session:evidenceSession,frontier}:vision?{verifyCompletion:true,frontier,...(imageMemory?{preserveTransit:true,completionEvidence:()=>visualContext.completionEvidence()}:{})}:undefined,liveEvaluate);const {action,choice}=step.decision;
   consecutiveRefreshes=0;
   assertSafe();
   if(action.type==='done')reason='JEV_DONE';
   else if(action.type==='stuck')reason='STUCK';
   // Observe and judge the final permitted action's result, but never execute
   // an extra action. Keep all candidates so the model is not forced to say done.
   else if(maxActions>0&&actionCount>=maxActions)reason='ACTION_LIMIT';
   else{
    assertSafe();
    if(step.decision.frontier)explorationMemory.commit(offer,step.decision.frontier.targetId,step.decision.frontier.focus);
    let recordedAction:RecordedAction|undefined;
    try{recordedAction=await pom.describeAction(action,n);}
    catch(e){recordingErrors.push({step:n,message:e instanceof Error?e.message:String(e)});}
    const actionStart=performance.now();await pom.act(action);actionCount++;visualContext.recordAction(action);
    explorationMemory.executed(offer,choice);
    if(recordedAction){
     recordedAction.urlAfter=page.url();recordedAction.durationMs=performance.now()-actionStart;
     try{if(recordedAction.action==='scroll')recordedAction.scroll=await page.evaluate(()=>({x:scrollX,y:scrollY}));}
     catch(e){recordingErrors.push({step:n,message:e instanceof Error?e.message:String(e)});}
     actions.push(recordedAction);step.recordedAction=recordedAction;
    }
    if(boundary)throw new Error(boundary);
    if(action.type==='back')backCount++;
    pendingTransition={screen,actionLabel:candidates[choice].label,...(step.decision.goalAssessment?{remainingGoalChecks:pendingGoalChecks(step.decision.goalAssessment)}:{}),...(step.decision.recovery?.selectedAlternative?{recoveryTarget:step.decision.recovery.selectedAlternative}:{})};
    // Keep the same per-action delay, but let the result settle before it is
    // observed. Waiting before the action captured transitional header states.
    await page.waitForTimeout(intervalMs);
    assertSafe();
   }
   if(!reason)consecutiveActionFailures=0;
   step.result=reason||'OK';console.log(`Step ${n}: ${candidates[choice].label} => ${step.result}`);
  }catch(e){
   const message=e instanceof Error?e.message:String(e);
   if(e instanceof Error&&'decisionReview' in e)step.decisionReview=e.decisionReview;
   let safety='';try{assertSafe();}catch{safety=boundary||'SAFETY_BOUNDARY';}
   if(e instanceof InferenceInterruption)step.request=e.request;
   if(observationChanged&&!safety){
    step.result='REOBSERVE';step.error='Observation changed while waiting for inference; no action executed.';
    console.log(`Step ${n}: observation changed; refreshing judgment without replaying actions`);
    if(++consecutiveRefreshes>=3){reason='PAGE_ERROR';step.result=reason;step.error='Observation kept changing during inference recovery.';}
   }else{
    const code=safety||boundary||(['UNSUPPORTED_CONTENT','SAFETY_BOUNDARY','PAGE_ERROR','ACTION_NOOP'].find(code=>message.includes(code)))||(e instanceof GoalChecksError?'GOAL_CONFIG_ERROR':step.decision?'ACTION_ERROR':'DECISION_ERROR');
    const recovery=actionOutcome(code,['ACTION_ERROR','ACTION_NOOP'].includes(code)?++consecutiveActionFailures:1);
    step.result=recovery.result;step.error=message;if(e instanceof ChoiceRequestError){step.request=e.request;step.failure=e.failure;}if(e instanceof GoalChecksError||e instanceof GoalDecisionError)step.goalAssessment=e.goalAssessment;if(e instanceof GoalDecisionError)step.decisionStage=e.stage;
    if(recovery.terminal)reason=recovery.result;
    else{
     // The attempt stays in the exploration record so the same choice is not
     // offered again; a click that changed nothing is still a user action.
     explorationMemory.executed(offer,step.decision.choice);
     if(code==='ACTION_NOOP'){actionCount++;visualContext.recordAction(step.decision.action,'no-visible-change');}
     console.log(`Step ${n}: ${recovery.result}; continuing with the remaining candidates`);
    }
   }
  }
  activeStep=undefined;
  if(vision)step.visualContext=visualContext.snapshot();
  step.elapsedMs=performance.now()-t;await writeFile(join(dir,`step-${n}.json`),JSON.stringify(step,null,2));
  if(evidenceSession)await writeFile(join(dir,'evidence-session.json'),JSON.stringify(evidenceSession.snapshot(),null,2));
 }
 if(!reason)reason='ACTION_LIMIT';
 try{
  const finalBytes=await page.screenshot({path:join(dir,'final.png')});
  if(vision)finalVisualObservation=captureVisualObservation(finalBytes,steps.length+1,'final.png',page.url());
  finalCapture={status:'RECORDED'};
 }catch(error){
  finalCapture={status:'ERROR',code:'SCREENSHOT_FAILED',error:error instanceof Error?error.message:String(error)};
  warnings.push('Final screenshot failed; the original exploration termination is preserved.');
 }
}catch(e){const message=e instanceof Error?e.message:String(e);reason=boundary||(['UNSUPPORTED_CONTENT','SAFETY_BOUNDARY'].find(code=>message.includes(code)))||'PAGE_ERROR';warnings.push(message);}
finally{
 await visualContext.close();
 const elapsedMs=performance.now()-start;
 activeStep=undefined;
 const completionAudit=await recordCompletion(steps.map(s=>s.state),reason==='JEV_DONE'&&!imageOnly?createBudgetedEvaluator(livePolicy,120000):undefined);
 const visualCompletionAudit=vision?await recordSavedVisualCompletion(goal,steps.at(-1)?.state.currentDate||'',dir,steps,undefined,finalVisualObservation):undefined;
 const result={variant:'public',goalText:goal,pom:'auto',font:true,repeat:1,fake:false,...(vision?{vision:true}:{}),successMode:'jev',objectiveSuccess:null,perceivedSuccess:reason==='JEV_DONE',comparison:'UNVERIFIED',completionAudit,perception:reason==='JEV_DONE'?'DONE':'UNCONFIRMED',status:reason==='JEV_DONE'?'PERCEIVED_SUCCESS':'UNCONFIRMED',reason,actionCount,backCount,loopCount,elapsedMs,path:history,steps,dir,finalURL:page.url(),warnings,settings:{url,maxActions,intervalMs,navigationMode:'links-and-local-disclosures',redirectMode:'same-origin-up-to-3',policyReview:'user-acknowledged',decisionMode:goalChecks?'goal-checks-experimental':'combined',...(vision?{observationMode:imageOnly?'image-only':'image-and-dom',completionAuditInput:imageOnly?'disabled':'dom-only',visualTextMemory:visionOCR?'ocr-verified':'disabled',visualJudgmentMemory:imageMemory?'enabled':'disabled',completionEvidenceImages:imageMemoryProof?'selected-sources':'disabled',visualTargetMode:numberedVision?'numbered':'legacy'}:{}),...(goalChecks?{goalChecks}:{})}};
 const actionTrace:ActionTrace={schemaVersion:1,goalId:'public',goalText:goal,initialUrl:url,viewport:page.viewportSize()||{width:1440,height:1000},source:'public',fake:false,success:{reason,objectiveSuccess:null,perceivedSuccess:reason==='JEV_DONE'},actions,completedAt:new Date().toISOString(),...(recordingErrors.length?{recordingErrors}:{})};
 await writeFile(join(dir,'action-trace.json'),JSON.stringify(actionTrace,null,2));
 const goalOutcome=imageMemory?await recordGoalOutcome(goal,steps.at(-1)?.state.currentDate||'',dir,steps,finalVisualObservation):undefined;
 const recorded={...result,stopAssessment:assessStop(result),navigationRequests,actionTrace,finalCapture,...(finalVisualObservation?{finalVisualObservation}:{}),...(visualCompletionAudit?{visualCompletionAudit}:{}),...(goalOutcome?{goalOutcome}:{}),...(evidenceSession?{evidenceSession:evidenceSession.snapshot()}:{})};
 if(evidenceSession)await writeFile(join(dir,'evidence-session.json'),JSON.stringify(evidenceSession.snapshot(),null,2));
 await writeFile(join(dir,'result.json'),JSON.stringify(recorded,null,2));await report(root,[recorded]);console.log(JSON.stringify({reason,actionCount,finalURL:page.url(),report:join(root,'index.html')}));await browser.close();
}
