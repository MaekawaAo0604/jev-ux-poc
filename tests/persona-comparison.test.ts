import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compareRuns,extractFindings,routeDistance,type ExperimentRun} from '../runner/persona-report.js';
const run=(condition:string,repeat:number,path:string[],success=true):ExperimentRun=>({condition,repeat,dir:`${condition}-${repeat}`,fake:false,reason:success?'SUCCESS':'STUCK',objectiveSuccess:success,perceivedSuccess:success,actionCount:path.length,backCount:0,loopCount:0,elapsedMs:10,model:'TEST',steps:path.map((label,i)=>({number:i+1,url:'http://localhost:1/bad/#home',screenshot:`step-${i}.png`,state:{screen:{title:'Home',text:['Home'],elements:[{id:'e1',text:label}],canScrollUp:false,canScrollDown:false}},decision:{choice:'e1',action:{type:'click',elementId:'e1'},probabilities:{e1:1}},result:'OK'}))});
test('route distance preserves order and aligns insertions',()=>{
 assert.equal(routeDistance(['a','b'],['a','b']),0);
 assert.equal(routeDistance(['a','b'],['b','a']),1);
 assert.equal(routeDistance(['a','b'],['a','x','b']),1/3);
});
test('comparison reports within/between variability and separates fake evidence',()=>{
 const runs=['baseline','A','B','C'].flatMap(c=>[1,2,3].map(r=>run(c,r,c==='B'?['fast']:['slow','check'])));
 const report=compareRuns(runs,['baseline','A','B','C'],3);
 assert.equal(report.conditions.length,4);
 assert.equal(report.conditions[0].withinRouteDistance,0);
 assert.ok(report.variation.betweenRouteDistance!>0);
 assert.equal(report.variation.withinRouteDistance,0);
 assert.ok(report.variation.permutationP!>0);
 assert.equal(report.variation.humanValidity,'NOT_EVALUATED');
 assert.equal(compareRuns(runs.map(r=>({...r,fake:true})),['baseline','A','B','C'],3).evidence,'PLUMBING_ONLY');
});
test('findings retain observations, inference and evidence refs; missing runs do not establish unique issues',()=>{
 const r=run('A',1,['x'],false);r.steps[0].decision.action={type:'back'};
 const findings=extractFindings(r);
 assert.ok(findings.every(f=>f.observedFacts.length&&f.inference&&f.evidence.length));
 assert.ok(findings.some(f=>f.kind==='backtracking'));
 const report=compareRuns([r],['baseline','A','B','C'],3);
 assert.equal(report.complete,false);
 assert.ok(report.issues.every(i=>i.coverage==='provisional'));
});

test('model drift and instrumentation failure prevent condition-specific conclusions',()=>{
 const runs=['baseline','A'].flatMap(c=>[1,2,3].map(r=>run(c,r,['same'])));
 runs[0].model='OTHER';
 let report=compareRuns(runs,['baseline','A'],3);
 assert.equal(report.comparable,false);assert.equal(report.variation.permutationP,null);
 runs[0].model='TEST';runs[0].reason='DECISION_ERROR';
 report=compareRuns(runs,['baseline','A'],3);
 assert.equal(report.comparable,false);assert.equal(report.conditions[0].usableRuns,2);
 assert.ok(report.issues.every(i=>i.coverage==='provisional'));
});
