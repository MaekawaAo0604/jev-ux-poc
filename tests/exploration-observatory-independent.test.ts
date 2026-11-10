import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,link,lstat} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {chromium} from 'playwright';
import {PNG} from 'pngjs';
import {sourceIdentity} from '../runner/virtual-beta-source.js';
import {buildExplorationViewer} from '../runner/exploration-viewer-data.js';
import {serveExplorationViewer} from '../runner/exploration-viewer.js';
import {createBetaPublicSite} from '../runner/beta-public-site.js';
import {publicPersonaSchedule} from '../runner/public-persona-comparison.js';
import type {PublicSitePage} from '../pages/PublicSitePage.js';

// Explicit opt-in: this evidence suite uses local ignored reports and the running viewer, never CI fixtures.
const enabled=process.env.JEV_OBSERVATORY_INDEPENDENT==='1';
const evidence=resolve('reports/exploration-observatory-2026-11-06/independent');
const sha=(v:Buffer|string)=>createHash('sha256').update(v).digest('hex');
const json=async(p:string)=>JSON.parse(await readFile(p,'utf8'));
const measurements:Record<string,unknown>={syntheticDisclaimer:'400 synthetic slots are load-test data; zero real model calls in this independent suite.'};
let frozen:any;
test.before(async()=>{if(!enabled)return;await mkdir(evidence,{recursive:true});const freeze=await json(resolve('reports/exploration-observatory-2026-11-06/freeze.json'));frozen={revision:freeze.revision,sourceHashes:freeze.sourceHashes,sourceHash:freeze.sourceHash};const now=await sourceIdentity();assert.deepEqual(now,frozen,'Source changed: independent verification must stop');measurements.before={sourceHash:now.sourceHash,revision:now.revision,files:Object.keys(now.sourceHashes).length};});
test.after(async()=>{if(!enabled)return;const now=await sourceIdentity();measurements.after={sourceHash:now.sourceHash,revision:now.revision,files:Object.keys(now.sourceHashes).length};measurements.finishedAtUTC=new Date().toISOString();await writeFile(join(evidence,'measurements-'+Date.now()+'.json'),JSON.stringify(measurements,null,2));await writeFile(join(evidence,'measurements.json'),JSON.stringify(measurements,null,2));assert.deepEqual(now,frozen,'Source changed while verification ran');});

test('independent: all explicitly indexed fictional raw trials retain every step, decision distribution, state and exact raw bytes',{skip:!enabled},async()=>{
 const root=await mkdtemp(join(evidence,'real37-viewer-'));await writeFile(join(root,'viewer-owner.json'),JSON.stringify({kind:'jev-exploration-viewer-v1'}));const catalog=await buildExplorationViewer({batches:[resolve('reports/persona-tasks-2026-11-06/live-r1'),resolve('reports/exploration-observatory-2026-11-06/mock-public')],out:root});
 let steps=0,prepared=0,attempted=0,received=0,terminal=0,corrected=0;const actions:Record<string,number>={};
 assert.equal(catalog.runs.length,37);assert.equal(catalog.runs.filter((r:any)=>r.mock===false).length,36);assert.equal(catalog.runs.filter((r:any)=>r.mock===true).length,1);
 for(const run of catalog.runs){
  assert.equal(run.status,'recorded');assert.ok(run.detailFile);const detail=await json(join(root,run.detailFile));
  const source=resolve(detail.provenance.sourceResult);assert.ok(['reports/persona-tasks-2026-11-06/live-r1/','reports/exploration-observatory-2026-11-06/mock-public/'].some(prefix=>relative(process.cwd(),source).replaceAll('\\','/').startsWith(prefix)),'Only explicit fictional source roots may be read');
  const bytes=await readFile(source),raw=JSON.parse(bytes.toString());assert.equal(sha(bytes),detail.provenance.rawSha256);assert.deepEqual(await readFile(join(root,detail.rawFile)),bytes);assert.equal(detail.steps.length,raw.steps.length);assert.deepEqual(detail.persona,raw.input.persona??null);assert.deepEqual(detail.config,raw.config);assert.equal(run.timing.modeledUserMs,raw.modeledUserMs??null);
  if(run.mock===true){assert.deepEqual(run.objective,{status:'UNVERIFIED',value:null});assert.equal(run.subjectiveDone,true);}
  for(let i=0;i<raw.steps.length;i++){
   const s=raw.steps[i],d=detail.steps[i];steps++;actions[s.action?.type??'none']=(actions[s.action?.type??'none']??0)+1;
   for(const [key,expected] of Object.entries({number:s.number,observationId:s.observationId??null,action:s.action??null,state:s.userState??null,native:s.visualHypotheses??null,assessment:s.deliberation??null,modelInput:s.modelInput??null,response:s.response??null,reason:s.reasonEvidence??null,timing:s.timing??null}))assert.deepEqual(d[key],expected,`${run.runId} step${i+1} ${key}`);
   for(const key of ['raw','filtered','normalized','modelChoice','selected','policy'])assert.deepEqual(d.selection[key],s.selection?.[key]??null);
   if(d.selection.modelChoice!==d.selection.selected)corrected++;
   for(const image of d.images){if(image.delivery==='prepared')prepared++;if(image.delivery==='attempted')attempted++;if(image.delivery==='response-received')received++;if(image.file)assert.equal(sha(await readFile(join(root,image.file))),image.sha256);}
   if(d.after.kind==='terminal-audit'){terminal++;assert.equal(i,raw.steps.length-1);assert.equal(d.after.image.delivery,'unavailable');}
   if(d.after.kind==='next-delivered')assert.equal(d.after.image.delivery,'response-received');
  }
  assert.equal(sha(await readFile(source)),sha(bytes),'Raw source was not rewritten');
 }
 measurements.realCatalog={runs:catalog.runs.length,modelTrials:36,mockTrials:1,steps,actions,prepared,attempted,received,terminal,modelVsActualDifferences:corrected};
});

test('independent: actual captured four-page GitHub Docs UI operates offline and starts with fresh identical input in separate contexts',{skip:!enabled},async()=>{
 const spec=await json(resolve('reports/exploration-observatory-2026-11-06/site-capture/site-spec.json'));
 const original=await readFile(spec.harPath);assert.equal(sha(original),spec.harSha256);
 const browser=await chromium.launch({headless:true}),rounds:any[]=[];
 try{for(let round=0;round<2;round++){
  const context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block',acceptDownloads:false,offline:true}),page=await context.newPage();
  try{
   assert.deepEqual(await context.cookies(),[]);const controller=await createBetaPublicSite(page,spec);await controller.prepare();
   const initial=await page.screenshot({animations:'disabled'});await writeFile(join(evidence,`real-site-initial-${round}.png`),initial);
   const screens=[];
   for(const url of spec.allowedDocuments){if(page.url()!==url)await (controller.adapter as PublicSitePage).navigateTo(url);const screen=await controller.adapter.observe(false);controller.assertReady();const text=await page.locator('main').innerText();assert.ok(text.length>100);assert.ok(screen.elements.length>0);screens.push({url,title:await page.title(),controls:screen.elements.length,available:screen.elements.filter((e:any)=>e.available!==false).length});}
   assert.equal(controller.evidence().networkMode,'frozen-har-no-fallback');assert.equal(controller.evidence().events.filter((e:any)=>e.kind==='snapshot-error').length,0);
   rounds.push({initialSha256:sha(initial),screens,events:controller.evidence().events});
  }finally{await context.close();}
 }}finally{await browser.close();}
 assert.equal(rounds[0].initialSha256,rounds[1].initialSha256);assert.deepEqual(rounds[0].screens,rounds[1].screens);assert.equal(sha(await readFile(spec.harPath)),sha(original));measurements.realSnapshot={offline:true,rounds};
});

test('independent: 400 synthetic slots retain denominators and load only selected details in real Chromium',{skip:!enabled},async()=>{
 const root=await mkdtemp(join(evidence,'synthetic-400-')),batch=join(root,'batch'),out=join(root,'viewer');await mkdir(batch);
 const png=PNG.sync.write(new PNG({width:2,height:2})),hash=sha(png),schedule=publicPersonaSchedule(100),records:any[]=[];
 for(let i=0;i<390;i++){
  const slot=schedule[i],dir=join(batch,slot.id),run=join(dir,'exploration');await mkdir(run,{recursive:true});await writeFile(join(run,'input.png'),png);
  const sequence=['look','reread','wait','scroll','back','click','done','abandon'];
  const raw:any={schemaVersion:1,runId:`SYNTHETIC-${i}`,condition:'synthetic',code:{sourceHash:'synthetic-common'},config:{id:'synthetic-common'},input:{...(slot.actor==='baseline'?{}:{persona:{id:slot.actor,name:slot.actor}}),charter:{id:'synthetic-only',goal:'SYNTHETIC LOAD TEST ONLY',targetWebsite:'synthetic:offline'}},publicSite:{spec:{harSha256:'synthetic-common'},initialProductImage:{sha256:hash}},objectiveAssessment:{status:'UNVERIFIED',value:null},perceivedDone:null,termination:i>=360?'API_ERROR':'DECISION_LIMIT',decisions:sequence.length,uiActions:3,looks:1,apiCalls:1,apiMs:1,uiMs:2,modeledUserMs:null,...(i<380?{validForComparison:i<360}:{}),steps:sequence.map((action,k)=>({number:k+1,observationId:`synthetic-${i}-${k}`,assetFiles:{current:{file:'input.png',sha256:hash}},...(k===0?{response:{answers:{nextAction:{choice:'reread'}},request:{attempts:1}}}:{}),modelInput:{synthetic:true},action:{type:action},selection:{raw:{look:4,reread:2},filtered:{look:4,reread:2},normalized:{look:2/3,reread:1/3},modelChoice:'reread',selected:'look',policy:'sample'},reasonEvidence:{synthetic:true},timing:{apiMs:k===0?1:null,uiMs:2,modeledUserMs:null}}))};
  await writeFile(join(run,'result.json'),JSON.stringify(raw));records.push({...slot,dir,resultPath:join(run,'result.json'),status:'RESULT'});
 }
 await writeFile(join(batch,'manifest.json'),JSON.stringify({mock:true,status:'RUNNING',schedule,records}));const started=performance.now(),catalog=await buildExplorationViewer({batches:[batch],out}),buildMs=performance.now()-started;
 assert.equal(catalog.runs.length,400);assert.equal(catalog.runs.filter(r=>r.validity==='valid').length,360);assert.equal(catalog.runs.filter(r=>r.validity==='invalid').length,20);assert.equal(catalog.runs.filter(r=>r.validity==='unknown').length,20);assert.equal(catalog.runs.filter(r=>r.status==='pending').length,10);assert.equal(new Set(catalog.runs.filter(r=>r.status==='recorded').map(r=>r.group)).size,1);
 const server=await serveExplorationViewer(out,0),browser=await chromium.launch({headless:true});
 try{const page=await browser.newPage({viewport:{width:1440,height:1000}}),requests:string[]=[],errors:string[]=[];page.on('request',r=>requests.push(r.url()));page.on('pageerror',e=>errors.push(e.message));
  const start=performance.now();await page.goto(server.url);await page.locator('#step-title').waitFor();const initialMs=performance.now()-start;
  const details=()=>requests.filter(r=>/\/runs\/[a-f0-9]{64}\.json$/.test(r));assert.equal(details().length,1,'390 details must not be eagerly loaded');assert.equal(await page.locator('#run-list button').count(),390);assert.match(await page.locator('#aggregate').innerText(),/集計分母） 360/);assert.match(await page.locator('#aggregate').innerText(),/無効 20/);assert.match(await page.locator('#aggregate').innerText(),/妥当性不明 10/);
  assert.equal(await page.locator('#timeline button').count(),8);assert.match(await page.locator('#choice').innerText(),/reread/);assert.match(await page.locator('#choice').innerText(),/look/);
  await page.getByRole('button',{name:'次のステップ'}).click();assert.match(await page.locator('#evidence').innerText(),/準備済み・未送信/);assert.doesNotMatch(await page.locator('#evidence').innerText(),/API 応答受信/);
  await page.getByLabel('比較グループ').selectOption('');assert.equal(await page.locator('#run-list button').count(),400);assert.match(await page.locator('#aggregate').innerText(),/合算しません/);
  await page.getByLabel('Persona').selectOption('C');assert.equal(await page.locator('#run-list button').count(),100);await page.getByLabel('Persona').selectOption('');
  const second=catalog.runs.find(r=>r.status==='recorded'&&r.id!==catalog.runs[0].id)!;const secondStart=performance.now();await page.locator('#run-list button').filter({has:page.locator('strong').filter({hasText:new RegExp(' / '+second.runId+'$')})}).click();await page.waitForFunction(id=>document.querySelector('#run-summary')?.textContent?.includes(id),second.runId);const secondMs=performance.now()-secondStart;assert.equal(new Set(details()).size,2);
  await page.screenshot({path:join(evidence,'synthetic-400-desktop.png'),fullPage:true});await page.setViewportSize({width:375,height:812});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:join(evidence,'synthetic-400-mobile.png'),fullPage:true});assert.deepEqual(errors,[]);
  measurements.synthetic400={label:'SYNTHETIC; zero model executions',planned:400,recorded:390,valid:360,invalid:20,unknownRecorded:10,pending:10,normalizedSteps:390*8,buildMs,initialMs,secondSelectionMs:secondMs,initialDetails:1,uniqueSelectedDetails:new Set(details()).size,catalogBytes:(await lstat(join(out,'catalog.json'))).size,allRunsListed:400,personaCListed:100,mobileHorizontalOverflow:false,errors};
 }finally{await browser.close();await server.close();}
});

test('independent: server rejects hardlinked leaves and output writer rejects hardlinked destinations without mutating targets',{skip:!enabled},async()=>{
 const root=await mkdtemp(join(evidence,'hardlink-')),out=join(root,'server');await mkdir(out);await writeFile(join(out,'viewer-owner.json'),JSON.stringify({kind:'jev-exploration-viewer-v1'}));const original=join(root,'original.json');await writeFile(original,'{"safe":"preserve-original"}');await link(original,join(out,'catalog.json'));assert.ok((await lstat(original)).nlink>1);const server=await serveExplorationViewer(out,0);
 try{assert.equal((await fetch(server.url+'catalog.json')).status,404);assert.equal((await fetch(server.url,{method:'HEAD'})).status,200);assert.equal((await fetch(server.url,{method:'PUT'})).status,405);assert.equal((await fetch(server.url,{headers:{origin:'https://evil.example'}})).status,403);}finally{await server.close();}
 const batch=join(root,'batch');await mkdir(batch);await writeFile(join(batch,'manifest.json'),JSON.stringify({records:[]}));await assert.rejects(()=>buildExplorationViewer({batches:[batch],out}),/OUTPUT_ESCAPE/);assert.equal(await readFile(original,'utf8'),'{"safe":"preserve-original"}');measurements.hardlinks={serverRejected:true,builderRejected:true,originalUnchanged:true};
});




test('independent: compact normal cohort manifest preserves all four personas in one mock group and deployed localhost viewer remains operable',{skip:!enabled},async()=>{
 const source=resolve('reports/exploration-observatory-2026-11-06/mock-cohort-r1'),before=sha(await readFile(join(source,'manifest.json'))),root=await mkdtemp(join(evidence,'compact-viewer-'));await writeFile(join(root,'viewer-owner.json'),JSON.stringify({kind:'jev-exploration-viewer-v1'}));const normalized=await buildExplorationViewer({batches:[source],out:root});
 assert.equal(normalized.runs.length,4);assert.equal(new Set(normalized.runs.map(r=>r.group)).size,1);assert.ok(normalized.runs.every(r=>r.mock===true&&r.validity==='valid'&&r.objective.status==='UNVERIFIED'&&r.objective.value===null));assert.deepEqual(normalized.runs.map(r=>r.personaId).sort(),['A','B','C','baseline']);assert.equal(sha(await readFile(join(source,'manifest.json'))),before);
 const base='http://127.0.0.1:4175/',live=await(await fetch(base+'catalog.json')).json() as any,browser=await chromium.launch({headless:true});assert.ok(live.runs.length>=37);const errors:string[]=[];
 try{const page=await browser.newPage({viewport:{width:1440,height:1080}});page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.locator('#step-title').waitFor();await page.screenshot({path:join(evidence,'real-viewer-desktop.png'),fullPage:true});
  await page.getByLabel('比較グループ').selectOption('');assert.equal(await page.locator('#run-list button').count(),live.runs.length);assert.match(await page.locator('#aggregate').innerText(),/合算しません/);
  const publicRun=live.runs.find((r:any)=>r.mock===true&&r.site.startsWith('https://docs.github.com/'));assert.ok(publicRun);await page.getByLabel('比較グループ').selectOption(publicRun.group);await page.locator('#run-list button').filter({has:page.locator('strong').filter({hasText:new RegExp(' / '+publicRun.runId+'$')})}).click();await page.waitForFunction(()=>document.querySelector('#run-summary')?.textContent?.includes('UNVERIFIED'));assert.match(await page.locator('#run-summary').innerText(),/モック/);assert.equal(await page.locator('#timeline button').count(),publicRun.decisions);await page.screenshot({path:join(evidence,'real-viewer-public-mock.png'),fullPage:true});
  await page.setViewportSize({width:375,height:812});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:join(evidence,'real-viewer-mobile.png'),fullPage:true});assert.deepEqual(errors,[]);
  measurements.compactCohort={runs:4,groups:1,mock:true,objective:{status:'UNVERIFIED',value:null},rawManifestUnchanged:true};measurements.deployedViewer={url:base,runs:live.runs.length,allRunsVisible:true,publicObjectiveUnknown:true,mobileHorizontalOverflow:false,browserErrors:errors};
 }finally{await browser.close();}
});





test('independent: missing unknown-size successful HTML body must fail snapshot validation before any observation',{skip:!enabled},async()=>{
 const dir=await mkdtemp(join(evidence,'missing-body-')),url='https://fixture.example.test/docs',cases:any[]=[],browser=await chromium.launch({headless:true});
 try{for(const size of [-1,0])for(const variant of ['absent','null','number']){
  const harPath=join(dir,`missing-${size}-${variant}.har`),request={method:'GET',url,httpVersion:'HTTP/1.1',headers:[],queryString:[],cookies:[],headersSize:-1,bodySize:0};
  const content={size,mimeType:'text/html',...(variant==='absent'?{}:{text:variant==='null'?null:123})},response={status:200,statusText:'OK',httpVersion:'HTTP/1.1',headers:[{name:'Content-Type',value:'text/html'}],cookies:[],content,redirectURL:'',headersSize:-1,bodySize:-1};
  const bytes=JSON.stringify({log:{version:'1.2',creator:{name:'independent synthetic regression',version:'2'},entries:[{startedDateTime:'2026-11-06T00:00:00Z',time:1,request,response,cache:{},timings:{send:0,wait:1,receive:0}}]}});await writeFile(harPath,bytes);
  const context=await browser.newContext({offline:true,serviceWorkers:'block'});try{const page=await context.newPage(),controller=await createBetaPublicSite(page,{schemaVersion:1,id:'missing-unknown-body',startURL:url,allowedDocuments:[url],harPath,harSha256:sha(bytes),capturedAtUTC:'2026-11-06T00:00:00Z',sourceDescription:'Synthetic missing-body regression; no external requests'});
   let error:unknown;try{await controller.prepare();}catch(e){error=e;}
   const observed={size,variant,error:error instanceof Error?error.message:null,url:page.url(),html:await page.content(),events:controller.evidence().events};cases.push(observed);await writeFile(join(evidence,'missing-body-reproduction.json'),JSON.stringify({sourceHash:frozen.sourceHash,cases},null,2));
   assert.match(String(error),/SITE_SNAPSHOT_SPEC_INVALID/,'An unembedded HTML response must never become a normal blank model input');assert.equal(page.url(),'about:blank');assert.equal(observed.events.some(e=>e.code==='HAR_VERIFIED'),false);
  }finally{await context.close();}
 }}finally{await browser.close();}
 measurements.missingBodyCases={tested:cases.length,sizes:[-1,0],variants:['absent','null','number'],allRejectedBeforeNavigation:true};
});
