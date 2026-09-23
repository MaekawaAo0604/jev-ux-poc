import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {PublicSitePage} from '../pages/PublicSitePage.js';
import {jevDecide} from '../jev/decide.js';
import {recordCompletion} from '../jev/completion.js';
import {evaluateChoices,createBudgetedEvaluator,ChoiceRequestError,InferenceInterruption,type ChoiceEvaluator,type RetryPolicy} from '../jev/client.js';
import {candidatesFor,type State} from '../jev/types.js';
import {report} from './report.js';
import {parsePublicOptions} from './public-options.js';
import {publicNavigation} from './public-navigation.js';
import {rememberObservation} from '../jev/history.js';
import {GoalChecksError,GoalDecisionError,pendingGoalChecks} from '../jev/goal-status.js';
import {createEvidenceSession} from '../jev/evidence-session.js';
import type {ActionTrace,RecordedAction} from './action-trace.js';
import {ExplorationMemory} from './exploration-memory.js';
if(process.argv.includes('--help')){
 console.log('Usage: npm run explore -- URL "GOAL" --reviewed [--max-actions 0] [--interval-ms 2000] [--goal-check "EXCERPT" ...]\n--max-actions: optional action limit; 0 means unlimited (default).\n--goal-check: experimental separate information checks; use excerpts of the goal, never answers or routes. Omit to keep legacy decisions.\n--reviewed: site rules and exploration scope have been checked. No automatic policy review.\nDirect links and network-blocked disclosures; no form submission, login, external navigation or file reading.');
 process.exit(0);
}
const {url,goal,maxActions,intervalMs,goalChecks}=parsePublicOptions(process.argv.slice(2));
try{process.loadEnvFile('.env');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
const origin=new URL(url).origin;
const root=resolve('reports',new Date().toISOString().replaceAll(':','-')+'-public');
const dir=join(root,'exploration');await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'ja-JP',acceptDownloads:false,serviceWorkers:'block'});
const page=await context.newPage();page.setDefaultTimeout(10000);
const navigation=publicNavigation(context,origin,{
 'accept-language':'ja-JP',
 accept:'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
 'user-agent':await page.evaluate(()=>navigator.userAgent),
});
let boundary='';
const warnings:string[]=[];
await context.route('**/*',async route=>{
 const request=route.request();
 if(boundary){await navigation.release();return route.abort();}
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
 return route.continue();
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
const pom=new PublicSitePage(page,navigation.resolve,navigation.release),steps:any[]=[],explorationMemory=new ExplorationMemory();
const assertSafe=()=>{if(boundary)throw new Error(boundary);pom.assertSafe();};
let activeStep:any,observationChanged=false,consecutiveRefreshes=0;
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
    if(page.url()!==activeStep.url||JSON.stringify(screen)!==JSON.stringify(activeStep.state.screen)){
     activeStep.recoveryObservation={url:page.url(),screen};observationChanged=true;
     throw new InferenceInterruption('OBSERVATION_CHANGED');
    }
   }
  }
  if(event.phase==='retry')console.log(`${activeStep?`Step ${activeStep.number}`:'Completion audit'}: inference HTTP ${event.failure?.statusCode??event.failure?.code}; retry ${event.attempt+1}/${event.maxAttempts} in ${event.delayMs}ms`);
  if(event.phase==='recovered')console.log(`${activeStep?`Step ${activeStep.number}`:'Completion audit'}: inference recovered on attempt ${event.attempt}`);
 },
};
const liveEvaluate:ChoiceEvaluator=(state,questions)=>evaluateChoices(state,questions,livePolicy);
const evidenceSession=goalChecks?createEvidenceSession({evaluate:liveEvaluate,checkpoint:async snapshot=>{await writeFile(join(dir,'evidence-session.json'),JSON.stringify(snapshot,null,2));}}):undefined;
let history:State['history']=[];
let pendingTransition:{screen:State['screen'];actionLabel:string;remainingGoalChecks?:string[]}|undefined;
const actions:RecordedAction[]=[],recordingErrors:{step:number;message:string}[]=[];
page.on('pageerror',e=>warnings.push(e.message));
let reason='',actionCount=0,backCount=0,loopCount=0;
const start=performance.now();
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
   pendingTransition=undefined;
  }
  const state:State={goal,currentDate:new Date().toISOString().slice(0,10),screen,history:[...history]};
  const offered=candidatesFor(screen,pom.canGoBack);
  const offer=explorationMemory.observe(page.url(),screen,offered,pom.explorationActionKeys,pom.explorationNavigationChoices);
  // A user-specified final action-budget judgment still sees the full choices.
  const finalBudget=maxActions>0&&actionCount>=maxActions;
  const candidates=finalBudget?offered:offer.candidates,excludedChoices=finalBudget?[]:Object.keys(offer.exclusions),screenshot=`step-${n}.png`;
  const frontier=goalChecks&&!finalBudget?explorationMemory.frontier(offer):undefined;
  await page.screenshot({path:join(dir,screenshot)});
  const step:any={number:n,url:page.url(),state,candidates,screenshot,result:'PENDING',explorationMemory:{stateId:offer.stateId,revision:offer.revision,transitChoices:finalBudget?[]:offer.transitChoices,exclusions:finalBudget?{}:offer.exclusions},...(excludedChoices.length?{loopAvoidance:{excludedChoices,reason:'Explored transitions without unused onward exploration, departures from the active frontier route, or duplicate transitions',offeredCandidates:offered}}:{})};steps.push(step);
  await writeFile(join(dir,`step-${n}.json`),JSON.stringify(step,null,2));
  try{
   assertSafe();
   activeStep=step;observationChanged=false;
   step.frontier=frontier;
   step.decision=await jevDecide(state,candidates,goalChecks?{goalChecks,session:evidenceSession,frontier}:undefined,liveEvaluate);const {action,choice}=step.decision;
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
    const actionStart=performance.now();await pom.act(action);actionCount++;
    explorationMemory.executed(offer,choice);
    if(recordedAction){
     recordedAction.urlAfter=page.url();recordedAction.durationMs=performance.now()-actionStart;
     try{if(recordedAction.action==='scroll')recordedAction.scroll=await page.evaluate(()=>({x:scrollX,y:scrollY}));}
     catch(e){recordingErrors.push({step:n,message:e instanceof Error?e.message:String(e)});}
     actions.push(recordedAction);step.recordedAction=recordedAction;
    }
    if(boundary)throw new Error(boundary);
    if(action.type==='back')backCount++;
    pendingTransition={screen,actionLabel:candidates[choice].label,...(step.decision.goalAssessment?{remainingGoalChecks:pendingGoalChecks(step.decision.goalAssessment)}:{})};
    // Keep the same per-action delay, but let the result settle before it is
    // observed. Waiting before the action captured transitional header states.
    await page.waitForTimeout(intervalMs);
    assertSafe();
   }
   step.result=reason||'OK';console.log(`Step ${n}: ${candidates[choice].label} => ${step.result}`);
  }catch(e){
   const message=e instanceof Error?e.message:String(e);
   let safety='';try{assertSafe();}catch{safety=boundary||'SAFETY_BOUNDARY';}
   if(e instanceof InferenceInterruption)step.request=e.request;
   if(observationChanged&&!safety){
    step.result='REOBSERVE';step.error='Observation changed while waiting for inference; no action executed.';
    console.log(`Step ${n}: observation changed; refreshing judgment without replaying actions`);
    if(++consecutiveRefreshes>=3){reason='PAGE_ERROR';step.result=reason;step.error='Observation kept changing during inference recovery.';}
   }else{
    reason=safety||boundary||(['UNSUPPORTED_CONTENT','SAFETY_BOUNDARY'].find(code=>message.includes(code)))||(e instanceof GoalChecksError?'GOAL_CONFIG_ERROR':step.decision?'ACTION_ERROR':'DECISION_ERROR');step.result=reason;step.error=message;if(e instanceof ChoiceRequestError){step.request=e.request;step.failure=e.failure;}if(e instanceof GoalChecksError||e instanceof GoalDecisionError)step.goalAssessment=e.goalAssessment;if(e instanceof GoalDecisionError)step.decisionStage=e.stage;
   }
  }
  activeStep=undefined;
  step.elapsedMs=performance.now()-t;await writeFile(join(dir,`step-${n}.json`),JSON.stringify(step,null,2));
  if(evidenceSession)await writeFile(join(dir,'evidence-session.json'),JSON.stringify(evidenceSession.snapshot(),null,2));
 }
 if(!reason)reason='ACTION_LIMIT';
 await page.screenshot({path:join(dir,'final.png')});
}catch(e){const message=e instanceof Error?e.message:String(e);reason=boundary||(['UNSUPPORTED_CONTENT','SAFETY_BOUNDARY'].find(code=>message.includes(code)))||'PAGE_ERROR';warnings.push(message);}
finally{
 const elapsedMs=performance.now()-start;
 activeStep=undefined;
 const completionAudit=await recordCompletion(steps.map(s=>s.state),reason==='JEV_DONE'?createBudgetedEvaluator(livePolicy,120000):undefined);
 const result={variant:'public',goalText:goal,pom:'auto',font:true,repeat:1,fake:false,successMode:'jev',objectiveSuccess:null,perceivedSuccess:reason==='JEV_DONE',comparison:'UNVERIFIED',completionAudit,perception:reason==='JEV_DONE'?'DONE':'UNCONFIRMED',status:reason==='JEV_DONE'?'PERCEIVED_SUCCESS':'UNCONFIRMED',reason,actionCount,backCount,loopCount,elapsedMs,path:history,steps,dir,finalURL:page.url(),warnings,settings:{url,maxActions,intervalMs,navigationMode:'links-and-local-disclosures',redirectMode:'same-origin-up-to-3',policyReview:'user-acknowledged',decisionMode:goalChecks?'goal-checks-experimental':'combined',...(goalChecks?{goalChecks}:{})}};
 const actionTrace:ActionTrace={schemaVersion:1,goalId:'public',goalText:goal,initialUrl:url,viewport:page.viewportSize()||{width:1440,height:1000},source:'public',fake:false,success:{reason,objectiveSuccess:null,perceivedSuccess:reason==='JEV_DONE'},actions,completedAt:new Date().toISOString(),...(recordingErrors.length?{recordingErrors}:{})};
 await writeFile(join(dir,'action-trace.json'),JSON.stringify(actionTrace,null,2));
 const recorded={...result,actionTrace,...(evidenceSession?{evidenceSession:evidenceSession.snapshot()}:{})};
 if(evidenceSession)await writeFile(join(dir,'evidence-session.json'),JSON.stringify(evidenceSession.snapshot(),null,2));
 await writeFile(join(dir,'result.json'),JSON.stringify(recorded,null,2));await report(root,[recorded]);console.log(JSON.stringify({reason,actionCount,finalURL:page.url(),report:join(root,'index.html')}));await browser.close();
}
