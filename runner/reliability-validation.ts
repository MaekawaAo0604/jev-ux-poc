import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {measureReliability,type ReliabilityInput} from './reliability-measurement.js';
import {report} from './report.js';
const fake=process.argv.includes('--fake'),repeatFlag=process.argv.indexOf('--repeat'),repeats=repeatFlag<0?2:Number(process.argv[repeatFlag+1]);
if(!Number.isSafeInteger(repeats)||repeats<1)throw new Error('Invalid repeat count');
const fact=(id:string,text:string)=>({id,text});
const price=fact('price','月額料金：1,200円（税込）'),hours=fact('hours','サポート受付：平日10時〜17時');
const blocked=[fact('receiving','メール通知は受信中です'),fact('unavailable','このプランでは停止できません')];
const informationGoal='月額料金とサポートの受付時間を知りたい';
type Fact={id:string;text:string};
type FixturePage={dom:Fact[];frames:Fact[][];links?:{id:string;text:string;path:string}[]};
type Scenario=FixturePage&{id:string;goal:string;required:string[];achievable:boolean;navigation?:boolean;advanced?:boolean;pages?:Record<string,FixturePage>};
const notices=Array.from({length:4},(_,i)=>fact(`notice-${i+1}`,`お知らせ：サービスの利用案内 ${i+1}`));
const currentPrice=fact('current-price','現在の月額料金：2,200円（税込）'),oldPrice=fact('old-price','参考・旧料金：1,200円（税込）');
const allScenarios:Scenario[]=[
 {id:'dom-complete',goal:informationGoal,dom:[price,hours],frames:[],required:['price','hours'],achievable:true},
 {id:'dom-partial',goal:informationGoal,dom:[price],frames:[],required:['price','hours'],achievable:true},
 {id:'image-complete',goal:informationGoal,dom:[],frames:[[price,hours]],required:['price','hours'],achievable:true},
 {id:'image-partial',goal:informationGoal,dom:[],frames:[[price]],required:['price','hours'],achievable:true},
 {id:'blocked-operation',goal:'メール通知を停止したい',dom:[],frames:[blocked],required:['receiving','unavailable'],achievable:false},
 {id:'availability-information',goal:'現在のプランでメール通知を停止できるか知りたい',dom:[],frames:[blocked],required:['receiving','unavailable'],achievable:true},
 {id:'navigation-history',goal:informationGoal,dom:[price],frames:[],required:['price','hours'],achievable:true,navigation:true},
 {id:'split-image-history',goal:informationGoal,dom:[],frames:[[price],[hours]],required:['price','hours'],achievable:true},
 {id:'long-image-history',goal:informationGoal,dom:[],frames:[[price],...notices.map(n=>[n]),[hours]],required:['price','hours'],achievable:true,advanced:true},
 {id:'long-image-partial',goal:informationGoal,dom:[],frames:[[price],...notices.map(n=>[n]),[fact('end','ご利用案内は以上です')]],required:['price','hours'],achievable:true,advanced:true},
 {id:'branch-image-history',goal:informationGoal,dom:[],frames:[],required:['price','hours'],achievable:true,advanced:true,pages:{
  '/':{dom:[],frames:[],links:[{id:'service',text:'サービス料金のご案内',path:'/p1'},{id:'support',text:'サポート受付のご案内',path:'/p2'}]},
  '/p1':{dom:[],frames:[[price]]},'/p2':{dom:[],frames:[[hours]]},
 }},
 {id:'replacement-information',goal:'現在の月額料金とサポートの受付時間を知りたい',dom:[],frames:[],required:['current-price','hours'],achievable:true,advanced:true,pages:{
  '/':{dom:[oldPrice,fact('archive-notice','ここは旧プランの参考資料です。現在の料金は別ページに掲載しています。')],frames:[],links:[{id:'current',text:'現在の料金とサポートのご案内',path:'/p1'}]},
  '/p1':{dom:[],frames:[[currentPrice,hours]]},
 }},
];
const caseFlag=process.argv.indexOf('--cases'),names=caseFlag<0?undefined:process.argv[caseFlag+1]?.split(',');
const scenarios=names?allScenarios.filter(s=>names.includes(s.id)):allScenarios.filter(s=>!s.advanced);
if(!scenarios.length||names&&scenarios.length!==names.length)throw new Error('Unknown validation case');
let active=scenarios[0];
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
async function finish(root:string,trials:any[],repeats:number,fake:boolean){
 const totals=Object.fromEntries(Object.keys(trials[0].metrics).map(key=>[key,{checked:trials.reduce((s,t)=>s+t.metrics[key].checked,0),failed:trials.reduce((s,t)=>s+t.metrics[key].failed,0)}]));
 const labels:Record<string,string>={observation:'DOM観測の一致',images:'送信画像の一致',execution:'選択と実操作の一致',history:'履歴・画面IDの整合',routeContinuation:'確定済み経路の継続',retention:'観測済み情報の入力保持',memoryFidelity:'保持した文字と出典の一致',falseCompletion:'完了主張の必要根拠',separation:'検証用マーカーの非送信'};
 const reached=trials.filter(t=>t.reason==='JEV_DONE').length,abnormal=trials.filter(t=>!t.normalTermination).length,affected=trials.filter(t=>t.middlewareFailures>0).length;
 const cases=new Set(trials.map(t=>t.scenario)).size;
 const note=`<section class="completion-audit" id="reliability"><h2>ミドルウェアの信頼性検証${fake?'（固定応答による配線確認）':''}</h2><p>${cases}種の制御サイトで各${repeats}回、計${trials.length}試行。完了判断 ${reached}、未完了 ${trials.length-reached-abnormal}、異常終了 ${abnormal}。Goal未達そのものは不具合に数えていない。</p><p>測定不一致のある試行は ${affected}/${trials.length}。正解は検証側だけに保持し、実際の画面・送信画像・入力履歴・ブラウザ遷移と照合した。実サイト全般の信頼性を保証する結果ではない。</p>${Object.entries(totals).map(([key,t]:any)=>`<p>${esc(labels[key])}：確認 ${t.checked}、不一致 ${t.failed}${!t.checked?'（未測定）':''}</p>`).join('')}<p>情報保持は、一度観測した必要情報が以後の画面判断入力にも提供されているかを測る。同じ情報の欠落を複数リクエストで検出した場合も毎回数えるため、不一致の数は独立した不具合の数ではない。frontierの候補選択は対象外。画像の判読精度は測っていない。</p><p>完了主張の確認はJEV_DONEのみを分母とし、STUCKは未測定とする。必要情報が画面に出たかを照合しており、回答内容の意味まで独立検証したものではない。経路継続の確認は実際に該当ログがある場合だけ行う。</p><p>各試行の内訳と未測定項目は<a href="measurements.json">全測定結果</a>、原本は下のレポートを参照。観測済み画像の情報が消えるケースは、サイトのUXではなく現在の入力保持の制約として扱う。</p><details><summary>試行別の測定原本</summary><ul>${trials.map(t=>`<li><a href="${esc(t.scenario)}-${t.repeat}.json">${esc(t.scenario)} #${t.repeat}</a>：${esc(t.reason)}、不一致 ${t.middlewareFailures}</li>`).join('')}</ul></details></section>`;
 const file=join(root,'index.html'),html=await readFile(file,'utf8');
 await writeFile(file,html.replace('</header>','</header>'+note).replace(/<div class="overview">[\s\S]*?<\/div><p class="hint">/,'<p class="hint">'));
 await writeFile(join(root,'measurements.json'),JSON.stringify({fake,repeats,trials},null,2));
 await writeFile(join(root,'totals.json'),JSON.stringify({fake,repeats,totals,trials:trials.length},null,2));
 console.log(JSON.stringify({root,totals,trials:trials.length}));
}
const rescoreFlag=process.argv.indexOf('--rescore');
if(rescoreFlag>=0){
 const root=resolve(process.argv[rescoreFlag+1]),saved=JSON.parse(await readFile(join(root,'measurements.json'),'utf8')),results=[],trials=[];
 for(const previous of saved.trials){
  const file=join(root,`${previous.scenario}-${previous.repeat}.json`),data=JSON.parse(await readFile(file,'utf8'));
  data.measured=measureReliability(data.input);await writeFile(file,JSON.stringify(data,null,2));
  trials.push({...previous,...data.measured});results.push({...data.input.result,variant:previous.scenario,repeat:previous.repeat,fake:saved.fake,reliability:data.measured});
 }
 await report(root,results);await finish(root,trials,saved.repeats,saved.fake);process.exit(0);
}
const server=createServer((req,res)=>{
 let dom=active.dom,frames=active.frames,controls='';
 if(active.navigation){
  if(req.url==='/p1'){dom=[hours];controls='<a data-probe="home" href="/">トップに戻る</a>';}
  else if(req.url==='/p2'){dom=[];controls='<a data-probe="home" href="/">トップに戻る</a>';}
  else controls='<a data-probe="support" href="/p1">サポートのご案内</a> <a data-probe="news" href="/p2">会社のお知らせ</a>';
 }
 if(active.pages){const page=active.pages[req.url??'/']??active.pages['/'];dom=page.dom;frames=page.frames;controls=(page.links??[]).map(link=>`<a data-probe="${esc(link.id)}" href="${esc(link.path)}">${esc(link.text)}</a>`).join(' ');}
 const height=frames.length>1?frames.length*1100:900;
 const html=`<!doctype html><meta charset="utf-8"><style>body{margin:0;min-height:${height}px;background:#f4f6fa;color:#142e40;font:24px sans-serif}main{padding:24px 48px}p{margin:24px 0}a{display:inline-block;padding:12px}canvas{position:absolute;left:48px;background:white}h1{font-size:28px}</style><main><h1 data-probe="title">ご利用案内</h1>${dom.map(f=>`<p data-probe="${f.id}" data-fact="${f.id}">${esc(f.text)}</p>`).join('')}<p data-probe="hidden" hidden>非表示の料金：99,999円</p>${controls}</main>${frames.map((lines,i)=>`<canvas width="1250" height="330" style="top:${100+i*1100}px" data-lines="${esc(JSON.stringify(lines))}"></canvas>`).join('')}<script>for(const c of document.querySelectorAll('canvas')){const g=c.getContext('2d');g.fillStyle='#142e40';g.font='38px sans-serif';JSON.parse(c.dataset.lines).forEach((line,i)=>g.fillText(line.text,36,80+i*75));}</script>`;
 res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(html);
});
await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
const port=(server.address() as {port:number}).port,root=resolve('reports',`middleware-reliability-${new Date().toISOString().replaceAll(':','-')}`);await mkdir(root,{recursive:true});
const results:any[]=[],trials:any[]=[];
try{
 for(let repeat=1;repeat<=repeats;repeat++)for(const scenario of scenarios){
  active=scenario;const started=performance.now();
  const pages=[scenario,...Object.values(scenario.pages??{})];
  const facts=[...new Map([price,hours,...blocked,...pages.flatMap(p=>[...p.dom,...p.frames.flat()])].map(f=>[f.id,f])).values()];
  const effects=scenario.pages?Object.fromEntries(pages.flatMap(p=>(p.links??[]).map(link=>[link.id,{path:link.path}]))):{support:{path:'/p1'},news:{path:'/p2'},home:{path:'/'}};
  const oracle={marker:randomUUID(),achievable:scenario.achievable,requiredFacts:scenario.required,facts,effects};
  const child=await promisify(execFile)(process.execPath,['--import',import.meta.resolve('tsx'),'--import',pathToFileURL(resolve('tests/fixtures/reliability-probe.mjs')).href,resolve('runner/public-site.ts'),`http://127.0.0.1:${port}/`,scenario.goal,'--reviewed','--vision','--max-actions','0','--interval-ms','1000'],{env:{...process.env,JEV_RELIABILITY_ORACLE:JSON.stringify(oracle),JEV_RELIABILITY_FAKE:fake?'1':'0',...(fake?{AI_GATEWAY_API_KEY:'LOCAL_TEST_ONLY'}:{})},maxBuffer:8*1024*1024});
  const lines=child.stdout.trim().split('\n'),summary=JSON.parse(lines.at(-1)!);
  const result=JSON.parse(await readFile(resolve(summary.report,'../exploration/result.json'),'utf8'));
  const events=lines.filter(s=>s.startsWith('RELIABILITY ')).map(s=>JSON.parse(s.slice(12)));
  const input:ReliabilityInput={oracle,result,captures:events.filter(e=>e.event==='capture'),wires:events.filter(e=>e.event==='wire'),effects:events.filter(e=>e.event==='effect')};
  const measured=measureReliability(input),trial={scenario:scenario.id,repeat,fake,reason:result.reason,actions:result.actionCount,elapsedMs:performance.now()-started,report:summary.report,...measured};
  trials.push(trial);results.push({...result,variant:scenario.id,repeat,fake,reliability:measured});
  await writeFile(join(root,`${scenario.id}-${repeat}.json`),JSON.stringify({oracle,input,measured},null,2));
  await writeFile(join(root,'measurements.json'),JSON.stringify({fake,repeats,trials},null,2));await report(root,results);
  console.log(JSON.stringify({scenario:scenario.id,repeat,reason:result.reason,failures:measured.middlewareFailures}));
 }
 await finish(root,trials,repeats,fake);
}finally{await new Promise<void>((r,e)=>server.close(error=>error?e(error):r()));}
