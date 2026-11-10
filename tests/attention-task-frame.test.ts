import {test} from 'node:test';
import assert from 'node:assert/strict';
import {attentionInput,attentionQuestions,attentionCandidates} from '../jev/virtual-beta/attention.js';
import type {BetaCandidates} from '../jev/virtual-beta/contracts.js';

const userGoal='通知を停止し、変更結果を確認してください。メール通知だけが対象です。';
function wire():Record<string,unknown>{return {
 goal:userGoal,currentDate:'2026-11-10',
 exploration:{persona:{name:'慎重な利用者',knowledge:['通知設定は初めて']},charter:{goal:userGoal,scope:['通知設定']}},
 observation:{id:'o1',image:'current',fixation:{x:320,y:225},candidateIds:['e1','look_0','look_1','look_2','look_3'],dom:'HIDDEN_DOM'},
 userState:{lastObservation:{id:'o1',candidateIds:['e1','look_0','look_1','look_2','look_3'],correctPoint:'HIDDEN_DOM'},memory:[{observationId:'old',visibleText:['HIDDEN_DOM'],action:{type:'look',point:{x:320,y:225}},outcome:'unchanged'}]},
 memoryObservations:[{observationId:'old',image:'prior',imageSha256:'hash',audit:'HIDDEN_DOM'}],
 endUserGoal:'HIDDEN_OVERRIDE',decisionTask:'HIDDEN_OVERRIDE',oracle:'HIDDEN_DOM'
};}

// Catches enabling task framing implicitly or changing the legacy allowlist boundary.
test('attention input without task frame retains its exact legacy projection',()=>{
 assert.deepEqual(attentionInput(wire()),{
  goal:userGoal,currentDate:'2026-11-10',
  exploration:{persona:{name:'慎重な利用者',knowledge:['通知設定は初めて']},charter:{goal:userGoal,scope:['通知設定']}},
  observation:{id:'o1',image:'current',fixation:{x:320,y:225},candidateIds:['e1','look_0','look_1','look_2','look_3']},
  userState:{memory:[{observationId:'old',visibleText:[],action:{type:'look',point:{x:320,y:225}},outcome:'unchanged'}],lastObservation:{id:'o1',candidateIds:['e1','look_0','look_1','look_2','look_3'],visibleText:[]}},
  memoryObservations:[{observationId:'old',image:'prior',imageSha256:'hash'}]
 });
});

// Catches retaining only the final task as the attention-call objective or losing its constraints.
test('attention task framing makes the immediate choice explicit and preserves the complete end-user goal',()=>{
 const result=attentionInput(wire(),'attention-v1');
 assert.equal(result.decisionTask,'visual-attention-only');
 assert.equal(result.endUserGoal,userGoal);
 assert.equal((result.exploration as any).charter.goal,userGoal);
 assert.notEqual(result.goal,userGoal);
 assert.equal(typeof result.goal,'string');
 const goal=result.goal as string;
 assert.ok(goal.includes(userGoal));
 assert.match(goal,/continue/);assert.match(goal,/inspect/);
 assert.match(goal,/非look/);assert.match(goal,/現在/);assert.match(goal,/UI/);
 assert.match(goal,/画像/);assert.match(goal,/観察記憶/);assert.match(goal,/ペルソナ/);
});

// Catches framing from unprojected wire fields or sharing projected nested state with the caller.
test('framed attention input still excludes hidden data and copies only the existing public evidence',()=>{
 const original=wire(),before=structuredClone(original),legacy=attentionInput(original),result=attentionInput(original,'attention-v1');
 assert.doesNotMatch(JSON.stringify(result),/HIDDEN_DOM|HIDDEN_OVERRIDE|correctPoint|oracle|dom/);
 const {goal:frameGoal,endUserGoal,decisionTask,...evidence}=result;
 const {goal:legacyGoal,...legacyEvidence}=legacy;
 assert.deepEqual(evidence,legacyEvidence);
 (result.exploration as any).persona.knowledge.push('changed');
 (result.observation as any).candidateIds.push('changed');
 (result.userState as any).memory[0].action.point.x=0;
 assert.deepEqual(original,before);
});

// Catches smuggling a gaze answer or modifying candidate/question distributions with the input-only treatment.
test('task framing does not select coordinates or alter the offered gaze and question vocabulary',()=>{
 const candidates:BetaCandidates={e1:{action:{type:'click',elementId:'e1'},label:'Current control'},look_0:{action:{type:'look',point:{x:320,y:225}},label:'Quarter A'},look_1:{action:{type:'look',point:{x:960,y:225}},label:'Quarter B'},look_2:{action:{type:'look',point:{x:320,y:675}},label:'Quarter C'},look_3:{action:{type:'look',point:{x:960,y:675}},label:'Quarter D'}};
 const offered=attentionCandidates(candidates,'exclusive-hierarchical-v2'),questions=attentionQuestions(candidates,'exclusive-hierarchical-v2');
 const before=structuredClone({offered,questions,candidates}),original=wire();
 const result=attentionInput(original,'attention-v1');
 assert.doesNotMatch(result.goal as string,/look_[0-9]|320|960|225|675|Quarter [A-D]/);
 assert.deepEqual((result.observation as any).candidateIds,['e1','look_0','look_1','look_2','look_3']);
 assert.deepEqual((result.observation as any).fixation,{x:320,y:225});
 assert.deepEqual({offered:attentionCandidates(candidates,'exclusive-hierarchical-v2'),questions:attentionQuestions(candidates,'exclusive-hierarchical-v2'),candidates},before);
});
