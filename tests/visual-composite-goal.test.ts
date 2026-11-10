import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {chromium} from 'playwright';
import {jevVisualDecide} from '../jev/decide.js';
import {captureVisualObservation,recordVisualCompletion} from '../runner/visual-evidence.js';
import {candidatesFor,type State} from '../jev/types.js';
test('live image decisions require every requested condition, including qualifiers',{skip:process.env.JEV_LIVE_COMPOSITE!=='1'},async t=>{
 process.loadEnvFile('.env');
 const root=resolve('reports',`visual-composite-live-${new Date().toISOString().replaceAll(':','-')}`);await mkdir(root,{recursive:true});
 const browser=await chromium.launch();
 const goal='入館前のオンライン登録が必須かと、登録に使える身分証を知りたい';
 const cases=[
  {id:'missing-timing',goal,lines:['資料の閲覧には利用者登録が必要です。','登録には運転免許証またはパスポートが使えます。'],complete:false},
  {id:'missing-second-answer',goal,lines:['入館前のオンライン登録は必須です。'],complete:false},
  {id:'all-confirmed',goal,lines:['入館前のオンライン登録は必須です。','登録には運転免許証またはパスポートが使えます。'],complete:true},
  {id:'negative-answer-is-complete',goal,lines:['入館前のオンライン登録は不要です。当日窓口で登録できます。','登録には運転免許証またはパスポートが使えます。'],complete:true},
  {id:'simpler-goal',goal:'利用者登録が必要か知りたい',lines:['資料の閲覧には利用者登録が必要です。'],complete:true},
 ];
 try{for(const c of cases)await t.test(c.id,async()=>{
  const dir=join(root,c.id);await mkdir(dir,{recursive:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});
  try{
   await page.setContent('<meta charset="utf-8"><canvas width="1400" height="950"></canvas>');
   await page.locator('canvas').evaluate((el,lines)=>{const g=(el as HTMLCanvasElement).getContext('2d')!;g.fillStyle='white';g.fillRect(0,0,1400,950);g.fillStyle='#123';g.font='30px sans-serif';lines.forEach((s,i)=>g.fillText(s,30,80+i*90));},c.lines);
   const bytes=await page.screenshot({path:join(dir,'step-1.png')});
   const state:State={goal:c.goal,currentDate:'2026-10-16',history:[],screen:{title:'利用案内',text:[],elements:[],canScrollDown:false,canScrollUp:false}};
   const decisions=[];for(let i=0;i<3;i++)decisions.push(await jevVisualDecide(state,candidatesFor(state.screen,false),bytes));
   const audit=await recordVisualCompletion(c.goal,state.currentDate,dir,[captureVisualObservation(bytes,1,'step-1.png','http://fixture.test')]);
   await writeFile(join(dir,'result.json'),JSON.stringify({case:c,state,decisions,audit},null,2));
   assert.equal(audit.assessment,c.complete?'supported':'insufficient');
   for(const d of decisions)assert.equal(d.action.type==='done',c.complete);
  }finally{await page.close();}
 });}finally{await browser.close();console.log(root);}
});
