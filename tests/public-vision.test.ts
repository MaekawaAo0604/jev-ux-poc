import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve} from 'node:path';
import {readFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

for(const [eager,proof] of [[false,false],[true,false],[true,true]])test(`public image memory wires prior judgments through Back and completes across screens (eager: ${eager}, proof: ${proof})`,async()=>{
 const server=createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end(req.url==='/wrong'?'<h1>DOM_SENTINEL dead end</h1>':req.url==='/answer'?'<h1>DOM_SENTINEL hours</h1>':'<h1>DOM_SENTINEL price</h1><a href="/wrong">DOM_SENTINEL first</a><a href="/answer">DOM_SENTINEL second</a>');});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const cwd=await mkdtemp(resolve(tmpdir(),'jev-image-memory-public-'));
 try{
  const {port}=server.address() as {port:number};
  const {stdout}=await promisify(execFile)(process.execPath,['--import',import.meta.resolve('tsx'),'--import',pathToFileURL(resolve('tests/fixtures/image-memory-provider.mjs')).href,resolve('runner/public-site.ts'),`http://127.0.0.1:${port}/`,'料金を知りたい。受付時間を知りたい。','--reviewed','--vision','--image-only','--image-memory',...(proof?['--image-memory-proof']:[]),'--interval-ms','1000'],{cwd,env:{...process.env,AI_GATEWAY_API_KEY:'LOCAL_TEST_ONLY',...(eager?{TEST_IMAGE_MEMORY_EAGER:'1'}:{}),...(proof?{TEST_IMAGE_MEMORY_PROOF:'1'}:{})},timeout:40000});
  const summary=JSON.parse(stdout.trim().split('\n').at(-1)!),result=JSON.parse(await readFile(resolve(summary.report,'../exploration/result.json'),'utf8'));
  assert.equal(result.reason,'JEV_DONE');assert.equal(result.actionCount,3);assert.equal(result.backCount,1);
  assert.equal(new URL(result.finalURL).pathname,'/answer');assert.equal(result.completionAudit.status,'NOT_RUN');
  assert.equal(result.settings.visualJudgmentMemory,'enabled');
  if(proof){
   assert.equal(result.settings.completionEvidenceImages,'selected-sources');
   const checks=result.steps.at(-1).visualContext.requests.filter((r:any)=>r.completionProof);
   assert.equal(checks.length,1);assert.equal(checks[0].completionProof.imageCount,2);
   for(const source of checks[0].completionProof.sources){
    const png=await readFile(resolve(summary.report,`../exploration/step-${source.step}.png`));
    assert.equal(createHash('sha256').update(png).digest('hex'),source.sha256);
   }
   const html=await readFile(summary.report,'utf8');assert.ok(html.includes('完了照合だけ'));
  }
  assert.equal(result.steps[3].decision.completionCheck.evidenceGuard.supported,true);
  assert.equal(result.steps[3].decision.completionCheck.trigger,eager?'image-evidence':'primary-done');
  assert.equal(result.steps[3].decision.completionCheck.initialDecision.action.type,eager?'back':'done');
  const memory=result.steps[3].visualContext.imageJudgments;
  assert.deepEqual(memory.requirements.map((r:any)=>r.status),['observed','observed']);
  assert.equal(memory.requirements[0].records[0].source.step,1);assert.equal(memory.requirements[1].records.at(-1).source.step,4);
  const route=JSON.parse(stdout.split('\n').find(line=>line.startsWith('MEMORY_ROUTE '))!.slice(13));
  assert.equal(route.source.step,1);assert.ok(result.steps.every((s:any)=>s.visualContext.ocrStatus==='disabled'));
 }finally{await new Promise<void>((r,e)=>server.close(err=>err?e(err):r()));}
});

test('image-only public history records an executed disclosure no-op exactly once',async()=>{
 const server=createServer((_req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end('<h1>DOM_SENTINEL</h1><button aria-expanded="false" aria-controls="panel" onclick="this.dataset.clicked=\'yes\'">DOM_SENTINEL button</button><div id="panel" hidden>DOM_SENTINEL panel</div>');});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const cwd=await mkdtemp(resolve(tmpdir(),'jev-image-only-noop-'));
 try{
  const {port}=server.address() as {port:number};
  const {stdout}=await promisify(execFile)(process.execPath,['--import',import.meta.resolve('tsx'),'--import',pathToFileURL(resolve('tests/fixtures/image-only-provider.mjs')).href,resolve('runner/public-site.ts'),`http://127.0.0.1:${port}/`,'Find the answer','--reviewed','--vision','--image-only','--interval-ms','1000'],{cwd,env:{...process.env,AI_GATEWAY_API_KEY:'LOCAL_TEST_ONLY',TEST_IMAGE_ONLY_NOOP:'1'},timeout:30000});
  const summary=JSON.parse(stdout.trim().split('\n').at(-1)!),result=JSON.parse(await readFile(resolve(summary.report,'../exploration/result.json'),'utf8'));
  assert.equal(result.steps[0].result,'ACTION_NOOP');assert.equal(result.reason,'STUCK');assert.equal(result.actionCount,1);
  const wire=stdout.split('\n').filter(line=>line.startsWith('IMAGE_ONLY_REQUEST ')).map(line=>JSON.parse(line.slice(19)));
  assert.deepEqual(wire.at(-1).context.history,[{step:1,pageId:'p1',viewport:{top:0,bottom:1000,height:1000},action:{type:'click',elementId:'e1'},result:'no-visible-change'}]);
 }finally{await new Promise<void>((r,e)=>server.close(err=>err?e(err):r()));}
});

test('image-only public CLI stays isolated through retry, dead end, Back, committed route and completion',async()=>{
 const server=createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end(req.url?.includes('/wrong')?'<h1>DOM_SENTINEL dead end</h1>':req.url?.includes('/answer')?'<h1>DOM_SENTINEL answer</h1>':'<title>DOM_SENTINEL title</title><h1>DOM_SENTINEL start</h1><a href="/DOM_SENTINEL/wrong">DOM_SENTINEL first</a><a href="/DOM_SENTINEL/answer">DOM_SENTINEL other</a>');});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const cwd=await mkdtemp(resolve(tmpdir(),'jev-image-only-public-'));
 try{
  const {port}=server.address() as {port:number};
  const {stdout}=await promisify(execFile)(process.execPath,['--import',import.meta.resolve('tsx'),'--import',pathToFileURL(resolve('tests/fixtures/image-only-provider.mjs')).href,resolve('runner/public-site.ts'),`http://127.0.0.1:${port}/`,'Find the answer','--reviewed','--vision','--image-only','--interval-ms','1000'],{cwd,env:{...process.env,AI_GATEWAY_API_KEY:'LOCAL_TEST_ONLY'},timeout:40000});
  const summary=JSON.parse(stdout.trim().split('\n').at(-1)!),result=JSON.parse(await readFile(resolve(summary.report,'../exploration/result.json'),'utf8'));
  assert.equal(result.reason,'JEV_DONE');assert.equal(result.actionCount,3);assert.equal(result.backCount,1);
  assert.equal(new URL(result.finalURL).pathname,'/DOM_SENTINEL/answer');
  assert.equal(result.settings.observationMode,'image-only');assert.equal(result.settings.completionAuditInput,'disabled');
  assert.equal(result.completionAudit.status,'NOT_RUN');assert.equal(result.visualCompletionAudit.status,'RECORDED');
  assert.equal(result.steps[0].decision.request.attempts,2,'the retried request is isolated too');
  assert.equal(result.steps[2].decision.frontier.mode,'continue');
  const wire=stdout.split('\n').filter(line=>line.startsWith('IMAGE_ONLY_REQUEST ')).map(line=>JSON.parse(line.slice(19)));
  assert.ok(wire.length>=6);assert.ok(wire.some(r=>r.context.targets));assert.ok(wire.some(r=>r.questions.completionCoverage));
  assert.deepEqual(wire.at(-1).context.history.map((h:any)=>h.action.type),['click','back','click']);
  assert.ok(result.steps.every((s:any)=>s.visualContext.ocrStatus==='disabled'));
 }finally{await new Promise<void>((r,e)=>server.close(err=>err?e(err):r()));}
});

test('the production public entry point numbers image links and runs without OCR',async()=>{
 const server=createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end(req.url==='/answer'?'<h1>Answer</h1>':'<h1>Start</h1><a href="/noise"><canvas width="150" height="80"></canvas></a><a href="/answer"><canvas width="150" height="80"></canvas></a>');});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const cwd=await mkdtemp(resolve(tmpdir(),'jev-numbered-public-'));
 try{
  const {port}=server.address() as {port:number};
  const {stdout}=await promisify(execFile)(process.execPath,['--import',import.meta.resolve('tsx'),'--import',pathToFileURL(resolve('tests/fixtures/vision-provider.mjs')).href,resolve('runner/public-site.ts'),`http://127.0.0.1:${port}/`,'Find the answer','--reviewed','--vision','--interval-ms','1000'],{cwd,env:{...process.env,AI_GATEWAY_API_KEY:'LOCAL_TEST_ONLY',TEST_VISION_NUMBERING:'1'},timeout:30000});
  const summary=JSON.parse(stdout.trim().split('\n').at(-1)!);
  const result=JSON.parse(await readFile(resolve(summary.report,'../exploration/result.json'),'utf8'));
  assert.equal(result.reason,'JEV_DONE');assert.equal(result.actionCount,1);assert.equal(new URL(result.finalURL).pathname,'/answer');
  assert.deepEqual(result.steps[0].visualTargets.map((t:any)=>t.id),['e1','e2']);
  assert.equal(result.steps[0].recordedAction.target.anonymousId,'e2');
  assert.equal(result.settings.visualTextMemory,'disabled');
  assert.ok(result.steps.every((s:any)=>s.visualContext.ocrStatus==='disabled'&&s.visualContext.requests.every((r:any)=>r.stage==='decision')));
 }finally{await new Promise<void>((r,e)=>server.close(err=>err?e(err):r()));}
});

test('explicit legacy OCR mode still verifies image text without numbering the page',async()=>{
 const server=createServer((_req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end('<h1>Condition B</h1><canvas width="600" height="200"></canvas><script>const g=document.querySelector("canvas").getContext("2d");g.font="38px sans-serif";g.fillText("Extra image information",30,90)</script>');});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const cwd=await mkdtemp(resolve(tmpdir(),'jev-legacy-ocr-'));
 try{
  const {port}=server.address() as {port:number};
  const {stdout}=await promisify(execFile)(process.execPath,['--import',import.meta.resolve('tsx'),'--import',pathToFileURL(resolve('tests/fixtures/vision-provider.mjs')).href,resolve('runner/public-site.ts'),`http://127.0.0.1:${port}/`,'Read condition B','--reviewed','--vision','--vision-ocr','--interval-ms','1000'],{cwd,env:{...process.env,AI_GATEWAY_API_KEY:'LOCAL_TEST_ONLY'},timeout:45000});
  const summary=JSON.parse(stdout.trim().split('\n').at(-1)!),result=JSON.parse(await readFile(resolve(summary.report,'../exploration/result.json'),'utf8'));
  assert.equal(result.reason,'JEV_DONE');assert.equal(result.settings.visualTextMemory,'ocr-verified');assert.equal(result.settings.visualTargetMode,'legacy');
  assert.equal(result.steps[0].visualTargets,undefined);assert.equal(result.steps[0].visualContext.ocrStatus,'ready');
  assert.ok(result.steps[0].visualContext.requests.some((r:any)=>r.stage==='verification'));
 }finally{await new Promise<void>((r,e)=>server.close(err=>err?e(err):r()));}
});

test('public vision continues the committed alternative even when action selection repeats the wrong branch after Back',async()=>{
 const server=createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end(req.url==='/wrong'?'<h1>Dead end</h1><a href="/noise">Unrelated detail</a>':req.url==='/answer'?'<h1>Condition B</h1>':'<h1>Start</h1><a href="/wrong">First route</a><a href="/answer">Other route</a>');});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const cwd=await mkdtemp(resolve(tmpdir(),'jev-branch-vision-'));
 try{
  const {port}=server.address() as {port:number};
  const {stdout}=await promisify(execFile)(process.execPath,['--import',import.meta.resolve('tsx'),'--import',pathToFileURL(resolve('tests/fixtures/vision-provider.mjs')).href,resolve('runner/public-site.ts'),`http://127.0.0.1:${port}/`,'Read condition B','--reviewed','--vision','--interval-ms','1000'],{cwd,env:{...process.env,AI_GATEWAY_API_KEY:'LOCAL_TEST_ONLY',TEST_VISION_BRANCH:'1'},timeout:40000});
  const summary=JSON.parse(stdout.trim().split('\n').at(-1)!);
  const result=JSON.parse(await readFile(resolve(summary.report,'../exploration/result.json'),'utf8'));
  assert.equal(result.reason,'JEV_DONE');assert.equal(result.backCount,1);assert.equal(result.actionCount,3);
  assert.equal(result.steps[0].decision.frontier.selectionSource,'current-action');
  assert.equal(result.steps[1].decision.recovery.initialDecision.action.type,'stuck');
  assert.deepEqual(result.steps[1].state.observedAlternatives.flatMap((a:any)=>a.controls.map((c:any)=>c.label)),['「Other route」をクリック']);
  assert.equal(result.steps[2].state.history.at(-1).recoveryTarget,'「Other route」をクリック');
  assert.equal(result.steps[2].recordedAction.execution.url,`http://127.0.0.1:${port}/answer`);
  assert.equal(result.steps[2].decision.frontier.mode,'continue');
  assert.equal(result.steps[2].decision.frontier.targetId,result.steps[1].decision.frontier.targetId);
  assert.equal(result.steps[3].decision.completionCheck.assessment,'complete');
 }finally{await new Promise<void>((r,e)=>server.close(err=>err?e(err):r()));}
});

test('a valid current scroll reaches the browser without a redundant frontier veto',async()=>{
 const server=createServer((_req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end('<p>Condition A</p><div style="height:1100px"></div><p>Condition B</p><div style="height:400px"></div>');});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const cwd=await mkdtemp(resolve(tmpdir(),'jev-direct-action-'));
 try{
  const {port}=server.address() as {port:number};
  const {stdout}=await promisify(execFile)(process.execPath,['--import',import.meta.resolve('tsx'),'--import',pathToFileURL(resolve('tests/fixtures/vision-provider.mjs')).href,resolve('runner/public-site.ts'),`http://127.0.0.1:${port}/`,'Read conditions A and B','--reviewed','--vision','--interval-ms','1000'],{cwd,env:{...process.env,AI_GATEWAY_API_KEY:'LOCAL_TEST_ONLY',TEST_VISION_FRONTIER_VETO:'1'},timeout:30000});
  const summary=JSON.parse(stdout.trim().split('\n').at(-1)!);
  const result=JSON.parse(await readFile(resolve(summary.report,'../exploration/result.json'),'utf8'));
  assert.equal(result.reason,'JEV_DONE');assert.equal(result.actionCount,1);
  assert.equal(result.steps[0].recordedAction.action,'scroll');
  assert.equal(result.steps[0].decision.frontier.selectionSource,'current-action');
  assert.ok(result.steps[1].state.screen.text.includes('Condition B'));
 }finally{await new Promise<void>((r,e)=>server.close(err=>err?e(err):r()));}
});

test('a stopped exploration is visually audited without changing its original termination reason',async()=>{
 const server=createServer((_req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end('<p>Condition B</p>');});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const cwd=await mkdtemp(resolve(tmpdir(),'jev-stuck-audit-'));
 try{
  const {port}=server.address() as {port:number};
  const {stdout}=await promisify(execFile)(process.execPath,['--import',import.meta.resolve('tsx'),'--import',pathToFileURL(resolve('tests/fixtures/vision-provider.mjs')).href,resolve('runner/public-site.ts'),`http://127.0.0.1:${port}/`,'Read condition B','--reviewed','--vision','--interval-ms','1000'],{cwd,env:{...process.env,AI_GATEWAY_API_KEY:'LOCAL_TEST_ONLY',TEST_VISION_FORCE_STUCK:'1'},timeout:30000});
  const summary=JSON.parse(stdout.trim().split('\n').at(-1)!);
  const result=JSON.parse(await readFile(resolve(summary.report,'../exploration/result.json'),'utf8'));
  assert.equal(result.reason,'STUCK');assert.equal(result.perceivedSuccess,false);assert.equal(result.actionCount,0);
  assert.equal(result.visualCompletionAudit.status,'RECORDED');assert.equal(result.visualCompletionAudit.assessment,'supported');
 }finally{await new Promise<void>((r,e)=>server.close(err=>err?e(err):r()));}
});

test('public image decisions receive exactly the saved current screenshot, including the final observation',async()=>{
 const requests:string[]=[];
 const server=createServer((req,res)=>{requests.push(req.url!);res.writeHead(200,{'content-type':'text/html'});res.end('<p>Condition A</p><div style="height:1100px"></div><p>Condition B</p><div style="height:400px"></div>');});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const cwd=await mkdtemp(resolve(tmpdir(),'jev-public-vision-'));
 try{
  const {port}=server.address() as {port:number};
  const {stdout}=await promisify(execFile)(process.execPath,['--import',import.meta.resolve('tsx'),'--import',pathToFileURL(resolve('tests/fixtures/vision-provider.mjs')).href,resolve('runner/public-site.ts'),`http://127.0.0.1:${port}/`,'Read conditions A and B','--reviewed','--vision','--max-actions','1','--interval-ms','1000'],{cwd,env:{...process.env,AI_GATEWAY_API_KEY:'LOCAL_TEST_ONLY'},timeout:30000});
  const summary=JSON.parse(stdout.trim().split('\n').at(-1)!);
  const result=JSON.parse(await readFile(resolve(summary.report,'../exploration/result.json'),'utf8'));
  assert.equal(result.reason,'JEV_DONE');assert.equal(result.actionCount,1);assert.equal(result.steps.length,2);assert.equal(result.vision,true);
  const hashes=stdout.split('\n').filter(line=>line.startsWith('VISION_REQUEST ')).map(line=>JSON.parse(line.slice(15)).sha256);
  const saved=await Promise.all(result.steps.map(async(s:any)=>createHash('sha256').update(await readFile(resolve(result.dir,s.screenshot))).digest('hex')));
  assert.deepEqual(hashes,saved);assert.notEqual(hashes[0],hashes[1]);
  const inputs=stdout.split('\n').filter(line=>line.startsWith('VISION_REQUEST ')).map(line=>JSON.parse(line.slice(15)));
  assert.deepEqual(inputs.map(i=>i.imageHashes),saved.map(h=>[h]),'later decisions must not resend past images');
  const review=JSON.parse(stdout.split('\n').find(line=>line.startsWith('VISION_REVIEW '))!.slice(14));
  assert.deepEqual(review.imageHashes,[saved[1]],'completion uses the current image, with structured text history');
  assert.deepEqual(inputs[1].observations.map((o:any)=>[o.step,o.current]),[[2,true]]);
  assert.equal(inputs[1].observations[0].url,`http://127.0.0.1:${port}/`);
  assert.equal(result.settings.completionAuditInput,'dom-only');
  assert.equal(result.completionAudit.status,'RECORDED');
  assert.equal(result.visualCompletionAudit.status,'RECORDED');
  assert.equal(result.visualCompletionAudit.assessment,'supported');
  assert.deepEqual(result.visualCompletionAudit.observations.slice(0,-1).map((o:any)=>o.sha256),saved);
  assert.equal(result.visualCompletionAudit.observations.at(-1).phase,'final');
  assert.equal(requests.filter(url=>url==='/').length,1);
 }finally{await new Promise<void>((r,e)=>server.close(err=>err?e(err):r()));}
});

test('image-only changes during inference recovery discard stale pixels and trigger a fresh observation',async()=>{
 const server=createServer((_req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end('<p>Condition B</p><canvas width="600" height="400"></canvas><script>const c=document.querySelector("canvas");const g=c.getContext("2d");g.fillStyle="blue";g.fillRect(0,0,600,400);</script>');});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const cwd=await mkdtemp(resolve(tmpdir(),'jev-visual-recovery-'));
 try{
  const {port}=server.address() as {port:number};
  const {stdout}=await promisify(execFile)(process.execPath,['--import',import.meta.resolve('tsx'),'--import',pathToFileURL(resolve('tests/fixtures/vision-provider.mjs')).href,resolve('runner/public-site.ts'),`http://127.0.0.1:${port}/`,'Read condition B','--reviewed','--vision','--interval-ms','1000'],{cwd,env:{...process.env,AI_GATEWAY_API_KEY:'LOCAL_TEST_ONLY',TEST_VISION_CHANGE:'1'},timeout:30000});
  const summary=JSON.parse(stdout.trim().split('\n').at(-1)!);
  const result=JSON.parse(await readFile(resolve(summary.report,'../exploration/result.json'),'utf8'));
  assert.equal(result.reason,'JEV_DONE');assert.equal(result.actionCount,0);assert.equal(result.steps.length,2);
  assert.equal(result.steps[0].result,'REOBSERVE');assert.equal(result.steps[0].request.attempts,1);
  assert.deepEqual(result.steps[0].state.screen,result.steps[1].state.screen,'pixels change without a DOM observation change');
  const hashes=stdout.split('\n').filter(line=>line.startsWith('VISION_REQUEST ')).map(line=>JSON.parse(line.slice(15)).sha256);
  assert.equal(hashes.length,2);assert.notEqual(hashes[0],hashes[1]);
 }finally{await new Promise<void>((r,e)=>server.close(err=>err?e(err):r()));}
});
