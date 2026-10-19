import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ExplorationMemory} from '../runner/exploration-memory.js';
import {jevDecide} from '../jev/decide.js';
import {chooseFrontier} from '../jev/frontier.js';
import type {Candidate,Observation,State} from '../jev/types.js';

function observe(m:ExplorationMemory,name:string,links:Record<string,string>,back?:string,top=0){
 const screen:Observation={title:name,pageId:name,text:[name],elements:Object.entries(links).map(([id,label])=>({id,text:label,type:'link'})),canScrollUp:false,canScrollDown:false,viewport:{top,bottom:top+1000,height:1000}};
 const candidates:Record<string,Candidate>=Object.fromEntries(Object.entries(links).map(([id,label])=>[id,{label,action:{type:'click',elementId:id}}]));
 candidates.done={action:{type:'done'},label:'Done'};candidates.stuck={action:{type:'stuck'},label:'Stuck'};
 if(back)candidates.back={action:{type:'back'},label:'Back'};
 const keys=Object.fromEntries(Object.entries(links).map(([id,label])=>[id,'PRIVATE:'+label]));if(back)keys.back=back;
 return m.observe(`https://fixture.test/${name}`,screen,candidates,keys,Object.keys(links));
}
const state:State={goal:'Find the answer',currentDate:'2026-10-16',history:[],screen:{title:'Dead end',text:[],elements:[],canScrollUp:false,canScrollDown:false}};
const response=(questions:any,choice:string)=>({model:'TEST',answers:{nextAction:{choice,probabilities:Object.fromEntries(Object.keys(questions.nextAction.criteria).map(k=>[k,Number(k===choice)]))}}});

test('an already selected fresh current action is committed without a second selector veto',async()=>{
 for(const [choice,action] of [['down',{type:'scroll',direction:'down'}],['link',{type:'click',elementId:'link'}]] as const){
  const candidates:Record<string,Candidate>={[choice]:{action,label:'Current observed target'},done:{action:{type:'done'},label:'Done'},stuck:{action:{type:'stuck'},label:'Stop'}};
  const frontier={targets:{f1:{label:'Current observed target',kind:action.type,pageTitle:'Guide',travelSteps:0,nextChoice:choice}}};
  let calls=0;
  const decision=await jevDecide(state,candidates,{verifyCompletion:true,frontier},async(input:any,questions)=>{calls++;return response(questions,input.targets?'stuck':choice);});
  assert.equal(decision.choice,choice,'the primary legal choice must reach execution, not be replaced by a duplicate inference');
  assert.equal(decision.frontier?.targetId,'f1');assert.equal(decision.frontier?.selectionSource,'current-action');
  assert.equal(calls,1);assert.equal(decision.probabilities[choice],1);
 }
});

test('vision recovery commits the chosen untried target across a real Back and ignores a repeated wrong branch',async()=>{
 const m=new ExplorationMemory();let a=observe(m,'Menu',{wrong:'Wrong branch',answer:'Answer'});m.executed(a,'wrong');
 const b=observe(m,'DeadEnd',{noise:'Unrelated detail'},'PRIVATE:history-menu');
 const frontier=m.frontier(b),entry=Object.entries(frontier.targets).find(([,t])=>t.label==='Answer');
 assert.ok(entry,'the current approved Back must expose its observed untried sibling');
 assert.equal(entry[1].nextChoice,'back');assert.doesNotMatch(JSON.stringify(frontier),/PRIVATE:|https:/);
 const decision=await jevDecide(state,b.candidates,{verifyCompletion:true,frontier},async(_input,questions)=>response(questions,Object.hasOwn(questions.nextAction.criteria,entry[0])?entry[0]:'stuck'));
 assert.equal(decision.choice,'back');assert.equal(decision.frontier?.targetId,entry[0]);
 m.commit(b,decision.frontier!.targetId,decision.frontier!.focus);m.executed(b,decision.choice);
 a=observe(m,'Menu',{newWrong:'Wrong branch',newAnswer:'Answer'});
 const continued=m.frontier(a);assert.equal(continued.continuation?.targetId,entry[0]);assert.ok(a.candidates.newWrong,'the wrong branch is still available as transit to its unused detail');
 let calls=0;
 const next=await jevDecide({...state,screen:{...state.screen,title:'Menu'}},a.candidates,{verifyCompletion:true,frontier:continued},async(_input,questions)=>{calls++;return response(questions,'newWrong');});
 assert.equal(next.choice,'newAnswer');assert.equal(next.frontier?.mode,'continue');assert.equal(calls,1,'reuse the recorded route, not another target inference');
 m.executed(a,next.choice);const answer=observe(m,'Answer',{});
 assert.equal(m.frontier(answer).continuation,undefined,'target is retired only after its actual execution');
});

test('a historical Back source cannot authorize a different current history entry',()=>{
 const m=new ExplorationMemory();const a=observe(m,'Menu',{wrong:'Wrong',answer:'Answer'});m.executed(a,'wrong');
 observe(m,'DeadEnd',{},'PRIVATE:history-menu');
 const unknown=observe(m,'DeadEnd',{},'PRIVATE:different-history');
 assert.ok(!Object.values(m.frontier(unknown).targets).some(t=>t.nextChoice==='back'));
});

test('an unexpected Back landing cancels the committed target and reobserves instead of clicking a stale control',()=>{
 const m=new ExplorationMemory();const a=observe(m,'Menu',{wrong:'Wrong',answer:'Answer'});m.executed(a,'wrong');
 const b=observe(m,'DeadEnd',{},'PRIVATE:history-menu');
 const target=Object.entries(m.frontier(b).targets).find(([,t])=>t.label==='Answer');assert.ok(target);
 m.commit(b,target[0],JSON.stringify([state.goal]));m.executed(b,'back');
 const changed=observe(m,'ChangedMenu',{safe:'New instructions'});
 assert.equal(m.frontier(changed).continuation,undefined);
 assert.ok(!Object.values(m.frontier(changed).targets).some(t=>t.label==='Answer'));
});

test('Back landing is checked against the latest departure, not an obsolete successful Back destination',()=>{
 const m=new ExplorationMemory(),links={wrong:'Wrong',another:'Another entrance',answer:'Answer'};
 let a=observe(m,'Menu',links);m.executed(a,'wrong');
 let b=observe(m,'DeadEnd',{noise:'Unrelated detail'},'PRIVATE:history-menu');m.executed(b,'back');
 observe(m,'Menu',links);
 // A new observation of a different scroll position in the same history entry.
 a=observe(m,'Menu',links,undefined,700);m.executed(a,'another');
 b=observe(m,'DeadEnd',{noise:'Unrelated detail'},'PRIVATE:history-menu');
 const target=Object.entries(m.frontier(b).targets).find(([,t])=>t.label==='Answer');assert.ok(target);
 m.commit(b,target[0],JSON.stringify([state.goal]));m.executed(b,'back');
 const obsolete=observe(m,'Menu',links);
 assert.equal(m.frontier(obsolete).continuation,undefined,'even a previously successful Back is stale when the latest departure changed');
});

test('verified goal completion is checked before following an unfinished committed route',async()=>{
 const m=new ExplorationMemory();let a=observe(m,'Menu',{wrong:'Wrong',answer:'Answer'});m.executed(a,'wrong');
 const b=observe(m,'DeadEnd',{},'PRIVATE:history-menu'),target=Object.entries(m.frontier(b).targets).find(([,t])=>t.label==='Answer');assert.ok(target);
 m.commit(b,target[0],JSON.stringify([state.goal]));m.executed(b,'back');a=observe(m,'Menu',{wrong:'Wrong',answer:'Answer'});
 let calls=0;const decision=await jevDecide(state,a.candidates,{verifyCompletion:true,frontier:m.frontier(a)},async(_input,questions)=>{
  calls++;if(questions.nextAction)return response(questions,'done');
  return {model:'TEST',answers:{completionCoverage:{choice:'complete',probabilities:{complete:1,incomplete:0,uncertain:0}}}};
 });
 assert.equal(decision.action.type,'done');assert.equal(calls,2);assert.equal(decision.completionCheck?.assessment,'complete');assert.equal(decision.frontier,undefined);
});

test('ordinary visual navigation also selects an untried frontier instead of repeatedly selecting the same transit branch',async()=>{
 const m=new ExplorationMemory();let a=observe(m,'Menu',{wrong:'Wrong branch',answer:'Answer'});m.executed(a,'wrong');
 observe(m,'DeadEnd',{noise:'Unrelated detail'},'PRIVATE:history-menu');
 a=observe(m,'Menu',{wrong:'Wrong branch',answer:'Answer'});
 assert.ok(a.candidates.wrong,'a known branch with unused details is legitimate transit, not globally banned');
 let calls=0;const decision=await jevDecide(state,a.candidates,{verifyCompletion:true,frontier:m.frontier(a)},async(input:any,questions)=>{
  calls++;return response(questions,input.targets?Object.keys(input.targets).find(id=>input.targets[id].label==='Answer')!:'wrong');
 });
 assert.equal(decision.choice,'answer');assert.equal(decision.frontier?.mode,'select');assert.equal(calls,2);
});
test('the final frontier selector receives target positions and already-observed scroll ranges, not just repeated up/down labels',async()=>{
 const memory=new ExplorationMemory();
 const screen=(top:number):Observation=>({title:'Guide',pageId:'p1',text:['DATA_PRIVATE_DO_NOT_SEND'],elements:[],canScrollDown:true,canScrollUp:top>0,viewport:{top,bottom:top+1000,height:1000}});
 const candidates:Record<string,Candidate>={down:{label:'下にスクロール',action:{type:'scroll',direction:'down'}},up:{label:'上にスクロール',action:{type:'scroll',direction:'up'}},stuck:{label:'Stop',action:{type:'stuck'}},done:{label:'Done',action:{type:'done'}}};
 const initial=memory.observe('https://fixture.test/',screen(0),{down:candidates.down,done:candidates.done,stuck:candidates.stuck},{down:'PRIVATE:down'});memory.executed(initial,'down');
 const offer=memory.observe('https://fixture.test/',screen(700),candidates,{down:'PRIVATE:down',up:'PRIVATE:up'}),frontier=memory.frontier(offer);
 const inputState:State={goal:'Find opening hours',currentDate:'2026-10-16',screen:screen(700),history:[{screen:'Guide',action:'下にスクロール',result:'Guide',pageId:'p1',viewport:{top:0,bottom:1000,height:1000},observedText:['DATA_PRIVATE_DO_NOT_SEND']}]};
 const decision=await chooseFrontier(inputState,offer.candidates,frontier,[inputState.goal],async(input:any,questions)=>{
  const up=Object.keys(input.targets).find(id=>input.targets[id].direction==='up'),down=Object.keys(input.targets).find(id=>input.targets[id].direction==='down');
  assert.ok(up);assert.ok(down);assert.equal(input.targets[up].viewport.top,700);
  assert.deepEqual(input.explorationProgress.visibleRange,{top:700,bottom:1700,height:1000});
  assert.match(questions.nextAction.criteria[up],/過去に観察済み/);assert.match(questions.nextAction.criteria[down],/まだ観察していない/);
  assert.doesNotMatch(JSON.stringify(input),/PRIVATE:|https:|DATA_PRIVATE_DO_NOT_SEND/);
  return response(questions,down);
 });
 assert.equal(decision.action.type,'scroll');assert.equal(decision.choice,'down');
 assert.ok(offer.candidates.up,'positionally covered is information, not a hard ban');
});
