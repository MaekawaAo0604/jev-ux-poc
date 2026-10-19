import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {report} from './report.js';

// Truth labels and canvas positions are evaluator-only and never sent to Jev.
const scenarios=[
 {id:'stopped',goal:'メール通知を停止したい',frames:[['メール通知を停止しました','現在の設定：停止']],required:[0],achievable:true},
 {id:'blocked',goal:'メール通知を停止したい',frames:[['メール通知は受信中です','このプランでは停止できません','停止設定は利用できません']],required:[0],achievable:false},
 {id:'blocked-information',goal:'現在のプランでメール通知を停止できるか知りたい',frames:[['メール通知は受信中です','このプランでは停止できません','停止設定は利用できません']],required:[0],achievable:true},
 {id:'split',goal:'月額料金とサポートの受付時間を知りたい',frames:[['月額料金：1,200円（税込）'],['サポート受付：平日10時〜17時'],['このページの案内は以上です']],required:[0,1],achievable:true},
];
let active=scenarios[0];
const server=createServer((_request,response)=>{
 const frames=active.frames;
 response.writeHead(200,{'content-type':'text/html; charset=utf-8'});
 response.end(`<!doctype html><meta charset="utf-8"><style>body{margin:0;height:${frames.length*1100}px;background:#f4f6fa;color:#142e40;font:24px sans-serif}canvas{position:absolute;left:48px;background:white;border:1px solid #bbb}</style><p style="margin:12px 48px">ご利用案内</p>${frames.map((_,i)=>`<canvas style="top:${80+i*1100}px" width="1050" height="330"></canvas>`).join('')}<script>const frames=${JSON.stringify(frames)};document.querySelectorAll('canvas').forEach((canvas,i)=>{const g=canvas.getContext('2d');g.fillStyle='#142e40';g.font='38px sans-serif';frames[i].forEach((line,j)=>g.fillText(line,36,80+j*75));});</script>`);
});
await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=(server.address() as {port:number}).port;
const root=resolve('reports',`vision-outcomes-${new Date().toISOString().replaceAll(':','-')}`);
await mkdir(root,{recursive:true});
const results:any[]=[],evaluations:any[]=[];
try{
 for(let repeat=1;repeat<=2;repeat++)for(const scenario of scenarios){
  active=scenario;
  const {stdout}=await promisify(execFile)(process.execPath,['--import',import.meta.resolve('tsx'),resolve('runner/public-site.ts'),`http://127.0.0.1:${port}/`,scenario.goal,'--reviewed','--vision','--max-actions','0','--interval-ms','1000'],{maxBuffer:4*1024*1024});
  const summary=JSON.parse(stdout.trim().split('\n').at(-1)!);
  const result=JSON.parse(await readFile(resolve(summary.report,'../exploration/result.json'),'utf8'));
  const fullyObserved=scenario.frames.map((_,i)=>result.steps.some((s:any)=>s.state.screen.viewport.top<=80+i*1100&&s.state.screen.viewport.bottom>=410+i*1100));
  const expected=scenario.achievable&&scenario.required.every(i=>fullyObserved[i])?'supported':'insufficient';
  const audit=result.visualCompletionAudit;
  const evaluation={scenario:scenario.id,repeat,expected,fullyObserved,explorationReason:result.reason,actions:result.actionCount,reportedAuditStatus:audit.status,reportedAssessment:audit.assessment,semanticMatch:audit.status==='RECORDED'?audit.assessment===expected:null,evidence:audit.evidence.map((o:any)=>o.id),auditMs:audit.elapsedMs,report:summary.report};
  evaluations.push(evaluation);results.push({...result,variant:scenario.id,repeat});
  await writeFile(join(root,'evaluations.json'),JSON.stringify({note:'Expected labels are derived outside Jev from controlled canvas content and recorded viewport coverage. No model answers are repaired. Instrument errors are separate from insufficient observations.',evaluations},null,2));
  await report(root,results);console.log(JSON.stringify(evaluation));
 }
}finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
console.log(`Report: ${join(root,'index.html')}`);
