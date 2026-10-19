import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

// Owned synthetic controls, not factual guidance about real 7-Zip. The exact
// same real-site Goal is sent; fixture answers/routes are never CLI hints.
const root=resolve('reports',`live-outcome-controls-${new Date().toISOString().replaceAll(':','-')}`);await mkdir(root,{recursive:true});
const goal='7-Zipでパスワードを忘れた場合に復元できるかと、壊れた7z書庫を修復する方法を知りたい。ダウンロード・インストール・問い合わせはしない。';
const cases=['complete','missing','complete','missing','blocked','direct'] as const;
const hits:{server:string;path:string}[]=[],runs:any[]=[];let originA='',originB='';
const head='<html lang="ja"><meta charset="utf-8"><style>body{font:22px sans-serif;padding:36px;line-height:1.6;color:#111;background:white}a{display:block;margin:18px 0}h1{font-size:30px}</style><p>検証専用の架空サイト</p>';
const password='<h1>7-Zipでパスワードを忘れた場合</h1><p>パスワードを忘れた場合、復元できません。パスワードを再設定する機能はありません。</p>';
const repair='<h1>壊れた7z書庫の修復方法</h1><p>開始ヘッダーだけが破損した場合は、まず書庫のコピーを作ります。16進エディタで開始ヘッダーを正しい値へ修正し、テストまたは展開で結果を確認します。暗号化のパスワード失念とは別の手順です。</p>';
const server=(id:string)=>createServer((req,res)=>{
 const u=new URL(req.url!,'http://local'),[mode,token,where='index']=u.pathname.split('/').filter(Boolean);hits.push({server:id,path:u.pathname});
 res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
 const menu=`<a href="/${mode}/${token}/index">利用案内へ戻る</a>`;
 let body='';
 if(where==='repair')body=repair+menu;
 else if(where==='password')body=(mode==='missing'?'<h1>パスワードと暗号化</h1><p>このページでは暗号化の方式について説明しています。暗号方式は AES-256 です。</p>':password)+menu;
 else if(mode==='direct')body=password+repair;
 else body=`<h1>7-Zip 利用案内</h1><a href="/${mode}/${token}/repair">壊れた7z書庫の修復方法</a><a href="${mode==='blocked'?originB:originA}/${mode}/${token}/password">パスワードを忘れた場合</a>`;
 res.end(head+body+'</html>');
});
const a=server('A'),b=server('B');await new Promise<void>(r=>a.listen(0,'127.0.0.1',r));await new Promise<void>(r=>b.listen(0,'127.0.0.1',r));
originA=`http://127.0.0.1:${(a.address() as {port:number}).port}`;originB=`http://127.0.0.1:${(b.address() as {port:number}).port}`;
const checkpoint=()=>writeFile(join(root,'controls.json'),JSON.stringify({root,goal,fixtureLabel:'Synthetic owned controls; not statements about actual 7-Zip capability.',method:'Six serial fresh-browser unmodified production CLI runs, actual Jev, original Goal, image-only with selected evidence; no answer/route hints. complete/missing paired, then blocked-origin and direct controls. 180-second diagnostic watchdog; no action cap.',runs,hits},null,2));
try{
 for(const [index,mode] of cases.entries()){
  const token=`trial-${index+1}`,url=`${originA}/${mode}/${token}/index`,started=performance.now();
  try{
   const {stdout}=await promisify(execFile)(process.execPath,['--import',import.meta.resolve('tsx'),resolve('runner/public-site.ts'),url,goal,'--reviewed','--vision','--image-only','--image-memory','--image-memory-proof','--interval-ms','1000','--max-actions','0'],{cwd:resolve('.'),env:process.env,timeout:180000,maxBuffer:8*1024*1024});
   await writeFile(join(root,token+'.log'),stdout);const summary=JSON.parse(stdout.trim().split('\n').at(-1)!);
   const source=resolve(summary.report,'../exploration/result.json'),bytes=await readFile(source),raw=JSON.parse(bytes.toString());
   const answerHits=hits.filter(h=>h.path===`/${mode}/${token}/password`);
   if(mode==='blocked')assert.equal(answerHits.length,0);
   runs.push({mode,token,url,source,sha256:createHash('sha256').update(bytes).digest('hex'),reason:raw.reason,actions:raw.actionCount,steps:raw.steps.length,elapsedMs:raw.elapsedMs,wallMs:performance.now()-started,modelDone:raw.perceivedSuccess,objectiveSuccess:raw.objectiveSuccess,audit:raw.visualCompletionAudit,items:raw.goalOutcome,answerHits});
   console.log(JSON.stringify({mode,reason:raw.reason,actions:raw.actionCount,audit:raw.visualCompletionAudit.assessment,items:raw.goalOutcome.items.map((i:any)=>i.status),answerGETs:answerHits.length}));
  }catch(error){runs.push({mode,token,url,status:'EXPERIMENT_ERROR',code:typeof (error as any)?.code==='number'?(error as any).code:'UNKNOWN',wallMs:performance.now()-started});console.log(JSON.stringify({mode,status:'EXPERIMENT_ERROR'}));}
  await checkpoint();
 }
}finally{await Promise.all([new Promise<void>(r=>a.close(()=>r())),new Promise<void>(r=>b.close(()=>r()))]);}
console.log(JSON.stringify({root,runs:runs.map(({mode,reason,actions,status})=>({mode,reason,actions,status}))}));
