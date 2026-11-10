import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeDeliberationRun} from '../runner/deliberation-analysis.js';
import type {BetaResult,BetaStep} from '../runner/virtual-beta-core.js';
import type {DeliberationAssessment} from '../jev/virtual-beta/deliberation-contracts.js';

const source={observationId:'o1',imageSha256:'image-1'};
function assessment():DeliberationAssessment{return {schemaVersion:1,kind:'model-assessment-not-fact',...source,knowledge:'insufficient',goal:'unsatisfied',goalEvidence:{...source},effects:{e1:{prediction:'conflicts',evidence:{...source}},e2:{prediction:'unknown'}},adjustments:[]};}
function step():BetaStep{return {number:1,observationId:'o1',deliberation:{modelInput:{observation:{id:'o1',image:'current'},memoryObservations:[]},questions:{},assetFiles:{current:{file:'input-1.png',sha256:'image-1'}},inputSha256:'assessment-wire',apiCalls:1,assessment:assessment(),timing:{apiMs:12}},questions:{nextAction:{type:'choice',instructions:'Choose',criteria:{e1:'A',e2:'B',look_0:'Look',done:'Done'}}},selection:{selected:'e1',modelChoice:'e1',raw:{e1:1},normalized:{e1:1},filtered:{e1:1},normalization:{rawTotal:1,filteredTotal:1},adjustments:[],mode:'argmax',seed:1,drawIndex:0,draw:null},action:{type:'click',elementId:'e1'},outcome:'UI_PERFORMED'};}
function run(steps:BetaStep[]=[step()]):BetaResult{return {schemaVersion:1,runId:'report-test',condition:'two-stage',config:{schemaVersion:1,id:'two-stage',deliberation:{enabled:true,memoryCapacity:3},vision:{mode:'crop',clearWidth:640,clearHeight:480,blurRadius:0},state:{enabled:true,memoryCapacity:3},selection:{mode:'argmax',seed:1},behavior:'goal',maxUIActions:4,maxLooks:3,maxDecisions:4,maxAPICalls:8,maxRunMs:90000,modeledActionMs:null},input:{} as BetaResult['input'],initialFingerprint:null,objectiveSuccess:false,perceivedDone:false,termination:'DECISION_LIMIT',looks:0,uiActions:1,decisions:steps.length,apiCalls:steps.length*2,apiMs:24,uiMs:0,modeledUserMs:null,elapsedMs:30,terminalObservation:{status:'RECORDED'},objectiveAssessment:{status:'OK',value:false},validForComparison:true,steps};}

test('assessment and action calls remain separate and report ordered model categories before actual actions',()=>{
 const r=run(),before=structuredClone(r),a=analyzeDeliberationRun(r);
 assert.equal(a.accounting.totalAPICalls,2);assert.equal(a.accounting.assessmentAPICalls,1);assert.equal(a.accounting.actionAPICalls,1);
 assert.deepEqual(a.timeline[0].modelAssessment,{knowledge:'insufficient',goal:'unsatisfied',kind:'model-assessment-not-fact'});
 assert.deepEqual(a.timeline[0].action,{type:'click',elementId:'e1'});
 assert.equal(a.counts.uncertaintyThen.click,1);assert.equal(a.counts.selectedPredictedConflict,1);assert.equal(a.classification.censored,true);
 assert.deepEqual(r,before);
});

test('look and done following uncertainty are distinct while selection/action mismatch cannot count as chosen conflict',()=>{
 const look=step();look.action={type:'look',point:{x:100,y:100}};look.selection!.selected='look_0';
 const done=step();done.number=2;done.action={type:'done'};done.selection!.selected='done';done.deliberation!.assessment!.knowledge='conflicting';
 const mismatch=step();mismatch.number=3;mismatch.action={type:'click',elementId:'e2'};
 const a=analyzeDeliberationRun(run([look,done,mismatch]));
 assert.deepEqual(a.counts.uncertaintyThen,{look:1,click:1,done:1,other:0,noAction:0});
 assert.equal(a.counts.selectedPredictedConflict,0);assert.equal(a.timeline[2].selectedActionMatches,false);
 assert.equal(a.timeline[2].chosenPrediction,null);
});

test('assessment-only budget exhaustion records its call without inventing an action call or action',()=>{
 const s=step();delete s.action;delete s.selection;const r=run([s]);r.apiCalls=1;r.termination='API_LIMIT';
 const a=analyzeDeliberationRun(r);assert.equal(a.accounting.actionAPICalls,0);assert.equal(a.timeline[0].action,null);
 assert.equal(a.counts.uncertaintyThen.noAction,1);assert.equal(a.classification.censored,true);
});

test('old runs explicitly report assessment disabled and missing enabled records keep accounting unknown',()=>{
 const old=run();delete old.config.deliberation;delete old.steps[0].deliberation;old.apiCalls=1;
 const legacy=analyzeDeliberationRun(old);assert.equal(legacy.mode,'legacy-single-stage');assert.equal(legacy.accounting.assessmentAPICalls,0);assert.equal(legacy.accounting.actionAPICalls,1);assert.equal(legacy.timeline[0].assessmentStatus,'not-enabled');
 const missing=run();delete missing.steps[0].deliberation;const a=analyzeDeliberationRun(missing);
 assert.equal(a.timeline[0].assessmentStatus,'missing');assert.equal(a.accounting.assessmentAPICalls,null);assert.equal(a.accounting.actionAPICalls,null);
});

test('failed and malformed assessments stay inspectable and do not become assessed knowledge',()=>{
 const failed=step();delete failed.deliberation!.assessment;failed.deliberation!.error={code:'INVALID_DISTRIBUTION'};delete failed.action;delete failed.selection;
 const malformed=step();(malformed.deliberation!.assessment as unknown as Record<string,unknown>).knowledge='certain';
 const r=run([failed,malformed]);r.termination='INVALID_DISTRIBUTION';r.validForComparison=false;
 const a=analyzeDeliberationRun(r);assert.equal(a.timeline[0].assessmentStatus,'error');assert.deepEqual(a.timeline[0].assessmentError,{code:'INVALID_DISTRIBUTION'});
 assert.equal(a.timeline[1].assessmentStatus,'invalid');assert.equal(a.timeline[1].modelAssessment,null);assert.equal(a.counts.validAssessments,0);
 assert.equal(a.classification.artifactValidity,'infra-invalid');
});

test('only independent oracle evidence can contradict perceived done and assessment claims',()=>{
 const s=step();s.action={type:'done'};s.selection!.selected='done';s.deliberation!.assessment!.goal='satisfied';
 const r=run([s]);r.perceivedDone=true;r.termination='SUBJECTIVE_DONE';
 const a=analyzeDeliberationRun(r);assert.equal(a.outcomes.subjectiveDoneContradictsObjective,true);assert.equal(a.outcomes.terminalAssessmentContradictsObjective,true);
 r.objectiveAssessment={status:'ERROR',value:null,code:'ORACLE_ERROR'};
 const unknown=analyzeDeliberationRun(r);assert.equal(unknown.outcomes.subjectiveDoneContradictsObjective,null);assert.equal(unknown.outcomes.terminalAssessmentContradictsObjective,null);
 r.objectiveAssessment={status:'OK',value:true};r.objectiveSuccess=true;
 assert.equal(analyzeDeliberationRun(r).outcomes.subjectiveDoneContradictsObjective,false);
});

test('citations are matched by admitted observation and attached image without treating an audit image as observed',()=>{
 const s=step();s.deliberation!.assessment!.effects.e2={prediction:'advances',evidence:{observationId:'unobserved-audit',imageSha256:'audit-image'}};
 const a=analyzeDeliberationRun(run([s])),citations=a.timeline[0].citations;
 assert.equal(citations.find(c=>c.field==='goal')!.admitted,true);assert.equal(citations.find(c=>c.field==='effects.e1')!.admitted,true);
 assert.equal(citations.find(c=>c.field==='effects.e2')!.admitted,false);
 assert.deepEqual(a.timeline[0].observedImages,[{observationId:'o1',image:'current',imageSha256:'image-1',file:'input-1.png'}]);
 delete s.deliberation!.modelInput.observation;
 assert.equal(analyzeDeliberationRun(run([s])).timeline[0].citations.find(c=>c.field==='goal')!.admitted,null);
});

test('invalid call counts and impossible residual action calls do not become numerical action totals',()=>{
 const invalid=run();invalid.steps[0].deliberation!.apiCalls=2;
 const a=analyzeDeliberationRun(invalid);assert.equal(a.accounting.assessmentAPICalls,null);assert.equal(a.accounting.actionAPICalls,null);
 const exceeded=run();exceeded.apiCalls=0;assert.equal(analyzeDeliberationRun(exceeded).accounting.consistent,false);
 const tooManyActions=run();tooManyActions.apiCalls=8;
 const b=analyzeDeliberationRun(tooManyActions);assert.equal(b.accounting.consistent,false);assert.equal(b.accounting.actionAPICalls,null);
});

test('conflict attribution requires the clicked ID to have been offered as a current action candidate',()=>{
 const s=step();delete s.questions!.nextAction.criteria.e1;
 const a=analyzeDeliberationRun(run([s]));assert.equal(a.timeline[0].chosenPrediction,null);assert.equal(a.counts.selectedPredictedConflict,0);
 delete s.questions;
 assert.equal(analyzeDeliberationRun(run([s])).timeline[0].chosenPrediction,null);
});

test('earlier assessment claims are not compared to a later terminal oracle',()=>{
 const first=step();first.deliberation!.assessment!.goal='satisfied';const last=step();last.number=2;delete last.deliberation;
 const r=run([first,last]);r.perceivedDone=false;
 const a=analyzeDeliberationRun(r);assert.equal(a.outcomes.terminalAssessmentContradictsObjective,null);assert.equal(a.outcomes.subjectiveDoneContradictsObjective,false);
});
