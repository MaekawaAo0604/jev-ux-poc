import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve} from 'node:path';
import {readFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';

test('the public action interval settles the resulting display before its single observation',async()=>{
 const visits:string[]=[];
 const server=createServer((req,res)=>{
  visits.push(req.url!);res.writeHead(200,{'content-type':'text/html; charset=utf-8'});
  res.end(`<h1>Home</h1><details><summary>Details</summary><p id="answer">Opening</p></details>
   <script>document.querySelector('details').addEventListener('toggle',event=>{
    if(event.target.open)setTimeout(()=>document.getElementById('answer').textContent='Answer visible',450);
   });</script>`);
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const cwd=await mkdtemp(resolve(tmpdir(),'jev-observation-settle-'));
 try{
  const {port}=server.address() as {port:number};
  const {stdout}=await promisify(execFile)(process.execPath,[
   '--import',import.meta.resolve('tsx'),'--import',pathToFileURL(resolve('tests/fixtures/limit-provider.mjs')).href,
   resolve('runner/public-site.ts'),`http://127.0.0.1:${port}/`,'Read the answer','--reviewed','--max-actions','1','--interval-ms','1000',
  ],{cwd,env:{...process.env,AI_GATEWAY_API_KEY:'LOCAL_TEST_ONLY',TEST_LIMIT_MODE:'done'},timeout:30000});
  const summary=JSON.parse(stdout.trim().split('\n').at(-1)!);
  const result=JSON.parse(await readFile(resolve(summary.report,'../exploration/result.json'),'utf8'));
  assert.equal(result.reason,'JEV_DONE');
  assert.equal(result.actionCount,1);
  assert.equal(result.steps.length,2,'one initial and one settled result observation');
  assert.ok(result.steps[1].state.screen.text.includes('Answer visible'));
  assert.ok(!result.steps[1].state.screen.text.includes('Opening'));
  assert.equal(result.steps[1].result,'JEV_DONE');
  assert.equal(visits.filter(url=>url==='/').length,1,'no reload used to settle display');
 }finally{await new Promise<void>((r,e)=>server.close(err=>err?e(err):r()));}
});
