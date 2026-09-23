import {test} from 'node:test';
import assert from 'node:assert/strict';
import {jevDecide} from '../jev/decide.js';
import {evaluateChoices,type ChoiceEvaluator} from '../jev/client.js';
import {candidatesFor,type State,type TextRegion} from '../jev/types.js';

const region=(id:string,text:string):TextRegion=>({id,source:'dom',text,bbox:{x0:20,y0:40,x1:640,y1:80},fontSizePx:16,context:{landmark:'main',section:'local-section',headings:['利用案内']}});
function observation():State{
 return {
  goal:'条件と時間を知りたい。申込みはしない。',currentDate:'2026-09-23',
  screen:{title:'利用案内',text:['受付時間 10:00〜17:00\n ※当日券のみ'],warnings:['PARTIAL_TEXT'],regions:[region('r-current','受付時間 10:00〜17:00\n ※当日券のみ')],elements:[{id:'e7',type:'link',text:'条件の詳細',fontSizePx:18},{id:'e9',type:'button',text:'申込み',available:false,unavailableReason:'無効'}],canScrollDown:true,canScrollUp:true,pageId:'p1',viewport:{top:400,bottom:800,height:400}},
  history:[
   {screen:'利用案内',action:'下にスクロール',result:'次の範囲を表示',observedText:['対象：小学生以下  無料'],observedWarnings:[],observedRegions:[region('r-first','対象：小学生以下  無料')],pageId:'p1',viewport:{top:0,bottom:400,height:400},remainingGoalChecks:['条件','時間']},
   {screen:'利用案内',action:'案内を開く',result:'別の画面を表示',observedText:['休館日：月曜日'],observedWarnings:['PARTIAL_TEXT'],observationOmitted:true,observedRegions:[region('r-second','休館日：月曜日')],pageId:'p1',viewport:{top:400,bottom:800,height:400},remainingGoalChecks:['時間']},
   {screen:'案内',action:'戻る',result:'前の画面を再表示',observedText:['予約不要'],observedWarnings:[],observedRegions:[region('r-third','予約不要')],pageId:'p2',viewport:{top:0,bottom:400,height:400},remainingGoalChecks:['時間']},
  ],
 };
}
function decodeHistory(input:any){
 assert.ok(Array.isArray(input.observations),'strict action input must carry the observation pool');
 assert.equal(new Set(input.observations.map((o:any)=>o.id)).size,input.observations.length);
 return input.history.map(({observationId,...entry}:any)=>{
  const observation=input.observations.find((o:any)=>o.id===observationId);
  assert.ok(observation,`history reference ${observationId} must resolve`);
  const {id,...payload}=observation;
  assert.equal(entry.pageId,payload.pageId,'page identity stays on each ordered action');
  for(const key of ['observedText','observedWarnings','observationOmitted'])assert.ok(!Object.hasOwn(entry,key),`${key} belongs in the pool`);
  return {...entry,...payload};
 });
}

test('combined selection uses the supplied evaluator for its compact SDK request',async()=>{
 const state=observation();let received:any;
 const evaluate:ChoiceEvaluator=async(input,questions)=>{received=input;return evaluateChoices(input,questions);};
 await withProvider(async calls=>{
  const decision=await jevDecide(state,candidatesFor(state.screen,true),undefined,evaluate);
  assert.equal(decision.choice,'scroll_down');
  assert.ok(received,'the configured evaluator must govern the action request');
  assert.deepEqual(received,calls[0].state);
  assert.ok(!Object.hasOwn(received.screen,'regions'));
 });
});

test('goal-check fallback session uses the supplied evaluator for assessment and action SDK requests',async()=>{
 const state=observation(),received:any[]=[];
 const evaluate:ChoiceEvaluator=async(input,questions)=>{received.push({state:input,questions});return evaluateChoices(input,questions);};
 await withProvider(async calls=>{
  const decision=await jevDecide(state,candidatesFor(state.screen,true),{goalChecks:['条件','時間']},evaluate);
  assert.equal(decision.choice,'scroll_down');
  assert.ok(received.some(input=>input.questions.coverage),'the fallback session must use the configured evaluator for goal assessment');
  const action=received.find(input=>input.questions.nextAction);
  assert.ok(action,'the fallback session must use the configured evaluator for action selection');
  assert.deepEqual(received,calls.map(({state,questions})=>({state,questions})));
  assert.ok(!Object.hasOwn(action.state.screen,'regions'));
  assert.deepEqual(action.state.remainingGoalChecks,['条件','時間']);
 });
});

// Replace only the external provider; exercise the SDK and production client.
async function withProvider(run:(calls:any[])=>Promise<void>){
 const previous=globalThis.AI_SDK_DEFAULT_PROVIDER,key=process.env.AI_GATEWAY_API_KEY,calls:any[]=[];
 globalThis.AI_SDK_DEFAULT_PROVIDER={evaluationModel:()=>({specificationVersion:'v4',provider:'TEST',modelId:'TEST',supportedQuestionTypes:['choice'],async doEvaluate(input:any){
  calls.push(input);
  return {answers:Object.fromEntries(Object.entries(input.questions).map(([id,q]:[string,any])=>{
   const choice=id==='nextAction'?'scroll_down':id==='coverage'?'complete':id.startsWith('screen_')?'relevant':'absent';
   return [id,{type:'choice',choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k===choice?1:0]))}];
  })),warnings:[]};
 }})} as any;
 process.env.AI_GATEWAY_API_KEY='LOCAL_TEST_ONLY';
 try{await run(calls);}finally{globalThis.AI_SDK_DEFAULT_PROVIDER=previous;if(key===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=key;}
}

for(const mode of ['combined','goal-check'] as const){
 const options=mode==='goal-check'?{goalChecks:['条件','時間']}:undefined;
 test(`${mode} SDK action input omits duplicate regions without losing observations or candidate choices`,async()=>{
  const state=observation(),original=structuredClone(state);
  await withProvider(async calls=>{
   const decision=await jevDecide(state,candidatesFor(state.screen,true),options);
   assert.deepEqual(decision.action,{type:'scroll',direction:'down'});
   assert.deepEqual(state,original,'source observation and evidence must remain unchanged');
   const actions=calls.filter(input=>input.questions.nextAction);
   assert.equal(actions.length,1);
   const {state:input,questions}=actions[0];
   assert.ok(!Object.hasOwn(input.screen,'regions'),'region text and geometry are redundant in action input');
   assert.ok(input.history.every((h:any)=>!Object.hasOwn(h,'observedRegions')),'historical region bodies must not be sent twice');
   assert.equal(input.goal,'条件と時間を知りたい。申込みはしない。');
   assert.equal(input.currentDate,'2026-09-23');
   assert.deepEqual(input.screen,{
    title:'利用案内',text:['受付時間 10:00〜17:00\n ※当日券のみ'],warnings:['PARTIAL_TEXT'],elements:[{id:'e7',type:'link',text:'条件の詳細',fontSizePx:18},{id:'e9',type:'button',text:'申込み',available:false,unavailableReason:'無効'}],canScrollDown:true,canScrollUp:true,pageId:'p1',viewport:{top:400,bottom:800,height:400},
   });
   assert.deepEqual(mode==='goal-check'?decodeHistory(input):input.history,[
    {screen:'利用案内',action:'下にスクロール',result:'次の範囲を表示',observedText:['対象：小学生以下  無料'],observedWarnings:[],pageId:'p1',viewport:{top:0,bottom:400,height:400},remainingGoalChecks:['条件','時間']},
    {screen:'利用案内',action:'案内を開く',result:'別の画面を表示',observedText:['休館日：月曜日'],observedWarnings:['PARTIAL_TEXT'],observationOmitted:true,pageId:'p1',viewport:{top:400,bottom:800,height:400},remainingGoalChecks:['時間']},
    {screen:'案内',action:'戻る',result:'前の画面を再表示',observedText:['予約不要'],observedWarnings:[],pageId:'p2',viewport:{top:0,bottom:400,height:400},remainingGoalChecks:['時間']},
   ]);
   assert.deepEqual(questions.nextAction.criteria,{
    e7:'「条件の詳細」をクリック',back:'ブラウザーで前の画面に戻る',scroll_down:'下にスクロール（この方向には、まだ観察していない表示範囲がある）',scroll_up:'上にスクロール（移動先の表示範囲は過去に観察済み。読み取れた内容は本文と警告を参照）',...(mode==='combined'?{done:'目的を達成したと判断して終了する'}:{}),stuck:'次の操作が分からないため終了する',
   });
   if(mode==='goal-check'){
    assert.deepEqual(input.remainingGoalChecks,['条件','時間']);
    assert.match(questions.nextAction.instructions,/history.*observationId.*observations/);
   }else{
    assert.ok(!Object.hasOwn(input,'remainingGoalChecks'));
    assert.ok(!Object.hasOwn(input,'observations'),'legacy combined input must not acquire a pool');
    assert.ok(input.history.every((h:any)=>!Object.hasOwn(h,'observationId')));
   }
  });
 });

 test(`${mode} SDK action input exposes visited ranges and ordered actions for revisited pages`,async()=>{
  const state=observation(),original=structuredClone(state);
  await withProvider(async calls=>{
   await jevDecide(state,candidatesFor(state.screen,true),options);
   const input=calls.find(input=>input.questions.nextAction).state;
   assert.deepEqual(input.explorationProgress,{
    currentPage:'p1',visibleRange:{top:400,bottom:800,height:400},
    pages:[
     {pageId:'p1',ranges:[{top:0,bottom:400,height:400},{top:400,bottom:800,height:400},{top:400,bottom:800,height:400}],actions:[{step:1,label:'下にスクロール',result:'次の範囲を表示',remainingGoalChecks:['条件','時間']},{step:2,label:'案内を開く',result:'別の画面を表示',remainingGoalChecks:['時間']}]},
     {pageId:'p2',ranges:[{top:0,bottom:400,height:400}],actions:[{step:3,label:'戻る',result:'前の画面を再表示',remainingGoalChecks:['時間']}]},
    ],
   });
   assert.deepEqual(state,original,'progress must not annotate the original observation');
  });
 });
}

test('strict action observations share only identical page, text, warnings and omission context and reconstruct every action',async()=>{
 const state=observation(),base=state.history[0];
 const {observedWarnings,...withoutWarnings}=base;
 const {pageId,...withoutPage}=base;
 const {observedText,...withoutText}=base;
 state.history=[
  base,
  {...base,screen:'同じ本文の再表示',action:'戻る',result:'再表示',viewport:{top:90,bottom:490,height:400},remainingGoalChecks:['時間']},
  {...base,pageId:'p2'},
  {...base,observedWarnings:['PARTIAL_TEXT']},
  {...base,observationOmitted:true},
  {...base,observationOmitted:false},
  withoutWarnings,
  withoutPage,
  {...base,observedText:['対象：小学生以下 無料']},
  withoutText,
  {...base,observedText:[]},
 ];
 const original=structuredClone(state);
 await withProvider(async calls=>{
  await jevDecide(state,candidatesFor(state.screen,true),{goalChecks:['条件','時間']});
  const input=calls.find(input=>input.questions.nextAction).state;
  assert.deepEqual(decodeHistory(input),original.history.map(({observedRegions,...entry})=>entry));
  assert.deepEqual(input.history.map((h:any)=>h.observationId),['o1','o1','o2','o3','o4','o5','o6','o7','o8','o9','o10']);
  assert.equal(input.observations.length,10);
  assert.deepEqual(input.observations[0],{id:'o1',pageId:'p1',observedText:['対象：小学生以下  無料'],observedWarnings:[]});
  assert.ok(input.observations.every((o:any)=>!Object.hasOwn(o,'observedRegions')));
  assert.deepEqual(state,original,'pooling must not rewrite evidence or action history');
 });
});

test('strict action observation pooling has no history, text, warning or character cap',async()=>{
 const state=observation();
 state.history=Array.from({length:180},(_,i)=>({
  screen:`画面 ${i}`,action:`操作 ${i}`,result:`結果 ${i}`,pageId:`p${i%3}`,
  observedText:i===0?[`${'長い観測本文 '.repeat(4000)}末尾`,...Array.from({length:180},(_,j)=>`断片 ${j}`)]:[`固有の本文 ${i}`],
  observedWarnings:i===0?Array.from({length:180},(_,j)=>`警告 ${j}`):[],
  observationOmitted:i%2===0,viewport:{top:i*10,bottom:i*10+400,height:400},remainingGoalChecks:['時間'],
 }));
 const original=structuredClone(state);
 await withProvider(async calls=>{
  await jevDecide(state,candidatesFor(state.screen,true),{goalChecks:['条件','時間']});
  const input=calls.find(input=>input.questions.nextAction).state;
  assert.deepEqual(decodeHistory(input),original.history);
  assert.equal(input.history.length,180);assert.equal(input.observations.length,180);
  assert.deepEqual(state,original);
 });
});
