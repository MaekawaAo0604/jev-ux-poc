import test from 'node:test';
import assert from 'node:assert/strict';
import {humanJevProfile} from '../runner/human-jev-profiles.js';
import {validateConfig} from '../jev/virtual-beta/config.js';
test('excursion admission mode isolates the evidence separation from all other settings',()=>{
 const legacy=humanJevProfile('experience-reason'),next=humanJevProfile('experience-reason-excursion' as any);
 assert.equal((next.config.deferralReason as any).basisAdmission,'excursion-evidence');
 const {id:_id,deferralReason,...rest}=next.config,{id:_old,deferralReason:oldReason,...oldRest}=legacy.config;
 assert.deepEqual(rest,oldRest);const {basisAdmission:_mode,...reason}=deferralReason as any;assert.deepEqual(reason,oldReason);
 assert.equal(legacy.config.deferralReason!.maxReasonImages,1);assert.equal(next.maximumRequests,24);
});
test('unknown evidence admission modes fail closed while absent legacy mode remains supported',()=>{
 const legacy=humanJevProfile('experience-reason').config;
 assert.throws(()=>validateConfig({...legacy,deferralReason:{...legacy.deferralReason!,basisAdmission:'accept-anything'} as any}),/INVALID_DEFERRAL_REASON_CONFIG/);
 assert.doesNotThrow(()=>validateConfig(legacy));
});
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {runHumanJev} from '../runner/human-jev-experiment.js';
import {replayDirectory} from '../runner/virtual-beta-replay.js';
test('separate excursion blocker from home-only negative judgment, execute review outcome, replay provenance',async()=>{
 const root='reports/deferral-admission-2026-10-29/integration-'+Date.now();await mkdir(root,{recursive:true});
 for(const condition of ['legacy','changed','still'] as const){
  const mode=condition==='legacy'?'experience-reason':'experience-reason-excursion';
  const saved=await runHumanJev({out:root+'/'+condition,mock:true,mode,longContext:true,holdoutFixture:{task:'revisit',variant:'alpha'}},async req=>{
   const n=Number((req.input.observation as any).id.slice(1)),action=['','e2','e1','e3','e2','e1','e2','e2','done'][n];
   if(n===6&&condition!=='legacy'){assert.deepEqual((req.input.reasonObservations as any[]).map(s=>s.observationId),['o2']);assert.ok(Object.keys(req.images).length<=4);}
   return {model:'MOCK_SCRIPTED_FIXTURE',answers:Object.fromEntries(Object.entries(req.questions).map(([id,q])=>{
    const choice=id==='nextAction'?action:id==='decisionBasis'?'goal':id==='knowledge'?'sufficient':id==='goal'?(n===8?'satisfied':'unsatisfied'):id==='goalEvidence'||id.startsWith('evidence_')||id==='experienceEvidence'?'o'+n:id.startsWith('effect_')?'advances':id==='experienceProgress'?(n===5?'advances':n===2?'unknown':'neutral'):id==='experienceExpectation'?'supported':id==='reasonCaptureCategory'?'prerequisite':id==='reasonCaptureEvidence'?(Object.hasOwn(q.criteria,'o2')?'o2':'none'):id.startsWith('reasonReview')&&id.endsWith('Status')?(condition==='still'?'still_blocks':'basis_changed'):id.startsWith('reasonReview')&&id.endsWith('Evidence')?'o5':'none';
    assert.ok(Object.hasOwn(q.criteria,choice),id+':'+choice);
    return [id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,id==='nextAction'&&n===6?(k==='e2'?.97:k==='e3'?.02:k==='stuck'?.01:0):k===choice?1:0]))}];
   }))};
  });
  const capture=saved.result.steps[2],review=saved.result.steps[5];
  assert.deepEqual(capture.deferral!.state.entries[0].evidence.map(s=>s.observationId),['o3']);
  assert.equal(capture.deferralReason!.record.capture!.admitted,condition!=='legacy');
  if(condition!=='legacy'){
   const p=capture.deferralReason!.record.capture!.captureProvenance!;
   assert.equal(p.kind,'excursion-evidence');assert.deepEqual(p.negativeEvidence.map(s=>s.observationId),['o3']);assert.deepEqual(p.excursionEvidence.map(s=>s.observationId),['o2']);
   assert.equal(capture.deferralReason!.memory.entries[0].basis.observationId,'o2');
  }
  assert.equal(review.selection!.selected,condition==='changed'?'e2':'e3');
  if(condition==='changed'){assert.equal(saved.result.objectiveAssessment.value,true);assert.equal(saved.result.uiActions,7);assert.deepEqual(review.deferralReason!.record.releasedCandidates,['e2']);}
  const dir=root+'/'+condition+'/exploration';assert.equal((await replayDirectory(dir)).verified,true);
  if(condition==='changed'){
   const path=dir+'/result.json',original=await readFile(path,'utf8'),modified=JSON.parse(original);
   modified.steps[2].deferralReason.memory.entries[0].captureProvenance.negativeEvidence[0].observationId='o2';await writeFile(path,JSON.stringify(modified));
   try{await assert.rejects(replayDirectory(dir),/REASON_RECORD_MISMATCH/);}finally{await writeFile(path,original);}
  }
 }
});
