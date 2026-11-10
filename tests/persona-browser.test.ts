import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createServer} from 'vite';
import {readFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {run} from '../runner/engine.js';
import {parseCharter,parsePersona,publicExploration} from '../jev/persona.js';
import {fakeDecide} from '../jev/fake.js';

test('browser experiment preserves independent inputs, records after-state and resets between conditions',async()=>{
 const charter=parseCharter(JSON.parse(await readFile('experiments/persona/charter.json','utf8')));
 const persona=parsePersona(JSON.parse(await readFile('experiments/persona/persona-a.json','utf8')));
 const dir=await mkdtemp(join(tmpdir(),'jev-persona-'));
 const server=await createServer({server:{host:'127.0.0.1',port:0},logLevel:'error'});await server.listen();
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
 try{
  const baseURL=server.resolvedUrls!.local[0].replace(/\/$/,'');
  for(const [i,user] of [persona,undefined].entries()){
   const context=await browser.newContext({viewport:{width:1280,height:900}});
   await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(baseURL).origin?r.continue():r.abort());
   const page=await context.newPage();
   const result=await run(page,async(state,candidates)=>{
    assert.equal(state.goal,charter.goal);
    assert.equal(state.exploration?.persona?.id,user?.id);
    assert.ok(!JSON.stringify(state).includes('oracle'));
    return fakeDecide(state,candidates);
   },{variant:'bad',goal:charter.oracle,font:false,maxActions:15,dir:join(dir,String(i)),baseURL,repeat:1,fake:true,pom:'auto',success:'both',exploration:publicExploration({charter,...(user?{persona:user}:{})})});
   assert.equal(result.objectiveSuccess,true);assert.equal(result.actionCount,3);
   assert.equal(result.steps[0].state.screen.title,'マイページ');
   assert.equal(result.steps[0].state.screen.text.some((s:string)=>s.includes('停止しました')),false);
   assert.ok(result.steps.filter(s=>s.result==='OK').every(s=>s.outcome?.screen&&s.outcome?.screenshot));
   await context.close();
  }
  const page=await browser.newPage();
  const banned={...charter,prohibitedActions:{...charter.prohibitedActions,controlTexts:['その他']}};
  const result=await run(page,async(_state,candidates)=>{
   assert.ok(!Object.values(candidates).some(c=>c.label==='「その他」をクリック'));
   return {action:{type:'click',elementId:'not-offered'},choice:'not-offered',model:'TEST',probabilities:{}};
  },{variant:'bad',goal:charter.oracle,font:false,maxActions:15,dir:join(dir,'banned'),baseURL,repeat:1,fake:true,pom:'auto',success:'both',exploration:publicExploration({charter:banned})});
  assert.equal(result.reason,'ACTION_ERROR');assert.equal(result.actionCount,0);
  await page.close();
 }finally{await browser.close();await server.close();}
});
