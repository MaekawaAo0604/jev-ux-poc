import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer, type ViteDevServer} from 'vite';
import {chromium, type Browser, type BrowserContext, type Page} from 'playwright';
import {semanticQuery,parseSemanticFixture,semanticDefinition,semanticROIs} from '../app/semantic-fixture.js';
import type {SemanticFixture} from '../jev/virtual-beta/semantic-types.js';
import {LocalExplorationPage} from '../pages/LocalExplorationPage.js';
import {transformVision,visionCandidates} from '../jev/virtual-beta/vision.js';
import type {Rect} from '../jev/virtual-beta/contracts.js';
import type {Candidate} from '../jev/types.js';
import {PNG} from 'pngjs';

const fixtures:SemanticFixture[]=(['reference','position-only','wording-only'] as const).flatMap(ui=>(['A','B'] as const).map(mapping=>({version:1,ui,mapping})));
const initial={x:320,y:210,width:640,height:480},later={x:640,y:435,width:640,height:465};
const contains=(outer:Rect,inner:Rect)=>inner.x>=outer.x&&inner.y>=outer.y&&inner.x+inner.width<=outer.x+outer.width&&inner.y+inner.height<=outer.y+outer.height;

test('opaque fixture query roundtrips every assignment and rejects ambiguous or unsupported values',()=>{
 const queries=fixtures.map(f=>semanticQuery(f));assert.equal(new Set(queries).size,6);
 for(const [i,query] of queries.entries()){assert.deepEqual(parseSemanticFixture(query),fixtures[i]);assert.doesNotMatch(query,/reference|position-only|wording-only|mapping|=A(?:&|$)|=B(?:&|$)/);}
 const valid=queries[0],param=new URLSearchParams(valid),token=param.get('semanticFixture')!;
 for(const query of ['', '?semanticFixture=', '?semanticFixture=A','?semanticFixture=reference', '?semanticFixture=UNKNOWN','?semanticFixture=toString','?semanticFixture=__proto__',`${valid}&semanticFixture=${token}`,`${valid}&semanticFixture=unknown`,`${valid}&betaUI=r`])assert.equal(parseSemanticFixture(query),undefined,query);
 for(const fixture of [{version:2,ui:'reference',mapping:'A'},{version:1,ui:'other',mapping:'A'},{version:1,ui:'reference',mapping:'C'}])assert.throws(()=>semanticQuery(fixture as SemanticFixture),/fixture/i);
});

test('definitions keep controls fixed and move or reword only the routing cue',()=>{
 assert.deepEqual(semanticROIs,{'semantic-cue':'[data-semantic-roi="semantic-cue"]','semantic-a':'[data-semantic-roi="semantic-a"]','semantic-b':'[data-semantic-roi="semantic-b"]'});
 for(const mapping of ['A','B'] as const){const [ref,pos,word]=(['reference','position-only','wording-only'] as const).map(ui=>semanticDefinition({version:1,ui,mapping}));
  assert.deepEqual(ref.rects.a,{x:660,y:500,width:130,height:80});assert.deepEqual(ref.rects.b,{x:810,y:500,width:130,height:80});assert.deepEqual(ref.rects.cue,{x:1000,y:720,width:250,height:130});
  assert.deepEqual(pos,{...ref,rects:{...ref.rects,cue:{...ref.rects.cue,y:470}}});assert.deepEqual(word,{...ref,cueText:word.cueText});assert.notEqual(word.cueText,ref.cueText);
  assert.equal(contains(initial,ref.rects.a)&&contains(initial,ref.rects.b),true);assert.equal(contains(initial,ref.rects.cue),false);
  for(const definition of [ref,pos,word])for(const rect of Object.values(definition.rects))assert.equal(contains(later,rect),true);
  assert.match(ref.cueText,new RegExp(`設定${mapping}.*メール通知`));assert.match(word.cueText,new RegExp(`メール通知.*設定${mapping}`));
 }
});

let server:ViteDevServer,browser:Browser,baseURL:string;
before(async()=>{server=await createServer({server:{host:'127.0.0.1',port:0}});await server.listen();const address=server.httpServer!.address();assert.ok(address&&typeof address!=='string');baseURL=`http://127.0.0.1:${address.port}`;browser=await chromium.launch({headless:true});});
after(async()=>{await browser?.close();await server?.close();});
async function context(){const c=await browser.newContext({viewport:{width:1280,height:900},locale:'ja-JP',timezoneId:'Asia/Tokyo'});await c.route('**/*',route=>new URL(route.request().url()).origin===baseURL?route.continue():route.abort());return c;}
async function open(c:BrowserContext,fixture:SemanticFixture){const p=await c.newPage();await p.goto(baseURL+'/good/'+semanticQuery(fixture));await p.locator(semanticROIs['semantic-a']).waitFor();await p.evaluate(()=>document.fonts.ready);return p;}
async function snapshot(p:Page){return p.locator('.semantic-fixture').evaluate(root=>({text:(root as HTMLElement).innerText,scroll:{width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight},elements:Array.from(root.querySelectorAll('*')).filter(el=>!['STYLE'].includes(el.tagName)).map(el=>{const b=el.getBoundingClientRect(),s=getComputedStyle(el);return {tag:el.tagName,text:el.childElementCount?null:el.textContent,insideCue:!!el.closest('[data-semantic-roi="semantic-cue"]'),rect:{x:b.x,y:b.y,width:b.width,height:b.height},style:{font:s.font,color:s.color,background:s.backgroundColor,border:s.border,padding:s.padding,display:s.display}};})}));}

test('all fixture UIs route either mapping correctly, retain both clickable choices, and reset on reload',async()=>{
 const c=await context();try{for(const fixture of fixtures){const p=await open(c,fixture),correct=fixture.mapping,wrong=correct==='A'?'B':'A';
  assert.deepEqual(await p.getByRole('button').allTextContents(),['設定Aを適用','設定Bを適用']);
  await p.getByRole('button',{name:`設定${wrong}を適用`,exact:true}).click();assert.equal(await p.getByRole('status').count(),0);assert.match(await p.locator('.semantic-display-state').innerText(),/コンパクト/);assert.match(await p.locator('.semantic-mail-state').innerText(),/受信する/);
  await p.getByRole('button',{name:`設定${correct}を適用`,exact:true}).click();assert.equal(await p.getByRole('status').innerText(),'メール通知を停止しました');
  for(const button of await p.getByRole('button').all())assert.equal(await button.isEnabled(),true);
  await p.reload();await p.locator(semanticROIs['semantic-a']).waitFor();assert.equal(await p.getByRole('status').count(),0);assert.match(await p.locator('.semantic-display-state').innerText(),/標準/);assert.match(await p.locator('.semantic-mail-state').innerText(),/受信する/);
  await p.getByRole('button',{name:`設定${correct}を適用`,exact:true}).click();assert.equal(await p.getByRole('status').innerText(),'メール通知を停止しました');
  await p.getByRole('button',{name:`設定${wrong}を適用`,exact:true}).click();assert.equal(await p.getByRole('status').innerText(),'メール通知を停止しました');assert.match(await p.locator('.semantic-display-state').innerText(),/コンパクト/);await p.close();
 }}finally{await c.close();}
});

test('only note position or wording changes across UIs; controls have no answer attributes',async()=>{
 const c=await context();try{for(const mapping of ['A','B'] as const){const pages=await Promise.all((['reference','position-only','wording-only'] as const).map(ui=>open(c,{version:1,ui,mapping})));const [ref,pos,word]=await Promise.all(pages.map(snapshot));
  assert.deepEqual(ref.scroll,{width:1280,height:900});assert.deepEqual(pos.scroll,ref.scroll);assert.deepEqual(word.scroll,ref.scroll);assert.equal(pos.text,ref.text);assert.equal(ref.elements.length,pos.elements.length);assert.equal(ref.elements.length,word.elements.length);
  for(let i=0;i<ref.elements.length;i++){const a=ref.elements[i],b=pos.elements[i],w=word.elements[i];assert.deepEqual(b.style,a.style);assert.deepEqual(w.style,a.style);assert.deepEqual(w.rect,a.rect);if(!a.insideCue){assert.deepEqual(b,a);assert.equal(w.text,a.text);}else assert.deepEqual(b.rect,{...a.rect,y:a.rect.y-250});}
  for(const p of pages){const attrs=await p.getByRole('button').evaluateAll(buttons=>buttons.map(b=>Array.from(b.attributes).map(a=>[a.name,a.value])));assert.doesNotMatch(JSON.stringify(attrs),/correct|success|mapping|good|bad|正解/);await p.close();}
 }}finally{await c.close();}
});

test('actual numbered initial crop is mapping invariant and both control badges remain eligible after look',async t=>{
 const c=await context();try{for(const ui of ['reference','position-only','wording-only'] as const){const images:Buffer[]=[],laterImages:Buffer[]=[];for(const mapping of ['A','B'] as const){const p=await open(c,{version:1,ui,mapping}),adapter=new LocalExplorationPage(p),screen=await adapter.observe(false),offered:Record<string,Candidate>=Object.fromEntries(screen.elements.map(e=>[e.id,{action:{type:'click',elementId:e.id},label:e.text}]));
  assert.deepEqual(screen.elements.map(e=>e.text),['設定Aを適用','設定Bを適用']);const raw=await p.screenshot(),capture=await adapter.captureDecisionScreenshot(screen,offered);assert.equal(capture.targets.length,2);
  const config={mode:'crop' as const,clearWidth:640,clearHeight:480,blurRadius:1};const first=transformVision(capture.bytes,config,{x:640,y:450},capture.targets),look=transformVision(capture.bytes,config,{x:960,y:675},capture.targets);assert.deepEqual(first.clearRect,initial);assert.deepEqual(look.clearRect,later);
  for(const observation of [first,look]){assert.deepEqual(Object.keys(visionCandidates(offered,observation)),['e1','e2']);for(const target of observation.visibleTargets){assert.ok(target.badge);assert.equal(contains(observation.clearRect,target),true);assert.equal(contains(observation.clearRect,target.badge!),true);}}
  const cue=(await p.locator(semanticROIs['semantic-cue']).boundingBox())!;assert.equal(cue.x>=initial.x+initial.width,true);assert.equal(contains(look.clearRect,cue),true);assert.deepEqual(await p.screenshot(),raw,'look/capture must not alter the product');images.push(first.bytes);laterImages.push(look.bytes);t.diagnostic(JSON.stringify({ui,mapping,targets:capture.targets,cue}));await p.close();
 }assert.notDeepEqual(laterImages[0],laterImages[1],'revealed cue must change mapping pixels');assert.deepEqual(images[0],images[1],`${ui} initial numbered crop`);}}finally{await c.close();}
});




test('successful mail status text and pixels fit entirely in both initial and look crops for every fixture',async()=>{
 const c=await context();try{for(const fixture of fixtures){const p=await open(c,fixture);
  await p.getByRole('button',{name:`設定${fixture.mapping}を適用`,exact:true}).click();
  const status=p.getByRole('status');assert.equal(await status.innerText(),'メール通知を停止しました');
  const box=(await status.boundingBox())!,lines=await status.evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);return Array.from(range.getClientRects(),r=>({x:r.x,y:r.y,width:r.width,height:r.height}));});
  assert.equal(lines.length,1,'entire success sentence must stay on one line');
  for(const crop of [initial,later])for(const rect of [box,...lines])assert.equal(contains(crop,rect),true,'complete status box and text must be inside both crops');
  const adapter=new LocalExplorationPage(p),screen=await adapter.observe(false),offered:Record<string,Candidate>=Object.fromEntries(screen.elements.map(e=>[e.id,{action:{type:'click',elementId:e.id},label:e.text}]));
  const capture=await adapter.captureDecisionScreenshot(screen,offered),source=PNG.sync.read(capture.bytes),config={mode:'crop' as const,clearWidth:640,clearHeight:480,blurRadius:1};
  const pixels=(image:PNG,x:number,y:number,width:number,height:number)=>Buffer.concat(Array.from({length:height},(_,row)=>image.data.subarray(((y+row)*image.width+x)*4,((y+row)*image.width+x+width)*4)));
  const x=Math.floor(box.x),y=Math.floor(box.y),width=Math.ceil(box.x+box.width)-x,height=Math.ceil(box.y+box.height)-y,expected=pixels(source,x,y,width,height);
  assert.ok(Array.from({length:expected.length/4},(_,i)=>i*4).filter(i=>expected[i]<80&&expected[i+1]<120&&expected[i+2]<100).length>50,'status screenshot must contain visible sentence ink');
  for(const fixation of [{x:640,y:450},{x:960,y:675}]){const observation=transformVision(capture.bytes,config,fixation,capture.targets),modelImage=PNG.sync.read(observation.bytes);assert.deepEqual(pixels(modelImage,x-observation.clearRect.x,y-observation.clearRect.y,width,height),expected,'entire rendered status must survive actual model image crop');}
  await p.close();
 }}finally{await c.close();}
});
