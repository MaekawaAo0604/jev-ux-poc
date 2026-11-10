import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {runHumanJev} from '../runner/human-jev-experiment.js';
import {replayDirectory} from '../runner/virtual-beta-replay.js';
import {sourceIdentity} from '../runner/virtual-beta-source.js';
import {sha} from '../runner/virtual-beta-core.js';
import {prepareReasonContext,requiredReasonSources,reasonQuestions,admitReasons,effectiveFromReasons} from '../jev/virtual-beta/deferral-reason.js';
import type {DeferralReasonMemory} from '../jev/virtual-beta/deferral-reason-contracts.js';
import type {DeferralMemory} from '../jev/virtual-beta/deferral-contracts.js';
import type {ExperienceSource} from '../jev/virtual-beta/experience-contracts.js';
import type {BetaCandidates,UserObservation} from '../jev/virtual-beta/contracts.js';
import type {ChoiceQuestion} from '../jev/client.js';

// Independent author: no real credentials, environment files, human records or live API.
process.env.AI_GATEWAY_API_KEY='INDEPENDENT_REASON_FETCH_STUB_ONLY';
process.loadEnvFile=()=>{throw Error('ENV_READ_FORBIDDEN');};
const verificationIdentity=await sourceIdentity();
const {revision,sourceHash}=verificationIdentity;
const invocation=Date.now()+'-'+process.pid;
const output=resolve('reports/deferral-reason-2026-10-28/independent-'+invocation);
await mkdir(resolve('reports/deferral-reason-2026-10-28'),{recursive:true});
await mkdir(output,{recursive:false});
const config={enabled:true,capacity:8,maxReasonImages:1};
const src=(observationId:string,imageSha256:string):ExperienceSource=>({observationId,imageSha256});
const candidates:BetaCandidates={e1:{action:{type:'click',elementId:'e1'},label:'entry'},e2:{action:{type:'click',elementId:'e2'},label:'alternative'}};
const observation=(id='o9'):UserObservation=>({id,imageSha256:'home',candidateIds:Object.keys(candidates),fixation:{x:0,y:0},visibleText:[]});
const generation=(n=1)=>({imageSha256:'home',candidateId:'e1',fromObservationId:'o'+n,toObservationId:'o'+(n+2)});
function reason(n=1){return {...generation(n),kind:'model-hypothesis-not-fact' as const,category:'prerequisite' as const,basis:src('o'+(n+1),'blocked-'+n),capturedAt:src('o'+(n+2),'home')};}
const raw=(n=1):DeferralMemory=>({schemaVersion:1,entries:[{...generation(n),evidence:[src('o'+(n+1),'blocked-'+n)]}]});
function answer(questions:Record<string,ChoiceQuestion>,choices:Record<string,string>){return {model:'jev-1.14.0',answers:Object.fromEntries(Object.entries(questions).map(([id,q])=>{const choice=choices[id]??'none';assert.ok(Object.hasOwn(q.criteria,choice),id+':'+choice);return [id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,Number(k===choice)]))}];}))};}

test('independent source gate preserves the product snapshot throughout the test',async()=>{const actual=await sourceIdentity();assert.equal(actual.revision,revision);assert.equal(actual.sourceHash,sourceHash);await writeFile(join(output,'source-gate.json'),JSON.stringify({...actual,liveAPIRequests:0},null,2));});

test('independent negative matrix: progress/highest probability do not replace basis evidence',()=>{
 const memory:DeferralReasonMemory={schemaVersion:1,entries:[reason()]};
 const cases=[
  {name:'still blocks',status:'still_blocks',evidence:'o7',sources:[src('o2','blocked-1'),src('o7','new')]},
  {name:'unknown review',status:'unknown',evidence:'o7',sources:[src('o2','blocked-1'),src('o7','new')]},
  {name:'basis absent',status:'basis_changed',evidence:'o7',sources:[src('o7','new')]},
  {name:'no later source',status:'basis_changed',evidence:'none',sources:[src('o2','blocked-1')]},
  {name:'old image',status:'basis_changed',evidence:'o2',sources:[src('o2','blocked-1')]},
  {name:'later home pixels',status:'basis_changed',evidence:'o7',sources:[src('o2','blocked-1'),src('o7','home')]},
  {name:'later blocker pixels',status:'basis_changed',evidence:'o7',sources:[src('o2','blocked-1'),src('o7','blocked-1')]},
  {name:'future evidence',status:'basis_changed',evidence:'o10',sources:[src('o2','blocked-1'),src('o10','new')]},
 ];
 for(const c of cases){const context=prepareReasonContext(memory,raw(),undefined,observation(),candidates,config),sources=[...c.sources,src('o9','home')],q=reasonQuestions(context,sources),response=answer(q,{reasonReview0Status:c.status,reasonReview0Evidence:c.evidence});
  if(c.status!=='basis_changed')response.answers.reasonReview0Status.probabilities={basis_changed:.99,still_blocks:c.status==='still_blocks'?.01:0,unknown:c.status==='unknown'?.01:0};
  const result=admitReasons(response,context,raw(),sources,config);assert.deepEqual(result.effectiveDeferrals,raw(),c.name);assert.deepEqual(result.record.releasedCandidates,[],c.name);
 }
 const context=prepareReasonContext(memory,raw(),undefined,observation(),candidates,config),sources=[src('o2','blocked-1'),src('o7','new'),src('o9','home')],result=admitReasons(answer(reasonQuestions(context,sources),{reasonReview0Status:'basis_changed',reasonReview0Evidence:'o7'}),context,raw(),sources,config);
 assert.equal(result.effectiveDeferrals.entries.length,0);assert.deepEqual(raw().entries[0].evidence,[src('o2','blocked-1')]);
 for(const change of [{candidateId:'e2'},{imageSha256:'other-home'},{fromObservationId:'o4',toObservationId:'o6'}]){const replacement={schemaVersion:1 as const,entries:[{...raw().entries[0],...change}]};assert.deepEqual(effectiveFromReasons(result.memory,replacement),replacement);}
});

test('independent retention boundary: evicted reasons cannot retrieve pixels or release new generations',()=>{
 const memory:DeferralReasonMemory={schemaVersion:1,entries:Array.from({length:9},(_,i)=>reason(i*3+1))};
 const latest=raw(25),context=prepareReasonContext(memory,latest,undefined,observation('o30'),candidates,config);
 assert.equal(context.memory.entries.length,8);assert.equal(context.memory.entries[0].fromObservationId,'o4');assert.deepEqual(requiredReasonSources(context,config),[src('o26','blocked-25')]);
 const oldContext=prepareReasonContext(memory,raw(),undefined,observation('o30'),candidates,config);assert.deepEqual(requiredReasonSources(oldContext,config),[]);assert.equal(oldContext.reviews.length,0);
 const unknown={schemaVersion:1 as const,entries:[{...reason(),category:'unknown' as const}]},ctx=prepareReasonContext(unknown,raw(),undefined,observation(),candidates,config),sources=[src('o2','blocked-1'),src('o7','new'),src('o9','home')],result=admitReasons(answer(reasonQuestions(ctx,sources),{reasonReview0Status:'basis_changed',reasonReview0Evidence:'o7'}),ctx,raw(),sources,config);assert.deepEqual(result.effectiveDeferrals,raw());
});

const savedRuns:any[]=[];
async function browserRun(mode:'experience-defer'|'experience-reason',status='basis_changed',name:string=mode,unchanged=false){
 const dir=join(output,name);await mkdir(dir);const ledger=join(dir,'ledger.json');await writeFile(ledger,JSON.stringify({schemaVersion:1,status:'APPROVED',phase:'INDEPENDENT_FETCH_STUB_ONLY',newMaximum:24,perRunMaximum:12,used:0,attempts:[]}));
 const bodies:any[]=[],bodyHashes:string[]=[];const previous=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{
  assert.equal(String(url),'https://ai-gateway.vercel.sh/typesafe/v1/systemone');assert.equal(new Headers(options?.headers).get('Authorization'),'Bearer INDEPENDENT_REASON_FETCH_STUB_ONLY');assert.equal(new Headers(options?.headers).get('TypeSafe-Danger-Zone-Long-Context'),'true');
  const body=JSON.parse(String(options?.body));bodies.push(body);bodyHashes.push(sha(String(options?.body)));
  const input=body.state,n=Number(input.observation.id.slice(1));
  assert.equal(input.observation.screen,undefined);assert.equal(input.exploration.charter.oracle,undefined);assert.equal(input.exploration.persona,undefined);assert.equal(input.audit,undefined);assert.equal(input.deferral,undefined);
  assert.ok(input.userState.memory.length<=3);assert.ok((input.userState.experience?.transitions.length??0)<=8);assert.ok(Object.keys(body.assets).length<=4);assert.ok((input.reasonObservations?.length??0)<=1);assert.ok((input.deferralReasonContext?.memory.entries.length??0)<=8);
  assert.ok(!/data-holdout|data-testid|objectiveAssessment|rawScreenshot|regionsOfInterest|humanInputsRead/.test(JSON.stringify(input)));
  for(const ref of [...input.memoryObservations,...(input.reasonObservations??[]),{observationId:input.observation.id,image:'current'}]){assert.ok(body.assets[ref.image]);const hash=sha(Buffer.from(body.assets[ref.image].data_base64,'base64'));if(ref.imageSha256)assert.equal(hash,ref.imageSha256);}
  if(mode==='experience-defer'){assert.equal(input.deferralReasonContext,undefined);assert.equal(input.reasonObservations,undefined);assert.ok(!Object.keys(body.questions).some(id=>id.startsWith('reasonCapture')||id.startsWith('reasonReview')));}
  if(n===6&&mode==='experience-reason'&&!unchanged){assert.deepEqual(input.reasonObservations.map((r:any)=>r.observationId),['o2']);assert.ok(!input.memoryObservations.some((r:any)=>r.observationId==='o2'));assert.ok(Object.keys(body.assets).includes('reason_0'));}
  const action=(unchanged?['','e4','e4','e3','e4','e5','e4','done']:['','e2','e1','e3','e2','e1','e2','e2','done'])[n]??'done';
  const response=answer(body.questions,Object.fromEntries(Object.entries(body.questions).map(([id,q]:[string,any])=>[id,id==='nextAction'?action:id==='decisionBasis'?'goal':id==='knowledge'?'sufficient':id==='goal'?(n>=8?'satisfied':'unsatisfied'):id==='goalEvidence'||id.startsWith('evidence_')||id==='experienceEvidence'?'o'+n:id.startsWith('effect_')?'advances':id==='experienceProgress'?(n===5?'advances':'neutral'):id==='experienceExpectation'?'not_supported':id==='reasonCaptureCategory'?'prerequisite':id==='reasonCaptureEvidence'?(Object.hasOwn(q.criteria,'o2')?'o2':'none'):id.startsWith('reasonReview')&&id.endsWith('Status')?status:id.startsWith('reasonReview')&&id.endsWith('Evidence')?(Object.hasOwn(q.criteria,'o5')?'o5':'none'):'none'])));
  if(body.questions.nextAction&&unchanged&&(n===4||n===6))response.answers.nextAction.probabilities=Object.fromEntries(Object.keys(body.questions.nextAction.criteria).map(k=>[k,k==='e4'?.95:k==='e3'?.04:k==='done'?.01:0]));
  if(body.questions.nextAction&&!unchanged&&n===6)response.answers.nextAction.probabilities=Object.fromEntries(Object.keys(body.questions.nextAction.criteria).map(k=>[k,k==='e2'?.97:k==='e3'?.02:k==='stuck'?.01:0]));
  return new Response(JSON.stringify(response),{status:200});
 };
 try{const saved=await runHumanJev({out:join(dir,'run'),mock:false,mode,phaseBudget:ledger,longContext:true,...(unchanged?{}:{holdoutFixture:{task:'revisit' as const,variant:'alpha' as const}})});const manifest=JSON.parse(await readFile(join(saved.root,'manifest.json'),'utf8'));assert.equal(manifest.revision,revision);assert.equal(manifest.sourceHash,sourceHash);assert.equal(manifest.actualAPIRequests,bodies.length);assert.equal(manifest.humanInputsRead,false);assert.equal((JSON.parse(await readFile(ledger,'utf8'))).used,bodies.length);assert.equal(bodies.length,saved.result.decisions*2);const evidence={name,revision,sourceHash,liveAPIRequests:0,interceptedRequests:bodies.length,bodyHashes,actualPath:saved.result.steps.map(s=>s.selection?.selected),objective:saved.result.objectiveAssessment,termination:saved.result.termination};await writeFile(join(dir,'stub-evidence.json'),JSON.stringify(evidence,null,2));savedRuns.push(evidence);return {...saved,bodies,dir};}finally{globalThis.fetch=previous;}
}

test('independent normal adapter and browser: retained original pixels release only effective state and alter the real action',async()=>{
 const old=await browserRun('experience-defer','basis_changed','old-control'),released=await browserRun('experience-reason','basis_changed','changed-basis'),blocked=await browserRun('experience-reason','still_blocks','still-blocks');
 for(const saved of [old,released,blocked])assert.equal((await replayDirectory(join(saved.root,'exploration'))).verified,true);
 const before:any=old.result.steps[5],after:any=released.result.steps[5],same:any=blocked.result.steps[5];
 assert.equal(before.deferral.state.entries.some((e:any)=>e.candidateId==='e2'),true);assert.equal(before.selection.selected,'e3');assert.equal(before.selection.policy.weights.e2,.01);
 assert.equal(after.deferral.state.entries.some((e:any)=>e.candidateId==='e2'),true);assert.equal(after.deferralReason.effectiveState.entries.some((e:any)=>e.candidateId==='e2'),false);assert.deepEqual(after.deferralReason.record.releasedCandidates,['e2']);assert.equal(after.selection.raw.e2,.97);assert.equal(after.selection.policy.weights.e2,1);assert.equal(after.selection.selected,'e2');assert.deepEqual(after.action,{type:'click',elementId:'e2'});assert.equal(after.outcome,'UI_PERFORMED');assert.equal(released.result.objectiveAssessment.value,true);assert.equal(released.result.uiActions,7);
 assert.equal(same.deferralReason.effectiveState.entries.some((e:any)=>e.candidateId==='e2'),true);assert.deepEqual(same.deferralReason.record.releasedCandidates,[]);assert.equal(same.selection.selected,'e3');assert.equal(same.selection.policy.weights.e2,.01);
 const exploration=join(released.root,'exploration'),path=join(exploration,'result.json'),original=await readFile(path,'utf8'),parsed=JSON.parse(original);
 const edits=[
  {name:'release record',change:(r:any)=>{r.steps[5].deferralReason.record.reviews[0].newEvidence.observationId='o2';},pattern:/REASON_RECORD_MISMATCH/},
  {name:'effective state',change:(r:any)=>{r.steps[5].deferralReason.effectiveState.entries=r.steps[5].deferral.state.entries;},pattern:/REASON_RECORD_MISMATCH/},
  {name:'generation',change:(r:any)=>{r.steps[5].deferralReason.memory.entries[0].fromObservationId='o2';},pattern:/REASON_RECORD_MISMATCH/},
  {name:'rehash forged source',change:(r:any)=>{const d=r.steps[5].deliberation;d.modelInput.reasonObservations[0].observationId='o500';d.inputSha256=sha(JSON.stringify({input:d.modelInput,questions:d.questions,assets:d.assetFiles}));},pattern:/REASON_SOURCE_NOT_PREVIOUSLY_OBSERVED/},
 ];
 try{for(const edit of edits){const modified=structuredClone(parsed);edit.change(modified);await writeFile(path,JSON.stringify(modified));await assert.rejects(replayDirectory(exploration),edit.pattern,edit.name);}}finally{await writeFile(path,original);}
 const asset=join(exploration,after.deliberation.assetFiles.reason_0.file),bytes=await readFile(asset),changed=Buffer.from(bytes);changed[changed.length-1]^=1;
 try{await writeFile(asset,changed);await assert.rejects(replayDirectory(exploration),/IMAGE_HASH_MISMATCH/);}finally{await writeFile(asset,bytes);}
 assert.equal((await replayDirectory(exploration)).verified,true);await writeFile(join(output,'browser-evidence.json'),JSON.stringify({revision,sourceHash,runs:savedRuns,tamperCases:edits.map(e=>e.name).concat('original basis pixels'),liveAPIRequests:0},null,2));
});

test('independent unchanged dead end: unrelated progress does not remove still-blocks memory or the real sampler weight',async()=>{
 const saved=await browserRun('experience-reason','still_blocks','unchanged-dead-end',true),step:any=saved.result.steps[5];
 assert.equal(step.vision.imageSha256,saved.result.steps[0].vision!.imageSha256);
 assert.equal(step.selection.raw.e4,.95);assert.equal(step.selection.policy.weights.e4,.01);assert.equal(step.selection.selected,'e3');assert.deepEqual(step.action,{type:'click',elementId:'e3'});
 assert.equal(step.deferralReason.effectiveState.entries.some((e:any)=>e.candidateId==='e4'),true);assert.deepEqual(step.deferralReason.record.releasedCandidates,[]);assert.equal(step.deferralReason.record.reviews[0].status,'still_blocks');assert.equal(step.deliberation.assessment.goal,'unsatisfied');
 assert.equal((await replayDirectory(join(saved.root,'exploration'))).verified,true);
 const identity=await sourceIdentity();assert.equal(identity.revision,revision);assert.equal(identity.sourceHash,sourceHash);
 await writeFile(join(output,'unchanged-evidence.json'),JSON.stringify(savedRuns.at(-1),null,2));
});

test('independent offline compatibility: local old deferral artifact replays when available',async(t)=>{
 const path='reports/temporary-deferral-2026-10-28/live-control/exploration';
 try{await readFile(join(path,'result.json'));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT'){t.skip('Local saved artifact is not checked in');return;}throw e;}
 const result=await replayDirectory(path);assert.equal(result.verified,true);await writeFile(join(output,'legacy-replay.json'),JSON.stringify({path,...result},null,2));
});
