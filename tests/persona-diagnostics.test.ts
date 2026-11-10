import {test} from 'node:test';
import assert from 'node:assert/strict';
import {diagnoseRun,distributionComparison} from '../runner/persona-diagnostics.js';
const screen={title:'Home',text:['Home'],elements:[{id:'e1',type:'link',text:'Settings'}],canScrollUp:false,canScrollDown:false,pageId:'p1'};
test('replays the exact guard, separates selected from executed and explains the initial URL alias',()=>{
 const steps=[1,2,3,4].map(n=>({number:n,url:n===1?'http://local/bad/':'http://local/bad/#home',state:{screen,history:Array(n-1).fill({})},candidates:{e1:{label:'Settings',action:{type:'click',elementId:'e1'}}},decision:{choice:'e1',action:{type:'click',elementId:'e1'}},result:n===4?'LOOP':'OK',screenshot:`step-${n}.png`,...(n===4?{}:{recordedAction:{action:'click'},outcome:{url:'http://local/bad/#settings',screen:{...screen,title:'Settings'},screenshot:`after-${n}.png`}})}));
 const run={condition:'A',repeat:1,dir:'A-1',reason:'LOOP',actionCount:3,objectiveSuccess:false,steps};
 const d=diagnoseRun(run);
 assert.equal(d.loopReconstructionMatches,true);
 assert.equal(d.decisions.at(-1)?.occurrence,3);
 assert.deepEqual(d.decisions.at(-1)?.matchingPreviousSteps,[2,3]);
 assert.equal(d.executedActions,3);assert.equal(d.selectedActions,4);
 assert.equal(d.decisions.at(-1)?.executed,false);
 assert.equal(d.initialAndReturnedHome.sameObservation,true);
 assert.equal(d.initialAndReturnedHome.sameURL,false);
});
test('distribution comparison detects identical actions but different probability outputs',()=>{
 const rows=['baseline','A','B','C'].flatMap(condition=>[1,2,3].map(repeat=>({condition,repeat,probabilities:{goal:({baseline:.9,A:.8,B:.6,C:.5} as Record<string,number>)[condition],efficiency:1-({baseline:.9,A:.8,B:.6,C:.5} as Record<string,number>)[condition]}})));
 const result=distributionComparison(rows);
 assert.equal(result.withinDistance,0);assert.ok(result.betweenDistance!>0);
 assert.ok(result.permutationP!<.05);assert.equal(result.assignments,13824);
 const same=distributionComparison(rows.map(r=>({...r,probabilities:{same:1}})));
 assert.equal(same.effect,0);assert.equal(same.permutationP,1);
});

test('a heading scrolled out of view is not a page identity collision',()=>{
 const steps=[{title:'Home',url:'http://local/bad/#home'},{title:'',url:'http://local/bad/#home'}].map((v,i)=>({number:i+1,url:v.url,state:{screen:{...screen,title:v.title},history:[]},result:'OK',screenshot:'step.png'}));
 const run={condition:'baseline',repeat:1,dir:'baseline-1',reason:'ACTION_LIMIT',actionCount:2,objectiveSuccess:false,steps};
 assert.equal(diagnoseRun(run).identityCollisions.length,0);
 steps[1].state.screen.title='Settings';steps[1].url='http://local/bad/#settings';
 assert.equal(diagnoseRun(run).identityCollisions.length,1);
});

test('a disabled legacy guard is telemetry and cannot predict a LOOP stop',()=>{
 const steps=[1,2,3].map(n=>({number:n,url:'http://local/bad/#home',state:{screen,history:[]},candidates:{e1:{label:'Settings',action:{type:'click',elementId:'e1'}}},decision:{choice:'e1',action:{type:'click',elementId:'e1'}},result:'OK',screenshot:'step.png',loopCheck:{enabled:false,blocked:false}}));
 const d=diagnoseRun({condition:'baseline',repeat:1,dir:'baseline-1',reason:'ACTION_LIMIT',actionCount:3,objectiveSuccess:false,steps});
 assert.equal(d.decisions[2].occurrence,3);assert.equal(d.decisions[2].guardWouldBlock,false);assert.equal(d.loopReconstructionMatches,true);
});
