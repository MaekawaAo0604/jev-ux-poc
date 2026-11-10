import {test} from 'node:test';
import assert from 'node:assert/strict';
import {attentionCandidates,attentionQuestions,attentionInput} from '../jev/virtual-beta/attention.js';
import type {BetaCandidates} from '../jev/virtual-beta/contracts.js';

const candidates=():BetaCandidates=>({
 e1:{action:{type:'click',elementId:'e1'},label:'UNSEEN_CONTROL'},
 look_2:{action:{type:'look',point:{x:320,y:675}},label:'Look at viewport point {"x":320,"y":675}'},
 reread:{action:{type:'reread'},label:'Read again'},
 look_0:{action:{type:'look',point:{x:320,y:225}},label:'Look at viewport point {"x":320,"y":225}'},
 wait:{action:{type:'wait'},label:'Wait'},done:{action:{type:'done'},label:'Done'}
});

// Catches adding UI operations or invented gaze positions, dropping revisits, and mutation.
test('attention offers continuing plus exactly the existing gaze positions in their original order',()=>{
 const input=candidates(),before=structuredClone(input),result=attentionCandidates(input);
 assert.deepEqual(Object.keys(result),['continue','look_2','look_0']);
 assert.equal(result.continue.action.type,'reread');
 assert.deepEqual(result.look_2,{action:{type:'look',point:{x:320,y:675}},label:'Look at viewport point {"x":320,"y":675}'});
 assert.deepEqual(result.look_0,{action:{type:'look',point:{x:320,y:225}},label:'Look at viewport point {"x":320,"y":225}'});
 assert.deepEqual(input,before);
 if(result.look_2.action.type==='look')result.look_2.action.point.x=1;
 result.look_0.label='changed';
 assert.deepEqual(input,before);
 assert.deepEqual(Object.keys(attentionCandidates({done:input.done})),['continue']);
});

// Catches attaching unrelated controls/metadata or sharing mutable question state across decisions.
test('attention questions expose only the attention choices and a bounded self report',()=>{
 const input=candidates(),q=attentionQuestions(input),before=structuredClone(q);
 assert.deepEqual(Object.keys(q),['nextAction','decisionBasis']);
 assert.equal(q.nextAction.type,'choice');assert.equal(q.decisionBasis.type,'choice');
 assert.deepEqual(Object.keys(q.nextAction.criteria),['continue','look_2','look_0']);
 assert.deepEqual(Object.keys(q.decisionBasis.criteria),['goal','clarity','efficiency','confirmation','uncertainty','other']);
 assert.doesNotMatch(JSON.stringify(q),/UNSEEN_CONTROL/);
 q.nextAction.criteria.look_0='changed';q.decisionBasis.criteria.goal='changed';
 assert.deepEqual(attentionQuestions(input),before);
});

function wire():Record<string,unknown>{
 return {
  goal:'Find the receipt',currentDate:'2026-11-09',
  exploration:{persona:{schemaVersion:1,id:'p',name:'Person',itLiteracy:'ordinary',serviceExperience:'new',knowledge:['receipts'],expectations:['Receipt available'],behavioralTendencies:['recheck'],contextAndConstraints:[],oracle:'SECRET'},charter:{schemaVersion:1,id:'c',targetWebsite:'local:good',goal:'Find the receipt',initialState:{description:'Signed in',currentDate:'2026-11-09',dom:'SECRET'},scope:['account'],prohibitedActions:{actionTypes:['click'],controlTexts:['Delete'],downloads:true,oracle:'SECRET'},maxActions:6,oracle:'SECRET'},history:'SECRET'},
  observation:{id:'o2',image:'current',width:1280,height:900,viewport:{width:1280,height:900,roi:'SECRET'},fixation:{x:320,y:225,roi:'SECRET'},clearRect:{x:0,y:0,width:640,height:450,target:'SECRET'},transform:{offsetX:0,offsetY:0,scaleX:1,scaleY:1,dom:'SECRET'},candidateIds:['e1','look_0'],screen:{text:['SECRET']},targets:['SECRET']},
  userState:{schemaVersion:1,revision:2,fixation:{x:320,y:225,roi:'SECRET'},expectations:['Receipt available'],memory:[{observationId:'o1',imageSha256:'hash1',visibleText:['SECRET'],action:{type:'look',point:{x:320,y:225,target:'SECRET'},label:'SECRET'},outcome:'unchanged',audit:'SECRET'}],lastObservation:{id:'o2',imageSha256:'hash2',visibleText:['SECRET'],fixation:{x:320,y:225,roi:'SECRET'},candidateIds:['e1','look_0'],screen:'SECRET'},deliberation:{oracle:'SECRET'},history:'SECRET'},
  memoryObservations:[{observationId:'o1',image:'memory_0',imageSha256:'hash1',rawFile:'SECRET'}],
  audit:{screen:'SECRET'},history:['SECRET'],regionsOfInterest:['SECRET'],oracle:true
 };
}

// Catches leaking a hidden nested field, DOM text, or alias into the attention request.
test('attention input deeply admits only public image state and supplied observation memory',()=>{
 const input=wire(),before=structuredClone(input),result=attentionInput(input) as any;
 assert.deepEqual(Object.keys(result),['goal','currentDate','exploration','observation','userState','memoryObservations']);
 assert.doesNotMatch(JSON.stringify(result),/SECRET|oracle|screen|targets|regionsOfInterest|history|deliberation/);
 assert.deepEqual(result.observation,{id:'o2',image:'current',width:1280,height:900,viewport:{width:1280,height:900},fixation:{x:320,y:225},clearRect:{x:0,y:0,width:640,height:450},transform:{offsetX:0,offsetY:0,scaleX:1,scaleY:1},candidateIds:['e1','look_0']});
 assert.deepEqual(result.userState.memory,[{observationId:'o1',imageSha256:'hash1',visibleText:[],action:{type:'look',point:{x:320,y:225}},outcome:'unchanged'}]);
 assert.deepEqual(result.userState.lastObservation,{id:'o2',imageSha256:'hash2',visibleText:[],fixation:{x:320,y:225},candidateIds:['e1','look_0']});
 assert.deepEqual(result.memoryObservations,[{observationId:'o1',image:'memory_0',imageSha256:'hash1'}]);
 assert.deepEqual(input,before);
 result.exploration.persona.knowledge.push('changed');result.exploration.charter.scope.push('changed');result.userState.memory[0].action.point.x=999;result.observation.candidateIds.push('changed');result.memoryObservations[0].image='changed';
 assert.deepEqual(input,before);
});

// Catches absent state becoming synthetic knowledge or invalid nested values being copied wholesale.
test('attention input preserves empty memory and strips unsupported action details',()=>{
 assert.deepEqual(attentionInput({goal:'Find receipt',history:['SECRET']}),{goal:'Find receipt'});
 const result=attentionInput({userState:{memory:[{observationId:'o1',imageSha256:'hash',visibleText:['SECRET'],action:{type:'click',elementId:'e1',text:'SECRET'},outcome:'performed'},{observationId:'o2',imageSha256:'hash2',action:{type:'scroll',direction:'down',screen:'SECRET'}},{observationId:'o3',imageSha256:'hash3',action:{type:'unknown',text:'SECRET'}}]},memoryObservations:[]}) as any;
 assert.deepEqual(result.userState.memory,[{observationId:'o1',imageSha256:'hash',visibleText:[],action:{type:'click',elementId:'e1'},outcome:'performed'},{observationId:'o2',imageSha256:'hash2',visibleText:[],action:{type:'scroll',direction:'down'}},{observationId:'o3',imageSha256:'hash3',visibleText:[]}]);
 assert.deepEqual(result.memoryObservations,[]);
});
