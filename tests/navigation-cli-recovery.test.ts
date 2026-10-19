import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve} from 'node:path';
import {readFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';

for(const persistent of [false,true])test(`CLI retains navigation diagnostics and ${persistent?'stops as an instrument failure':'continues the original action after one reset'}`,async()=>{
 let answerRequests=0;const server=createServer((req,res)=>{
  if(req.url==='/answer'&&(++answerRequests===1||persistent)){req.socket.destroy();return;}
  res.writeHead(200,{'content-type':'text/html'});res.end(req.url==='/answer'?'<h1>Answer visible</h1>':'<h1>Start</h1><a href="/answer">Read answer</a>');
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const cwd=await mkdtemp(resolve(tmpdir(),'jev-navigation-transport-'));
 try{
  const {port}=server.address() as {port:number};
  const {stdout}=await promisify(execFile)(process.execPath,['--import',import.meta.resolve('tsx'),'--import',pathToFileURL(resolve('tests/fixtures/navigation-provider.mjs')).href,resolve('runner/public-site.ts'),`http://127.0.0.1:${port}/`,'Read the answer','--reviewed','--interval-ms','1000'],{cwd,env:{...process.env,AI_GATEWAY_API_KEY:'LOCAL_TEST_ONLY'},timeout:30000});
  const summary=JSON.parse(stdout.trim().split('\n').at(-1)!);
  const result=JSON.parse(await readFile(resolve(summary.report,'../exploration/result.json'),'utf8'));
  assert.equal(result.reason,persistent?'PAGE_ERROR':'JEV_DONE');
  assert.equal(answerRequests,2,'at most one extra GET, not a fresh exploration or unlimited retry');
  assert.equal(result.steps[0].result,persistent?'PAGE_ERROR':'OK');
  assert.equal(result.actionCount,persistent?0:1);
  assert.deepEqual(result.steps[0].navigationRequests,[{phase:'retry',category:'CONNECTION_RESET',attempt:1},{phase:persistent?'failed':'recovered',category:'CONNECTION_RESET',attempt:2}]);
  assert.deepEqual(result.navigationRequests,result.steps[0].navigationRequests.map((e:any)=>({step:1,...e})));
 }finally{await new Promise<void>((r,e)=>server.close(err=>err?e(err):r()));}
});
