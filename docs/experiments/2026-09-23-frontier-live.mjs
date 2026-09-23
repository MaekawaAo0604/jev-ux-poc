// Real Jev, owned local fixtures. No requests to third-party target sites.
import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {AutoPage} from '../../pages/AutoPage.ts';
import {candidatesFor} from '../../jev/types.ts';
import {ExplorationMemory} from '../../runner/exploration-memory.ts';
import {chooseFrontier} from '../../jev/frontier.ts';
import {evaluateChoices,safeRequestFailure} from '../../jev/client.ts';
process.loadEnvFile('.env');
const root=resolve('reports',`frontier-validation-${new Date().toISOString().replaceAll(':','-')}`);
await mkdir(root,{recursive:true});
const pages={
 '/branch/':'<h1>施設案内</h1><a href="/branch/guide">ご利用案内</a> <a href="/branch/about">施設について</a>',
 '/branch/guide':'<h1>ご利用案内</h1><p>館内では静かにお過ごしください。</p><a href="/branch/">トップへ</a>',
 '/branch/about':'<h1>施設について</h1><a href="/branch/faq">よくある質問</a>',
 '/branch/faq':'<h1>よくある質問</h1><h2>当日再入場の条件</h2><p>当日に限り再入場できます。出口で受付印を受け、戻るときに受付印のある入場券を提示してください。</p>',
 '/duplicates/':'<h1>サービス案内</h1><section><h2>託児サービス</h2><a href="/duplicates/childcare">詳細を見る</a></section><section><h2>当日再入場の条件</h2><a href="/duplicates/reentry">詳細を見る</a></section>',
 '/duplicates/childcare':'<h1>託児サービス</h1><p>託児サービスは予約制です。</p><a href="/duplicates/">戻る</a>',
 '/duplicates/reentry':'<h1>当日再入場の条件</h1><p>当日に限り再入場できます。入場券を出口で提示して受付印を受け、再入場時にその券を提示してください。</p>',
 '/route/':'<h1>トップ</h1><a href="/route/menu">案内メニュー</a>',
 '/route/menu':'<h1>案内メニュー</h1><a href="/route/lower">その他の案内</a> <a href="/route/jobs">採用情報</a>',
 '/route/lower':'<h1>その他の案内</h1><a href="/route/answer">当日再入場の条件</a> <a href="/route/">トップへ</a>',
 '/route/jobs':'<h1>採用情報</h1>',
 '/route/answer':'<h1>当日再入場の条件</h1><p>当日に限り再入場できます。受付印のある入場券を提示してください。</p>',
};
const visits=[];
const server=createServer((req,res)=>{visits.push(req.url);res.writeHead(pages[req.url]?200:404,{'content-type':'text/html; charset=utf-8'});res.end(`<!doctype html><html lang="ja"><meta charset="utf-8"><main>${pages[req.url]??''}</main></html>`);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`,rows=[];
const goal='当日再入場の条件を確認したい。予約・購入はしない。';
try{
 for(const id of ['branch','duplicates']){
  const began=performance.now(),firstVisit=visits.length;
  try{
   const {stdout}=await promisify(execFile)(process.execPath,['--import',import.meta.resolve('tsx'),resolve('runner/public-site.ts'),`${origin}/${id}/`,goal,'--reviewed','--interval-ms','1000','--goal-check','当日再入場の条件'],{cwd:process.cwd(),maxBuffer:1024*1024});
   const summary=JSON.parse(stdout.trim().split('\n').at(-1));
   const result=JSON.parse(await readFile(resolve(summary.report,'../exploration/result.json'),'utf8'));
   const hasAnswer=result.steps.some(step=>step.state.screen.text.some(text=>text.includes('受付印')));
   rows.push({id,kind:'goal-only-from-start',passed:result.reason==='JEV_DONE'&&hasAnswer,reason:result.reason,actions:result.actionCount,elapsedMs:performance.now()-began,modelCalls:result.evidenceSession.accounting.logicalCalls,report:summary.report,path:visits.slice(firstVisit),navigation:result.steps.filter(s=>s.decision?.frontier).map(s=>({target:s.decision.frontier.label,mode:s.decision.frontier.mode})),maxActionInputBytes:Math.max(0,...result.evidenceSession.requests.filter(r=>r.stage==='action-selection').map(r=>r.inputBytes))});
  }catch(error){rows.push({id,passed:false,failure:safeRequestFailure(error)});}
  console.log(JSON.stringify(rows.at(-1)));
 }
 // A seeded route is a routing diagnostic, not a claim of autonomous discovery.
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage(),pom=new AutoPage(page),memory=new ExplorationMemory();
  await page.goto(`${origin}/route/`);
  const observe=async()=>{
   const screen=await pom.observe(false),candidates=candidatesFor(screen,false),keys={};
   for(const element of screen.elements)keys[element.id]=await page.getByRole('link',{name:element.text,exact:true}).getAttribute('href');
   const offer=memory.observe(page.url(),screen,candidates,keys,Object.keys(keys));
   return {screen,candidates:offer.candidates,offer};
  };
  let current=await observe();
  for(const label of ['案内メニュー','その他の案内','トップへ']){
   const id=current.screen.elements.find(e=>e.text===label).id;
   await pom.act(current.candidates[id].action);memory.executed(current.offer,id);current=await observe();
  }
  let modelCalls=0;const navigation=[],began=performance.now();
  for(let hop=0;hop<3;hop++){
   const decision=await chooseFrontier({goal,currentDate:'2026-09-23',screen:current.screen,history:[]},current.candidates,memory.frontier(current.offer),['当日再入場の条件'],async(state,questions)=>{modelCalls++;return evaluateChoices(state,questions,{maxAttempts:3,maxElapsedMs:15000,retryDelaysMs:[1000,2000],retryInvalidResponse:true});});
   if(!decision.frontier)break;
   navigation.push({target:decision.frontier.label,mode:decision.frontier.mode});
   memory.commit(current.offer,decision.frontier.targetId,decision.frontier.focus);
   await pom.act(decision.action);memory.executed(current.offer,decision.choice);current=await observe();
  }
  rows.push({id:'known-route',kind:'seeded-observed-path-real-browser-real-Jev',passed:current.screen.text.some(t=>t.includes('受付印'))&&modelCalls===1,modelCalls,navigation,elapsedMs:performance.now()-began});
  console.log(JSON.stringify(rows.at(-1)));
 }catch(error){rows.push({id:'known-route',passed:false,failure:safeRequestFailure(error)});}
 finally{await browser.close();}
}finally{await new Promise(r=>server.close(r));}
await writeFile(resolve(root,'results.json'),JSON.stringify({realJev:true,thirdPartyTargetRequests:0,goal,rows},null,2)+'\n');
console.log(JSON.stringify({report:resolve(root,'results.json'),passed:rows.filter(r=>r.passed).length,total:rows.length}));
