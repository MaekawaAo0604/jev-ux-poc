import test from 'node:test';
import assert from 'node:assert/strict';
import {humanJevProfile} from '../runner/human-jev-profiles.js';
import {validateConfig} from '../jev/virtual-beta/config.js';
test('reason mode is opt-in and keeps the old deferral and run limits',()=>{
 const old=humanJevProfile('experience-defer'),next=humanJevProfile('experience-reason');
 assert.deepEqual(next.config.deferralReason,{enabled:true,capacity:8,maxReasonImages:1});
 assert.equal(old.config.deferralReason,undefined);
 const {id:_id,deferralReason:_r,...rest}=next.config;const {id:_old,...before}=old.config;
 assert.deepEqual(rest,before);assert.equal(next.maximumRequests,24);assert.equal(next.reviewMaximum,0);
});
test('reason config cannot run without grounded experience and deferral or unbounded images',()=>{
 for(const change of [{deferral:undefined},{deferral:{...humanJevProfile('experience-defer').config.deferral!,enabled:false}},{deferralReason:{enabled:true,capacity:9,maxReasonImages:1}},{deferralReason:{enabled:true,capacity:8,maxReasonImages:2}}])assert.throws(()=>validateConfig({...humanJevProfile('experience-reason').config,...change}));
});
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {runHumanJev} from '../runner/human-jev-experiment.js';
import {replayDirectory} from '../runner/virtual-beta-replay.js';
test('scripted grounded basis change restores the model proposed necessary revisit and replays with tamper detection',async()=>{
 const out='reports/deferral-reason-2026-10-28/integration-'+Date.now();await mkdir('reports/deferral-reason-2026-10-28',{recursive:true});
 const saved=await runHumanJev({out,mock:true,mode:'experience-reason',longContext:true,holdoutFixture:{task:'revisit',variant:'alpha'}},async req=>{
  const n=Number((req.input.observation as any).id.slice(1));
  const action=['','e2','e1','e3','e2','e1','e2','e2','done'][n];
  if(n===6){assert.deepEqual((req.input.reasonObservations as any[]).map(s=>s.observationId),['o2']);assert.ok(Object.keys(req.images).length<=4);}
  return {model:'MOCK_SCRIPTED_FIXTURE',answers:Object.fromEntries(Object.entries(req.questions).map(([id,q])=>{
   let choice=id==='nextAction'?action:id==='decisionBasis'?'goal':id==='knowledge'?'sufficient':id==='goal'?(n===8?'satisfied':'unsatisfied'):id==='goalEvidence'||id.startsWith('evidence_')||id==='experienceEvidence'?'o'+n:id.startsWith('effect_')?'advances':id==='experienceProgress'?(n===5?'advances':'neutral'):id==='experienceExpectation'?'not_supported':id==='reasonCaptureCategory'?'prerequisite':id==='reasonCaptureEvidence'?(Object.hasOwn(q.criteria,'o2')?'o2':'none'):id.startsWith('reasonReview')&&id.endsWith('Status')?'basis_changed':id.startsWith('reasonReview')&&id.endsWith('Evidence')?'o5':'none';
   assert.ok(Object.hasOwn(q.criteria,choice),id+':'+choice);
   return [id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,id==='nextAction'&&n===6?(k==='e2'?.97:k==='e3'?.02:k==='stuck'?.01:0):k===choice?1:0]))}];
  }))};
 });
 assert.equal(saved.result.objectiveAssessment.value,true);assert.equal(saved.result.uiActions,7);assert.equal(saved.result.decisions,8);
 const revisit=saved.result.steps[5];assert.equal(revisit.selection!.selected,'e2');assert.equal(revisit.selection!.raw.e2,.97);assert.equal(revisit.deferral!.state.entries.some(e=>e.candidateId==='e2'),true);assert.equal(revisit.deferralReason!.effectiveState.entries.some(e=>e.candidateId==='e2'),false);assert.deepEqual(revisit.deferralReason!.record.releasedCandidates,['e2']);
 assert.equal((await replayDirectory(out+'/exploration')).verified,true);
 const path=out+'/exploration/result.json',original=await readFile(path,'utf8'),tampered=JSON.parse(original);tampered.steps[5].deferralReason.record.reviews[0].newEvidence.observationId='o2';await writeFile(path,JSON.stringify(tampered));
 try{await assert.rejects(replayDirectory(out+'/exploration'),/REASON/);}finally{await writeFile(path,original);}
});
