import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {sourceIdentity} from '../runner/virtual-beta-source.js';
import {sha} from '../runner/virtual-beta-core.js';
import {runHumanJev} from '../runner/human-jev-experiment.js';
import {PhaseBudget} from '../runner/virtual-beta-budget.js';
import {humanJevProfile} from '../runner/human-jev-profiles.js';
import {replayDirectory} from '../runner/virtual-beta-replay.js';
import {reasonSchedule,runDeferralReasonExperiment,snapshotReasonPriorLedgers} from '../runner/deferral-reason-experiment.js';
import {prepareReasonContext,reasonQuestions,admitReasons,effectiveFromReasons,requiredReasonSources} from '../jev/virtual-beta/deferral-reason.js';
import {updateDeferrals} from '../jev/virtual-beta/deferral.js';
import type {ChoiceQuestion} from '../jev/client.js';
import type {BetaCandidates,UserObservation} from '../jev/virtual-beta/contracts.js';
import type {DeferralMemory} from '../jev/virtual-beta/deferral-contracts.js';
import type {DeferralReasonConfig} from '../jev/virtual-beta/deferral-reason-contracts.js';
import type {ExperienceSource,ExperienceMemory,ExperienceTransition} from '../jev/virtual-beta/experience-contracts.js';

// Independent author. All requests terminate in a fetch stub; no environment or human files.
process.env.AI_GATEWAY_API_KEY='INDEPENDENT_ADMISSION_FETCH_STUB_ONLY';
process.loadEnvFile=()=>{throw Error('ENV_READ_FORBIDDEN');};
const before=await sourceIdentity();
const output=resolve('reports/deferral-admission-2026-10-29/independent-'+Date.now()+'-'+process.pid);
await mkdir(resolve('reports/deferral-admission-2026-10-29'),{recursive:true});
await mkdir(output);
const legacy:DeferralReasonConfig={enabled:true,capacity:8,maxReasonImages:1};
const excursion:DeferralReasonConfig={...legacy,basisAdmission:'excursion-evidence'};
const src=(observationId:string,imageSha256:string):ExperienceSource=>({observationId,imageSha256});
const candidates:BetaCandidates={a:{action:{type:'click',elementId:'a'},label:'entry'},b:{action:{type:'click',elementId:'b'},label:'other'}};
const empty:DeferralMemory={schemaVersion:1,entries:[]};
const observation=(s:ExperienceSource):UserObservation=>({id:s.observationId,imageSha256:s.imageSha256,visibleText:[],candidateIds:['a','b'],fixation:{x:0,y:0}});
function answer(questions:Record<string,ChoiceQuestion>,choices:Record<string,string>){return {model:'jev-1.14.0',answers:Object.fromEntries(Object.entries(questions).map(([id,q])=>{const choice=choices[id]??'none';assert.ok(Object.hasOwn(q.criteria,choice),id+':'+choice);return [id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,Number(k===choice)]))}];}))};}
function fixture(start=1){
 const sources=[src('o'+start,'home'),src('o'+(start+1),'blocker'),src('o'+(start+2),'home')];
 const [home,blocker,returned]=sources;
 const transitions:ExperienceTransition[]=[{intent:{source:home,candidateId:'a',action:{type:'click',elementId:'a'},prediction:'advances'},result:blocker,execution:'performed',judgment:{kind:'model-assessment-not-fact',progress:'unknown',expectation:'supported',evidence:blocker,adjustments:[]}},{intent:{source:blocker,candidateId:'back',action:{type:'back'},prediction:'neutral'},result:returned,execution:'performed'}];
 const pending:ExperienceMemory={schemaVersion:1,transitions},experience=structuredClone(pending);
 experience.transitions[1].judgment={kind:'model-assessment-not-fact',progress:'neutral',expectation:'supported',evidence:returned,adjustments:[]};
 const current=observation(returned),actual=updateDeferrals(undefined,experience,current,{schemaVersion:1,kind:'model-assessment-not-fact',observationId:current.id,imageSha256:current.imageSha256,knowledge:'sufficient',goal:'unsatisfied',effects:{},adjustments:[]},{enabled:true,capacity:8,weight:.01,minAlternativeProbability:.01});
 return {sources,pending,current,actual};
}
function capture(f=fixture(),config=excursion,attached=f.sources,choice=f.sources[1].observationId){const context=prepareReasonContext(undefined,empty,f.pending,f.current,candidates,config);return admitReasons(answer(reasonQuestions(context,attached),{reasonCaptureCategory:'prerequisite',reasonCaptureEvidence:choice}),context,f.actual,attached,config);}

test('independent contract: opt-in changes only basis admission and preserves questions/raw state',()=>{
 const old=humanJevProfile('experience-reason'),next=humanJevProfile('experience-reason-excursion');
 const normalized=structuredClone(next);normalized.config.id=old.config.id;delete normalized.config.deferralReason!.basisAdmission;assert.deepEqual(normalized,old);
 const f=fixture(),snapshot=JSON.stringify(f),a=capture(f,legacy),b=capture(f,{...legacy,basisAdmission:'negative-evidence'}),c=capture(f);
 assert.deepEqual(a,b);assert.equal(a.record.capture?.admitted,false);assert.equal(c.record.capture?.admitted,true);assert.equal(JSON.stringify(f),snapshot);
 assert.deepEqual(c.memory.entries[0].captureProvenance,{kind:'excursion-evidence',negativeEvidence:[f.sources[2]],excursionEvidence:[f.sources[1]]});
 assert.deepEqual(c.record.capture?.captureProvenance,c.memory.entries[0].captureProvenance);assert.deepEqual(c.effectiveDeferrals,f.actual);
 for(const cfg of [legacy,excursion])assert.deepEqual(reasonQuestions(prepareReasonContext(undefined,empty,f.pending,f.current,candidates,cfg),f.sources),reasonQuestions(prepareReasonContext(undefined,empty,f.pending,f.current,candidates,legacy),f.sources));
});

test('independent adversarial capture matrix rejects unlearned, wrong generation, unattached and contradictory sources',()=>{
 for(const field of ['imageSha256','candidateId','fromObservationId','toObservationId'] as const){const f=fixture();f.actual.entries[0][field]=field==='fromObservationId'?'o2':field==='toObservationId'?'o4':'different';assert.equal(capture(f).memory.entries.length,0,field);}
 const absent=fixture();absent.actual=empty;assert.equal(capture(absent).record.capture?.admitted,false);
 const f=fixture();assert.throws(()=>capture(f,excursion,[f.sources[0],f.sources[2]]));assert.equal(capture(f,excursion,[f.sources[0],src('o2','replacement'),f.sources[2]]).record.capture?.admitted,false);
 assert.throws(()=>capture(f,excursion,[...f.sources,src('o2','conflict')]),/CONFLICTING_REASON_SOURCE_ID/);
 for(const chosen of [f.sources[0],f.sources[2],src('o7','elsewhere'),src('o9','future')])assert.equal(capture(f,excursion,[...f.sources,chosen],chosen.observationId).record.capture?.admitted,false);
 for(const mutate of [
  (x:ReturnType<typeof fixture>)=>{x.pending.transitions[0].execution='unchanged';},
  (x:ReturnType<typeof fixture>)=>{x.pending.transitions[1].intent.source=src('o2','break');},
  (x:ReturnType<typeof fixture>)=>{x.pending.transitions[0].result=src('o5','blocker');x.pending.transitions[0].judgment!.evidence=src('o5','blocker');x.pending.transitions[1].intent.source=src('o5','blocker');}
 ]){const x=fixture();mutate(x);const context=prepareReasonContext(undefined,empty,x.pending,x.current,candidates,excursion);assert.ok(!context.capture?.evidenceCandidates.some(s=>s.imageSha256==='blocker'));}
});

test('independent provenance limits and release guards preserve earlier/home negatives and generation isolation',()=>{
 const f=fixture(5);f.actual.entries[0].evidence=[src('o1','earlier'),f.sources[2]];const c=capture(f);assert.deepEqual(c.memory.entries[0].captureProvenance!.negativeEvidence,f.actual.entries[0].evidence);
 for(const kind of ['negative-overflow','excursion-overflow','conflicting-cross-source','future-negative'] as const){const memory=structuredClone(c.memory),p=memory.entries[0].captureProvenance!;if(kind==='negative-overflow')p.negativeEvidence=Array.from({length:9},(_,i)=>src('o'+(i+1),'n'+i));if(kind==='excursion-overflow')p.excursionEvidence=Array.from({length:9},(_,i)=>src('o'+(i+1),'e'+i));if(kind==='conflicting-cross-source')p.negativeEvidence=[src('o6','other')];if(kind==='future-negative')p.negativeEvidence=[src('o99','future')];assert.throws(()=>effectiveFromReasons(memory,f.actual),Error,kind);}
 const context=prepareReasonContext(c.memory,f.actual,undefined,observation(src('o10','home')),candidates,excursion);assert.deepEqual(requiredReasonSources(context,excursion),[src('o6','blocker')]);
 for(const [status,evidence,attached,release] of [
  ['basis_changed','o9',[src('o6','blocker'),src('o9','changed'),src('o10','home')],true],
  ['still_blocks','o9',[src('o6','blocker'),src('o9','changed'),src('o10','home')],false],
  ['unknown','o9',[src('o6','blocker'),src('o9','changed'),src('o10','home')],false],
  ['basis_changed','o9',[src('o9','changed'),src('o10','home')],false],
  ['basis_changed','o9',[src('o6','blocker'),src('o9','blocker'),src('o10','home')],false],
  ['basis_changed','o11',[src('o6','blocker'),src('o11','changed'),src('o10','home')],false],
  ['basis_changed','o6',[src('o6','blocker'),src('o10','home')],false]
 ] as const){const attachedCopy=[...attached],r=admitReasons(answer(reasonQuestions(context,attachedCopy),{reasonReview0Status:status,reasonReview0Evidence:evidence}),context,f.actual,attachedCopy,excursion);assert.equal(r.effectiveDeferrals.entries.length,release?0:1,status+':'+evidence);if(release){const other=structuredClone(f.actual);other.entries[0].fromObservationId='o1';assert.deepEqual(effectiveFromReasons(r.memory,other),other);}}
});

const browserEvidence:any[]=[];
async function browserRun(condition:'legacy'|'changed'|'still'){
 const dir=join(output,'gateway-'+condition);await mkdir(dir);const ledger=join(dir,'ledger.json');await writeFile(ledger,JSON.stringify({schemaVersion:1,status:'APPROVED',phase:'INDEPENDENT_FETCH_STUB_ONLY',newMaximum:24,perRunMaximum:12,used:0,attempts:[]}));
 const bodies:any[]=[],hashes:string[]=[],stubFailures:{message:string;stack?:string}[]=[],budgetFailures:unknown[]=[],previous=globalThis.fetch;
 const budgetPrototype=PhaseBudget.prototype as unknown as {persist:(...args:unknown[])=>Promise<void>},persist=budgetPrototype.persist;
 budgetPrototype.persist=async function(...args){try{return await persist.apply(this,args);}catch(error){const e=error as NodeJS.ErrnoException;budgetFailures.push({name:e.name,message:e.message,code:e.code,syscall:e.syscall,path:e.path,stack:e.stack});await writeFile(join(dir,'budget-persist-failure.json'),JSON.stringify(budgetFailures,null,2));throw error;}};
 globalThis.fetch=async(url,options)=>{try{
  assert.equal(String(url),'https://ai-gateway.vercel.sh/typesafe/v1/systemone');assert.equal(new Headers(options?.headers).get('Authorization'),'Bearer INDEPENDENT_ADMISSION_FETCH_STUB_ONLY');assert.equal(new Headers(options?.headers).get('TypeSafe-Danger-Zone-Long-Context'),'true');
  const body=JSON.parse(String(options?.body)),input=body.state,n=Number(input.observation.id.slice(1));bodies.push(body);hashes.push(sha(String(options?.body)));
  assert.equal(input.audit,undefined);assert.equal(input.deferral,undefined);assert.equal(input.exploration.persona,undefined);assert.equal(input.exploration.charter.oracle,undefined);assert.equal(input.observation.screen,undefined);
  assert.ok(input.userState.memory.length<=3);assert.ok((input.userState.experience?.transitions.length??0)<=8);assert.ok((input.deferralReasonContext?.memory.entries.length??0)<=8);assert.ok((input.reasonObservations?.length??0)<=1);assert.ok(Object.keys(body.assets).length<=4);
  assert.ok(!/data-holdout|data-testid|objectiveAssessment|rawScreenshot|regionsOfInterest|humanInputsRead/.test(JSON.stringify(input)));
  for(const ref of [...input.memoryObservations,...(input.reasonObservations??[]),{observationId:input.observation.id,image:'current'}]){assert.ok(body.assets[ref.image]);if(ref.imageSha256)assert.equal(sha(Buffer.from(body.assets[ref.image].data_base64,'base64')),ref.imageSha256);}
  if(n===6&&condition!=='legacy'){assert.deepEqual(input.reasonObservations.map((r:any)=>r.observationId),['o2']);assert.ok(!input.memoryObservations.some((r:any)=>r.observationId==='o2'));assert.ok(body.assets.reason_0);}
  const action=condition!=='changed'&&n>=7?'done':(['','e2','e1','e3','e2','e1','e2','e2','done'][n]??'done');
  const choices=Object.fromEntries(Object.entries(body.questions).map(([id,q]:[string,any])=>[id,id==='nextAction'?action:id==='decisionBasis'?'goal':id==='knowledge'?'sufficient':id==='goal'?(n>=8?'satisfied':'unsatisfied'):id==='goalEvidence'||id.startsWith('evidence_')||id==='experienceEvidence'?'o'+n:id.startsWith('effect_')?'advances':id==='experienceProgress'?(n===5?'advances':n===2?'unknown':'neutral'):id==='experienceExpectation'?'supported':id==='reasonCaptureCategory'?'prerequisite':id==='reasonCaptureEvidence'?(Object.hasOwn(q.criteria,'o2')?'o2':'none'):id.startsWith('reasonReview')&&id.endsWith('Status')?(condition==='still'?'still_blocks':'basis_changed'):id.startsWith('reasonReview')&&id.endsWith('Evidence')?(Object.hasOwn(q.criteria,'o5')?'o5':'none'):'none']));
  const response=answer(body.questions,choices);if(body.questions.nextAction&&n===6)response.answers.nextAction.probabilities=Object.fromEntries(Object.keys(body.questions.nextAction.criteria).map(k=>[k,k==='e2'?.97:k==='e3'?.02:k==='stuck'?.01:0]));return new Response(JSON.stringify(response),{status:200});
 }catch(error){const failure=error instanceof Error?{message:error.message,stack:error.stack}:{message:String(error)};stubFailures.push(failure);await writeFile(join(dir,'stub-failure.json'),JSON.stringify(stubFailures,null,2));throw error;}};
 try{
  const saved=await runHumanJev({out:join(dir,'run'),mock:false,mode:condition==='legacy'?'experience-reason':'experience-reason-excursion',phaseBudget:ledger,longContext:true,holdoutFixture:{task:'revisit',variant:'alpha'}});
  assert.deepEqual(budgetFailures,[],'Budget persistence failures are infrastructure evidence');assert.deepEqual(stubFailures,[],'No assertion inside the fetch stub may be hidden as an API error');const manifest=JSON.parse(await readFile(join(saved.root,'manifest.json'),'utf8')),used=JSON.parse(await readFile(ledger,'utf8')).used;assert.equal(manifest.sourceHash,before.sourceHash);assert.equal(manifest.revision,before.revision);assert.equal(manifest.actualAPIRequests,bodies.length);assert.equal(used,bodies.length);assert.equal(bodies.length,saved.result.decisions*2);assert.equal(manifest.humanInputsRead,false);
  const evidence={condition,liveAPIRequests:0,interceptedRequests:bodies.length,bodyHashes:hashes,path:saved.result.steps.map(s=>s.selection?.selected),objective:saved.result.objectiveAssessment,termination:saved.result.termination,uiActions:saved.result.uiActions};browserEvidence.push(evidence);await writeFile(join(dir,'stub-evidence.json'),JSON.stringify(evidence,null,2));return saved;
 }finally{globalThis.fetch=previous;budgetPrototype.persist=persist;}
}

test('independent normal gateway boundary and browser execute new-only release while raw deferral survives',async()=>{
 const old=await browserRun('legacy'),changed=await browserRun('changed'),still=await browserRun('still');
 const captures=[old,changed,still].map(r=>r.result.steps[2]),review=[old,changed,still].map(r=>r.result.steps[5]);
 assert.equal(captures[0].deferralReason!.record.capture!.admitted,false);for(const c of captures){assert.deepEqual(c.deferral!.state.entries[0].evidence.map(s=>s.observationId),['o3']);}
 for(const c of captures.slice(1)){assert.equal(c.deferralReason!.record.capture!.admitted,true);assert.equal(c.deferralReason!.memory.entries[0].basis.observationId,'o2');assert.deepEqual(c.deferralReason!.record.capture!.captureProvenance!.negativeEvidence.map(s=>s.observationId),['o3']);assert.deepEqual(c.deferralReason!.record.capture!.captureProvenance!.excursionEvidence.map(s=>s.observationId),['o2']);}
 for(const [i,s] of review.entries()){assert.equal(s.deferral!.state.entries.some(e=>e.candidateId==='e2'),true);assert.equal(s.selection!.policy!.weights.e2,i===1?1:.01);assert.equal(s.selection!.selected,i===1?'e2':'e3');assert.equal(s.outcome,'UI_PERFORMED');assert.deepEqual(s.action,{type:'click',elementId:i===1?'e2':'e3'});assert.deepEqual(s.deferralReason!.record.releasedCandidates,i===1?['e2']:[]);}
 assert.equal(changed.result.objectiveAssessment.value,true);assert.equal(changed.result.uiActions,7);
 for(const saved of [old,changed,still]){assert.equal(saved.result.termination,'SUBJECTIVE_DONE');assert.equal((await replayDirectory(join(saved.root,'exploration'))).verified,true);}
 const exploration=join(changed.root,'exploration'),path=join(exploration,'result.json'),original=await readFile(path,'utf8'),parsed=JSON.parse(original);
 const edits=[
  {name:'negative provenance',change:(r:any)=>{r.steps[2].deferralReason.memory.entries[0].captureProvenance.negativeEvidence[0].observationId='o2';},pattern:/REASON_RECORD_MISMATCH/},
  {name:'excursion provenance',change:(r:any)=>{r.steps[2].deferralReason.record.capture.captureProvenance.excursionEvidence[0].imageSha256='forged';},pattern:/REASON_RECORD_MISMATCH/},
  {name:'capture generation',change:(r:any)=>{r.steps[2].deferralReason.memory.entries[0].fromObservationId='o2';},pattern:/REASON_RECORD_MISMATCH/},
  {name:'release state',change:(r:any)=>{r.steps[5].deferralReason.effectiveState.entries=r.steps[5].deferral.state.entries;},pattern:/REASON_RECORD_MISMATCH/},
  {name:'rehashed unknown reason source',change:(r:any)=>{const d=r.steps[5].deliberation;d.modelInput.reasonObservations[0].observationId='o500';d.inputSha256=sha(JSON.stringify({input:d.modelInput,questions:d.questions,assets:d.assetFiles}));},pattern:/REASON_SOURCE_NOT_PREVIOUSLY_OBSERVED/}
 ];
 try{for(const edit of edits){const modified=structuredClone(parsed);edit.change(modified);await writeFile(path,JSON.stringify(modified));await assert.rejects(replayDirectory(exploration),edit.pattern,edit.name);}}finally{await writeFile(path,original);}
 const asset=join(exploration,(review[1].deliberation as any).assetFiles.reason_0.file),bytes=await readFile(asset),forged=Buffer.from(bytes);forged[forged.length-1]^=1;try{await writeFile(asset,forged);await assert.rejects(replayDirectory(exploration),/IMAGE_HASH_MISMATCH/);}finally{await writeFile(asset,bytes);}
 assert.equal((await replayDirectory(exploration)).verified,true);await writeFile(join(output,'browser-evidence.json'),JSON.stringify({source:before,runs:browserEvidence,tamperCases:edits.map(x=>x.name).concat('reason image bytes'),liveAPIRequests:0},null,2));
});

test('independent offline audit: all twelve predecessor runs replay and rejected o2 is a mechanical-only counterfactual',async(t)=>{
 const manifestPath='reports/deferral-reason-2026-10-28/live/manifest.json';let manifest:any;try{manifest=JSON.parse(await readFile(manifestPath,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT'){t.skip('Local predecessor evidence is unavailable');return;}throw e;}
 assert.equal(manifest.records.length,12);const replays=[];for(const record of manifest.records){const path=join('reports/deferral-reason-2026-10-28/live',record.dir??record.id,'exploration');const result=await replayDirectory(path);assert.equal(result.verified,true,record.id);replays.push({id:record.id,path,...result});}
 const counterfactual=[];for(const id of ['revisit-alpha-r1-reason','revisit-beta-r2-reason']){const path=join('reports/deferral-reason-2026-10-28/live',id,'exploration/result.json'),bytes=await readFile(path),saved=JSON.parse(bytes.toString()),step=saved.steps[2],d=step.deliberation,context=d.modelInput.deferralReasonContext,sources=[context.current,...d.modelInput.memoryObservations.map((s:any)=>src(s.observationId,s.imageSha256))],raw=structuredClone(step.deferral.state),a=admitReasons(d.response,context,raw,sources,legacy),b=admitReasons(d.response,context,raw,sources,excursion);assert.deepEqual(a.record,step.deferralReason.record);assert.deepEqual(a.memory,step.deferralReason.memory);assert.equal(a.record.capture?.admitted,false);assert.equal(b.record.capture?.admitted,true);assert.equal(b.memory.entries[0].basis.observationId,'o2');assert.deepEqual(raw,step.deferral.state);counterfactual.push({id,inputSha256:sha(bytes),old:a.record.capture,new:b.record.capture,kind:'same-saved-response-mechanical-only',APIRequests:0});}
 await writeFile(join(output,'legacy-replays.json'),JSON.stringify({replays,counterfactual,liveAPIRequests:0},null,2));
});

test('independent comparison gate uses nested fresh output, twelve fixed slots and preserves available predecessor ledgers',async()=>{
 const prior=await snapshotReasonPriorLedgers('reason-admission');try{await readFile('reports/deferral-reason-2026-10-28/live/manifest.json');assert.equal(prior.length,46);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')assert.equal(prior.length,0);else throw error;}
 const root=join(output,'nested','fresh','comparison');const run=await runDeferralReasonExperiment({out:root,mock:true,comparison:'reason-admission',limit:2});assert.equal(run.status,'COMPLETED');assert.equal(run.requests,0);
 const manifest=JSON.parse(await readFile(join(root,'manifest.json'),'utf8')),summary=JSON.parse(await readFile(join(root,'summary.json'),'utf8'));assert.deepEqual(manifest.fullSchedule,reasonSchedule());assert.equal(manifest.fullSchedule.length,12);assert.equal(summary.pairs[0].consistent,true);assert.equal(manifest.sourceHash,before.sourceHash);assert.equal(manifest.revision,before.revision);assert.equal(manifest.limits.phaseMaximumRequests,288);assert.equal(manifest.limits.parallel,1);assert.equal(manifest.inputComponents.shared.additionalAPIStages,0);assert.equal(manifest.inputComponents.shared.attempts,1);assert.equal(manifest.humanInputsRead,false);assert.equal(manifest.performanceEvidence,false);assert.equal(JSON.parse(await readFile(join(root,'prior-ledger-check.json'),'utf8')).checked,prior.length);assert.deepEqual(await snapshotReasonPriorLedgers('reason-admission'),prior);await assert.rejects(runDeferralReasonExperiment({out:root,mock:true,comparison:'reason-admission',limit:2}),{code:'EEXIST'});
 const after=await sourceIdentity();assert.equal(after.sourceHash,before.sourceHash);assert.equal(after.revision,before.revision);await writeFile(join(output,'source-gate.json'),JSON.stringify({before,after,sourceUnchanged:true,liveAPIRequests:0},null,2));
});
