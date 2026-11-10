import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {runHumanJev} from '../runner/human-jev-experiment.js';
import {holdoutDefinition} from '../app/holdout-fixture.js';
import {replayDirectory} from '../runner/virtual-beta-replay.js';

test('holdout opt-in uses fresh local fixture and oracle without exposing experimental assignment or reference path',async()=>{
 const fixture={task:'direct' as const,variant:'alpha' as const};
 const out='reports/holdout-stability-2026-10-28/parent-test-'+Date.now();
 await mkdir('reports/holdout-stability-2026-10-28',{recursive:true});
 const requests:any[]=[];
 const saved=await runHumanJev({out,mock:true,mode:'experience-defer',longContext:true,holdoutFixture:fixture},async request=>{
  requests.push(request);
  assert.equal(request.input.goal,holdoutDefinition(fixture).goal);
  assert.equal((request.input.exploration as any).charter.targetWebsite,'local:demo');
  for(const key of ['holdout','holdoutFixture','referencePath','oracle','fixture'])assert.equal(request.input[key],undefined);
  const text=JSON.stringify(request.input);
  assert.ok(!text.includes('data-holdout-action'));
  assert.ok(!text.includes('holdout='));
  assert.ok(!text.includes('MOCK_SCRIPTED'));
  return {model:'MOCK_SCRIPTED_FIXTURE',answers:Object.fromEntries(Object.entries(request.questions).map(([id,q])=>{
   const choice=id==='nextAction'?'done':id==='decisionBasis'?'goal':id==='knowledge'?'insufficient':id==='goal'?'unsatisfied':id.startsWith('effect_')?'unknown':id==='experienceProgress'||id==='experienceExpectation'?'unknown':'none';
   return [id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k===choice?1:0]))}];
  }))};
 });
 assert.equal(requests.length,2);
 assert.ok(saved.result.steps[0].audit!.screen.text.join(' ').includes(holdoutDefinition(fixture).title),'actual rendered fixture heading must exist');
 assert.equal(saved.result.objectiveSuccess,false);
 assert.equal(saved.result.perceivedDone,true);
 assert.equal(saved.result.termination,'SUBJECTIVE_DONE');
 assert.equal(saved.result.holdout?.fixture.task,'direct');
 assert.equal(saved.result.holdout?.fixture.variant,'alpha');
 assert.ok(saved.result.steps[0].audit?.url.includes('holdout='));
 assert.equal(saved.result.steps[0].modelInput?.observation && (saved.result.steps[0].modelInput.observation as any).screen,undefined);
 assert.equal((await replayDirectory(out+'/exploration')).verified,true);
 const manifest=JSON.parse(await readFile(out+'/manifest.json','utf8'));
 assert.deepEqual(manifest.holdoutFixture,fixture);
 assert.equal(manifest.actualAPIRequests,0);
});

test('phase deadline admits no model request or UI action and remains a cutoff',async()=>{
 const out='reports/holdout-stability-2026-10-28/deadline-test-'+Date.now();let calls=0;
 const saved=await runHumanJev({out,mock:true,mode:'experience-defer',longContext:true,holdoutFixture:{task:'direct',variant:'beta'},deadlineEpochMs:Date.now()-1},async()=>{calls++;throw new Error('NO_MODEL_REQUEST_ALLOWED');});
 assert.equal(calls,0);assert.equal(saved.result.apiCalls,0);assert.equal(saved.result.uiActions,0);assert.equal(saved.result.termination,'TIME_LIMIT');assert.equal(saved.result.perceivedDone,false);
});
