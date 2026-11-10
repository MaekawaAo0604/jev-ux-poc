/** Controlled visual observations; actual Jev calls, no OCR/DOM text or answer hints in its input. */
import {chromium} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {VisualDecisionContext} from '../../jev/visual-context.js';
try{process.loadEnvFile('.env');}catch{}
const root=resolve('reports',`completion-proof-${new Date().toISOString().replaceAll(':','-')}`);
await mkdir(root,{recursive:true});
const browser=await chromium.launch(),page=await browser.newPage({viewport:{width:1000,height:700}});
const cases=[
 {id:'complete',goal:'星見センターの利用料金を知りたい。窓口の受付時間を知りたい。',frames:['<h1>星見センター 利用案内</h1><p>利用料金：大人 300円、中学生以下 無料</p>','<h1>星見センター 窓口案内</h1><p>窓口の受付時間：平日9時から17時。土日祝日は休み。</p>','<h1>星見センター</h1><p>ご案内一覧</p>']},
 {id:'partial',goal:'星見センターの利用料金を知りたい。窓口の受付時間を知りたい。',frames:['<h1>星見センター 利用案内</h1><p>利用料金：大人 300円、中学生以下 無料</p>','<h1>星見センター 窓口案内</h1><p>受付時間は後日発表します。</p>','<h1>星見センター</h1><p>ご案内一覧</p>']},
 {id:'cancelled',goal:'星見センターの利用料金を知りたい。窓口の受付時間を知りたい。',frames:['<h1>星見センター 利用案内</h1><p>利用料金：大人 300円、中学生以下 無料</p>','<h1>星見センター お知らせ</h1><p>以前の利用料金の案内は誤りでした。料金は未定です。</p><p>窓口の受付時間：平日9時から17時。土日祝日は休み。</p>','<h1>星見センター</h1><p>料金は未定です。窓口の受付時間：平日9時から17時。</p>']},
 {id:'operation-cancelled',goal:'星見センターの予約を確定したい。受付番号を確認したい。',frames:['<h1>星見センター 予約完了</h1><p>予約を確定しました。受付番号：H-8721</p>','<h1>星見センター 予約取消</h1><p>予約を取り消しました。予約はありません。受付番号 H-8721 は無効です。</p>','<h1>星見センター 予約状況</h1><p>予約はありません。予約は取り消されています。</p>']}
];
const results:any[]=[];
try{
 for(const fixture of cases){
  const dir=join(root,fixture.id);await mkdir(dir,{recursive:true});
  const context=new VisualDecisionContext(undefined,true,true,file=>readFile(join(dir,file)));
  const started=performance.now();
  try{
   for(const [i,html] of fixture.frames.entries()){
    await page.setContent(`<html lang="ja"><meta charset="utf-8"><style>body{font:26px sans-serif;margin:45px;line-height:1.8}</style>${html}</html>`);
    const file=`step-${i+1}.png`,bytes=await page.screenshot({path:join(dir,file)});
    context.capture(bytes,{step:i+1,file,pageId:`fixture-${i+1}`});
    await context.evaluate({goal:fixture.goal,currentDate:'2026-10-18',screen:{},history:[]},{nextAction:{type:'choice',instructions:'Choose',criteria:{done:'Done',stuck:'No further controls'}}},{maxAttempts:2,maxElapsedMs:60000,retryDelaysMs:[1000]});
   }
   const response=await context.evaluate({goal:fixture.goal,currentDate:'2026-10-18'},{completionCoverage:{type:'choice',instructions:'Check',criteria:{complete:'All',incomplete:'Missing',uncertain:'Unknown'}}},{maxAttempts:2,maxElapsedMs:60000,retryDelaysMs:[1000]});
   const snapshot=context.snapshot(),assessment=response.answers.completionCoverage.choice,guard=context.completionEvidence();
   const result={case:fixture.id,goal:fixture.goal,assessment,evidenceGuard:guard,wouldComplete:assessment==='complete'&&guard.supported,elapsedMs:performance.now()-started,snapshot};
   results.push(result);await writeFile(join(dir,'result.json'),JSON.stringify(result,null,2));
   console.log(JSON.stringify({case:fixture.id,assessment,wouldComplete:result.wouldComplete,guard,imageCount:snapshot.requests.at(-1)?.completionProof?.imageCount,elapsedMs:result.elapsedMs}));
  }catch(error){const result={case:fixture.id,status:'ERROR',error:error instanceof Error?error.message:'ERROR',snapshot:context.snapshot()};results.push(result);await writeFile(join(dir,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({case:fixture.id,status:'ERROR'}));}
  finally{await context.close();}
 }
 await writeFile(join(root,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({root}));
}finally{await browser.close();}
