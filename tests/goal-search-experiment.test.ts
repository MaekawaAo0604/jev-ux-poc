import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {reasonComparisonPlan,reasonSchedule,analyzeReasonRuns,snapshotReasonPriorLedgers} from '../runner/deferral-reason-experiment.js';
import {humanJevProfile} from '../runner/human-jev-profiles.js';
import type {BetaResult,BetaStep} from '../runner/virtual-beta-core.js';
import type {GoalSearchEntry} from '../jev/virtual-beta/goal-search-contracts.js';
function runRecord(condition:'old'|'reason'='reason'){
 const id='notifications-r1-'+condition,config=humanJevProfile(condition==='old'?'experience-reason-correspondence':'experience-goal-search').config;
 const result:BetaResult={schemaVersion:1,runId:id,condition,code:{revision:'frozen',sourceHash:'source'},config,input:{charter:{schemaVersion:1,id:'task',targetWebsite:'local:demo',goal:'Stop notifications',initialState:{description:'initial',currentDate:'2026-10-28'},scope:['settings'],prohibitedActions:{actionTypes:[],controlTexts:[],downloads:true},maxActions:15}},initialFingerprint:'initial',objectiveSuccess:false,objectiveAssessment:{status:'OK',value:false},terminalObservation:{status:'RECORDED'},validForComparison:true,perceivedDone:false,termination:'DECISION_LIMIT',looks:0,uiActions:4,decisions:5,apiCalls:10,apiMs:20,uiMs:10,elapsedMs:30,modeledUserMs:null,steps:[]};
 return {id,scenario:'notifications' as const,replicate:1 as const,condition,initialImageSha256:'same',result};
}
function fixture(){
 const goalSha256=createHash('sha256').update('Stop notifications').digest('hex');
 const record:GoalSearchEntry={kind:'model-goal-search-not-fact',source:{observationId:'o4',imageSha256:'current'},goalSha256,scope:'delivered-current-view-only',requirements:[{id:'g1',text:'Stop notifications',assessment:'not_shown'}],finding:{kind:'no-target-in-view'}};
 const previous={schemaVersion:1,entries:[{...structuredClone(record),source:{observationId:'o2',imageSha256:'prior'},finding:{kind:'guidance'}}]},memory={schemaVersion:1,entries:[...previous.entries,record]};
 const saved={number:4,goalSearch:{record,memory,annotations:[{candidateId:'e2',before:'before search',after:'after goal-search hypothesis'}]},deliberation:{modelInput:{observation:{id:'o4',image:'current'},userState:{goalSearch:structuredClone(previous)}},assetFiles:{current:{file:'current.png',sha256:'current'},memory_0:{file:'prior.png',sha256:'prior'}},questions:{goalSearch_image_check_0:{type:'choice',criteria:{observed:'observed',not_shown:'not shown',context:'context',contradicted:'contradicted',uncertain:'uncertain'}},goalSearch_finding:{type:'choice',criteria:{target_e2:'target',prerequisite:'prerequisite',guidance:'guidance',no_target_in_view:'no target in this view',uncertain:'uncertain'}}},response:{model:'SCRIPTED_TEST_ONLY',answers:{goalSearch_image_check_0:{choice:'not_shown',probabilities:{observed:0,not_shown:1,context:0,contradicted:0,uncertain:0}},goalSearch_finding:{choice:'no_target_in_view',probabilities:{target_e2:0,prerequisite:0,guidance:0,no_target_in_view:1,uncertain:0}},knowledge:{choice:'insufficient',probabilities:{insufficient:1}}}}},modelInput:{observation:{id:'o4',image:'current'},userState:{goalSearch:structuredClone(memory)}},assetFiles:{current:{file:'current.png',sha256:'current'},memory_0:{file:'prior.png',sha256:'prior'}},questions:{nextAction:{type:'choice',criteria:{e2:'after goal-search hypothesis',done:'done'}}},selection:{modelChoice:'e2',raw:{e2:0.8,done:0.2},normalized:{e2:0.8,done:0.2},filtered:{e2:0.8,done:0.2},normalization:{rawTotal:1,filteredTotal:1},adjustments:[],mode:'argmax',seed:1,drawIndex:0,draw:null,selected:'e2'},action:{type:'click',elementId:'e2'},outcome:'UI_PERFORMED'};
 return saved;
}
function report(saved:ReturnType<typeof fixture>){const run=runRecord();run.result.steps=[saved as unknown as BetaStep];return analyzeReasonRuns([run],'goal-search');}
test('goal-search comparison fixes the schedule and caps while declaring intentionally different initial questions',()=>{
 const plan=reasonComparisonPlan('goal-search',2);assert.deepEqual(plan.modes,{old:'experience-reason-correspondence',reason:'experience-goal-search'});assert.equal(plan.phase,'goal-search-comparison');assert.equal(plan.ledgerPhase,'goal-search');assert.deepEqual(plan.fullSchedule,reasonSchedule());assert.equal(plan.schedule.length,2);assert.equal(plan.fullSchedule.length,12);assert.equal(plan.limits.maxRequests,48);assert.equal(plan.limits.phaseMaximumRequests,288);assert.equal(plan.limits.maxRequestsPerTrial,24);assert.equal(plan.limits.maxJudgmentsPerTrial,12);assert.equal(plan.limits.parallel,1);
 assert.equal(plan.inputComponents.shared.initialQuestionsDiffer,true);assert.equal(plan.inputComponents.shared.additionalAPIStages,0);assert.equal(plan.inputComponents.reason.additionalImages,0);assert.equal(plan.inputComponents.reason.goalSearchCapacity,8);assert.equal(plan.inputComponents.reason.maxGoalFragments,8);assert.equal(plan.inputComponents.reason.maxUniqueImages,4);assert.match(String(plan.inputComponents.reason.declaredDifference),/question.*memory.*criteria/i);
 const expected=structuredClone(plan);(plan.modes as unknown as Record<string,string>).old='POISON';plan.inputComponents.reason.goalSearchCapacity=999;assert.deepEqual(reasonComparisonPlan('goal-search',2),expected);
});
test('goal-search pairs exclude only id and goalSearch config while enforcing prior components goal and persona',()=>{
 const a=runRecord('old'),b=runRecord();assert.equal(analyzeReasonRuns([a,b],'goal-search').pairs[0].consistent,true);
 for(const change of [(r:typeof b)=>{r.result.config.correspondence!.capacity=7;},(r:typeof b)=>{r.result.config.deferral!.selectionScope='global';},(r:typeof b)=>{r.result.config.deferralReason!.reviewMode='separate';},(r:typeof b)=>{r.result.config.selection.seed=999;},(r:typeof b)=>{r.result.input.charter.goal='different';},(r:typeof b)=>{Object.assign(r.result.input,{persona:{id:'different'}});}]){const changed=structuredClone(b);change(changed);assert.equal(analyzeReasonRuns([a,changed],'goal-search').pairs[0].consistent,false);}
 assert.equal(analyzeReasonRuns([a,b],'observation-correspondence').pairs[0].consistent,false);
});
test('goal-search snapshots ninety-four predecessor ledgers and honestly skips absent local artifacts',async()=>{
 const root=await mkdtemp(join(tmpdir(),'goal-search-prior-'));
 try{assert.deepEqual(await snapshotReasonPriorLedgers('goal-search',root),[]);const live=join(root,'reports/observation-correspondence-2026-10-29/live');await mkdir(live,{recursive:true});const priorLedgers=[],records=[];
  for(let i=0;i<82;i++){const path='prior-'+i+'.json';await writeFile(join(root,path),'prior '+i);priorLedgers.push({path,sha256:'stale'});}for(let i=0;i<12;i++){const id='trial-'+i;records.push({id});await writeFile(join(live,id+'-budget.json'),'trial '+i);}await writeFile(join(live,'manifest.json'),JSON.stringify({priorLedgers,records}));
  const saved=await snapshotReasonPriorLedgers('goal-search',root);assert.equal(saved.length,94);assert.deepEqual(await snapshotReasonPriorLedgers('goal-search',root),saved);assert.deepEqual(await snapshotReasonPriorLedgers('observation-correspondence',root),[]);await rm(join(root,'prior-0.json'));assert.equal((await snapshotReasonPriorLedgers('goal-search',root)).length,93);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('goal-search summary preserves questions full raw answers sources both memory stages annotations and actual action separately',()=>{
 const saved=fixture(),summary=report(saved),view=summary.runs[0];assert.equal(view.goalSearchQuestionCount,2);assert.equal(view.goalSearchResponseCount,2);assert.equal(view.goalSearchMissingResponses,0);assert.equal(view.goalSearchRecords,1);assert.equal(view.sourceMatchedGoalSearchRecords,1);assert.equal(view.goalSearchAnnotations,1);assert.equal(view.goalSearchAnnotationCriteriaMatches,1);assert.equal(view.goalSearchSelectedAnnotatedSteps,1);assert.equal(view.selectedReportedTargetSteps,0);assert.equal(view.goalSearchFindingCounts?.['no-target-in-view'],1);assert.equal(view.goalSearchRequirementAssessments?.not_shown,1);assert.equal(view.maxGoalSearchMemoryEntries,2);assert.equal(view.maxDeliveredUniqueImages,2);assert.equal(summary.cells[0].goalSearchRecords,1);assert.ok(view.goalSearchTrace);
 const trace=view.goalSearchTrace[0];assert.deepEqual(trace.questions,saved.deliberation.questions);assert.deepEqual(trace.answers.goalSearch_finding,saved.deliberation.response.answers.goalSearch_finding);assert.equal(Object.hasOwn(trace.answers,'knowledge'),false);assert.deepEqual(trace.record,saved.goalSearch.record);assert.equal(trace.actionMemoryMatchesRecorded,true);assert.equal(trace.currentRecordRemembered,true);assert.equal(trace.actualSelected,'e2');assert.equal(trace.action?.type,'click');assert.equal(trace.outcome,'UI_PERFORMED');assert.equal(view.termination,'DECISION_LIMIT');assert.equal(summary.kind,'offline-goal-search-descriptive-comparison');assert.ok(summary.limitations.some(value=>value.includes('hypotheses')&&value.includes('transcript')));
});
test('goal-search metadata mismatches remain visible rather than being treated as source or annotation matches',()=>{
 const saved=fixture();saved.deliberation.assetFiles.current.sha256='wrong';saved.questions.nextAction.criteria.e2='different';saved.modelInput.userState.goalSearch=saved.deliberation.modelInput.userState.goalSearch;
 const view=report(saved).runs[0];assert.equal(view.sourceMatchedGoalSearchRecords,0);assert.equal(view.goalSearchAnnotationCriteriaMatches,0);assert.equal(view.goalSearchSelectedAnnotatedSteps,0);assert.ok(view.goalSearchTrace);assert.equal(view.goalSearchTrace[0].actionMemoryMatchesRecorded,false);assert.equal(view.goalSearchRecords,1);
});
test('reported target selection remains a model finding and does not inflate the objective result',()=>{
 const saved=fixture();saved.goalSearch.record.finding={kind:'target',candidateId:'e2'};saved.deliberation.response.answers.goalSearch_finding={choice:'target_e2',probabilities:{target_e2:1,prerequisite:0,guidance:0,no_target_in_view:0,uncertain:0}};
 const view=report(saved).runs[0];assert.equal(view.selectedReportedTargetSteps,1);assert.equal(view.goalSearchFindingCounts?.target,1);assert.equal(view.success,false);assert.equal(view.objectiveAssessment.value,false);
});
test('missing answers and unsolicited prefixed answers are counted separately from requested full raw responses',()=>{
 const saved=fixture();delete (saved.deliberation.response.answers as unknown as Record<string,unknown>).goalSearch_finding;Object.assign(saved.deliberation.response.answers,{goalSearch_unrequested:{choice:'uncertain',probabilities:{uncertain:1}}});
 const view=report(saved).runs[0];assert.equal(view.goalSearchQuestionCount,2);assert.equal(view.goalSearchResponseCount,1);assert.equal(view.goalSearchMissingResponses,1);assert.equal(view.goalSearchUnsolicitedResponses,1);
});
test('goal-search faults retain audit traces while remaining outside valid behavior and outcome totals',()=>{
 const run=runRecord();run.result.steps=[fixture() as unknown as BetaStep];run.result.termination='API_ERROR';const summary=analyzeReasonRuns([run],'goal-search');assert.equal(summary.runs[0].goalSearchRecords,1);assert.equal(summary.cells[0].valid,0);assert.equal(summary.cells[0].faults,1);assert.equal(summary.cells[0].goalSearchRecords,0);assert.equal(summary.cells[0].goalSearchAnnotations,0);assert.equal(summary.cells[0].maxGoalSearchMemoryEntries,null);
});
test('disabled goal-search and existing comparisons do not invent search findings from unrelated saved questions',()=>{
 const run=runRecord('old');run.result.steps=[{number:1,deliberation:{questions:{knowledge:{type:'choice',criteria:{uncertain:'uncertain'}}},modelInput:{},assetFiles:{}}} as unknown as BetaStep];const view=analyzeReasonRuns([run],'goal-search').runs[0];assert.equal(view.goalSearchQuestionCount,0);assert.equal(view.goalSearchRecords,0);assert.equal(view.goalSearchFindingCounts?.target,0);assert.equal((analyzeReasonRuns([run]).runs[0] as unknown as Record<string,unknown>).goalSearchRecords,undefined);
});
