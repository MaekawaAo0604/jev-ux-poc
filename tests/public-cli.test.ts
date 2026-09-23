import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve} from 'node:path';
import {readFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';

test('a navigation or form safety violation during model latency cannot become done',async()=>{
 let signal:import('node:http').ServerResponse|undefined;const seen:string[]=[];
 const server=createServer((req,res)=>{
  seen.push(req.url!);
  if(req.url==='/signal'){signal=res;return;}
  if(req.url==='/release'){signal?.end('go');res.end('ok');return;}
  res.writeHead(200,{'content-type':'text/html'});
  res.end(`<h1>Answer visible</h1><form action="/sent"><button>Send</button></form><script>fetch('/signal').then(()=>{${req.url==='/form'?'document.forms[0].submit()':'location.assign("/sent")'}})</script>`);
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const cwd=await mkdtemp(resolve(tmpdir(),'jev-late-boundary-'));
 try{
  const {port}=server.address() as {port:number};
  for(const path of ['/script','/form']){
   const {stdout}=await promisify(execFile)(process.execPath,['--import',import.meta.resolve('tsx'),'--import',pathToFileURL(resolve('tests/fixtures/limit-provider.mjs')).href,resolve('runner/public-site.ts'),`http://127.0.0.1:${port}${path}`,'read','--reviewed','--interval-ms','1000'],{cwd,env:{...process.env,AI_GATEWAY_API_KEY:'LOCAL_TEST_ONLY',TEST_LIMIT_MODE:'boundary',TEST_BOUNDARY_SIGNAL_URL:`http://127.0.0.1:${port}/release`},timeout:30000});
   const summary=JSON.parse(stdout.trim().split('\n').at(-1)!);
   const result=JSON.parse(await readFile(resolve(summary.report,'../exploration/result.json'),'utf8'));
   assert.equal(result.steps[0].decision.choice,'done','violation occurs while the fake decision is awaited');
   assert.equal(result.reason,'SAFETY_BOUNDARY',path);assert.equal(result.perceivedSuccess,false);assert.equal(result.actionCount,0);
  }
  assert.ok(!seen.some(path=>path.startsWith('/sent')));
 }finally{signal?.end();await new Promise<void>((r,e)=>server.close(err=>err?e(err):r()));}
});

test('approved back navigation works through the production guard when the document cannot be cached',async()=>{
 const visits:string[]=[],server=createServer((req,res)=>{visits.push(req.url!);res.writeHead(200,{'content-type':'text/html','cache-control':'no-store'});res.end(req.url==='/next'?'<h1>Next</h1>':'<h1>Home</h1><a href="/next">Next</a>');});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const cwd=await mkdtemp(resolve(tmpdir(),'jev-back-'));
 try{
  const {port}=server.address() as {port:number};
  const {stdout}=await promisify(execFile)(process.execPath,['--import',import.meta.resolve('tsx'),'--import',pathToFileURL(resolve('tests/fixtures/limit-provider.mjs')).href,resolve('runner/public-site.ts'),`http://127.0.0.1:${port}/`,'Go to the next page and return','--reviewed','--max-actions','2','--interval-ms','1000'],{cwd,env:{...process.env,AI_GATEWAY_API_KEY:'LOCAL_TEST_ONLY',TEST_LIMIT_MODE:'back'},timeout:30000});
  const summary=JSON.parse(stdout.trim().split('\n').at(-1)!);assert.equal(summary.reason,'JEV_DONE');assert.equal(summary.actionCount,2);
  assert.equal(visits.filter(url=>url==='/').length,2);assert.equal(summary.finalURL,`http://127.0.0.1:${port}/`);
 }finally{await new Promise<void>((r,e)=>server.close(err=>err?e(err):r()));}
});

test('automatic GET-form submissions never reach their destination',async()=>{
 const seen:string[]=[],server=createServer((req,res)=>{
  seen.push(req.url!);res.writeHead(200,{'content-type':'text/html'});
  res.end(`<form action="/sent" method="get"><input name="x" value="1"><button>Send</button></form><script>document.forms[0].${req.url==='/form'?'submit()':'requestSubmit()'}</script>`);
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const cwd=await mkdtemp(resolve(tmpdir(),'jev-unsolicited-'));
 try{
  const {port}=server.address() as {port:number};
  for(const path of ['/form','/request-submit']){
   const {stdout}=await promisify(execFile)(process.execPath,['--import',import.meta.resolve('tsx'),resolve('runner/public-site.ts'),`http://127.0.0.1:${port}${path}`,'read','--reviewed','--interval-ms','1000'],{cwd,env:{...process.env,AI_GATEWAY_API_KEY:'',TYPESAFE_API_KEY:''},timeout:30000});
   const summary=JSON.parse(stdout.trim().split('\n').at(-1)!);assert.equal(summary.reason,'SAFETY_BOUNDARY');
  }
  assert.ok(!seen.some(path=>path.startsWith('/sent')),'an unauthorized GET must be blocked before the request');
 }finally{await new Promise<void>((r,e)=>server.close(err=>err?e(err):r()));}
});

test('bounded same-origin client redirects finish before the first observation',async()=>{
 const seen:string[]=[],server=createServer((req,res)=>{
  seen.push(req.url!);res.writeHead(200,{'content-type':'text/html'});
  const routes:Record<string,string>={'/start':'/second','/second':'/landing','/file':'/private.pdf','/external':'https://example.invalid/'};
  const target=routes[req.url!]??(req.url?.startsWith('/loop/')?`/loop/${Number(req.url.split('/').at(-1))+1}`:undefined);
  res.end(target?`<script>location.replace(${JSON.stringify(target)})</script>`:'<h1>Landing page</h1>');
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const cwd=await mkdtemp(resolve(tmpdir(),'jev-client-redirect-'));
 try{
  const {port}=server.address() as {port:number};
  for(const [path,reason] of [['/start','DECISION_ERROR'],['/file','UNSUPPORTED_CONTENT'],['/external','SAFETY_BOUNDARY'],['/loop/0','SAFETY_BOUNDARY']]){
   const {stdout}=await promisify(execFile)(process.execPath,['--import',import.meta.resolve('tsx'),resolve('runner/public-site.ts'),`http://127.0.0.1:${port}${path}`,'read','--reviewed','--interval-ms','1000'],{cwd,env:{...process.env,AI_GATEWAY_API_KEY:'',TYPESAFE_API_KEY:''},timeout:30000});
   const summary=JSON.parse(stdout.trim().split('\n').at(-1)!);assert.equal(summary.reason,reason,path);
   const result=JSON.parse(await readFile(resolve(summary.report,'../exploration/result.json'),'utf8'));
   if(path==='/start'){
    assert.equal(summary.finalURL,`http://127.0.0.1:${port}/landing`);
    assert.equal(result.steps[0].state.screen.title,'Landing page');
   }else assert.equal(result.steps.length,0,'blocked navigation must not be judged as a screen');
  }
  assert.ok(!seen.includes('/private.pdf'));
  assert.ok(seen.includes('/loop/3'));assert.ok(!seen.includes('/loop/4'),'at most three client redirect hops');
 }finally{await new Promise<void>((r,e)=>server.close(err=>err?e(err):r()));}
});

test('public CLI uses opt-in goal checks and finishes after the last needed observation',async()=>{
 const server=createServer((_req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end('<p>Condition A</p><div style="height:1100px"></div><p>Condition B</p><div style="height:400px"></div>');});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const cwd=await mkdtemp(resolve(tmpdir(),'jev-goal-checks-'));
 try{
  const {port}=server.address() as {port:number};
  const {stdout}=await promisify(execFile)(process.execPath,['--import',import.meta.resolve('tsx'),'--import',pathToFileURL(resolve('tests/fixtures/limit-provider.mjs')).href,resolve('runner/public-site.ts'),`http://127.0.0.1:${port}/`,'Read conditions A and B','--reviewed','--max-actions','1','--interval-ms','1000','--goal-check','A','--goal-check','B'],{cwd,env:{...process.env,AI_GATEWAY_API_KEY:'LOCAL_TEST_ONLY',TEST_LIMIT_MODE:'memory-gated'},timeout:30000});
  const summary=JSON.parse(stdout.trim().split('\n').at(-1)!);
  const result=JSON.parse(await readFile(resolve(summary.report,'../exploration/result.json'),'utf8'));
  assert.deepEqual(result.steps[0].decision.goalAssessment.checks.map((c:any)=>c.choice),['present','absent']);
  assert.equal(result.steps[0].decision.action.type,'scroll');
  assert.equal(result.steps[0].decision.frontier.mode,'select');
  assert.equal(result.reason,'JEV_DONE');assert.equal(result.actionCount,1);assert.equal(result.steps.length,2);
  assert.deepEqual(result.steps[1].decision.goalAssessment.checks.map((c:any)=>c.choice),['present','present']);
  assert.deepEqual(result.steps[1].decision.probabilities,{});
  assert.equal(result.objectiveSuccess,null);assert.deepEqual(result.settings.goalChecks,['A','B']);
  const checkpoint=JSON.parse(await readFile(resolve(summary.report,'../exploration/evidence-session.json'),'utf8'));
  assert.ok(checkpoint.entries.length>0);assert.ok(checkpoint.accounting.logicalCalls>0);
  assert.deepEqual(result.evidenceSession.accounting,checkpoint.accounting);
  assert.deepEqual(result.path[0].remainingGoalChecks,['B']);
 }finally{await new Promise<void>((r,e)=>server.close(err=>err?e(err):r()));}
});

test('public decisions receive previously observed facts after scrolling them offscreen',async()=>{
 const server=createServer((_req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end('<p>Condition A</p><div style="height:1100px"></div><p>Condition B</p><div style="height:400px"></div>');});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const cwd=await mkdtemp(resolve(tmpdir(),'jev-memory-'));
 try{
  const {port}=server.address() as {port:number};
  const {stdout}=await promisify(execFile)(process.execPath,['--import',import.meta.resolve('tsx'),'--import',pathToFileURL(resolve('tests/fixtures/limit-provider.mjs')).href,resolve('runner/public-site.ts'),`http://127.0.0.1:${port}/`,'Read conditions A and B','--reviewed','--max-actions','2','--interval-ms','1000'],{cwd,env:{...process.env,AI_GATEWAY_API_KEY:'LOCAL_TEST_ONLY',TEST_LIMIT_MODE:'memory'},timeout:30000});
  const summary=JSON.parse(stdout.trim().split('\n').at(-1)!);
  const result=JSON.parse(await readFile(resolve(summary.report,'../exploration/result.json'),'utf8'));
  assert.equal(result.reason,'JEV_DONE');assert.equal(result.actionCount,1);
  assert.ok(!result.steps[1].state.screen.text.includes('Condition A'));
  assert.ok(result.steps[1].state.history[0].observedText.includes('Condition A'));
  assert.ok(!result.steps[0].state.history.some((h:any)=>h.observedText?.includes('Condition B')));
 }finally{await new Promise<void>((r,e)=>server.close(err=>err?e(err):r()));}
});

test('the last permitted action is observed and judged without executing an extra action',async()=>{
 const server=createServer((_req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end('<h1>Home</h1><details><summary>Details</summary><p>Answer visible</p></details>');});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const cwd=await mkdtemp(resolve(tmpdir(),'jev-limit-'));
 try{
  const {port}=server.address() as {port:number};
  for(const mode of ['done','continue']){
   const {stdout}=await promisify(execFile)(process.execPath,['--import',import.meta.resolve('tsx'),'--import',pathToFileURL(resolve('tests/fixtures/limit-provider.mjs')).href,resolve('runner/public-site.ts'),`http://127.0.0.1:${port}/`,'Read the answer','--reviewed','--max-actions','1','--interval-ms','1000'],{cwd,env:{...process.env,AI_GATEWAY_API_KEY:'LOCAL_TEST_ONLY',TEST_LIMIT_MODE:mode},timeout:30000});
   const summary=JSON.parse(stdout.trim().split('\n').at(-1)!);
   const result=JSON.parse(await readFile(resolve(summary.report,'../exploration/result.json'),'utf8'));
   assert.equal(result.reason,mode==='done'?'JEV_DONE':'ACTION_LIMIT');
   assert.equal(result.actionCount,1);
   assert.equal(result.steps.length,2,'must observe and judge the result of the final action');
   assert.ok(result.steps[1].state.screen.text.includes('Answer visible'));
   assert.ok(Object.keys(result.steps[1].candidates).some(k=>k.startsWith('e')),'do not bias the final judgment by removing action candidates');
  }
 }finally{await new Promise<void>((r,e)=>server.close(err=>err?e(err):r()));}
});

test('a blocked embedded frame does not prevent observing the main document',async()=>{
 const server=createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end('<h1>Public home</h1><iframe src="https://example.invalid/widget"></iframe>');});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const cwd=await mkdtemp(resolve(tmpdir(),'jev-frame-'));
 try{
  const address=server.address() as {port:number};
  const {stdout}=await promisify(execFile)(process.execPath,['--import',import.meta.resolve('tsx'),resolve('runner/public-site.ts'),`http://127.0.0.1:${address.port}/`,'read','--reviewed','--interval-ms','1000'],{cwd,env:{...process.env,AI_GATEWAY_API_KEY:'',TYPESAFE_API_KEY:''},timeout:30000});
  const summary=JSON.parse(stdout.trim().split('\n').at(-1)!);
  const result=JSON.parse(await readFile(resolve(summary.report,'../exploration/result.json'),'utf8'));
  assert.equal(result.steps.length,1);
  assert.equal(result.steps[0].state.screen.title,'Public home');
  assert.equal(result.reason,'DECISION_ERROR'); // No credentials: observation works, no paid API call.
 }finally{await new Promise<void>((r,e)=>server.close(err=>err?e(err):r()));}
});

test('CLI records blocked and non-HTML pages without requesting a Jev decision',async()=>{
 const server=createServer((req,res)=>{
  if(req.url==='/redirect'){res.writeHead(302,{location:'https://example.invalid/'});res.end();}
  else if(req.url==='/blocked'){res.writeHead(403,{'content-type':'text/html'});res.end('<h1>Forbidden</h1>');}
  else {res.writeHead(200,{'content-type':'text/plain'});res.end('not HTML');}
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 try{
  const address=server.address() as {port:number};
  for(const [path,reason] of [['/blocked','SAFETY_BOUNDARY'],['/redirect','SAFETY_BOUNDARY'],['/plain','UNSUPPORTED_CONTENT']]){
   const {stdout}=await promisify(execFile)(process.execPath,['--import','tsx',resolve('runner/public-site.ts'),`http://127.0.0.1:${address.port}${path}`,'read','--reviewed','--interval-ms','1000'],{timeout:30000});
   const summary=JSON.parse(stdout.trim().split('\n').at(-1)!);
   assert.equal(summary.reason,reason);
   assert.equal(summary.actionCount,0);
   const result=JSON.parse(await readFile(resolve(summary.report,'../exploration/result.json'),'utf8'));
   assert.equal(result.steps.length,0);
   assert.equal(result.objectiveSuccess,null);
   assert.equal(result.perceivedSuccess,false);
  }
 }finally{await new Promise<void>((r,e)=>server.close(err=>err?e(err):r()));}
});

test('CLI follows vetted same-origin redirects, but never fetches external, file or looping destinations',async()=>{
 const seen:string[]=[],server=createServer((req,res)=>{
  seen.push(req.url!);
  const redirects:Record<string,string>={'/canonical':'/canonical/','/chain':'/external','/external':'https://example.invalid/','/file':'/private.pdf','/loop':'/loop'};
  if(redirects[req.url!]){res.writeHead(301,{location:redirects[req.url!]});res.end();}
  else{
   res.writeHead(200,{'content-type':'text/html'});
   if(req.url==='/language')res.end(`<h1>${req.headers['accept-language']?.startsWith('ja-JP')&&req.headers.accept?.includes('text/html')?'Japanese page':'Wrong negotiation'}</h1>`);
   else res.end('<h1>Canonical page</h1><div style="height:2000px"></div><h1 id="fees">Fees section</h1>');
  }
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const cwd=await mkdtemp(resolve(tmpdir(),'jev-redirect-'));
 try{
  const address=server.address() as {port:number};
  for(const [path,reason] of [['/canonical','DECISION_ERROR'],['/canonical#fees','DECISION_ERROR'],['/language','DECISION_ERROR'],['/chain','SAFETY_BOUNDARY'],['/file','UNSUPPORTED_CONTENT'],['/loop','SAFETY_BOUNDARY']]){
   const {stdout}=await promisify(execFile)(process.execPath,['--import',import.meta.resolve('tsx'),resolve('runner/public-site.ts'),`http://127.0.0.1:${address.port}${path}`,'read','--reviewed','--interval-ms','1000'],{cwd,env:{...process.env,AI_GATEWAY_API_KEY:'',TYPESAFE_API_KEY:''},timeout:30000});
   const summary=JSON.parse(stdout.trim().split('\n').at(-1)!);
   assert.equal(summary.reason,reason,path);
   const result=JSON.parse(await readFile(resolve(summary.report,'../exploration/result.json'),'utf8'));
   if(path==='/canonical'){
    assert.equal(result.finalURL,`http://127.0.0.1:${address.port}/canonical/`);
    assert.equal(result.steps[0].state.screen.title,'Canonical page');
   }else if(path==='/canonical#fees'){
    assert.equal(result.finalURL,`http://127.0.0.1:${address.port}/canonical/#fees`);
    assert.equal(result.steps[0].state.screen.title,'Fees section');
   }else if(path==='/language')assert.equal(result.steps[0].state.screen.title,'Japanese page');
   else assert.equal(result.steps.length,0);
  }
  assert.equal(seen.filter(path=>path==='/canonical/').length,2,'one vetted HTML fetch per trial, no duplicate fetch');
  assert.ok(seen.includes('/external'),'each intermediate redirect was checked');
  assert.ok(!seen.includes('/private.pdf'),'file was rejected before fetching');
  assert.equal(seen.filter(path=>path==='/loop').length,1,'repeated URLs stop before refetch');
 }finally{await new Promise<void>((r,e)=>server.close(err=>err?e(err):r()));}
});
