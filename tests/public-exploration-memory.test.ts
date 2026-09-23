import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve} from 'node:path';
import {readFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';

async function explore(render:(path:string)=>string,maxActions:number){
 const visits:string[]=[];
 const server=createServer((req,res)=>{
  visits.push(req.url!);res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(render(req.url!));
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const cwd=await mkdtemp(resolve(tmpdir(),'jev-exploration-memory-'));
 try{
  const {port}=server.address() as {port:number};
  const {stdout}=await promisify(execFile)(process.execPath,[
   '--import',import.meta.resolve('tsx'),'--import',pathToFileURL(resolve('tests/fixtures/loop-provider.mjs')).href,
   resolve('runner/public-site.ts'),`http://127.0.0.1:${port}/`,'Read the answer','--reviewed','--max-actions',String(maxActions),'--interval-ms','1000',
  ],{cwd,env:{...process.env,AI_GATEWAY_API_KEY:'LOCAL_TEST_ONLY'},timeout:45000});
  const summary=JSON.parse(stdout.trim().split('\n').at(-1)!);
  return {result:JSON.parse(await readFile(resolve(summary.report,'../exploration/result.json'),'utf8')),visits};
 }finally{await new Promise<void>((r,e)=>server.close(err=>err?e(err):r()));}
}

test('a no-op navigation is tried once despite changing font geometry and duplicate links',async()=>{
 let count=0;
 const {result,visits}=await explore(path=>path==='/answer'?'<h1>Answer visible</h1>':
  `<h1>Home</h1><div style="font-size:${16+(++count)%3}px"><a href="/">Home</a><a href="/">Home</a><a href="/answer">Read answer</a></div>`,4);
 assert.equal(result.reason,'JEV_DONE');
 assert.equal(result.actionCount,2,'one no-op navigation, then the distinct untried answer link');
 assert.equal(visits.filter(path=>path==='/').length,2);
 assert.deepEqual(result.steps[1].loopAvoidance.excludedChoices,['e1','e2']);
 assert.equal(result.steps[1].decision.choice,'e3');
 assert.equal(result.actionTrace.actions.length,2);
});

test('an explored navigation remains available as transit to an untried sibling link',async()=>{
 const {result,visits}=await explore(path=>({
  '/':'<h1>Home</h1><a href="/menu">Menu</a>',
  '/menu':'<h1>Menu</h1><a href="/detail">Details</a><a href="/answer">Read answer</a>',
  '/detail':'<h1>Details, no answer</h1><a href="/">Home</a>',
  '/answer':'<h1>Answer visible</h1>',
 }[path]||''),8);
 assert.equal(result.reason,'JEV_DONE');
 assert.equal(result.actionCount,5);
 assert.deepEqual(result.steps[3].explorationMemory.transitChoices,['e1']);
 assert.equal(result.steps[4].decision.choice,'e2','return to the menu must not repeat the exhausted details branch');
 assert.equal(visits.filter(path=>path==='/detail').length,1);
 assert.equal(visits.filter(path=>path==='/answer').length,1);
});
