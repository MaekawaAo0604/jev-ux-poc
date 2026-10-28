import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {runHumanJev} from '../runner/human-jev-experiment.js';

test('human comparison runner leaves the action policy intact, passes no human/DOM data, and reviews only delivered frames',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'human-jev-runner-'));let actionCalls=0,reviewCalls=0;
 try{
  const saved=await runHumanJev({out:join(dir,'result'),mock:true},async request=>{
   if(request.questions.nextAction){
    actionCalls++;
    assert.equal(request.input.exploration && (request.input.exploration as any).persona,undefined);
    assert.equal((request.input.observation as any).screen,undefined);
    assert.equal((request.input.observation as any).width,1280);
    assert.equal((request.input.observation as any).height,900);
    assert.equal((request.input.userState as any).memory[0]?.visibleText?.length??0,0);
    assert.match(request.questions.nextAction.instructions,/Goal/);
   }else{
    reviewCalls++;
    assert.deepEqual(Object.keys(request.images),['o1']);
    const wire=JSON.stringify(request.input);
    assert.ok(!wire.includes('selfAttested')&&!wire.includes('reportedOutcome')&&!wire.includes('participant-feedback'));
   }
   return {model:'MOCK_SCRIPTED_FIXTURE',answers:Object.fromEntries(Object.entries(request.questions).map(([id,q])=>{
    const choice=id==='nextAction'?'done':id==='decisionBasis'?'goal':'none';
    assert.ok(choice in q.criteria);
    return [id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k===choice?1:0]))}];
   }))};
  });
  assert.equal(actionCalls,1);assert.equal(reviewCalls,1);
  const manifest=JSON.parse(await readFile(join(saved.root,'manifest.json'),'utf8'));
  assert.equal(manifest.mock,true);assert.equal(manifest.actualAPIRequests,0);
  assert.equal(manifest.charter.targetWebsite,'local:bad');
  assert.equal(manifest.humanInputsRead,false);
  const result=JSON.parse(await readFile(join(saved.root,'exploration/result.json'),'utf8'));
  assert.equal(result.perceivedDone,true);assert.equal(result.objectiveSuccess,false);
  assert.equal(result.config.deliberation,undefined);
  const review=JSON.parse(await readFile(join(saved.root,'review.json'),'utf8'));
  assert.equal(review.status,'OK');assert.equal(review.findings.length,3);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('live mode cannot bypass the durable approved phase ledger with an injected evaluator',async()=>{
 await assert.rejects(runHumanJev({out:'unused-human-jev',mock:false},async()=>{throw new Error('must not run');}),/MOCK_ONLY|PHASE_BUDGET_REQUIRED/);
});

 test('an existing output directory is refused without rewriting saved artifacts or consuming budget',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'human-jev-runner-'));const previous=process.env.AI_GATEWAY_API_KEY;
 try{
  process.env.AI_GATEWAY_API_KEY='test-never-dispatched';
  const out=join(dir,'existing'),budget=join(dir,'budget.json');await mkdir(out);
  const saved=join(out,'phase-budget-after.json');await writeFile(saved,'preserve original artifact');
  await writeFile(budget,JSON.stringify({schemaVersion:1,status:'APPROVED',phase:'test',newMaximum:13,perRunMaximum:12,used:0,attempts:[]}));
  await assert.rejects(runHumanJev({out,mock:false,phaseBudget:budget}),/EEXIST/);
  assert.equal(await readFile(saved,'utf8'),'preserve original artifact');
  assert.equal(JSON.parse(await readFile(budget,'utf8')).used,0);
 }finally{if(previous===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=previous;assert.ok(dir.startsWith(join(tmpdir(),'human-jev-runner-')));await rm(dir,{recursive:true,force:true});}
});
