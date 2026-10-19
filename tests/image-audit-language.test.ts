import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {PNG} from 'pngjs';
import {captureVisualObservation,recordVisualCompletion,type VisualEvaluator} from '../runner/visual-evidence.js';
import {recordGoalOutcome} from '../runner/goal-outcome.js';
import {ImageJudgmentMemory} from '../jev/image-judgments.js';

test('post-run image audit and item-outcome requests use English guidance without translating Japanese Goal or altering evidence',async()=>{
 const goal='料金を知りたい。予約はしない。',fragments=['料金を知りたい','予約はしない'];
 const dir=await mkdtemp(join(tmpdir(),'jev-audit-language-')),bytes=PNG.sync.write(new PNG({width:2,height:2}));
 await writeFile(join(dir,'step-1.png'),bytes);await writeFile(join(dir,'final.png'),bytes);
 const source=captureVisualObservation(bytes,1,'step-1.png','http://local.test/'),final=captureVisualObservation(bytes,2,'final.png','http://local.test/');
 const memory=new ImageJudgmentMemory();memory.bind(goal);
 const q=memory.questions({id:'v1',step:1,sha256:source.sha256},[]);
 memory.accept({model:'TEST',answers:Object.fromEntries(Object.entries(q).map(([id,v])=>{const choice=id==='image_check_0'?'observed':'context';return [id,{choice,probabilities:Object.fromEntries(Object.keys(v.criteria).map(k=>[k,Number(k===choice)]))}];}))},q,{id:'v1',step:1,sha256:source.sha256},[]);
 const requests:{state:any;questions:any;images:any}[]=[];
 const evaluate:VisualEvaluator=async(state,questions,images)=>{
  requests.push({state,questions,images});
  return {model:'TEST',answers:Object.fromEntries(Object.entries(questions).map(([id,v])=>{
   const choice=id==='readability'?'readable':id==='relevance'?'related':id==='completion'?'supported':id==='item_0'?'confirmed':id==='item_1'?'context':id.startsWith('evidence_1_')?'none':'relevant';
   assert.ok(Object.hasOwn(v.criteria,choice));return [id,{choice,probabilities:Object.fromEntries(Object.keys(v.criteria).map(k=>[k,Number(k===choice)]))}];
  }))};
 };
 const audit=await recordVisualCompletion(goal,'2026-10-19',dir,[source,final],evaluate);
 const outcome=await recordGoalOutcome(goal,'2026-10-19',dir,[{number:1,screenshot:'step-1.png',visualObservation:source,visualContext:{imageJudgments:memory.view()}}],final,evaluate);
 assert.equal(audit.status,'RECORDED');assert.equal(audit.objectiveVerified,false);assert.equal(outcome.status,'RECORDED');assert.equal(outcome.objectiveVerified,false);
 assert.deepEqual(outcome.items.map(i=>i.text),fragments);assert.deepEqual(audit.evidence.map(o=>o.id),['v1','final']);
 assert.equal(requests.length,4);
 for(const request of requests){
  assert.equal(request.state.goal,goal);
  for(const observation of request.state.observations)assert.deepEqual(Buffer.from(request.images[observation.screenshot].data,'base64'),bytes);
  for(const v of Object.values(request.questions) as {instructions:string;criteria:Record<string,string>}[]){
   const guidance=fragments.reduce((s,fragment)=>s.replaceAll(fragment,'[ORIGINAL_GOAL]'),v.instructions);
   assert.doesNotMatch(guidance,/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u);
   for(const description of Object.values(v.criteria))assert.doesNotMatch(description,/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u);
  }
 }
});
