import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {comparisonConfigs,validateConfig} from '../jev/virtual-beta/config.js';
import {modelInput,offeredCandidates,runBeta,sha,type BetaEvaluator} from '../runner/virtual-beta-core.js';
import {createUserState} from '../jev/virtual-beta/user-state.js';
import {parseCharter} from '../jev/persona.js';
import {replayDirectory} from '../runner/virtual-beta-replay.js';
const factors={informationChannel:'image-state',extraActions:{look:false,reread:false,wait:false,abandon:false}};
const config=(memoryCapacity=0):any=>({...comparisonConfigs()[0],id:'factor-base',state:{enabled:true,memoryCapacity},behavior:'user',factors:structuredClone(factors)});
const charter=parseCharter({schemaVersion:1,id:'factors',targetWebsite:'local:good',goal:'メール通知を停止して確認する',initialState:{description:'Fresh local fixture',currentDate:'2026-11-09'},scope:['Local fixture only'],prohibitedActions:{actionTypes:[],controlTexts:[],downloads:true},maxActions:6,oracle:'notifications'});
const screen:any={title:'DOM_ONLY_SECRET',text:['DOM_ONLY_SECRET'],elements:[{id:'e1',type:'button',text:'DOM_ONLY_SECRET'}],canScrollUp:false,canScrollDown:false};
const observation:any={id:'o1',imageSha256:'image',visibleText:[],fixation:{x:640,y:450},candidateIds:['e1','done','stuck']};
const vision:any={bytes:Buffer.alloc(0),mode:'full',imageSha256:'image',sourceSha256:'raw',width:1280,height:900,sourceWidth:1280,sourceHeight:900,fixation:{x:640,y:450},clearRect:{x:0,y:0,width:1280,height:900},transform:{offsetX:0,offsetY:0,scaleX:1,scaleY:1},visibleTargets:[{id:'e1',x:100,y:100,width:100,height:40}]};
test('opt-in full-image channel removes DOM/history/semantic labels without adding memory-coupled actions',()=>{
 const c=config(),wire=modelInput({charter},vision,observation,createUserState(undefined,{x:640,y:450}),c,screen,[{secret:'DOM_ONLY_SECRET'}] as any);
 assert.ok(!JSON.stringify(wire).includes('DOM_ONLY_SECRET'));assert.equal(wire.history,undefined);assert.equal((wire.observation as any).screen,undefined);
 const offered=offeredCandidates({e1:{action:{type:'click',elementId:'e1'},label:'DOM_ONLY_SECRET'},done:{action:{type:'done'},label:'done'},stuck:{action:{type:'stuck'},label:'stuck'}} as any,vision,c);
 assert.deepEqual(Object.keys(offered),['e1','done','stuck']);assert.equal(offered.e1.label,'[e1]');
});
test('factor validation rejects unknown channel, disabled engine, partial vocabulary and constrained DOM',()=>{
 assert.doesNotThrow(()=>validateConfig(config()));
 for(const c of [{...config(),factors:{...factors,informationChannel:'unknown'}},{...config(),state:{enabled:false,memoryCapacity:0}},{...config(),factors:{...factors,extraActions:{look:true}}},{...config(),vision:{...config().vision,mode:'crop'},factors:{...factors,informationChannel:'dom-state'}}])assert.throws(()=>validateConfig(c));
});
const answer=(r:Parameters<BetaEvaluator>[0],choice:string)=>({model:'TEST',answers:Object.fromEntries(Object.entries(r.questions).map(([id,q])=>{const selected=id==='nextAction'?choice:'goal';return [id,{choice:selected,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k===selected?1:0]))}];}))});
test('ordinary factor execution and strict replay bind privacy, current-state memory and actual choice',async()=>{
 const browser=await chromium.launch({headless:true});try{
  const results:any[]=[];
  for(const capacity of [0,3]){
   const context=await browser.newContext({viewport:{width:1280,height:900}});try{
    await context.route('http://local.test/**',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><meta charset="utf-8"><title>DOM_ONLY_SECRET</title><h1>DOM_ONLY_SECRET</h1><button onclick="this.insertAdjacentHTML('afterend','<p role=status>メール通知を停止しました</p>')">メール通知を停止する</button>`}));
    const dir=await mkdtemp(join(tmpdir(),'factor-wiring-'));let calls=0;
    const result=await runBeta(await context.newPage(),{runId:'capacity-'+capacity,dir,baseURL:'http://local.test',charter,config:config(capacity),evaluate:async request=>{assert.ok(!JSON.stringify(request.input).includes('DOM_ONLY_SECRET'));assert.equal(Object.keys(request.questions.nextAction.criteria).some(k=>/^(look_|reread|wait|abandon)/.test(k)),false);return answer(request,calls++===0?'e1':'done');}});
    assert.equal(result.validForComparison,true);assert.equal(result.steps.length,2);assert.equal(result.objectiveSuccess,true);assert.equal((await replayDirectory(dir)).verified,true);
    assert.deepEqual(result.steps[0].userState!.lastObservation!.visibleText,[]);results.push(result);
    const path=join(dir,'result.json'),saved=await readFile(path,'utf8'),mutated=JSON.parse(saved),s=mutated.steps[0];s.modelInput.observation.screen={text:['FORGED_DOM']};s.inputSha256=sha(JSON.stringify({input:s.modelInput,questions:s.questions,assets:s.assetFiles}));await writeFile(path,JSON.stringify(mutated));await assert.rejects(replayDirectory(dir),/FACTOR/);await writeFile(path,saved);
    const wrong=JSON.parse(saved);wrong.steps[0].selection.seed++;await writeFile(path,JSON.stringify(wrong));await assert.rejects(replayDirectory(dir),/FACTOR|SELECTION/);await writeFile(path,saved);
    const downgrade=JSON.parse(saved);delete downgrade.config.factors;await writeFile(path,JSON.stringify(downgrade));await assert.rejects(replayDirectory(dir),/FACTOR/);await writeFile(path,saved);
    const missingAction=JSON.parse(saved);delete missingAction.steps.at(-1).action;await writeFile(path,JSON.stringify(missingAction));await assert.rejects(replayDirectory(dir),/FACTOR/);await writeFile(path,saved);
    const missingSelection=JSON.parse(saved);delete missingSelection.steps.at(-1).action;delete missingSelection.steps.at(-1).selection;await writeFile(path,JSON.stringify(missingSelection));await assert.rejects(replayDirectory(dir),/FACTOR/);await writeFile(path,saved);
    const action=JSON.parse(saved);action.steps[0].action={type:'wait'};await writeFile(path,JSON.stringify(action));await assert.rejects(replayDirectory(dir),/FACTOR|ACTION/);
   }finally{await context.close();}
  }
  assert.deepEqual(results[0].steps[0].modelInput.observation,results[1].steps[0].modelInput.observation);assert.deepEqual(results[0].steps[0].questions,results[1].steps[0].questions);assert.equal(results[0].steps[1].userState.memory.length,0);assert.equal(results[1].steps[1].userState.memory.length,2);
 }finally{await browser.close();}
});
