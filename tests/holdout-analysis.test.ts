import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeHoldoutRuns,type HoldoutRunRecord} from '../runner/holdout-analysis.js';
import type {BetaResult,BetaStep} from '../runner/virtual-beta-core.js';
import type {SelectionRecord} from '../jev/virtual-beta/contracts.js';

function record(condition:'control'|'policy'='control',replicate=1):HoldoutRunRecord {
 const config:BetaResult['config']={schemaVersion:1,id:condition,vision:{mode:'foveated',clearWidth:960,clearHeight:620,blurRadius:12},state:{enabled:true,memoryCapacity:3},selection:{mode:'argmax',seed:20261028},behavior:'user',maxUIActions:12,maxLooks:4,maxDecisions:12,maxAPICalls:24,maxRunMs:180000,modeledActionMs:null,...(condition==='policy'?{deferral:{enabled:true,capacity:8,weight:0.01,minAlternativeProbability:0.01}}:{})};
 const id=`switch-alpha-${replicate}-${condition}`;
 return {id,task:'switch',variant:'alpha',replicate,condition,initialImageSha256:'initial',result:{schemaVersion:1,runId:id,condition,code:{revision:'frozen',sourceHash:'source'},config,input:{charter:{schemaVersion:1,id:'task',targetWebsite:'local:demo',goal:'Stop messages',initialState:{description:'initial',currentDate:'2026-10-28'},scope:['settings'],prohibitedActions:{actionTypes:[],controlTexts:[],downloads:true},maxActions:12}},initialFingerprint:'fp',objectiveSuccess:false,objectiveAssessment:{status:'OK',value:false},terminalObservation:{status:'RECORDED'},validForComparison:true,perceivedDone:false,termination:'DECISION_LIMIT',looks:0,uiActions:0,decisions:0,apiCalls:0,apiMs:0,uiMs:0,elapsedMs:0,modeledUserMs:null,steps:[]}};
}
function step(number:number,path:string,action?:BetaStep['action'],outcome='UI_PERFORMED'):BetaStep {
 return {number,observationId:'o'+number,audit:{url:'http://localhost:4217'+path,screen:{title:'screen',text:[],elements:[],canScrollUp:false,canScrollDown:false},rawScreenshot:'audit.png',sourceSha256:path},assetFiles:{current:{file:'image.png',sha256:path}},...(action?{action,outcome}:{})};
}
function returned(current:BetaStep,first:BetaStep,excursion:BetaStep){
 current.modelInput={experienceContext:{kind:'bounded-model-experience-not-fact',transitions:[],returnedRoutes:[{fromObservationId:first.observationId,toObservationId:current.observationId,path:[{source:{observationId:first.observationId,imageSha256:first.assetFiles!.current.sha256},candidateId:'old',prediction:'advances',result:{observationId:excursion.observationId,imageSha256:excursion.assetFiles!.current.sha256}},{source:{observationId:excursion.observationId,imageSha256:excursion.assetFiles!.current.sha256},candidateId:'back',prediction:'unknown',result:{observationId:current.observationId,imageSha256:current.assetFiles!.current.sha256}}]}]}};
}
function selection(before:Record<string,number>,selected:string):SelectionRecord {
 return {modelChoice:'a',raw:before,normalized:before,filtered:{a:0.01,b:0.99},normalization:{rawTotal:1,filteredTotal:1},adjustments:[],mode:'argmax',seed:1,drawIndex:0,draw:null,selected,policy:{kind:'temporary-deferral',before,weights:{a:0.01,b:1},weightedTotal:0.505}};
}

test('infrastructure errors with objective false never become task failures or enter means',()=>{
 const good=record(),fault=record('control',2);good.result.uiActions=4;good.result.decisions=5;
 fault.result.termination='API_ERROR';fault.result.validForComparison=true;fault.result.uiActions=100;
 const report=analyzeHoldoutRuns([good,fault]);
 assert.equal(report.cells[0].validN,1);assert.equal(report.cells[0].objectiveFailures,1);assert.equal(report.cells[0].faults,1);assert.equal(report.cells[0].meanUIActions,4);assert.equal(report.cells[0].meanDecisions,5);
 assert.equal(report.runs[1].validity.valid,false);assert.equal(report.runs[1].objectiveAssessment.value,false);assert.equal(report.runs[0].timing.humanTimeMs,null);
 assert.equal(report.completeness.expected,24);assert.equal(report.completeness.missing.length,22);
});

test('actual route uses canonical local pathname and hash and counts directed repeated edges and revisits',()=>{
 const run=record();run.result.steps=[step(1,'/fixture?variant=alpha#home',{type:'click',elementId:'a'}),step(2,'/fixture?variant=alpha#settings',{type:'back'}),step(3,'/fixture?variant=alpha#home',{type:'click',elementId:'b'}),step(4,'/fixture?variant=alpha#settings',{type:'done'})];
 run.result.steps[3].audit!.url='http://127.0.0.1:6000/fixture?different=1#settings';
 const view=analyzeHoldoutRuns([run]).runs[0];
 assert.deepEqual(view.route.edges.map(e=>[e.from,e.to]),[['/fixture#home','/fixture#settings'],['/fixture#settings','/fixture#home'],['/fixture#home','/fixture#settings']]);
 assert.equal(view.metrics.repeatedDirectedEdges,1);assert.equal(view.metrics.revisits,2);
 assert.ok(!JSON.stringify(view.route).includes('4217'));
});

test('different candidate ids returning to the same destination are not genuine branch changes',()=>{
 const run=record('policy');const first=step(1,'/ui#home',{type:'click',elementId:'old'}),away=step(2,'/ui#settings',{type:'back'}),back=step(3,'/ui#home',{type:'click',elementId:'new'});returned(back,first,away);
 run.result.steps=[first,away,back,step(4,'/ui#settings')];
 let view=analyzeHoldoutRuns([run]).runs[0];assert.equal(view.metrics.postReturnBranchChanges,0);assert.equal(view.postReturnBranches[0].status,'same-destination');
 run.result.steps[3].audit!.url='http://localhost:99/ui#other';view=analyzeHoldoutRuns([run]).runs[0];assert.equal(view.metrics.postReturnBranchChanges,1);assert.equal(view.postReturnBranches[0].status,'changed-destination');
 run.result.steps.pop();view=analyzeHoldoutRuns([run]).runs[0];assert.equal(view.metrics.postReturnBranchChanges,0);assert.equal(view.postReturnBranches[0].status,'unknown');
});

test('policy changes use deterministic before argmax, expose tie candidates and count applied and released deferrals',()=>{
 const run=record('policy');const s=step(1,'/ui#home');s.selection=selection({b:0.5,a:0.5},'b');
 s.deferral={state:{schemaVersion:1,entries:[]},decision:{kind:'temporary-deferral',weights:{a:0.01,b:1},plausibleCandidates:['a','b'],deferredCandidates:['a'],appliedCandidates:['a'],reason:'DEFER_WITH_ALTERNATIVES'}};
 const release=step(2,'/ui#home');release.selection=selection({a:0.8,b:0.2},'a');release.deferral={state:{schemaVersion:1,entries:[]},decision:{kind:'temporary-deferral',weights:{a:1,b:1},plausibleCandidates:['a'],deferredCandidates:['a'],appliedCandidates:[],reason:'ALTERNATIVES_EXHAUSTED'}};
 run.result.steps=[s,release];const view=analyzeHoldoutRuns([run]).runs[0];
 assert.equal(view.metrics.policyChanges,1);assert.equal(view.metrics.policyChangesFromTies,1);assert.equal(view.metrics.appliedDeferralSteps,1);assert.equal(view.metrics.appliedDeferralCandidates,1);assert.equal(view.metrics.releaseSteps,1);
 assert.deepEqual(view.policySelections[0].beforeArgmaxCandidates,['a','b']);assert.equal(view.policySelections[0].beforeArgmax,'a');
});

test('strict pairs reject code, initial image, charter and non-policy config mismatches',()=>{
 const control=record(),policy=record('policy');assert.equal(analyzeHoldoutRuns([control,policy]).pairs[0].consistent,true);
 policy.result.code!.sourceHash='other';policy.result.config.maxLooks++;policy.initialImageSha256='other';policy.result.input.charter.goal='different';
 const pair=analyzeHoldoutRuns([control,policy]).pairs[0];assert.equal(pair.consistent,false);assert.deepEqual(pair.errors,['SOURCE_HASH_MISMATCH','INITIAL_IMAGE_MISMATCH','CONFIG_MISMATCH','CHARTER_MISMATCH']);
});

test('duplicates, missing paired conditions and ambiguous run identities are explicit integrity errors',()=>{
 const a=record(),b=record('policy');b.result.runId='unrelated';
 const report=analyzeHoldoutRuns([a,structuredClone(a),b]);
 assert.equal(report.integrity.ok,false);assert.ok(report.integrity.errors.some(e=>e.code==='DUPLICATE_CELL'));assert.ok(report.integrity.errors.some(e=>e.code==='DUPLICATE_RUN_ID'));assert.ok(report.integrity.errors.some(e=>e.code==='RUN_ID_MISMATCH'));assert.equal(report.pairs[0].consistent,false);
 assert.equal(analyzeHoldoutRuns([record()]).pairs[0].status,'missing-condition');
});

test('absent next observation or failed action stays unknown, and legacy records need no policy fields',()=>{
 const run=record();run.result.steps=[step(1,'/ui#home',{type:'click',elementId:'a'})];
 let view=analyzeHoldoutRuns([run]).runs[0];assert.equal(view.route.edges[0].to,null);assert.equal(view.route.edges[0].status,'unknown');assert.equal(view.metrics.policyChanges,0);assert.equal(view.metrics.postReturnBranchChanges,0);
 run.result.steps[0].outcome='ACTION_ERROR';run.result.steps.push(step(2,'/ui#success'));view=analyzeHoldoutRuns([run]).runs[0];assert.equal(view.route.edges[0].status,'failed');assert.equal(view.route.edges[0].to,null);assert.equal(view.metrics.revisits,0);
 assert.doesNotThrow(()=>JSON.parse(JSON.stringify(analyzeHoldoutRuns([run]))));
});

test('same image alone does not establish the same semantic source for branch recovery',()=>{
 const run=record();const first=step(1,'/ui#home',{type:'click',elementId:'old'}),away=step(2,'/ui#settings',{type:'back'}),back=step(3,'/ui#other',{type:'click',elementId:'new'});back.assetFiles!.current.sha256=first.assetFiles!.current.sha256;returned(back,first,away);
 run.result.steps=[first,away,back,step(4,'/ui#third')];const view=analyzeHoldoutRuns([run]).runs[0];assert.equal(view.metrics.postReturnBranchChanges,0);assert.equal(view.postReturnBranches[0].status,'source-mismatch');
});

test('a complete 24-run matrix yields 12 strict pairs and 12 two-replicate descriptive cells',()=>{
 const records:HoldoutRunRecord[]=[];
 for(const task of ['switch','revisit','direct'] as const)for(const variant of ['alpha','beta'] as const)for(const replicate of [1,2])for(const condition of ['control','policy'] as const){
  const run=record(condition,replicate);run.task=task;run.variant=variant;run.id=`${task}-${variant}-${replicate}-${condition}`;run.result.runId=run.id;records.push(run);
 }
 const report=analyzeHoldoutRuns(records);assert.equal(report.completeness.complete,true);assert.equal(report.integrity.ok,true);assert.equal(report.pairs.length,12);assert.equal(report.cells.length,12);assert.ok(report.cells.every(cell=>cell.validN===2));
});

test('an oracle error excludes the run even when reported comparison validity and success say true',()=>{
 const run=record();run.result.objectiveSuccess=true;run.result.objectiveAssessment={status:'ERROR',value:null,code:'ORACLE_ERROR'};
 const report=analyzeHoldoutRuns([run]);assert.equal(report.runs[0].validity.valid,false);assert.equal(report.cells[0].objectiveSuccesses,0);assert.equal(report.cells[0].objectiveFailures,0);assert.equal(report.cells[0].faults,1);assert.equal(report.cells[0].meanUIActions,null);
});

test('path uniqueness ignores candidate names but refuses to treat unknown terminal edges as complete paths',()=>{
 const a=record(),b=record('control',2);
 a.result.steps=[step(1,'/ui#home',{type:'click',elementId:'a'}),step(2,'/ui#settings',{type:'done'})];b.result.steps=[step(1,'/ui#home',{type:'click',elementId:'different-id'}),step(2,'/ui#settings',{type:'done'})];
 let cell=analyzeHoldoutRuns([a,b]).cells[0];assert.equal(cell.pathUniqueness.uniquePaths,1);assert.equal(cell.pathUniqueness.consistent,true);
 b.result.steps.pop();cell=analyzeHoldoutRuns([a,b]).cells[0];assert.equal(cell.pathUniqueness.completeValidN,1);assert.equal(cell.pathUniqueness.unknownPathN,1);assert.equal(cell.pathUniqueness.consistent,null);
});
