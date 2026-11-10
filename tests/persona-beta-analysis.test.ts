import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {humanJevProfile} from '../runner/human-jev-profiles.js';
import {recoveryDefinition} from '../app/recovery-fixture.js';
import {personaBetaActors,type PersonaBetaActor,type PersonaBetaRecord} from '../runner/persona-beta-contracts.js';
import type {RecoveryAuditSnapshot} from '../runner/recovery-contracts.js';
import type {BetaStep} from '../runner/virtual-beta-core.js';
const api=await import('../runner/persona-beta-analysis.js').catch(()=>({} as any));
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const state=(route:RecoveryAuditSnapshot['route']='primary'):RecoveryAuditSnapshot=>({schemaVersion:1,route,eligible:false,verificationAttempts:0,recordChecks:0,savedValue:'相談会：11月12日 10:00',complete:false});
function record(actor:PersonaBetaActor='baseline',replicate=1,text='Open',routes:RecoveryAuditSnapshot['route'][]=['primary','home']):PersonaBetaRecord{
 const fixture={version:1 as const,task:'workshop' as const,condition:'unchanged' as const},definition=recoveryDefinition(fixture),id=actor+'-'+replicate;
 const persona=actor==='baseline'?null:{schemaVersion:1 as const,id:actor,name:actor,itLiteracy:'ordinary',serviceExperience:'none',knowledge:['visible'],expectations:['clear'],behavioralTendencies:['check'],contextAndConstraints:[]};
 const steps:BetaStep[]=routes.map((route,i)=>({number:i+1,observationId:'o'+(i+1),assetFiles:{current:{file:'input.png',sha256:i===0?'common-image':hash([route,i])}},audit:{url:'http://localhost/'+route,recovery:{...state(route),savedValue:definition.originalValue},screen:{title:'Screen',text:[],elements:[{id:'e1',type:'button',text}],canScrollUp:false,canScrollDown:false},rawScreenshot:'audit.png',sourceSha256:'source'},action:i===routes.length-1?{type:'done'}:{type:'click',elementId:'e1'},outcome:i===routes.length-1?'SUBJECTIVE_DONE':'UI_PERFORMED',questions:{nextAction:{type:'choice',instructions:'choose',criteria:{e1:'Open',done:'Done'}}},selection:{modelChoice:'e1',raw:{e1:0.8,done:0.2},normalized:{e1:0.8,done:0.2},filtered:{e1:0.8,done:0.2},normalization:{rawTotal:1,filteredTotal:1},adjustments:[],mode:'argmax',seed:1,drawIndex:0,draw:null,selected:'e1'},reasonEvidence:{category:'clarity',kind:'model-self-report',observationId:'o'+(i+1),proposedChoice:'e1',selectedChoice:'e1'}}));
 const config=humanJevProfile('experience-persona-unweighted',300000,60000).config;
 for(const step of steps){
  const weights={e1:1,done:1};
  step.deferral={state:{schemaVersion:1,entries:[]},decision:{kind:'temporary-deferral',weights,plausibleCandidates:['e1'],deferredCandidates:[],appliedCandidates:[],reason:'NO_DEFERRED_CANDIDATE'},application:{kind:'deferral-weight-application',mode:'observe-only',proposedWeights:{...weights},appliedWeights:{...weights}}};
  step.selection!.policy={kind:'temporary-deferral',weights:{...weights},before:{e1:0.8,done:0.2},weightedTotal:1,scope:{kind:'ui-conditional-v1',baselineSelected:'e1',baselineClass:'ui',uiCandidates:['e1'],uiMass:0.8,weightedUIMass:0.8,marginal:{e1:0.8,done:0.2},conditionalDraw:null}};
 }
 return {actor,replicate,id,runId:id,sequence:replicate,persona,personaSha256:persona?hash(persona):null,status:'RESULT',fixture,dir:'unused',ledger:null,resultPath:'unused',requests:steps.length*2,initialImageSha256:'initial',personaDelivery:{native:persona?1:0,assessment:persona?steps.length:0,action:persona?steps.length:0,errors:[]},frameChecks:steps.map(s=>({step:s.number,stage:'action',observationId:s.observationId!,imageSha256:s.assetFiles!.current.sha256,validCurrentFrame:true,successfulResponse:true,scope:'full-viewport-current'})),result:{schemaVersion:1,runId:id,condition:config.id,code:{revision:'frozen',sourceHash:'source'},config,input:{charter:{schemaVersion:1,id:'task',targetWebsite:'local:demo',goal:definition.goal,initialState:{description:'Blocked',currentDate:'2026-11-05'},scope:[],prohibitedActions:{actionTypes:[],controlTexts:[],downloads:true},maxActions:15},...(persona?{persona}:{})},initialFingerprint:'fingerprint',objectiveSuccess:false,objectiveAssessment:{status:'OK',value:false},terminalObservation:{status:'RECORDED'},validForComparison:true,perceivedDone:true,termination:'SUBJECTIVE_DONE',looks:0,uiActions:steps.length-1,decisions:steps.length,apiCalls:steps.length*2,apiMs:1,uiMs:1,elapsedMs:2,modeledUserMs:null,recovery:{fixture,definitionHash:hash(definition),initialProductImage:{file:'initial.png',sha256:'initial'},terminalSnapshot:{...state(routes.at(-1)),savedValue:definition.originalValue}},steps}};
}
function analyze(records:PersonaBetaRecord[]){assert.equal(typeof api.analyzePersonaBetaRuns,'function','persona comparison analyzer is required');return api.analyzePersonaBetaRuns(records);}
const blocks=(n:number,text:(a:PersonaBetaActor,r:number)=>string=()=> 'Open')=>Array.from({length:n},(_,i)=>personaBetaActors.map(a=>record(a,i+1,text(a,i+1)))).flat();

test('an empty comparison keeps unknown distances and zero measured observations',()=>{
 const report=analyze([]);assert.equal(report.distances.within.mean,null);assert.equal(report.motion.overall.runs,0);assert.equal(report.actors.C.attempted,0);
});

test('identical complete paths have zero observed differences with explicit pair denominators',()=>{
 const report=analyze(blocks(2));
 assert.equal(report.paths.complete.length,8);assert.equal(report.paths.partial.length,0);
 assert.deepEqual({count:report.distances.within.count,mean:report.distances.within.mean},{count:4,mean:0});
 assert.deepEqual({count:report.distances.between.count,mean:report.distances.between.mean},{count:24,mean:0});assert.equal(report.distances.betweenMinusWithin,0);
 assert.equal(report.permutation.assignments,576);assert.equal(report.permutation.tailProportion,1);
});

test('stable actor paths exceed within-condition noise without producing naturalness or consistency scores',()=>{
 const stable=analyze(blocks(2,a=>a));assert.equal(stable.distances.within.mean,0);assert.equal(stable.distances.between.mean,1);assert.equal(stable.distances.betweenMinusWithin,1);
 assert.equal(stable.permutation.tailCount,24);assert.equal(stable.permutation.tailProportion,1/24);
 const noise=analyze(blocks(2,(_a,r)=>r===1?'Open':'Check'));assert.equal(noise.distances.within.mean,1);assert.equal(noise.distances.between.mean,0.5);assert.equal(noise.distances.betweenMinusWithin,-0.5);
 assert.equal(stable.qualitativeConsistency,'unassessed');assert.equal('naturalnessScore' in stable,false);
});

test('invalid prefixes and missing actors retain evidence and unequal opportunities without imputation',()=>{
 const good=record('baseline'),bad=record('A'),absent=record('B');bad.result!.termination='API_ERROR';bad.result!.validForComparison=false;absent.status='FAILED';delete absent.result;
 const report=analyze([good,bad,absent]);assert.equal(report.paths.complete.length,1);assert.equal(report.paths.partial.length,2);assert.equal(report.motion.overall.observedUIActions,2);
 assert.equal(report.distances.within.mean,null);assert.equal(report.distances.between.mean,null);assert.equal(report.distances.betweenMinusWithin,null);
 assert.equal(report.actors.A.opportunities.unknownRuns,1);assert.equal(report.actors.baseline.opportunities.noOpportunityRuns,1);assert.equal(report.actors.B.opportunities.unknownRuns,1);assert.equal(report.actors.C.attempted,0);
 assert.equal(report.actors.A.personaDelivery.native,1);assert.equal(report.actors.C.personaDelivery.measuredRuns,0);assert.equal(report.actors.B.personaDelivery.measuredRuns,1);
 assert.equal(report.permutation.assignments,0);assert.deepEqual(report.permutation.excludedBlocks[0].missingActors,['C']);assert.deepEqual(report.permutation.excludedBlocks[0].invalidActors,['A','B']);
 assert.equal(report.runs[1].reasonCategories.clarity,2);
});

test('route identities use reviewer text and action type across images, never unstable local IDs',()=>{
 const a=record('baseline'),b=record('A');b.result!.steps[0].action={type:'click',elementId:'renumbered'};b.result!.steps[0].audit!.screen.elements[0].id='renumbered';b.result!.steps[0].assetFiles!.current.sha256='different-image';
 const report=analyze([a,b]);assert.deepEqual(report.runs[0].routeTokens,['["primary","click","Open",null]']);assert.deepEqual(report.runs[0].routeTokens,report.runs[1].routeTokens);assert.equal(report.distances.between.mean,0);
 const ambiguous=record('B');ambiguous.result!.steps[0].audit!.screen.elements.push({id:'e1',type:'button',text:'Other'});assert.equal(analyze([ambiguous]).paths.complete.length,0);assert.equal(analyze([ambiguous]).runs[0].unboundUIActions,1);
});

test('same-image comparisons require identical candidate bindings and keep first observations and raw probabilities',()=>{
 const a=record('baseline',1,'Open',['primary','primary','primary']),b=record('A'),c=record('B');
 a.result!.steps[1].assetFiles!.current.sha256='common-image';a.result!.steps[1].selection!.raw={e1:0.1,done:0.9};
 b.result!.steps[0].selection!.raw={e1:0.6,done:0.4};b.result!.steps[0].selection!.selected='done';
 c.result!.steps[0].questions!.nextAction.criteria.e1='Different binding';
 const report=analyze([a,b,c]),pair=report.sameImageComparisons.pairs.find((p:any)=>p.left.actor==='baseline'&&p.right.actor==='A');
 assert.ok(pair);assert.ok(Math.abs(pair.rawTotalVariation-0.2)<1e-12);assert.equal(pair.selectedEqual,false);assert.equal(pair.left.step,1);assert.deepEqual(pair.left.raw,{e1:0.8,done:0.2});assert.equal(pair.left.actualAction.type,'click');
 assert.equal(report.sameImageComparisons.pairs.some((p:any)=>p.imageSha256==='common-image'&&(p.left.actor==='B'||p.right.actor==='B')),false);assert.equal(report.sameImageComparisons.firstOccurrences.filter((p:any)=>p.id===a.id&&p.imageSha256==='common-image').length,1);
 assert.equal(pair.sharedHistoryEstablished,false);assert.equal(pair.probabilityInterpretation,'raw-model-distribution-not-confidence');
 assert.equal(report.runs[0].reasonEvidence[0].kind,'model-self-report');assert.equal(report.interpretation.reasons,'Model-reported categories are not internal cognition or verified explanations.');
});

test('duplicate actor slots and cross-actor source drift cannot enter route distances',()=>{
 const a=record(),b=record();b.id='other';b.runId='other';b.result!.runId='other';const duplicated=analyze([a,b]);assert.equal(duplicated.paths.complete.length,0);
 const c=record('A');c.result!.code!.sourceHash='different';const drift=analyze([a,c]);assert.equal(drift.paths.complete.length,0);assert.ok(drift.integrity.errors.some((e:any)=>e.code==='SOURCE_MISMATCH'));
});

test('persona labels and canonical hashes are bound even when every repeat has the same wrong identity',()=>{
 for(const mutate of [(r:PersonaBetaRecord)=>{r.persona!.id='Other';r.personaSha256=hash(r.persona);r.result!.input.persona=structuredClone(r.persona!);},(r:PersonaBetaRecord)=>{r.personaSha256='wrong-hash';}]){
  const records=[record('A',1),record('A',2)];records.forEach(mutate);const report=analyze(records);
  assert.equal(report.paths.complete.length,0);assert.ok(report.integrity.errors.some((e:any)=>e.code==='PERSONA_IDENTITY_MISMATCH'));
 }
});

test('the three-block exact reference enumerates all assignments and preserves excluded extra slots',()=>{
 const records=blocks(3),extra=record('baseline',4),report=analyze([...records,extra]);
 assert.equal(report.paths.complete.length,12);assert.equal(report.paths.partial.length,1);assert.equal(report.permutation.blockCount,3);assert.equal(report.permutation.assignments,13824);assert.equal(report.permutation.tailCount,13824);
 const excluded=report.permutation.excludedBlocks.find((b:any)=>b.replicate===4);assert.ok(excluded);assert.equal(excluded.attempted,1);assert.deepEqual(excluded.invalidActors,['baseline']);assert.deepEqual(excluded.missingActors,['A','B','C']);
});

test('analysis is deterministic and output mutation does not change input evidence',()=>{
 const input=blocks(1),before=structuredClone(input),first=analyze(input);assert.deepEqual(analyze(input),first);first.runs[0].reasonEvidence[0].category='changed';assert.deepEqual(input,before);assert.equal(analyze([]).distances.within.mean,null);
});

const rowFaults:{name:string;code:string;mutate:(r:PersonaBetaRecord)=>void}[]=[
 {name:'action persona mismatch',code:'PERSONA_BINDING_MISMATCH',mutate:r=>r.personaDelivery!.errors.push({step:1,stage:'action',code:'PERSONA_BINDING_MISMATCH'})},
 {name:'native persona mismatch',code:'NATIVE_PERSONA_MISMATCH',mutate:r=>r.personaDelivery!.errors.push({step:0,stage:'native',code:'NATIVE_PERSONA_MISMATCH'})},
 {name:'OFF nonunit weights',code:'OFF_NONUNIT_APPLIED_WEIGHTS',mutate:r=>{r.result!.steps[0].deferral!.application!.appliedWeights={e1:0.01,done:1};r.result!.steps[0].selection!.policy!.weights={e1:0.01,done:1};}},
 {name:'OFF baseline selection change',code:'OFF_BASELINE_SELECTION_CHANGED',mutate:r=>{r.result!.steps[0].selection!.policy!.scope!.baselineSelected='done';}},
 {name:'missing deferral application',code:'MISSING_DEFERRAL_APPLICATION',mutate:r=>{delete r.result!.steps[0].deferral!.application;}},
];
for(const fault of rowFaults)test(`row-bound audit fault excludes ${fault.name} without erasing its prefix or imputing distance`,()=>{
 const good=record('baseline'),bad=record('A');fault.mutate(bad);const report=analyze([good,bad]);
 assert.equal(report.runs[0].validity.valid,true);assert.equal(report.runs[1].validity.valid,false);assert.ok(report.runs[1].validity.reasons.includes(fault.code));
 assert.equal(report.integrity.ok,false);assert.ok(report.integrity.errors.some((e:any)=>e.code===fault.code&&e.ids.length===1&&e.ids[0]===bad.id));
 assert.equal(report.paths.complete.length,1);assert.equal(report.paths.partial.length,1);assert.deepEqual(report.paths.partial[0].routeTokens,['["primary","click","Open",null]']);assert.equal(report.motion.overall.observedUIActions,2);assert.equal(report.runs[1].reasonCategories.clarity,2);
 assert.equal(report.actors.A.valid,0);assert.equal(report.actors.A.complete,0);assert.equal(report.actors.A.opportunities.unknownRuns,1);assert.equal(report.distances.between.count,0);assert.equal(report.distances.between.mean,null);assert.equal(report.distances.within.mean,null);assert.equal(report.distances.betweenMinusWithin,null);
 assert.deepEqual(report.permutation.excludedBlocks.find((b:any)=>b.replicate===1).invalidActors,['A']);assert.equal(report.sameImageComparisons.firstOccurrences.filter((o:any)=>o.id===bad.id).length,2);
});

test('a row-bound delivery failure removes its whole replicate block from the exact reference',()=>{
 const input=blocks(2);input[1].personaDelivery!.errors.push({step:1,stage:'assessment',code:'PERSONA_BINDING_MISMATCH'});
 const report=analyze(input);assert.equal(report.paths.complete.length,7);assert.equal(report.paths.partial.length,1);assert.equal(report.permutation.blockCount,1);assert.equal(report.permutation.assignments,0);assert.equal(report.permutation.tailProportion,null);assert.equal(report.distances.within.count,3);assert.equal(report.distances.between.count,18);
 assert.deepEqual(report.permutation.excludedBlocks.find((b:any)=>b.replicate===1).invalidActors,['A']);
});
