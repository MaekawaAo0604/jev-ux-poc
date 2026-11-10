import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as attention from '../jev/virtual-beta/attention.js';
import type {BetaCandidates} from '../jev/virtual-beta/contracts.js';

const candidates=():BetaCandidates=>({
 e1:{action:{type:'click',elementId:'e1'},label:'Click visible control'},
 look_0:{action:{type:'look',point:{x:320,y:225}},label:'Look at viewport point {"x":320,"y":225}'},
 back:{action:{type:'back'},label:'Back'},
 look_1:{action:{type:'look',point:{x:960,y:225}},label:'Look at viewport point {"x":960,"y":225}'},
 reread:{action:{type:'reread'},label:'Read again'},
 look_2:{action:{type:'look',point:{x:320,y:675}},label:'Look at viewport point {"x":320,"y":675}'},
 wait:{action:{type:'wait'},label:'Wait'},
 look_3:{action:{type:'look',point:{x:960,y:675}},label:'Look at viewport point {"x":960,"y":675}'},
 done:{action:{type:'done'},label:'Done'},stuck:{action:{type:'stuck'},label:'Stuck'},abandon:{action:{type:'abandon'},label:'Abandon'}
});
const legacy={
 continue:{action:{type:'reread'},label:'Use the present view for the next action decision'},
 look_0:{action:{type:'look',point:{x:320,y:225}},label:'Look at viewport point {"x":320,"y":225}'},
 look_1:{action:{type:'look',point:{x:960,y:225}},label:'Look at viewport point {"x":960,"y":225}'},
 look_2:{action:{type:'look',point:{x:320,y:675}},label:'Look at viewport point {"x":320,"y":675}'},
 look_3:{action:{type:'look',point:{x:960,y:675}},label:'Look at viewport point {"x":960,"y":675}'}
};

// Catches silently changing the historic default or adding policy questions to it.
test('omitting attention policy preserves the legacy candidate and question contract',()=>{
 assert.deepEqual(attention.attentionCandidates(candidates()),legacy);
 const q=attention.attentionQuestions(candidates());
 assert.deepEqual(Object.keys(q),['nextAction','decisionBasis']);
 assert.equal(q.nextAction.instructions,attention.attentionInstructions);
 assert.deepEqual(q.nextAction.criteria,Object.fromEntries(Object.entries(legacy).map(([id,c])=>[id,c.label])));
 assert.deepEqual(q.decisionBasis,attention.attentionReasonQuestion);
});

// Catches overlapping continue/look meaning while retaining the same viewport vocabulary.
test('flat v2 makes continuing exclusive to current-view non-look actions',()=>{
 const original=candidates(),before=structuredClone(original);
 const c=attention.attentionCandidates(original,'exclusive-flat-v2');
 assert.deepEqual(Object.keys(c),['continue','look_0','look_1','look_2','look_3']);
 assert.notEqual(c.continue.label,legacy.continue.label);
 assert.match(c.continue.label,/current view/i);
 assert.match(c.continue.label,/non-look/i);
 for(const id of ['look_0','look_1','look_2','look_3'])assert.deepEqual(c[id],legacy[id as keyof typeof legacy]);
 const q=attention.attentionQuestions(original,'exclusive-flat-v2');
 assert.match(q.nextAction.instructions,/non-look/i);
 assert.deepEqual(q.decisionBasis,attention.attentionReasonQuestion);
 assert.deepEqual(Object.keys(q),['nextAction','decisionBasis']);
 assert.deepEqual(original,before);
});

// Catches conflating total inspection demand with conditional point probabilities.
test('hierarchical v2 asks a binary gate and a separate conditional gaze question in one question set',()=>{
 const c=attention.attentionCandidates(candidates(),'exclusive-hierarchical-v2');
 assert.deepEqual(Object.keys(c),['continue','inspect']);
 assert.deepEqual(c.continue.action,{type:'reread'});
 assert.deepEqual(c.inspect.action,{type:'wait'});
 const q=attention.attentionQuestions(candidates(),'exclusive-hierarchical-v2');
 assert.deepEqual(Object.keys(q),['nextAction','decisionBasis','gazeTarget']);
 assert.deepEqual(Object.keys(q.nextAction.criteria),['continue','inspect']);
 assert.deepEqual(Object.keys(q.gazeTarget.criteria),['look_0','look_1','look_2','look_3']);
 assert.match(q.gazeTarget.instructions,/conditional/i);
 assert.match(q.gazeTarget.instructions,/inspect/i);
 assert.match(q.gazeTarget.instructions,/population/i);
 assert.deepEqual(q.decisionBasis,attention.attentionReasonQuestion);
 assert.doesNotMatch(JSON.stringify(q),/Click visible control/);
});

// Catches point rewriting, accidental revisit bans and mutation via aliases.
test('gaze candidates retain every original quarter point including the current fixation',()=>{
 assert.equal(typeof attention.attentionGazeCandidates,'function');
 const original=candidates(),before=structuredClone(original),result=attention.attentionGazeCandidates(original);
 assert.deepEqual(Object.keys(result),['look_0','look_1','look_2','look_3']);
 assert.deepEqual(result.look_0,{action:{type:'look',point:{x:320,y:225}},label:'Look at viewport point {"x":320,"y":225}'});
 if(result.look_0.action.type==='look')result.look_0.action.point.x=0;
 result.look_1.label='changed';
 assert.deepEqual(original,before);
});

// Catches narrowing continue to clicks, dropping back or terminal choices, and sharing mutable candidates.
test('current-view candidates remove only look and keep back and non-UI actions',()=>{
 assert.equal(typeof attention.attentionCurrentViewCandidates,'function');
 const original=candidates(),before=structuredClone(original),result=attention.attentionCurrentViewCandidates(original);
 assert.deepEqual(Object.keys(result),['e1','back','reread','wait','done','stuck','abandon']);
 assert.deepEqual(result.back,{action:{type:'back'},label:'Back'});
 result.e1.label='changed';
 if(result.e1.action.type==='click')result.e1.action.elementId='changed';
 assert.deepEqual(original,before);
});

// Catches losing action-stage factors, stale offered IDs, or mutations of the shared source wire.
test('current-view action input preserves ordinary wire fields and updates both current candidate lists',()=>{
 assert.equal(typeof attention.attentionCurrentViewInput,'function');
 const wire={goal:'Find receipt',observation:{id:'o2',image:'current',fixation:{x:320,y:225},candidateIds:['e1','look_0'],transform:{scaleX:1}},userState:{memory:[{observationId:'o1',action:{type:'look',point:{x:320,y:225}}}],lastObservation:{id:'o2',candidateIds:['e1','look_0']}},deliberation:{current:'ordinary action input'},memoryObservations:[{image:'prior'}]};
 const before=structuredClone(wire),result=attention.attentionCurrentViewInput(wire,candidates()) as typeof wire;
 assert.deepEqual(result.observation.candidateIds,['e1','back','reread','wait','done','stuck','abandon']);
 assert.deepEqual(result.userState.lastObservation.candidateIds,['e1','back','reread','wait','done','stuck','abandon']);
 assert.deepEqual(result.deliberation,{current:'ordinary action input'});
 assert.deepEqual(result.memoryObservations,[{image:'prior'}]);
 assert.deepEqual(result.userState.memory,[{observationId:'o1',action:{type:'look',point:{x:320,y:225}}}]);
 result.observation.fixation.x=0;result.deliberation.current='changed';
 assert.deepEqual(wire,before);
 assert.deepEqual(attention.attentionCurrentViewInput({goal:'Find receipt'},candidates()),{goal:'Find receipt'});
 assert.match(attention.attentionCurrentViewInstructions,/non-look/i);
});

// Catches new gate policies bypassing the existing deep public-state boundary.
test('v2 gate projection still removes nested hidden outcomes and DOM knowledge',()=>{
 const wire={goal:'Find receipt',observation:{id:'o',image:'current',candidateIds:['e1','look_0'],dom:'HIDDEN'},exploration:{persona:{knowledge:['receipt']},charter:{goal:'Find receipt',correctRegion:'HIDDEN'}},userState:{lastObservation:{id:'o',candidateIds:['e1','look_0'],outcome:'HIDDEN'},memory:[{observationId:'old',visibleText:['HIDDEN'],action:{type:'look',point:{x:320,y:225,correct:'HIDDEN'}},oracle:'HIDDEN'}]},oracle:'HIDDEN'};
 const before=structuredClone(wire),result=attention.attentionInput(wire);
 assert.doesNotMatch(JSON.stringify(result),/HIDDEN|correctRegion|oracle|dom/);
 assert.deepEqual((result.exploration as any).persona.knowledge,['receipt']);
 assert.deepEqual(wire,before);
});
