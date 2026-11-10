import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,mkdtemp} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';

for(const crossOrigin of [true,false])test(`production CLI records scope observations without changing ${crossOrigin?'STUCK or fetching a blocked target':'the successful action route'}`,async()=>{
 let answerHits=0,base='';
 const server=createServer((req,res)=>{
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'});
  if(req.url==='/answer'){answerHits++;res.end('<h1>Answer visible</h1>');}
  else res.end(`<h1>Home</h1><a href="${crossOrigin?base.replace('127.0.0.1','localhost'):base}/answer">Read answer</a>`);
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 const cwd=await mkdtemp(resolve(tmpdir(),'jev-stop-assessment-'));
 try{
  const {stdout}=await promisify(execFile)(process.execPath,['--import',import.meta.resolve('tsx'),'--import',pathToFileURL(resolve('tests/fixtures/navigation-provider.mjs')).href,
   resolve('runner/public-site.ts'),base,'Read the answer','--reviewed','--interval-ms','1000'],{cwd,env:{...process.env,AI_GATEWAY_API_KEY:'LOCAL_TEST_ONLY'},timeout:30000});
  const summary=JSON.parse(stdout.trim().split('\n').at(-1)!);
  const result=JSON.parse(await readFile(resolve(summary.report,'../exploration/result.json'),'utf8'));
  assert.equal(result.reason,crossOrigin?'STUCK':'JEV_DONE');
  assert.equal(answerHits,crossOrigin?0:1);
  assert.equal(result.actionCount,crossOrigin?0:1);
  assert.ok(result.stopAssessment,'raw result must store the diagnostic, not just its HTML rendering');
  assert.equal(result.stopAssessment.rawReason,result.reason);
  assert.equal(result.stopAssessment.terminalDecision.stage,'action-selection');
  assert.equal(result.stopAssessment.restrictedControls.length,crossOrigin?1:0);
  assert.equal(result.stopAssessment.attribution,crossOrigin?'undetermined':'not-assessed');
  const [saved]=JSON.parse(await readFile(resolve(summary.report,'../summary.json'),'utf8'));
  assert.deepEqual(saved.stopAssessment,result.stopAssessment);
  assert.equal(saved.measurement,crossOrigin?'unknown':'ux');
 }finally{await new Promise<void>(r=>server.close(()=>r()));}
});
