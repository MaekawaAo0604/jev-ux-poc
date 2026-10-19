import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {chromium} from 'playwright';
import {captureVisualObservation,recordVisualCompletion} from '../runner/visual-evidence.js';
import {jevVisualDecide} from '../jev/decide.js';
import {candidatesFor,type State} from '../jev/types.js';

// Explicit opt-in: real API calls, not a mocked semantic oracle. The normal
// offline suite skips this test. Saved frames and raw answers are retained.
test('live visual exploration and audit distinguish action outcomes from learning availability',{skip:process.env.JEV_LIVE_SEMANTICS!=='1'},async(t)=>{
 try{process.loadEnvFile('.env');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 const root=resolve('reports',`visual-semantics-live-${new Date().toISOString().replaceAll(':','-')}`);
 await mkdir(root,{recursive:true});
 const browser=await chromium.launch({headless:true});
 const blocked=['メール通知は受信中です','このプランでは停止できません','停止設定は利用できません'];
 const cases=[
  {id:'blocked-operation',goal:'メール通知を停止したい',lines:blocked,expected:'insufficient'},
  {id:'stopped-operation',goal:'メール通知を停止したい',lines:['メール通知を停止しました','現在の設定：停止'],expected:'supported'},
  {id:'blocked-information',goal:'現在のプランでメール通知を停止できるか知りたい',lines:blocked,expected:'supported'},
 ];
 try{
  for(const scenario of cases)await t.test(scenario.id,async()=>{
   const dir=join(root,scenario.id);await mkdir(dir,{recursive:true});
   const page=await browser.newPage({viewport:{width:1440,height:1000},locale:'ja-JP'});
   try{
    await page.setContent('<!doctype html><meta charset="utf-8"><style>body{margin:0;height:1100px;background:#f4f6fa;color:#142e40;font:24px sans-serif}canvas{position:absolute;left:48px;top:80px;background:white;border:1px solid #bbb}</style><p style="margin:12px 48px">ご利用案内</p><canvas width="1050" height="330"></canvas>');
    await page.locator('canvas').evaluate((canvas,lines)=>{const g=(canvas as HTMLCanvasElement).getContext('2d')!;g.fillStyle='#142e40';g.font='38px sans-serif';lines.forEach((line,j)=>g.fillText(line,36,80+j*75));},scenario.lines);
    const observations=[];
    for(let step=1;step<=3;step++){
     if(step===2)await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
     const file=step===3?'final.png':`step-${step}.png`;
     const bytes=await page.screenshot({path:join(dir,file)});
     observations.push(captureVisualObservation(bytes,step,file,'http://local.test/'));
    }
    const top=await page.evaluate(()=>window.scrollY);
    const state:State={goal:scenario.goal,currentDate:'2026-10-16',screen:{title:'',text:[],warnings:[],elements:[],canScrollUp:true,canScrollDown:false,pageId:'p1',viewport:{top,bottom:top+1000,height:1000}},history:[{screen:'',action:'下にスクロール',result:'画面: ',observedText:['ご利用案内'],pageId:'p1',viewport:{top:0,bottom:1000,height:1000}}]};
    const bytes=await page.screenshot();
    const navigation=[];
    // Fixed repetitions, not retries until success. The offered scroll remains
    // legitimate, so an unavailable operation may stop or continue, but not done.
    const repetitions=scenario.id==='blocked-operation'?12:3;
    for(let repeat=1;repeat<=repetitions;repeat++)navigation.push(await jevVisualDecide(state,candidatesFor(state.screen,false),bytes));
    const audit=await recordVisualCompletion(scenario.goal,'2026-10-16',dir,observations);
    await writeFile(join(dir,'result.json'),JSON.stringify({goal:scenario.goal,expected:scenario.expected,state,navigation,audit},null,2));
    assert.equal(audit.status,'RECORDED');
    assert.equal(audit.assessment,scenario.expected);
    for(const decision of navigation){
     if(scenario.id==='blocked-operation')assert.notEqual(decision.action.type,'done');
     else assert.equal(decision.action.type,'done');
    }
   }finally{await page.close();}
  });
 }finally{await browser.close();console.log(`Live visual semantics records: ${root}`);}
});
