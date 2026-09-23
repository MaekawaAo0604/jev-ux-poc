import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve} from 'node:path';
import {readFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';

for(const mode of ['', 'invalid'])test(`public exploration keeps its browser and executed history through inference recovery (${mode||'transient'})`,async()=>{
 const visits:string[]=[];
 const server=createServer((req,res)=>{
  visits.push(req.url!);res.writeHead(200,{'content-type':'text/html'});
  res.end('<h1>Home</h1><details><summary>Details</summary><p>Answer visible</p></details>');
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const cwd=await mkdtemp(resolve(tmpdir(),'jev-inference-recovery-'));
 try{
  const {port}=server.address() as {port:number};
  const {stdout}=await promisify(execFile)(process.execPath,[
   '--import',import.meta.resolve('tsx'),'--import',pathToFileURL(resolve('tests/fixtures/recovery-provider.mjs')).href,
   resolve('runner/public-site.ts'),`http://127.0.0.1:${port}/`,'Read the answer','--reviewed','--max-actions','1','--interval-ms','1000',
  ],{cwd,env:{...process.env,AI_GATEWAY_API_KEY:'LOCAL_TEST_ONLY',TEST_RECOVERY_MODE:mode},timeout:30000});
  const summary=JSON.parse(stdout.trim().split('\n').at(-1)!);
  const result=JSON.parse(await readFile(resolve(summary.report,'../exploration/result.json'),'utf8'));
  assert.equal(result.reason,'JEV_DONE');
  assert.equal(result.actionCount,1);assert.equal(result.steps.length,2);
  assert.equal(result.actionTrace.actions.length,1);assert.equal(result.actionTrace.actions[0].action,'click');
  assert.equal(result.steps[1].state.history.length,1);
  assert.equal(result.steps[1].decision.request.attempts,mode==='invalid'?2:4);
  assert.equal(result.steps[1].decision.request.failures.length,mode==='invalid'?1:3);
  if(mode==='invalid')assert.equal(result.steps[1].decision.request.failures[0].code,'INVALID_RESPONSE');
  assert.equal(result.steps[1].inferenceRecovery.filter((e:any)=>e.phase==='retry').length,mode==='invalid'?1:3);
  assert.equal(result.steps[1].inferenceRecovery.at(-1).phase,'recovered');
  assert.equal(result.completionAudit.status,'RECORDED');
  assert.equal(visits.filter(url=>url==='/').length,1,'recovery must not revisit the website or replay the click');
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE/);
 }finally{await new Promise<void>((r,e)=>server.close(err=>err?e(err):r()));}
});

for(const mode of ['changed','changed-success'])test(`a page changed during inference recovery is reobserved before selecting any action (${mode})`,async()=>{
 let signal:import('node:http').ServerResponse|undefined;
 const server=createServer((req,res)=>{
  if(req.url==='/signal'){signal=res;return;}
  if(req.url==='/release'){signal?.end('go');res.end('ok');return;}
  res.writeHead(200,{'content-type':'text/html'});
  const change=mode==='changed'?`document.body.innerHTML='<h1>Updated</h1><details><summary>Updated choice</summary><p>Answer visible</p></details>';`:`document.querySelector('h1').textContent='Updated';document.querySelector('summary').textContent='Updated choice';document.querySelector('details').insertAdjacentHTML('beforeend','<p>Answer visible</p>');`;
  res.end(`<h1>Original</h1><details><summary>Original choice</summary></details><script>fetch('/signal').then(()=>{${change}})</script>`);
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const cwd=await mkdtemp(resolve(tmpdir(),'jev-recovery-freshness-'));
 try{
  const {port}=server.address() as {port:number};
  const {stdout}=await promisify(execFile)(process.execPath,[
   '--import',import.meta.resolve('tsx'),'--import',pathToFileURL(resolve('tests/fixtures/recovery-provider.mjs')).href,
   resolve('runner/public-site.ts'),`http://127.0.0.1:${port}/`,'Read the answer','--reviewed','--max-actions','1','--interval-ms','1000',
  ],{cwd,env:{...process.env,AI_GATEWAY_API_KEY:'LOCAL_TEST_ONLY',TEST_RECOVERY_MODE:mode,TEST_BOUNDARY_SIGNAL_URL:`http://127.0.0.1:${port}/release`},timeout:30000});
  const summary=JSON.parse(stdout.trim().split('\n').at(-1)!);
  const result=JSON.parse(await readFile(resolve(summary.report,'../exploration/result.json'),'utf8'));
  assert.equal(result.reason,'JEV_DONE');assert.equal(result.actionCount,1);
  assert.equal(result.steps[0].result,'REOBSERVE');
  assert.equal(result.steps[1].state.screen.title,'Updated');
  assert.equal(result.actionTrace.actions[0].target.text,'Updated choice');
  assert.equal(result.steps[1].state.history.length,0,'failed judgments are not executed history');
 }finally{signal?.end();await new Promise<void>((r,e)=>server.close(err=>err?e(err):r()));}
});
