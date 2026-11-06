import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer, type Server} from 'node:http';
import {chromium, type Browser, type Page} from 'playwright';
import type {ViewerRun, ViewerDetail, ViewerStep} from '../runner/exploration-viewer-contracts';

// A broken selection, unsafe URL, discarded non-UI step, or pooled denominator must fail these browser tests.
const idA='a'.repeat(64), idB='b'.repeat(64), sha='c'.repeat(64);
function run(id:string, extra:Partial<ViewerRun>={}):ViewerRun{return {id,batchId:'batch',runId:id===idA?'run-a':'run-b',personaId:'p1',personaName:'慎重',replicate:1,site:'Docs',task:'調べる',goal:'設定を調べる',group:'same-config',status:'recorded',validity:'valid',termination:'done',endClass:'done',subjectiveDone:true,objective:{status:'UNVERIFIED',value:null},decisions:2,uiActions:0,looks:1,requests:2,firstChoice:'read',detailFile:`runs/${id}.json`,sourceHash:'source',configHash:'config',timing:{apiMs:20,uiMs:null,modeledUserMs:400},errors:[],...extra};}
function step(number:number, extra:Partial<ViewerStep>={}):ViewerStep{return {number,observationId:'obs-'+number,url:'https://docs.example.test/',images:[{file:`assets/${sha}.png`,sha256:sha,stage:'native',delivery:'prepared'}],auditImage:{file:`assets/${sha}.png`,sha256:sha,stage:'audit',delivery:'unavailable'},after:{kind:'terminal-audit',image:{file:`assets/${sha}.png`,sha256:sha,stage:'terminal-audit',delivery:'unavailable'}},action:{type:number===1?'look':'done'},controlText:null,outcome:'observed',reason:'自己申告の理由',selection:{modelChoice:'read',selected:'look',raw:{read:3,look:1},filtered:{read:3,look:1},normalized:{read:.75,look:.25},policy:'sample',adjustments:null},state:{known:false},native:{description:'native'},assessment:{label:'assessment'},modelInput:{observation:'obs'},questions:null,response:{choice:'read'},error:null,timing:{apiMs:20},...extra};}
function detail(r:ViewerRun, extra:Partial<ViewerDetail>={}):ViewerDetail{return {schemaVersion:1,run:r,persona:{name:r.personaName},charter:{goal:r.goal},config:{seed:1},provenance:{source:'fixture'},steps:[step(1),step(2)],terminalImage:null,traceFile:`traces/${r.id}.zip`,rawFile:`raw/${r.id}.json`,...extra};}
let server:Server,browser:Browser,base:string,requested:string[],currentRuns:ViewerRun[],details:Record<string,unknown>;
async function open(hash=''):Promise<Page>{const page=await browser.newPage();await page.clock.install();await page.goto(base+hash);await page.getByRole('button',{name:/run-a/}).waitFor();return page;}
test.before(async()=>{
 const modulePath='../runner/exploration-viewer-ui';
 let ui:any;try{ui=await import(modulePath);}catch{}
 assert.equal(typeof ui?.viewerHTML,'function','viewerHTML must serve an operable viewer');
 requested=[];currentRuns=[run(idA),run(idB,{personaId:'p2',personaName:'探索',endClass:'infrastructure',termination:'network',validity:'invalid',errors:['network unavailable']})];details={[idA]:detail(currentRuns[0]),[idB]:detail(currentRuns[1])};
 server=createServer((req,res)=>{const path=(req.url??'/').slice(1);requested.push(path);res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'");
  if(path===''||path.startsWith('index.html')){res.setHeader('Content-Type','text/html');res.end(ui.viewerHTML());}
  else if(path==='viewer.css'){res.setHeader('Content-Type','text/css');res.end(ui.viewerCSS);}
  else if(path==='viewer.js'){res.setHeader('Content-Type','text/javascript');res.end(ui.viewerJS);}
  else if(path==='catalog.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({schemaVersion:1,generatedAtUTC:'2026-11-06',runs:currentRuns,batches:[],issues:[]}));}
  else if(path.startsWith('runs/')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(details[path.slice(5,-5)]??null));}
  else if(path.startsWith('assets/')){res.setHeader('Content-Type','image/png');res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1n0AAAAASUVORK5CYII=','base64'));}
  else{res.statusCode=404;res.end();}
 });await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${(server.address() as any).port}/`;
 browser=await chromium.launch({headless:true});
});
test.after(async()=>{await browser?.close();await new Promise<void>(resolve=>server?server.close(()=>resolve()):resolve());});

test('loads details lazily, filters trials, and keeps infrastructure separate from goal outcome',async()=>{
 const page=await open();try{
  assert.equal(requested.filter(p=>p===`runs/${idB}.json`).length,0);
  await page.getByRole('button',{name:/run-a/}).click();await page.locator('#step-title').waitFor();
  assert.match(await page.locator('#run-summary').innerText(),/UNVERIFIED/);
  assert.match(await page.locator('#aggregate').innerText(),/有効.*1/);
  await page.getByLabel('Persona').selectOption('p2');
  assert.equal(await page.locator('#run-list button').count(),1);
  await page.getByRole('button',{name:/run-b/}).click();await page.waitForFunction(()=>document.querySelector('#run-summary')?.textContent?.includes('network unavailable'));
  assert.match(await page.locator('#run-summary').innerText(),/infrastructure/);
  await page.getByLabel('検索').fill('no-match');assert.equal(await page.locator('#run-list button').count(),0);
 }finally{await page.close();}
});
test('retains look/done steps, keyboard deep links and explicit prepared versus terminal audit evidence',async()=>{
 const page=await open(`#run=${idA}&step=1`);try{
  await page.locator('#step-title').waitFor();assert.match(await page.locator('#step-title').innerText(),/look/);
  assert.match(await page.locator('#evidence').innerText(),/準備済み.*未送信/);
  assert.match(await page.locator('#after-evidence').innerText(),/終了時監査/);
  assert.doesNotMatch(await page.locator('#after-evidence').innerText(),/モデル次入力/);
  await page.getByRole('button',{name:'次のステップ'}).focus();await page.keyboard.press('ArrowRight');
  assert.match(await page.locator('#step-title').innerText(),/done/);assert.match(page.url(),/step=2/);
  await page.keyboard.press('ArrowLeft');assert.match(await page.locator('#step-title').innerText(),/look/);
  assert.match(await page.locator('#choice').innerText(),/read/);assert.match(await page.locator('#choice').innerText(),/look/);
  await page.getByText('技術詳細',{exact:true}).click();assert.match(await page.locator('#technical').innerText(),/0.75/);
  assert.equal(await page.getByRole('link',{name:'Raw JSON'}).getAttribute('href'),`raw/${idA}.json`);
 }finally{await page.close();}
});
test('does not pool incompatible groups or count missing, invalid and unobserved choices as trials',async()=>{
 const saved=currentRuns;currentRuns=[run(idA),run(idB,{firstChoice:'click',group:'different-config'}),run('d'.repeat(64),{status:'missing',detailFile:null}),run('e'.repeat(64),{validity:'invalid',firstChoice:'click'}),run('f'.repeat(64),{firstChoice:null})];
 const page=await open();try{
  const text=await page.locator('#aggregate').innerText();assert.match(text,/read/);assert.doesNotMatch(text,/click/);assert.match(text,/欠損.*1/);assert.match(text,/無効.*1/);assert.match(text,/初手不明.*1/);
  await page.getByLabel('比較グループ').selectOption('different-config');assert.match(await page.locator('#aggregate').innerText(),/click/);assert.doesNotMatch(await page.locator('#aggregate').innerText(),/read/);
 }finally{currentRuns=saved;await page.close();}
});
test('renders malformed and hostile data as text and rejects external detail, asset and raw URLs',async()=>{
 const saved=currentRuns,old=details[idA];const attack='<img src=x onerror="window.pwned=1">';
 currentRuns=[run(idA,{personaName:attack}),run(idB,{detailFile:'https://evil.example/runs/a.json'})];
 details[idA]=detail(currentRuns[0],{steps:[step(1,{reason:attack,images:[{file:'https://evil.example/a.png',sha256:null,stage:'native',delivery:'prepared'}],selection:null as any,state:{html:attack},after:null as any})],rawFile:'javascript:alert(1)',traceFile:'//evil.example/trace.zip'});
 const page=await open(`#run=${idA}&step=1`);const external:string[]=[];page.on('request',r=>{if(!r.url().startsWith(base))external.push(r.url());});try{
  await page.locator('#step-title').waitFor();assert.equal(await page.evaluate(()=>(window as any).pwned),undefined);
  assert.match(await page.locator('#reason').innerText(),/onerror/);assert.match(await page.locator('#choice').innerText(),/不明/);
  assert.equal(await page.locator('img[src^="http"]').count(),0);assert.equal(await page.getByRole('link',{name:'Raw JSON'}).count(),0);
  await page.getByRole('button',{name:/run-b/}).click();await page.waitForFunction(()=>document.querySelector('#detail-status')?.textContent?.includes('安全な詳細ファイル'));
  assert.deepEqual(external,[]);
 }finally{currentRuns=saved;details[idA]=old;await page.close();}
});
test('polls pending catalog without resetting current run or step and works at narrow width',async()=>{
 const saved=currentRuns;currentRuns=[run(idA),run(idB,{status:'pending',validity:'unknown'})];
 const page=await open(`#run=${idA}&step=2`);try{
  await page.locator('#step-title').waitFor();
  currentRuns=[run(idA),run(idB,{status:'recorded'})];await page.clock.fastForward(10010);
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('#run-list button')).some(e=>e.textContent?.includes('run-b')&&e.textContent?.includes('recorded')));
  assert.match(await page.locator('#step-title').innerText(),/done/);assert.match(page.url(),/step=2/);
  await page.setViewportSize({width:375,height:800});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
 }finally{currentRuns=saved;await page.close();}
});

test('shows model kind and API delivery evidence separately, including failed non-UI stages',async()=>{
 const saved=currentRuns,old=details[idA];currentRuns=[run(idA,{mock:false}),run(idB,{mock:true})];details[idA]=detail(currentRuns[0],{steps:[step(1,{images:[{file:`assets/${sha}.png`,sha256:sha,stage:'action',delivery:'attempted'},{file:`assets/${sha}.png`,sha256:sha,stage:'assessment',delivery:'response-received'}],error:'request timeout',action:{type:'reread'}})]});
 const page=await open(`#run=${idA}&step=1`);try{
  await page.locator('#step-title').waitFor();assert.match(await page.locator('#run-summary').innerText(),/実モデル/);
  assert.match(await page.locator('#evidence').innerText(),/送信を試行/);assert.match(await page.locator('#evidence').innerText(),/API 応答受信/);assert.match(await page.locator('#outcome').innerText(),/request timeout/);assert.match(await page.locator('#timeline').innerText(),/reread/);
  await page.getByLabel('監査画像',{exact:true}).check();assert.match(await page.locator('#evidence').innerText(),/モデル入力とは別/);
  await page.getByRole('button',{name:/run-b/}).click();assert.match(await page.locator('#run-summary').innerText(),/モック/);
 }finally{currentRuns=saved;details[idA]=old;await page.close();}
});

test('shows a separately recorded terminal image even when no next-step observation exists',async()=>{
 const old=details[idA];details[idA]=detail(run(idA),{steps:[step(1,{after:{kind:'unobserved',image:null}})],terminalImage:{file:`assets/${sha}.png`,sha256:sha,stage:'terminal-audit',delivery:'unavailable'}});
 const page=await open(`#run=${idA}&step=1`);try{await page.locator('#step-title').waitFor();assert.match(await page.locator('#after-evidence').innerText(),/終了時監査/);assert.equal(await page.locator('#after-evidence img').count(),1);}finally{details[idA]=old;await page.close();}
});

test('all-runs view lists different tasks without pooling their choice distributions',async()=>{const saved=currentRuns;currentRuns=[run(idA),run(idB,{group:'another-task'})];const page=await open();try{await page.getByLabel('比較グループ').selectOption({label:'全試行（分布の合算なし）'},{timeout:1500});assert.equal(await page.locator('#run-list button').count(),2);assert.match(await page.locator('#aggregate').innerText(),/合算しません/);}finally{currentRuns=saved;await page.close();}});

test('catalog labels planned slots separately from recorded results',async()=>{const saved=currentRuns;currentRuns=[run(idA),run(idB,{status:'pending',validity:'unknown',detailFile:null})];const page=await open();try{const text=await page.locator('#catalog-status').innerText();assert.match(text,/全 2 枠/);assert.match(text,/結果記録 1/);assert.doesNotMatch(text,/全 2 試行/);}finally{currentRuns=saved;await page.close();}});
