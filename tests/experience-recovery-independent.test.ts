import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {humanJevProfile} from '../runner/human-jev-profiles.js';
import {runHumanJev} from '../runner/human-jev-experiment.js';
import {replayDirectory} from '../runner/virtual-beta-replay.js';
import {sha} from '../runner/virtual-beta-core.js';
import {LocalExplorationPage} from '../pages/LocalExplorationPage.js';
import {beginExperience,arriveExperience,experienceQuestions,experienceContext,experienceCriteria} from '../jev/virtual-beta/experience.js';
import type {ExperienceMemory} from '../jev/virtual-beta/experience-contracts.js';
import type {UserObservation} from '../jev/virtual-beta/contracts.js';

const root=resolve('reports/experience-recovery-2026-10-28/independent-fixtures');
const invocation=Date.now()+'-'+process.pid;
const json=async(path:string)=>JSON.parse(await readFile(path,'utf8'));
async function fixture(name:string){
 const dir=join(root,invocation+'-'+name);await mkdir(dir,{recursive:true});
 const ledger=join(dir,'ledger.json');await writeFile(ledger,JSON.stringify({schemaVersion:1,status:'APPROVED',phase:'INDEPENDENT_FETCH_STUB_ONLY',newMaximum:24,perRunMaximum:12,used:0,attempts:[]}));return {dir,ledger};
}
function answer(body:any,actual='wait',proposed=actual){
 return {model:'jev-1.14.0',answers:Object.fromEntries(Object.entries(body.questions).map(([id,q]:[string,any])=>{
  const choice=id==='nextAction'?proposed:id==='decisionBasis'?'uncertainty':id==='knowledge'?'insufficient':id==='goal'?'unsatisfied':id==='goalEvidence'||id.startsWith('evidence_')?body.state.observation.id:id.startsWith('effect_')?'advances':id==='experienceProgress'?'advances':id==='experienceExpectation'?'supported':'none';
  assert.ok(Object.hasOwn(q.criteria,choice),id+':'+choice);
  return [id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,id==='nextAction'&&proposed!==actual?k===actual?0.9:k===proposed?0.09:0:k===choice?1:0]))}];
 }))};
}
const response=(value:any)=>new Response(JSON.stringify(value),{status:200});
async function localHTTP(fn:(body:any,options:RequestInit|undefined)=>Response|Promise<Response>,run:()=>Promise<void>){
 const previousFetch=globalThis.fetch,previousKey=process.env.AI_GATEWAY_API_KEY;
 process.env.AI_GATEWAY_API_KEY='INDEPENDENT_LOCAL_ONLY';
 globalThis.fetch=async(url,options)=>{assert.equal(String(url),'https://ai-gateway.vercel.sh/typesafe/v1/systemone');return fn(JSON.parse(String(options?.body)),options);};
 try{await run();}finally{globalThis.fetch=previousFetch;if(previousKey===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=previousKey;}
}
const observation=(i:number,hash='image-'+i):UserObservation=>({id:'o'+i,imageSha256:hash,visibleText:[],fixation:{x:640,y:450},candidateIds:['e4','e5','done','wait']});

test('independent: opt-in profile preserves frozen baseline and deliberation limits and candidates stay legal',()=>{
 const baseline=humanJevProfile(),delib=humanJevProfile('deliberation'),next=humanJevProfile('experience');
 assert.deepEqual(baseline,{config:{schemaVersion:1,id:'human-screen-baseline',vision:{mode:'crop',clearWidth:4096,clearHeight:4096,blurRadius:12},state:{enabled:true,memoryCapacity:3},selection:{mode:'argmax',seed:20261028},behavior:'goal',maxUIActions:15,maxLooks:3,maxDecisions:12,maxAPICalls:12,maxRunMs:180000,modeledActionMs:null},maximumRequests:13,explorationMaximum:12,reviewMaximum:1,perRunMaximum:12});
 const {id,experience,...config}=next.config;const {id:oldId,...oldConfig}=delib.config;assert.deepEqual(config,oldConfig);
 assert.equal(delib.config.experience,undefined);assert.equal(next.maximumRequests,24);assert.equal(next.reviewMaximum,0);assert.deepEqual(experience,{enabled:true,capacity:8});
});

test('independent: image expiration never revives source evidence; eight independent transitions do not mix recycled e4 IDs',()=>{
 let memory:ExperienceMemory|undefined;
 for(let i=1;i<=11;i++){const current=observation(i),intent=beginExperience(current,'e4',{type:'click',elementId:'e4'});memory=arriveExperience(memory,intent,observation(i+1),'performed',{enabled:true,capacity:8});}
 assert.equal(memory!.transitions.length,8);assert.deepEqual(memory!.transitions.map(t=>t.intent.source.observationId),['o4','o5','o6','o7','o8','o9','o10','o11']);
 const attached=[observation(10),observation(11),observation(12)].map(o=>({observationId:o.id,imageSha256:o.imageSha256}));
 assert.equal(Object.keys(experienceQuestions(memory!,attached)).length,3);
 assert.deepEqual(experienceQuestions(memory!,attached.filter(s=>s.observationId!=='o11')),{});
 assert.equal(experienceContext(memory,observation(12)).transitions[0].intent.source.observationId,'o4');
 const criteria={e4:'revisit allowed',e5:'alternative allowed',done:'done allowed',wait:'wait allowed'};
 assert.deepEqual(experienceCriteria(criteria,memory,observation(30,'unseen')),criteria);
 const samePage=experienceCriteria(criteria,memory,observation(30,'image-4'));
 assert.match(samePage.e4,/source=o4;/);assert.doesNotMatch(samePage.e4,/source=o5;/);assert.deepEqual(Object.keys(samePage),Object.keys(criteria));assert.equal(samePage.done,criteria.done);
});

test('independent real wrapper: none evidence reaches action; normalized argmax executes a repeated candidate despite proposed done',async(t)=>{
 t.mock.method(process,'loadEnvFile',()=>{throw new Error('ENV_READ_FORBIDDEN');});
 const {dir,ledger}=await fixture('propagation');let actions=0,assessments=0;
 await localHTTP((body,options)=>{
  assert.equal(new Headers(options?.headers).get('TypeSafe-Danger-Zone-Long-Context'),'true');
  const state=body.state;assert.equal(state.observation.screen,undefined);assert.equal(state.exploration.charter.oracle,undefined);assert.equal(state.exploration.persona,undefined);
  assert.ok(state.userState.memory.length<=3);assert.ok(state.userState.memory.every((m:any)=>m.visibleText.length===0));
  if(body.questions.knowledge){
   assessments++;
   assert.equal(Object.keys(body.questions).filter(k=>k.startsWith('experience')).length,assessments===1?0:3);
   if(assessments>1){const transition=state.userState.experience.transitions.at(-1);assert.equal(transition.result.observationId,state.observation.id);assert.equal(transition.judgment,undefined);}
  }else{
   actions++;assert.deepEqual(Object.keys(body.questions.nextAction.criteria),state.observation.candidateIds);
   assert.ok(body.questions.nextAction.criteria.done);if(actions===1||actions===4)assert.ok(body.questions.nextAction.criteria.e4);
   if(actions>1){const j=state.userState.experience.transitions.at(-1).judgment;assert.equal(j.progress,'unknown');assert.equal(j.expectation,'unknown');assert.equal(j.evidence,undefined);assert.deepEqual(j.adjustments,['NO_ADMITTED_EVIDENCE:progress=advances->unknown','NO_ADMITTED_EVIDENCE:expectation=supported->unknown']);assert.deepEqual(state.experienceContext.transitions,state.userState.experience.transitions);}
   if(actions===4){assert.equal(state.userState.experience.transitions.length,3);assert.ok(!state.userState.memory.some((m:any)=>m.observationId==='o1'));assert.ok(state.experienceContext.returnedRoutes.length>0);}
  }
  const actual=actions===3?'e3':actions===5?'done':'e4';return response(answer(body,actual,body.questions.nextAction&&actions<5?'done':actual));
 },async()=>{
  const saved=await runHumanJev({out:join(dir,'run'),mock:false,mode:'experience',phaseBudget:ledger,longContext:true});
  assert.equal(actions,5);assert.equal(assessments,5);assert.equal(saved.result.apiCalls,10);assert.equal(saved.result.uiActions,4);assert.equal(saved.result.termination,'SUBJECTIVE_DONE');assert.equal(saved.result.objectiveSuccess,false);
  const step=saved.result.steps[3];assert.equal(step.selection!.modelChoice,'done');assert.equal(step.selection!.selected,'e4');assert.equal(step.selection!.normalization.rawTotal,0.99);assert.deepEqual(step.selection!.adjustments,[]);assert.deepEqual(step.action,{type:'click',elementId:'e4'});
  assert.equal(saved.result.steps[4].userState!.experience!.transitions.at(-1)!.intent.candidateId,'e4');assert.equal((await json(ledger)).used,10);assert.equal((await replayDirectory(join(saved.root,'exploration'))).choices,5);
 });
});

test('independent real adapter: each malformed experience distribution ends INVALID_DISTRIBUTION; HTTP failure stays API_ERROR',async()=>{
 for(const failed of ['experienceProgress','experienceExpectation','experienceEvidence','http']){
  const {dir,ledger}=await fixture('invalid-'+failed);let calls=0;
  await localHTTP(body=>{calls++;if(calls===3&&failed==='http')return new Response('',{status:503});const value=answer(body);if(calls===3)value.answers[failed].probabilities={forged:1};return response(value);},async()=>{
   const saved=await runHumanJev({out:join(dir,'run'),mock:false,mode:'experience',phaseBudget:ledger});
   assert.equal(calls,3);assert.equal(saved.result.termination,failed==='http'?'API_ERROR':'INVALID_DISTRIBUTION');assert.equal(saved.result.perceivedDone,false);assert.equal(saved.result.validForComparison,false);assert.equal(saved.result.uiActions,0);assert.equal(saved.result.steps[1].response,undefined);assert.equal(saved.result.steps[1].selection,undefined);
   const memory=saved.result.steps[1].userState!.experience!;assert.equal(memory.transitions.length,1);assert.equal(memory.transitions[0].judgment,undefined);
   assert.equal((await json(ledger)).used,3);assert.equal(saved.review.reason,'PROFILE_DISABLED');
  });
 }
});

test('independent real wrapper: trial memory is isolated and failed UI execution never fabricates an experience result',async(t)=>{
 for(let trial=0;trial<2;trial++){
  const {dir,ledger}=await fixture('fresh-'+trial);let actions=0;
  await localHTTP(body=>{if(body.questions.knowledge&&actions===0){assert.deepEqual(body.state.userState.experience,{schemaVersion:1,transitions:[]});assert.equal(body.state.userState.revision,1);assert.deepEqual(body.state.experienceContext.returnedRoutes,[]);}if(body.questions.nextAction)actions++;return response(answer(body,trial===0&&actions===1?'wait':'done'));},async()=>{
   const saved=await runHumanJev({out:join(dir,'run'),mock:false,mode:'experience',phaseBudget:ledger});assert.equal(saved.result.termination,'SUBJECTIVE_DONE');assert.equal(saved.result.steps[0].selection!.drawIndex,0);assert.equal(saved.result.steps[0].userState!.experience!.transitions.length,0);assert.equal(saved.result.steps.at(-1)!.userState!.experience!.transitions.length,trial===0?1:0);
  });
 }
 t.mock.method(LocalExplorationPage.prototype,'act',async()=>{throw new Error('INDEPENDENT_INJECTED_ACTION_FAILURE');});
 const {dir,ledger}=await fixture('action-error');
 await localHTTP(body=>response(answer(body,'e4')),async()=>{
  const saved=await runHumanJev({out:join(dir,'run'),mock:false,mode:'experience',phaseBudget:ledger});assert.equal(saved.result.termination,'ACTION_ERROR');assert.equal(saved.result.uiActions,0);assert.equal(saved.result.steps.length,1);assert.deepEqual(saved.result.steps[0].userState!.experience!.transitions,[]);assert.equal(saved.result.validForComparison,false);assert.equal(saved.result.perceivedDone,false);
 });
});

test('independent replay: reconstruction rejects altered experience and context even after input hashes are recomputed',async()=>{
 const {dir,ledger}=await fixture('replay');let actions=0;
 await localHTTP(body=>{if(body.questions.nextAction)actions++;return response(answer(body,actions===3?'done':'wait'));},async()=>{
  const saved=await runHumanJev({out:join(dir,'run'),mock:false,mode:'experience',phaseBudget:ledger}),exploration=join(saved.root,'exploration'),path=join(exploration,'result.json'),original=await json(path);
  assert.equal((await replayDirectory(exploration)).verified,true);
  const changes=[(r:any)=>{r.steps[1].userState.experience.transitions[0].intent.prediction='conflicts';},(r:any)=>{r.steps[1].modelInput.experienceContext.transitions[0].execution='performed';},(r:any)=>{r.steps[1].deliberation.modelInput.experienceContext.returnedRoutes=[];r.steps[1].deliberation.modelInput.experienceContext.transitions[0].intent.prediction='conflicts';},(r:any)=>{r.steps[1].modelInput.userState.experience.transitions[0].judgment.progress='conflicts';}];
  for(const change of changes){const tampered=structuredClone(original);change(tampered);for(const s of tampered.steps){if(s.modelInput)s.inputSha256=sha(JSON.stringify({input:s.modelInput,questions:s.questions,assets:s.assetFiles}));if(s.deliberation){const d=s.deliberation;d.inputSha256=sha(JSON.stringify({input:d.modelInput,questions:d.questions,assets:d.assetFiles}));}}await writeFile(path,JSON.stringify(tampered));await assert.rejects(replayDirectory(exploration),/EXPERIENCE_(?:ARRIVAL|JUDGMENT)_MISMATCH/);}
  await writeFile(path,JSON.stringify(original));assert.equal((await replayDirectory(exploration)).assessments,3);
 });
});

test('independent basis opt-in: real gateway body differs only in evidence explanation; none admission and the 24-request budget stay fixed',async(t)=>{
 t.mock.method(process,'loadEnvFile',()=>{throw new Error('ENV_READ_FORBIDDEN');});
 const captures:any[][]=[[],[]];
 for(const [index,mode] of ['experience','experience-basis'].entries()){
  const {dir,ledger}=await fixture('basis-comparison-'+index);let actions=0;
  await localHTTP((body,options)=>{
   assert.equal(new Headers(options?.headers).get('TypeSafe-Danger-Zone-Long-Context'),'true');captures[index].push(structuredClone(body));
   if(body.questions.nextAction)actions++;
   return response(answer(body,actions===2?'done':'wait'));
  },async()=>{
   const saved=await runHumanJev({out:join(dir,'run'),mock:false,mode:mode as any,phaseBudget:ledger,longContext:true});
   assert.equal(saved.result.termination,'SUBJECTIVE_DONE');assert.equal(saved.result.apiCalls,4);assert.equal(saved.result.steps.length,2);assert.equal(saved.result.config.maxAPICalls,24);assert.equal(saved.result.config.maxDecisions,12);
   assert.equal((saved.result.config.experience as any).evidenceMode,index===0?undefined:'basis');
   const judgment=saved.result.steps[1].userState!.experience!.transitions[0].judgment!;
   assert.deepEqual(judgment,{kind:'model-assessment-not-fact',progress:'unknown',expectation:'unknown',adjustments:['NO_ADMITTED_EVIDENCE:progress=advances->unknown','NO_ADMITTED_EVIDENCE:expectation=supported->unknown']});
   const budget=await json(ledger);assert.equal(budget.newMaximum,24);assert.equal(budget.used,4);assert.equal(budget.remaining,20);assert.ok(budget.attempts.every((a:any)=>a.metadata.attempts===1));assert.equal(saved.review.reason,'PROFILE_DISABLED');
   assert.equal((await replayDirectory(join(saved.root,'exploration'))).assessments,2);
  });
 }
 assert.equal(captures[0].length,4);assert.equal(captures[1].length,4);
 for(let i=0;i<4;i++){
  const previous=structuredClone(captures[0][i]),basis=structuredClone(captures[1][i]);
  assert.deepEqual(basis.state,previous.state);assert.deepEqual(basis.assets,previous.assets);
  const oldEvidence=previous.questions.experienceEvidence,newEvidence=basis.questions.experienceEvidence;
  if(i===2){assert.ok(oldEvidence&&newEvidence);assert.equal(oldEvidence.type,newEvidence.type);assert.deepEqual(Object.keys(newEvidence.criteria),Object.keys(oldEvidence.criteria));assert.notDeepEqual(newEvidence,oldEvidence);}
  else assert.deepEqual(newEvidence,oldEvidence);
  delete previous.questions.experienceEvidence;delete basis.questions.experienceEvidence;
  assert.deepEqual(basis,previous,'Only experienceEvidence explanation may differ in gateway request '+i);
 }
});
