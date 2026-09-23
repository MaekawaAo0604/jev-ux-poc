import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve} from 'node:path';
import {readFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';

for(const maxActions of [0,8])test(`public exploration avoids an exhausted repeated action and reaches done with max-actions ${maxActions}`,async()=>{
 const visits:string[]=[];
 const server=createServer((req,res)=>{
  visits.push(req.url!);res.writeHead(200,{'content-type':'text/html'});
  res.end(req.url==='/answer'?'<h1>Answer visible</h1>':'<h1>Home</h1><details><summary>Toggle</summary><p>No answer here</p></details><a href="/answer">Read answer</a>');
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const cwd=await mkdtemp(resolve(tmpdir(),'jev-loop-recovery-'));
 try{
  const {port}=server.address() as {port:number};
  const {stdout}=await promisify(execFile)(process.execPath,[
   '--import',import.meta.resolve('tsx'),'--import',pathToFileURL(resolve('tests/fixtures/loop-provider.mjs')).href,
   resolve('runner/public-site.ts'),`http://127.0.0.1:${port}/`,'Read the answer','--reviewed','--max-actions',String(maxActions),'--interval-ms','1000',
  ],{cwd,env:{...process.env,AI_GATEWAY_API_KEY:'LOCAL_TEST_ONLY'},timeout:30000});
  const summary=JSON.parse(stdout.trim().split('\n').at(-1)!);
  const result=JSON.parse(await readFile(resolve(summary.report,'../exploration/result.json'),'utf8'));
  assert.equal(result.reason,'JEV_DONE');
  assert.equal(result.settings.maxActions,maxActions);
  assert.equal(result.actionCount,4,'open, close, reopen as transit, then the untried answer instead of closing again');
  assert.equal(result.steps[3].decision.choice,'e2');
  assert.deepEqual(result.steps[3].loopAvoidance.excludedChoices,['e1']);
  assert.ok(!Object.hasOwn(result.steps[3].candidates,'e1'));
  assert.ok(Object.hasOwn(result.steps[3].candidates,'done'));
  assert.ok(Object.hasOwn(result.steps[3].candidates,'stuck'));
  assert.equal(result.actionTrace.actions.at(-1).target.text,'Read answer');
  assert.equal(visits.filter(url=>url==='/answer').length,1);
 }finally{await new Promise<void>((r,e)=>server.close(err=>err?e(err):r()));}
});

test('the final action-budget judgment retains exhausted candidates instead of pressuring done or stuck',async()=>{
 const server=createServer((_req,res)=>{
  res.writeHead(200,{'content-type':'text/html'});
  res.end('<h1>Home</h1><details><summary>Toggle</summary><p>No answer here</p></details>');
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const cwd=await mkdtemp(resolve(tmpdir(),'jev-loop-action-limit-'));
 try{
  const {port}=server.address() as {port:number};
  const {stdout}=await promisify(execFile)(process.execPath,[
   '--import',import.meta.resolve('tsx'),'--import',pathToFileURL(resolve('tests/fixtures/loop-provider.mjs')).href,
   resolve('runner/public-site.ts'),`http://127.0.0.1:${port}/`,'Read the answer','--reviewed','--max-actions','2','--interval-ms','1000',
  ],{cwd,env:{...process.env,AI_GATEWAY_API_KEY:'LOCAL_TEST_ONLY'},timeout:30000});
  const summary=JSON.parse(stdout.trim().split('\n').at(-1)!);
  const result=JSON.parse(await readFile(resolve(summary.report,'../exploration/result.json'),'utf8'));
  assert.equal(result.reason,'ACTION_LIMIT');
  assert.equal(result.actionCount,2);
  assert.equal(result.steps.at(-1).decision.choice,'e1');
  assert.ok(Object.hasOwn(result.steps.at(-1).candidates,'e1'));
  assert.equal(result.steps.at(-1).loopAvoidance,undefined);
 }finally{await new Promise<void>((r,e)=>server.close(err=>err?e(err):r()));}
});
