import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {goals} from './goals.js';
import {generatePlaywrightTest, saveRawTest} from '../runner/generate-test.js';
import type {ActionTrace} from '../runner/action-trace.js';

function trace():ActionTrace {
 return {schemaVersion:1,goalId:'notifications',goalText:goals.notifications.text,
  initialUrl:'http://127.0.0.1:5173/?variant=A#start',viewport:{width:1100,height:720},source:'local',fake:true,
  success:{reason:'SUCCESS',objectiveSuccess:true,perceivedSuccess:true},completedAt:'2026-09-23T00:00:00.000Z',
  actions:[{step:1,action:'click',target:{locator:{kind:'role',role:'button',value:'保存'}},urlBefore:'http://127.0.0.1:5173/?variant=A#start',urlAfter:'http://127.0.0.1:5173/?variant=A#start'}]};
}

// Execute the actual generated program. The boundary double records browser operations;
// the existing goal function itself runs unchanged against the supplied status state.
async function execute(source:string, visible=true, afterActionUrls:string[]=[],requests:string[]=[],baseURL:string|null='http://127.0.0.1:9999/') {
 const operations:unknown[]=[];
 type Route={request:()=>{url:()=>string};continue:()=>Promise<void>;abort:()=>Promise<void>};
 let routeHandler:((route:Route)=>Promise<void>)|undefined;
 let currentUrl='http://127.0.0.1:9999/';
 let actionIndex=0;
 const advance=()=>{currentUrl=afterActionUrls[actionIndex++]??currentUrl;};
 let body:((arg:{page:unknown;baseURL?:string})=>Promise<void>)|undefined;
 const testApi=Object.assign((_name:string,fn:typeof body)=>{body=fn;},{use:(options:unknown)=>operations.push(['use',options])});
 const locator=(kind:string,value:string,options?:unknown)=>({
  click:async()=>{operations.push(['click',kind,value,options]);advance();},
  fill:async(v:string)=>{operations.push(['fill',kind,value,options,v]);advance();},
  selectOption:async(v:string)=>{operations.push(['select',kind,value,options,v]);advance();},
  press:async(v:string)=>{operations.push(['press',kind,value,options,v]);advance();},
  filter:(filter:unknown)=>({isVisible:async()=>{operations.push(['goal',kind,value,filter]);return visible;}}),
 });
 const page={
  context:()=>({route:async(pattern:string,handler:typeof routeHandler)=>{assert.equal(pattern,'**/*');routeHandler=handler;}}),
  goto:async(url:string)=>{
   operations.push(['goto',url]);currentUrl=new URL(url,currentUrl).href;
   if(requests.length)assert.ok(routeHandler,'network isolation must be installed before navigation');
   for(const request of requests)await routeHandler!({request:()=>({url:()=>request}),continue:async()=>{operations.push(['network',request,'continue']);},abort:async()=>{operations.push(['network',request,'abort']);}});
  },
  getByTestId:(v:string)=>locator('testId',v),getByRole:(v:string,o?:unknown)=>locator('role',v,o),
  getByLabel:(v:string,o?:unknown)=>locator('label',v,o),getByPlaceholder:(v:string,o?:unknown)=>locator('placeholder',v,o),
  getByText:(v:string,o?:unknown)=>locator('text',v,o),locator:(v:string)=>locator('css',v),
  evaluate:async(fn:(arg:unknown)=>void,arg:unknown)=>{runInNewContext(`(${fn.toString()})(coords)`,{coords:arg,window:{scrollTo:(...coords:unknown[])=>operations.push(['scroll',...coords])}});advance();},
  goBack:async()=>{operations.push(['back']);advance();},
 };
 const expectApi=Object.assign((actual:unknown)=>({toHaveURL:async(predicate:(url:URL)=>boolean)=>{
  assert.equal(actual,page);assert.equal(predicate(new URL(currentUrl)),true,'recorded URL must match');
  operations.push(['url',new URL(currentUrl).pathname,new URL(currentUrl).search,new URL(currentUrl).hash]);
 }}),{poll:(fn:()=>Promise<unknown>)=>({toBe:async(value:unknown)=>assert.equal(await fn(),value)})});
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 runInNewContext(js,{exports:{},URL,require:(name:string)=>{
  if(name==='@playwright/test')return {test:testApi,expect:expectApi};
  if(name==='../../tests/goals.js')return {goals};
  throw new Error(`Unexpected import: ${name}`);
 }});
 assert.ok(body,'generated test must register a test body');
 await body({page,baseURL:baseURL??undefined});
 return JSON.parse(JSON.stringify(operations));
}

test('generated program preserves action order, locator semantics, escaping, viewport and the existing goal',async()=>{
 const input=trace();
 const dangerous='quote" \\ newline\n${globalThis.bad=true}\u2028';
 const actions:ActionTrace['actions']=[
  {step:1,action:'click',target:{locator:{kind:'testId',value:dangerous}},urlBefore:input.initialUrl},
  {step:2,action:'fill',target:{locator:{kind:'label',value:'メール'}},value:dangerous,urlBefore:input.initialUrl},
  {step:3,action:'select',target:{locator:{kind:'placeholder',value:'頻度'}},value:'never',urlBefore:input.initialUrl},
  {step:4,action:'press',target:{locator:{kind:'text',value:'設定'}},value:'Enter',urlBefore:input.initialUrl},
  {step:5,action:'click',target:{locator:{kind:'css',value:'button.save'}},urlBefore:input.initialUrl},
  {step:6,action:'scroll',scroll:{x:10,y:920},urlBefore:input.initialUrl},
  {step:7,action:'back',urlBefore:input.initialUrl},
  {step:8,action:'click',target:{locator:{kind:'role',role:'button',value:'保存'}},urlBefore:input.initialUrl},
 ];
 input.actions=actions.map(action=>({...action,urlAfter:input.initialUrl}));
 assert.deepEqual((await execute(generatePlaywrightTest(input))).filter((operation:unknown[])=>operation[0]!=='url'),[
  ['use',{viewport:{width:1100,height:720}}],['goto','/?variant=A#start'],
  ['click','testId',dangerous,null],['fill','label','メール',{exact:true},dangerous],
  ['select','placeholder','頻度',{exact:true},'never'],['press','text','設定',{exact:true},'Enter'],
  ['click','css','button.save',null],['scroll',10,920],['back'],
  ['click','role','button',{name:'保存',exact:true}],
  ['goal','role','status',{hasText:'メール通知を停止しました'}],
 ]);
 await assert.rejects(execute(generatePlaywrightTest(input),false),{name:'AssertionError'});
});

test('generation fails closed for unverified, unsupported and malformed runtime traces',()=>{
 const cases:Array<[string,(value:any)=>void]>=[
  ['schema',v=>v.schemaVersion=2],['public',v=>v.source='public'],['objective',v=>v.success.objectiveSuccess=null],
  ['perceived',v=>v.success.perceivedSuccess=false],['failure',v=>v.success.reason='MAX_STEPS'],
  ['unknown goal',v=>v.goalId='unknown'],['invoice',v=>v.goalId='invoice'],['goal meaning',v=>v.goalText='different'],
  ['empty actions',v=>v.actions=[]],['duplicate step',v=>v.actions.push({...v.actions[0]})],
  ['bad step',v=>v.actions[0].step=0],['unknown action',v=>v.actions[0].action='wait'],
  ['missing locator',v=>v.actions[0].target={text:'保存',selector:'button'}],
  ['bad locator',v=>v.actions[0].target.locator={kind:'nth',value:'0'}],
  ['missing role',v=>delete v.actions[0].target.locator.role],['bad role',v=>v.actions[0].target.locator.role='fake-role'],
  ['empty locator',v=>v.actions[0].target.locator.value=''],
  ['css nth',v=>v.actions[0].target.locator={kind:'css',value:'button:nth-child(2)'}],
  ['css engine escape',v=>v.actions[0].target.locator={kind:'css',value:'button >> nth=0'}],
  ['implicit xpath',v=>v.actions[0].target.locator={kind:'css',value:'//button'}],
  ['parent xpath',v=>v.actions[0].target.locator={kind:'css',value:'../button'}],
  ['explicit xpath',v=>v.actions[0].target.locator={kind:'css',value:'xpath=//button'}],
  ['missing fill value',v=>v.actions[0].action='fill'],['empty press value',v=>{v.actions[0].action='press';v.actions[0].value='';}],
  ['missing scroll',v=>v.actions[0].action='scroll'],['bad scroll',v=>{v.actions[0].action='scroll';v.actions[0].scroll={x:0,y:Infinity};}],
  ['unsafe initial scheme',v=>v.initialUrl='javascript:alert(1)'],['non-local initial URL',v=>v.initialUrl='https://example.com/'],
  ['protocol-relative path',v=>v.initialUrl='http://127.0.0.1:5173//example.com/'],
  ['unsafe before',v=>v.actions[0].urlBefore='file:///etc/passwd'],['external after',v=>v.actions[0].urlAfter='https://example.com/'],
  ['initial discontinuity',v=>v.actions[0].urlBefore='http://127.0.0.1:5173/other'],
  ['step discontinuity',v=>{v.actions[0].urlAfter='http://127.0.0.1:5173/settings';v.actions.push({...v.actions[0],step:2,urlBefore:v.initialUrl});}],
  ['bad viewport',v=>v.viewport.width=0],['bad fake',v=>v.fake='yes'],['missing timestamp',v=>delete v.completedAt],
  ['guard navigation',v=>v.actions[0].execution={kind:'navigate',url:v.initialUrl}],
  ['guard disclosure',v=>v.actions[0].execution={kind:'local-disclosure'}],
  ['capture error',v=>v.recordingErrors=[{step:1,message:'capture failed'}]],
 ];
 for(const [name,mutate] of cases){const input:any=trace();mutate(input);assert.throws(()=>generatePlaywrightTest(input),Error,name);}
 for(const input of [undefined,null,{},[]])assert.throws(()=>generatePlaywrightTest(input as ActionTrace));
});

test('recorded post-action URLs are asserted with path, query and hash independently of port',async()=>{
 const input=trace();
 input.actions[0].urlAfter='http://127.0.0.1:5173/settings?section=mail#saved';
 input.actions.push({...input.actions[0],step:2,urlBefore:input.actions[0].urlAfter,urlAfter:'http://127.0.0.1:5173/done'});
 const source=generatePlaywrightTest(input);
 const operations=await execute(source,true,['http://127.0.0.1:9999/settings?section=mail#saved','http://127.0.0.1:9999/done']);
 assert.deepEqual(operations.slice(2,6),[
  ['click','role','button',{name:'保存',exact:true}],['url','/settings','?section=mail','#saved'],
  ['click','role','button',{name:'保存',exact:true}],['url','/done','',''],
 ]);
 for(const wrongUrl of ['http://127.0.0.1:9999/other?section=mail#saved','http://127.0.0.1:9999/settings?section=other#saved','http://127.0.0.1:9999/settings?section=mail#other']){
  await assert.rejects(execute(source,true,[wrongUrl]),{name:'AssertionError'});
 }
});

test('trace URL continuity is checked before any test is emitted',()=>{
 const first=trace();first.actions[0].urlBefore='http://127.0.0.1:5173/other';
 assert.throws(()=>generatePlaywrightTest(first));
 const later=trace();later.actions[0].urlAfter='http://127.0.0.1:5173/settings';
 later.actions.push({...later.actions[0],step:2,urlBefore:later.initialUrl});
 assert.throws(()=>generatePlaywrightTest(later));
});

test('every replayed action requires a captured final URL, including the last action',()=>{
 const input=trace();delete input.actions[0].urlAfter;
 assert.throws(()=>generatePlaywrightTest(input));
 input.actions.push({...trace().actions[0],step:2,urlBefore:'http://127.0.0.1:5173/unrecorded'});
 assert.throws(()=>generatePlaywrightTest(input));
});

test('raw replay installs same-origin network isolation before navigation',async()=>{
 const requests=['http://127.0.0.1:9999/app.js','https://fonts.googleapis.com/css2?family=Inter','http://127.0.0.1:7777/other','https://127.0.0.1:9999/other','https://example.com/image.png'];
 const operations=await execute(generatePlaywrightTest(trace()),true,[],requests);
 assert.deepEqual(operations.filter((operation:unknown[])=>operation[0]==='network'),[
  ['network','http://127.0.0.1:9999/app.js','continue'],
  ['network','https://fonts.googleapis.com/css2?family=Inter','abort'],
  ['network','http://127.0.0.1:7777/other','abort'],
  ['network','https://127.0.0.1:9999/other','abort'],
  ['network','https://example.com/image.png','abort'],
 ]);
});

test('raw replay rejects missing or non-local baseURL before navigation',async()=>{
 const source=generatePlaywrightTest(trace());
 for(const baseURL of [null,'https://example.com/','file:///tmp/app','http://user:pass@127.0.0.1:9999/']){
  await assert.rejects(execute(source,true,[],[],baseURL));
 }
});

test('fake raw output explicitly identifies its evidence source',()=>{
 const input=trace();
 assert.match(generatePlaywrightTest(input),/^\/\/ FAKE trace:/m);
 input.fake=false;
 assert.doesNotMatch(generatePlaywrightTest(input),/^\/\/ FAKE trace:/m);
});

test('empty fill values and independently verified JEV_DONE are reproducible',async()=>{
 const input=trace();input.success.reason='JEV_DONE';input.actions[0].action='fill';input.actions[0].value='';
 const operations=await execute(generatePlaywrightTest(input));
 assert.deepEqual(operations[2],['fill','role','button',{name:'保存',exact:true},'']);
});

test('raw source and trace are saved as separate immutable, unique pairs',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'jev-codegen-'));
 try {
  const input=trace();const first=await saveRawTest(input,dir);
  const original=await readFile(first.testPath,'utf8');
  input.actions[0].target!.locator!.value='別のボタン';
  const second=await saveRawTest(input,dir);
  assert.notEqual(first.testPath,second.testPath);
  assert.equal(await readFile(first.testPath,'utf8'),original);
  assert.equal(JSON.parse(await readFile(first.tracePath,'utf8')).actions[0].target.locator.value,'保存');
  assert.equal((await readdir(dir)).length,4);
  assert.ok(Number.isFinite(first.generationMs)&&first.generationMs>=0);
  assert.match(first.testPath,/\.spec\.ts$/);
  await assert.rejects(saveRawTest({...input,source:'public'},dir));
  assert.equal((await readdir(dir)).length,4,'rejected traces must not create files');
 } finally {await rm(dir,{recursive:true,force:true});}
});
