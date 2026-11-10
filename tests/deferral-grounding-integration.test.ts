import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {runHumanJev} from '../runner/human-jev-experiment.js';
import {replayDirectory} from '../runner/virtual-beta-replay.js';
import {sha} from '../runner/virtual-beta-core.js';
test('grounded review binds actually attached evidence to release and real revisit, with legacy and nonrelease controls',async()=>{
 const root='reports/deferral-grounding-2026-10-29/integration-'+Date.now();await mkdir(root,{recursive:true});
 for(const condition of ['changed','still','unknown','separate-none'] as const){
  const changed=condition==='changed',grounded=condition!=='separate-none';let reviewRequests=0;const failures:string[]=[];
  const check=(fn:()=>void)=>{try{fn();}catch(error){failures.push(String(error));}};
  const saved=await runHumanJev({out:root+'/'+condition,mock:true,mode:grounded?'experience-reason-grounded':'experience-reason-excursion',longContext:true,holdoutFixture:{task:'revisit',variant:'alpha'}},async req=>{
   const n=Number((req.input.observation as any).id.slice(1)),action=!changed&&n>=7?'done':['','e2','e1','e3','e2','e1','e2','e2','done'][n];
   if(n===6&&Object.keys(req.questions).some(k=>k.startsWith('reasonReview'))){reviewRequests++;check(()=>{
    assert.deepEqual((req.input.reasonObservations as any[]).map(s=>s.observationId),['o2']);assert.ok(Object.keys(req.images).length<=4);
    for(const ref of [...req.input.memoryObservations as any[],...req.input.reasonObservations as any[]])assert.equal(sha(Buffer.from(req.images[ref.image].data,'base64')),ref.imageSha256);
    if(grounded){assert.ok(req.questions.reasonReview0Grounded);assert.equal(req.questions.reasonReview0Status,undefined);assert.equal(req.questions.reasonReview0Evidence,undefined);assert.ok(Object.hasOwn(req.questions.reasonReview0Grounded.criteria,'changed_o5'));assert.ok(!Object.hasOwn(req.questions.reasonReview0Grounded.criteria,'changed_o2'));}
    else{assert.ok(req.questions.reasonReview0Status);assert.ok(req.questions.reasonReview0Evidence);assert.equal(req.questions.reasonReview0Grounded,undefined);}
   });}
   return {model:'MOCK_SCRIPTED_FIXTURE',answers:Object.fromEntries(Object.entries(req.questions).map(([id,q])=>{
    const choice=id==='nextAction'?action:id==='decisionBasis'?'goal':id==='knowledge'?'sufficient':id==='goal'?(n===8?'satisfied':'unsatisfied'):id==='goalEvidence'||id.startsWith('evidence_')||id==='experienceEvidence'?'o'+n:id.startsWith('effect_')?'advances':id==='experienceProgress'?(n===5?'advances':n===2?'unknown':'neutral'):id==='experienceExpectation'?'supported':id==='reasonCaptureCategory'?'prerequisite':id==='reasonCaptureEvidence'?(Object.hasOwn(q.criteria,'o2')?'o2':'none'):id.startsWith('reasonReview')&&id.endsWith('Grounded')?(changed?'changed_o5':condition==='still'?'still_blocks':'unknown'):id.startsWith('reasonReview')&&id.endsWith('Status')?'basis_changed':id.startsWith('reasonReview')&&id.endsWith('Evidence')?'none':'none';
    check(()=>assert.ok(Object.hasOwn(q.criteria,choice),id+':'+choice));
    return [id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,id==='nextAction'&&n===6?(k==='e2'?.97:k==='e3'?.02:k==='stuck'?.01:0):k===choice?1:0]))}];
   }))};
  });
  assert.deepEqual(failures,[]);assert.equal(reviewRequests,1);assert.equal(saved.result.termination,'SUBJECTIVE_DONE');
  const review=saved.result.steps[5],record=review.deferralReason!.record;
  assert.equal(review.selection!.raw.e2,.97);assert.equal(review.selection!.selected,changed?'e2':'e3');assert.equal(record.reviews[0].released,changed);
  assert.equal(saved.result.objectiveAssessment.value,changed);assert.equal(saved.result.uiActions,changed?7:6);assert.equal(saved.result.apiCalls,saved.result.decisions*2);
  assert.equal(review.deferral!.state.entries.some(e=>e.candidateId==='e2'),true);assert.equal(review.deferralReason!.effectiveState.entries.some(e=>e.candidateId==='e2'),!changed);
  if(changed){assert.equal(record.rawChoices.reasonReview0Grounded.choice,'changed_o5');assert.equal(record.reviews[0].status,'basis_changed');assert.equal(record.reviews[0].newEvidence!.observationId,'o5');assert.deepEqual(record.releasedCandidates,['e2']);}
  else if(grounded)assert.equal(record.reviews[0].status,condition==='still'?'still_blocks':'unknown');
  else assert.ok(record.adjustments.includes('REVIEW_0_NO_ADMITTED_NEW_EVIDENCE'));
  const dir=root+'/'+condition+'/exploration';assert.equal((await replayDirectory(dir)).verified,true);
  if(changed){const file=dir+'/result.json',original=await readFile(file,'utf8');
   for(const change of [(r:any)=>{r.config.deferralReason.reviewMode='separate';},(r:any)=>{r.steps[5].deferralReason.record.rawChoices.reasonReview0Grounded.choice='changed_o2';},(r:any)=>{r.steps[5].deferralReason.record.reviews[0].newEvidence.observationId='o2';}]){
    const tampered=JSON.parse(original);change(tampered);await writeFile(file,JSON.stringify(tampered));try{await assert.rejects(replayDirectory(dir),/REASON/);}finally{await writeFile(file,original);}
   }
  }
 }
});
