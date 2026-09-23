import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve} from 'node:path';
import {readFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';

test('runner retains back candidates through approved identical-URL history entries',async()=>{
 const server=createServer((req,res)=>{
  res.writeHead(200,{'content-type':'text/html','cache-control':'no-store'});
  res.end(req.url==='/next'?'<h1>Next</h1><a href="/next#section">Same anchor</a><div id="section">Section</div>':'<h1>Home</h1><a href="/next#section">Open</a>');
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const cwd=await mkdtemp(resolve(tmpdir(),'jev-history-'));
 try{
  const {port}=server.address() as {port:number};
  const {stdout}=await promisify(execFile)(process.execPath,[
   '--import',import.meta.resolve('tsx'),'--import',pathToFileURL(resolve('tests/fixtures/history-provider.mjs')).href,
   resolve('runner/public-site.ts'),`http://127.0.0.1:${port}/`,'Visit the section twice and return home','--reviewed','--max-actions','6','--interval-ms','1000',
  ],{cwd,env:{...process.env,AI_GATEWAY_API_KEY:'LOCAL_TEST_ONLY'},timeout:30000});
  const summary=JSON.parse(stdout.trim().split('\n').at(-1)!);
  const result=JSON.parse(await readFile(resolve(summary.report,'../exploration/result.json'),'utf8'));
  assert.equal(result.reason,'JEV_DONE');
  assert.equal(result.finalURL,`http://127.0.0.1:${port}/`);
  assert.equal(result.actionCount,4);
  assert.deepEqual(result.actionTrace.actions.map((a:any)=>a.action),['click','click','back','back']);
  assert.ok(result.steps[2].candidates.back);
  assert.ok(result.steps[3].candidates.back,'the first same-URL back must not hide the remaining approved destination');
  assert.equal(result.steps[4].candidates.back,undefined);
  assert.equal(result.actionTrace.recordingErrors,undefined);
 }finally{await new Promise<void>((r,e)=>server.close(err=>err?e(err):r()));}
});
