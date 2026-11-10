import test from 'node:test';
import assert from 'node:assert/strict';
import type {RecoveryRunRecord} from '../runner/recovery-contracts.js';
import type {BetaStep} from '../runner/virtual-beta-core.js';
const api=await import('../runner/motion-comparison-analysis.js').catch(()=>({} as any));
function analyze(records:(RecoveryRunRecord&{actor:string})[]){assert.equal(typeof api.analyzeMotionRuns,'function','motion analyzer export is required');return api.analyzeMotionRuns(records);}
function step(number:number,image:string,route:string,action='click',text='Confirm'):BetaStep{
 return {number,observationId:'o'+number,assetFiles:{current:{file:'current.png',sha256:image}},modelInput:{observation:{id:'o'+number,image:'current'},userState:{memory:[]}},audit:{recovery:{schemaVersion:1,route:route as any,eligible:false,verificationAttempts:0,recordChecks:0,savedValue:'old',complete:false},url:'http://localhost/'+route,screen:{title:route,text:[],elements:[{id:'e1',type:'button',text}],canScrollUp:false,canScrollDown:false},rawScreenshot:'audit.png',sourceSha256:image},action:action==='click'?{type:'click',elementId:'e1'}:action==='look'?{type:'look',point:{x:0,y:0}}:{type:action} as any,outcome:['click','back','scroll'].includes(action)?'UI_PERFORMED':'WAITED'};
}
function record(steps:BetaStep[],actor='on',verified=true):RecoveryRunRecord&{actor:string}{
 return {actor,id:actor+'-slot',runId:actor+'-run',status:'RESULT',fixture:{version:1,task:'library',condition:'changed'},replicate:1,dir:'unused',ledger:null,resultPath:'unused',requests:steps.length,initialImageSha256:null,result:{runId:actor+'-run',config:{deferral:{enabled:true,capacity:8,weight:0.01,minAlternativeProbability:0.01,applyWeights:actor!=='off'}},termination:'DECISION_LIMIT',objectiveSuccess:false,perceivedDone:false,steps,recovery:{terminalSnapshot:{route:'primary'}}} as any,...(verified?{frameChecks:steps.map(s=>({step:s.number,stage:'action' as const,observationId:s.observationId!,imageSha256:s.assetFiles?.current?.sha256??null,validCurrentFrame:true,successfulResponse:true,scope:'full-viewport-current' as const}))}:{})};
}
function selection(s:BetaStep,options:{baseline?:string;selected?:string;model?:string;weight?:number;apply?:boolean}={}){
 const {baseline='e1',selected='e2',model='e1',weight=0.01,apply=true}=options,weights={e1:weight,e2:1};
 s.selection={modelChoice:model,raw:{e1:0.96,e2:0.04},normalized:{e1:0.96,e2:0.04},filtered:{e1:0.2,e2:0.8},normalization:{rawTotal:1,filteredTotal:1},adjustments:[],mode:'argmax',seed:1,drawIndex:0,draw:null,selected,policy:{kind:'temporary-deferral',weights,before:{e1:0.96,e2:0.04},weightedTotal:1,scope:{kind:'ui-conditional-v1',baselineSelected:baseline,baselineClass:'ui',uiCandidates:['e1','e2'],uiMass:1,weightedUIMass:1,marginal:{e1:0.2,e2:0.8},conditionalDraw:null}}};
 s.deferral={state:{schemaVersion:1,entries:[]},decision:{kind:'temporary-deferral',weights:{e1:apply?weight:0.01,e2:1},plausibleCandidates:[],deferredCandidates:['e1'],appliedCandidates:['e1'],reason:'DEFER_WITH_ALTERNATIVES'},application:{kind:'deferral-weight-application',mode:apply?'apply':'observe-only',proposedWeights:{e1:apply?weight:0.01,e2:1},appliedWeights:weights}};
}

test('verified UI ABAB windows overlap and retain step evidence without outcome ranking',()=>{
 const steps=[step(1,'A','primary'),step(2,'B','home','back'),step(3,'A','primary'),step(4,'B','home','back'),step(5,'A','primary','wait')];selection(steps[0]);
 const report=analyze([record(steps)]),run=report.runs[0];
 assert.equal(run.patterns.length,2);assert.equal(run.patterns[0].kind,'A-B-A-B');assert.equal(run.patterns[0].evidence,'verified-delivered-inputs');assert.deepEqual(run.patterns[0].steps.map((s:any)=>s.step),[1,2,3,4]);
 assert.equal(run.patterns[0].steps[0].changedByDeferral,true);assert.equal(run.context.termination,'DECISION_LIMIT');assert.equal(run.context.goalOutcome,false);assert.equal(report.overall.verifiedABAB,2);assert.equal(report.actors.on.verifiedABAB,2);
});

test('wait/look, same-screen AAAA, route-equal and missing-input windows are not UI ABAB',()=>{
 for(const action of ['wait','look']){const steps=[step(1,'A','primary'),step(2,'B','home',action),step(3,'A','primary'),step(4,'B','home')];assert.equal(analyze([record(steps)]).runs[0].patterns.length,0);}
 assert.equal(analyze([record([1,2,3,4].map(n=>step(n,'A','primary')))]).overall.verifiedABAB,0);
 const sameRoute=[step(1,'A','primary'),step(2,'B','primary'),step(3,'A','primary'),step(4,'B','primary')];assert.equal(analyze([record(sameRoute)]).runs[0].patterns.length,0);
 const missing=[step(1,'A','primary'),step(2,'B','home'),step(3,'A','primary'),step(4,'B','home')];delete missing[2].assetFiles;assert.equal(analyze([record(missing)]).runs[0].patterns.length,0);
});

test('recorded assets without frame checks remain delivery-unverified rather than delivered facts',()=>{
 const steps=[step(1,'A','primary'),step(2,'B','home'),step(3,'A','primary'),step(4,'B','home')],report=analyze([record(steps,'mock',false)]);
 assert.equal(report.overall.verifiedABAB,0);assert.equal(report.overall.recordedABAB,1);assert.equal(report.runs[0].patterns[0].evidence,'recorded-inputs-delivery-unverified');assert.equal(report.runs[0].steps[0].frame.delivery,'unverified');
 const failed=record(steps);failed.frameChecks![1].successfulResponse=false;assert.equal(analyze([failed]).overall.verifiedABAB,0);
});

test('model choice, missing sampler baseline and uniform weights never invent policy-caused selection',()=>{
 const a=step(1,'A','primary');selection(a,{baseline:'e1',selected:'e1',model:'e2',weight:1});
 const uniform=analyze([record([a])]).runs[0].steps[0];assert.equal(uniform.modelChoice,'e2');assert.equal(uniform.baselineSelected,'e1');assert.equal(uniform.selected,'e1');assert.equal(uniform.changedByDeferral,false);
 delete a.selection!.policy!.scope;const unmeasured=analyze([record([a])]).runs[0].steps[0];assert.equal(unmeasured.baselineSelected,null);assert.equal(unmeasured.changedByDeferral,null);
 delete a.deferral!.application;const legacy=record([a]);delete legacy.result!.config.deferral!.applyWeights;
 const report=analyze([legacy]);assert.equal(report.runs[0].steps[0].applicationMeasured,false);assert.equal(report.runs[0].steps[0].appliedWeights,null);assert.equal(report.integrity.ok,true);
});

test('OFF non-unit weights, changed sampler baseline, missing application and mode mismatches are integrity errors',()=>{
 const scenarios:[string,(s:BetaStep)=>void][]=[['OFF_NONUNIT_APPLIED_WEIGHTS',s=>selection(s,{apply:false})],['OFF_BASELINE_SELECTION_CHANGED',s=>selection(s,{apply:false,weight:1})],['MISSING_DEFERRAL_APPLICATION',s=>{selection(s,{apply:false,weight:1,selected:'e1'});delete s.deferral!.application;}],['APPLICATION_MODE_MISMATCH',s=>selection(s,{weight:1,selected:'e1'})]];
 for(const [code,change] of scenarios){const s=step(1,'A','primary');change(s);const report=analyze([record([s],'off')]);assert.equal(report.integrity.ok,false);assert.ok(report.integrity.errors.some((e:any)=>e.code===code),code);}
 const s=step(1,'A','primary');selection(s);s.deferral!.application!.appliedWeights={e1:1,e2:1};assert.ok(analyze([record([s])]).integrity.errors.some((e:any)=>e.code==='APPLIED_WEIGHT_BINDING_MISMATCH'));
});

test('mandatory safety adjustments remain visible and are not attributed to deferral',()=>{
 const s=step(1,'A','primary');selection(s,{baseline:'e2',selected:'e2',model:'e1',weight:1,apply:false});s.selection!.adjustments=[{candidate:'e1',reason:'SAFETY_EXCLUDED'}];
 const report=analyze([record([s],'off')]),fact=report.runs[0].steps[0];assert.equal(fact.changedByDeferral,false);assert.deepEqual(fact.mandatoryAdjustments,[{candidate:'e1',reason:'SAFETY_EXCLUDED'}]);assert.equal(report.overall.deferralChanges,0);assert.equal(report.overall.mandatoryAdjustmentSteps,1);assert.equal(report.integrity.ok,true);
});

test('same-frame control retries link prior performed click and distinguish intervening places from immediate repeats',()=>{
 const steps=[step(1,'A','primary'),step(2,'B','home','back'),step(3,'C','records','back'),step(4,'A','primary'),step(5,'A','primary')];
 steps[3].modelInput!.userState={memory:[{observationId:'o2',imageSha256:'B'}],experience:{transitions:[{intent:{source:{observationId:'o1',imageSha256:'A'}},result:{observationId:'o2',imageSha256:'B'}}]}};
 const report=analyze([record(steps)]),retries=report.runs[0].retries;
 assert.equal(retries.length,2);assert.equal(retries[0].priorStep,1);assert.deepEqual(retries[0].interveningDistinctFrames,['B','C']);assert.deepEqual(retries[0].interveningRouteVisits.map((x:any)=>x.route),['home','records']);assert.equal(retries[0].priorObservedResult.step,2);assert.equal(retries[0].immediateSameFrame,false);
 assert.equal(retries[1].priorStep,4);assert.equal(retries[1].interveningDistinctFrameCount,0);assert.equal(retries[1].immediateSameFrame,true);assert.equal(report.overall.immediateSameFrameRetries,1);
 assert.ok(retries[0].current.memoryChannels.some((c:any)=>c.name==='userState.experience'&&c.sources.some((s:any)=>s.observationId==='o1')));
});

test('candidate IDs and text reused on a different image or changed text do not identify the same control',()=>{
 assert.equal(analyze([record([step(1,'A','primary'),step(2,'B','home')])]).runs[0].retries.length,0);
 assert.equal(analyze([record([step(1,'A','primary'),step(2,'A','primary','click','Changed')])]).runs[0].retries.length,0);
 const failed=step(1,'A','primary');failed.outcome='ACTION_ERROR';assert.equal(analyze([record([failed,step(2,'A','primary')])]).runs[0].retries.length,0);
});

test('terminal audit is context only and never an invented next delivered frame',()=>{
 const steps=[step(1,'A','primary'),step(2,'B','home'),step(3,'A','primary')],r=record(steps);r.result!.recovery!.terminalSnapshot={route:'home'} as any;
 const report=analyze([r]);assert.equal(report.runs[0].steps.length,3);assert.equal(report.runs[0].patterns.length,0);assert.equal(report.runs[0].steps[2].nextObservedFrame,null);
 const retry=record([step(1,'A','primary'),step(2,'A','primary')]);assert.equal(analyze([retry]).runs[0].retries[0].priorObservedResult.step,2);
});

test('partial failures and missing results retain unobserved denominators without fabricated motion',()=>{
 const absent=record([],'failed');absent.status='FAILED';delete absent.result;absent.error={code:'OBSERVATION_ERROR'};
 const partial=record([{number:1,outcome:'API_ERROR'}]);const report=analyze([absent,partial]);
 assert.equal(report.overall.runs,2);assert.equal(report.overall.withResult,1);assert.equal(report.overall.unobservedFrames,1);assert.equal(report.runs[0].context.goalOutcome,null);assert.equal(report.runs[0].steps.length,0);assert.equal(report.runs[1].steps[0].frame.delivery,'unobserved');assert.equal(report.runs[1].retries.length,0);assert.equal(report.integrity.ok,true);
 assert.deepEqual(analyze([]).runs,[]);
});

test('analysis is deterministic and never mutates input evidence',()=>{
 const r=record([step(1,'A','primary'),step(2,'A','primary')]),before=structuredClone(r),first=analyze([r]);assert.deepEqual(analyze([r]),first);first.runs[0].steps[0].frame.imageSha256='changed';assert.deepEqual(r,before);
});
test('a gap or unobserved intervening frame never becomes an immediate same-frame retry',()=>{
 const gap=analyze([record([step(1,'A','primary'),step(3,'A','primary')])]).runs[0].retries[0];
 assert.equal(gap.interveningObservationComplete,false);assert.equal(gap.interveningDistinctFrameCount,null);assert.equal(gap.immediateSameFrame,false);assert.equal(gap.priorObservedResult,null);
 const missing=analyze([record([step(1,'A','primary'),{number:2,outcome:'API_ERROR'},step(3,'A','primary')])]).runs[0].retries[0];
 assert.equal(missing.interveningObservationComplete,false);assert.equal(missing.interveningDistinctFrameCount,null);assert.equal(missing.immediateSameFrame,false);
});
test('selection difference counts keep missing attribution separate from observed zero changes',()=>{
 const legacy=step(1,'A','primary');selection(legacy,{baseline:'e1',selected:'e2',model:'e1'});delete legacy.deferral!.application;
 const uniform=step(2,'B','home');selection(uniform,{baseline:'e1',selected:'e1',model:'e2',weight:1});
 const r=record([legacy,uniform,{number:3,outcome:'API_ERROR'}],'legacy');delete r.result!.config.deferral!.applyWeights;
 const report=analyze([r]);assert.equal(report.overall.selectionRecords,2);assert.equal(report.overall.deferralChanges,0);assert.equal(report.overall.deferralAttributionUnmeasured,1);assert.equal(report.overall.modelChoiceDifferences,2);assert.equal(report.overall.baselineDifferences,1);assert.equal(report.actors.legacy.deferralAttributionUnmeasured,1);assert.equal(report.runs[0].counts.modelChoiceDifferences,2);
});