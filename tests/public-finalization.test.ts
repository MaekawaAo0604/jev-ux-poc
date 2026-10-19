import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve} from 'node:path';
import {readFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import {run} from '../runner/engine.js';
import {measurementForRun} from '../runner/report.js';

test('local capture failure preserves a deliberate stop and is not valid UX data',async()=>{
 const browser=await chromium.launch(),dir=await mkdtemp(resolve(tmpdir(),'jev-local-finalization-'));
 try{
  const page=await browser.newPage();await page.route('http://fixture.test/**',r=>r.fulfill({contentType:'text/html',body:'<h1>Home</h1>'}));
  const screenshot=page.screenshot.bind(page);page.screenshot=async options=>{if(String(options?.path).endsWith('final.png'))throw new Error('Capture failed');return screenshot(options);};
  const result=await run(page,async()=>({action:{type:'stuck'},choice:'stuck',probabilities:{stuck:1},model:'TEST'}),{variant:'good',goal:'notifications',font:false,maxActions:0,dir,baseURL:'http://fixture.test',repeat:1,fake:true,pom:'auto',success:'jev'});
  assert.equal(result.reason,'STUCK');assert.equal(measurementForRun(result),'instrument');
 }finally{await browser.close();}
});

test('a claimed completion with failed terminal capture cannot count as site UX data',()=>{
 assert.equal(measurementForRun({reason:'JEV_DONE',finalCapture:{status:'ERROR',code:'SCREENSHOT_FAILED'}}),'instrument');
});

for(const mode of ['http','native-history'])test(`terminal capture failure cannot replace ${mode} safety stop or erase its executed trace`,async()=>{
 const server=createServer((_req,res)=>{res.writeHead(mode==='http'?403:200,{'content-type':'text/html'});res.end('<h1>Home</h1><a href="/next">Next</a>');});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const cwd=await mkdtemp(resolve(tmpdir(),'jev-finalization-'));
 try{
  const {port}=server.address() as {port:number};
  const {stdout}=await promisify(execFile)(process.execPath,['--import',import.meta.resolve('tsx'),'--import',pathToFileURL(resolve('tests/fixtures/final-capture-failure.mjs')).href,resolve('runner/public-site.ts'),`http://127.0.0.1:${port}/`,'Find the answer','--reviewed','--interval-ms','1000'],{cwd,env:{...process.env,AI_GATEWAY_API_KEY:'LOCAL_TEST_ONLY'},timeout:20000});
  const summary=JSON.parse(stdout.trim().split('\n').at(-1)!),result=JSON.parse(await readFile(resolve(summary.report,'../exploration/result.json'),'utf8'));
  assert.equal(result.reason,'SAFETY_BOUNDARY');assert.equal(result.actionTrace.success.reason,'SAFETY_BOUNDARY');
  assert.equal(result.actionCount,mode==='http'?0:1);assert.deepEqual(result.actionTrace.actions.map((a:any)=>a.action),mode==='http'?[]:['click']);
  assert.equal(result.finalCapture.status,'ERROR');assert.equal(result.finalCapture.code,'SCREENSHOT_FAILED');
  assert.match(result.finalCapture.error,/Terminal capture unavailable/);
 }finally{await new Promise<void>((r,e)=>server.close(err=>err?e(err):r()));}
});
