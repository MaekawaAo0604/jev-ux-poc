import {chromium} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {PublicSitePage} from '../../pages/PublicSitePage.js';
import {ExplorationMemory} from '../../runner/exploration-memory.js';
import {CompletionFrames} from '../../jev/completion-frames.js';
import {captureVisualObservation} from '../../runner/visual-evidence.js';
import {experimentDecider} from '../../jev/persona.js';
import {VisualDecisionContext} from '../../jev/visual-context.js';
import {candidatesFor,type State} from '../../jev/types.js';
import {rememberObservation} from '../../jev/history.js';
import {safeRequestFailure} from '../../jev/client.js';
process.loadEnvFile('.env');
const root=resolve(process.argv[2]??'reports/persona-real-pages-2026-10-26'),path=join(root,'live-continuations');await mkdir(path);
const manifest=JSON.parse(await readFile(join(root,'manifest.json'),'utf8')),rows=JSON.parse(await readFile(join(root,'results.json'),'utf8')),spec=manifest.spec,selected=rows.filter((r:any)=>r.phase==='confirmation'&&r.repeat===1);
if(selected.length!==8||selected.some((r:any)=>r.status!=='RECORDED'))throw new Error('PRESPECIFIED_SOURCE_INCOMPLETE');
const hash=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex'),source=await readFile('docs/experiments/2026-10-26-real-persona-live.ts');await writeFile(join(path,'execution-source.ts'),source);await writeFile(join(path,'manifest.json'),JSON.stringify({kind:'PRESPECIFIED_LIVE_CONTINUATIONS',startedAt:new Date().toISOString(),sourceSha256:hash(source),plan:selected.map((r:any)=>({scene:r.scene,condition:r.condition,sourceTrial:r.dir})),maxActions:spec.liveContinuation.maxActions,statisticalReplications:false},null,2));
const browser=await chromium.launch({headless:true}),runs:any[]=[];
try{for(const row of selected){
 const dir=row.scene+'-'+row.condition,runPath=join(path,dir);await mkdir(runPath);const input=JSON.parse(await readFile(join(root,row.dir,'input.json'),'utf8')),scene=spec.scenes.find((s:any)=>s.id===row.scene),target=new URL(scene.url);
 const context=await browser.newContext({viewport:spec.viewport,locale:spec.locale,timezoneId:spec.timezoneId,serviceWorkers:'block',acceptDownloads:false}),page=await context.newPage();page.setDefaultTimeout(10000);
 const network:any[]=[],steps:any[]=[];let boundary=false,reason='',count=0,history:State['history']=[];
 const visual=new VisualDecisionContext(),frames=new CompletionFrames(runPath,spec.liveContinuation.maxActions+1),memory=new ExplorationMemory();
 await context.routeWebSocket('**/*',s=>s.close());page.on('download',d=>void d.cancel());page.on('filechooser',c=>void c.setFiles([]));page.on('dialog',d=>void d.dismiss());context.on('page',p=>{if(p!==page)void p.close();});
 await context.route('**/*',async route=>{const req=route.request(),u=new URL(req.url()),top=req.isNavigationRequest()&&req.frame()===page.mainFrame();if(!['GET','HEAD'].includes(req.method())||u.origin!==target.origin||top&&!/^\/(ja|en)\/authentication(?:\/|$)/.test(u.pathname)){network.push({method:req.method(),url:u.origin+u.pathname,blocked:true});if(top)boundary=true;return route.abort();}try{const response=await route.fetch({maxRedirects:0,maxRetries:0,timeout:30000});try{if(response.status()===403||response.status()===429||response.status()>=300&&response.status()<400){boundary=true;return route.abort();}const headers=response.headers();await route.fulfill({response,headers:{...headers,'content-security-policy':(headers['content-security-policy']?headers['content-security-policy']+', ':'')+"form-action 'none'"}});}finally{await response.dispose();}}catch{network.push({url:u.pathname,error:'RESOURCE_ERROR'});await route.abort();}});
 const result:any={scene:row.scene,condition:row.condition,dir,sourceTrial:row.dir,statisticalReplication:false,objectiveSuccess:null,steps,network};
 try{
  await context.tracing.start({screenshots:true,snapshots:true,sources:false});const pom=new PublicSitePage(page,async url=>{const u=new URL(url);if(u.origin!==target.origin||!/^\/(ja|en)\/authentication(?:\/|$)/.test(u.pathname))throw new Error('SAFETY_BOUNDARY');return url;},async()=>{},true);await pom.navigateTo(scene.url);await page.waitForTimeout(1200);
  while(!reason){
   if(boundary){reason='SAFETY_BOUNDARY';break;}
   const screen=await pom.observe(false),raw=candidatesFor(screen,pom.canGoBack),offer=memory.observe(page.url(),screen,raw,pom.explorationActionKeys,pom.explorationNavigationChoices),frontier=memory.frontier(offer);
   const state:State={goal:input.state.goal,currentDate:input.state.currentDate,screen,history:[...history],exploration:input.state.exploration,observedAlternatives:pom.explorationBackUrl?memory.observedAlternatives(offer,pom.explorationBackUrl):[]};
   const number=steps.length+1,file='step-'+String(number).padStart(3,'0')+'.png',capture=await pom.captureDecisionScreenshot(screen,offer.candidates,join(runPath,file));visual.capture(capture.bytes,{step:number,url:page.url(),pageId:screen.pageId,viewport:screen.viewport},screen,frontier);
   const observation=captureVisualObservation(capture.bytes,number,file,page.url());frames.capture(observation);const step:any={number,url:page.url(),state,candidates:offer.candidates,screenshot:file,visualObservation:observation,requests:[],result:'PENDING'};steps.push(step);
   if(number===1){
    const actual={goal:state.goal,currentDate:state.currentDate,screen,history:[],exploration:state.exploration},neutral=structuredClone(actual);delete neutral.exploration!.persona;
    result.initialMatching={input:hash(JSON.stringify({state:neutral,candidates:raw}))===row.inputWithoutPersonaSha256,image:hash(capture.bytes)===row.imageSha256};
    const chosen=raw[row.decision.choice];if(!chosen||JSON.stringify(chosen.action)!==JSON.stringify(row.decision.action))throw new Error('LIVE_TARGET_MISMATCH');
    const expected=JSON.parse(await readFile(join(root,'scenes',row.scene,'capture.json'),'utf8')).descriptions[row.decision.choice];
    if(chosen.action.type==='click'){const description=await pom.describeAction(chosen.action,number);if(description.execution?.kind!=='navigate'||description.execution.url!==expected?.execution?.url)throw new Error('LIVE_TARGET_MISMATCH');}
    // Reuse exactly the prespecified model output, never a proposed correct action.
    if(!result.initialMatching.input)throw new Error('INITIAL_STATE_CHANGED');step.decision={...row.decision,reusedFrom:row.dir};
   }else{
    try{step.decision=await experimentDecider(async(context,q)=>{step.requests.push({input:context,questions:q});return q.completionCoverage?frames.evaluate(context,q):visual.evaluate(context,q,{maxAttempts:3,maxElapsedMs:30000,retryInvalidResponse:true,retryDelaysMs:[1000,2000]});},true)(state,offer.candidates,{frontier,completionEvidence:()=>frames.evidence()});}
    catch(error){const review=(error as any)?.decisionReview;if(review)step.decisionReview={stage:review.stage,initialDecision:review.initialDecision,response:review.response};throw error;}
    finally{step.visualContext=visual.snapshot();step.completionFrames=frames.snapshot();}
   }
   const decision=step.decision,candidate=offer.candidates[decision.choice];if(!candidate)throw new Error('LIVE_CANDIDATE_MISMATCH');
   if(decision.action.type==='done'||decision.action.type==='stuck'){reason=decision.action.type==='done'?'JEV_DONE':'STUCK';step.result=reason;}
   else if(count>=spec.liveContinuation.maxActions){reason='ACTION_LIMIT';step.result=reason;}
   else{if(decision.frontier)memory.commit(offer,decision.frontier.targetId,decision.frontier.focus);step.recordedAction=await pom.describeAction(decision.action,number);await pom.act(decision.action);count++;memory.executed(offer,decision.choice);visual.recordAction(decision.action);await page.waitForTimeout(300);const after=await pom.observe(false);step.after={url:page.url(),screen:after};await page.screenshot({path:join(runPath,'after-'+number+'.png')});step.result='OK';history=rememberObservation(history,screen,candidate.label,'画面: '+after.title);}
   await writeFile(join(runPath,'step-'+number+'.json'),JSON.stringify(step,null,2));
  }
 }catch(error){reason=boundary?'SAFETY_BOUNDARY':'LIVE_ERROR';result.error=safeRequestFailure(error);const message=error instanceof Error?error.message:'';if(['INITIAL_STATE_CHANGED','LIVE_TARGET_MISMATCH','LIVE_CANDIDATE_MISMATCH'].includes(message))result.error={code:message};}
 finally{await page.screenshot({path:join(runPath,'final.png')}).catch(()=>{});await context.tracing.stop({path:join(runPath,'trace.zip')}).catch(()=>{});await visual.close();await context.close();}
 Object.assign(result,{reason,actionCount:count,completionFrames:frames.snapshot()});await writeFile(join(runPath,'result.json'),JSON.stringify(result,null,2));runs.push(result);await writeFile(join(path,'results.json'),JSON.stringify(runs,null,2));console.log('['+runs.length+'/8] '+row.scene+' '+row.condition+': '+reason+', '+count+' actions');
}}finally{await browser.close();}
