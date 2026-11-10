import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {VisualDecisionContext} from '../jev/visual-context.js';
import {ImageJudgmentMemory} from '../jev/image-judgments.js';
import {parsePublicOptions} from '../runner/public-options.js';
import {jevDecide} from '../jev/decide.js';
import type {State} from '../jev/types.js';

const next={nextAction:{type:'choice' as const,instructions:'DOM_SENTINEL',criteria:{stuck:'stuck'}}};
const complete={completionCoverage:{type:'choice' as const,instructions:'DOM_SENTINEL',criteria:{complete:'yes',incomplete:'no',uncertain:'unknown'}}};
const goal='料金を知りたい。時間を知りたい。';
const digest=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');

for(const boundary of ['closed','open','uncertain','missing'] as const)test(`complete coverage cannot override a pending scroll with unclosed source evidence (${boundary})`,async()=>{
 const original=globalThis.fetch,key=process.env.AI_GATEWAY_API_KEY;process.env.AI_GATEWAY_API_KEY='LOCAL_TEST_ONLY';
 const requests:any[]=[];
 globalThis.fetch=async(_url,init)=>{
  const body=JSON.parse(String(init?.body));requests.push(body);
  return Response.json({model:'TEST',answers:Object.fromEntries(Object.entries(body.questions).flatMap(([id,q]:[string,any])=>{
   if(id==='completionBoundary'&&boundary==='missing')return [];
   const choice=id==='nextAction'?'scroll_down':id==='completionCoverage'?'complete':id==='completionBoundary'?boundary:'observed';
   return [[id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,Number(k===choice)]))}]];
  }))});
 };
 const context=new VisualDecisionContext(undefined,true,true,async()=>Buffer.from('PARTIAL_IMAGE'));
 const state:State={goal:'必要書類を確認したい。',currentDate:'2026-10-19',history:[],screen:{title:'DOM_SENTINEL',text:['DOM_SENTINEL'],elements:[],canScrollUp:false,canScrollDown:true}};
 const candidates={scroll_down:{label:'down',action:{type:'scroll' as const,direction:'down' as const}},done:{label:'done',action:{type:'done' as const}},stuck:{label:'stuck',action:{type:'stuck' as const}}};
 try{
  context.capture(Buffer.from('PARTIAL_IMAGE'),{step:1,file:'step-1.png'});
  const decide=()=>jevDecide(state,candidates,{verifyCompletion:true,completionEvidence:()=>context.completionEvidence()},(input,q)=>context.evaluate(input,q));
  if(boundary==='missing'){await assert.rejects(decide);assert.equal(context.completionEvidence().supported,false);return;}
  const result=await decide();
  assert.equal(result.action.type,boundary==='closed'?'done':'scroll');
  assert.equal(result.completionCheck?.assessment,'complete','retain the original coarse model verdict');
  assert.equal(result.completionCheck?.evidenceGuard?.supported,boundary==='closed');
  assert.equal(requests.length,3,'one isolated read, one action, and one completion including the boundary check');
  assert.ok(requests[2].questions.completionBoundary);
  assert.equal(Object.keys(requests[0].assets).length,1);
  assert.ok(!JSON.stringify(requests).includes('DOM_SENTINEL'));
  assert.equal(context.snapshot().requests.at(-1)?.answers?.completionCoverage.choice,'complete');
 }finally{await context.close();globalThis.fetch=original;if(key===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=key;}
});

test('completion source selection preserves not-shown support but never resurrects cancelled or uncertain evidence',()=>{
 const memory=new ImageJudgmentMemory();memory.bind(goal);
 const update=(step:number,choices:string[])=>{
  const source={id:`v${step}`,step,sha256:String(step).repeat(64)},q=memory.questions(source,[]);
  memory.accept({model:'TEST',answers:Object.fromEntries(Object.entries(q).map(([id,v],i)=>[id,{choice:choices[i],probabilities:Object.fromEntries(Object.keys(v.criteria).map(k=>[k,Number(k===choices[i])]))}]))},q,source,[]);
 };
 update(1,['observed','observed']);update(2,['not_shown','not_shown']);
 assert.deepEqual(memory.completionSources().map(s=>s.step),[1]);
 update(3,['contradicted','uncertain']);assert.deepEqual(memory.completionSources(),[]);
 update(4,['context','observed']);assert.deepEqual(memory.completionSources().map(s=>s.step),[4]);
});

test('proof flag requires image memory and does not alter the baseline',()=>{
 const args=['https://example.com','Goal','--reviewed','--vision','--image-only'];
 assert.throws(()=>parsePublicOptions([...args,'--image-memory-proof']),/image-memory-proof.*image-memory/);
 assert.equal(parsePublicOptions([...args,'--image-memory','--image-memory-proof']).imageMemoryProof,true);
 assert.equal(parsePublicOptions([...args,'--image-memory']).imageMemoryProof,undefined);
});

for(const failure of ['none','changed','missing','path'] as const)test(`completion alone loads effective sources, deduplicates current, and fails closed (${failure})`,async()=>{
 const original=globalThis.fetch,key=process.env.AI_GATEWAY_API_KEY;process.env.AI_GATEWAY_API_KEY='LOCAL_TEST_ONLY';
 const requests:any[]=[],loaded:string[]=[];let phase=1;
 globalThis.fetch=async(_url,init)=>{
  const body=JSON.parse(String(init?.body));requests.push(body);
  return Response.json({model:'TEST',answers:Object.fromEntries(Object.entries(body.questions).map(([id,q]:[string,any])=>{
   const choice=id==='image_check_0'?(phase===1?'observed':'not_shown'):id==='image_check_1'?(phase===2||phase===4?'observed':'not_shown'):id==='completionCoverage'?'complete':id==='completionBoundary'?'closed':'stuck';
   return [id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,Number(k===choice)]))}];
  }))});
 };
 const context=new VisualDecisionContext(undefined,true,true,async(file:string)=>{
  loaded.push(file);if(failure==='missing')throw new Error('PRIVATE_PATH');
  return Buffer.from(failure==='changed'?'changed':file==='step-1.png'?'image-1':'image-2');
 });
 const state={goal,screen:{title:'DOM_SENTINEL',text:['DOM_SENTINEL']},history:[]};
 try{
  for(phase=1;phase<=3;phase++){
   context.capture(Buffer.from(`image-${phase}`),{step:phase,pageId:`DOM_SENTINEL_${phase}`,url:'https://example.com/DOM_SENTINEL',file:failure==='path'&&phase===1?'../private.png':`step-${phase}.png`,sha256:'forged'});
   await context.evaluate(state,next);
  }
  assert.deepEqual(loaded,[],'action selection must not load old pixels');
  const beforeProof=requests.length;
  if(failure!=='none'){
   await assert.rejects(()=>context.evaluate(state,complete));
   assert.equal(requests.length,beforeProof,'invalid proof must not reach inference');
   const record=context.snapshot().requests.at(-1)!;assert.equal(record.status,'error');
   assert.ok(!JSON.stringify(record).includes('PRIVATE_PATH'));
   assert.equal(record.completionProof?.status,'error');return;
  }
  await context.evaluate(state,complete);
  assert.deepEqual(loaded,['step-1.png','step-2.png']);
  const proof=requests.at(-1),observations=proof.state.observations;
  assert.equal(Object.keys(proof.assets).length,3);
  assert.deepEqual(observations.map((s:any)=>s.id),['v3','v1','v2']);
  for(const observation of observations){
   const bytes=Buffer.from(proof.assets[observation.screenshot].data_base64,'base64');
   assert.equal(digest(bytes),observation.sha256);assert.match(observation.pageId,/^p\d+$/);
  }
  assert.equal(proof.state.context.imageJudgments.routes.length,0);
  const log=context.snapshot().requests.at(-1)!;
  assert.equal(log.completionProof?.status,'verified');assert.equal(log.completionProof?.imageCount,3);
  await context.evaluate(state,next);assert.equal(Object.keys(requests.at(-1).assets).length,1);
  phase=4;context.capture(Buffer.from('image-4'),{step:4,file:'step-4.png'});
  await context.evaluate(state,next);
  // Previously observed g1 still needs v1; g2 is now observed on current v4.
  globalThis.fetch=async(_url,init)=>{const body=JSON.parse(String(init?.body));requests.push(body);return Response.json({model:'TEST',answers:{completionCoverage:{choice:'incomplete',probabilities:{complete:0,incomplete:1,uncertain:0}},completionBoundary:{choice:'closed',probabilities:{closed:1,open:0,uncertain:0}}}});};
  await context.evaluate(state,complete);
  assert.equal(Object.keys(requests.at(-1).assets).length,2,'current evidence source must not be attached twice');
  assert.deepEqual(requests.at(-1).state.observations.map((s:any)=>s.id),['v4','v1']);
  assert.ok(requests.every(r=>!JSON.stringify(r.state).includes('DOM_SENTINEL')));
  assert.ok(requests.every(r=>!JSON.stringify(r.questions).includes('DOM_SENTINEL')));
  assert.ok(!JSON.stringify(proof.state).includes('step-1.png'));
 }finally{await context.close();globalThis.fetch=original;if(key===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=key;}
});
