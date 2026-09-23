import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve} from 'node:path';
import {readFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';

// Catches duplicate full observations, skipped final observations and lost history.
test('public exploration observes each decision state once including the final allowed action',async()=>{
 const requests:string[]=[];
 const server=createServer((req,res)=>{
  requests.push(req.url!);
  res.writeHead(200,{'content-type':'text/html'});
  res.end('<p>Condition A</p><div style="height:1100px"></div><p>Condition B</p><div style="height:400px"></div>');
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const cwd=await mkdtemp(resolve(tmpdir(),'jev-one-observation-'));
 try{
  const {port}=server.address() as {port:number};
  const {stdout}=await promisify(execFile)(process.execPath,[
   '--import',import.meta.resolve('tsx'),
   '--import',pathToFileURL(resolve('tests/fixtures/limit-provider.mjs')).href,
   '--import',pathToFileURL(resolve('tests/fixtures/observation-counter.mjs')).href,
   resolve('runner/public-site.ts'),`http://127.0.0.1:${port}/`,'Read conditions A and B',
   '--reviewed','--max-actions','1','--interval-ms','1000',
  ],{cwd,env:{...process.env,AI_GATEWAY_API_KEY:'LOCAL_TEST_ONLY',TEST_LIMIT_MODE:'memory'},timeout:30000});
  const summary=JSON.parse(stdout.trim().split('\n').at(-1)!);
  const result=JSON.parse(await readFile(resolve(summary.report,'../exploration/result.json'),'utf8'));
  assert.equal(result.reason,'JEV_DONE');
  assert.equal(result.actionCount,1);
  assert.equal(result.steps.length,2);
  assert.deepEqual(result.steps[0].state.history,[]);
  assert.ok(result.steps[0].state.screen.text.includes('Condition A'));
  assert.ok(!result.steps[1].state.screen.text.includes('Condition A'));
  assert.ok(result.steps[1].state.screen.text.includes('Condition B'));
  assert.deepEqual(result.steps[1].state.history[0].observedText,['Condition A']);
  assert.equal(result.path.length,1);
  assert.equal(result.path[0].result,'画面: Condition B');
  assert.equal(result.actionTrace.actions.length,1);
  assert.equal(result.actionTrace.actions[0].action,'scroll');
  assert.equal(requests.filter(url=>url==='/').length,1,'observation and scrolling must not re-fetch the page');
  assert.equal((stdout.match(/^OBSERVATION_CALL /gm)||[]).length,2,'one initial observation plus one after the sole action; never scan the same state twice');
 }finally{await new Promise<void>((r,e)=>server.close(err=>err?e(err):r()));}
});
