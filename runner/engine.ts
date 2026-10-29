import type {Page} from 'playwright';
import {createHash} from 'node:crypto';
import {filterCandidates,publicExploration,type ExplorationInput} from '../jev/persona.js';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {GoodPage} from '../pages/GoodPage.js';
import {BadPage} from '../pages/BadPage.js';
import {AutoPage} from '../pages/AutoPage.js';
import {LocalExplorationPage} from '../pages/LocalExplorationPage.js';
import {ExplorationMemory} from './exploration-memory.js';
import type {FrontierOffer} from '../jev/frontier-types.js';
import {goals,type GoalId} from '../tests/goals.js';
import {candidatesFor,type Decider,type State,type Candidate,type Decision} from '../jev/types.js';
import {recordCompletion} from '../jev/completion.js';
import type {ChoiceEvaluator} from '../jev/client.js';
import type {ActionTrace,RecordedAction} from './action-trace.js';
import {saveRawTest} from './generate-test.js';
import {captureVisualObservation,recordSavedVisualCompletion,type VisualObservation} from './visual-evidence.js';
import {VisualDecisionContext} from '../jev/visual-context.js';
import {recordGoalOutcome} from './goal-outcome.js';
import {rememberObservation} from '../jev/history.js';
export type Config={explorationMemory?:boolean;pageIdentity?:'document'|'hash-route';exploration?:ExplorationInput;variant:'good'|'bad';goal:GoalId;font:boolean;maxActions:number;dir:string;baseURL:string;repeat:number;fake:boolean;pom?:'manual'|'auto';success?:'oracle'|'jev'|'both';generateTest?:boolean;rawDir?:string;vision?:boolean;visionOCR?:boolean;imageOnly?:boolean;imageMemory?:boolean;imageMemoryProof?:boolean};
export type VisualDecider=(state:State,candidates:Record<string,Candidate>,screenshot:Buffer,context?:VisualDecisionContext,frontier?:FrontierOffer)=>Promise<Decision>;
export async function run(page:Page,decide:Decider,config:Config,auditEvaluator?:ChoiceEvaluator,visualDecide?:VisualDecider){
  await mkdir(config.dir,{recursive:true});
  if(config.visionOCR&&!config.vision)throw new Error('visionOCR requires vision');
  if(config.imageOnly&&!config.vision)throw new Error('imageOnly requires vision');
  if(config.imageOnly&&config.visionOCR)throw new Error('imageOnly cannot combine with visionOCR');
  if(config.imageOnly&&!visualDecide)throw new Error('imageOnly requires a visual decider');
  if(config.imageMemory&&!config.imageOnly)throw new Error('imageMemory requires imageOnly');
  if(config.imageMemoryProof&&!config.imageMemory)throw new Error('imageMemoryProof requires imageMemory');
  if(config.explorationMemory&&(config.pom!=='auto'||!config.exploration))throw new Error('Local exploration memory requires auto POM and experiment inputs');
  const memory=config.explorationMemory?new ExplorationMemory():undefined;
  const numberedVision=!!(config.vision||visualDecide)&&!config.visionOCR;
  const goal={...goals[config.goal],text:config.exploration?.charter.goal??goals[config.goal].text},pom=config.explorationMemory?new LocalExplorationPage(page,numberedVision,config.pageIdentity==='hash-route'):config.pom==='auto'?new AutoPage(page,numberedVision,config.pageIdentity==='hash-route'):config.variant==='good'?new GoodPage(page,numberedVision):new BadPage(page,numberedVision);
  const successMode=config.success||'oracle';let objectiveSuccess=false,perceivedSuccess=false,firstObjectiveStep:number|null=null;
  let history:State['history']=[];
  const steps:any[]=[],downloads:string[]=[],pending:Promise<void>[]=[];
  const actions:RecordedAction[]=[],recordingErrors:{step:number;message:string}[]=[];
  let traceCaptureMs=0;
  const errors:string[]=[]; const seen=new Map<string,number>(); let backCount=0,loopCount=0,actionCount=0,depth=0,reason='';
  const start=performance.now();
  let finalVisualObservation:VisualObservation|undefined;
  let finalCapture:{status:'NOT_RUN'|'RECORDED'|'ERROR';code?:'SCREENSHOT_FAILED';error?:string}={status:'NOT_RUN'};
  const visualContext=new VisualDecisionContext(config.visionOCR?true:undefined,config.imageOnly,config.imageMemory,config.imageMemoryProof?file=>readFile(join(config.dir,file)):undefined);
  const onError=(e:Error)=>errors.push(e.message);page.on('pageerror',onError);
  page.on('download',d=>{pending.push((async()=>{const name=d.suggestedFilename();const path=join(config.dir,`download-${pending.length}.pdf`);await d.saveAs(path);const bytes=await readFile(path);if(bytes.subarray(0,5).toString()==='%PDF-')downloads.push(name);})().catch(()=>{errors.push('DOWNLOAD_ERROR');}));});
  try{
    await page.goto(`${config.baseURL}/${config.variant}/`,{waitUntil:'networkidle',timeout:30000});
    while(!reason){
      if(errors.length){reason='PAGE_ERROR';break;}
      if(config.maxActions>0&&actionCount>=config.maxActions){reason='ACTION_LIMIT';break;}
      const stepStart=performance.now();const screen=await pom.observe(config.font);
      const state:State={goal:goal.text,currentDate:config.exploration?.charter.initialState.currentDate??'2026-09-19',screen,history:[...history],...(config.exploration?{exploration:publicExploration(config.exploration)}:{})};
      const local=pom instanceof LocalExplorationPage?pom:undefined;
      const rawOffered=candidatesFor(screen,local?local.canGoBack:depth>0);
      const offered=config.exploration?filterCandidates(rawOffered,screen,config.exploration.charter):rawOffered;
      const offer=memory&&local?memory.observe(page.url(),screen,offered,local.explorationActionKeys,local.explorationNavigationChoices):undefined;
      if(offer&&memory)state.observedAlternatives=local?.explorationBackUrl?memory.observedAlternatives(offer,local.explorationBackUrl):[];
      const candidates=offer?offer.candidates:offered,frontier=offer&&memory?memory.frontier(offer):undefined;
      const n=steps.length+1;const screenshot=`step-${String(n).padStart(3,'0')}.png`;
      const capture=numberedVision?await pom.captureDecisionScreenshot(screen,candidates,join(config.dir,screenshot)):{bytes:await page.screenshot({path:join(config.dir,screenshot)}),targets:[]};
      const screenshotBytes=capture.bytes;
      const step:any={number:n,url:page.url(),screenshot,state,candidates,...(numberedVision?{visualTargets:capture.targets}:{}),result:'PENDING',...(offer?{explorationMemory:{stateId:offer.stateId,revision:offer.revision,transitChoices:offer.transitChoices,exclusions:offer.exclusions},offeredCandidates:offered,frontier,...(Object.keys(offer.exclusions).length?{loopAvoidance:{excludedChoices:Object.keys(offer.exclusions),reason:'Existing ExplorationMemory: explored transitions, transit route, duplicate controls',offeredCandidates:offered}}:{})}:{}),...(config.vision?{visualObservation:captureVisualObservation(screenshotBytes,n,screenshot,page.url())}:{})};steps.push(step);
      if(visualDecide){visualContext.capture(screenshotBytes,{...step.visualObservation,step:n,url:page.url(),pageId:screen.pageId,viewport:screen.viewport},screen,frontier);step.visualContext=visualContext.snapshot();}
      try{
        const beforeDecision=performance.now();const decision=visualDecide?await visualDecide(state,candidates,screenshotBytes,visualContext,frontier):await decide(state,candidates,frontier?{frontier}:undefined);step.decisionMs=performance.now()-beforeDecision;step.decision=decision;
        if(config.exploration&&(!Object.hasOwn(candidates,decision.choice)||JSON.stringify(candidates[decision.choice].action)!==JSON.stringify(decision.action)))throw new Error('Decision is outside charter-approved candidates');
        const signature=JSON.stringify([page.url(),screen,decision.action]);const times=(seen.get(signature)||0)+1;seen.set(signature,times);
        // The existing public exploration pipeline permits revisiting shared transit hops.
        // Retain the legacy signature as telemetry, not a second stop policy.
        const legacyLoopGuardEnabled=!memory;
        if(config.exploration)step.loopCheck={enabled:legacyLoopGuardEnabled,policy:legacyLoopGuardEnabled?'legacy-triple-signature':'existing-memory-with-action-limit',threshold:3,occurrence:times,signatureSha256:createHash('sha256').update(signature).digest('hex'),matchingPreviousSteps:steps.filter(s=>s.number<n&&s.decision&&JSON.stringify([s.url,s.state.screen,s.decision.action])===signature).map(s=>s.number),blocked:legacyLoopGuardEnabled&&times>=3,historyIncluded:false};
        if(legacyLoopGuardEnabled&&times>=3){loopCount++;reason='LOOP';step.result='LOOP';}
        else if(decision.action.type==='stuck'){reason='STUCK';step.result='STUCK';}
        else if(decision.action.type==='done'){
          perceivedSuccess=true;objectiveSuccess=objectiveSuccess||await goal.check(page,downloads);
          reason=successMode==='jev'?'JEV_DONE':objectiveSuccess?'SUCCESS':'DONE_WITHOUT_SUCCESS';step.result=reason;
        }
        else{
          actionCount++;if(decision.action.type==='back')backCount++;
          let recordedAction:RecordedAction|undefined;
          const captureStart=performance.now();
          try{recordedAction=await pom.describeAction(decision.action,n);}
          catch(e){recordingErrors.push({step:n,message:e instanceof Error?e.message:String(e)});}
          traceCaptureMs+=performance.now()-captureStart;
          if(memory&&offer&&decision.frontier)memory.commit(offer,decision.frontier.targetId,decision.frontier.focus);
          const oldURL=page.url(),actionStart=performance.now();await pom.act(decision.action);visualContext.recordAction(decision.action);
          if(memory&&offer)memory.executed(offer,decision.choice);
          if(recordedAction){
            recordedAction.urlAfter=page.url();recordedAction.durationMs=performance.now()-actionStart;
            try{if(recordedAction.action==='scroll')recordedAction.scroll=await page.evaluate(()=>({x:scrollX,y:scrollY}));}
            catch(e){recordingErrors.push({step:n,message:e instanceof Error?e.message:String(e)});}
            actions.push(recordedAction);step.recordedAction=recordedAction;
          }
          await Promise.all(pending);
          if(decision.action.type==='back')depth=Math.max(0,depth-1);
          else if(page.url()!==oldURL)depth++;
          step.result='OK';
          history=rememberObservation(history,screen,candidates[decision.choice].label,`画面: ${await page.locator('h1').innerText()}${downloads.length?' / ダウンロード済み: '+downloads.join(', '):''}`);
          objectiveSuccess=objectiveSuccess||await goal.check(page,downloads);
          if(objectiveSuccess&&firstObjectiveStep===null)firstObjectiveStep=n;
          step.objectiveSuccess=objectiveSuccess;
          if(config.exploration){
            const afterScreen=await pom.observe(config.font),afterScreenshot=`after-${String(n).padStart(3,'0')}.png`;
            await page.screenshot({path:join(config.dir,afterScreenshot)});
            step.outcome={url:page.url(),screen:afterScreen,screenshot:afterScreenshot};
          }
          if(errors.length)reason='PAGE_ERROR';else if(objectiveSuccess&&successMode==='oracle')reason='SUCCESS';
        }
      }catch(e){reason=step.decision?'ACTION_ERROR':'DECISION_ERROR';step.result=reason;step.error=e instanceof Error?e.message:String(e);if(e instanceof Error&&'decisionReview' in e)step.decisionReview=e.decisionReview;}
      if(visualDecide)step.visualContext=visualContext.snapshot();
      step.elapsedMs=performance.now()-stepStart;
      await writeFile(join(config.dir,`step-${n}.json`),JSON.stringify(step,null,2));
    }
    try{
      const finalBytes=await page.screenshot({path:join(config.dir,'final.png')});
      if(config.vision)finalVisualObservation=captureVisualObservation(finalBytes,steps.length+1,'final.png',page.url());
      finalCapture={status:'RECORDED'};
    }catch(error){
      finalCapture={status:'ERROR',code:'SCREENSHOT_FAILED',error:error instanceof Error?error.message:String(error)};
      errors.push('Final screenshot failed; the original exploration termination is preserved.');
    }
  }catch(e){reason='PAGE_ERROR';errors.push(e instanceof Error?e.message:String(e));}
  finally{page.off('pageerror',onError);await visualContext.close();}
  const perception=perceivedSuccess?'DONE':reason==='STUCK'?'STUCK':reason==='LOOP'?'LOOP':'UNCONFIRMED';
  const elapsedMs=performance.now()-start;
  const completedAt=new Date().toISOString(),auditStart=performance.now();
  const completionAudit=await recordCompletion(steps.map(s=>s.state),perceivedSuccess&&!config.fake&&!config.imageOnly?auditEvaluator:undefined);
  const completionAuditMs=performance.now()-auditStart;
  const visualCompletionAudit=config.vision&&!config.fake?await recordSavedVisualCompletion(goal.text,steps.at(-1)?.state.currentDate||'',config.dir,steps,undefined,finalVisualObservation):undefined;
  const comparison=perceivedSuccess?(objectiveSuccess?'CONFIRMED_SUCCESS':'FALSE_COMPLETION'):objectiveSuccess?(successMode==='oracle'?'NOT_ASSESSED':['PAGE_ERROR','ACTION_ERROR','DECISION_ERROR'].includes(reason)?'ASSESSMENT_INTERRUPTED':'SUCCESS_NOT_RECOGNIZED'):'NOT_ACHIEVED';
  const actionTrace:ActionTrace={schemaVersion:1,goalId:config.goal,goalText:goal.text,initialUrl:`${config.baseURL}/${config.variant}/`,viewport:page.viewportSize()||{width:1280,height:900},source:'local',fake:config.fake,success:{reason,objectiveSuccess,perceivedSuccess},actions,completedAt,...(recordingErrors.length?{recordingErrors}:{})};
  await writeFile(join(config.dir,'action-trace.json'),JSON.stringify(actionTrace,null,2));
  let generatedTest:{status:'NOT_REQUESTED'|'GENERATED'|'REJECTED';testPath?:string;tracePath?:string;generationMs?:number;error?:string}={status:'NOT_REQUESTED'};
  if(config.generateTest){
    try{generatedTest={status:'GENERATED',...await saveRawTest(actionTrace,config.rawDir)};}
    catch(e){generatedTest={status:'REJECTED',error:e instanceof Error?e.message:String(e)};}
  }
  const timing={explorationMs:elapsedMs,decisionMs:steps.reduce((total,s)=>total+(s.decisionMs||0),0),traceCaptureMs,actionMs:actions.reduce((total,a)=>total+(a.durationMs||0),0),completionAuditMs,...(visualCompletionAudit?{visualCompletionAuditMs:visualCompletionAudit.elapsedMs}:{}),generationMs:generatedTest.generationMs||0};
  const result={...config,pom:config.pom||'manual',successMode,objectiveSuccess,perceivedSuccess,perception,comparison,completionAudit,...(visualCompletionAudit?{visualCompletionAudit}:{}),firstObjectiveStep,goalText:goal.text,status:reason==='SUCCESS'?'SUCCESS':reason==='JEV_DONE'?'PERCEIVED_SUCCESS':'FAILED',reason,actionCount,backCount,loopCount,stuck:reason==='STUCK',elapsedMs,errors,downloads,path:history,steps,actionTrace,generatedTest,timing,model:steps[0]?.decision?.model||null};
  const goalOutcome=config.imageMemory&&!config.fake?await recordGoalOutcome(goal.text,steps.at(-1)?.state.currentDate||'',config.dir,steps,finalVisualObservation):undefined;
  const recorded={...result,finalCapture,...(finalVisualObservation?{finalVisualObservation}:{}),...(goalOutcome?{goalOutcome}:{})};
  await writeFile(join(config.dir,'result.json'),JSON.stringify(recorded,null,2));return recorded;
}
