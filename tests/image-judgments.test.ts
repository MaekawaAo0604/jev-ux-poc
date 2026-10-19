import {test} from 'node:test';
import assert from 'node:assert/strict';
import {VisualDecisionContext} from '../jev/visual-context.js';
import {jevDecide} from '../jev/decide.js';
import {parsePublicOptions} from '../runner/public-options.js';
import type {State} from '../jev/types.js';
import {ImageJudgmentMemory} from '../jev/image-judgments.js';
import {InferenceInterruption} from '../jev/client.js';
import {ExplorationMemory} from '../runner/exploration-memory.js';
import type {Candidate,Observation} from '../jev/types.js';
import {ImageOnlyInput} from '../jev/image-only-input.js';

test('image judgment wire shares duplicate sources without losing records',()=>{
 const input=new ImageOnlyInput(),one={id:'v1',step:1,sha256:'a'.repeat(64)},two={id:'v2',step:2,sha256:'b'.repeat(64)};
 const memory={requirements:[{id:'g1',text:'料金を知りたい',status:'observed' as const,records:[{assessment:'observed' as const,source:one,model:'TEST'}]}],routes:Array.from({length:80},(_,i)=>({targetId:`f${i+1}`,assessment:'promising' as const,source:i%2?two:one,model:'TEST'}))};
 const q={nextAction:{type:'choice' as const,instructions:'',criteria:{done:'done',stuck:'stuck'}}};
 const wire=input.request({goal:'料金を知りたい'},q,{step:3},memory).context.imageJudgments as any;
 assert.equal(Object.keys(wire.sources??{}).length,2);
 const expand=(r:any)=>({...r,source:wire.sources[r.source.reference]});
 assert.deepEqual(wire.routes.map(expand),memory.routes);
 assert.deepEqual(wire.requirements.map((r:any)=>({...r,records:r.records.map(expand)})),memory.requirements);
 assert.ok(JSON.stringify(wire).length<JSON.stringify(memory).length*.65);
});

test('image route judgments are scoped to the actual frontier question without removing saved routes',()=>{
 const input=new ImageOnlyInput(),source={id:'v1',step:1,sha256:'a'.repeat(64)};
 const memory={requirements:[],routes:['f1','f2'].map(targetId=>({targetId,assessment:'promising' as const,source,model:'TEST'}))};
 const scoped=input.request({goal:'料金を知りたい',targets:{f1:{kind:'click',travelSteps:1}}},{nextAction:{type:'choice',instructions:'',criteria:{f1:'f1',stuck:'stuck'}}},{step:3},memory).context.imageJudgments as any;
 assert.deepEqual(scoped.routes.map((r:any)=>r.targetId),['f1']);
 assert.equal(memory.routes.length,2,'wire scoping must not remove saved route judgments');
});

for(const verdict of ['complete','incomplete','uncertain'])test(`image evidence starts whole-Goal verification before a non-done action and respects ${verdict}`,async()=>{
 const state:State={goal:'料金と受付時間を知りたい',currentDate:'2026-10-18',history:[],screen:{title:'',text:[],elements:[],canScrollUp:false,canScrollDown:false}};
 const candidates:Record<string,Candidate>={e1:{label:'next',action:{type:'click',elementId:'e1'}},done:{label:'done',action:{type:'done'}},stuck:{label:'stuck',action:{type:'stuck'}}};
 const calls:string[]=[];
 const result=await jevDecide(state,candidates,{verifyCompletion:true,completionEvidence:()=>({supported:true,unresolved:[]})},async(input,q)=>{
  assert.equal((input as State).goal,state.goal);const id=Object.keys(q)[0];calls.push(id);
  const choice=id==='completionCoverage'?verdict:'e1';
  return {model:'TEST',answers:{[id]:{choice,probabilities:Object.fromEntries(Object.keys(q[id].criteria).map(k=>[k,Number(k===choice)]))}}};
 });
 assert.deepEqual(calls,['nextAction','completionCoverage']);
 assert.equal(result.action.type,verdict==='complete'?'done':'click');
 assert.equal(result.completionCheck?.initialDecision.choice,'e1');
 assert.equal(result.completionCheck?.assessment,verdict);
 assert.equal(result.completionCheck?.evidenceGuard?.supported,true);
 if(verdict!=='complete')assert.deepEqual(result.probabilities,{e1:1,done:0,stuck:0});
});

test('unresolved image evidence cannot start eager completion or discard the primary action',async()=>{
 const state:State={goal:'Find both answers',currentDate:'2026-10-18',history:[],screen:{title:'',text:[],elements:[],canScrollUp:false,canScrollDown:false}};
 let calls=0;
 const result=await jevDecide(state,{e1:{label:'next',action:{type:'click',elementId:'e1'}},done:{label:'done',action:{type:'done'}}},{verifyCompletion:true,completionEvidence:()=>({supported:false,unresolved:['g2']})},async(_input,q)=>{
  calls++;assert.ok(q.nextAction);return {model:'TEST',answers:{nextAction:{choice:'e1',probabilities:{e1:1,done:0}}}};
 });
 assert.equal(calls,1);assert.equal(result.action.type,'click');assert.equal(result.completionCheck,undefined);
});

test('preserved Back commits an untried sibling so the next primary choice cannot cycle into the old branch',async()=>{
 const memory=new ExplorationMemory();
 const observe=(name:string,ids:string[],back=false)=>{
  const screen:Observation={title:name,text:[name],pageId:name,elements:ids.map(id=>({id,type:'link',text:id})),canScrollUp:false,canScrollDown:false};
  const candidates:Record<string,Candidate>=Object.fromEntries(ids.map(id=>[id,{action:{type:'click',elementId:id},label:id}]));
  candidates.stuck={action:{type:'stuck'},label:'stuck'};if(back)candidates.back={action:{type:'back'},label:'back'};
  const identities=Object.fromEntries(ids.map(id=>[id,name+id]));if(back)identities.back='native-menu';
  return {screen,offer:memory.observe(`https://fixture.test/${name}`,screen,candidates,identities)};
 };
 const a=observe('menu',['e1','e2']);memory.executed(a.offer,'e1');
 const b=observe('wrong',['e3'],true),frontier=memory.frontier(b.offer);
 const state:State={goal:'Find information',currentDate:'2026-10-18',screen:b.screen,history:[]};
 const response=(choice:string,q:any)=>({model:'TEST',answers:{nextAction:{choice,probabilities:Object.fromEntries(Object.keys(q.nextAction.criteria).map(k=>[k,Number(k===choice)]))}}});
 const first=await jevDecide(state,b.offer.candidates,{preserveTransit:true,frontier},async(_input,q)=>response('back',q));
 assert.equal(first.action.type,'back');assert.ok(first.frontier);
 memory.commit(b.offer,first.frontier.targetId,first.frontier.focus);memory.executed(b.offer,first.choice);
 const back=observe('menu',['e1','e2']),next=await jevDecide({...state,screen:back.screen},back.offer.candidates,{preserveTransit:true,frontier:memory.frontier(back.offer)},async(_input,q)=>response('e1',q));
 assert.equal(next.choice,'e2');assert.equal(next.frontier?.mode,'continue');
 memory.executed(back.offer,next.choice);const reached=observe('answer',[]);
 assert.equal(memory.frontier(reached.offer).continuation,undefined);
});

test('image memory accepts a frame atomically once and uncertainty invalidates prior support',()=>{
 const memory=new ImageJudgmentMemory();memory.bind('料金を知りたい。時間を知りたい。');
 const source={id:'v1',step:1,sha256:'a'.repeat(64)},questions=memory.questions(source,[]);
 const answer=(q:any,choice:string)=>({choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,Number(k===choice)]))});
 const response={model:'TEST',answers:{image_check_0:answer(questions.image_check_0,'observed'),image_check_1:answer(questions.image_check_1,'observed')}};
 assert.throws(()=>memory.accept({...response,answers:{...response.answers,image_check_1:{choice:'invented',probabilities:{invented:1}}}},questions,source,[]));
 assert.ok(memory.view().requirements.every(r=>r.records.length===0));
 memory.accept(response,questions,source,[]);memory.accept(response,questions,source,[]);
 assert.deepEqual(memory.view().requirements.map(r=>r.records.length),[1,1]);assert.equal(memory.completionEvidence().supported,true);
 const next={id:'v2',step:2,sha256:'b'.repeat(64)},q2=memory.questions(next,[]);
 memory.accept({model:'TEST',answers:{image_check_0:answer(q2.image_check_0,'uncertain'),image_check_1:answer(q2.image_check_1,'not_shown')}},q2,next,[]);
 assert.equal(memory.completionEvidence().supported,false);assert.deepEqual(memory.completionEvidence().unresolved,['g1']);
 assert.throws(()=>memory.bind('Different goal'),/cannot change Goal/);
});

test('an interrupted image inference cannot commit judgments from the interrupted frame',async()=>{
 const original=globalThis.fetch,key=process.env.AI_GATEWAY_API_KEY;process.env.AI_GATEWAY_API_KEY='LOCAL_TEST_ONLY';
 globalThis.fetch=async()=>new Response('Unavailable',{status:503});
 const context=new VisualDecisionContext(undefined,true,true);
 try{
  context.capture(Buffer.from('image'),{step:1});
  await assert.rejects(()=>context.evaluate({goal:'条件を知りたい'}, {nextAction:{type:'choice',instructions:'Choose',criteria:{stuck:'stuck'}}},{maxAttempts:2,maxElapsedMs:1000,retryDelaysMs:[1],onProgress:async e=>{if(e.phase==='retry')throw new InferenceInterruption('OBSERVATION_CHANGED');}}),InferenceInterruption);
  assert.ok(context.snapshot().imageJudgments!.requirements.every(r=>r.records.length===0));
 }finally{await context.close();globalThis.fetch=original;if(key===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=key;}
});

test('image judgment memory is explicit and cannot enable DOM or OCR inputs',()=>{
 const args=['https://example.com','Goal','--reviewed','--vision'];
 assert.throws(()=>parsePublicOptions([...args,'--image-memory']),/image-memory.*image-only/);
 assert.equal(parsePublicOptions([...args,'--image-only','--image-memory']).imageMemory,true);
 assert.throws(()=>new VisualDecisionContext(undefined,false,true),/imageMemory.*imageOnly/);
});

test('image judgments survive later frames with provenance, remote route relevance and no old pixels or DOM',async()=>{
 const original=globalThis.fetch,key=process.env.AI_GATEWAY_API_KEY;process.env.AI_GATEWAY_API_KEY='LOCAL_TEST_ONLY';
 const requests:any[]=[];let phase=1;
 globalThis.fetch=async(_url,init)=>{
  const body=JSON.parse(String(init?.body));requests.push(body);
  assert.ok(body.questions.image_check_0,'the actual wire request must ask image-grounded questions');
  return Response.json({model:'TEST',answers:Object.fromEntries(Object.entries(body.questions).map(([id,q]:[string,any])=>{
   const choice=id==='image_check_0'?(phase===1?'observed':phase===3?'contradicted':'not_shown'):id==='image_check_1'?(phase===2?'observed':'not_shown'):id.startsWith('image_route_')?'promising':id==='nextAction'?'e1':'complete';
   return [id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,Number(k===choice)]))}];
  }))});
 };
 const context=new VisualDecisionContext(undefined,true,true),goal='料金を知りたい。受付時間を知りたい。';
 const question={nextAction:{type:'choice' as const,instructions:'DOM_SENTINEL',criteria:{e1:'DOM_SENTINEL',done:'done',stuck:'stuck'}}};
 const screen={title:'DOM_SENTINEL',text:['DOM_SENTINEL'],regions:[],elements:[],canScrollDown:false,canScrollUp:false,pageId:'DOM_SENTINEL'};
 try{
  for(phase=1;phase<=3;phase++){
   context.capture(Buffer.from(`image-${phase}`),{step:phase,url:'https://example.com/DOM_SENTINEL',pageId:`DOM_SENTINEL_${phase}`},screen,{targets:{f1:{label:'DOM_SENTINEL',pageTitle:'DOM_SENTINEL',pageId:'DOM_SENTINEL_1',kind:'click',travelSteps:phase===1?0:1,nextChoice:phase===1?'e1':'back'}}});
   await context.evaluate({goal,currentDate:'2026-10-18',screen,history:[{observedText:['DOM_SENTINEL']}]},question);
   if(phase===2)assert.equal(context.completionEvidence().supported,true);
  }
  const previous=requests[1].state.context.imageJudgments;
  assert.equal(previous.requirements[0].status,'observed');assert.equal(previous.requirements[1].status,'not_shown');
  const previousSource=previous.sources[previous.requirements[0].records[0].source.reference];
  assert.equal(previousSource.step,1);
  assert.match(previousSource.sha256,/^[a-f0-9]{64}$/);
  assert.equal(previous.routes[0].targetId,'f1');assert.equal(previous.routes[0].assessment,'promising');
  const snapshot=context.snapshot().imageJudgments!;
  assert.equal(snapshot.requirements[0].status,'contradicted');assert.equal(snapshot.requirements[1].status,'observed');
  assert.equal(context.completionEvidence().supported,false,'a later cancellation must invalidate earlier support');
  assert.equal(snapshot.routes[0].source.step,1,'offscreen target must not be reclassified from an unrelated current image');
  for(let i=0;i<requests.length;i++){
   const body=requests[i];assert.ok(!JSON.stringify(body.state).includes('DOM_SENTINEL'));assert.ok(!JSON.stringify(body.questions).includes('DOM_SENTINEL'));
   assert.equal(Object.keys(body.assets).length,1);assert.equal((Object.values(body.assets)[0] as any).data_base64,Buffer.from(`image-${i+1}`).toString('base64'));
  }
 }finally{await context.close();globalThis.fetch=original;if(key===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=key;}
});

test('an authorized transit scroll is not vetoed by a second context-poor frontier judgment',async()=>{
 const state:State={goal:'Find the answer',currentDate:'2026-10-18',history:[],screen:{title:'Page',text:[],elements:[],canScrollUp:true,canScrollDown:false}};
 const candidates={scroll_up:{label:'up',action:{type:'scroll' as const,direction:'up' as const}},stuck:{label:'stuck',action:{type:'stuck' as const}}};
 let calls=0;
 const result=await jevDecide(state,candidates,{preserveTransit:true,frontier:{targets:{f1:{label:'Previously visible clue',kind:'click',pageTitle:'Page',travelSteps:1,nextChoice:'scroll_up'}}}},async(_input,q)=>{
  calls++;const choice=calls===1?'scroll_up':'stuck';return {model:'TEST',answers:{nextAction:{choice,probabilities:Object.fromEntries(Object.keys(q.nextAction.criteria).map(k=>[k,Number(k===choice)]))}}};
 });
 assert.equal(result.action.type,'scroll');assert.equal(calls,1);assert.deepEqual(result.navigationTransit?.eligibleTargetIds,['f1']);
 assert.equal(result.frontier?.targetId,'f1','the preserved transit must commit a finite untried endpoint, not wander without a route');
 assert.equal(result.frontier?.selectionSource,'current-transit');
});

test('wire memory is the latest judgment state with its source while the full update log is preserved',()=>{
 const memory=new ImageJudgmentMemory();memory.bind('料金を知りたい');
 for(let i=1;i<=60;i++){
  const source={id:`v${i}`,step:i,sha256:'a'.repeat(64)},q=memory.questions(source,[]);
  const choice=i===60?'uncertain':'observed';
  memory.accept({model:'TEST',answers:{image_check_0:{choice,probabilities:Object.fromEntries(Object.keys(q.image_check_0.criteria).map(k=>[k,Number(k===choice)]))}}},q,source,[]);
 }
 assert.equal(memory.view().requirements[0].records.length,60);
 assert.equal(typeof memory.wireView,'function');
 const wire=memory.wireView();assert.equal(wire.requirements[0].records.length,1);
 assert.equal(wire.requirements[0].records[0].source.step,60);assert.equal(wire.requirements[0].status,'uncertain');
 assert.equal(wire.requirements[0].recordCount,60);assert.equal(memory.completionEvidence().supported,false);
});

test('a complete model response cannot bypass missing image evidence and keeps its raw verdict',async()=>{
 const state:State={goal:'Find both conditions',currentDate:'2026-10-18',history:[],screen:{title:'',text:[],elements:[],canScrollUp:false,canScrollDown:false}};
 const candidates={done:{label:'done',action:{type:'done' as const}},stuck:{label:'stuck',action:{type:'stuck' as const}}};
 const result=await jevDecide(state,candidates,{verifyCompletion:true,completionEvidence:()=>({supported:false,unresolved:['g2']})},async(_input,q)=>{
  const id=Object.keys(q)[0],choice=id==='completionCoverage'?'complete':Object.hasOwn(q.nextAction.criteria,'done')?'done':'stuck';
  return {model:'TEST',answers:{[id]:{choice,probabilities:Object.fromEntries(Object.keys(q[id].criteria).map(k=>[k,Number(k===choice)]))}}};
 });
 assert.equal(result.action.type,'stuck');assert.equal(result.completionCheck?.assessment,'complete');
 assert.deepEqual(result.completionCheck?.evidenceGuard,{supported:false,unresolved:['g2']});
});
