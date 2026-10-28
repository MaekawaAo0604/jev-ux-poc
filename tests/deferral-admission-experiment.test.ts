import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {reasonSchedule,validateReasonExperimentOptions,analyzeReasonRuns,runDeferralReasonExperiment,snapshotReasonPriorLedgers} from '../runner/deferral-reason-experiment.js';
import {humanJevProfile} from '../runner/human-jev-profiles.js';
import type {BetaResult} from '../runner/virtual-beta-core.js';

function runRecord(condition:'old'|'reason'){
 const id='notifications-r1-'+condition;
 const config=humanJevProfile('experience-reason').config;
 if(condition==='reason')Object.assign(config.deferralReason!,{basisAdmission:'excursion-evidence'});
 const result:BetaResult={schemaVersion:1,runId:id,condition,code:{revision:'frozen',sourceHash:'source'},config,input:{charter:{schemaVersion:1,id:'task',targetWebsite:'local:demo',goal:'Stop notifications',initialState:{description:'initial',currentDate:'2026-10-28'},scope:['settings'],prohibitedActions:{actionTypes:[],controlTexts:[],downloads:true},maxActions:15}},initialFingerprint:'initial',objectiveSuccess:false,objectiveAssessment:{status:'OK',value:false},terminalObservation:{status:'RECORDED'},validForComparison:true,perceivedDone:true,termination:'DECISION_LIMIT',looks:0,uiActions:4,decisions:5,apiCalls:10,apiMs:20,uiMs:10,elapsedMs:30,modeledUserMs:null,steps:[]};
 return {id,scenario:'notifications' as const,replicate:1 as const,condition,initialImageSha256:'same',result};
}
test('admission comparison rejects unsupported comparisons before output setup and analysis',()=>{
 for(const comparison of ['',null,'other',0]){
  assert.throws(()=>validateReasonExperimentOptions({out:'reports/fresh',mock:true,comparison:comparison as 'reason-admission'}),/UNKNOWN_REASON_COMPARISON/);
  assert.throws(()=>analyzeReasonRuns([],comparison as 'reason-admission'),/UNKNOWN_REASON_COMPARISON/);
 }
 assert.doesNotThrow(()=>validateReasonExperimentOptions({out:'reports/fresh',mock:true,comparison:'reason-admission',limit:12}));
});
test('admission pair excludes only id and basisAdmission while enforcing the rest of reason config',()=>{
 const a=runRecord('old'),b=runRecord('reason');b.result.config.id='excursion';
 assert.equal(analyzeReasonRuns([a,b],'reason-admission').pairs[0].consistent,true);
 for(const change of [
  (r:typeof b)=>{r.result.config.deferralReason!.capacity=7;},
  (r:typeof b)=>{r.result.config.deferralReason!.maxReasonImages=0;},
  (r:typeof b)=>{r.result.config.deferralReason!.enabled=false;},
  (r:typeof b)=>{delete r.result.config.deferralReason;},
  (r:typeof b)=>{r.result.config.deferral!.weight=0.2;},
  (r:typeof b)=>{r.result.config.maxAPICalls=25;},
  (r:typeof b)=>{r.result.config.state.memoryCapacity=2;}
 ]){const changed=structuredClone(b);change(changed);assert.deepEqual(analyzeReasonRuns([a,changed],'reason-admission').pairs[0].errors,['CONFIG_MISMATCH']);}
 const changed=structuredClone(b);changed.result.config.deferralReason!.capacity=7;
 assert.equal(analyzeReasonRuns([a,changed]).pairs[0].consistent,true);
});
test('admission pair still enforces source revision initial image goal and persona',()=>{
 const a=runRecord('old'),b=runRecord('reason');b.result.code={revision:'different',sourceHash:'different'};b.initialImageSha256='different';b.result.input.charter.goal='different';Object.assign(b.result.input,{persona:{schemaVersion:1,id:'different'}});
 assert.deepEqual(analyzeReasonRuns([a,b],'reason-admission').pairs[0].errors,['SOURCE_HASH_MISMATCH','REVISION_MISMATCH','INITIAL_IMAGE_MISMATCH','CHARTER_MISMATCH','PERSONA_MISMATCH']);
});
test('admission prior snapshot includes predecessor thirty-four plus twelve fresh ledgers and tolerates absent clean-clone data',async()=>{
 const root=await mkdtemp(join(tmpdir(),'admission-prior-'));
 try{
  assert.deepEqual(await snapshotReasonPriorLedgers('reason-admission',root),[]);
  const live=join(root,'reports/deferral-reason-2026-10-28/live');await mkdir(live,{recursive:true});
  const priorLedgers=[];for(let i=0;i<34;i++){const path='prior-'+i+'.json';await writeFile(join(root,path),'ledger '+i);priorLedgers.push({path,sha256:'stale-previous-hash'});}
  const records=[];for(let i=0;i<12;i++){const id='trial-'+i;records.push({id});await writeFile(join(live,id+'-budget.json'),'trial ledger '+i);}
  await writeFile(join(live,'manifest.json'),JSON.stringify({priorLedgers,records}));
  const before=await snapshotReasonPriorLedgers('reason-admission',root);assert.equal(before.length,46);assert.ok(before.every(item=>/^[a-f0-9]{64}$/.test(item.sha256)));
  assert.deepEqual(await snapshotReasonPriorLedgers('reason-admission',root),before);
  assert.deepEqual(await snapshotReasonPriorLedgers('deferral-reason',root),[]);
  await rm(join(root,'prior-0.json'));assert.equal((await snapshotReasonPriorLedgers('reason-admission',root)).length,45);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('admission comparison preserves fresh-directory refusal and missing-env incomplete accounting',async()=>{
 const base=await mkdtemp(join(tmpdir(),'admission-preflight-'));
 try{
  const existing=join(base,'existing');await mkdir(existing);await assert.rejects(runDeferralReasonExperiment({out:existing,mock:true,comparison:'reason-admission',limit:1}),{code:'EEXIST'});
  const out=join(base,'fresh');await assert.rejects(runDeferralReasonExperiment({out,mock:false,comparison:'reason-admission',envFile:join(base,'absent.env'),limit:1}),{code:'ENOENT'});
  const manifest=JSON.parse(await readFile(join(out,'manifest.json'),'utf8'));
  assert.equal(manifest.comparison,'reason-admission');assert.equal(manifest.phase,'deferral-reason-admission-comparison');assert.equal(manifest.status,'BATCH_ERROR');assert.equal(manifest.requestAccounting.used,0);assert.equal(manifest.budgetLedgers.length,1);
  const ledger=JSON.parse(await readFile(join(out,manifest.budgetLedgers[0].path),'utf8'));assert.equal(ledger.used,0);assert.equal(ledger.newMaximum,24);assert.equal(ledger.perRunMaximum,12);assert.match(ledger.phase,/^deferral-reason-admission-/);
  assert.equal(JSON.parse(await readFile(join(out,'prior-ledger-check.json'),'utf8')).unchanged,true);
 }finally{await rm(base,{recursive:true,force:true});}
});
test('admission mock pair records common input budgets modes and prior preservation with zero real requests',async()=>{
 const base=await mkdtemp(join(tmpdir(),'admission-mock-'));
 try{
  const prior=await snapshotReasonPriorLedgers('reason-admission');const out=join(base,'fresh');const saved=await runDeferralReasonExperiment({out,mock:true,comparison:'reason-admission',limit:2});
  assert.equal(saved.status,'COMPLETED');assert.equal(saved.requests,0);assert.equal(saved.trials,2);
  const manifest=JSON.parse(await readFile(join(out,'manifest.json'),'utf8'));
  assert.equal(manifest.comparison,'reason-admission');assert.equal(manifest.phase,'deferral-reason-admission-comparison');assert.deepEqual(manifest.modes,{old:'experience-reason',reason:'experience-reason-excursion'});
  assert.deepEqual(manifest.fullSchedule,reasonSchedule());assert.equal(manifest.fullSchedule.length,12);assert.equal(manifest.limits.maxRequests,48);assert.equal(manifest.limits.phaseMaximumRequests,288);assert.equal(manifest.limits.maxRequestsPerTrial,24);assert.equal(manifest.limits.maxJudgmentsPerTrial,12);assert.equal(manifest.limits.maxUIActionsPerTrial,15);assert.equal(manifest.limits.maxLooksPerTrial,3);assert.equal(manifest.limits.maxRunMs,180000);assert.equal(manifest.limits.phaseMs,1200000);assert.equal(manifest.limits.parallel,1);
  for(const component of ['old','reason']){assert.equal(manifest.inputComponents[component].memoryCapacity,8);assert.equal(manifest.inputComponents[component].maxOriginalReasonImages,1);assert.equal(manifest.inputComponents[component].maxUniqueImages,4);}
  assert.equal(manifest.inputComponents.shared.recencyImages,3);assert.equal(manifest.inputComponents.shared.longContext,true);assert.equal(manifest.inputComponents.shared.attempts,1);assert.equal(manifest.inputComponents.shared.additionalAPIStages,0);assert.equal(manifest.humanInputsRead,false);assert.equal(manifest.performanceEvidence,false);assert.deepEqual(manifest.budgetLedgers,[]);
  const summary=JSON.parse(await readFile(join(out,'summary.json'),'utf8'));assert.equal(summary.comparison,'reason-admission');assert.equal(summary.pairs[0].consistent,true);
  for(const record of manifest.records){assert.equal(record.requests,0);assert.equal(JSON.parse(await readFile(join(out,record.replayPath),'utf8')).verified,true);await assert.rejects(readFile(join(out,record.id+'-budget.json')),{code:'ENOENT'});}
  const check=JSON.parse(await readFile(join(out,'prior-ledger-check.json'),'utf8'));assert.equal(check.checked,prior.length);assert.equal(check.unchanged,true);assert.deepEqual(await snapshotReasonPriorLedgers('reason-admission'),prior);
 }finally{await rm(base,{recursive:true,force:true});}
});
