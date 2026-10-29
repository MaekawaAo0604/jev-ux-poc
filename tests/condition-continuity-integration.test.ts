import test from 'node:test';
import assert from 'node:assert/strict';
import {humanJevProfile} from '../runner/human-jev-profiles.js';
import {validateConfig} from '../jev/virtual-beta/config.js';

test('condition continuity is an opt-in visual actor and old actor configuration is unchanged',()=>{
 const old=humanJevProfile('experience-visual-conditions');
 const next=humanJevProfile('experience-visual-conditions-continuity' as any);
 assert.deepEqual(next.config.visualHypotheses,{enabled:true,capacity:3,continuity:{capacity:3}});
 assert.equal(old.config.visualHypotheses?.continuity,undefined);
 assert.equal(next.maximumRequests,36);assert.equal(next.config.maxRunMs,old.config.maxRunMs);
 assert.deepEqual(next.config.selection,old.config.selection);
 for(const capacity of [0,4,NaN])assert.throws(()=>validateConfig({...next.config,visualHypotheses:{enabled:true,capacity:3,continuity:{capacity}}}));
 assert.throws(()=>validateConfig({...next.config,visualHypotheses:{enabled:false,capacity:3,continuity:{capacity:3}}}));
});

import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {runBeta} from '../runner/virtual-beta-core.js';
import {replayDirectory} from '../runner/virtual-beta-replay.js';
import {parseCharter} from '../jev/persona.js';
const html=`<!doctype html><meta charset="utf-8"><script>let s=0;function draw(){document.body.innerHTML='';let p=document.createElement('p');p.textContent=['照合が必要です','ご利用案内','照合が完了しました','メール通知を停止しました'][s];if(s===3)p.setAttribute('role','status');document.body.append(p);if(s<3){let b=document.createElement('button');b.textContent=['案内を開く','利用情報を照合する','通知を停止する'][s];b.onclick=()=>{s++;draw()};document.body.append(b)}}addEventListener('DOMContentLoaded',draw)</script>`;
test('continuity reaches both decision stages, survives unseen screen, resolves with current evidence and replay rejects forged state',async()=>{
 const dir='reports/condition-continuity-2026-10-30/parent/integration-'+Date.now();await mkdir(dir,{recursive:true});const browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1280,height:900}});await context.route('**/*',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:html}));
  const charter=parseCharter({schemaVersion:1,id:'continuity',targetWebsite:'local:bad',goal:'メール通知を停止してください',initialState:{description:'fictional local UI',currentDate:'2026-10-30'},scope:['local only'],prohibitedActions:{actionTypes:[],controlTexts:[],downloads:true},maxActions:12,oracle:'notifications'});
  const delivered:any[]=[],requests:any[]=[];
  const result=await runBeta(await context.newPage(),{runId:'continuity',dir,baseURL:'http://continuity.test',charter,config:humanJevProfile('experience-visual-conditions-continuity' as any).config,
   extract:async req=>{
    requests.push(structuredClone(req));assert.ok(req.conditionContinuity,'new mode must deliver the bounded continuity context');
    const n=Number(req.current.observationId.slice(1)),before=req.conditionContinuity.memory.entries;
    if(n===1)assert.equal(before.length,0);else assert.equal(before[0].id,'o1_c1');
    const conditions=n===1||n===3?[{id:'c1',description:'利用情報の照合',status:n===1?'unmet':'satisfied',evidence:{observationId:req.current.observationId,quote:n===1?'照合が必要です':'照合が完了しました'},uncertainty:''}]:[];
    const continuity=before.map(entry=>({priorId:entry.id,conditionId:n===3?'c1':null,change:n===3?'resolved':'unobserved',explanation:n===3?'現在の表示に完了が示された':'この画面には条件の結果がない'}));
    const output={conditions,relations:req.candidates.map(c=>({candidateId:c.id,conditionIds:conditions.map(c=>c.id),relation:'unknown',currentEvidence:null,expectedResult:null})),unknowns:[],continuity};
    return {model:'gpt-6-luna',status:'completed',rawText:JSON.stringify(output),output,request:{attempts:1,httpReceived:true,statusCode:200},costUSD:null};
   },evaluate:async req=>{
    const n=Number((req.input.observation as any).id.slice(1));delivered.push({n,stage:req.questions.nextAction?'action':'assessment',input:structuredClone(req.input)});
    return {model:'SCRIPTED_CONTINUITY',answers:Object.fromEntries(Object.entries(req.questions).map(([id,q])=>{
     const explicit=id==='nextAction'?(n===4?'done':'e1'):id==='decisionBasis'?'goal':id==='knowledge'?'insufficient':id==='goal'?(n===4?'satisfied':'unsatisfied'):id==='goalEvidence'?'o'+n:undefined;
     const choice=explicit??['unknown','none','uncertain'].find(k=>Object.hasOwn(q.criteria,k))??Object.keys(q.criteria)[0];assert.ok(Object.hasOwn(q.criteria,choice),id+':'+choice);
     return [id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,Number(k===choice)]))}];
    }))};
   }});
  assert.equal(result.objectiveSuccess,true);assert.equal(result.termination,'SUBJECTIVE_DONE');assert.equal(result.apiCalls,12);assert.equal(result.uiActions,3);
  assert.equal(requests[2].conditionContinuity.memory.entries[0].currentStatus,'uncertain');assert.equal(requests[2].conditionContinuity.memory.entries[0].lastGrounded.status,'unmet');
  for(const n of [1,2,3,4]){
   const a=delivered.find(x=>x.n===n&&x.stage==='assessment'),b=delivered.find(x=>x.n===n&&x.stage==='action');assert.ok(a.input.conditionContinuity);assert.deepEqual(a.input.conditionContinuity,b.input.conditionContinuity);assert.deepEqual(a.input.userState.conditionContinuity,b.input.userState.conditionContinuity);
  }
  assert.equal(result.steps[2].conditionContinuity!.after.entries[0].currentStatus,'satisfied');
  assert.equal((await replayDirectory(dir)).verified,true);
  const path=dir+'/result.json',original=await readFile(path,'utf8');
  const mutations=[(r:any)=>delete r.steps[1].conditionContinuity,(r:any)=>r.steps[1].conditionContinuity.after.entries[0].lastGrounded.status='satisfied',(r:any)=>r.steps[1].modelInput.conditionContinuity.after.entries=[],(r:any)=>delete r.config.visualHypotheses.continuity,(r:any)=>r.steps[1].visualHypotheses.request.conditionContinuity.memory.entries=[]];
  for(const mutate of mutations){let r=JSON.parse(original);mutate(r);for(const s of r.steps){if(s.modelInput)s.inputSha256=createHash('sha256').update(JSON.stringify({input:s.modelInput,questions:s.questions,assets:s.assetFiles})).digest('hex');if(s.deliberation){const d=s.deliberation;d.inputSha256=createHash('sha256').update(JSON.stringify({input:d.modelInput,questions:d.questions,assets:d.assetFiles})).digest('hex');}}await writeFile(path,JSON.stringify(r));try{await assert.rejects(replayDirectory(dir));}finally{await writeFile(path,original);}}
 }finally{await browser.close();}
});

import {runHumanJev} from '../runner/human-jev-experiment.js';
test('normal mock wrapper isolates continuity and model-output failures cannot hide forged delivery',async()=>{
 const root='reports/condition-continuity-2026-10-30/parent/wrapper-'+Date.now();
 for(const n of [0,1]){const saved=await runHumanJev({out:root+'-'+n,mock:true,mode:'experience-visual-conditions-continuity'});assert.deepEqual(saved.result.steps[0].conditionContinuity!.before.entries,[]);assert.equal((await replayDirectory(root+'-'+n+'/exploration')).verified,true);}
 let evaluations=0;const out=root+'-error';const saved=await runHumanJev({out,mock:true,mode:'experience-visual-conditions-continuity'},async()=>{evaluations++;throw Error('NO_JEV_CALL');},async()=>({model:'gpt-6-luna',status:'invalid-json',rawText:'{}',output:null,request:{attempts:1,httpReceived:true,statusCode:200},costUSD:null}));
 assert.equal(evaluations,0);assert.equal(saved.result.validForComparison,false);assert.equal(saved.result.termination,'API_ERROR');assert.equal(saved.result.steps[0].conditionContinuity,undefined);assert.equal((await replayDirectory(out+'/exploration')).verified,true);
 const path=out+'/exploration/result.json',original=await readFile(path,'utf8');
 for(const mutate of [(r:any)=>r.steps[0].modelInput.conditionContinuity={forged:true},(r:any)=>r.steps[0].modelInput.userState.conditionContinuity={forged:true},(r:any)=>r.steps[0].modelInput.userState.conditionContinuity.goalSha256='f'.repeat(64)]){
  const r=JSON.parse(original);mutate(r);r.steps[0].inputSha256=createHash('sha256').update(JSON.stringify({input:r.steps[0].modelInput,questions:r.steps[0].questions,assets:r.steps[0].assetFiles})).digest('hex');
  await writeFile(path,JSON.stringify(r));try{await assert.rejects(replayDirectory(out+'/exploration'));}finally{await writeFile(path,original);}
 }
});

import {buildOpenAIVisualHypothesisRequest} from '../runner/openai-visual-hypotheses.js';
import {PNG} from 'pngjs';
test('continuity evidence must agree with actually attached sources for an already known observation ID',()=>{
 const bytes=PNG.sync.write(new PNG({width:1,height:1})),hash=createHash('sha256').update(bytes).digest('hex'),bad='a'.repeat(64),prior={observationId:'o1',imageSha256:bad};
 const request:any={goal:'test',currentDate:'2026-10-30',current:{observationId:'o2',imageSha256:hash},sources:[{observationId:'o1',imageSha256:hash,image:'history'},{observationId:'o2',imageSha256:hash,image:'current'}],candidates:[{id:'e1',type:'click'}],conditionContinuity:{schemaVersion:1,capacity:3,memory:{schemaVersion:1,goalSha256:createHash('sha256').update('test').digest('hex'),lastObservation:prior,entries:[{id:'o1_c1',description:'prior',lastGrounded:{status:'unmet',evidence:{...prior,quote:'pending',quoteStatus:'model-transcribed-unverified'}},currentStatus:'unmet',lastAssessed:prior,transition:'introduced'}]}},images:{current:{mediaType:'image/png',data:bytes.toString('base64')},history:{mediaType:'image/png',data:bytes.toString('base64')}},timeoutMs:100};
 assert.throws(()=>buildOpenAIVisualHypothesisRequest(request));
});
