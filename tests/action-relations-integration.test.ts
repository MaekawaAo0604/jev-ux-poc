import test from 'node:test';
import assert from 'node:assert/strict';
import {humanJevProfile} from '../runner/human-jev-profiles.js';
import {validateConfig} from '../jev/virtual-beta/config.js';

test('new relations profile changes only the declared component and id',()=>{
 const old=humanJevProfile('experience-goal-search-grounded'),next=humanJevProfile('experience-action-relations' as any);
 assert.deepEqual((next.config as any).actionRelations,{enabled:true});
 const clean=(c:any)=>{c=structuredClone(c);delete c.id;delete c.actionRelations;return c;};
 assert.deepEqual(clean(next.config),clean(old.config));assert.equal(next.maximumRequests,24);assert.equal(next.perRunMaximum,12);
});
test('enabled relations require the existing grounded state/assessment/experience boundary',()=>{
 const base=humanJevProfile('experience-goal-search-grounded').config;
 for(const delta of [{actionRelations:null},{actionRelations:{enabled:'true'}},{actionRelations:{enabled:true},state:{enabled:false,memoryCapacity:3}},{actionRelations:{enabled:true},goalSearch:undefined},{actionRelations:{enabled:true},deliberation:undefined},{actionRelations:{enabled:true},experience:undefined}])assert.throws(()=>validateConfig({...base,...delta} as any),/INVALID_/);
 assert.deepEqual((validateConfig({...base,actionRelations:{enabled:false}} as any) as any).actionRelations,{enabled:false});
});

import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {runBeta} from '../runner/virtual-beta-core.js';
import {replayDirectory} from '../runner/virtual-beta-replay.js';
import {parseCharter} from '../jev/persona.js';
import {createHash} from 'node:crypto';
const html=`<!doctype html><meta charset="utf-8"><script>function draw(){const h=location.hash;document.body.innerHTML='';const t=document.createElement('p');t.textContent=h==='#verified'?'利用条件が整いました。通知を停止できます。':h==='#done'?'メール通知を停止しました':'通知の停止には利用情報の照合が必要です';if(h==='#done')t.setAttribute('role','status');document.body.append(t);if(h!=='#done'){const b=document.createElement('button');b.textContent=h==='#verified'?'通知を停止する':'利用情報を照合する';b.onclick=()=>location.hash=h==='#verified'?'done':'verified';document.body.append(b);}}addEventListener('DOMContentLoaded',draw);onhashchange=draw;</script>`;

test('relations reach action input and real UI, and replay rejects forged relations despite refreshed input hashes',async()=>{
 const dir='reports/action-relations-2026-10-29/parent/integration-'+Date.now();await mkdir(dir,{recursive:true});const browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1280,height:900}});await context.route('**/*',r=>new URL(r.request().url()).origin==='http://relation.test'?r.fulfill({contentType:'text/html; charset=utf-8',body:html}):r.abort());
  const charter=parseCharter({schemaVersion:1,id:'relations',targetWebsite:'local:bad',goal:'メール通知を停止してください',initialState:{description:'fictional prerequisite fixture',currentDate:'2026-10-29'},scope:['local only'],prohibitedActions:{actionTypes:[],controlTexts:[],downloads:true},maxActions:12,oracle:'notifications'});
  const inputs:any[]=[];
  const result=await runBeta(await context.newPage(),{runId:'relations',dir,baseURL:'http://relation.test',charter,config:humanJevProfile('experience-action-relations' as any).config,evaluate:async req=>{
   const n=Number((req.input.observation as any).id.slice(1));inputs.push({n,stage:req.questions.nextAction?'action':'assessment',input:structuredClone(req.input),questions:structuredClone(req.questions)});
   return{model:'SCRIPTED_RELATION_INTEGRATION',answers:Object.fromEntries(Object.entries(req.questions).map(([id,q])=>{
    const choice=id==='nextAction'?(n===3?'done':'e1'):id==='decisionBasis'?'goal':id==='knowledge'?'insufficient':id==='goal'?(n===3?'satisfied':'unsatisfied'):id==='goalEvidence'||id.startsWith('evidence_')||id==='experienceEvidence'||id==='actionRelation_availabilityEvidence'||id.startsWith('actionRelation_evidence_')?'o'+n:id.startsWith('effect_')?'unknown':id==='experienceProgress'||id==='experienceExpectation'?'unknown':id.startsWith('goalSearch_role_')?'required':id.startsWith('goalSearch_image_check_')?(n===3?'observed':'not_shown'):id==='goalSearch_finding'?(n===1?'prerequisite':n===2?'execute_e1':'guidance'):id==='actionRelation_availability'?(n===1?'blocked':n===2?'ready':'completed'):id.startsWith('actionRelation_role_')?(n===1?'prerequisite':'execute'):id.startsWith('actionRelation_verify_')?(n===1?'availability-change':'goal-change'):'none';
    assert.ok(Object.hasOwn(q.criteria,choice),id+':'+choice);return[id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,Number(k===choice)]))}];
   }))};
  }});
  assert.equal(result.objectiveSuccess,true);assert.equal(result.termination,'SUBJECTIVE_DONE');assert.equal(result.apiCalls,6);assert.equal(result.uiActions,2);
  const first:any=result.steps[0];assert.equal(first.actionRelations.record.candidates.e1.role,'prerequisite');assert.equal(first.actionRelations.record.candidates.e1.verify,'availability-change');
  assert.equal(inputs.find(x=>x.n===1&&x.stage==='assessment').input.actionRelations,undefined);
  assert.deepEqual(inputs.find(x=>x.n===1&&x.stage==='action').input.actionRelations,first.actionRelations.record);
  assert.match(inputs.find(x=>x.n===1&&x.stage==='action').questions.nextAction.criteria.e1,/prerequisite/);
  assert.equal((await replayDirectory(dir)).verified,true);
  const path=dir+'/result.json',original=await readFile(path,'utf8');const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
  for(const mutate of[(r:any)=>r.steps[0].modelInput.actionRelationsSecret='unexpected',(r:any)=>r.steps[0].actionRelationsSecret='unexpected',(r:any)=>r.steps[0].modelInput.userState.actionRelations='unbounded',(r:any)=>r.steps[0].actionRelations.record.candidates.e1.role='unrelated',(r:any)=>r.steps[0].modelInput.actionRelations.source.imageSha256='f'.repeat(64),(r:any)=>delete r.steps[0].deliberation.questions.actionRelation_role_e1,(r:any)=>delete r.config.actionRelations,(r:any)=>{delete r.steps[0].actionRelations;delete r.steps[0].modelInput.actionRelations;},(r:any)=>r.steps[0].deliberation.modelInput.actionRelations=r.steps[0].actionRelations.record]){
   const bad=JSON.parse(original);mutate(bad);for(const s of bad.steps){if(s.modelInput)s.inputSha256=hash({input:s.modelInput,questions:s.questions,assets:s.assetFiles});if(s.deliberation){const d=s.deliberation;d.inputSha256=hash({input:d.modelInput,questions:d.questions,assets:d.assetFiles});}}
   await writeFile(path,JSON.stringify(bad));try{await assert.rejects(replayDirectory(dir));}finally{await writeFile(path,original);}
  }
 }finally{await browser.close();}
});
