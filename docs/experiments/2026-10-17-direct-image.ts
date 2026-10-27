// Throwaway ablation probe. Calls the unchanged production public explorer.
// Truth is consumed by the measurement preload only, never the model request.
import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {measureReliability} from '../../runner/reliability-measurement.js';
import {report} from '../../runner/report.js';

const arg=(name:string,fallback:string)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1]};
const mode=arg('--mode','off'),repeats=Number(arg('--repeat','2')),fake=process.argv.includes('--fake'),production=process.argv.includes('--production');
if(!['off','ocr'].includes(mode)||!Number.isSafeInteger(repeats)||repeats<1)throw new Error('Invalid probe options');
type Fact={id:string;text:string};type View={dom?:Fact[];frames?:Fact[][];links?:{id:string;text:string;path:string;image?:boolean}[]};
type Case={id:string;goal:string;required:string[];achievable:boolean;pages:Record<string,View>};
const price={id:'price',text:'月額料金：1,200円（税込）'},hours={id:'hours',text:'サポート受付：平日10時〜17時'};
const receiving={id:'receiving',text:'メール通知は受信中です'},blocked={id:'unavailable',text:'このプランでは停止できません'};
const goal='月額料金とサポートの受付時間を知りたい';
const all:Case[]=[
 {id:'image-links',goal:'月額料金を知りたい',required:['price'],achievable:true,pages:{
  '/':{links:[]},'/a':{frames:[[price]]},'/b':{dom:[{id:'news',text:'会社のお知らせ'}]},'/c':{dom:[{id:'contact',text:'お問い合わせのご案内'}]},
 }},
 {id:'image-complete',goal,required:['price','hours'],achievable:true,pages:{'/':{frames:[[price,hours]]}}},
 {id:'image-partial',goal,required:['price','hours'],achievable:true,pages:{'/':{frames:[[price]]}}},
 {id:'blocked-operation',goal:'メール通知を停止したい',required:['receiving','unavailable'],achievable:false,pages:{'/':{frames:[[receiving,blocked]]}}},
 {id:'availability-information',goal:'現在のプランでメール通知を停止できるか知りたい',required:['receiving','unavailable'],achievable:true,pages:{'/':{frames:[[receiving,blocked]]}}},
 {id:'split-image-history',goal,required:['price','hours'],achievable:true,pages:{'/':{frames:[[price],[hours]]}}},
 {id:'branch-image-history',goal,required:['price','hours'],achievable:true,pages:{
  '/':{links:[{id:'price-link',text:'サービス料金のご案内',path:'/a'},{id:'hours-link',text:'サポート受付のご案内',path:'/b'}]},'/a':{frames:[[price]]},'/b':{frames:[[hours]]},
 }},
];
const names=arg('--cases',all.map(c=>c.id).join(',')).split(','),cases=all.filter(c=>names.includes(c.id));
if(cases.length!==names.length)throw new Error('Unknown case');
let active=cases[0];
const esc=(s:unknown)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const server=createServer((req,res)=>{
 const view=active.pages[req.url??'/']??{},frames=view.frames??[];
 const links=(view.links??[]).map(l=>`<a data-probe="${esc(l.id)}" href="${esc(l.path)}">${l.image?`<canvas width="360" height="110" data-lines="[]" data-label="${esc(l.text)}"></canvas>`:esc(l.text)}</a>`).join('');
 const body=`<!doctype html><meta charset="utf-8"><style>body{margin:0;min-height:${frames.length>1?frames.length*1100:900}px;background:#f4f6fa;color:#142e40;font:24px sans-serif}main{padding:24px 48px}nav{display:flex;gap:24px;margin-top:80px}a{display:block}p{margin:24px 0}canvas{background:white}.fact{position:absolute;left:48px}</style><main><h1 data-probe="title">ご利用案内</h1>${(view.dom??[]).map(f=>`<p data-probe="${esc(f.id)}" data-fact="${esc(f.id)}">${esc(f.text)}</p>`).join('')}<nav>${links}</nav></main>${frames.map((lines,i)=>`<canvas class="fact" width="1250" height="330" style="top:${100+i*1100}px" data-lines="${esc(JSON.stringify(lines))}"></canvas>`).join('')}<script>for(const c of document.querySelectorAll('canvas')){const g=c.getContext('2d');g.fillStyle='#142e40';g.font='38px sans-serif';if(c.dataset.label)g.fillText(c.dataset.label,20,65);else JSON.parse(c.dataset.lines).forEach((line,i)=>g.fillText(line.text,36,80+i*75));}</script>`;
 res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(body);
});
await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
const port=(server.address() as {port:number}).port,root=resolve('reports',`${production?'production-':''}direct-image-${mode}-${new Date().toISOString().replaceAll(':','-')}`);
await mkdir(root,{recursive:true});console.log(JSON.stringify({root,mode,fake}));
const trials:any[]=[],results:any[]=[];
try{
 for(let repeat=1;repeat<=repeats;repeat++)for(const scenario of cases){
  active=structuredClone(scenario);
  // Move the correct image link between positions; route strings disclose no label.
  if(active.id==='image-links'){
   const labels=[{id:'news-link',text:'お知らせ',path:'/b',image:true},{id:'price-link',text:'月額料金',path:'/a',image:true},{id:'contact-link',text:'お問い合わせ',path:'/c',image:true}];
   active.pages['/'].links=repeat%2?labels:[labels[1],labels[2],labels[0]];
  }
  const views=Object.values(active.pages),facts=[...new Map([price,hours,receiving,blocked,...views.flatMap(v=>[...(v.dom??[]),...(v.frames??[]).flat()])].map(f=>[f.id,f])).values()];
  const effects=Object.fromEntries(views.flatMap(v=>(v.links??[]).map(l=>[l.id,{path:l.path}])));
  const oracle={marker:randomUUID(),achievable:active.achievable,requiredFacts:active.required,facts,effects};
  const started=performance.now();
  const child=await promisify(execFile)(process.execPath,['--import',import.meta.resolve('tsx'),'--import',pathToFileURL(resolve('tests/fixtures/reliability-probe.mjs')).href,...(production?[]:['--import',pathToFileURL(resolve('docs/experiments/2026-10-17-direct-image-preload.mjs')).href]),resolve('runner/public-site.ts'),`http://127.0.0.1:${port}/`,active.goal,'--reviewed','--vision',...(mode==='ocr'?['--vision-ocr']:[]),'--max-actions','0','--interval-ms','1000'],{env:{...process.env,JEV_DIRECT_IMAGE_MODE:mode,JEV_DIRECT_IMAGE_LABELS:active.id==='image-links'?'1':'0',JEV_RELIABILITY_ORACLE:JSON.stringify(oracle),JEV_RELIABILITY_FAKE:fake?'1':'0',...(fake?{AI_GATEWAY_API_KEY:'LOCAL_TEST_ONLY'}:{})},maxBuffer:16*1024*1024});
  const lines=child.stdout.trim().split('\n'),summary=JSON.parse(lines.at(-1)!);
  const result=JSON.parse(await readFile(resolve(summary.report,'../exploration/result.json'),'utf8'));
  const events=lines.filter(s=>s.startsWith('RELIABILITY ')).map(s=>JSON.parse(s.slice(12)));
  const input={oracle,result,captures:events.filter(e=>e.event==='capture'),wires:events.filter(e=>e.event==='wire'),effects:events.filter(e=>e.event==='effect')};
  const measured=measureReliability(input),requests=result.steps.at(-1)?.visualContext?.requests??[];
  const verification=requests.filter((r:any)=>r.stage==='verification'),decisions=requests.filter((r:any)=>r.stage==='decision');
  const offProven=mode!=='off'||requests.length>0&&result.steps.every((s:any)=>(production?s.visualContext?.ocrStatus==='disabled':s.visualContext?.ocrDiagnostics.some((d:any)=>d.engine==='probe-ocr'&&d.status==='disabled'))&&s.visualContext.visualMemory.length===0)&&verification.length===0&&input.wires.every((w:any)=>w.imageHashes.length<=1||w.kind==='audit');
  if(!offProven)throw new Error('OCR removal was not proven');
  const clicks=result.steps.filter((s:any)=>s.recordedAction?.action==='click');
  const expectedPath=active.id==='image-links'?'/a':undefined;
  const firstClick=clicks[0],firstClickPath=firstClick?new URL(firstClick.recordedAction.urlAfter).pathname:undefined;
  const summaryTrial={scenario:active.id,repeat,mode,fake,reason:result.reason,actions:result.actionCount,elapsedMs:result.elapsedMs,totalMs:performance.now()-started,report:relative(root,summary.report).replaceAll('\\','/'),offProven,requests:requests.length,verificationRequests:verification.length,verificationMs:verification.reduce((s:number,r:any)=>s+r.elapsedMs,0),decisionMs:decisions.reduce((s:number,r:any)=>s+r.elapsedMs,0),...(expectedPath?{firstClickPath,correctFirstClick:firstClickPath===expectedPath}:{}),...measured};
  trials.push(summaryTrial);results.push({...result,variant:active.id,repeat,fake,reliability:measured});
  await writeFile(join(root,`${active.id}-${repeat}.json`),JSON.stringify({oracle,input,measured},null,2));
  await writeFile(join(root,'probe.json'),JSON.stringify({experimental:true,production,mode,fake,repeats,trials},null,2));
  await report(root,results);
  console.log(JSON.stringify(summaryTrial));
 }
}finally{await new Promise<void>((r,e)=>server.close(error=>error?e(error):r()));}
console.log(JSON.stringify({root,mode,fake,trials:trials.length}));
