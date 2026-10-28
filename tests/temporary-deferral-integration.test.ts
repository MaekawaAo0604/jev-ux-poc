import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {humanJevProfile} from '../runner/human-jev-profiles.js';import {runHumanJev} from '../runner/human-jev-experiment.js';import {replayDirectory} from '../runner/virtual-beta-replay.js';

test('deferral is an explicit policy-only option with unchanged images, model memory and request caps',()=>{
 const baseline=humanJevProfile('experience-basis'),treatment=humanJevProfile('experience-defer' as any);assert.deepEqual(treatment.config.deferral,{enabled:true,capacity:8,weight:0.01,minAlternativeProbability:0.01});const {id,deferral,...rest}=treatment.config,{id:old,...before}=baseline.config;assert.deepEqual(rest,before);assert.equal(treatment.maximumRequests,24);assert.equal(treatment.reviewMaximum,0);
});

test('closed grounded unproductive excursion lowers entry priority and actual operation follows the recorded corrected distribution',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'jev-deferral-'));let action=0;
 try{
 const saved=await runHumanJev({out:join(dir,'run'),mock:true,mode:'experience-defer' as any},async request=>{
  if(request.questions.nextAction)action++;assert.equal((request.input.userState as any).deferrals,undefined);assert.equal((request.input as any).deferral,undefined);assert.equal((request.input.observation as any).screen,undefined);
  return {model:'MOCK_SCRIPTED_FIXTURE',answers:Object.fromEntries(Object.entries(request.questions).map(([id,q])=>{
   const selected=id==='nextAction'?(action===3?'e3':action===5?'done':'e4'):id==='decisionBasis'?'goal':id==='knowledge'?'insufficient':id==='goal'?'unsatisfied':id==='goalEvidence'||id.startsWith('evidence_')||id==='experienceEvidence'?(request.input.observation as any).id:id.startsWith('effect_')?'advances':id==='experienceProgress'?'neutral':id==='experienceExpectation'?'not_supported':'none';
   const probabilities=id==='nextAction'&&action===4?Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k==='e4'?0.95:k==='e5'?0.04:k==='done'?0.01:0])):Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k===selected?1:0]));return [id,{choice:selected,probabilities}];
  }))};
 });
 assert.equal(action,5);const step=saved.result.steps[3];assert.equal(step.selection!.modelChoice,'e4');assert.equal(step.selection!.raw.e4,0.95);assert.equal(step.selection!.policy!.before.e4,0.95);assert.equal(step.selection!.policy!.weights.e4,0.01);assert.equal(step.selection!.selected,'e5');assert.deepEqual(step.action,{type:'click',elementId:'e5'});assert.equal(step.outcome,'UI_PERFORMED');assert.equal(step.deferral!.decision!.reason,'DEFER_WITH_ALTERNATIVES');assert.equal(step.deferral!.state.entries[0].candidateId,'e4');assert.ok(step.selection!.filtered.e4>0);
 assert.ok(saved.result.steps[4].audit!.url.endsWith('#other'));assert.equal(saved.result.objectiveSuccess,false);assert.equal(saved.result.perceivedDone,true);assert.equal(saved.result.apiCalls,10);assert.equal(saved.review.reason,'PROFILE_DISABLED');assert.equal((await replayDirectory(join(saved.root,'exploration'))).choices,5);
 const file=join(saved.root,'exploration/result.json'),r=JSON.parse(await readFile(file,'utf8'));r.steps[3].deferral.decision.weights.e4=1;await writeFile(file,JSON.stringify(r));await assert.rejects(replayDirectory(join(saved.root,'exploration')),/DEFERRAL/);
 }finally{assert.ok(dir.startsWith(join(tmpdir(),'jev-deferral-')));await rm(dir,{recursive:true,force:true});}
});
