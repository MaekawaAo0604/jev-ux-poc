import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createServer} from 'vite';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {run} from '../runner/engine.js';
import {GoodPage} from '../pages/GoodPage.js';
import {AutoPage} from '../pages/AutoPage.js';
import {fakeDecide} from '../jev/fake.js';
import type {Decider} from '../jev/types.js';
test('browser boundaries: visibility, ablation, false done, stuck, limit, loop',async()=>{
 const server=await createServer({server:{host:'127.0.0.1',port:0},logLevel:'error'});await server.listen();
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
 const dir=await mkdtemp(join(tmpdir(),'jev-ux-test-'));const baseURL=server.resolvedUrls!.local[0].replace(/\/$/,'');
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  await page.route('**/*',r=>new URL(r.request().url()).origin===baseURL?r.continue():r.abort());
  await page.goto(baseURL+'/good/');const pom=new GoodPage(page);
  const withFont=await pom.observe(true),withoutFont=await pom.observe(false);
  assert.deepEqual({...withFont,elements:withFont.elements.map(({fontSizePx,...e})=>e),regions:withFont.regions?.map(({fontSizePx,...r})=>r)},withoutFont);
  assert.ok(withFont.elements.some(e=>e.text.startsWith('請求書')));
  const auto=new AutoPage(page);
  assert.deepEqual((await auto.observe(false)).elements.map(e=>e.text).sort(),withoutFont.elements.map(e=>e.text).sort());
  await page.evaluate(()=>{
    const host=document.createElement('div');
    host.innerHTML='<button>新しい機能</button><button hidden>秘密</button><button disabled>無効</button><div style="opacity:0"><button>透明</button></div><button aria-label="内部ヒント" style="position:fixed;top:10000px">画面外</button>';
    document.querySelector('main')!.prepend(host);
  });
  const dynamic=await auto.observe(false);
  assert.ok(dynamic.elements.some(e=>e.text==='新しい機能'));
  assert.ok(!dynamic.elements.some(e=>['秘密','無効','透明','画面外','内部ヒント'].includes(e.text)));
  await page.getByRole('link',{name:'請求書',exact:true}).evaluate(e=>(e as HTMLElement).style.display='none');
  assert.ok(!(await pom.observe(false)).elements.some(e=>e.text.startsWith('請求書')));
  await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
  await page.close();
  const choose=(key:string):Decider=>async(_state,c)=>({action:c[key].action,choice:key,probabilities:Object.fromEntries(Object.keys(c).map(k=>[k,k===key?1:0])),model:'TEST'});
  for(const [key,expected] of [['done','DONE_WITHOUT_SUCCESS'],['stuck','STUCK']] as const){
   const p=await browser.newPage();const r=await run(p,choose(key),{variant:'good',goal:'invoice',font:false,maxActions:20,dir:join(dir,key),baseURL,repeat:1,fake:true});assert.equal(r.reason,expected);assert.equal(r.status,'FAILED');await p.close();
  }
  const home:Decider=async(s,c)=>choose(s.screen.elements.find(e=>e.text==='マイページ')!.id)(s,c);
  for(const [maxActions,expected] of [[1,'ACTION_LIMIT'],[0,'LOOP']] as const){
   const p=await browser.newPage();const r=await run(p,home,{variant:'good',goal:'invoice',font:false,maxActions,dir:join(dir,expected),baseURL,repeat:1,fake:true});assert.equal(r.reason,expected);await p.close();
  }
  for(const pom of ['manual','auto'] as const){
   const p=await browser.newPage();
   const r=await run(p,fakeDecide,{variant:'good',goal:'notifications',font:false,maxActions:2,dir:join(dir,`both-${pom}`),baseURL,repeat:1,fake:true,pom,success:'both'});
   assert.equal(r.objectiveSuccess,true);assert.equal(r.perceivedSuccess,false);assert.equal(r.comparison,'SUCCESS_NOT_RECOGNIZED');await p.close();
   const p2=await browser.newPage();
   const r2=await run(p2,fakeDecide,{variant:'good',goal:'notifications',font:false,maxActions:20,dir:join(dir,`confirmed-${pom}`),baseURL,repeat:1,fake:true,pom,success:'both'});
   assert.equal(r2.reason,'SUCCESS');assert.equal(r2.perceivedSuccess,true);assert.equal(r2.actionCount,2);assert.equal(r2.steps.length,3);
   assert.ok(!JSON.stringify(r2.steps[2].state).includes('objectiveSuccess'));await p2.close();
  }
  const p3=await browser.newPage();
  const subjective=await run(p3,choose('done'),{variant:'good',goal:'invoice',font:false,maxActions:20,dir:join(dir,'jev'),baseURL,repeat:1,fake:true,pom:'auto',success:'jev'});
  assert.equal(subjective.status,'PERCEIVED_SUCCESS');assert.equal(subjective.objectiveSuccess,false);assert.equal(subjective.comparison,'FALSE_COMPLETION');await p3.close();
  const p4=await browser.newPage();
  const auditStart=performance.now();
  const audited=await run(p4,choose('done'),{variant:'good',goal:'invoice',font:false,maxActions:20,dir:join(dir,'audit-failure'),baseURL,repeat:1,fake:false,pom:'auto',success:'jev'},async auditState=>{
   assert.ok(!JSON.stringify(auditState).includes('objectiveSuccess'));await new Promise(r=>setTimeout(r,300));throw new Error('audit unavailable');
  });
  assert.equal(audited.reason,'JEV_DONE');assert.equal(audited.actionCount,0);assert.equal(audited.completionAudit.status,'ERROR');
  assert.ok(performance.now()-auditStart-audited.elapsedMs>=250,'navigation timing excludes the 300ms audit');
  assert.equal(audited.steps[0].decision.choice,'done');assert.equal(audited.objectiveSuccess,false);await p4.close();
 }finally{await browser.close();await server.close();}
});
