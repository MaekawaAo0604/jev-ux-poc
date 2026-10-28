import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {reasonSchedule,reasonComparisonPlan,validateReasonExperimentOptions,analyzeReasonRuns,snapshotReasonPriorLedgers} from '../runner/deferral-reason-experiment.js';
import {humanJevProfile} from '../runner/human-jev-profiles.js';
import type {BetaResult,BetaStep} from '../runner/virtual-beta-core.js';
function runRecord(condition:'old'|'reason'){
 const id='notifications-r1-'+condition,config=humanJevProfile(condition==='old'?'experience-reason-excursion':'experience-reason-grounded').config;
 const result:BetaResult={schemaVersion:1,runId:id,condition,code:{revision:'frozen',sourceHash:'source'},config,input:{charter:{schemaVersion:1,id:'task',targetWebsite:'local:demo',goal:'Stop notifications',initialState:{description:'initial',currentDate:'2026-10-28'},scope:['settings'],prohibitedActions:{actionTypes:[],controlTexts:[],downloads:true},maxActions:15}},initialFingerprint:'initial',objectiveSuccess:false,objectiveAssessment:{status:'OK',value:false},terminalObservation:{status:'RECORDED'},validForComparison:true,perceivedDone:true,termination:'DECISION_LIMIT',looks:0,uiActions:4,decisions:5,apiCalls:10,apiMs:20,uiMs:10,elapsedMs:30,modeledUserMs:null,steps:[]};
 return {id,scenario:'notifications' as const,replicate:1 as const,condition,initialImageSha256:'same',result};
}
const generation=(candidateId='a')=>({imageSha256:'home',candidateId,fromObservationId:'o1',toObservationId:'o3'});
function reviewStep(number:number,rawChoices:Record<string,unknown>,reviews:unknown[],groundedQuestions=0):BetaStep{
 const step:BetaStep={number};
 Object.assign(step,{deferralReason:{memory:{schemaVersion:1,entries:[]},effectiveState:{schemaVersion:1,entries:[]},record:{kind:'model-hypothesis-not-fact',rawChoices,reviews,adjustments:[],releasedCandidates:[]}}});
 if(groundedQuestions)Object.assign(step,{deliberation:{questions:Object.fromEntries(Array.from({length:groundedQuestions},(_,i)=>['reasonReview'+i+'Grounded',{type:'choice',criteria:{unknown:'unknown',still_blocks:'blocks',changed_o6:'changed'}}]))}});
 return step;
}
const answer=(choice:string)=>({choice,probabilities:{[choice]:1}});
test('grounding plan fixes the same schedule and request budgets with only declared review-form differences',()=>{
 const plan=reasonComparisonPlan('reason-grounding',2);
 assert.equal(plan.phase,'deferral-reason-grounding-comparison');assert.equal(plan.ledgerPhase,'deferral-reason-grounding');assert.deepEqual(plan.modes,{old:'experience-reason-excursion',reason:'experience-reason-grounded'});
 assert.deepEqual(plan.fullSchedule,reasonSchedule());assert.deepEqual(plan.schedule,reasonSchedule().slice(0,2));assert.equal(plan.fullSchedule.length,12);
 assert.deepEqual(plan.limits,{trials:2,maxRequests:48,phaseMaximumRequests:288,maxRequestsPerTrial:24,maxJudgmentsPerTrial:12,maxUIActionsPerTrial:15,maxLooksPerTrial:3,maxRunMs:180000,phaseMs:1200000,parallel:1});
 for(const component of [plan.inputComponents.old,plan.inputComponents.reason]){assert.equal(component.memoryCapacity,8);assert.equal(component.maxOriginalReasonImages,1);assert.equal(component.maxUniqueImages,4);assert.equal(component.basisAdmission,'excursion-evidence');}
 assert.equal(plan.inputComponents.old.reviewMode,'separate');assert.equal(plan.inputComponents.reason.reviewMode,'grounded-choice');assert.equal(plan.inputComponents.shared.recencyImages,3);assert.equal(plan.inputComponents.shared.additionalAPIStages,0);assert.equal(plan.inputComponents.shared.attempts,1);
 assert.doesNotThrow(()=>validateReasonExperimentOptions({out:'fresh',mock:true,comparison:'reason-grounding'}));
 for(const limit of [0,13,NaN,1.5])assert.throws(()=>reasonComparisonPlan('reason-grounding',limit));
 assert.throws(()=>reasonComparisonPlan('invalid' as 'reason-grounding'),/UNKNOWN_REASON_COMPARISON/);
});
test('grounding plan retains both prior comparison declarations',()=>{
 const legacy=reasonComparisonPlan('deferral-reason'),admission=reasonComparisonPlan('reason-admission');
 assert.deepEqual(legacy.modes,{old:'experience-defer',reason:'experience-reason'});assert.equal(legacy.phase,'deferral-reason-comparison');assert.equal(legacy.inputComponents.old.maxUniqueImages,3);
 assert.deepEqual(admission.modes,{old:'experience-reason',reason:'experience-reason-excursion'});assert.equal(admission.phase,'deferral-reason-admission-comparison');assert.equal(admission.inputComponents.old.basisAdmission,'negative-evidence');assert.equal(admission.inputComponents.reason.basisAdmission,'excursion-evidence');
});
test('grounding pairs permit only id and reviewMode and retain basisAdmission equality',()=>{
 const a=runRecord('old'),b=runRecord('reason');assert.equal(analyzeReasonRuns([a,b],'reason-grounding').pairs[0].consistent,true);
 for(const change of [
  (r:typeof b)=>{r.result.config.deferralReason!.basisAdmission='negative-evidence';},
  (r:typeof b)=>{r.result.config.deferralReason!.capacity=7;},
  (r:typeof b)=>{r.result.config.deferralReason!.maxReasonImages=0;},
  (r:typeof b)=>{delete r.result.config.deferralReason;},
  (r:typeof b)=>{r.result.config.maxAPICalls=25;},
  (r:typeof b)=>{r.result.config.deferral!.weight=0.1;}
 ]){const changed=structuredClone(b);change(changed);assert.deepEqual(analyzeReasonRuns([a,changed],'reason-grounding').pairs[0].errors,['CONFIG_MISMATCH']);}
 assert.equal(analyzeReasonRuns([a,b],'reason-admission').pairs[0].consistent,false);
 assert.equal(analyzeReasonRuns([a,b]).pairs[0].consistent,true);
 const changed=structuredClone(b);changed.result.config.deferralReason!.reviewMode='separate';assert.equal(analyzeReasonRuns([a,changed],'reason-grounding').pairs[0].consistent,true);
});
test('grounding snapshots all fifty-eight predecessor ledgers and reports missing local data honestly',async()=>{
 const root=await mkdtemp(join(tmpdir(),'grounding-prior-'));
 try{
  assert.deepEqual(await snapshotReasonPriorLedgers('reason-grounding',root),[]);
  const live=join(root,'reports/deferral-admission-2026-10-29/live');await mkdir(live,{recursive:true});const priorLedgers=[],records=[];
  for(let i=0;i<46;i++){const path='prior-'+i+'.json';await writeFile(join(root,path),'prior ledger '+i);priorLedgers.push({path,sha256:'stale'});}
  for(let i=0;i<12;i++){const id='trial-'+i;records.push({id});await writeFile(join(live,id+'-budget.json'),'trial ledger '+i);}
  await writeFile(join(live,'manifest.json'),JSON.stringify({priorLedgers,records}));
  const before=await snapshotReasonPriorLedgers('reason-grounding',root);assert.equal(before.length,58);assert.ok(before.every(item=>/^[a-f0-9]{64}$/.test(item.sha256)));assert.deepEqual(await snapshotReasonPriorLedgers('reason-grounding',root),before);
  assert.deepEqual(await snapshotReasonPriorLedgers('reason-admission',root),[]);
  await rm(join(root,'prior-0.json'));assert.equal((await snapshotReasonPriorLedgers('reason-grounding',root)).length,57);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('grounding summary separates marginal changed-without-citation reports from grounded questions and actual releases',()=>{
 const run=runRecord('old');run.result.steps=[
  reviewStep(4,{reasonReview0Status:answer('basis_changed'),reasonReview0Evidence:answer('none')},[{identity:generation(),status:'basis_changed',released:false}]),
  reviewStep(6,{reasonReview0Grounded:answer('changed_o5')},[{identity:generation(),status:'basis_changed',newEvidence:{observationId:'o5',imageSha256:'later'},released:true}],1)
 ];
 const report=analyzeReasonRuns([run],'reason-grounding'),view=report.runs[0];
 assert.equal(view.statusChangedWithoutCitation,1);assert.equal(view.groundedQuestionCount,1);assert.equal(view.groundedResponseCount,1);assert.equal(view.actualReasonReleases,1);
 assert.equal(report.cells[0].statusChangedWithoutCitation,1);assert.equal(report.cells[0].groundedQuestionCount,1);assert.equal(view.reasonRecords.length,2);
 assert.equal((analyzeReasonRuns([run]).runs[0] as unknown as Record<string,unknown>).statusChangedWithoutCitation,undefined);
 assert.equal(report.kind,'offline-deferral-reason-grounding-descriptive-comparison');assert.ok(report.limitations.some(value=>value.includes('syntactic')&&value.includes('semantic')));
});
test('completed review latency stays within each exact deferral generation and leaves unreleased generations unknown',()=>{
 const run=runRecord('reason');run.result.steps=[reviewStep(4,{},[{identity:generation('a'),status:'unknown',released:false}]),reviewStep(6,{},[{identity:generation('b'),status:'still_blocks',released:false}]),reviewStep(8,{},[{identity:generation('b'),status:'basis_changed',released:true}]),reviewStep(10,{},[{identity:{...generation('a'),toObservationId:'o9'},status:'basis_changed',released:true}])];
 const latency=analyzeReasonRuns([run],'reason-grounding').runs[0].completedReviewLatency;
 assert.ok(latency);assert.equal(latency.entries.length,3);assert.deepEqual(latency.entries.map(entry=>[entry.firstReviewStep,entry.firstReleaseStep,entry.delaySteps]),[[4,null,null],[6,8,2],[10,10,0]]);assert.equal(latency.meanReleasedDelaySteps,1);assert.equal(latency.unreleasedGenerations,1);assert.match(latency.definition,/completed/);
});
test('no completed review does not become zero-delay release evidence',()=>{
 const view=analyzeReasonRuns([runRecord('old')],'reason-grounding').runs[0];assert.ok(view.completedReviewLatency);assert.deepEqual(view.completedReviewLatency.entries,[]);assert.equal(view.completedReviewLatency.meanReleasedDelaySteps,null);assert.equal(view.statusChangedWithoutCitation,0);assert.equal(view.actualReasonReleases,0);
});

test('question-only or failed assessment records do not become completed review latency observations',()=>{
 const run=runRecord('reason'),step=reviewStep(2,{},[],1);delete step.deferralReason;run.result.steps=[step];run.result.termination='API_ERROR';
 const report=analyzeReasonRuns([run],'reason-grounding'),view=report.runs[0];
 assert.equal(view.groundedQuestionCount,1);assert.equal(view.groundedResponseCount,0);assert.ok(view.completedReviewLatency);assert.deepEqual(view.completedReviewLatency.entries,[]);assert.equal(view.completedReviewLatency.meanReleasedDelaySteps,null);assert.equal(report.cells[0].valid,0);assert.equal(report.cells[0].groundedQuestionCount,0);
});

for(const comparison of ['deferral-reason','reason-admission','reason-grounding'] as const){
 test(comparison+' plan modes cannot poison the next comparison plan',()=>{
  const first=reasonComparisonPlan(comparison),expected=structuredClone(reasonComparisonPlan(comparison)),originalModes={...first.modes};
  try{
   const writable=first.modes as unknown as Record<string,string>;writable.old='POISONED_PLAN';writable.reason='POISONED_REASON';
   const next=reasonComparisonPlan(comparison);
   assert.deepEqual(next,expected);assert.notStrictEqual(next.modes,first.modes);
  }finally{Object.assign(first.modes,originalModes);}
 });
 test(comparison+' plan input schedule and budget mutations stay within that returned plan',()=>{
  const first=reasonComparisonPlan(comparison),expected=structuredClone(reasonComparisonPlan(comparison));
  first.inputComponents.shared.recencyImages=99;first.inputComponents.old.mode='POISONED_INPUT';first.inputComponents.reason.maxUniqueImages=99;
  first.schedule[0].id='POISONED_SCHEDULE';first.fullSchedule[1].id='POISONED_FULL_SCHEDULE';first.schedule.pop();first.fullSchedule.pop();first.limits.maxRequests=999;
  const next=reasonComparisonPlan(comparison);
  assert.deepEqual(next,expected);assert.notStrictEqual(next.inputComponents,first.inputComponents);assert.notStrictEqual(next.inputComponents.shared,first.inputComponents.shared);assert.notStrictEqual(next.inputComponents.old,first.inputComponents.old);assert.notStrictEqual(next.inputComponents.reason,first.inputComponents.reason);assert.notStrictEqual(next.schedule,first.schedule);assert.notStrictEqual(next.fullSchedule,first.fullSchedule);assert.notStrictEqual(next.limits,first.limits);
 });
}
