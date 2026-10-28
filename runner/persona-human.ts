import {chromium} from 'playwright';
import {createServer} from 'vite';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {sourceIdentity} from './virtual-beta-source.js';
import {semanticQuery,semanticDefinition} from '../app/semantic-fixture.js';
import type {BetaResult} from './virtual-beta-core.js';
import type {SemanticHumanExpectation} from '../jev/virtual-beta/semantic-types.js';
import {auditHumanEvents,validateHumanControl} from './persona-human-validation.js';
import {parseCharter} from '../jev/persona.js';
import {goals} from '../tests/goals.js';
import {AutoPage} from '../pages/AutoPage.js';
import {fakeDecide} from '../jev/fake.js';
import {candidatesFor} from '../jev/types.js';
const args=process.argv.slice(2),smoke=args.includes('--smoke');
const option=(key:string,fallback:string)=>{const i=args.indexOf(key);if(i<0)return fallback;if(!args[i+1]||args[i+1].startsWith('--'))throw new Error(`Missing ${key}`);return args[i+1];};
for(let i=0;i<args.length;i++){if(args[i]==='--smoke')continue;if(!['--charter','--out','--compare-to'].includes(args[i]))throw new Error(`Unknown option ${args[i]}`);i++;}
const compareTo=option('--compare-to',''),reference:BetaResult|undefined=compareTo?JSON.parse(await readFile(join(resolve(compareTo),'result.json'),'utf8')):undefined;
const referenceManifest=compareTo?JSON.parse(await readFile(join(dirname(resolve(compareTo)),'manifest.json'),'utf8')):undefined;
if(compareTo&&!reference?.semantic)throw new Error('Comparison target must be a recorded semantic trial');
const semanticFixture=reference?.semantic?.trial.fixture,code=semanticFixture?await sourceIdentity():undefined;
const charset=semanticFixture&&!args.includes('--charter')?referenceManifest.charter:JSON.parse(await readFile(option('--charter','experiments/persona/charter.json'),'utf8'));
const charter=parseCharter(charset);
const semanticExpected:SemanticHumanExpectation|undefined=reference?.semantic&&reference.code?{fixture:reference.semantic.trial.fixture,definitionHash:reference.semantic.definitionHash,sourceHash:reference.code.sourceHash,initialProductImageSha256:reference.semantic.initialProductImage.sha256}:undefined;
if(semanticFixture&&!semanticExpected)throw new Error('Comparison target missing semantic audit identity');
if(charter.oracle!=='notifications')throw new Error('This manual recorder currently supports the notifications charter only.');
const root=resolve(option('--out',join('reports','human-'+new Date().toISOString().replaceAll(':','-'))));await mkdir(dirname(root),{recursive:true});await mkdir(root);
const token=randomUUID(),controlPath='/__jev_human/'+token;
const escape=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
let finish:(v:{outcome:string;selfAttested:boolean})=>void;
const finished=new Promise<{outcome:string;selfAttested:boolean}>(r=>finish=r);let ended=false;
const server=await createServer({server:{host:'127.0.0.1',port:0},logLevel:'error',plugins:[{name:'human-recorder-control',configureServer(server){server.middlewares.use(async(req,res,next)=>{
 if(req.url===controlPath&&req.method==='GET'){
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!doctype html><html lang="ja"><meta charset="utf-8"><title>Jev 人間対照の記録</title><style>body{font:18px/1.8 system-ui;max-width:780px;margin:50px auto;padding:20px}button{padding:12px;margin:12px}</style><h1>手動試行の記録</h1><p>${escape(charter.goal)}</p><p>別タブの検証画面を、説明やリンクを見ながら自由に操作してください。最大${charter.maxActions}操作を目安にします。正解の経路は提示していません。終了したらこのタブへ戻って結果を記録してください。</p><p>画面サイズ1280×900、初期状態はデモアカウントのホームです。タブを切り替える操作はプロダクトの操作数に含めません。</p><label><input id="attest" type="checkbox">人間本人として操作したことを申告する</label><p><button data-result="achieved">達成したと思う</button><button data-result="stuck">未達で終了</button><button data-result="aborted">中止</button></p><p id="status"></p><script>document.querySelectorAll('button').forEach(b=>b.onclick=async()=>{const selfAttested=document.querySelector('#attest').checked;if(!selfAttested&&${!smoke}){document.querySelector('#status').textContent='記録するには操作者の申告を選んでください。中止はブラウザーを閉じても記録できます。';return;}const r=await fetch(location.pathname+'/finish',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({outcome:b.dataset.result,selfAttested})});document.querySelector('#status').textContent=r.ok?'記録を保存します。':'記録に失敗しました。';});</script></html>`);return;
 }
 if(req.url===controlPath+'/finish'&&req.method==='POST'){
  if(req.headers.origin!==`http://${req.headers.host}`){res.statusCode=403;res.end();return;}
  let bytes='';for await(const chunk of req){bytes+=chunk;if(bytes.length>2000){res.statusCode=413;res.end();return;}}
  try{const value=JSON.parse(bytes);if(!['achieved','stuck','aborted'].includes(value.outcome)||typeof value.selfAttested!=='boolean')throw new Error();if(!value.selfAttested&&!smoke)throw new Error();if(!ended){ended=true;finish(value);}res.end('ok');}catch{res.statusCode=400;res.end();}return;
 }
 next();
 });}}]});
await server.listen();const base=server.resolvedUrls!.local[0].replace(/\/$/,''),origin=new URL(base).origin,variant=charter.targetWebsite==='local:bad'?'bad':'good';
let browser;const events:any[]=[],boundaries:string[]=[];let pending=Promise.resolve();
try{
 browser=await chromium.launch({headless:smoke,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
 const context=await browser.newContext({viewport:{width:1280,height:900},locale:'ja-JP',timezoneId:'Asia/Tokyo',acceptDownloads:false,serviceWorkers:'block'});
 await context.route('**/*',route=>{const request=route.request(),u=new URL(request.url()),control=u.pathname===controlPath||u.pathname===controlPath+'/finish';if(u.hostname==='fonts.googleapis.com'&&request.resourceType()==='stylesheet')return route.fulfill({contentType:'text/css',body:''});if(u.origin!==origin||(!control&&!['GET','HEAD'].includes(request.method()))||(request.isNavigationRequest()&&!control&&u.pathname!==`/${variant}/`)){boundaries.push(u.origin===origin?u.pathname:'external-origin');return route.abort();}return route.continue();});
 await context.tracing.start({screenshots:true,snapshots:true,sources:false});
 const task=await context.newPage(),pom=new AutoPage(task,false,true),recordingErrors:string[]=[];
 task.on('pageerror',error=>recordingErrors.push(error.message));
 await writeFile(join(root,'events.jsonl'),'');
 await task.exposeBinding('__jevHumanEvent',(_source,event)=>{
  const step=events.length+1;events.push({step,...event,actor:smoke?'automation':'unverified-human',recordedAt:new Date().toISOString()});
  pending=pending.then(async()=>{const path=`event-${String(step).padStart(3,'0')}.png`;try{await task.screenshot({path:join(root,path)});Object.assign(events[step-1],{afterScreenshot:path,afterScreen:await pom.observe(false),captureTiming:'asynchronous after event; use Playwright trace for exact before/after ordering'});}catch{events[step-1].captureError=true;}await writeFile(join(root,'events.jsonl'),events.map(e=>JSON.stringify(e)).join('\n')+'\n');});
 });
 await task.addInitScript(String.raw`{
  const policy=${JSON.stringify(charter.prohibitedActions)};
  function send(action,target,blockedReason){return window.__jevHumanEvent({action,target,blockedReason,urlBefore:location.href,screenBefore:document.querySelector('h1')?.textContent??'',viewport:{width:innerWidth,height:innerHeight,top:scrollY},eventAt:new Date().toISOString()});}
  document.addEventListener('click',event=>{if(!event.isTrusted)return;const target=event.target?.closest('a,button');if(!target)return;const label=target.innerText.trim(),text=label.split('\n')[0].trim();const blocked=policy.actionTypes.includes('click')||policy.controlTexts.includes(text)||policy.downloads&&/^\d{4}-\d{2} の請求書をPDFで保存$/.test(text);if(blocked){event.preventDefault();event.stopImmediatePropagation();}void send(blocked?'blocked-click':'click',label,blocked?'CHARTER_BOUNDARY':undefined);},true);
  let timer;addEventListener('scroll',()=>{clearTimeout(timer);timer=setTimeout(()=>void send('scroll'),300);});
  window.__jevHumanRecorderReady=true;
 }`);
 await task.goto(`${base}/${variant}/${semanticFixture?semanticQuery(semanticFixture):''}`,{waitUntil:'networkidle'});const recorderReady=await task.evaluate(()=>Boolean((window as any).__jevHumanRecorderReady));
 if(!recorderReady)throw new Error('Human recorder initialization failed');
 const initial=await pom.observe(false);await task.screenshot({path:join(root,'initial.png')});
 const panel=await context.newPage();await panel.goto(base+controlPath);await task.bringToFront();
 console.log(JSON.stringify({status:'READY',actor:smoke?'AUTOMATION_SMOKE_NOT_HUMAN':'AWAITING_HUMAN',goal:charter.goal,taskURL:task.url(),finishTabURL:base+controlPath,output:root}));
 task.on('close',()=>{if(!ended){ended=true;finish({outcome:'aborted',selfAttested:false});}});
 if(smoke){if(semanticFixture){const wrong=semanticFixture.mapping==='A'?'B':'A';await task.getByRole('button',{name:'設定'+wrong+'を適用',exact:true}).click();await task.getByRole('button',{name:'設定'+semanticFixture.mapping+'を適用',exact:true}).click();}else for(let n=0;n<charter.maxActions;n++){const screen=await pom.observe(false),candidates=candidatesFor(screen,false),d=await fakeDecide({goal:charter.goal,currentDate:charter.initialState.currentDate,screen,history:[]},candidates);if(['done','stuck'].includes(d.action.type))break;await pom.act(d.action);}await panel.evaluate(async()=>{await fetch(location.pathname+'/finish',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({outcome:'achieved',selfAttested:false})});});}
 const reported=await finished;await pending;
 let objectiveSuccess:boolean|null=null;try{objectiveSuccess=await goals.notifications.check(task);await task.screenshot({path:join(root,'final.png')});}catch{}
 const clicks=events.filter(e=>e.action==='click'),constraintAudit=auditHumanEvents(events,charter);
 const semanticMetadata=semanticFixture?{fixture:semanticFixture,definitionHash:createHash('sha256').update(JSON.stringify(semanticDefinition(semanticFixture))).digest('hex'),sourceHash:code!.sourceHash,codeRevision:code!.revision,initialProductImageSha256:createHash('sha256').update(await readFile(join(root,'initial.png'))).digest('hex')}:undefined;
 const humanResult={...(semanticMetadata?{semantic:semanticMetadata}:{}),schemaVersion:1,recorderReady,recordingErrors,actor:smoke?'automation':'human',selfAttested:!smoke&&reported.selfAttested,reportedOutcome:reported.outcome,objectiveSuccess,goal:charter.goal,charter,viewport:{width:1280,height:900},locale:'ja-JP',timezoneId:'Asia/Tokyo',initial,events,clickCount:clicks.length,scrollEventCount:events.filter(e=>e.action==='scroll').length,hardConstraintViolations:constraintAudit.hardConstraintViolations,constraintAudit,observationMode:'native-browser-without-number-markers',withinClickBudget:clicks.length<=charter.maxActions,boundaries,interpretation:smoke?'自動の配線テスト。人間対照には使わない。':'本人申告の手動試行。スクロールは300msのデバウンス記録で、Jevの1操作と等価ではない。ブラウザーの戻る操作はclick列に含まれない。生のtraceと併せて解釈する。'};
 if(smoke&&(events.filter(e=>e.action==='click').length!==(semanticFixture?2:3)||recordingErrors.length))throw new Error('Recorder smoke must capture the three clicks without script errors');
 const saved={...humanResult,...(semanticExpected?{comparisonAudit:validateHumanControl(humanResult,{charter,viewport:{width:1280,height:900},locale:'ja-JP',timezoneId:'Asia/Tokyo',semantic:semanticExpected}),comparisonTarget:resolve(compareTo)}:{})};
 await writeFile(join(root,'human-result.json'),JSON.stringify(saved,null,2));await context.tracing.stop({path:join(root,'trace.zip')});await context.close();console.log(JSON.stringify({recorded:root,actor:humanResult.actor,objectiveSuccess,selfAttested:humanResult.selfAttested}));
}finally{await browser?.close();await server.close();}
