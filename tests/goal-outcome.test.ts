import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {captureVisualObservation,type VisualEvaluator} from '../runner/visual-evidence.js';
import {ChoiceRequestError} from '../jev/client.js';
import {recordGoalOutcome} from '../runner/goal-outcome.js';
import {ImageJudgmentMemory} from '../jev/image-judgments.js';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
async function fixture(run:(dir:string,steps:any[],final:any)=>Promise<void>){
 const dir=await mkdtemp(join(tmpdir(),'jev-outcome-'));
 try{
  const steps:any[]=[];
  for(let n=1;n<=3;n++){
   const observation=captureVisualObservation(png,n,`step-${n}.png`,'https://private.test/secret');
   await writeFile(join(dir,observation.file),png);
   steps.push({number:n,screenshot:observation.file,visualObservation:observation});
  }
  steps[2].visualContext={imageJudgments:{requirements:[{id:'g1',text:'料金を知りたい',status:'observed',records:[{assessment:'observed',source:{id:'v1',step:1,sha256:steps[0].visualObservation.sha256},model:'TEST'}]},{id:'g2',text:'土日も利用できるか知りたい',status:'not_shown',records:[{assessment:'not_shown',source:{id:'v3',step:3,sha256:steps[2].visualObservation.sha256},model:'TEST'}]}]}};
  const final=captureVisualObservation(png,4,'final.png','https://private.test/secret');await writeFile(join(dir,'final.png'),png);
  await run(dir,steps,final);
 }finally{await rm(dir,{recursive:true,force:true});}
}
function evaluator(statuses:string[],evidence=true):VisualEvaluator{return async(_input,questions)=>({model:'TEST',answers:Object.fromEntries(Object.entries(questions).map(([id,q])=>{const choice=id.startsWith('item_')?statuses[Number(id.split('_')[1])]:evidence?'relevant':'none';return [id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,Number(k===choice)]))}];}))});}
async function implementation(){return recordGoalOutcome;}

test('outcome audit separates conditional answers and sends selected pixels without verdicts or private DOM',async()=>{
 const record=await implementation();
 await fixture(async(dir,steps,final)=>{
  let calls=0;const evaluate:VisualEvaluator=async(input,q,images)=>{
   calls++;assert.deepEqual(input.observations.map(o=>o.id),['v1','v3','final']);assert.equal(Object.keys(images).length,3);
   assert.doesNotMatch(JSON.stringify(input),/secret|private\.test|STUCK|observed|not_shown|objectiveSuccess/);
   return evaluator(['confirmed','conditional'])(input,q,images);
  };
  const result=await record('料金を知りたい。土日も利用できるか知りたい。','2026-10-19',dir,steps,final,evaluate);
  assert.equal(calls,1);assert.equal(result.status,'RECORDED');assert.equal(result.objectiveVerified,false);
  assert.deepEqual(result.items.map((r:any)=>r.status),['confirmed','conditional']);assert.ok(result.items.every((r:any)=>r.evidence.length===3));
  assert.equal(result.items[0].text,'料金を知りたい');assert.equal(result.coverage,'selected-images-only');
 });
});
test('positive classifications without selected evidence remain unconfirmed',async()=>{
 const record=await implementation();await fixture(async(dir,steps,final)=>{
  const result=await record('料金を知りたい。土日も利用できるか知りたい。','',dir,steps,final,evaluator(['confirmed','conditional'],false));
  assert.deepEqual(result.items.map((r:any)=>r.status),['unconfirmed','unconfirmed']);assert.ok(result.warnings.includes('MISSING_ITEM_EVIDENCE'));
 });
});
test('unreadable evidence is not flattened into missing information',async()=>{
 const record=await implementation();await fixture(async(dir,steps,final)=>{
  const evaluate:VisualEvaluator=async(input,q,images)=>{
   const body=await evaluator(['confirmed','conditional'],false)(input,q,images);
   for(const id of Object.keys(q))if(id.startsWith('evidence_'))body.answers[id]={choice:'uncertain',probabilities:{relevant:0,none:0,uncertain:1}};
   return body;
  };
  const result=await record('料金を知りたい。土日も利用できるか知りたい。','',dir,steps,final,evaluate);
  assert.deepEqual(result.items.map(i=>i.status),['unreadable','unreadable']);
 });
});
test('changed source or forged ledger binding fails before any model request',async()=>{
 const record=await implementation();
 for(const mode of ['bytes','binding'])await fixture(async(dir,steps,final)=>{
  if(mode==='bytes')await writeFile(join(dir,'step-1.png'),Buffer.concat([png,Buffer.from('changed')]));
  else steps[2].visualContext.imageJudgments.requirements[0].records[0].source.sha256='f'.repeat(64);
  let calls=0;const result=await record('料金を知りたい。土日も利用できるか知りたい。','',dir,steps,final,async()=>{calls++;throw Error('unexpected');});
  assert.equal(calls,0);assert.equal(result.status,'ERROR');assert.deepEqual(result.items,[]);assert.equal(result.error?.code,mode==='bytes'?'SOURCE_CHANGED':'INVALID_SOURCE');
 });
});
test('API errors and malformed responses never become a site failure',async()=>{
 const record=await implementation();
 for(const failure of [true,false])await fixture(async(dir,steps,final)=>{
  const result=await record('料金を知りたい。土日も利用できるか知りたい。','',dir,steps,final,async()=>{
   if(failure)throw new ChoiceRequestError({code:'HTTP_ERROR',statusCode:400});return {model:'TEST',answers:{}};
  });
  assert.equal(result.status,'ERROR');assert.deepEqual(result.items,[]);assert.equal(result.error?.code,failure?'HTTP_ERROR':'INVALID_RESPONSE');
 });
});
test('report item splitting preserves thousands separators even when the exploration ledger split them',async()=>{
 await fixture(async(dir,steps,final)=>{
  const goal='土日に1日1,500円以内で利用できるプランを探したい。申し込みはしない。';
  const memory=new ImageJudgmentMemory();memory.bind(goal);const view=memory.view();
  for(const r of view.requirements){r.status='observed';r.records=[{assessment:'observed',source:{id:'v1',step:1,sha256:steps[0].visualObservation.sha256},model:'TEST'}];}
  steps[2].visualContext.imageJudgments=view;
  const result=await recordGoalOutcome(goal,'',dir,steps,final,evaluator(['confirmed','context']));
  assert.equal(result.status,'RECORDED');
  assert.deepEqual(result.items.map(i=>i.text),['土日に1日1,500円以内で利用できるプランを探したい','申し込みはしない']);
 });
});
