import {test} from 'node:test';
import assert from 'node:assert/strict';
import {completionRequestFor,parseCompletion,recordCompletion} from '../jev/completion.js';
import {ChoiceRequestError,type ChoiceQuestion} from '../jev/client.js';
import type {State} from '../jev/types.js';

const state:State={goal:'料金と無料期間を知りたい',currentDate:'2026-09-20',history:[],screen:{title:'料金',text:['¥500（税込）','2ヶ月無料'],regions:[
 {id:'t1',source:'dom',text:'¥500（税込）',bbox:{x0:10,y0:20,x1:180,y1:45}},
 {id:'t2',source:'dom',text:'2ヶ月無料',bbox:{x0:10,y0:50,x1:180,y1:75}}
],elements:[],canScrollDown:false,canScrollUp:false}};
function response(request:{questions:Record<string,ChoiceQuestion>},assessment='supported'){
 return {model:'TEST',answers:Object.fromEntries(Object.entries(request.questions).map(([id,q])=>{
  const choice=id==='completion'?assessment:'relevant';
  return [id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k===choice?1:0]))}];
 }))};
}

test('post-completion audit uses only observed evidence, keeps step-qualified IDs and excludes oracle data',()=>{
 const request=completionRequestFor([state,{...state,objectiveSuccess:true,screen:{...state.screen,text:['違う料金'],regions:[{...state.screen.regions![0],text:'違う料金'}]}} as State]);
 assert.deepEqual(request.state.evidence.map(e=>e.id),['s1-t1','s1-t2','s2-t1']);
 assert.doesNotMatch(JSON.stringify(request),/objectiveSuccess|selector|正解ルート/);
 const result=parseCompletion(response(request),request);
 assert.equal(result.status,'RECORDED');assert.equal(result.assessment,'supported');
 assert.deepEqual(result.evidence.map(e=>e.text),['¥500（税込）','2ヶ月無料','違う料金']);
 assert.deepEqual(result.evidence[0].bbox,{x0:10,y0:20,x1:180,y1:45});
 assert.equal(result.objectiveVerified,false);
});

test('audit rejects missing, fabricated or malformed selections instead of claiming evidence',()=>{
 const request=completionRequestFor([state]),body=response(request);
 delete body.answers.evidence_s1_t1;assert.throws(()=>parseCompletion(body,request));
 const fabricated=response(request);fabricated.answers.completion.choice='definitely_done';assert.throws(()=>parseCompletion(fabricated,request));
 const malformed=response(request);malformed.answers.completion.probabilities.supported=NaN;assert.throws(()=>parseCompletion(malformed,request));
});

test('a claimed supported result with no selected evidence stays flagged',()=>{
 const request=completionRequestFor([state]),body=response(request);
 for(const [id,a] of Object.entries(body.answers))if(id!=='completion'){a.choice='irrelevant';a.probabilities={relevant:0,irrelevant:1,uncertain:0};}
 const result=parseCompletion(body,request);
 assert.equal(result.assessment,'supported');assert.equal(result.evidence.length,0);
 assert.ok(result.warnings.some(w=>w.includes('NO_EVIDENCE')));
});

test('audit retains early observed facts after more than 160 later evidence records',()=>{
 const states=[state,withEvidence(500)],saved=structuredClone(states);
 const request=completionRequestFor(states);
 assert.equal(request.state.evidence.length,502);
 assert.deepEqual(request.state.evidence.slice(0,2).map(entry=>({id:entry.id,source:entry.source,text:entry.text})),[
  {id:'s1-t1',source:'dom',text:'¥500（税込）'},
  {id:'s1-t2',source:'dom',text:'2ヶ月無料'}
 ]);
 assert.deepEqual(request.state.evidence.slice(2).map(entry=>entry.id),Array.from({length:500},(_,i)=>`s2-t${i+1}`));
 assert.equal(Object.keys(request.questions).length,503);
 assert.ok(!request.state.warnings.includes('AUDIT_INPUT_TRUNCATED'));
 assert.deepEqual(states,saved);
});

test('audit retains complete observed text longer than 20000 characters',()=>{
 const text=`先頭の観察記録 ${'表示された本文'.repeat(4000)} 末尾の観察記録`;
 const input={...state,screen:{...state.screen,text:[text],regions:[{...state.screen.regions![0],text}]}},saved=structuredClone(input);
 const request=completionRequestFor([input]);
 assert.ok(text.length>20_000);
 assert.equal(request.state.evidence.length,1);
 assert.deepEqual(request.state.evidence.map(entry=>entry.text),[text]);
 assert.equal(parseCompletion(response(request),request).evidence[0].text,text);
 assert.ok(!request.state.warnings.includes('AUDIT_INPUT_TRUNCATED'));
 assert.deepEqual(input,saved);
});

test('audit sends compact evidence to the model while restoring source metadata in its report',async()=>{
 const input=structuredClone(state),saved=structuredClone(input);
 let sentState:unknown;
 const result=await recordCompletion([input],async(modelState,questions)=>{
  sentState=modelState;
  const body=batchResponse(questions);
  body.answers.evidence_s1_t2={choice:'uncertain',probabilities:{relevant:0,irrelevant:0,uncertain:1}};
  return body;
 });
 assert.deepEqual(sentState,{
  goal:'料金と無料期間を知りたい',currentDate:'2026-09-20',warnings:[],evidence:[
   {id:'s1-t1',source:'dom',text:'¥500（税込）'},
   {id:'s1-t2',source:'dom',text:'2ヶ月無料'}
  ]
 });
 assert.equal(result.status,'RECORDED');assert.equal(result.objectiveVerified,false);
 assert.deepEqual(result.evidence,[{id:'s1-t1',step:1,source:'dom',text:'¥500（税込）',bbox:{x0:10,y0:20,x1:180,y1:45}}]);
 assert.deepEqual(result.uncertainEvidence,[{id:'s1-t2',step:1,source:'dom',text:'2ヶ月無料',bbox:{x0:10,y0:50,x1:180,y1:75}}]);
 assert.deepEqual(input,saved);
});

test('audit API errors are recorded separately and cannot replace the explorer completion',async()=>{
 const saved=structuredClone(state);
 const result=await recordCompletion([state],async()=>{throw new Error('service unavailable');});
 assert.equal(result.status,'ERROR');assert.equal(result.objectiveVerified,false);
 assert.deepEqual(state,saved);
 const notRun=await recordCompletion([state]);assert.equal(notRun.status,'NOT_RUN');
});

test('audit records safe failure stages without persisting exception messages or upstream metadata',async()=>{
 const transport=await recordCompletion([state],async()=>{throw Object.assign(new Error('Bearer PRIVATE_TOKEN'),{statusCode:503,requestBody:'PRIVATE_BODY'});});
 assert.deepEqual(transport.error,{stage:'request',code:'HTTP_ERROR',statusCode:503});
 assert.doesNotMatch(JSON.stringify(transport),/PRIVATE|Bearer/);
 const malformed=await recordCompletion([state],async(_s,questions)=>{
  const body=response(completionRequestFor([state]));delete body.answers[Object.keys(questions)[1]];return body;
 });
 assert.deepEqual(malformed.error,{stage:'response-validation',code:'INVALID_RESPONSE'});
 const timedOut=await recordCompletion([state],async()=>{throw new DOMException('PRIVATE','TimeoutError');});
 assert.deepEqual(timedOut.error,{stage:'request',code:'TIMEOUT'});
 const unknown=await recordCompletion([state],async()=>{throw new Error('PRIVATE');});
 assert.deepEqual(unknown.error,{stage:'request',code:'REQUEST_FAILED'});
});

test('audit preserves the reference date and retains final observations and action results in source order',()=>{
 const busy={...state,screen:{...state.screen,regions:Array.from({length:160},(_,i)=>({...state.screen.regions![0],id:`t${i+1}`,text:'繰り返し表示されたナビゲーション'}))}};
 const last={...state,screen:{...state.screen,regions:[{...state.screen.regions![0],text:'2026年9月の請求書を保存しました'}]},history:[{screen:'請求書',action:'保存',result:'Download completed: 2026-09.pdf'}]};
 const request=completionRequestFor([busy,last]);
 assert.equal(request.state.currentDate,'2026-09-20');
 assert.equal(request.state.evidence.length,162);
 assert.deepEqual(request.state.evidence.slice(-2).map(entry=>entry.id),['s2-t1','h1']);
 assert.ok(request.state.evidence.some(e=>e.text==='2026年9月の請求書を保存しました'));
 assert.ok(request.state.evidence.some(e=>e.text==='Download completed: 2026-09.pdf'));
});

function withEvidence(count:number):State{
 return {...state,screen:{...state.screen,text:Array.from({length:count},(_,i)=>`観察した本文 ${i+1}`),regions:Array.from({length:count},(_,i)=>({...state.screen.regions![0],id:`t${i+1}`,text:`観察した本文 ${i+1}`}))}};
}
function batchResponse(questions:Record<string,ChoiceQuestion>,assessment='supported'){
 return response({questions},assessment);
}

test('large completion audits keep full evidence context while separating completion from eight-question evidence batches',async()=>{
 const input=withEvidence(502),saved=structuredClone(input),request=completionRequestFor([input]);
 const calls:{state:unknown;questions:Record<string,ChoiceQuestion>}[]=[];
 const result=await recordCompletion([input],async(state,questions)=>{
  calls.push({state,questions});
  return {...batchResponse(questions),request:calls.length===1?{attempts:2,failures:[{code:'TIMEOUT' as const}],elapsedMs:5}:{attempts:1,failures:[],elapsedMs:2}};
 });
 assert.deepEqual(calls.map(call=>Object.keys(call.questions).length),[1,...Array(62).fill(8),6]);
 assert.deepEqual(Object.keys(calls[0].questions),['completion']);
 assert.deepEqual(calls.flatMap(call=>Object.keys(call.questions)),Object.keys(request.questions),'each original question is sent exactly once, in order');
 for(const call of calls){
  assert.deepEqual(call.state,request.state,'each batch retains the same complete evidence and context');
  for(const [id,question] of Object.entries(call.questions))assert.deepEqual(question,request.questions[id]);
 }
 assert.equal(result.status,'RECORDED');assert.equal(result.assessment,'supported');assert.equal(result.objectiveVerified,false);
 assert.equal(result.evidence.length,502);
 assert.deepEqual(result.evidence.map(entry=>({id:entry.id,source:entry.source,text:entry.text})),request.state.evidence);
 assert.ok(result.evidence.every(entry=>entry.step===1));
 assert.deepEqual(result.evidence[501].bbox,{x0:10,y0:20,x1:180,y1:45});
 assert.equal(Object.keys(result.answers!).length,503);
 assert.deepEqual(result.request,{attempts:65,failures:[{code:'TIMEOUT'}],elapsedMs:131});
 assert.ok(Number.isFinite(result.elapsedMs));assert.deepEqual(input,saved);
});

test('eight total audit questions stay in one call and nine questions separate completion from evidence',async()=>{
 for(const [count,lengths] of [[7,[8]],[8,[1,8]]] as const){
  const calls:number[]=[];
  const result=await recordCompletion([withEvidence(count)],async(_state,questions)=>{calls.push(Object.keys(questions).length);return batchResponse(questions);});
  assert.deepEqual(calls,lengths);assert.equal(result.status,'RECORDED');
 }
});

test('a later batch transport failure retains validated completion and evidence while marking the audit partial and failed',async()=>{
 const input=withEvidence(17),saved=structuredClone(input);let calls=0;
 const result=await recordCompletion([input],async(_state,questions)=>{
  calls++;
  if(calls===3)throw new ChoiceRequestError({code:'HTTP_ERROR',statusCode:503},{attempts:3,failures:Array.from({length:3},()=>({code:'HTTP_ERROR' as const,statusCode:503})),elapsedMs:31,budgetExhausted:true});
  return {...batchResponse(questions,'insufficient'),request:calls===1?{attempts:2,failures:[{code:'TIMEOUT' as const}],elapsedMs:11}:{attempts:1,failures:[],elapsedMs:7}};
 });
 assert.equal(result.status,'ERROR');assert.equal(result.objectiveVerified,false);assert.equal(result.assessment,'insufficient');assert.equal(result.model,'TEST');
 assert.deepEqual(result.evidence.map(entry=>entry.id),['s1-t1','s1-t2','s1-t3','s1-t4','s1-t5','s1-t6','s1-t7','s1-t8']);
 assert.deepEqual(result.evidence[0],{id:'s1-t1',step:1,source:'dom',text:'観察した本文 1',bbox:{x0:10,y0:20,x1:180,y1:45}});
 assert.equal(Object.keys(result.answers!).length,9);
 assert.deepEqual((result as any).partial,{answeredQuestions:9,totalQuestions:18});
 assert.ok(result.warnings.includes('AUDIT_FAILED'));assert.ok(result.warnings.includes('AUDIT_PARTIAL'));
 assert.deepEqual(result.error,{stage:'request',code:'HTTP_ERROR',statusCode:503});
 assert.deepEqual(result.request,{attempts:6,failures:[{code:'TIMEOUT'},{code:'HTTP_ERROR',statusCode:503},{code:'HTTP_ERROR',statusCode:503},{code:'HTTP_ERROR',statusCode:503}],elapsedMs:49,budgetExhausted:true});
 assert.deepEqual(input,saved);
});

test('an invalid later evidence batch contributes no answers and cannot turn a partial audit into a recorded result',async()=>{
 let calls=0;
 const result=await recordCompletion([withEvidence(17)],async(_state,questions)=>{
  calls++;const body=batchResponse(questions,'uncertain');
  if(calls===3)delete body.answers[Object.keys(questions).at(-1)!];
  return {...body,request:{attempts:1,failures:[],elapsedMs:2}};
 });
 assert.equal(result.status,'ERROR');assert.equal(result.assessment,'uncertain');assert.equal(calls,3);
 assert.deepEqual(result.error,{stage:'response-validation',code:'INVALID_RESPONSE'});
 assert.equal(Object.keys(result.answers!).length,9);
 assert.deepEqual((result as any).partial,{answeredQuestions:9,totalQuestions:18});
 assert.deepEqual(result.request,{attempts:3,failures:[],elapsedMs:6});
});
