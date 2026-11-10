import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {captureVisualObservation,recordVisualCompletion,type VisualEvaluator} from '../runner/visual-evidence.js';
import {ChoiceRequestError,type ChoiceQuestion} from '../jev/client.js';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
function answer(questions:Record<string,ChoiceQuestion>,choices:Record<string,string>){return {model:'TEST',answers:Object.fromEntries(Object.entries(questions).map(([id,q])=>{const choice=choices[id]??'irrelevant';return [id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k===choice?1:0]))}];}))};}
async function fixture(count:number,run:(dir:string,observations:ReturnType<typeof captureVisualObservation>[])=>Promise<void>){
 const dir=await mkdtemp(join(tmpdir(),'jev-visual-evidence-'));
 try{
  const observations=[];
  for(let step=1;step<=count;step++){const file=`step-${step}.png`;await writeFile(join(dir,file),png);observations.push(captureVisualObservation(png,step,file,'http://local.test/'));}
  await run(dir,observations);
 }finally{await rm(dir,{recursive:true,force:true});}
}

test('visual audit preserves early evidence and the final screen without receiving oracle or exploration conclusions',async()=>{
 await fixture(3,async(dir,observations)=>{
  const calls:any[]=[];
  const evaluate:VisualEvaluator=async(state,questions,images)=>{
   calls.push({state,questions,images});
   assert.doesNotMatch(JSON.stringify(state),/objectiveSuccess|perceivedSuccess|SUCCESS|STUCK/);
   if('relevance' in questions)return answer(questions,{readability:'readable',relevance:state.observations[0].id==='v1'?'related':'unrelated'});
   assert.deepEqual(state.observations.map((o:any)=>o.id),['v1','v3']);
   assert.equal(Object.keys(images).length,2);
   return answer(questions,{completion:'supported',evidence_v1:'relevant',evidence_v3:'irrelevant'});
  };
  const result=await recordVisualCompletion('料金を知りたい','2026-10-16',dir,observations,evaluate);
  assert.equal(result.assessment,'supported');assert.equal(result.objectiveVerified,false);
  assert.deepEqual(result.evidence.map(e=>e.id),['v1']);assert.equal(result.screens.length,3);assert.equal(calls.length,4);
  assert.equal(result.evidence[0].sha256,observations[0].sha256);
 });
});

test('clear negative observations remain insufficient, rather than being repaired into success',async()=>{
 await fixture(1,async(dir,observations)=>{
  const result=await recordVisualCompletion('停止したい','2026-10-16',dir,observations,async(_state,q)=>answer(q,'relevance' in q?{readability:'readable',relevance:'related'}:{completion:'insufficient',evidence_v1:'irrelevant'}));
  assert.equal(result.status,'RECORDED');assert.equal(result.assessment,'insufficient');assert.deepEqual(result.evidence,[]);
 });
});

test('unreadable observations or unsupported positive answers cannot become supported',async()=>{
 for(const unreadable of [false,true])await fixture(1,async(dir,observations)=>{
  const result=await recordVisualCompletion('停止したい','2026-10-16',dir,observations,async(_state,q)=>answer(q,'relevance' in q?{readability:unreadable?'unreadable':'readable',relevance:'related'}:{completion:'supported',evidence_v1:unreadable?'relevant':'irrelevant'}));
  assert.equal(result.assessment,'uncertain');assert.ok(result.warnings.length>0);
 });
});

test('missing or changed images are observation errors, never a negative UX verdict',async()=>{
 for(const missing of [false,true])await fixture(1,async(dir,observations)=>{
  if(missing)await rm(join(dir,observations[0].file));else await writeFile(join(dir,observations[0].file),Buffer.concat([png,Buffer.from('changed')]));
  let calls=0;
  const result=await recordVisualCompletion('goal','2026-10-16',dir,observations,async()=>{calls++;throw new Error('Unexpected API call');});
  assert.equal(calls,0);assert.equal(result.status,'ERROR');assert.equal(result.assessment,'uncertain');
  assert.equal(result.error?.code,missing?'SOURCE_MISSING':'SOURCE_CHANGED');
 });
});

test('a later API error preserves prior screen judgments but does not claim goal absence or success',async()=>{
 await fixture(2,async(dir,observations)=>{
  let calls=0;
  const result=await recordVisualCompletion('goal','2026-10-16',dir,observations,async(_state,q)=>{if(++calls===2)throw new ChoiceRequestError({code:'HTTP_ERROR',statusCode:503});return answer(q,{readability:'readable',relevance:'related'});});
  assert.equal(result.status,'ERROR');assert.equal(result.assessment,'uncertain');assert.equal(result.screens.length,1);assert.equal(result.error?.statusCode,503);
 });
});
