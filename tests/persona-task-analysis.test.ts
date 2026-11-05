import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {personaTaskDefinition} from '../app/persona-task-fixture.js';
import {humanJevProfile} from '../runner/human-jev-profiles.js';
import type {PersonaTaskRecord} from '../runner/persona-task-contracts.js';
import type {PersonaTask,PersonaTaskSnapshot} from '../app/persona-task-types.js';
const api=await import('../runner/persona-task-analysis.js').catch(()=>({} as any));
const sha=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const state=(task:PersonaTask,route:PersonaTaskSnapshot['route']='start',events:string[]=[]):PersonaTaskSnapshot=>({schemaVersion:1,task,route,events,otherSessionActive:true,currentSessionActive:true,passwordChanged:false,draftCompact:false,savedCompact:false,notifications:false,scope:'none',complete:false});
function record(actor:PersonaTaskRecord['actor']='baseline',replicate=1,task:PersonaTask='sessions',labels=['説明を見る','戻る']):PersonaTaskRecord{
 const id=task+'-'+actor+'-'+replicate,persona=actor==='baseline'?null:{schemaVersion:1 as const,id:actor,name:actor,itLiteracy:'ordinary',serviceExperience:'none',knowledge:['visible'],expectations:['clear'],behavioralTendencies:['check'],contextAndConstraints:[]};
 const config=humanJevProfile('experience-persona-unweighted',300000,60000).config;
 const snapshots=[state(task),state(task,'help',['help']),state(task,'start',['help','start'])];
 const steps:any[]=snapshots.map((s,i)=>{
  const selected=i<2?'e1':'done',action=i<2?{type:'click',elementId:'e1'}:{type:'done'},raw=selected==='e1'?{e1:0.8,done:0.2}:{e1:0.2,done:0.8},weights={e1:1,done:1};
  const input={exploration:persona?{persona}: {},userState:{expectations:persona?.expectations??[]}};
  return {number:i+1,observationId:'o'+(i+1),audit:{url:'http://localhost/?task='+task,personaTask:s,rawScreenshot:'audit.png',sourceSha256:'source',screen:{title:'Screen',text:[],elements:[{id:'e1',type:'button',text:labels[i]??'操作'}],canScrollUp:false,canScrollDown:false}},assetFiles:{current:{file:'current.png',sha256:task+'-image-'+i}},modelInput:input,response:{answers:{}},deliberation:{modelInput:structuredClone(input),response:{answers:{}}},visualHypotheses:{request:{...(persona?{persona}:{})},response:{status:'completed'}},action,outcome:i<2?'UI_PERFORMED':'SUBJECTIVE_DONE',questions:{nextAction:{type:'choice',instructions:'choose',criteria:{e1:'[e1] generated rationale',done:'Done'}}},selection:{selected,modelChoice:selected,raw,filtered:{...raw},normalized:{...raw},adjustments:[],policy:{kind:'temporary-deferral',weights,before:{...raw},scope:{baselineSelected:selected}}},deferral:{decision:{weights},application:{kind:'deferral-weight-application',mode:'observe-only',proposedWeights:{...weights},appliedWeights:{...weights}}},reasonEvidence:{kind:'model-self-report',category:'confirmation',observationId:'o'+(i+1),proposedChoice:selected,selectedChoice:selected}};
 });
 const result:any={schemaVersion:1,runId:id,condition:config.id,config,code:{revision:'frozen',sourceHash:'source'},input:{...(persona?{persona}:{}),charter:{goal:'test'}},validForComparison:true,objectiveSuccess:false,objectiveAssessment:{status:'OK',value:false},perceivedDone:true,termination:'SUBJECTIVE_DONE',terminalObservation:{status:'RECORDED'},steps,apiCalls:9,decisions:3,uiActions:2,looks:0,elapsedMs:3,apiMs:2,uiMs:1,personaTask:{fixture:{version:1,task},definitionHash:sha(personaTaskDefinition({version:1,task})),initialProductImage:{file:'initial.png',sha256:task+'-initial'},terminalSnapshot:structuredClone(snapshots[2])}};
 return {id,runId:id,actor,replicate,sequence:replicate,fixture:{version:1,task},persona,personaSha256:persona?sha(persona):null,status:'RESULT',dir:'unused',ledger:null,resultPath:'unused',requests:9,initialImageSha256:task+'-initial',result,frameChecks:steps.flatMap(s=>['assessment','action'].map(stage=>({step:s.number,stage:stage as 'assessment'|'action',observationId:s.observationId,imageSha256:s.assetFiles.current.sha256,validCurrentFrame:true,successfulResponse:true,scope:'full-viewport-current' as const}))),replay:{status:'OK'},personaDelivery:{native:3,assessment:3,action:3,errors:[]}};
}
function analyze(records:PersonaTaskRecord[]){assert.equal(typeof api.analyzePersonaTaskRuns,'function','task comparison analyzer required');return api.analyzePersonaTaskRuns(records);}

test('valid routes use audit controls across image-local IDs and distances stay within task',()=>{
 const a=record(),b=record('A'),c=record('baseline',2),other=record('B',1,'privacy');
 const bs=b.result!.steps[0];bs.action={type:'click',elementId:'e9'};bs.audit!.screen.elements[0].id='e9';bs.selection!.selected='e9';bs.selection!.policy!.scope!.baselineSelected='e9';
 const report=analyze([a,b,c,other]);assert.equal(report.integrity.ok,true);assert.equal(report.tasks.sessions.paths.complete.length,3);assert.deepEqual(report.runs[0].routeTokens,report.runs[1].routeTokens);
 assert.equal(report.tasks.sessions.distances.within.count,1);assert.equal(report.tasks.sessions.distances.between.count,2);assert.equal(report.tasks.sessions.distances.between.mean,0);assert.equal(report.tasks.privacy.distances.between.mean,null);
 assert.equal(report.runs[0].subjective.perceivedDone,true);assert.equal(report.runs[0].objective.value,false);assert.equal(report.runs[0].reasonCategories.confirmation,3);assert.equal(report.qualitativeConsistency,'unassessed');
});

test('observable help choices and revisits retain step and snapshot evidence',()=>{
 const r=analyze([record()]).runs[0];assert.equal(r.choices.firstAction.reviewerControlText,'説明を見る');assert.equal(r.choices.help.count,1);assert.equal(r.choices.help.evidence[0].before.step,1);assert.equal(r.choices.help.evidence[0].after.step,2);assert.equal(r.choices.revisits.count,1);assert.equal(r.choices.revisits.evidence[0].route,'start');assert.equal(r.choices.revisits.evidence[0].departureStep,1);assert.equal(r.choices.revisits.evidence[0].returnStep,2);
});

const faults:{name:string;code:string;mutate:(r:PersonaTaskRecord)=>void}[]=[
 {name:'record error',code:'STORED_ERROR',mutate:r=>r.error={code:'STORED_ERROR'}},
 {name:'invalid result',code:'INVALID_RESULT',mutate:r=>r.result!.validForComparison=false},
 {name:'missing snapshot',code:'MISSING_OR_INVALID_SNAPSHOT',mutate:r=>delete (r.result!.steps[0].audit as any).personaTask},
 {name:'missing terminal',code:'MISSING_OR_INVALID_TERMINAL_SNAPSHOT',mutate:r=>delete (r.result as any).personaTask.terminalSnapshot},
 {name:'missing metadata',code:'TASK_METADATA_MISMATCH',mutate:r=>delete (r.result as any).personaTask.definitionHash},
 {name:'missing replay',code:'REPLAY_UNVERIFIED',mutate:r=>delete r.replay},
 {name:'failed frame',code:'CURRENT_FRAME_UNVERIFIED',mutate:r=>r.frameChecks![0].successfulResponse=false},
 {name:'missing frame',code:'CURRENT_FRAME_UNVERIFIED',mutate:r=>r.frameChecks!.splice(0,1)},
 {name:'native persona',code:'PERSONA_BINDING_MISMATCH',mutate:r=>(r.result!.steps[0].visualHypotheses!.request as any).persona={id:'wrong'}},
 {name:'action expectations',code:'PERSONA_EXPECTATION_MISMATCH',mutate:r=>(r.result!.steps[0].modelInput!.userState as any).expectations=[]},
 {name:'assessment persona',code:'PERSONA_BINDING_MISMATCH',mutate:r=>(r.result!.steps[0].deliberation!.modelInput.exploration as any).persona={id:'wrong'}},
 {name:'row delivery audit',code:'NATIVE_PERSONA_MISMATCH',mutate:r=>r.personaDelivery!.errors.push({step:1,stage:'native',code:'NATIVE_PERSONA_MISMATCH'})},
 {name:'nonunit application',code:'OFF_NONUNIT_APPLIED_WEIGHTS',mutate:r=>r.result!.steps[0].deferral!.application!.appliedWeights={e1:0.01,done:1}},
 {name:'missing application',code:'MISSING_DEFERRAL_APPLICATION',mutate:r=>delete r.result!.steps[0].deferral!.application},
 {name:'baseline changed',code:'OFF_BASELINE_SELECTION_CHANGED',mutate:r=>r.result!.steps[0].selection!.policy!.scope!.baselineSelected='done'},
 {name:'actual selection differs',code:'ACTUAL_SELECTION_MISMATCH',mutate:r=>r.result!.steps[0].action={type:'click',elementId:'e2'}},
 {name:'ambiguous control',code:'UNBOUND_UI_ACTION',mutate:r=>r.result!.steps[0].audit!.screen.elements.push({id:'e1',type:'button',text:'Other'})},
 {name:'ledger reservation',code:'LEDGER_ACCOUNTING_MISMATCH',mutate:r=>{r.ledger='ledger.json';r.ledgerEvidence={used:9,sha256:'ledger',reserved:1,ok:8,errors:0}}},
 {name:'changed actor identity',code:'PERSONA_IDENTITY_MISMATCH',mutate:r=>{r.persona!.id='Other';r.personaSha256=sha(r.persona);r.result!.input.persona=structuredClone(r.persona!)}},
];
for(const fault of faults)test(`invalid ${fault.name} excludes entire path before aggregates but preserves prefix`,()=>{
 const good=record(),bad=record('A');fault.mutate(bad);const report=analyze([good,bad]);assert.equal(report.runs[0].validity.valid,true);assert.equal(report.runs[1].validity.valid,false);assert.ok(report.runs[1].validity.reasons.includes(fault.code),JSON.stringify(report.runs[1].validity));assert.equal(report.tasks.sessions.paths.complete.length,1);assert.equal(report.tasks.sessions.paths.partial.length,1);assert.equal(report.runs[1].routeActions.length,2);assert.equal(report.tasks.sessions.distances.between.count,0);assert.equal(report.tasks.sessions.actors.A.choices.help.count,0);assert.equal(report.integrity.ok,['record error','invalid result'].includes(fault.name));
});

test('limits are censored prefixes and never model abandonment',()=>{
 const r=record();r.result!.termination='TIME_LIMIT';r.result!.perceivedDone=false;const report=analyze([r]),run=report.runs[0];assert.equal(run.validity.valid,true);assert.equal(run.censored,true);assert.equal(run.abandoned,false);assert.equal(run.complete,true);assert.equal(report.tasks.sessions.paths.complete.length,1);assert.equal(report.tasks.sessions.actors.baseline.censored,1);
});

test('failed and pending records remain distinguishable without invented choices',()=>{
 const pending=record(),failed=record('A');pending.status='ATTEMPTING';delete pending.result;pending.frameChecks=[];failed.status='FAILED';delete failed.result;failed.error={code:'API_ERROR'};
 const a=analyze([pending]);assert.equal(a.runs[0].validity.valid,false);assert.equal(a.integrity.ok,true);assert.equal(a.runs[0].choices.firstAction,null);
 const b=analyze([failed]);assert.equal(b.runs[0].infrastructure.failed,true);assert.equal(b.runs[0].abandoned,false);assert.equal(b.runs[0].choices.firstAction,null);assert.equal(b.integrity.ok,true);
});

test('same PNG preserves observed targets separately from generated criteria and refuses relaxed TV',()=>{
 const a=record(),b=record('A');b.result!.steps[0].questions!.nextAction.criteria.e1='[e1] a different generated explanation';
 const report=analyze([a,b]),pair=report.tasks.sessions.sameImageComparisons.pairs[0];assert.ok(pair);assert.equal(pair.stableObservedTargetsEqual,true);assert.equal(pair.candidateAnnotationsEqual,false);assert.equal(pair.rawTotalVariation,null);assert.equal(pair.fullInputEqualityEstablished,false);assert.equal(pair.sharedHistoryEstablished,false);assert.deepEqual(pair.left.observedTargets,[{candidateId:'e1',route:'start',type:'button',text:'説明を見る'}]);assert.ok(pair.left.candidateAnnotations);
 const c=record('B');c.result!.steps[0].selection!.raw={e1:0.6,done:0.4};const measured=analyze([a,c]).tasks.sessions.sameImageComparisons.pairs[0];assert.ok(Math.abs(measured.rawTotalVariation-0.2)<1e-12);
});

test('preferences preview and persisted save are separate factual choices; extended scope is not goal failure',()=>{
 const p=record('baseline',1,'preferences'),v:any=p.result;
 v.steps[1].audit.personaTask={...state('preferences','details',['preview-layout']),draftCompact:true};v.steps[2].audit.personaTask={...state('preferences','start',['preview-layout','save-layout']),draftCompact:true,savedCompact:true,complete:true};v.personaTask.terminalSnapshot=structuredClone(v.steps[2].audit.personaTask);v.objectiveSuccess=true;v.objectiveAssessment.value=true;
 const q=record('A',1,'privacy'),w:any=q.result;w.steps[1].audit.personaTask={...state('privacy','complete',['quick-enable-extended']),notifications:true,scope:'extended',complete:true};w.steps[2].audit.personaTask={...state('privacy','start',['quick-enable-extended','start']),notifications:true,scope:'extended',complete:true};w.personaTask.terminalSnapshot=structuredClone(w.steps[2].audit.personaTask);w.objectiveSuccess=true;w.objectiveAssessment.value=true;
 const report=analyze([p,q]);assert.equal(report.runs[0].choices.preview.count,1);assert.equal(report.runs[0].choices.save.count,1);assert.equal(report.runs[0].transitions[0].after.snapshot.savedCompact,false);assert.equal(report.runs[0].transitions[1].after.snapshot.savedCompact,true);assert.equal(report.runs[1].choices.quickExtended.count,1);assert.equal(report.runs[1].objective.value,true);assert.equal(report.runs[1].terminal.snapshot.scope,'extended');
});

test('event history regression and state changes without performed UI invalidate factual aggregation',()=>{
 const r=record();(r.result!.steps[2].audit as any).personaTask.events=['start'];const out=analyze([r]);assert.ok(out.runs[0].validity.reasons.includes('EVENT_HISTORY_MISMATCH'));assert.equal(out.tasks.sessions.actors.baseline.choices.help.count,0);
 const s=record();s.result!.steps[0].action={type:'wait'};s.result!.steps[0].outcome='WAITED';assert.ok(analyze([s]).runs[0].validity.reasons.includes('STATE_CHANGE_WITHOUT_PERFORMED_UI'));
});

test('duplicate actor cells and duplicate identities invalidate before pair counts',()=>{
 const a=record(),b=record();b.id='different';b.runId='different';b.result!.runId='different';const r=analyze([a,b]);assert.equal(r.tasks.sessions.paths.complete.length,0);assert.ok(r.integrity.errors.some((e:any)=>e.code==='DUPLICATE_CELL'));
});

test('analysis is deterministic, empty distances unknown, output detached from evidence',()=>{
 const input=[record()],before=structuredClone(input),a=analyze(input);assert.deepEqual(a,analyze(input));a.runs[0].reasonEvidence[0].category='mutated';assert.deepEqual(input,before);assert.equal(analyze([]).tasks.sessions.distances.within.mean,null);
});


test('failed model tail stays an invalid observed prefix without invented structural delivery errors',()=>{
 const r=record('A'),s:any=r.result!.steps[2];delete s.action;delete s.selection;delete s.modelInput;delete s.response;delete s.deliberation;s.visualHypotheses.response={status:'incomplete'};s.outcome='API_ERROR';r.result!.termination='API_ERROR';r.result!.validForComparison=false;r.result!.perceivedDone=false;r.frameChecks=r.frameChecks!.filter(c=>c.step<3);r.personaDelivery={native:2,assessment:2,action:2,errors:[]};
 const report=analyze([r]);assert.equal(report.integrity.ok,true,JSON.stringify(report.integrity.errors));assert.equal(report.runs[0].validity.valid,false);assert.equal(report.runs[0].infrastructure.failed,true);assert.equal(report.runs[0].routeActions.length,2);assert.equal(report.tasks.sessions.paths.complete.length,0);
});

test('corrupt fixture metadata is rejected without throwing during offline inspection',()=>{
 const r=record();(r.fixture as any).task='unknown';assert.doesNotThrow(()=>analyze([r]));assert.ok(analyze([r]).runs[0].validity.reasons.includes('UNEXPECTED_CELL'));
});

test('native completion and complete audit records are required for selected judgments',()=>{
 const r=record();(r.result!.steps[0].visualHypotheses!.response as any).status='incomplete';r.personaDelivery!.native=2;const out=analyze([r]);assert.ok(out.runs[0].validity.reasons.includes('NATIVE_INPUT_UNVERIFIED'));assert.equal(out.tasks.sessions.paths.complete.length,0);
 const a=record();delete (a.result!.steps[0].audit as any).screen;assert.doesNotThrow(()=>analyze([a]));assert.ok(analyze([a]).runs[0].validity.reasons.includes('MISSING_OR_INVALID_AUDIT'));
});

test('a click with no captured event cannot count as complete audited coverage',()=>{
 const r=record();r.result!.steps[1].audit!.personaTask!.events=[];r.result!.steps[2].audit!.personaTask!.events=['start'];r.result!.personaTask!.terminalSnapshot=structuredClone(r.result!.steps[2].audit!.personaTask!);assert.ok(analyze([r]).runs[0].validity.reasons.includes('EVENT_OPERATION_MISMATCH'));
});
