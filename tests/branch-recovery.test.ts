import {test} from 'node:test';
import assert from 'node:assert/strict';
import {jevDecide} from '../jev/decide.js';
import type {Candidate,State} from '../jev/types.js';
import type {ChoiceEvaluator} from '../jev/client.js';
const state:State={goal:'開館時間と休館日を知りたい',currentDate:'2026-10-16',history:[],screen:{title:'別の施設',text:['目的と無関係の施設'],elements:[],canScrollUp:false,canScrollDown:false},observedAlternatives:[{pageTitle:'施設案内',pageId:'p1',controls:[{label:'見学案内',kind:'click'}]}]} as State;
const candidates:Record<string,Candidate>={back:{action:{type:'back'},label:'戻る'},done:{action:{type:'done'},label:'完了'},stuck:{action:{type:'stuck'},label:'不明'}};
function evaluator(first:string,second:string,calls:any[]):ChoiceEvaluator{return async(input,questions)=>{
 calls.push({input,questions});const choice=calls.length===1?first:second;
 return {model:'TEST',answers:{nextAction:{choice,probabilities:Object.fromEntries(Object.keys(questions.nextAction.criteria).map(k=>[k,Number(k===choice)]))}}};
};}
test('a proposed dead end asks about observed alternatives and can choose Back without committing an invented route',async()=>{
 const calls:any[]=[];const result=await jevDecide(state,candidates,undefined,evaluator('stuck','f1',calls));
 assert.equal(result.action.type,'back');assert.equal(calls.length,2);
 assert.equal(calls[1].input.targets.f1.label,'見学案内');assert.ok(!calls[1].questions.nextAction.criteria.done);
 assert.equal(result.frontier,undefined);assert.equal(result.recovery?.initialDecision.action.type,'stuck');
});
test('recovery preserves Jev refusal instead of forcing Back',async()=>{
 const calls:any[]=[];const result=await jevDecide(state,candidates,undefined,evaluator('stuck','stuck',calls));
 assert.equal(result.action.type,'stuck');assert.equal(calls.length,2);
});
test('ordinary decisions and dead ends without an allowed recovery do not make extra calls',async()=>{
 const cases:[string,State,Record<string,Candidate>][]=[['done',state,candidates],['stuck',{...state,observedAlternatives:[]},candidates],['stuck',state,{stuck:candidates.stuck,done:candidates.done}]];
 for(const [first,input,allowed] of cases){
  const calls:any[]=[];const result=await jevDecide(input,allowed,undefined,evaluator(first,'f1',calls));
  assert.equal(result.action.type,first);assert.equal(calls.length,1);
 }
});
test('recovery inference failure is not silently converted to a browser action',async()=>{
 let calls=0;await assert.rejects(jevDecide(state,candidates,undefined,async(_input,questions)=>{
  if(++calls>1)throw new Error('offline');return {model:'TEST',answers:{nextAction:{choice:'stuck',probabilities:Object.fromEntries(Object.keys(questions.nextAction.criteria).map(k=>[k,Number(k==='stuck')]))}}};
 }),error=>{assert.equal((error as any).decisionReview.stage,'recovery');assert.equal((error as any).decisionReview.initialDecision.action.type,'stuck');return true;});
});

test('a proposed done with missing goal conditions is rejected and selects only a non-done action',async()=>{
 let calls=0;const result=await jevDecide({...state,observedAlternatives:[]},candidates,{verifyCompletion:true},async(_input,questions)=>{
  calls++;const id=Object.keys(questions)[0],choice=id==='completionCoverage'?'incomplete':calls===1?'done':'stuck';
  if(calls===3)assert.ok(!questions.nextAction.criteria.done,'rejected done cannot be reselected in the same observation');
  return {model:'TEST',answers:{[id]:{choice,probabilities:Object.fromEntries(Object.keys(questions[id].criteria).map(k=>[k,Number(k===choice)]))}}};
 });
 assert.equal(result.action.type,'stuck');assert.equal(result.completionCheck?.assessment,'incomplete');
});

test('verified completion keeps both raw decisions and stops without recovery',async()=>{
 let calls=0;const result=await jevDecide(state,candidates,{verifyCompletion:true},async(_input,questions)=>{
  calls++;const id=Object.keys(questions)[0],choice=id==='nextAction'?'done':'complete';
  return {model:'TEST',answers:{[id]:{choice,probabilities:Object.fromEntries(Object.keys(questions[id].criteria).map(k=>[k,Number(k===choice)]))}}};
 });
 assert.equal(calls,2);assert.equal(result.action.type,'done');assert.equal(result.completionCheck?.assessment,'complete');
 assert.equal(result.completionCheck?.initialDecision.action.type,'done');assert.equal(result.recovery,undefined);
});
