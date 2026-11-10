import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

// Both origins are owned loopback fixtures. No public site, form submission,
// external-policy exception or changed production allowlist is involved.
const root=resolve('reports',`scope-isolation-${new Date().toISOString().replaceAll(':','-')}`);await mkdir(root,{recursive:true});
const hits:{server:string;path:string}[]=[],runs:any[]=[];let originA='',originB='';
const answer='<h1>図書室の開館時間</h1><p>開館時間：午前9時から午後5時までです。</p>';
const head='<html lang="ja"><meta charset="utf-8"><style>body{font:20px sans-serif;padding:32px;color:#111;background:#fff}h1{font-size:28px}</style>';
const make=(id:string)=>createServer((req,res)=>{
 const path=new URL(req.url!,'http://localhost').pathname;hits.push({server:id,path});
 res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
 if(path.startsWith('/answer/'))res.end(head+answer+'</html>');
 else{
  const token=path.split('/').at(-1),destination=path.startsWith('/cross/')?originB:originA;
  res.end(head+`<h1>図書室 利用案内</h1><p>利用前にこちらをご確認ください。</p><a href="${destination}/answer/${token}">開館時間を見る</a></html>`);
 }
});
const a=make('A'),b=make('B');
await new Promise<void>(r=>a.listen(0,'127.0.0.1',r));await new Promise<void>(r=>b.listen(0,'127.0.0.1',r));
originA=`http://127.0.0.1:${(a.address() as {port:number}).port}`;originB=`http://127.0.0.1:${(b.address() as {port:number}).port}`;
const goal='図書室の開館時間を知りたい。予約・問い合わせはしない。';
try{
 for(const [i,mode] of ['same','cross','cross','same','direct-answer'].entries()){
  const token=`run-${i+1}`,url=mode==='direct-answer'?`${originB}/answer/${token}`:`${originA}/${mode}/${token}`;
  const started=performance.now();
  try{
   const {stdout}=await promisify(execFile)(process.execPath,['--import',import.meta.resolve('tsx'),resolve('runner/public-site.ts'),url,goal,'--reviewed','--vision','--image-only','--image-memory','--image-memory-proof','--max-actions','0','--interval-ms','1000'],{cwd:resolve('.'),env:process.env,timeout:120000,maxBuffer:4*1024*1024});
   await writeFile(join(root,`${token}.log`),stdout);
   const summary=JSON.parse(stdout.trim().split('\n').at(-1)!),file=resolve(summary.report,'../exploration/result.json'),bytes=await readFile(file),result=JSON.parse(bytes.toString());
   const answerHits=hits.filter(h=>h.path===`/answer/${token}`),blocked=result.steps[0]?.state.screen.elements.filter((e:any)=>e.available===false).map((e:any)=>({id:e.id,label:e.text,reason:e.unavailableReason}))??[];
   if(mode==='cross')assert.equal(answerHits.length,0,'an unapproved origin must never be fetched');
   runs.push({mode,token,url,goal,reason:result.reason,actions:result.actionCount,elapsedMs:result.elapsedMs,wallMs:performance.now()-started,blocked,answerHits,source:file,sha256:createHash('sha256').update(bytes).digest('hex'),modelDone:result.perceivedSuccess,objectiveSuccess:result.objectiveSuccess});
   console.log(JSON.stringify({mode,reason:result.reason,actions:result.actionCount,answerHits:answerHits.length,blocked:blocked.length}));
  }catch(error){runs.push({mode,token,url,status:'EXPERIMENT_ERROR',code:typeof (error as any)?.code==='number'?(error as any).code:'UNKNOWN',wallMs:performance.now()-started});console.log(JSON.stringify({mode,status:'EXPERIMENT_ERROR'}));}
  await writeFile(join(root,'scope.json'),JSON.stringify({root,goal,method:'Same visible local page and answer content, same-origin versus another loopback origin; fresh browsers, unmodified production CLI, live Jev, then direct-answer control. No public-site requests.',runs,hits},null,2));
 }
}finally{await Promise.all([new Promise<void>(r=>a.close(()=>r())),new Promise<void>(r=>b.close(()=>r()))]);}
console.log(JSON.stringify({root,runs:runs.map(({mode,reason,actions,answerHits,status})=>({mode,reason,actions,answerHits:answerHits?.length,status}))}));
