import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {reasonSchedule,validateReasonExperimentOptions,runDeferralReasonExperiment} from '../runner/deferral-reason-experiment.js';

test('reason comparison balances all three scenarios and reverses each paired order in replicate two',()=>{
 const slots=reasonSchedule();assert.equal(slots.length,12);assert.equal(new Set(slots.map(s=>s.id)).size,12);
 assert.deepEqual(slots.slice(0,6).map(s=>s.condition),['old','reason','reason','old','old','reason']);
 for(const scenario of ['notifications','revisit-alpha','revisit-beta']){
  const a=slots.filter(s=>s.scenario===scenario&&s.replicate===1),b=slots.filter(s=>s.scenario===scenario&&s.replicate===2);
  assert.deepEqual(a.map(s=>s.condition).sort(),['old','reason']);assert.deepEqual(a.map(s=>s.condition),b.map(s=>s.condition).reverse());
 }
 assert.deepEqual(slots,reasonSchedule());
});
test('comparison rejects missing execution declarations and limits beyond twelve trials',()=>{
 for(const limit of [0,13,NaN,Infinity,1.5])assert.throws(()=>validateReasonExperimentOptions({out:'reports/fresh',mock:true,limit}));
 assert.throws(()=>validateReasonExperimentOptions({out:' ',mock:true}),/NEW_OUTPUT_DIRECTORY_REQUIRED/);
 assert.throws(()=>validateReasonExperimentOptions({out:'reports/fresh',mock:undefined as unknown as boolean}),/EXPLICIT_EXECUTION_KIND_REQUIRED/);
 assert.throws(()=>validateReasonExperimentOptions({out:'reports/fresh',mock:false}),/EXPLICIT_ENV_FILE_REQUIRED/);
 assert.doesNotThrow(()=>validateReasonExperimentOptions({out:'reports/fresh',mock:true,limit:1}));
 assert.doesNotThrow(()=>validateReasonExperimentOptions({out:'reports/fresh',mock:false,envFile:'private.env',limit:12}));
});
test('comparison refuses an existing output directory before starting a browser or ledger',async()=>{
 const base=await mkdtemp(join(tmpdir(),'reason-reuse-'));
 try{const out=join(base,'existing');await mkdir(out);await assert.rejects(runDeferralReasonExperiment({out,mock:true,limit:1}),{code:'EEXIST'});}finally{await rm(base,{recursive:true,force:true});}
});
test('mock comparison saves the fixed schedule and replay without real requests or budget files',async()=>{
 const base=await mkdtemp(join(tmpdir(),'reason-mock-'));
 try{
  const out=join(base,'fresh'),result=await runDeferralReasonExperiment({out,mock:true,limit:2});
  assert.equal(result.status,'COMPLETED');assert.equal(result.trials,2);assert.equal(result.requests,0);
  const manifest=JSON.parse(await readFile(join(out,'manifest.json'),'utf8'));
  assert.equal(manifest.fullSchedule.length,12);assert.equal(manifest.schedule.length,2);assert.equal(manifest.limits.maxRequests,48);assert.equal(manifest.limits.phaseMaximumRequests,288);
  assert.equal(manifest.inputComponents.reason.maxOriginalReasonImages,1);assert.equal(manifest.inputComponents.reason.maxUniqueImages,4);
  assert.equal(manifest.performanceEvidence,false);assert.equal(manifest.records.length,2);
  for(const record of manifest.records){assert.equal(record.requests,0);assert.equal(record.resultPath,record.id+'/exploration/result.json');assert.equal(record.initialImageSha256.length,64);const replay=JSON.parse(await readFile(join(out,record.id,'offline-replay.json'),'utf8'));assert.equal(replay.verified,true);await assert.rejects(readFile(join(out,record.id+'-budget.json')),{code:'ENOENT'});}
  const summary=JSON.parse(await readFile(join(out,'summary.json'),'utf8'));assert.equal(summary.pairs[0].consistent,true);assert.equal(summary.cells.length,2);
  const preservation=JSON.parse(await readFile(join(out,'prior-ledger-check.json'),'utf8'));assert.equal(preservation.unchanged,true);
 }finally{await rm(base,{recursive:true,force:true});}
});


import {analyzeReasonRuns} from '../runner/deferral-reason-experiment.js';
import type {BetaResult,BetaStep} from '../runner/virtual-beta-core.js';
import {humanJevProfile} from '../runner/human-jev-profiles.js';
function runRecord(condition:'old'|'reason'='old'){
 const id='notifications-r1-'+condition;
 const result:BetaResult={schemaVersion:1,runId:id,condition,code:{revision:'frozen',sourceHash:'source'},config:humanJevProfile('experience-defer').config,input:{charter:{schemaVersion:1,id:'task',targetWebsite:'local:demo',goal:'Stop notifications',initialState:{description:'initial',currentDate:'2026-10-28'},scope:['settings'],prohibitedActions:{actionTypes:[],controlTexts:[],downloads:true},maxActions:15}},initialFingerprint:'initial',objectiveSuccess:false,objectiveAssessment:{status:'OK',value:false},terminalObservation:{status:'RECORDED'},validForComparison:true,perceivedDone:true,termination:'DECISION_LIMIT',looks:0,uiActions:4,decisions:5,apiCalls:10,apiMs:20,uiMs:10,elapsedMs:30,modeledUserMs:null,steps:[]};
 return {id,scenario:'notifications' as const,replicate:1 as 1|2,condition,initialImageSha256:'same',result};
}
function auditStep(number:number,path:string,action?:BetaStep['action'],outcome='UI_PERFORMED'):BetaStep{
 return {number,observationId:'o'+number,audit:{url:'http://localhost:4217'+path,screen:{title:'screen',text:[],elements:[],canScrollUp:false,canScrollDown:false},rawScreenshot:'audit.png',sourceSha256:path},...(action?{action,outcome}:{})};
}
test('reason summary distinguishes admitted captures, reviews, actual releases and applied policy changes',()=>{
 const run=runRecord('reason'),step=auditStep(1,'/bad/#home');
 Object.assign(step,{deferralReason:{memory:{schemaVersion:1,entries:[]},effectiveState:{schemaVersion:1,entries:[]},record:{kind:'model-hypothesis-not-fact',rawChoices:{},capture:{admitted:true,category:'prerequisite'},reviews:[{status:'basis_changed',released:false},{status:'basis_changed',released:true},{status:'still_blocks',released:false}],releasedCandidates:['a'],adjustments:[]}}});
 run.result.steps=[step];const report=analyzeReasonRuns([run]);
 assert.equal(report.cells[0].reasonCaptures,1);assert.equal(report.cells[0].admittedReasonCaptures,1);assert.equal(report.cells[0].reasonReviews,3);assert.equal(report.cells[0].reasonBasisChangedReports,2);assert.equal(report.cells[0].actualReasonReleases,1);assert.equal(report.cells[0].falseDone,1);
});
test('reason summary excludes infrastructure faults from success, false done and valid-run means',()=>{
 const a=runRecord(),b=runRecord();b.id='notifications-r2-old';b.replicate=2;b.result.runId=b.id;b.result.termination='API_ERROR';b.result.uiActions=100;
 const cell=analyzeReasonRuns([a,b]).cells[0];assert.equal(cell.n,2);assert.equal(cell.valid,1);assert.equal(cell.faults,1);assert.equal(cell.falseDone,1);assert.equal(cell.meanUIActions,4);
});
test('reason pairs permit only id and declared reason component differences',()=>{
 const a=runRecord(),b=runRecord('reason');b.result.config.id='new';Object.assign(b.result.config,{deferralReason:{enabled:true,capacity:8,maxReasonImages:1}});
 assert.equal(analyzeReasonRuns([a,b]).pairs[0].consistent,true);
 b.result.config.deferral!.weight=0.2;b.result.code!.revision='changed';b.initialImageSha256='changed';b.result.input.charter.goal='different';
 assert.deepEqual(analyzeReasonRuns([a,b]).pairs[0].errors,['REVISION_MISMATCH','INITIAL_IMAGE_MISMATCH','CONFIG_MISMATCH','CHARTER_MISMATCH']);
});
test('reason route evidence retains query and empty hash distinctions and requires the next observation',()=>{
 const run=runRecord();run.result.steps=[auditStep(1,'/good/?task=revisit&variant=alpha',{type:'click',elementId:'a'}),auditStep(2,'/good/?task=revisit&variant=alpha#home',{type:'back'})];
 const edges=analyzeReasonRuns([run]).runs[0].route.edges;
 assert.equal(edges[0].from,'/good/?task=revisit&variant=alpha');assert.equal(edges[0].to,'/good/?task=revisit&variant=alpha#home');assert.equal(edges[1].to,null);assert.equal(edges[1].status,'unknown');
 run.result.steps[0].outcome='ACTION_ERROR';assert.equal(analyzeReasonRuns([run]).runs[0].route.edges[0].to,null);
});


test('preflight failure preserves its fresh ledger and reports actual consumption without starting a model request',async()=>{
 const base=await mkdtemp(join(tmpdir(),'reason-preflight-'));
 try{
  const out=join(base,'fresh');await assert.rejects(runDeferralReasonExperiment({out,mock:false,envFile:join(base,'absent.env'),limit:1}),{code:'ENOENT'});
  const manifest=JSON.parse(await readFile(join(out,'manifest.json'),'utf8'));
  assert.equal(manifest.status,'BATCH_ERROR');assert.equal(manifest.requestAccounting.used,0);assert.equal(manifest.budgetLedgers.length,1);assert.equal(manifest.budgetLedgers[0].used,0);
  const ledger=JSON.parse(await readFile(join(out,manifest.budgetLedgers[0].path),'utf8'));assert.equal(ledger.used,0);assert.deepEqual(ledger.attempts,[]);
 }finally{await rm(base,{recursive:true,force:true});}
});
