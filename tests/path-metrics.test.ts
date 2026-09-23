import {test} from 'node:test';
import assert from 'node:assert/strict';
// The measurement CLI is JavaScript outside the app's TypeScript compilation scope.
const {measurePath,summarizeReplay,summarizeLive}=await import(new URL('../docs/experiments/2026-09-22-path-metrics.mjs',import.meta.url).href);

const base='https://example.test';
const step=(number:number,path:string,text:string[],type='click',result='OK')=>({number,url:base+path,result,decision:{action:{type}},state:{screen:{regions:text.map(t=>({text:t,context:{landmark:'main'}}))}}});

test('only executed actions count; scrolls are not page revisits and final LOOP choice is excluded',()=>{
  const result={actionCount:5,steps:[step(1,'/a',['A'],'scroll'),step(2,'/a',['A','A2']),step(3,'/b',['B'],'back'),step(4,'/a',['A']),step(5,'/b',['B'],'back'),step(6,'/a',['A'],'click','LOOP')]};
  const m=measurePath(result);
  assert.equal(m.executedActions,5);
  assert.deepEqual(m.actionTypes,{scroll:1,click:2,back:2});
  assert.equal(m.excludedDecisionSteps,1);
  assert.equal(m.transitions,4);
  assert.equal(m.pageVisits,5);
  assert.equal(m.uniquePages,2);
  assert.equal(m.revisitArrivals,3);
  assert.equal(m.repeatedDirectedEdgeTraversals,2);
  assert.equal(m.abaReturns,3);
  assert.deepEqual(m.actions.map((a:{newTextFragmentsAfterAction:number|null})=>a.newTextFragmentsAfterAction),[1,1,0,0,0]);
  assert.equal(m.uniqueObservedTextFragments,3);
  assert.equal(m.actionsWithZeroNewText,3);
});

test('a revisit with new observed text is not treated as an information-free action',()=>{
  const m=measurePath({actionCount:2,steps:[step(1,'/a',['A']),step(2,'/b',['B'],'back'),step(3,'/a',['A','new answer'],'done','JEV_DONE')]});
  assert.equal(m.revisitArrivals,1);
  assert.equal(m.actions[1].newTextFragmentsAfterAction,1);
  assert.equal(m.actionsWithZeroNewText,0);
});

test('magazine operation denominator excludes the click that entered it and any unexecuted decision',()=>{
  const m=measurePath({actionCount:3,steps:[step(1,'/flow',['flow']),step(2,'/healthier-magazine/',['article'],'scroll'),step(3,'/healthier-magazine/',['more'],'back'),step(4,'/flow',['flow'],'click','ACTION_LIMIT')]});
  assert.equal(m.magazineActions.count,2);
  assert.equal(m.magazineActions.denominator,3);
  assert.deepEqual(m.magazineActions.steps,[2,3]);
});

test('global whitespace-normalized novelty excludes repeated headers and separates main content',()=>{
  const first=step(1,'/a',['A'],'scroll');
  first.state.screen.regions.push({text:'header',context:{landmark:'header'}});
  const second=step(2,'/a',[' A  '],'done','JEV_DONE');
  second.state.screen.regions.push({text:'new header',context:{landmark:'header'}});
  const m=measurePath({actionCount:1,steps:[first,second]});
  assert.equal(m.actions[0].newTextFragmentsAfterAction,1);
  assert.equal(m.actions[0].newMainTextFragmentsAfterAction,0);
});

test('unknown action accounting fails closed rather than silently relabelling executed actions',()=>{
  assert.throws(()=>measurePath({actionCount:1,steps:[step(1,'/a',['A'],'click','ACTION_ERROR')]}),/actionCount mismatch/);
});

test('replay confusion matrix keeps missing output distinct from a negative decision',()=>{
  const r=summarizeReplay({plannedCases:[{id:'tp'},{id:'tn'},{id:'fp'},{id:'fn'},{id:'error'}],results:[
    {id:'tp',expectedComplete:true,complete:true},{id:'tn',expectedComplete:false,complete:false},
    {id:'fp',expectedComplete:false,complete:true},{id:'fn',expectedComplete:true,complete:false},
    {id:'error',expectedComplete:false,error:'failed'},
  ]});
  assert.deepEqual(r.confusion,{truePositive:1,trueNegative:1,falsePositive:1,falseNegative:1});
  assert.equal(r.evaluated,4);assert.equal(r.unscored,1);assert.equal(r.accuracy,0.5);
  assert.equal(r.positiveCases,2);assert.equal(r.negativeCases,2);
});

test('replay transport errors never enter the confusion matrix even when complete is populated',()=>{
  const r=summarizeReplay({results:[
    {id:'failed-negative',expectedComplete:false,complete:false,error:'transport'},
    {id:'failed-positive',expectedComplete:true,complete:true,error:'transport'},
    {id:'healthy',expectedComplete:false,complete:false},
  ]});
  assert.deepEqual(r.confusion,{truePositive:0,trueNegative:1,falsePositive:0,falseNegative:0});
  assert.equal(r.evaluated,1);assert.equal(r.unscored,2);assert.equal(r.transportErrors,2);
});

test('live model completion and independently verified success have separate denominators',()=>{
  const s=summarizeLive([{reason:'JEV_DONE',perceivedSuccess:true,objectiveSuccess:null,evidenceSession:{accounting:{logicalCalls:2,successfulCalls:2,attempts:3,failures:1}}},{reason:'LOOP',perceivedSuccess:false,objectiveSuccess:null,evidenceSession:{accounting:{logicalCalls:1,successfulCalls:1,attempts:1,failures:0}}}]);
  assert.equal(s.modelCompleted,1);assert.equal(s.trials,2);
  assert.equal(s.objectiveVerifiedTrials,0);assert.equal(s.objectiveSuccessRate,null);
  assert.equal(s.requests.attempts,4);assert.equal(s.requests.recoveredFailedAttempts,1);
  assert.equal(s.terminalApiErrors,0);
});
