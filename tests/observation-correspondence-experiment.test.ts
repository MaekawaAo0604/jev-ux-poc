import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {reasonComparisonPlan,reasonSchedule,analyzeReasonRuns,snapshotReasonPriorLedgers} from '../runner/deferral-reason-experiment.js';
import {humanJevProfile} from '../runner/human-jev-profiles.js';
import type {BetaResult,BetaStep} from '../runner/virtual-beta-core.js';
function runRecord(condition:'old'|'reason'='reason'){
 const id='notifications-r1-'+condition,config=humanJevProfile('experience-reason-conditional').config;
 if(condition==='reason'){config.id='correspondence';Object.assign(config,{correspondence:{enabled:true,capacity:8,maxCurrentCandidates:8,maxPastCandidates:12,maxUniqueImages:4}});}
 const result:BetaResult={schemaVersion:1,runId:id,condition,code:{revision:'frozen',sourceHash:'source'},config,input:{charter:{schemaVersion:1,id:'task',targetWebsite:'local:demo',goal:'Stop notifications',initialState:{description:'initial',currentDate:'2026-10-28'},scope:['settings'],prohibitedActions:{actionTypes:[],controlTexts:[],downloads:true},maxActions:15}},initialFingerprint:'initial',objectiveSuccess:false,objectiveAssessment:{status:'OK',value:false},terminalObservation:{status:'RECORDED'},validForComparison:true,perceivedDone:false,termination:'DECISION_LIMIT',looks:0,uiActions:4,decisions:5,apiCalls:10,apiMs:20,uiMs:10,elapsedMs:30,modeledUserMs:null,steps:[]};
 return {id,scenario:'notifications' as const,replicate:1 as const,condition,initialImageSha256:'same',result};
}
function fixture(){
 const current={observationId:'o4',imageSha256:'current'},prior={observationId:'o2',imageSha256:'prior'},context={kind:'visual-correspondence-hypothesis-not-fact',current,prior,currentCandidateIds:['e1','e2','e3'],priorCandidateIds:['e8','e9','e10']};
 const rawChoices={correspondence_e1:{choice:'unchanged_e8',probabilities:{unchanged_e8:1,changed_e8:0,none:0}},correspondence_e2:{choice:'changed_e9',probabilities:{changed_e9:1,unchanged_e9:0,none:0}},correspondence_e3:{choice:'none',probabilities:{none:1,unchanged_e10:0,changed_e10:0}}};
 const record={kind:'model-correspondence-hypotheses-not-fact',current,prior,rawChoices,links:[{candidateId:'e1',priorCandidateId:'e8',status:'unchanged'},{candidateId:'e2',priorCandidateId:'e9',status:'changed'}],adjustments:[] as string[]};
 const preparation={reason:'PROPOSED',context,ranking:[{source:prior,distance:0.01,hasCitedJudgment:true,alreadyAttached:false}]};
 const modelInput={observation:{id:'o4',image:'current'},memoryObservations:[{observationId:'o3',image:'memory_0',imageSha256:'recent'}],correspondenceContext:context,correspondenceObservations:[{observationId:'o2',image:'correspondence_0',imageSha256:'prior'}]};
 const assets={current:{file:'current.png',sha256:'current'},memory_0:{file:'recent.png',sha256:'recent'},correspondence_0:{file:'prior.png',sha256:'prior'}};
 const annotations=[{candidateId:'e1',before:'before one',after:'after one'}];
 const saved={number:4,correspondence:{preparation,record,annotations,archive:[{source:prior,file:'prior.png',clickCandidateIds:['e8','e9','e10']}]},deliberation:{modelInput:structuredClone(modelInput),assetFiles:structuredClone(assets),questions:Object.fromEntries(Object.entries(rawChoices).map(([key,value])=>[key,{type:'choice',criteria:Object.fromEntries(Object.keys(value.probabilities).map(id=>[id,id]))}]))},modelInput:structuredClone(modelInput),assetFiles:structuredClone(assets),questions:{nextAction:{type:'choice',criteria:{e1:'after one',e2:'before two',e3:'before three'}}},selection:{modelChoice:'e1',raw:{e1:0.6,e2:0.3,e3:0.1},normalized:{e1:0.6,e2:0.3,e3:0.1},filtered:{e1:0.6,e2:0.3,e3:0.1},normalization:{rawTotal:1,filteredTotal:1},adjustments:[],mode:'argmax',seed:1,drawIndex:0,draw:null,selected:'e1'},action:{type:'click',elementId:'e1'},outcome:'UI_PERFORMED'};
 return saved;
}
function reportStep(saved:ReturnType<typeof fixture>){const run=runRecord();run.result.steps=[saved as unknown as BetaStep];return analyzeReasonRuns([run],'observation-correspondence');}
test('correspondence plan declares bundled differing inputs without changing twelve-slot budgets or sharing mutable state',()=>{
 const plan=reasonComparisonPlan('observation-correspondence',2);assert.deepEqual(plan.modes,{old:'experience-reason-conditional',reason:'experience-reason-correspondence'});assert.equal(plan.phase,'observation-correspondence-comparison');assert.equal(plan.ledgerPhase,'observation-correspondence');assert.deepEqual(plan.fullSchedule,reasonSchedule());assert.equal(plan.schedule.length,2);assert.equal(plan.fullSchedule.length,12);
 assert.deepEqual(plan.limits,{trials:2,maxRequests:48,phaseMaximumRequests:288,maxRequestsPerTrial:24,maxJudgmentsPerTrial:12,maxUIActionsPerTrial:15,maxLooksPerTrial:3,maxRunMs:180000,phaseMs:1200000,parallel:1});
 assert.equal(plan.inputComponents.old.maxUniqueImages,4);assert.equal(plan.inputComponents.reason.maxUniqueImages,4);assert.equal(plan.inputComponents.reason.archiveCapacity,8);assert.equal(plan.inputComponents.reason.retrievedImagesMaximum,1);assert.equal(plan.inputComponents.reason.maxCurrentCandidates,8);assert.equal(plan.inputComponents.reason.maxPastCandidates,12);assert.equal(plan.inputComponents.shared.additionalAPIStages,0);assert.equal(plan.inputComponents.reason.annotations,'unchanged-links-only');assert.match(String(plan.inputComponents.reason.declaredDifference),/image.*question.*annotation/i);
 const expected=structuredClone(plan);(plan.modes as unknown as Record<string,string>).old='POISON';plan.inputComponents.reason.archiveCapacity=999;plan.schedule[0].id='POISON';assert.deepEqual(reasonComparisonPlan('observation-correspondence',2),expected);
});
test('correspondence pairs exclude only id and correspondence config and retain all existing policy and reason equality',()=>{
 const a=runRecord('old'),b=runRecord('reason');assert.equal(analyzeReasonRuns([a,b],'observation-correspondence').pairs[0].consistent,true);
 for(const change of [(r:typeof b)=>{r.result.config.deferral!.selectionScope='global';},(r:typeof b)=>{r.result.config.deferralReason!.reviewMode='separate';},(r:typeof b)=>{r.result.config.experience!.capacity=7;},(r:typeof b)=>{r.result.config.selection.seed=99;},(r:typeof b)=>{r.result.input.charter.goal='different';}]){const changed=structuredClone(b);change(changed);assert.equal(analyzeReasonRuns([a,changed],'observation-correspondence').pairs[0].consistent,false);}
 assert.equal(analyzeReasonRuns([a,b],'deferral-scope').pairs[0].consistent,false);
});
test('correspondence snapshot preserves eighty-two predecessor ledgers and reports absent artifacts honestly',async()=>{
 const root=await mkdtemp(join(tmpdir(),'correspondence-prior-'));
 try{assert.deepEqual(await snapshotReasonPriorLedgers('observation-correspondence',root),[]);const live=join(root,'reports/notification-switch-2026-10-29/live');await mkdir(live,{recursive:true});const priorLedgers=[],records=[];
  for(let i=0;i<70;i++){const path='prior-'+i+'.json';await writeFile(join(root,path),'prior '+i);priorLedgers.push({path,sha256:'stale'});}for(let i=0;i<12;i++){const id='trial-'+i;records.push({id});await writeFile(join(live,id+'-budget.json'),'trial '+i);}await writeFile(join(live,'manifest.json'),JSON.stringify({priorLedgers,records}));
  const saved=await snapshotReasonPriorLedgers('observation-correspondence',root);assert.equal(saved.length,82);assert.deepEqual(await snapshotReasonPriorLedgers('observation-correspondence',root),saved);assert.deepEqual(await snapshotReasonPriorLedgers('deferral-scope',root),[]);await rm(join(root,'prior-0.json'));assert.equal((await snapshotReasonPriorLedgers('observation-correspondence',root)).length,81);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('correspondence summary separates proposed source actual attachments raw choices admitted links annotations and actual selection',()=>{
 const report=reportStep(fixture()),view=report.runs[0];assert.equal(view.correspondenceProposals,1);assert.equal(view.matchedAssessmentSources,1);assert.equal(view.matchedActionSources,1);assert.equal(view.newlyAttachedAssessmentImages,1);assert.equal(view.newlyAttachedActionImages,1);assert.equal(view.maxDeliveredUniqueImages,3);assert.equal(view.correspondenceQuestions,3);assert.equal(view.unchangedLinks,1);assert.equal(view.changedLinks,1);assert.equal(view.noneChoices,1);assert.equal(view.rejectedCorrespondenceChoices,0);assert.equal(view.correspondenceAnnotations,1);assert.equal(view.annotationCriteriaMatches,1);assert.equal(view.selectedAnnotatedSteps,1);assert.equal(report.cells[0].unchangedLinks,1);assert.ok(view.correspondenceTrace);
 const trace=view.correspondenceTrace[0];assert.equal(trace.actualSelected,'e1');assert.equal(trace.selectedLinkStatus,'unchanged');assert.equal(trace.selectedAnnotated,true);assert.equal(trace.action?.type,'click');assert.deepEqual(trace.record?.rawChoices,fixture().correspondence.record.rawChoices);assert.equal(report.kind,'offline-observation-correspondence-descriptive-comparison');assert.ok(report.limitations.some(value=>value.includes('hypotheses')&&value.includes('semantic')));
 const legacy=runRecord();legacy.result.steps=[fixture() as unknown as BetaStep];assert.equal((analyzeReasonRuns([legacy]).runs[0] as unknown as Record<string,unknown>).correspondenceProposals,undefined);
});
test('already attached prior pixels are referenced without being counted as newly attached unique images',()=>{
 const saved=fixture();for(const input of [saved.deliberation.modelInput,saved.modelInput])input.memoryObservations.push({observationId:'o2',image:'correspondence_0',imageSha256:'prior'});
 const view=reportStep(saved).runs[0];assert.equal(view.matchedAssessmentSources,1);assert.equal(view.newlyAttachedAssessmentImages,0);assert.equal(view.newlyAttachedActionImages,0);assert.equal(view.maxDeliveredUniqueImages,3);
});
test('reference hash mismatches and annotation criteria mismatches are not reported as matched evidence',()=>{
 const saved=fixture();saved.deliberation.assetFiles.correspondence_0.sha256='wrong';saved.questions.nextAction.criteria.e1='different annotation';const view=reportStep(saved).runs[0];assert.equal(view.matchedAssessmentSources,0);assert.equal(view.newlyAttachedAssessmentImages,0);assert.equal(view.annotationCriteriaMatches,0);assert.equal(view.selectedAnnotatedSteps,0);assert.equal(view.matchedActionSources,1);assert.ok(view.correspondenceTrace);assert.equal(view.correspondenceTrace[0].assessment.preparationContextMatches,true);
});
test('raw noninjective proposals rejected by admission remain separate from admitted unchanged and changed links',()=>{
 const saved=fixture();saved.correspondence.record.rawChoices.correspondence_e2={choice:'unchanged_e8',probabilities:{unchanged_e8:1}} as unknown as typeof saved.correspondence.record.rawChoices.correspondence_e2;saved.correspondence.record.links=[];saved.correspondence.record.adjustments=['NON_INJECTIVE'];saved.correspondence.annotations=[];
 const view=reportStep(saved).runs[0];assert.equal(view.unchangedLinks,0);assert.equal(view.changedLinks,0);assert.equal(view.noneChoices,1);assert.equal(view.rejectedCorrespondenceChoices,2);assert.equal(view.correspondenceAdjustmentCount,1);assert.equal(view.correspondenceAnnotations,0);assert.ok(view.correspondenceTrace);assert.equal(view.correspondenceTrace[0].selectedLinkStatus,'none');
});
test('no-history preparation does not imply successful matching or a zero-error semantic result',()=>{
 const run=runRecord();run.result.steps=[{number:1,correspondence:{preparation:{reason:'NO_HISTORY',ranking:[]},archive:[]}} as unknown as BetaStep];const view=analyzeReasonRuns([run],'observation-correspondence').runs[0];assert.equal(view.correspondenceProposals,0);assert.equal(view.matchedAssessmentSources,0);assert.equal(view.correspondenceQuestions,0);assert.equal(view.unchangedLinks,0);assert.equal(view.selectedAnnotatedSteps,0);
});

test('changed links cannot become counted unchanged annotations just because the final criteria text matches',()=>{
 const saved=fixture();saved.correspondence.record.links[0].status='changed';const view=reportStep(saved).runs[0];assert.equal(view.annotationCriteriaMatches,1);assert.equal(view.annotationsWithoutUnchangedLink,1);assert.equal(view.selectedAnnotatedSteps,0);assert.ok(view.correspondenceTrace);assert.equal(view.correspondenceTrace[0].selectedLinkStatus,'changed');
});
test('infrastructure faults preserve correspondence audit traces but stay outside valid-run outcome and behavior totals',()=>{
 const run=runRecord();run.result.steps=[fixture() as unknown as BetaStep];run.result.termination='API_ERROR';const report=analyzeReasonRuns([run],'observation-correspondence');assert.equal(report.runs[0].correspondenceProposals,1);assert.equal(report.cells[0].valid,0);assert.equal(report.cells[0].faults,1);assert.equal(report.cells[0].correspondenceProposals,0);assert.equal(report.cells[0].unchangedLinks,0);assert.equal(report.cells[0].maxDeliveredUniqueImages,null);
});
