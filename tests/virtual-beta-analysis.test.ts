import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeRun} from '../runner/virtual-beta-analysis.js';
import type {BetaResult,BetaStep} from '../runner/virtual-beta-core.js';

function step(number:number,overrides:Partial<BetaStep>={}):BetaStep {
 return {number,audit:{screen:{} as any,url:'http://local/good/',rawScreenshot:`audit-${number}.png`,sourceSha256:'same'},vision:{sourceSha256:'same',imageSha256:`input-${number}`,fixation:{x:50,y:50},clearRect:{x:0,y:0,width:100,height:100},transform:{offsetX:0,offsetY:0,scaleX:1,scaleY:1},width:100,height:100,sourceWidth:200,sourceHeight:200,mode:'foveated',visibleTargets:[]},questions:{nextAction:{type:'choice',instructions:'choose',criteria:{look_3:'look',done:'done'}}},assetFiles:{current:{file:`input-${number}.png`,sha256:`input-${number}`}},...overrides};
}
function run(steps:BetaStep[],overrides:Partial<BetaResult>={}):BetaResult {
 return {schemaVersion:1,runId:'fixture',condition:'combined',config:{selection:{mode:'sample'},state:{enabled:true}} as any,input:{} as any,initialFingerprint:'fingerprint',objectiveSuccess:false,perceivedDone:false,termination:'API_LIMIT',looks:1,uiActions:0,decisions:steps.length,apiCalls:2,apiMs:500,uiMs:0,modeledUserMs:null,elapsedMs:600,terminalObservation:{status:'RECORDED'},objectiveAssessment:{status:'OK',value:false},validForComparison:true,steps,...overrides};
}
const looked=()=>step(1,{action:{type:'look',point:{x:150,y:150}},outcome:'FIXATION_MOVED'});
const clicked=()=>step(2,{questions:{nextAction:{type:'choice',instructions:'choose',criteria:{e5:'[e5]',done:'done'}}},action:{type:'click',elementId:'e5'},outcome:'UI_PERFORMED',selection:{modelChoice:'e5',selected:'e5',mode:'sample'} as any});

test('same raw screen look exposes an offered id followed by a matching click without cognition claims',()=>{
 const next=clicked(); next.vision!.fixation={x:150,y:150};
 const source=run([looked(),next]); const snapshot=structuredClone(source); const a=analyzeRun(source);
 assert.deepEqual(a.lookEffectPairs[0].newlyOfferedClickIds,['e5']); assert.equal(a.lookEffectPairs[0].rawScreenRelation,'same');
 assert.equal(a.lookEffectPairs[0].followingSelectedNewClick,true); assert.match(a.lookEffectPairs[0].interpretation,/available under policy, next selection consistent with using it/);
 assert.doesNotMatch(JSON.stringify(a),/recognized|understood|comprehended/); assert.deepEqual(source,snapshot);
});
test('changed and absent sources prevent attribution to a look',()=>{
 const next=clicked(); next.audit!.sourceSha256='different'; next.vision!.sourceSha256='different';
 assert.equal(analyzeRun(run([looked(),next])).lookEffectPairs[0].rawScreenRelation,'changed');
 delete next.audit; assert.equal(analyzeRun(run([looked(),next])).lookEffectPairs[0].rawScreenRelation,'unknown');
 const last=analyzeRun(run([looked()])).lookEffectPairs[0]; assert.equal(last.afterDecision,null); assert.equal(last.followingSelectedNewClick,null);
});
test('all resource limits are censored independently of objective outcome',()=>{
 for(const termination of ['API_LIMIT','TIME_LIMIT','UI_ACTION_LIMIT','LOOK_LIMIT','DECISION_LIMIT'] as const){
  const a=analyzeRun(run([],{termination,objectiveSuccess:true,objectiveAssessment:{status:'OK',value:true}}));
  assert.equal(a.classification.behavior,'budget-censored'); assert.equal(a.classification.artifactValidity,'artifact-valid'); assert.equal(a.outcomes.objectiveSuccess,true);
 }
 assert.equal(analyzeRun(run([],{termination:'ABANDONED'})).classification.behavior,'voluntary-abandonment');
 assert.equal(analyzeRun(run([],{termination:'STUCK'})).classification.behavior,'stuck');
 assert.equal(analyzeRun(run([],{termination:'SUBJECTIVE_DONE',perceivedDone:true})).classification.behavior,'perceived-done');
});
test('unknown legacy metadata is never promoted to audit validity; failed oracle and capture are invalid',()=>{
 const legacy=run([]); delete (legacy as any).terminalObservation; delete (legacy as any).objectiveAssessment; delete (legacy as any).validForComparison;
 assert.equal(analyzeRun(legacy).classification.artifactValidity,'unknown');
 assert.equal(analyzeRun(run([],{objectiveAssessment:{status:'ERROR',value:null,code:'ORACLE_ERROR'}})).classification.artifactValidity,'infra-invalid');
 assert.equal(analyzeRun(run([],{terminalObservation:{status:'ERROR',code:'OBSERVATION_ERROR'}})).classification.artifactValidity,'infra-invalid');
 assert.equal(analyzeRun(run([],{termination:'INVALID_DISTRIBUTION'})).classification.artifactValidity,'infra-invalid');
});
test('proposal, probability sampling and actual execution remain distinct in timeline',()=>{
 const s=step(1,{selection:{modelChoice:'back',selected:'look_3',mode:'sample',draw:.6,drawIndex:2,seed:4,raw:{back:.7,look_3:.3},normalized:{back:.7,look_3:.3},filtered:{},normalization:{rawTotal:1,filteredTotal:1},adjustments:[]},action:{type:'look',point:{x:150,y:150}},outcome:'FIXATION_MOVED',userState:{revision:3,memory:[{observationId:'o1',imageSha256:'prior',visibleText:[]}]} as any,counts:{looks:2,uiActions:1},timing:{apiMs:100,uiMs:0,modeledUserMs:null},reasonEvidence:{category:'clarity',observationId:'o1',kind:'model-self-report',proposedChoice:'back',selectedChoice:'look_3'}});
 const a=analyzeRun(run([s])); assert.equal(a.timeline[0].proposalDiffersFromSelection,true); assert.equal(a.timeline[0].modelProposal,'back'); assert.equal(a.timeline[0].selected,'look_3');
 assert.equal(a.timeline[0].memory?.revision,3); assert.equal(a.timeline[0].memory?.entries.length,1); assert.equal(a.timings.apiMs,500); assert.equal(a.timings.humanTaskMs,null);
});
test('ROI point entry differs from full clear containment, uses viewport geometry and half-open edges',()=>{
 const roi={id:'notification-entry',definition:'element-client-rect' as const,rect:{x:40,y:40,width:20,height:20}};
 const a=step(1); a.audit!.regionsOfInterest=[roi]; a.vision!.clearRect={x:45,y:45,width:10,height:10};
 const b=step(2); b.audit!.regionsOfInterest=[roi]; b.vision!.fixation={x:60,y:50};
 const result=analyzeRun(run([a,b])); const metric=result.roiMetrics.find(r=>r.id===roi.id)!;
 assert.equal(metric.firstFixationInsideDecision,1); assert.equal(metric.firstFullySharpDecision,2);
 assert.equal(result.timeline[0].regionsOfInterest[0].fullySharp,false); assert.equal(result.timeline[1].regionsOfInterest[0].fixationInside,false);
 assert.equal(analyzeRun(run([step(1)])).roiMetrics[0].status,'not-recorded');
});

test('mismatched observed fixation and inconsistent source metadata do not support look interpretation',()=>{
 const a=analyzeRun(run([looked(),clicked()]));
 assert.equal(a.lookEffectPairs[0].fixationMatchesRequested,false);
 assert.doesNotMatch(a.lookEffectPairs[0].interpretation,/next selection consistent with using it/);
 const broken=step(1); broken.vision!.sourceSha256='wrong';
 assert.equal(analyzeRun(run([broken])).classification.artifactValidity,'infra-invalid');
 const inconsistent=run([],{objectiveAssessment:{status:'OK',value:true}});
 assert.equal(analyzeRun(inconsistent).classification.artifactValidity,'infra-invalid');
});
