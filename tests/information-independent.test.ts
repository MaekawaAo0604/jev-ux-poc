import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium, type Page} from 'playwright';
import {createServer} from 'vite';
import {parseCharter} from '../jev/persona.js';
import {comparisonConfigs} from '../jev/virtual-beta/config.js';
import {assessmentQuestions, admitAssessment, carryDeliberation, recordAssessment, assessedCriteria} from '../jev/virtual-beta/deliberation.js';
import {createUserState, updateUserState} from '../jev/virtual-beta/user-state.js';
import type {BetaCandidates, UserObservation, BetaConfig} from '../jev/virtual-beta/contracts.js';
import {runBeta, sha, BetaAdmissionError, BetaBudgetError, type ModelRequest} from '../runner/virtual-beta-core.js';
import {replayDirectory} from '../runner/virtual-beta-replay.js';

// Expectations derive from the public boundary: a hypothesis may inform a choice,
// but cannot certify success, suppress a candidate, manufacture evidence, or act after a stop.
const localModel = 'INDEPENDENT_LOCAL_STUB_NO_API';
const observation: UserObservation = {id:'present', imageSha256:'present-hash', visibleText:[], fixation:{x:10,y:10}, candidateIds:['a','done']};
const source = {observationId:observation.id, imageSha256:observation.imageSha256};
const candidates: BetaCandidates = {a:{action:{type:'click',elementId:'a'},label:'a'},done:{action:{type:'done'},label:'done'}};
const memoryConfig = {enabled:true,memoryCapacity:2};
function reply(request:Pick<ModelRequest,'questions'|'input'>, next='done', overrides:Record<string,string>={}) {
 const id = (request.input.observation as {id:string}|undefined)?.id ?? observation.id;
 return {model:localModel,answers:Object.fromEntries(Object.entries(request.questions).map(([key,q])=>{
  const choice=overrides[key] ?? (key==='nextAction'?next:key==='decisionBasis'?'uncertainty':key==='knowledge'?'insufficient':key==='goal'?'uncertain':key==='goalEvidence'||key.startsWith('evidence_')?id:key.startsWith('effect_')?'unknown':Object.keys(q.criteria)[0]);
  return [key,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k===choice?1:0]))}];
 }))};
}
const config=():BetaConfig=>({...comparisonConfigs(17,'crop')[3],id:'independent-information',maxAPICalls:4,maxDecisions:1,maxRunMs:90000,selection:{mode:'argmax',seed:17},deliberation:memoryConfig});
const charter=parseCharter(JSON.parse(await readFile('experiments/persona/charter-semantic-preservation.json','utf8')));
async function browserCase(fn:(page:Page,dir:string,baseURL:string)=>Promise<void>) {
 const dir=await mkdtemp(join(tmpdir(),'information-independent-'));
 const server=await createServer({server:{host:'127.0.0.1',port:0},logLevel:'error'});await server.listen();
 const address=server.httpServer!.address();if(!address||typeof address==='string')throw Error('Missing address');
 const browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1280,height:900}});
 await context.route('https://fonts.googleapis.com/**',route=>route.fulfill({contentType:'text/css',body:''}));
 try{await fn(await context.newPage(),dir,'http://127.0.0.1:'+address.port);}finally{await context.close();await browser.close();await server.close();}
}

test('independent: current identity cannot be recycled with a different image hash',()=>{
 const state=updateUserState(createUserState(undefined,{x:10,y:10}),observation,{enabled:true,memoryCapacity:1});
 const q=assessmentQuestions(candidates,[source]);
 const assessment=admitAssessment(reply({questions:q,input:{}}),candidates,observation,[source]);
 const remembered=recordAssessment(state,assessment,memoryConfig);
 const changed=updateUserState(state,{...observation,imageSha256:'new-image'},{enabled:true,memoryCapacity:1});
 assert.deepEqual(carryDeliberation(remembered,changed,memoryConfig).deliberation!.assessments,[]);
 assert.deepEqual(carryDeliberation(createUserState(undefined,{x:10,y:10}),state,memoryConfig).deliberation!.assessments,[]);
 assert.equal(remembered.deliberation!.assessments[0].imageSha256,'present-hash');
});

test('independent: runtime non-finite and extra evidence probabilities cannot become a hypothesis',()=>{
 const q=assessmentQuestions(candidates,[source]);
 for(const value of [Infinity,NaN,-0.01]){
  const r=reply({questions:q,input:{}});r.answers.evidence_a.probabilities.present=value;
  assert.throws(()=>admitAssessment(r,candidates,observation,[source]));
 }
 const r=reply({questions:q,input:{}});r.answers.goalEvidence.probabilities.unattached=0;
 assert.throws(()=>admitAssessment(r,candidates,observation,[source]));
});

test('independent: stop arriving during assessment prevents the action request',async()=>browserCase(async(page,dir,baseURL)=>{
 let stop=false,calls=0;
 const r=await runBeta(page,{runId:'independent-stop',dir,baseURL,charter,config:config(),isSafetyStopped:()=>stop,evaluate:async request=>{calls++;stop=true;return reply(request,'e1');}});
 assert.equal(calls,1);assert.equal(r.apiCalls,1);assert.equal(r.termination,'SAFETY_STOP');assert.equal(r.uiActions,0);assert.equal(r.steps[0].response,undefined);
}));

test('independent: denied action reservation accounts only the completed assessment',async()=>browserCase(async(page,dir,baseURL)=>{
 for(const refused of [new BetaBudgetError('API_LIMIT'),new BetaAdmissionError()]){
  let calls=0;
  const r=await runBeta(page,{runId:'independent-refused',dir:join(dir,refused.constructor.name),baseURL,charter,config:config(),evaluate:async request=>{calls++;if(request.questions.nextAction)throw refused;return reply(request);}});
  assert.equal(calls,2);assert.equal(r.apiCalls,1);assert.equal(r.steps[0].deliberation!.apiCalls,1);assert.equal(r.uiActions,0);assert.equal(r.termination,refused instanceof BetaBudgetError?'API_LIMIT':'API_ERROR');
 }
}));

test('independent: subjective done remains selectable despite insufficient and conflicting action predictions',async()=>browserCase(async(page,dir,baseURL)=>{
 const r=await runBeta(page,{runId:'independent-done',dir,baseURL,charter,config:config(),evaluate:async request=>reply(request,'done',Object.fromEntries(Object.keys(request.questions).filter(k=>k.startsWith('effect_')).map(k=>[k,'conflicts'])))});
 assert.equal(r.apiCalls,2);assert.equal(r.perceivedDone,true);assert.equal(r.termination,'SUBJECTIVE_DONE');assert.equal(r.objectiveAssessment.value,false);assert.equal(r.uiActions,0);assert.equal(r.looks,0);
 assert.deepEqual(r.steps[0].selection!.raw,r.steps[0].selection!.filtered);assert.deepEqual(r.steps[0].selection!.adjustments,[]);
}));

test('independent: explicit disabled stage preserves the absent-stage action request byte for byte',async()=>browserCase(async(page,dir,baseURL)=>{
 const seen:ModelRequest[]=[];
 for(const disabled of [false,true]){
  const c=config();delete c.deliberation;if(disabled)c.deliberation={enabled:false,memoryCapacity:2};
  const r=await runBeta(page,{runId:'independent-off',dir:join(dir,String(disabled)),baseURL,charter,config:c,evaluate:async request=>{seen.push(structuredClone(request));return reply(request);}});
  assert.equal(r.apiCalls,1);assert.equal(r.steps[0].deliberation,undefined);
 }
 // timeout is elapsed wall time; all actual model content must remain identical.
 assert.deepEqual(seen[0].input,seen[1].input);assert.deepEqual(seen[0].questions,seen[1].questions);assert.deepEqual(seen[0].images,seen[1].images);
}));

async function savedProvenanceFixture(memoryImage:string,memoryHash:string) {
 const dir=await mkdtemp(join(tmpdir(),'information-independent-replay-'));
 const bytes=Buffer.from('local deterministic asset');const hash=sha(bytes);await writeFile(join(dir,'input.png'),bytes);
 const current={...observation,imageSha256:hash};const sources=[{observationId:'past',imageSha256:memoryHash},{observationId:current.id,imageSha256:hash}];
 const q=assessmentQuestions(candidates,sources);
 const input={observation:{id:current.id,image:'current'},memoryObservations:[{observationId:'past',image:memoryImage,imageSha256:memoryHash}]};
 const response=reply({questions:q,input},'done',{goal:'unsatisfied',goalEvidence:'past',effect_a:'advances',evidence_a:'past'});
 const assets={current:{file:'input.png',sha256:hash}};
 const d={modelInput:input,questions:q,assetFiles:assets,inputSha256:sha(JSON.stringify({input,questions:q,assets})),response,assessment:admitAssessment(response,candidates,current,sources),apiCalls:1};
 await writeFile(join(dir,'result.json'),JSON.stringify({runId:'independent-provenance',config:config(),steps:[{deliberation:d,userState:{lastObservation:current}}]}));
 return dir;
}

test('independent: replay rejects a cited historical observation whose image was never attached',async()=>{
 const dir=await savedProvenanceFixture('unattached-memory','never-attached-hash');
 await assert.rejects(()=>replayDirectory(dir),/ASSESSMENT_.*(?:SOURCE|PROVENANCE|IMAGE|ASSET)/);
});

test('independent: replay rejects a historical image reference whose recorded source hash differs from asset bytes',async()=>{
 const dir=await savedProvenanceFixture('current','hash-not-matching-current-asset');
 await assert.rejects(()=>replayDirectory(dir),/ASSESSMENT_.*(?:SOURCE|PROVENANCE|IMAGE|ASSET)/);
});


test('independent: replay accepts two observation IDs backed by the same attached image bytes',async()=>{
 const hash=sha(Buffer.from('local deterministic asset'));
 const dir=await savedProvenanceFixture('current',hash);
 assert.equal((await replayDirectory(dir)).assessments,1);
});


test('independent: local hypothesis projection preserves candidate IDs, order and labels without arbitrary response fields',()=>{
 const offered:BetaCandidates={...candidates,look:{action:{type:'look',point:{x:20,y:30}},label:'look (20, 30)'}};
 const q=assessmentQuestions(offered,[source]);const response=reply({questions:q,input:{}},'done',{goal:'unsatisfied',effect_a:'conflicts'});
 Object.assign(response,{privateReason:'SECRET_AUDIT_EXPLANATION'});Object.assign(response.answers.effect_a,{reason:'SECRET_AUDIT_EXPLANATION'});
 const assessment=admitAssessment(response,offered,observation,[source]);
 const criteria=assessedCriteria(offered,assessment);
 assert.deepEqual(Object.keys(criteria),Object.keys(offered));
 for(const id of Object.keys(offered))assert.ok(criteria[id].startsWith(offered[id].label+' '));
 assert.match(criteria.a,/effect=conflicts/);assert.match(criteria.done,/goal=unsatisfied/);
 assert.match(criteria.look,/observation-only/);assert.doesNotMatch(JSON.stringify(criteria),/SECRET_AUDIT_EXPLANATION|imageSha256|privateReason/);
 assert.deepEqual(Object.keys(offered),['a','done','look']);assert.equal(offered.a.label,'a');
});

test('independent: criteria projection changes only descriptions and retains ordinary distribution and subjective done',async()=>browserCase(async(page,dir,baseURL)=>{
 const seen:ModelRequest[][]=[[],[]];
 for(const [i,candidateEffects] of [false,true].entries()){
  const c=config();c.deliberation={...memoryConfig,candidateEffects};
  const r=await runBeta(page,{runId:'independent-criteria',dir:join(dir,String(candidateEffects)),baseURL,charter,config:c,semanticTrial:{id:'independent',pairId:'independent',replicate:1,fixture:{version:1,ui:'reference',mapping:'A'}},preserveDisplay:true,evaluate:async request=>{
   seen[i].push(structuredClone(request));const response=reply(request,'done',{goal:'unsatisfied'});
   if(request.questions.nextAction)response.answers.nextAction.probabilities=Object.fromEntries(Object.keys(request.questions.nextAction.criteria).map(id=>[id,id==='done'?0.6:id==='e1'?0.4:0]));
   return response;
  }});
  assert.equal(r.apiCalls,2);assert.equal(r.termination,'SUBJECTIVE_DONE');assert.equal(r.objectiveAssessment.value,false);assert.equal(r.looks,0);assert.equal(r.uiActions,0);
  assert.deepEqual(r.steps[0].selection!.raw,r.steps[0].selection!.filtered);assert.equal(r.steps[0].selection!.raw.done,0.6);assert.equal(r.steps[0].selection!.raw.e1,0.4);
 }
 assert.deepEqual(seen[0][0].input,seen[1][0].input);assert.deepEqual(seen[0][0].questions,seen[1][0].questions);assert.deepEqual(seen[0][0].images,seen[1][0].images);
 const oldAction=seen[0][1],newAction=seen[1][1];assert.deepEqual(oldAction.input,newAction.input);assert.deepEqual(oldAction.images,newAction.images);
 assert.equal(oldAction.questions.nextAction.instructions,newAction.questions.nextAction.instructions);
 assert.deepEqual(Object.keys(oldAction.questions.nextAction.criteria),Object.keys(newAction.questions.nextAction.criteria));
 for(const [id,label] of Object.entries(oldAction.questions.nextAction.criteria))assert.ok(newAction.questions.nextAction.criteria[id].startsWith(label+' '));
 assert.match(newAction.questions.nextAction.criteria.done,/goal=unsatisfied/);assert.match(newAction.questions.nextAction.criteria.e1,/effect=unknown/);
}));
