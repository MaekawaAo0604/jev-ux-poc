import type {Page} from 'playwright';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {GoodPage} from '../pages/GoodPage.js';
import {BadPage} from '../pages/BadPage.js';
import {AutoPage} from '../pages/AutoPage.js';
import {goals,type GoalId} from '../tests/goals.js';
import {candidatesFor,type Decider,type State} from '../jev/types.js';
import {recordCompletion} from '../jev/completion.js';
import type {ChoiceEvaluator} from '../jev/client.js';
import type {ActionTrace,RecordedAction} from './action-trace.js';
import {saveRawTest} from './generate-test.js';
export type Config={variant:'good'|'bad';goal:GoalId;font:boolean;maxActions:number;dir:string;baseURL:string;repeat:number;fake:boolean;pom?:'manual'|'auto';success?:'oracle'|'jev'|'both';generateTest?:boolean;rawDir?:string};
export async function run(page:Page,decide:Decider,config:Config,auditEvaluator?:ChoiceEvaluator){
  await mkdir(config.dir,{recursive:true});
  const goal=goals[config.goal],pom=config.pom==='auto'?new AutoPage(page):config.variant==='good'?new GoodPage(page):new BadPage(page);
  const successMode=config.success||'oracle';let objectiveSuccess=false,perceivedSuccess=false,firstObjectiveStep:number|null=null;
  const history:State['history']=[],steps:any[]=[],downloads:string[]=[],pending:Promise<void>[]=[];
  const actions:RecordedAction[]=[],recordingErrors:{step:number;message:string}[]=[];
  let traceCaptureMs=0;
  const errors:string[]=[]; const seen=new Map<string,number>(); let backCount=0,loopCount=0,actionCount=0,depth=0,reason='';
  const start=performance.now();
  const onError=(e:Error)=>errors.push(e.message);page.on('pageerror',onError);
  page.on('download',d=>{pending.push((async()=>{const name=d.suggestedFilename();const path=join(config.dir,`download-${pending.length}.pdf`);await d.saveAs(path);const bytes=await readFile(path);if(bytes.subarray(0,5).toString()==='%PDF-')downloads.push(name);})().catch(()=>{errors.push('DOWNLOAD_ERROR');}));});
  try{
    await page.goto(`${config.baseURL}/${config.variant}/`,{waitUntil:'networkidle'});
    while(!reason){
      if(errors.length){reason='PAGE_ERROR';break;}
      if(config.maxActions>0&&actionCount>=config.maxActions){reason='ACTION_LIMIT';break;}
      const stepStart=performance.now();const screen=await pom.observe(config.font);
      const state:State={goal:goal.text,currentDate:'2026-09-19',screen,history:[...history]};
      const candidates=candidatesFor(screen,depth>0);
      const n=steps.length+1;const screenshot=`step-${String(n).padStart(3,'0')}.png`;
      await page.screenshot({path:join(config.dir,screenshot)});
      const step:any={number:n,url:page.url(),screenshot,state,candidates,result:'PENDING'};steps.push(step);
      try{
        const beforeDecision=performance.now();const decision=await decide(state,candidates);step.decisionMs=performance.now()-beforeDecision;step.decision=decision;
        const signature=JSON.stringify([page.url(),screen,decision.action]);const times=(seen.get(signature)||0)+1;seen.set(signature,times);
        if(times>=3){loopCount++;reason='LOOP';step.result='LOOP';}
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
          const oldURL=page.url(),actionStart=performance.now();await pom.act(decision.action);
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
          history.push({screen:screen.title,action:candidates[decision.choice].label,result:`画面: ${await page.locator('h1').innerText()}${downloads.length?' / ダウンロード済み: '+downloads.join(', '):''}`});
          objectiveSuccess=objectiveSuccess||await goal.check(page,downloads);
          if(objectiveSuccess&&firstObjectiveStep===null)firstObjectiveStep=n;
          step.objectiveSuccess=objectiveSuccess;
          if(errors.length)reason='PAGE_ERROR';else if(objectiveSuccess&&successMode==='oracle')reason='SUCCESS';
        }
      }catch(e){reason=step.decision?'ACTION_ERROR':'DECISION_ERROR';step.result=reason;step.error=e instanceof Error?e.message:String(e);}
      step.elapsedMs=performance.now()-stepStart;
      await writeFile(join(config.dir,`step-${n}.json`),JSON.stringify(step,null,2));
    }
    await page.screenshot({path:join(config.dir,'final.png')});
  }catch(e){reason='PAGE_ERROR';errors.push(e instanceof Error?e.message:String(e));}
  finally{page.off('pageerror',onError);}
  const perception=perceivedSuccess?'DONE':reason==='STUCK'?'STUCK':reason==='LOOP'?'LOOP':'UNCONFIRMED';
  const elapsedMs=performance.now()-start;
  const completedAt=new Date().toISOString(),auditStart=performance.now();
  const completionAudit=await recordCompletion(steps.map(s=>s.state),perceivedSuccess&&!config.fake?auditEvaluator:undefined);
  const completionAuditMs=performance.now()-auditStart;
  const comparison=perceivedSuccess?(objectiveSuccess?'CONFIRMED_SUCCESS':'FALSE_COMPLETION'):objectiveSuccess?(successMode==='oracle'?'NOT_ASSESSED':['PAGE_ERROR','ACTION_ERROR','DECISION_ERROR'].includes(reason)?'ASSESSMENT_INTERRUPTED':'SUCCESS_NOT_RECOGNIZED'):'NOT_ACHIEVED';
  const actionTrace:ActionTrace={schemaVersion:1,goalId:config.goal,goalText:goal.text,initialUrl:`${config.baseURL}/${config.variant}/`,viewport:page.viewportSize()||{width:1280,height:900},source:'local',fake:config.fake,success:{reason,objectiveSuccess,perceivedSuccess},actions,completedAt,...(recordingErrors.length?{recordingErrors}:{})};
  await writeFile(join(config.dir,'action-trace.json'),JSON.stringify(actionTrace,null,2));
  let generatedTest:{status:'NOT_REQUESTED'|'GENERATED'|'REJECTED';testPath?:string;tracePath?:string;generationMs?:number;error?:string}={status:'NOT_REQUESTED'};
  if(config.generateTest){
    try{generatedTest={status:'GENERATED',...await saveRawTest(actionTrace,config.rawDir)};}
    catch(e){generatedTest={status:'REJECTED',error:e instanceof Error?e.message:String(e)};}
  }
  const timing={explorationMs:elapsedMs,decisionMs:steps.reduce((total,s)=>total+(s.decisionMs||0),0),traceCaptureMs,actionMs:actions.reduce((total,a)=>total+(a.durationMs||0),0),completionAuditMs,generationMs:generatedTest.generationMs||0};
  const result={...config,pom:config.pom||'manual',successMode,objectiveSuccess,perceivedSuccess,perception,comparison,completionAudit,firstObjectiveStep,goalText:goal.text,status:reason==='SUCCESS'?'SUCCESS':reason==='JEV_DONE'?'PERCEIVED_SUCCESS':'FAILED',reason,actionCount,backCount,loopCount,stuck:reason==='STUCK',elapsedMs,errors,downloads,path:history,steps,actionTrace,generatedTest,timing,model:steps[0]?.decision?.model||null};
  await writeFile(join(config.dir,'result.json'),JSON.stringify(result,null,2));return result;
}
