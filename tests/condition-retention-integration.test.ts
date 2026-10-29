import test from 'node:test';
import assert from 'node:assert/strict';
import {humanJevProfile} from '../runner/human-jev-profiles.js';
import {validateConfig} from '../jev/virtual-beta/config.js';
import * as comparison from '../runner/condition-continuity-comparison.js';
const actor='experience-visual-conditions-retention';
test('grounded retention profile changes only declared memory policy and preserves old defaults',()=>{
 const old=humanJevProfile('experience-visual-conditions-continuity'),next=humanJevProfile(actor as any);
 assert.deepEqual(next.config.visualHypotheses?.continuity,{capacity:3,retentionPolicy:'grounded-unresolved'});
 assert.deepEqual(old.config.visualHypotheses?.continuity,{capacity:3});
 const expected=structuredClone(old);expected.config.id=next.config.id;(expected.config.visualHypotheses!.continuity as any).retentionPolicy='grounded-unresolved';assert.deepEqual(next,expected);
});
test('unknown or malformed retention policies are rejected rather than ignored',()=>{
 for(const policy of ['bad',null,1,{},true]){const c=humanJevProfile('experience-visual-conditions-continuity').config;(c.visualHypotheses!.continuity as any).retentionPolicy=policy;assert.throws(()=>validateConfig(c));}
});
test('retention comparison has four independent slots over two unchanged tasks; default stays eight',()=>{
 const slots=(comparison.continuitySchedule as any)(true);assert.equal(slots.length,4);assert.equal(comparison.continuitySchedule().length,8);
 assert.deepEqual(slots.map((s:any)=>[s.fixture.task,s.fixture.condition,s.actor]),[['library','unchanged',actor],['library','unchanged','experience-visual-conditions-continuity'],['workshop','unchanged','experience-visual-conditions-continuity'],['workshop','unchanged',actor]]);
});

import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {runBeta} from '../runner/virtual-beta-core.js';
import {replayDirectory} from '../runner/virtual-beta-replay.js';
import {parseCharter} from '../jev/persona.js';
import {buildOpenAIVisualHypothesisRequest} from '../runner/openai-visual-hypotheses.js';
const html=`<!doctype html><meta charset="utf-8"><script>let s=0;function draw(){document.body.innerHTML='';let p=document.createElement('p');p.textContent=['照合が必要です','ご利用案内','照合が完了しました','メール通知を停止しました'][s];if(s===3)p.setAttribute('role','status');document.body.append(p);if(s<3){let b=document.createElement('button');b.textContent=['案内を開く','利用情報を照合する','通知を停止する'][s];b.onclick=()=>{s++;draw()};document.body.append(b)}}addEventListener('DOMContentLoaded',draw)</script>`;
test('grounded unmet survives new unknowns, resolves with evidence, reaches both stages and exact client timeout is replayed',async()=>{
 const dir='reports/condition-retention-2026-10-30/parent/integration-'+Date.now();await mkdir(dir,{recursive:true});const browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1280,height:900}});await context.route('**/*',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:html}));
  const charter=parseCharter({schemaVersion:1,id:'retention',targetWebsite:'local:bad',goal:'メール通知を停止してください',initialState:{description:'fictional local UI',currentDate:'2026-10-30'},scope:['local only'],prohibitedActions:{actionTypes:[],controlTexts:[],downloads:true},maxActions:12,oracle:'notifications'});
  const requests:any[]=[],delivered:any[]=[];
  const result=await runBeta(await context.newPage(),{runId:'retention',dir,baseURL:'http://retention.test',charter,config:humanJevProfile(actor as any).config,extract:async req=>{
   requests.push(structuredClone(req));assert.equal(req.conditionContinuity?.retentionPolicy,'grounded-unresolved');
   const n=Number(req.current.observationId.slice(1)),prior=req.conditionContinuity!.memory.entries;
   const conditions=n===1||n===3?[{id:'c1',description:'照合',status:n===1?'unmet':'satisfied',evidence:{observationId:req.current.observationId,quote:n===1?'照合が必要です':'照合が完了しました'},uncertainty:''}]:n===2?['c1','c2','c3'].map(id=>({id,description:'未確認の条件 '+id,status:'uncertain',evidence:null,uncertainty:'現在の確認根拠なし'})):[];
   const continuity=prior.map(e=>({priorId:e.id,conditionId:n===3&&e.id==='o1_c1'?'c1':null,change:n===3&&e.id==='o1_c1'?'resolved':'unobserved',explanation:'この画面の根拠に応じて再評価'}));
   const output={conditions,continuity,relations:req.candidates.map(c=>({candidateId:c.id,conditionIds:[],relation:'unknown',currentEvidence:null,expectedResult:null})),unknowns:[]};
   return {model:'gpt-6-luna',status:'completed',rawText:JSON.stringify(output),output,request:{attempts:1,httpReceived:true,statusCode:200},costUSD:null};
  },evaluate:async req=>{
   const n=Number((req.input.observation as any).id.slice(1));delivered.push({n,input:structuredClone(req.input)});
   return {model:'SCRIPTED_RETENTION',answers:Object.fromEntries(Object.entries(req.questions).map(([id,q])=>{const explicit=id==='nextAction'?(n===4?'done':'e1'):id==='decisionBasis'?'goal':id==='knowledge'?'insufficient':id==='goal'?(n===4?'satisfied':'unsatisfied'):id==='goalEvidence'?'o'+n:undefined;const choice=explicit??['unknown','none','uncertain'].find(k=>Object.hasOwn(q.criteria,k))??Object.keys(q.criteria)[0];assert.ok(Object.hasOwn(q.criteria,choice));return [id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,Number(k===choice)]))}];}))};
  }});
  assert.equal(result.objectiveSuccess,true);assert.equal(result.termination,'SUBJECTIVE_DONE');assert.deepEqual(result.measurement,{visualDispatch:'client-timeout-v1'});
  const retained=requests[2].conditionContinuity.memory.entries.find((e:any)=>e.id==='o1_c1');assert.equal(retained.currentStatus,'uncertain');assert.equal(retained.lastGrounded.status,'unmet');assert.equal(retained.lastGrounded.evidence.observationId,'o1');assert.equal(requests[2].conditionContinuity.memory.entries.length,3);
  assert.equal(result.steps[2].conditionContinuity!.after.entries.find(e=>e.id==='o1_c1')!.currentStatus,'satisfied');
  const oldRequest=structuredClone(requests[0]);delete oldRequest.conditionContinuity.retentionPolicy;assert.deepEqual(buildOpenAIVisualHypothesisRequest(requests[0]),buildOpenAIVisualHypothesisRequest(oldRequest),'retention implementation policy must not cue the native model');
  for(const [i,s]of result.steps.entries()){assert.equal(s.visualHypotheses!.timing!.dispatch!.timeoutMs,requests[i].timeoutMs);const inputs=delivered.filter(x=>x.n===i+1);assert.equal(inputs.length,2);for(const x of inputs){const {retention:_audit,...expected}=s.conditionContinuity!;assert.deepEqual(x.input.conditionContinuity,expected);assert.equal(Object.hasOwn(x.input.conditionContinuity,'retention'),false);}}
  assert.equal((await replayDirectory(dir)).verified,true);
  const file=dir+'/result.json',original=await readFile(file,'utf8');const mutations=[(r:any)=>r.steps[1].visualHypotheses.timing.dispatch.timeoutMs--,(r:any)=>delete r.steps[1].visualHypotheses.timing.dispatch,(r:any)=>delete r.measurement,(r:any)=>r.steps[1].conditionContinuity.retention.ranking[0].selected=false,(r:any)=>r.steps[1].conditionContinuity.after.entries[0].lastGrounded.status='satisfied'];
  for(const mutate of mutations){const r=JSON.parse(original);mutate(r);for(const s of r.steps){if(s.modelInput)s.inputSha256=createHash('sha256').update(JSON.stringify({input:s.modelInput,questions:s.questions,assets:s.assetFiles})).digest('hex');if(s.deliberation){let d=s.deliberation;d.inputSha256=createHash('sha256').update(JSON.stringify({input:d.modelInput,questions:d.questions,assets:d.assetFiles})).digest('hex');}}await writeFile(file,JSON.stringify(r));try{await assert.rejects(replayDirectory(dir));}finally{await writeFile(file,original);}}
 }finally{await browser.close();}
});

import {resolve} from 'node:path';
test('retention options enforce a four-slot144-request cap; fresh mock pair compares empty starting memory',async()=>{
 const root='reports/condition-retention-2026-10-30/parent/mock-'+Date.now();await mkdir(root,{recursive:true});const prior=resolve(root,'prior.json');await writeFile(prior,JSON.stringify({count:0,files:[]}));
 const opts={out:root+'/invalid',mock:true,retention:true,priorSnapshot:prior};
 for(const limit of [0,5,NaN])assert.throws(()=>comparison.validateContinuityOptions({...opts,limit}));
 for(const maxRequests of [0,145,NaN])assert.throws(()=>comparison.validateContinuityOptions({...opts,maxRequests}));
 comparison.validateContinuityOptions({...opts,maxRequests:144,limit:4});
 const out=root+'/pair';const status=await comparison.runContinuityComparison({...opts,out,limit:2,maxRequests:144});assert.equal(status.status,'INCOMPLETE');assert.equal(status.attempted,2);assert.equal(status.requests,0);
 const manifest=JSON.parse(await readFile(out+'/manifest.json','utf8')),summary=JSON.parse(await readFile(out+'/summary.json','utf8'));
 assert.equal(manifest.phase,'condition-retention-2026-10-30');assert.equal(manifest.retention,true);assert.equal(manifest.limits.trials,4);assert.equal(summary.planned,4);assert.equal(summary.notAttempted,2);assert.equal(summary.kind,'MOCK_RETENTION_INTEGRATION_ONLY');assert.equal(summary.pairs[0].matched,true);
 for(const r of manifest.records){assert.deepEqual(r.result.steps[0].conditionContinuity.before.entries,[]);assert.deepEqual(r.result.measurement,{visualDispatch:'client-timeout-v1'});assert.equal((await replayDirectory(r.dir+'/exploration')).verified,true);}
});
