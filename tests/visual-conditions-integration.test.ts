import test from 'node:test';
import assert from 'node:assert/strict';
import {humanJevProfile} from '../runner/human-jev-profiles.js';
import {validateConfig} from '../jev/virtual-beta/config.js';
import type {VisualHypothesisRequest} from '../jev/virtual-beta/visual-hypotheses-contracts.js';

test('current evidence and concrete conditions are distinct opt-in components with separate allocations',()=>{
 const old=humanJevProfile('experience-action-relations'),current=humanJevProfile('experience-action-relations-current'),visual=humanJevProfile('experience-visual-conditions');
 const a=structuredClone(current);a.config.id=old.config.id;delete a.config.actionRelations!.evidencePolicy;assert.deepEqual(a,old);
 const b=structuredClone(visual);b.config.id=current.config.id;delete b.config.visualHypotheses;b.config.maxAPICalls=current.config.maxAPICalls;b.maximumRequests=current.maximumRequests;b.explorationMaximum=current.explorationMaximum;assert.deepEqual(b,current);
 assert.equal(visual.maximumRequests,36);assert.equal(visual.perRunMaximum,12);assert.deepEqual(visual.config.visualHypotheses,{enabled:true,capacity:3});
 for(const delta of [{visualHypotheses:{enabled:true,capacity:4}},{visualHypotheses:{enabled:true,capacity:0}},{visualHypotheses:{enabled:true,capacity:3},actionRelations:{enabled:true}},{actionRelations:{enabled:true,evidencePolicy:'historical'}}])assert.throws(()=>validateConfig({...visual.config,...delta} as any));
});
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {runBeta} from '../runner/virtual-beta-core.js';
import {replayDirectory} from '../runner/virtual-beta-replay.js';
import {parseCharter} from '../jev/persona.js';
import {createHash} from 'node:crypto';
const html=`<!doctype html><meta charset="utf-8"><script>function draw(){const h=location.hash;document.body.innerHTML='';const t=document.createElement('p');t.textContent=h==='#verified'?'利用条件が整いました。通知を停止できます。':h==='#done'?'メール通知を停止しました':'通知の停止には利用情報の照合が必要です';if(h==='#done')t.setAttribute('role','status');document.body.append(t);if(h!=='#done'){const b=document.createElement('button');b.textContent=h==='#verified'?'通知を停止する':'利用情報を照合する';b.onclick=()=>location.hash=h==='#verified'?'done':'verified';document.body.append(b);}}addEventListener('DOMContentLoaded',draw);onhashchange=draw;</script>`;

test('concrete visual hypotheses reach both Jev stages, memory is isolated, and replay rejects forged records even after rehash',async()=>{
 const dir='reports/visual-conditions-2026-10-30/parent/integration-'+Date.now();await mkdir(dir,{recursive:true});const browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1280,height:900}});await context.route('**/*',r=>new URL(r.request().url()).origin==='http://relation.test'?r.fulfill({contentType:'text/html; charset=utf-8',body:html}):r.abort());
  const charter=parseCharter({schemaVersion:1,id:'relations',targetWebsite:'local:bad',goal:'メール通知を停止してください',initialState:{description:'fictional prerequisite fixture',currentDate:'2026-10-29'},scope:['local only'],prohibitedActions:{actionTypes:[],controlTexts:[],downloads:true},maxActions:12,oracle:'notifications'});
  const inputs:any[]=[],extractions:VisualHypothesisRequest[]=[];
  const result=await runBeta(await context.newPage(),{runId:'relations',dir,baseURL:'http://relation.test',charter,config:humanJevProfile('experience-visual-conditions').config,extract:async req=>{extractions.push(structuredClone(req));assert.equal(Object.hasOwn(req,'screen'),false);assert.equal(Object.hasOwn(req,'audit'),false);assert.ok(req.candidates.every(c=>Object.keys(c).sort().join(',')==='id,type'));const n=Number(req.current.observationId.slice(1));assert.deepEqual(req.memory?.records.map(r=>r.source.observationId),Array.from({length:n-1},(_,i)=>'o'+(i+1)));const output={conditions:[{id:'c1',description:'利用情報の照合',status:n===1?'unmet':'satisfied',evidence:{observationId:req.current.observationId,quote:'利用情報'},uncertainty:''}],relations:req.candidates.map(c=>({candidateId:c.id,conditionIds:['c1'],relation:'unknown',currentEvidence:null,expectedResult:null})),unknowns:[]};return {model:'gpt-6-luna',status:'completed',rawText:JSON.stringify(output),output,request:{attempts:1,httpReceived:true,statusCode:200},costUSD:null};},evaluate:async req=>{
   const n=Number((req.input.observation as any).id.slice(1));inputs.push({n,stage:req.questions.nextAction?'action':'assessment',input:structuredClone(req.input),questions:structuredClone(req.questions)});
   return{model:'SCRIPTED_RELATION_INTEGRATION',answers:Object.fromEntries(Object.entries(req.questions).map(([id,q])=>{
    const choice=id==='nextAction'?(n===3?'done':'e1'):id==='decisionBasis'?'goal':id==='knowledge'?'insufficient':id==='goal'?(n===3?'satisfied':'unsatisfied'):id.startsWith('actionRelation_contextEvidence_')?'none':id==='goalEvidence'||id.startsWith('evidence_')||id==='experienceEvidence'||id==='actionRelation_availabilityEvidence'||id.startsWith('actionRelation_evidence_')?'o'+n:id.startsWith('effect_')?'unknown':id==='experienceProgress'||id==='experienceExpectation'?'unknown':id.startsWith('goalSearch_role_')?'required':id.startsWith('goalSearch_image_check_')?(n===3?'observed':'not_shown'):id==='goalSearch_finding'?(n===1?'prerequisite':n===2?'execute_e1':'guidance'):id==='actionRelation_availability'?(n===1?'blocked':n===2?'ready':'completed'):id.startsWith('actionRelation_role_')?(n===1?'prerequisite':'execute'):id.startsWith('actionRelation_verify_')?(n===1?'availability-change':'goal-change'):'none';
    assert.ok(Object.hasOwn(q.criteria,choice),id+':'+choice);return[id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,Number(k===choice)]))}];
   }))};
  }});
  assert.equal(result.objectiveSuccess,true);assert.equal(result.termination,'SUBJECTIVE_DONE');assert.equal(result.apiCalls,9);assert.equal(extractions.length,3);assert.equal(result.uiActions,2);
  const first:any=result.steps[0];assert.equal(first.actionRelations.record.candidates.e1.role,'prerequisite');assert.equal(first.actionRelations.record.candidates.e1.verify,'availability-change');
  assert.equal(inputs.find(x=>x.n===1&&x.stage==='assessment').input.actionRelations,undefined);
  assert.deepEqual(inputs.find(x=>x.n===1&&x.stage==='action').input.actionRelations,first.actionRelations.record);
  assert.match(inputs.find(x=>x.n===1&&x.stage==='action').questions.nextAction.criteria.e1,/prerequisite/);
  for(const n of [1,2,3]){const assessment=inputs.find(x=>x.n===n&&x.stage==='assessment'),action=inputs.find(x=>x.n===n&&x.stage==='action');assert.equal(assessment.input.visualHypotheses.source.observationId,'o'+n);assert.deepEqual(action.input.visualHypotheses,assessment.input.visualHypotheses);assert.equal(action.input.visualHypotheses.conditions[0].evidence.quoteStatus,'model-transcribed-unverified');assert.equal(action.input.userState.visualHypotheses.records.length,n);}
  assert.equal((await replayDirectory(dir)).verified,true);
  const path=dir+'/result.json',original=await readFile(path,'utf8');const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
  for(const mutate of[(r:any)=>r.steps[0].visualHypotheses.hiddenUnbounded='extra',(r:any)=>r.steps[0].visualHypotheses.response.hiddenUnbounded='extra',(r:any)=>r.steps[0].modelInput.visualHypothesesSecret='bad',(r:any)=>r.steps[0].visualHypotheses.record.conditions[0].description='forged',(r:any)=>r.steps[1].visualHypotheses.request.memory.records=[],(r:any)=>r.steps[0].deliberation.modelInput.visualHypotheses.source.imageSha256='f'.repeat(64),(r:any)=>delete r.config.visualHypotheses,(r:any)=>delete r.steps[0].visualHypotheses,(r:any)=>r.steps[0].modelInput.userState.visualHypotheses.records=[]]){
   const bad=JSON.parse(original);mutate(bad);for(const s of bad.steps){if(s.modelInput)s.inputSha256=hash({input:s.modelInput,questions:s.questions,assets:s.assetFiles});if(s.deliberation){const d=s.deliberation;d.inputSha256=hash({input:d.modelInput,questions:d.questions,assets:d.assetFiles});}}
   await writeFile(path,JSON.stringify(bad));try{await assert.rejects(replayDirectory(dir));}finally{await writeFile(path,original);}
  }
 }finally{await browser.close();}
});

import {runHumanJev} from '../runner/human-jev-experiment.js';
import {VisualHypothesisTransportError} from '../jev/virtual-beta/visual-hypotheses-contracts.js';
import {visualHypothesisInput} from '../runner/visual-hypothesis-input.js';
import {PNG} from 'pngjs';
test('input projection does not read candidate label or experience audit getters',()=>{
 const bytes=PNG.sync.write(new PNG({width:1,height:1})),hash=createHash('sha256').update(bytes).digest('hex');const candidate:any={action:{type:'click',elementId:'e1'}};Object.defineProperty(candidate,'label',{enumerable:true,get(){throw Error('LABEL_LEAK');}});const experience:any={schemaVersion:1,transitions:[]};Object.defineProperty(experience,'audit',{enumerable:true,get(){throw Error('AUDIT_LEAK');}});
 const req=visualHypothesisInput({goal:'local',currentDate:'2026-10-30',current:{observationId:'o1',imageSha256:hash},sources:[{observationId:'o1',imageSha256:hash}],candidates:{e1:candidate},user:{schemaVersion:1,revision:1,fixation:{x:0,y:0},memory:[],expectations:[],experience},images:{current:{mediaType:'image/png',data:bytes.toString('base64')}},assets:{current:{sha256:hash}},timeoutMs:100});assert.deepEqual(req.candidates,[{id:'e1',type:'click'}]);assert.deepEqual(req.experience,{schemaVersion:1,transitions:[]});
});
test('configured extraction requires its dependency before page navigation or output creation',async()=>{
 const config=humanJevProfile('experience-visual-conditions').config;let sideEffects=0;
 await assert.rejects(runBeta({goto:async()=>{sideEffects++;}} as any,{runId:'no-extractor',dir:'must-not-create',baseURL:'http://local',charter:parseCharter(JSON.parse(await readFile('experiments/persona/charter.json','utf8'))),config,evaluate:async()=>{sideEffects++;throw Error('NEVER');}}),/VISUAL_EXTRACTOR_REQUIRED/);assert.equal(sideEffects,0);
});
test('normal mock wrapper executes three distinct stages, isolates runs and old actor never calls extractor',async()=>{
 const root='reports/visual-conditions-2026-10-30/parent/wrapper-'+Date.now();let extracts=0;
 for(const mode of ['experience-visual-conditions','experience-visual-conditions','experience-action-relations-current'] as const){const dir=root+'-'+extracts+'-'+mode;const saved=await runHumanJev({out:dir,mock:true,mode},undefined,mode==='experience-action-relations-current'?async()=>{throw Error('UNCONFIGURED_CALL');}:undefined);assert.equal(saved.result.apiCalls,mode==='experience-visual-conditions'?3:2);assert.equal(saved.result.steps.length,1);if(mode==='experience-visual-conditions'){extracts++;assert.equal(saved.result.steps[0].visualHypotheses!.request.memory!.records.length,0);}else assert.equal(saved.result.steps[0].visualHypotheses,undefined);assert.equal((await replayDirectory(dir+'/exploration')).verified,true);const manifest=JSON.parse(await readFile(dir+'/manifest.json','utf8'));assert.equal(manifest.actualAPIRequests,0);assert.equal(manifest.mock,true);}
 assert.equal(extracts,2);
});
test('transport and successful HTTP invalid output stop before Jev and remain infrastructure/model-output errors',async()=>{
 const root='reports/visual-conditions-2026-10-30/parent/errors-'+Date.now();
 const cases=[async()=>{throw new VisualHypothesisTransportError({code:'HTTP_ERROR',attempts:1,httpReceived:true,statusCode:402});},async()=>({model:'gpt-6-luna',status:'invalid-json' as const,rawText:'{}',output:null,request:{attempts:1 as const,httpReceived:true as const,statusCode:200 as const},costUSD:null})];
 for(const [i,extract] of cases.entries()){let evaluations=0;const saved=await runHumanJev({out:root+'-'+i,mock:true,mode:'experience-visual-conditions'},async()=>{evaluations++;throw Error('MUST_NOT_CALL');},extract);assert.equal(evaluations,0);assert.equal(saved.result.apiCalls,1);assert.equal(saved.result.termination,'API_ERROR');assert.equal(saved.result.validForComparison,false);assert.equal(saved.result.steps[0].selection,undefined);assert.equal((await replayDirectory(root+'-'+i+'/exploration')).verified,true);const path=root+'-'+i+'/exploration/result.json',original=await readFile(path,'utf8');for(const mutate of [(r:any)=>{delete r.steps[0].visualHypotheses.error;delete r.steps[0].visualHypotheses.response;},(r:any)=>{delete r.steps[0].visualHypotheses.error;r.steps[0].visualHypotheses.response={model:'gpt-6-luna',status:'completed',rawText:'{}',output:{},request:{attempts:1,httpReceived:true,statusCode:200},costUSD:null};},(r:any)=>r.steps[0].visualHypotheses.hiddenUnbounded='extra']){const r=JSON.parse(original);mutate(r);await writeFile(path,JSON.stringify(r));try{await assert.rejects(replayDirectory(root+'-'+i+'/exploration'));}finally{await writeFile(path,original);}}}
});

test('safety stop before extractor invocation preserves a legitimate partial observation without fabricated API evidence',async()=>{
 const dir='reports/visual-conditions-2026-10-30/parent/prestop-'+Date.now();await mkdir(dir,{recursive:true});const browser=await chromium.launch({headless:true});try{const context=await browser.newContext({viewport:{width:1280,height:900}});await context.route('**/*',r=>r.fulfill({contentType:'text/html',body:html}));let checks=0,calls=0;const charter=parseCharter(JSON.parse(await readFile('experiments/persona/charter.json','utf8')));const result=await runBeta(await context.newPage(),{runId:'prestop',dir,baseURL:'http://relation.test',charter,config:humanJevProfile('experience-visual-conditions').config,isSafetyStopped:()=>++checks>=2,extract:async()=>{calls++;throw Error('NEVER');},evaluate:async()=>{calls++;throw Error('NEVER');}});assert.equal(result.termination,'SAFETY_STOP');assert.equal(result.apiCalls,0);assert.equal(calls,0);assert.equal((await replayDirectory(dir)).verified,true);}finally{await browser.close();}
});
