import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {sourceIdentity} from '../runner/virtual-beta-source.js';
import {sha} from '../runner/virtual-beta-core.js';
import {runHumanJev} from '../runner/human-jev-experiment.js';
import {humanJevProfile} from '../runner/human-jev-profiles.js';
import {PhaseBudget} from '../runner/virtual-beta-budget.js';
import {replayDirectory} from '../runner/virtual-beta-replay.js';
import {reasonSchedule, reasonComparisonPlan, analyzeReasonRuns, runDeferralReasonExperiment, snapshotReasonPriorLedgers} from '../runner/deferral-reason-experiment.js';
import {prepareReasonContext, reasonQuestions, admitReasons} from '../jev/virtual-beta/deferral-reason.js';
import type {ChoiceQuestion, ChoiceAnswers} from '../jev/client.js';
import type {BetaCandidates, UserObservation} from '../jev/virtual-beta/contracts.js';
import type {DeferralMemory} from '../jev/virtual-beta/deferral-contracts.js';
import type {DeferralReasonMemory, DeferralReasonConfig} from '../jev/virtual-beta/deferral-reason-contracts.js';

// Independent audit: only local fictional fixture, dummy credential and intercepted gateway.
process.env.AI_GATEWAY_API_KEY='INDEPENDENT_GROUNDING_DUMMY';
process.loadEnvFile=()=>{throw Error('INDEPENDENT_ENV_FILE_READ_FORBIDDEN');};
const before=await sourceIdentity();
const output=resolve('reports/deferral-grounding-2026-10-29/independent-'+Date.now()+'-'+process.pid);
await mkdir(output,{recursive:true});
const evidence:Record<string,unknown>={sourceBefore:before,liveAPIRequests:0,browserRuns:[],tamperCases:[]};
after(async()=>{
 const afterSource=await sourceIdentity();
 await writeFile(join(output,'audit.json'),JSON.stringify({...evidence,sourceAfter:afterSource,sourceUnchanged:JSON.stringify(before)===JSON.stringify(afterSource)},null,2));
 assert.deepEqual(afterSource,before,'Product source must remain unchanged during independent audit');
});
test('independent source gate uses runtime baseline; optional explicit frozen audit pin',async()=>{
 const pin=process.env.DEFERRAL_GROUNDING_AUDIT_PIN;
 if(pin)assert.deepEqual(before,JSON.parse(await readFile(pin,'utf8')));
 assert.equal(before.sourceHash.length,64);
});

const source=(observationId:string,imageSha256:string)=>({observationId,imageSha256});
const original=source('o2','original-pixels'),now=source('o6','home-pixels');
const attached=[original,source('o4','later-a'),source('o5','later-b'),now];
const raw:DeferralMemory={schemaVersion:1,entries:[{imageSha256:now.imageSha256,candidateId:'entry',fromObservationId:'o1',toObservationId:'o3',evidence:[source('o3',now.imageSha256)]}]};
const memory:DeferralReasonMemory={schemaVersion:1,entries:[{...raw.entries[0],kind:'model-hypothesis-not-fact',category:'prerequisite',basis:original,capturedAt:source('o3',now.imageSha256)}]};
const cfg:DeferralReasonConfig={enabled:true,capacity:8,maxReasonImages:1,basisAdmission:'excursion-evidence',reviewMode:'grounded-choice'};
const observation:UserObservation={id:now.observationId,imageSha256:now.imageSha256,candidateIds:['entry','other'],fixation:{x:0,y:0},get visibleText():string[]{throw Error('HIDDEN_DOM_READ');}};
const candidates:BetaCandidates={entry:{action:{type:'click',elementId:'entry'},get label():string{throw Error('HIDDEN_LABEL_READ');}},other:{action:{type:'click',elementId:'other'},label:'other'}};
const context=(m=memory,r=raw,c=cfg)=>prepareReasonContext(m,r,undefined,observation,candidates,c);
function answer(questions:Record<string,ChoiceQuestion>,choices:Record<string,string>):ChoiceAnswers{
 return {model:'jev-1.14.0',answers:Object.fromEntries(Object.entries(questions).map(([id,q])=>{
  const choice=choices[id]??(id.endsWith('Evidence')?'none':'unknown');
  assert.ok(Object.hasOwn(q.criteria,choice),id+':'+choice);
  return [id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,Number(k===choice)]))}];
 }))};
}
test('independent pure: selected joint token governs release, raw probabilities and raw deferral remain',()=>{
 const ctx=context(),questions=reasonQuestions(ctx,attached,cfg.reviewMode),snapshot=JSON.stringify({memory,raw,ctx,attached});
 assert.deepEqual(Object.keys(questions),['reasonReview0Grounded']);
 assert.deepEqual(Object.keys(questions.reasonReview0Grounded.criteria),['unknown','still_blocks','changed_o4','changed_o5']);
 for(const chosen of ['unknown','still_blocks','changed_o5']){
  const response=answer(questions,{reasonReview0Grounded:chosen});
  response.answers.reasonReview0Grounded.probabilities={unknown:.02,still_blocks:.03,changed_o4:.25,changed_o5:.7};
  const admitted=admitReasons(response,ctx,raw,attached,cfg),release=chosen==='changed_o5';
  assert.equal(admitted.record.reviews[0].released,release);
  assert.equal(admitted.record.reviews[0].status,release?'basis_changed':chosen);
  assert.equal(admitted.effectiveDeferrals.entries.length,release?0:1);
  assert.deepEqual(admitted.record.rawChoices.reasonReview0Grounded,response.answers.reasonReview0Grounded);
  assert.deepEqual(admitted.record.reviews[0].newEvidence,release?attached[2]:undefined);
  response.answers.reasonReview0Grounded.probabilities.changed_o5=0;
  assert.equal(admitted.record.rawChoices.reasonReview0Grounded.probabilities.changed_o5,.7);
 }
 assert.equal(JSON.stringify({memory,raw,ctx,attached}),snapshot);
});
test('independent pure: original knowledge, attachment, time and pixel controls offer no changed choice',()=>{
 const controls=[
  {name:'missing-original',sources:attached.slice(1)},
  {name:'substituted-original',sources:[source('o2','forged'),attached[2],now]},
  {name:'unknown-original',sources:attached,unknown:true},
  ...[['generation-end','o3','new'],['old','o1','new'],['future','o7','new'],['home-identical','o5',now.imageSha256],['blocker-identical','o5',original.imageSha256]].map(([name,id,hash])=>({name,sources:[original,source(id,hash),now]}))
 ];
 for(const control of controls){
  const m=structuredClone(memory);if('unknown' in control)m.entries[0].category='unknown';
  const ctx=context(m),q=reasonQuestions(ctx,control.sources,cfg.reviewMode);
  assert.deepEqual(Object.keys(q.reasonReview0Grounded.criteria),['unknown','still_blocks'],control.name);
  assert.deepEqual(admitReasons(answer(q,{reasonReview0Grounded:'unknown'}),ctx,raw,control.sources,cfg).effectiveDeferrals,raw,control.name);
  const forged:ChoiceAnswers={model:'offline',answers:{reasonReview0Grounded:{choice:'changed_o5',probabilities:{unknown:0,still_blocks:0,changed_o5:1}}}};
  assert.throws(()=>admitReasons(forged,ctx,raw,control.sources,cfg),Error,control.name);
 }
 assert.throws(()=>reasonQuestions(context(),[...attached,source('o5','conflict')],cfg.reviewMode),/CONFLICTING/);
});
test('independent pure: malformed responses and current-generation mismatch fail closed',()=>{
 const ctx=context(),q=reasonQuestions(ctx,attached,cfg.reviewMode);
 for(const mutation of [
  (r:ChoiceAnswers)=>{delete r.answers.reasonReview0Grounded;},
  (r:ChoiceAnswers)=>{r.answers.reasonReview0Grounded.choice='changed_o99';},
  (r:ChoiceAnswers)=>{r.answers.reasonReview0Grounded.probabilities.changed_o5=NaN;},
  (r:ChoiceAnswers)=>{r.answers.reasonReview0Grounded.probabilities.changed_o4=-1;},
  (r:ChoiceAnswers)=>{r.answers.reasonReview0Grounded.probabilities={unknown:0,still_blocks:0,changed_o4:0,changed_o99:1};},
  (r:ChoiceAnswers)=>{r.answers.reasonReview0Grounded.probabilities.changed_o5=.2;},
  (r:ChoiceAnswers)=>{r.answers=answer(reasonQuestions(ctx,attached),{reasonReview0Status:'basis_changed',reasonReview0Evidence:'o5'}).answers;}
 ]){
  const r=answer(q,{reasonReview0Grounded:'changed_o5'});mutation(r);
  assert.throws(()=>admitReasons(r,ctx,raw,attached,cfg));
 }
 for(const field of ['imageSha256','candidateId','fromObservationId','toObservationId'] as const){
  const changed=structuredClone(raw);changed.entries[0][field]=field==='fromObservationId'?'o2':field==='toObservationId'?'o4':'different';
  const result=admitReasons(answer(q,{reasonReview0Grounded:'changed_o5'}),ctx,changed,attached,cfg);
  assert.equal(result.record.reviews[0].released,false,field);
  assert.deepEqual(result.effectiveDeferrals,changed);
  assert.ok(result.record.adjustments.includes('REVIEW_0_GENERATION_NOT_CURRENT'));
 }
});
test('independent pure: absent and explicit separate preserve legacy questions, changed-plus-none does not release',()=>{
 const absent={...cfg};delete absent.reviewMode;
 const explicit={...cfg,reviewMode:'separate' as const},ctx=context(memory,raw,absent);
 assert.deepEqual(context(memory,raw,explicit),ctx);
 const q=reasonQuestions(ctx,attached);
 assert.deepEqual(Object.keys(q),['reasonReview0Status','reasonReview0Evidence']);
 assert.deepEqual(reasonQuestions(ctx,attached,'separate'),q);
 for(const evidenceChoice of ['none','o5']){
  const r=answer(q,{reasonReview0Status:'basis_changed',reasonReview0Evidence:evidenceChoice});
  const a=admitReasons(r,ctx,raw,attached,absent),b=admitReasons(r,ctx,raw,attached,explicit);
  assert.deepEqual(a,b);
  assert.equal(a.record.reviews[0].released,evidenceChoice==='o5');
 }
 const a=humanJevProfile('experience-reason-excursion'),b=humanJevProfile('experience-reason-grounded');
 const normalized=structuredClone(b);normalized.config.id=a.config.id;delete normalized.config.deferralReason!.reviewMode;
 assert.deepEqual(normalized,a);
});

type Condition='changed'|'still'|'unknown'|'legacy-none';
const browserRuns:any[]=[];
async function gatewayBrowser(condition:Condition){
 const dir=join(output,'gateway-'+condition);await mkdir(dir);
 const ledger=join(dir,'budget.json');
 await writeFile(ledger,JSON.stringify({schemaVersion:1,status:'APPROVED',phase:'INDEPENDENT_GROUNDING_FETCH_STUB',newMaximum:24,perRunMaximum:12,used:0,attempts:[]}));
 const intercepted:any[]=[],stubFailures:any[]=[],persistFailures:any[]=[];
 const oldFetch=globalThis.fetch;
 const prototype=PhaseBudget.prototype as unknown as {persist:(...args:unknown[])=>Promise<void>},persist=prototype.persist;
 prototype.persist=async function(...args){try{return await persist.apply(this,args);}catch(error){
  const e=error as NodeJS.ErrnoException;
  persistFailures.push({message:e.message,code:e.code,syscall:e.syscall,path:e.path,stack:e.stack});
  await writeFile(join(dir,'persistence-failure.json'),JSON.stringify(persistFailures,null,2));throw error;
 }};
 globalThis.fetch=async(url,options)=>{
  try{
   assert.equal(String(url),'https://ai-gateway.vercel.sh/typesafe/v1/systemone');
   const headers=new Headers(options?.headers);
   assert.equal(headers.get('Authorization'),'Bearer INDEPENDENT_GROUNDING_DUMMY');
   assert.equal(headers.get('TypeSafe-Danger-Zone-Images'),'true');
   assert.equal(headers.get('TypeSafe-Danger-Zone-Long-Context'),'true');
   const body=JSON.parse(String(options?.body)),input=body.state,n=Number(input.observation.id.slice(1));
   const refs=[...input.memoryObservations,...input.reasonObservations,{observationId:input.observation.id,image:input.observation.image}];
   const imageRefs=refs.map((ref:any)=>{
    const asset=body.assets[ref.image];assert.ok(asset,ref.image);
    const hash=sha(Buffer.from(asset.data_base64,'base64'));if(ref.imageSha256)assert.equal(hash,ref.imageSha256);
    return {observationId:ref.observationId,image:ref.image,imageSha256:hash};
   });
   assert.equal(input.observation.screen,undefined);assert.equal(input.exploration.charter.oracle,undefined);assert.equal(input.exploration.persona,undefined);
   assert.equal(input.audit,undefined);assert.equal(input.deferral,undefined);
   assert.ok(!/data-holdout|data-testid|objectiveAssessment|rawScreenshot|regionsOfInterest|humanInputsRead/.test(JSON.stringify(input)));
   assert.ok(input.userState.memory.length<=3);assert.ok((input.userState.experience?.transitions.length??0)<=8);
   assert.ok(input.deferralReasonContext.memory.entries.length<=8);assert.ok(input.reasonObservations.length<=1);assert.ok(Object.keys(body.assets).length<=4);
   const grounded=condition!=='legacy-none';
   if(n===6&&body.questions.knowledge){
    assert.deepEqual(input.reasonObservations.map((r:any)=>r.observationId),['o2']);
    assert.ok(!input.memoryObservations.some((r:any)=>r.observationId==='o2'));
    const initial=intercepted.find(r=>r.observation==='o2'&&r.stage==='assessment');
    const originalAttached=imageRefs.find((r:any)=>r.observationId==='o2');assert.ok(originalAttached);assert.ok(initial);
    const originalObserved=initial.images.find((r:any)=>r.observationId==='o2');assert.ok(originalObserved);
    assert.equal(originalAttached.imageSha256,originalObserved.imageSha256);
    const ids=Object.keys(body.questions).filter(id=>id.startsWith('reasonReview'));
    if(grounded){
     assert.deepEqual(ids,['reasonReview0Grounded']);
     assert.deepEqual(Object.keys(body.questions.reasonReview0Grounded.criteria),['unknown','still_blocks','changed_o4','changed_o5']);
    }else assert.deepEqual(ids,['reasonReview0Status','reasonReview0Evidence']);
   }
   // The response path deliberately keeps the changed probability highest in non-release controls.
   const path=['','e2','e1','e3','e2','e1','e2','e2','done'];
   const action=condition!=='changed'&&n>=7?'done':path[n];
   const choices=Object.fromEntries(Object.entries(body.questions).map(([id,q]:[string,any])=>[id,
    id==='nextAction'?action:id==='decisionBasis'?'goal':id==='knowledge'?'sufficient':id==='goal'?(n>=8?'satisfied':'unsatisfied'):
    id==='goalEvidence'||id.startsWith('evidence_')||id==='experienceEvidence'?'o'+n:id.startsWith('effect_')?'advances':
    id==='experienceProgress'?(n===5?'advances':n===2?'unknown':'neutral'):id==='experienceExpectation'?'supported':
    id==='reasonCaptureCategory'?'prerequisite':id==='reasonCaptureEvidence'?(Object.hasOwn(q.criteria,'o2')?'o2':'none'):
    id.endsWith('Grounded')?(condition==='changed'?'changed_o5':condition==='still'?'still_blocks':'unknown'):
    id.endsWith('Status')?'basis_changed':id.endsWith('Evidence')?'none':'none'
   ]));
   const response=answer(body.questions,choices);
   if(body.questions.nextAction&&n===6)response.answers.nextAction.probabilities=Object.fromEntries(Object.keys(body.questions.nextAction.criteria).map(k=>[k,k==='e2'?.97:k==='e3'?.02:k==='stuck'?.01:0]));
   if(body.questions.reasonReview0Grounded&&n===6)response.answers.reasonReview0Grounded.probabilities={unknown:.02,still_blocks:.03,changed_o4:.25,changed_o5:.7};
   intercepted.push({observation:input.observation.id,stage:body.questions.nextAction?'action':'assessment',bodySha256:sha(String(options?.body)),images:imageRefs,questions:body.questions,reasonContext:input.deferralReasonContext,response});
   return new Response(JSON.stringify(response),{status:200});
  }catch(error){
   stubFailures.push(error instanceof Error?{message:error.message,stack:error.stack}:{message:String(error)});
   await writeFile(join(dir,'stub-failure.json'),JSON.stringify(stubFailures,null,2));throw error;
  }
 };
 try{
  const saved=await runHumanJev({out:join(dir,'run'),mock:false,mode:condition==='legacy-none'?'experience-reason-excursion':'experience-reason-grounded',phaseBudget:ledger,longContext:true,holdoutFixture:{task:'revisit',variant:'alpha'}});
  assert.deepEqual(stubFailures,[],'Assertions at the fetch boundary must not be hidden by client error catches');
  assert.deepEqual(persistFailures,[],'Infrastructure failures must stay separate from UX');
  const manifest=JSON.parse(await readFile(join(saved.root,'manifest.json'),'utf8')),budget=JSON.parse(await readFile(ledger,'utf8'));
  assert.equal(manifest.sourceHash,before.sourceHash);assert.equal(manifest.revision,before.revision);assert.equal(manifest.humanInputsRead,false);
  assert.equal(manifest.actualAPIRequests,intercepted.length);assert.equal(budget.used,intercepted.length);
  assert.equal(intercepted.length,saved.result.decisions*2);assert.ok(intercepted.length<=24);
  const review=saved.result.steps[5],release=condition==='changed';
  assert.equal(saved.result.termination,'SUBJECTIVE_DONE');
  assert.equal(review.deferralReason!.record.reviews[0].released,release);
  assert.equal(review.deferral!.state.entries.some(e=>e.candidateId==='e2'),true);
  assert.equal(review.deferralReason!.effectiveState.entries.some(e=>e.candidateId==='e2'),!release);
  assert.equal(review.selection!.raw.e2,.97);assert.equal(review.selection!.policy!.weights.e2,release?1:.01);
  assert.equal(review.selection!.selected,release?'e2':'e3');assert.equal(review.outcome,'UI_PERFORMED');
  assert.deepEqual(review.action,{type:'click',elementId:release?'e2':'e3'});
  assert.equal(review.userState!.lastObservation!.imageSha256,saved.result.steps[2].userState!.lastObservation!.imageSha256);
  assert.notEqual(saved.result.steps[6].userState!.lastObservation!.imageSha256,review.userState!.lastObservation!.imageSha256);
  const rawChoice=review.deferralReason!.record.rawChoices;
  if(condition!=='legacy-none'){
   assert.equal(rawChoice.reasonReview0Grounded.choice,release?'changed_o5':condition==='still'?'still_blocks':'unknown');
   assert.equal(rawChoice.reasonReview0Grounded.probabilities.changed_o5,.7);
  }else{
   assert.equal(rawChoice.reasonReview0Status.choice,'basis_changed');assert.equal(rawChoice.reasonReview0Evidence.choice,'none');
   assert.ok(review.deferralReason!.record.adjustments.includes('REVIEW_0_NO_ADMITTED_NEW_EVIDENCE'));
  }
  if(release){
   const cited=review.deferralReason!.record.reviews[0].newEvidence!;
   assert.equal(cited.observationId,'o5');assert.equal(cited.imageSha256,saved.result.steps[4].userState!.lastObservation!.imageSha256);
   assert.equal(review.deferralReason!.record.reviews[0].basis!.imageSha256,saved.result.steps[1].userState!.lastObservation!.imageSha256);
  }
  assert.equal(saved.result.objectiveAssessment.value,release);
  const replay=await replayDirectory(join(saved.root,'exploration'));assert.equal(replay.verified,true);
  const run={condition,interceptedRequests:intercepted.length,liveAPIRequests:0,decisions:saved.result.decisions,uiActions:saved.result.uiActions,objective:saved.result.objectiveAssessment,path:saved.result.steps.map(s=>s.selection?.selected),review:review.deferralReason,selection:review.selection,action:review.action,afterObservation:saved.result.steps[6].audit,replay};
  browserRuns.push(run);await writeFile(join(dir,'intercepted.json'),JSON.stringify(intercepted,null,2));await writeFile(join(dir,'evidence.json'),JSON.stringify(run,null,2));
  return saved;
 }finally{globalThis.fetch=oldFetch;prototype.persist=persist;}
}
test('independent gateway and actual browser: changed, still, unknown and legacy changed-plus-none',async()=>{
 const runs=[];
 for(const condition of ['changed','still','unknown','legacy-none'] as const)runs.push(await gatewayBrowser(condition));
 const changed=runs[0],dir=join(changed.root,'exploration'),file=join(dir,'result.json'),originalBytes=await readFile(file),baseline=JSON.parse(originalBytes.toString());
 const tamperCases=[
  {name:'config review mode',change:(r:any)=>{r.config.deferralReason.reviewMode='separate';}},
  {name:'raw grounded token',change:(r:any)=>{r.steps[5].deferralReason.record.rawChoices.reasonReview0Grounded.choice='changed_o2';}},
  {name:'raw probability',change:(r:any)=>{r.steps[5].deferralReason.record.rawChoices.reasonReview0Grounded.probabilities.changed_o5=.6;}},
  {name:'selected response token',change:(r:any)=>{r.steps[5].deliberation.response.answers.reasonReview0Grounded.choice='unknown';}},
  {name:'release source',change:(r:any)=>{r.steps[5].deferralReason.record.reviews[0].newEvidence.observationId='o2';}},
  {name:'executed click action',change:(r:any)=>{r.steps[5].action.elementId='e3';}},
  {name:'selected action candidate',change:(r:any)=>{r.steps[5].selection.selected='e3';}},
  {name:'generation',change:(r:any)=>{r.steps[2].deferralReason.memory.entries[0].fromObservationId='o2';}},
  {name:'effective state',change:(r:any)=>{r.steps[5].deferralReason.effectiveState.entries=r.steps[5].deferral.state.entries;}},
  {name:'question with rehashed request',change:(r:any)=>{const d=r.steps[5].deliberation;d.questions.reasonReview0Grounded.criteria.changed_o99='forged';d.inputSha256=sha(JSON.stringify({input:d.modelInput,questions:d.questions,assets:d.assetFiles}));}},
  {name:'unobserved attached source with rehashed request',change:(r:any)=>{const d=r.steps[5].deliberation;d.modelInput.reasonObservations[0].observationId='o99';d.inputSha256=sha(JSON.stringify({input:d.modelInput,questions:d.questions,assets:d.assetFiles}));}}
 ];
 const rejectionEvidence:any[]=[];
 for(const mutation of tamperCases){
  const modified=structuredClone(baseline);mutation.change(modified);
  await writeFile(file,JSON.stringify(modified));
  try{
   let rejected='';try{await replayDirectory(dir);}catch(error){rejected=String(error);}
   assert.ok(rejected,mutation.name+' must reject');
   rejectionEvidence.push({name:mutation.name,rejected});
  }finally{await writeFile(file,originalBytes);}
 }
 const imageFile=join(dir,baseline.steps[5].deliberation.assetFiles.reason_0.file),imageBytes=await readFile(imageFile),tampered=Buffer.from(imageBytes);tampered[tampered.length-1]^=1;
 try{await writeFile(imageFile,tampered);await assert.rejects(replayDirectory(dir),/IMAGE_HASH_MISMATCH/);rejectionEvidence.push({name:'original attached image bytes',rejected:true});}finally{await writeFile(imageFile,imageBytes);}
 assert.equal((await replayDirectory(dir)).verified,true);
 evidence.browserRuns=browserRuns;evidence.tamperCases=rejectionEvidence;
 await writeFile(join(output,'browser-evidence.json'),JSON.stringify({browserRuns,tamperCases:rejectionEvidence,liveAPIRequests:0},null,2));
});

test('independent comparator: twelve-slot declaration, actual two-arm mock connectivity and pair rejection',async()=>{
 const plan=reasonComparisonPlan('reason-grounding');
 assert.deepEqual(plan.fullSchedule,reasonSchedule());assert.equal(plan.fullSchedule.length,12);
 assert.equal(new Set(plan.fullSchedule.map(s=>s.id)).size,12);
 for(const scenario of ['notifications','revisit-alpha','revisit-beta'])for(const replicate of [1,2])assert.deepEqual(plan.fullSchedule.filter(s=>s.scenario===scenario&&s.replicate===replicate).map(s=>s.condition).sort(),['old','reason']);
 assert.equal(plan.limits.maxRequestsPerTrial,24);assert.equal(plan.limits.phaseMaximumRequests,288);
 assert.equal(plan.limits.phaseMs,1200000);assert.equal(plan.limits.parallel,1);
 assert.equal(plan.inputComponents.shared.additionalAPIStages,0);assert.equal(plan.inputComponents.shared.attempts,1);
 assert.equal(plan.inputComponents.shared.recencyImages,3);
 const prior=await snapshotReasonPriorLedgers('reason-grounding'),oldFetch=globalThis.fetch;
 globalThis.fetch=async()=>{throw Error('MOCK_MUST_NOT_CALL_FETCH');};
 const dir=join(output,'comparison');
 try{
  const result=await runDeferralReasonExperiment({out:dir,mock:true,comparison:'reason-grounding',limit:2});
  assert.equal(result.status,'COMPLETED');assert.equal(result.requests,0);assert.equal(result.trials,2);
 }finally{globalThis.fetch=oldFetch;}
 const manifest=JSON.parse(await readFile(join(dir,'manifest.json'),'utf8')),summary=JSON.parse(await readFile(join(dir,'summary.json'),'utf8'));
 assert.equal(manifest.performanceEvidence,false);assert.equal(manifest.requestAccounting.used,0);assert.equal(summary.pairs[0].consistent,true);
 assert.equal(manifest.records[0].initialImageSha256,manifest.records[1].initialImageSha256);
 const records=await Promise.all(manifest.records.map(async(r:any)=>({...r,result:JSON.parse(await readFile(join(dir,r.resultPath),'utf8'))})));
 const altered=structuredClone(records);altered[1].result.config.deferralReason.basisAdmission='negative-evidence';
 assert.ok(analyzeReasonRuns(altered,'reason-grounding').pairs[0].errors.includes('CONFIG_MISMATCH'));
 assert.deepEqual(await snapshotReasonPriorLedgers('reason-grounding'),prior);
 const priorCheck=JSON.parse(await readFile(join(dir,'prior-ledger-check.json'),'utf8'));
 assert.equal(priorCheck.unchanged,true);assert.equal(priorCheck.checked,prior.length);
 evidence.priorLedgers={available:prior.length,unchanged:priorCheck.unchanged};
});
test('independent available historical raw results replay offline without making artifacts mandatory',async(t)=>{
 const replays:any[]=[],missing:string[]=[];
 for(const root of ['reports/deferral-reason-2026-10-28/live','reports/deferral-admission-2026-10-29/live']){
  let manifest:any;
  try{manifest=JSON.parse(await readFile(join(root,'manifest.json'),'utf8'));}catch(error){
   if((error as NodeJS.ErrnoException).code==='ENOENT'){missing.push(root);continue;}throw error;
  }
  for(const r of manifest.records){
   const path=join(root,r.dir??r.id,'exploration'),replay=await replayDirectory(path);
   assert.equal(replay.verified,true);replays.push({path,...replay});
  }
 }
 evidence.historical={replays,missing,liveAPIRequests:0};
 await writeFile(join(output,'historical-replays.json'),JSON.stringify(evidence.historical,null,2));
 if(!replays.length)t.skip('Historical local artifacts unavailable; portable behavior remains tested');
});


test('independent comparison plans isolate mutable mode mappings across calls and comparison kinds',()=>{
 for(const comparison of ['deferral-reason','reason-admission','reason-grounding'] as const){
  const first=reasonComparisonPlan(comparison),expected={...first.modes};
  const mutable=first.modes as Record<string,string>;
  try{
   mutable.old='INDEPENDENT_CALLER_MUTATION';
   mutable.reason='INDEPENDENT_OTHER_MUTATION';
   const second=reasonComparisonPlan(comparison);
   assert.deepEqual(second.modes,expected,comparison+' must not retain caller mutation');
   assert.notEqual(first.modes,second.modes,comparison+' requires independent mappings');
  }finally{mutable.old=expected.old;mutable.reason=expected.reason;}
 }
});


