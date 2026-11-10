import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {reasonComparisonPlan,reasonSchedule,analyzeReasonRuns,snapshotReasonPriorLedgers} from '../runner/deferral-reason-experiment.js';
import {humanJevProfile} from '../runner/human-jev-profiles.js';
import type {SelectionRecord,UIConditionalPolicyRecord} from '../jev/virtual-beta/contracts.js';
import type {BetaResult,BetaStep} from '../runner/virtual-beta-core.js';
function runRecord(condition:'old'|'reason'='old'){
 const id='notifications-r1-'+condition,config=humanJevProfile(condition==='old'?'experience-reason-grounded':'experience-reason-conditional').config;
 const result:BetaResult={schemaVersion:1,runId:id,condition,code:{revision:'frozen',sourceHash:'source'},config,input:{charter:{schemaVersion:1,id:'task',targetWebsite:'local:demo',goal:'Stop notifications',initialState:{description:'initial',currentDate:'2026-10-28'},scope:['settings'],prohibitedActions:{actionTypes:[],controlTexts:[],downloads:true},maxActions:15}},initialFingerprint:'initial',objectiveSuccess:false,objectiveAssessment:{status:'OK',value:false},terminalObservation:{status:'RECORDED'},validForComparison:true,perceivedDone:false,termination:'STUCK',looks:0,uiActions:4,decisions:5,apiCalls:10,apiMs:20,uiMs:10,elapsedMs:30,modeledUserMs:null,steps:[]};
 return {id,scenario:'notifications' as const,replicate:1 as const,condition,initialImageSha256:'same',result};
}
function selection(before:Record<string,number>,selected:string,options:{modelChoice?:string;mode?:'argmax'|'sample';draw?:number;scope?:UIConditionalPolicyRecord;filtered?:Record<string,number>}={}):SelectionRecord{
 return {modelChoice:options.modelChoice??'e2',raw:{...before},normalized:{...before},filtered:options.filtered??{...before},normalization:{rawTotal:1,filteredTotal:1},adjustments:[],mode:options.mode??'argmax',seed:7,drawIndex:0,draw:options.mode==='sample'?options.draw??null:null,selected,policy:{kind:'temporary-deferral',before:{...before},weights:Object.fromEntries(Object.keys(before).map(key=>[key,key.startsWith('e')?0.01:1])),weightedTotal:0.0694,...(options.scope?{scope:structuredClone(options.scope)}:{})}};
}
function step(record:SelectionRecord,number=1):BetaStep{
 return {number,selection:record,audit:{url:'http://localhost:4000/bad/#settings',screen:{title:'settings',text:[],elements:[{id:'e1',type:'button',text:'one'},{id:'e2',type:'button',text:'two'}],canScrollUp:false,canScrollDown:false},rawScreenshot:'audit.png',sourceSha256:'audit'}};
}
const before={e1:0.08,e2:0.86,stuck:0.04,done:0.01,abandon:0.01};
const scope: UIConditionalPolicyRecord={kind:'ui-conditional-v1',baselineSelected:'e2',baselineClass:'ui',uiCandidates:['e1','e2'],uiMass:0.94,weightedUIMass:0.0094,marginal:{...before},conditionalDraw:null};
test('scope plan retains twelve slots fixed limits same model inputs and independently copied modes',()=>{
 const plan=reasonComparisonPlan('deferral-scope',2);assert.deepEqual(plan.modes,{old:'experience-reason-grounded',reason:'experience-reason-conditional'});assert.equal(plan.phase,'deferral-scope-comparison');assert.equal(plan.ledgerPhase,'deferral-scope');assert.deepEqual(plan.fullSchedule,reasonSchedule());assert.equal(plan.fullSchedule.length,12);assert.equal(plan.schedule.length,2);
 assert.deepEqual(plan.limits,{trials:2,maxRequests:48,phaseMaximumRequests:288,maxRequestsPerTrial:24,maxJudgmentsPerTrial:12,maxUIActionsPerTrial:15,maxLooksPerTrial:3,maxRunMs:180000,phaseMs:1200000,parallel:1});
 for(const arm of ['old','reason'] as const){assert.equal(plan.inputComponents[arm].maxUniqueImages,4);assert.equal(plan.inputComponents[arm].basisAdmission,'excursion-evidence');assert.equal(plan.inputComponents[arm].reviewMode,'grounded-choice');}
 assert.equal(plan.inputComponents.old.selectionScope,'global');assert.equal(plan.inputComponents.reason.selectionScope,'ui-conditional');assert.equal(plan.inputComponents.shared.additionalAPIStages,0);
 const expected=structuredClone(plan);(plan.modes as unknown as Record<string,string>).old='POISON';plan.inputComponents.shared.recencyImages=999;plan.limits.maxRequests=999;plan.fullSchedule[0].id='POISON';assert.deepEqual(reasonComparisonPlan('deferral-scope',2),expected);
});
test('scope pair permits only id and deferral selectionScope while retaining all reason and sampler configuration',()=>{
 const a=runRecord(),b=runRecord('reason');assert.equal(analyzeReasonRuns([a,b],'deferral-scope').pairs[0].consistent,true);
 for(const change of [
  (r:typeof b)=>{r.result.config.deferralReason!.reviewMode='separate';},
  (r:typeof b)=>{r.result.config.deferralReason!.basisAdmission='negative-evidence';},
  (r:typeof b)=>{r.result.config.deferral!.weight=0.2;},
  (r:typeof b)=>{r.result.config.selection.seed=99;},
  (r:typeof b)=>{r.result.config.selection.mode='sample';},
  (r:typeof b)=>{delete r.result.config.deferral;}
 ]){const changed=structuredClone(b);change(changed);assert.deepEqual(analyzeReasonRuns([a,changed],'deferral-scope').pairs[0].errors,['CONFIG_MISMATCH']);}
 assert.equal(analyzeReasonRuns([a,b],'reason-grounding').pairs[0].consistent,false);
});
test('scope snapshots seventy predecessor ledgers with honest missing-data accounting',async()=>{
 const root=await mkdtemp(join(tmpdir(),'scope-prior-'));
 try{
  assert.deepEqual(await snapshotReasonPriorLedgers('deferral-scope',root),[]);const live=join(root,'reports/deferral-grounding-2026-10-29/live');await mkdir(live,{recursive:true});const priorLedgers=[],records=[];
  for(let i=0;i<58;i++){const path='prior-'+i+'.json';await writeFile(join(root,path),'prior '+i);priorLedgers.push({path,sha256:'stale'});}
  for(let i=0;i<12;i++){const id='trial-'+i;records.push({id});await writeFile(join(live,id+'-budget.json'),'trial '+i);}
  await writeFile(join(live,'manifest.json'),JSON.stringify({priorLedgers,records}));const saved=await snapshotReasonPriorLedgers('deferral-scope',root);assert.equal(saved.length,70);assert.deepEqual(await snapshotReasonPriorLedgers('deferral-scope',root),saved);assert.deepEqual(await snapshotReasonPriorLedgers('reason-grounding',root),[]);
  await rm(join(root,'prior-0.json'));assert.equal((await snapshotReasonPriorLedgers('deferral-scope',root)).length,69);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('scope summary attributes controller-promoted terminal separately from raw model choice and reconstructed baseline',()=>{
 const run=runRecord();run.result.steps=[step(selection(before,'stuck'))];const report=analyzeReasonRuns([run],'deferral-scope'),view=report.runs[0];
 assert.equal(view.policyPromotedTerminal,1);assert.equal(view.baselineTerminalPreserved,0);assert.equal(view.scopeRecorded,0);assert.ok(view.selectionTrace);const trace=view.selectionTrace[0];assert.equal(trace.baselineSelected,'e2');assert.equal(trace.selected,'stuck');assert.equal(trace.modelChoice,'e2');assert.equal(trace.baselineTerminal,'other');assert.equal(trace.selectedTerminal,'stuck');assert.equal(trace.modelChoiceTerminal,'other');assert.equal(trace.baselineUIClass,'ui');assert.equal(trace.uiMass,0.94);assert.equal(trace.nonUIMass,0.06);assert.equal(report.cells[0].policyPromotedTerminal,1);
 assert.equal((analyzeReasonRuns([run]).runs[0] as unknown as Record<string,unknown>).policyPromotedTerminal,undefined);assert.equal(report.kind,'offline-deferral-scope-descriptive-comparison');assert.ok(report.limitations.some(value=>value.includes('human')&&value.includes('heuristic')));
});
test('scope summary keeps recorded marginal and conditional evidence and independently checks scope baseline',()=>{
 const run=runRecord('reason');run.result.steps=[step(selection(before,'e2',{scope,filtered:{e1:0.08/0.94,e2:0.86/0.94,stuck:0,done:0,abandon:0}}))];let view=analyzeReasonRuns([run],'deferral-scope').runs[0];assert.ok(view.selectionTrace);let trace=view.selectionTrace[0];assert.equal(view.policyPromotedTerminal,0);assert.equal(view.scopeRecorded,1);assert.equal(trace.scopeBaselineMatches,true);assert.deepEqual(trace.fullMarginal,before);assert.deepEqual(trace.recordedScope,scope);assert.equal(trace.uiMass,0.94);assert.equal(trace.fullMarginalUIMass,0.94);
 run.result.steps[0].selection!.policy!.scope!.baselineSelected='stuck';view=analyzeReasonRuns([run],'deferral-scope').runs[0];assert.ok(view.selectionTrace);trace=view.selectionTrace[0];assert.equal(trace.baselineSelected,'e2');assert.equal(trace.scopeBaselineMatches,false);
});
test('scope summary reconstructs sample CDF rather than substituting argmax or model choice',()=>{
 const run=runRecord();const draw=createHash('sha256').update('jev-virtual-beta-selection:v1:7:0').digest().readUInt32BE(0)/0x100000000;
 const distribution={e1:draw/2,e2:0.1,done:1-draw/2-0.1};
 // Sorted done interval covers the recorded draw for this fixed seed, independently checked below.
 assert.ok(draw<distribution.done);run.result.steps=[step(selection(distribution,'done',{mode:'sample',draw,modelChoice:'e2'}))];const view=analyzeReasonRuns([run],'deferral-scope').runs[0];assert.ok(view.selectionTrace);const trace=view.selectionTrace[0];assert.equal(trace.baselineSelected,'done');assert.equal(trace.baselineTerminal,'done');assert.equal(trace.drawMatchesSeed,true);assert.equal(view.baselineTerminalPreserved,1);assert.equal(view.policyPromotedTerminal,0);
 run.result.steps[0].selection!.draw=0.999999;const changed=analyzeReasonRuns([run],'deferral-scope').runs[0];assert.ok(changed.selectionTrace);assert.equal(changed.selectionTrace[0].drawMatchesSeed,false);assert.equal(changed.selectionTrace[0].baselineSelected,'e2');
});
test('scope terminal categories preserve done stuck and abandon independently without equating model choice and sampler choice',()=>{
 const run=runRecord();run.result.steps=['done','stuck','abandon'].map((id,i)=>step(selection({[id]:0.9,e2:0.1},id,{modelChoice:'e2'}),i+1));const view=analyzeReasonRuns([run],'deferral-scope').runs[0];assert.equal(view.baselineTerminalPreserved,3);assert.equal(view.policyPromotedTerminal,0);assert.ok(view.selectionTrace);assert.deepEqual(view.selectionTrace.map(item=>item.selectedTerminal),['done','stuck','abandon']);assert.deepEqual(view.selectionTrace.map(item=>item.modelChoiceTerminal),['other','other','other']);
});

test('scope audit gaps leave UI type and mass unknown while keeping baseline probability reconstruction explicit',()=>{
 const run=runRecord('reason'),saved=step(selection(before,'e2',{scope}));delete saved.audit;run.result.steps=[saved];const view=analyzeReasonRuns([run],'deferral-scope').runs[0];assert.ok(view.selectionTrace);const trace=view.selectionTrace[0];assert.equal(trace.baselineSelected,'e2');assert.equal(trace.candidateClassEvidence,'unavailable-or-invalid-audit');assert.equal(trace.baselineUIClass,'unknown');assert.equal(trace.uiCandidates,null);assert.equal(trace.uiMass,null);assert.equal(trace.nonUIMass,null);assert.equal(trace.scopeUICandidatesMatch,null);
});
test('scope baseline uses safe pre-policy distribution rather than the unfiltered raw model distribution',()=>{
 const run=runRecord(),record=selection({e2:0,stuck:0.6,done:0.4},'stuck');record.raw={e2:0.9,stuck:0.06,done:0.04};record.adjustments=[{candidate:'e2',reason:'EXCLUDED_IN_SAVED_RECORD'}];run.result.steps=[step(record)];const report=analyzeReasonRuns([run],'deferral-scope'),view=report.runs[0];assert.ok(view.selectionTrace);assert.equal(view.selectionTrace[0].baselineSelected,'stuck');assert.equal(view.policyPromotedTerminal,0);assert.equal(view.baselineTerminalPreserved,1);assert.equal(report.cells[0].baselineTerminalCounts?.stuck,1);assert.equal(report.cells[0].selectedTerminalCounts?.stuck,1);assert.equal(report.cells[0].modelChoiceTerminalCounts?.other,1);
});
