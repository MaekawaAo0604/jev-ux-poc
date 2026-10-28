import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {runHumanJev} from '../runner/human-jev-experiment.js';
import {replayDirectory} from '../runner/virtual-beta-replay.js';
import {sourceIdentity} from '../runner/virtual-beta-source.js';
import {sha} from '../runner/virtual-beta-core.js';
import {createSampler,replaySelection,InvalidDistributionError} from '../jev/virtual-beta/selection.js';
import type {BetaCandidates} from '../jev/virtual-beta/contracts.js';

// All evaluator traffic uses the real adapter and this local fetch replacement.
// No .env, participant data, saved-input submission, or real API is used.
process.env.AI_GATEWAY_API_KEY='INDEPENDENT_FETCH_STUB_ONLY';
process.loadEnvFile=()=>{throw new Error('ENV_READ_FORBIDDEN');};
const root=resolve('reports/temporary-deferral-2026-10-28/independent-fixtures');
const invocation=Date.now()+'-'+process.pid;
const json=async(path:string)=>JSON.parse(await readFile(path,'utf8'));
const verificationIdentity=await sourceIdentity();
const frozenRevision=verificationIdentity.revision;
let sequence=0;
async function fixture(name:string){
 const dir=join(root,invocation+'-'+(++sequence)+'-'+name);await mkdir(dir,{recursive:true});
 const ledger=join(dir,'ledger.json');await writeFile(ledger,JSON.stringify({schemaVersion:1,status:'APPROVED',phase:'INDEPENDENT_FETCH_STUB_ONLY',newMaximum:24,perRunMaximum:12,used:0,attempts:[]}));return {dir,ledger};
}
type Script={action:string;distribution?:Record<string,number>;progress?:string;evidence?:boolean;http?:boolean;malformed?:string};
function answer(body:any,script:Script){
 return {model:'jev-1.14.0',answers:Object.fromEntries(Object.entries(body.questions).map(([id,q]:[string,any])=>{
  const choice=id==='nextAction'?script.action:id==='decisionBasis'?'goal':id==='knowledge'?'insufficient':id==='goal'?'unsatisfied':id==='goalEvidence'||id.startsWith('evidence_')?body.state.observation.id:id==='experienceEvidence'?(script.evidence===false?'none':body.state.observation.id):id.startsWith('effect_')?'advances':id==='experienceProgress'?(script.progress??'neutral'):id==='experienceExpectation'?'not_supported':'none';
  assert.ok(Object.hasOwn(q.criteria,choice),id+': '+choice);
  return [id,{choice,probabilities:id===script.malformed?{forged:1}:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,id==='nextAction'&&script.distribution?script.distribution[k]??0:k===choice?1:0]))}];
 }))};
}
async function run(name:string,mode:'experience-basis'|'experience-defer',scripts:Script[]){
 const {dir,ledger}=await fixture(name);const bodies:any[]=[],bodyHashes:string[]=[];let action=0;
 const previous=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{
  assert.equal(String(url),'https://ai-gateway.vercel.sh/typesafe/v1/systemone');
  assert.equal(new Headers(options?.headers).get('TypeSafe-Danger-Zone-Long-Context'),'true');
  const text=String(options?.body),body=JSON.parse(text);bodies.push(body);bodyHashes.push(sha(text));
  const input=body.state;
  assert.equal(input.observation.screen,undefined);assert.equal(input.exploration.charter.oracle,undefined);assert.equal(input.exploration.persona,undefined);
  assert.equal(input.deferral,undefined);assert.equal(input.audit,undefined);assert.equal(input.userState.deferrals,undefined);
  assert.ok(!/temporary-deferral|DEFER_WITH_ALTERNATIVES|ALTERNATIVES_EXHAUSTED|humanInputsRead/.test(text));
  const script=scripts[action];assert.ok(script,'script exhausted');
  if(body.questions.nextAction)action++;
  if(script.http&&body.questions.knowledge)return new Response('',{status:503});
  return new Response(JSON.stringify(answer(body,script)),{status:200});
 };
 try{
  const saved=await runHumanJev({out:join(dir,'run'),mock:false,mode,phaseBudget:ledger,longContext:true});
  const manifest=await json(join(saved.root,'manifest.json'));
  assert.equal(manifest.revision,frozenRevision);assert.equal(manifest.sourceHash,verificationIdentity.sourceHash);assert.equal(manifest.humanInputsRead,false);
  assert.equal(manifest.actualAPIRequests,bodies.length);assert.equal((await json(ledger)).used,bodies.length);
  await writeFile(join(dir,'stub-evidence.json'),JSON.stringify({realAPIRequests:0,interceptedRequests:bodies.length,bodyHashes,sourceHash:manifest.sourceHash,revision:manifest.revision,termination:saved.result.termination},null,2));
  return {...saved,dir,bodies,bodyHashes};
 }finally{globalThis.fetch=previous;}
}

test('independent real gateway: complete body equality on identical wait/done path and fresh trial isolation',async()=>{
 const identity=await sourceIdentity();assert.equal(identity.revision,frozenRevision);
 const scripts:Script[]=[{action:'wait'},{action:'done'}];
 const control=await run('body-control','experience-basis',scripts),policy=await run('body-policy','experience-defer',scripts);
 assert.equal(control.result.steps.length,2);assert.equal(policy.result.steps.length,2);
 assert.deepEqual(policy.bodies,control.bodies,'Complete gateway bodies must match for the same responses and actual path');
 assert.deepEqual(policy.bodyHashes,control.bodyHashes);
 assert.deepEqual(policy.result.steps[0].deferral!.state,{schemaVersion:1,entries:[]});
 assert.equal(policy.result.steps[0].selection!.drawIndex,0);
 assert.deepEqual(policy.result.steps[1].deferral!.state.entries,[]);
 assert.equal(policy.result.steps[1].deferral!.decision!.reason,'NO_DEFERRED_CANDIDATE');
 assert.ok(policy.result.steps.every(s=>Object.values(s.selection!.policy!.weights).every(w=>w===1)));
 assert.equal((await replayDirectory(join(policy.root,'exploration'))).choices,2);
 await writeFile(join(root,invocation+'-body-equality.json'),JSON.stringify({revision:identity.revision,sourceHash:identity.sourceHash,controlHashes:control.bodyHashes,policyHashes:policy.bodyHashes,equal:true,realAPIRequests:0},null,2));
});

test('independent real gateway: defer executes alternate, release executes revisit, reconstruction rejects state/reason/weight edits',async()=>{
 const distribution={e4:0.95,e3:0.04,done:0.01};
 const saved=await run('release','experience-defer',[{action:'e4'},{action:'e4'},{action:'e3'},{action:'e4',distribution},{action:'e5'},{action:'e4',distribution},{action:'done'}]);
 assert.equal(saved.result.termination,'SUBJECTIVE_DONE');assert.equal(saved.result.perceivedDone,true);assert.equal(saved.result.objectiveSuccess,false);
 const initial=saved.result.steps[0],deferred=saved.result.steps[3],released=saved.result.steps[5];
 assert.equal(initial.vision!.imageSha256,deferred.vision!.imageSha256);assert.equal(initial.vision!.imageSha256,released.vision!.imageSha256);
 const entry=deferred.deferral!.state.entries[0];assert.equal(entry.candidateId,'e4');assert.equal(entry.imageSha256,initial.vision!.imageSha256);assert.equal(entry.fromObservationId,'o1');assert.equal(entry.toObservationId,'o4');assert.ok(entry.evidence.length>0);
 assert.equal(deferred.deferral!.decision!.reason,'DEFER_WITH_ALTERNATIVES');assert.equal(deferred.selection!.raw.e4,0.95);assert.equal(deferred.selection!.policy!.before.e4,0.95);assert.equal(deferred.selection!.policy!.weights.e4,0.01);
 assert.ok(deferred.selection!.filtered.e4>0);assert.equal(deferred.selection!.selected,'e3');assert.deepEqual(deferred.action,{type:'click',elementId:'e3'});assert.equal(deferred.outcome,'UI_PERFORMED');assert.ok(saved.result.steps[4].audit!.url.endsWith('#usage'));
 assert.equal(released.deferral!.decision!.reason,'ALTERNATIVES_EXHAUSTED');assert.deepEqual(released.deferral!.decision!.deferredCandidates,['e3','e4']);assert.ok(Object.values(released.selection!.policy!.weights).every(w=>w===1));assert.equal(released.selection!.selected,'e4');assert.deepEqual(released.action,{type:'click',elementId:'e4'});assert.ok(saved.result.steps[6].audit!.url.endsWith('#settings'));
 assert.deepEqual(Object.keys(deferred.selection!.raw),Object.keys(deferred.selection!.filtered));
 for(const id of ['done','stuck','back','wait','reread','abandon'])if(Object.hasOwn(deferred.selection!.policy!.weights,id))assert.equal(deferred.selection!.policy!.weights[id],1);
 const exploration=join(saved.root,'exploration'),path=join(exploration,'result.json'),original=await json(path);assert.equal((await replayDirectory(exploration)).choices,7);
 const changes=[(r:any)=>{r.steps[3].deferral.state.entries[0].candidateId='e3';},(r:any)=>{r.steps[3].deferral.state.entries[0].evidence[0].imageSha256='forged';},(r:any)=>{r.steps[3].deferral.decision.reason='ALTERNATIVES_EXHAUSTED';},(r:any)=>{r.steps[3].selection.policy.weights.e4=1;},(r:any)=>{r.steps[3].deferral.decision.weights.e4=1;}];
 try{for(const change of changes){const tampered=structuredClone(original);change(tampered);await writeFile(path,JSON.stringify(tampered));await assert.rejects(replayDirectory(exploration),/DEFERRAL_(?:STATE|DECISION|WEIGHT)_MISMATCH/);}}finally{await writeFile(path,JSON.stringify(original));}
 assert.equal((await replayDirectory(exploration)).verified,true);
});

test('independent real gateway: grounded productive return and unadmitted nonprogress do not suppress ordinary revisits',async()=>{
 for(const [name,progress,evidence] of [['productive','advances',true],['unadmitted','neutral',false]] as const){
  const saved=await run(name,'experience-defer',[{action:'e4',progress,evidence},{action:'e4',progress,evidence},{action:'e3',progress,evidence},{action:'e4',distribution:{e4:0.95,e3:0.04,done:0.01},progress,evidence},{action:'done',progress,evidence}]);
  assert.equal(saved.result.steps.length,5);const revisit=saved.result.steps[3];assert.equal(revisit.vision!.imageSha256,saved.result.steps[0].vision!.imageSha256);assert.deepEqual(revisit.deferral!.state.entries,[]);assert.equal(revisit.deferral!.decision!.reason,'NO_DEFERRED_CANDIDATE');assert.equal(revisit.selection!.selected,'e4');assert.ok(saved.result.steps[4].audit!.url.endsWith('#settings'));assert.equal((await replayDirectory(join(saved.root,'exploration'))).choices,5);
 }
});

test('independent real gateway: malformed distributions and HTTP failures retain distinct non-abandonment classifications',async()=>{
 for(const failure of ['experienceProgress','http']){
  const saved=await run('failure-'+failure,'experience-defer',[{action:'wait'},{action:'done',...(failure==='http'?{http:true}:{malformed:failure})}]);
  assert.equal(saved.result.termination,failure==='http'?'API_ERROR':'INVALID_DISTRIBUTION');assert.equal(saved.result.perceivedDone,false);assert.equal(saved.result.validForComparison,false);assert.equal(saved.result.uiActions,0);assert.equal(saved.result.steps[1].selection,undefined);assert.equal(saved.result.steps[1].deferral,undefined);assert.equal(saved.bodies.length,3);assert.equal(saved.review.reason,'PROFILE_DISABLED');
 }
});

test('independent sampler boundary: positive weights preserve safety and seed replay; malformed weights never consume a draw',()=>{
 const candidates:BetaCandidates={a:{action:{type:'click',elementId:'a'},label:'a'},b:{action:{type:'click',elementId:'b'},label:'b'},done:{action:{type:'done'},label:'done'}};
 const raw={a:0.94,b:0.05,done:0.01},weights={a:0.01,b:1,done:1},sampler=createSampler({mode:'sample',seed:20261028});
 for(const invalid of [{a:0,b:1,done:1},{a:NaN,b:1,done:1},{a:1,b:1},{...weights,extra:1}])assert.throws(()=>sampler.select('a',raw,candidates,{},invalid as any),InvalidDistributionError);
 const actual=sampler.select('a',raw,candidates,{b:'INDEPENDENT_SAFETY_EXCLUSION'},weights),fresh=createSampler({mode:'sample',seed:20261028}).select('a',raw,candidates,{b:'INDEPENDENT_SAFETY_EXCLUSION'},weights);
 assert.equal(actual.drawIndex,0);assert.deepEqual(actual,fresh);assert.equal(actual.filtered.b,0);assert.equal(actual.policy!.before.b,0);assert.ok(actual.filtered.a>0);assert.deepEqual(replaySelection(actual,candidates),actual);
 const changed=structuredClone(actual);changed.policy!.before.b=0.1;assert.throws(()=>replaySelection(changed,candidates),InvalidDistributionError);
});

test('independent offline regression: frozen baseline, deliberation and experience artifacts remain replayable',async()=>{
 const paths=['reports/human-jev-2026-10-28/live/exploration','reports/human-deliberation-2026-10-28/live-round2/exploration','reports/experience-recovery-2026-10-28/live-basis/exploration'];
 const outcomes=[];
 for(const path of paths){try{await readFile(join(path,'result.json'));}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT'){outcomes.push({path,missing:true});continue;}throw error;}outcomes.push({path,...await replayDirectory(path)});}
 assert.equal(outcomes.filter(o=>'verified' in o&&o.verified).length,3);await writeFile(join(root,invocation+'-old-replay.json'),JSON.stringify(outcomes,null,2));
});
