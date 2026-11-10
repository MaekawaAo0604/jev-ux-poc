import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {sourceIdentity} from '../runner/virtual-beta-source.js';
import {loadPublicPersonaSet} from '../runner/public-persona-set.js';
import {runPublicPersonaComparison} from '../runner/public-persona-comparison.js';
import {buildExplorationViewer} from '../runner/exploration-viewer-data.js';
import {humanJevProfile} from '../runner/human-jev-profiles.js';

const sha=(v:Buffer|string)=>createHash('sha256').update(v).digest('hex');
const readJSON=async(p:string)=>JSON.parse(await readFile(p,'utf8'));
const enabled=process.env.EXTREME_PERSONA_INDEPENDENT==='1';
test('independent frozen real-HAR ordinary mock: eight actors, two caps, stage delivery, isolation, resume, viewer/raw fidelity', {skip:!enabled,timeout:240000},async()=>{
 const own=resolve('reports/extreme-persona-study-2026-11-06/independent');
 await mkdir(own,{recursive:true});const root=await mkdtemp(join(own,'r1-'));
 const evidence:any={schemaVersion:1,kind:'independent-verification',startedAtUTC:new Date().toISOString(),realModelAPIRequests:0,root,findings:[],checks:[],status:'RUNNING'};
 const check=(label:string)=>evidence.checks.push(label);
 try{
  const freeze=await readJSON('reports/extreme-persona-study-2026-11-06/freeze.json'),before=await sourceIdentity();evidence.sourceBefore={revision:before.revision,sourceHash:before.sourceHash};assert.equal(before.sourceHash,freeze.sourceHash);evidence.executionBaseRevision=freeze.revision;evidence.inspectedRevision=before.revision;assert.deepEqual(before.sourceHashes,freeze.sourceHashes);check('All 187 frozen runtime/source file hashes match before checks');
  const selection='experiments/persona/extreme-passkeys-v1/set.json',set=await loadPublicPersonaSet(selection);assert.equal(set.personaSet.sha256,freeze.personaSet.sha256);assert.equal(sha(await readFile(freeze.protocol.file)),freeze.protocol.sha256);assert.deepEqual(set.actors,['XK0','XK1','XE0','XE1','XP0','XP1','XD0','XD1']);
  const siteSpec=resolve('reports/exploration-observatory-2026-11-06/site-capture/site-spec.json'),charter=resolve('experiments/virtual-beta/public-passkeys-charter.json'),priorSnapshot=join(root,'empty-prior.json');await writeFile(priorSnapshot,JSON.stringify({count:0,files:[]}));
  const spec=await readJSON(siteSpec);assert.equal(sha(await readFile(spec.harPath)),spec.harSha256);check('Current captured real-site HAR identity matches; no prior human content opened');
  const batches:any[]=[];const results:any[][]=[];
  for(const cap of [1,12]){
   const out=join(root,'mock-cap-'+cap),options={out,siteSpec,charter,priorSnapshot,personaSet:selection,mock:true,repeats:1,maxDecisions:cap,maxRequests:288,maxPhaseMs:240000};
   const m=await runPublicPersonaComparison(options);batches.push(m);assert.equal(m.status,'COMPLETED');assert.equal(m.records.length,8);assert.equal(m.totalRequests,0);assert.equal(m.limits.judgments,cap);assert.equal(m.preservationAfter,true);assert.equal(m.humanInputsRead,false);assert.equal(m.savedInputResends,0);
   const summary=await readJSON(join(out,'summary.json'));assert.deepEqual(Object.keys(summary.byActor),set.actors);assert.equal(summary.valid,8);assert.equal(summary.objectiveSuccess,null);
   const all:any[]=[];for(const row of m.records){
    const raw=await readFile(row.resultPath),r=JSON.parse(raw.toString()),p=set.personas[row.actor];assert.equal(sha(raw),row.resultSha256);assert.equal(row.valid,true);assert.deepEqual(r.input.persona,p);assert.equal(r.publicSite.networkMode,'frozen-har-no-fallback');assert.equal(r.objectiveSuccess,null);assert.deepEqual(r.objectiveAssessment,{status:'UNVERIFIED',value:null});assert.equal(r.decisions,1);assert.equal(r.steps.length,1);assert.equal(r.uiActions,0);assert.equal(r.perceivedDone,true);assert.equal(r.termination,'SUBJECTIVE_DONE');assert.equal(r.config.maxDecisions,cap);assert.equal(r.steps[0].visualHypotheses.request.persona.id,row.actor);assert.equal(r.steps[0].visualHypotheses.request.persona.name,p.name);assert.equal(row.personaDelivery.errors.length,0);assert.equal(r.config.state.memoryCapacity,3);assert.equal(r.steps[0].visualHypotheses.response.request.attempts,1);assert.ok(r.steps[0].modelInput);assert.ok(r.steps[0].deliberation);
    const step=r.steps[0],native=step.visualHypotheses.request;
    for(const input of [step.modelInput,step.deliberation.modelInput]){assert.deepEqual(input.exploration.persona,p);assert.deepEqual(input.userState.expectations,p.expectations);assert.equal(input.audit,undefined);assert.equal(input.observation.screen,undefined);assert.equal(input.observation.visibleText,undefined);assert.equal(input.observation.url,undefined);assert.equal(input.observation.elements,undefined);assert.deepEqual(input.memoryObservations.map((x:any)=>x.observationId),['o1']);}
    assert.deepEqual(native.memory.records,[]);assert.deepEqual(native.experience.transitions,[]);assert.deepEqual(native.conditionContinuity.memory.entries,[]);assert.equal(native.conditionContinuity.memory.lastObservation,null);for(const candidate of native.candidates){assert.deepEqual(Object.keys(candidate).sort(),['id','type']);assert.match(candidate.id,/^(e\d+|scroll_down)$/);}
    all.push(r);
   }
   assert.equal(new Set(m.records.map((r:any)=>r.runId)).size,8);assert.equal(new Set(m.records.map((r:any)=>r.dir)).size,8);assert.equal(new Set(all.map(r=>r.initialFingerprint)).size,1);assert.equal(new Set(m.records.map((r:any)=>r.initialInputs.productSha256)).size,1);assert.equal(new Set(m.records.map((r:any)=>r.initialInputs.currentImageSha256)).size,1);assert.equal(new Set(m.records.map((r:any)=>r.initialInputs.nativeNonpersonaSha256)).size,1);
   const resumed=await runPublicPersonaComparison({...options,resume:true});assert.equal(resumed.batchId,m.batchId);assert.deepEqual(resumed.records,m.records);assert.equal(resumed.totalRequests,0);results.push(all);
   check(`cap ${cap}: ordinary runHumanJev mock on fixed HAR, all eight actors completed and bound, unique state/run roots, unchanged initial UI, zero API calls, no resume retries`);
  }
  for(let i=0;i<8;i++){
   const a=results[0][i].steps[0],b=results[1][i].steps[0];assert.deepEqual(a.visualHypotheses.request,b.visualHypotheses.request);assert.deepEqual(a.visualHypotheses.assetFiles,b.visualHypotheses.assetFiles);assert.deepEqual(a.modelInput,b.modelInput);assert.deepEqual(a.questions,b.questions);assert.deepEqual(a.assetFiles,b.assetFiles);assert.deepEqual(a.deliberation.modelInput,b.deliberation.modelInput);
  }
  assert.deepEqual({...humanJevProfile('experience-persona-unweighted',300000,60000,1).config,maxDecisions:12},humanJevProfile('experience-persona-unweighted',300000,60000).config);check('cap 1 versus 12: initial native/action/assessment model inputs, questions and delivered assets identical for each Persona; no cap cue');
  const viewerOut=join(root,'viewer'),catalog=await buildExplorationViewer({batches:batches.map(m=>relative(process.cwd(),m.records[0].dir).replace(/[\\/]public-persona-[^\\/]+$/,'')),out:viewerOut});assert.equal(catalog.runs.length,16);assert.equal(catalog.issues.length,0);assert.equal(catalog.batches.length,2);
  const groups=batches.map(m=>new Set(catalog.runs.filter(r=>m.records.some((x:any)=>x.runId===r.runId)).map(r=>r.group)));assert.equal(groups[0].size,1);assert.equal(groups[1].size,1);assert.notEqual([...groups[0]][0],[...groups[1]][0]);assert.deepEqual(new Set(catalog.runs.map(r=>r.personaId)),new Set(set.actors));
  for(const run of catalog.runs){assert.equal(run.validity,'valid');assert.equal(run.mock,true);assert.equal(run.objective.value,null);assert.equal(run.endClass,'done');const detail=await readJSON(join(viewerOut,run.detailFile!)),bytes=await readFile(join(viewerOut,detail.rawFile));assert.equal(sha(bytes),detail.provenance.rawSha256);assert.ok(bytes.equals(await readFile(detail.provenance.sourceResult)));assert.equal(detail.persona.name,set.personas[run.personaId].name);for(const img of detail.steps[0].images){assert.ok(img.file);assert.equal(img.delivery,'response-received');assert.equal(sha(await readFile(join(viewerOut,img.file))),img.sha256);}}
  check('Viewer supports eight exact names, separates cap 1 and cap 12 groups, retains unknown objectives, raw JSON bytes and delivered PNG hashes');
  const after=await sourceIdentity();evidence.sourceAfter={revision:after.revision,sourceHash:after.sourceHash};assert.deepEqual(after,before);assert.equal(sha(await readFile(selection)),freeze.personaSet.sha256);check('Frozen source and set unchanged after ordinary pipeline/viewer/resume checks');
  evidence.batches=batches.map(m=>({batchId:m.batchId,limits:m.limits,status:m.status,records:m.records.map((r:any)=>({actor:r.actor,runId:r.runId,status:r.status,valid:r.valid,resultPath:r.resultPath,resultSha256:r.resultSha256,personaDelivery:r.personaDelivery,initialInputs:r.initialInputs}))}));evidence.viewer={out:viewerOut,runs:catalog.runs.length,groups:groups.map(g=>[...g]),issues:catalog.issues};evidence.status='PASS';
 }catch(error){evidence.status='FAIL';evidence.findings.push({severity:'REVIEW_REQUIRED',message:error instanceof Error?error.message:String(error),stack:error instanceof Error?error.stack:null});throw error;}
 finally{evidence.finishedAtUTC=new Date().toISOString();await writeFile(join(root,'r1.json'),JSON.stringify(evidence,null,2));await writeFile(join(own,'latest-r1.json'),JSON.stringify(evidence,null,2));}
});


test('analysis first-choice denominator rejects mismatched nonclick selection/action and look coordinates',async()=>{
 const {firstChoiceEndpoint}=await import('../scripts/analyze-extreme-personas.js');
 const make=(selected:string,action:any)=>{const probabilities={[selected]:1};const step:any={number:1,visualHypotheses:{record:{kind:'model-visual-hypotheses-not-fact'},response:{status:'completed'}},deliberation:{assessment:{kind:'model-assessment-not-fact'},response:{answers:{}}},response:{answers:{nextAction:{choice:selected,probabilities}}},selection:{modelChoice:selected,raw:probabilities,normalized:probabilities,filtered:probabilities,adjustments:[],selected},action,outcome:action.type==='look'?'FIXATION_MOVED':action.type==='wait'?'WAIT_NO_UI':'UI_PERFORMED',audit:{screen:{elements:[],canScrollDown:true,canScrollUp:true}},vision:{width:1280,height:900,fixation:{x:640,y:450}},assetFiles:{}};return{validForComparison:true,termination:'DECISION_LIMIT',perceivedDone:false,objectiveSuccess:null,objectiveAssessment:{status:'UNVERIFIED',value:null},config:{maxDecisions:1,vision:{mode:'crop'},state:{enabled:true}},steps:[step]};};
 const failures:any[]=[];
 for(const [selected,action] of [['scroll_down',{type:'scroll',direction:'up'}],['scroll_down',{type:'wait'}],['wait',{type:'done'}],['look_0',{type:'look',point:{x:960,y:675}}]] as [string,any][]){const got=firstChoiceEndpoint(make(selected,action),{status:'RESULT',valid:true},'probe',true);if(got.eligible)failures.push({selected,action,actualEligible:got.eligible,expectedEligible:false,errors:got.errors});}
 assert.deepEqual(failures,[],'Mismatched selected candidate and actual recorded action must never enter the first-choice denominator');
 for(const [selected,action] of [['scroll_down',{type:'scroll',direction:'down'}],['scroll_up',{type:'scroll',direction:'up'}],['wait',{type:'wait'}],['look_0',{type:'look',point:{x:320,y:225}}],['look_3',{type:'look',point:{x:960,y:675}}]] as [string,any][]){const got=firstChoiceEndpoint(make(selected,action),{status:'RESULT',valid:true},'probe',true);assert.equal(got.eligible,true,JSON.stringify({selected,action,errors:got.errors}));}
});
