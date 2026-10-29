
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {humanJevProfile} from '../runner/human-jev-profiles.js';
import {recoveryDefinition,type RecoveryFixture} from '../app/recovery-fixture.js';
import type {RecoveryAuditSnapshot} from '../runner/recovery-contracts.js';
import type {ProviderRunRecord,DecisionProvider} from '../runner/provider-comparison-analysis.js';

const api=await import('../runner/provider-comparison-analysis.js').catch(()=>({} as any));
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function record(provider:DecisionProvider,replicate=1,fixture:RecoveryFixture={version:1,task:'library',condition:'changed'}):ProviderRunRecord{
 const definition=recoveryDefinition(fixture),id='recovery-'+fixture.task+'-'+fixture.condition+'-r'+replicate,runId=provider+'-'+id;
 const state:RecoveryAuditSnapshot={schemaVersion:1,route:'primary',eligible:false,verificationAttempts:0,recordChecks:0,savedValue:definition.originalValue,complete:false};
 const modelInput={goal:definition.goal,observation:{id:'o1',image:'current'},userState:{memory:[]}};
 const questions={assessment:{type:'choice' as const,instructions:'Assess the current state',criteria:{yes:'Yes',no:'No'}}};
 const response={model:provider==='jev'?'jev-1.14.0':'gpt-6-luna',answers:{assessment:{choice:'no',probabilities:{yes:0,no:1}}},usage:{inputTokens:10,outputTokens:2}};
 return {provider,id,runId,fixture,replicate,status:'RESULT',dir:'/artifacts/'+runId,ledger:null,resultPath:'/artifacts/'+runId+'/result.json',requests:2,initialImageSha256:hash('product'),
  result:{schemaVersion:1,runId,condition:'human-screen-goal-search-grounded',code:{revision:'frozen',sourceHash:hash('source')},config:humanJevProfile('experience-goal-search-grounded').config,
   input:{charter:{schemaVersion:1,id:'task',targetWebsite:'local:demo',goal:definition.goal,initialState:{description:'Blocked primary',currentDate:'2026-10-29'},scope:[],prohibitedActions:{actionTypes:[],controlTexts:[],downloads:true},maxActions:15}},
   initialFingerprint:hash('fingerprint'),objectiveSuccess:false,objectiveAssessment:{status:'OK',value:false},terminalObservation:{status:'RECORDED'},validForComparison:true,perceivedDone:true,termination:'SUBJECTIVE_DONE',looks:0,uiActions:0,decisions:1,apiCalls:2,apiMs:10,uiMs:200,elapsedMs:250,modeledUserMs:null,
   recovery:{fixture,definitionHash:hash(definition),initialProductImage:{file:runId+'/product.png',sha256:hash('product')},terminalSnapshot:structuredClone(state)},
   steps:[{number:1,observationId:'o1',audit:{url:'http://localhost:3000/good/',recovery:state,screen:{title:'Blocked',text:[],elements:[],canScrollUp:false,canScrollDown:false},rawScreenshot:runId+'/audit.png',sourceSha256:hash('screen')},
    assetFiles:{current:{file:runId+'/current.png',sha256:hash('current')}},modelInput:{...structuredClone(modelInput),assessmentResponse:provider},questions:{nextAction:{type:'choice',instructions:'Choose the next action',criteria:{done:'Done '+provider}}},response:structuredClone(response),
    deliberation:{modelInput:structuredClone(modelInput),questions:structuredClone(questions),assetFiles:{current:{file:runId+'/current.png',sha256:hash('current')}},inputSha256:hash(provider),response:structuredClone(response),apiCalls:1},
    action:{type:'done'},outcome:'SUBJECTIVE_DONE'}]},
  frameChecks:[{step:1,stage:'assessment',observationId:'o1',imageSha256:hash('current'),validCurrentFrame:true,successfulResponse:true,scope:'full-viewport-current'}]};
}
function pair(){return [record('jev'),record('openai-decisions')];}

test('first assessment semantic equality ignores artifact paths and later/action divergence',()=>{
 assert.equal(typeof api.analyzeProviderComparison,'function');
 const records=pair(),later=structuredClone(records[1].result!.steps[0]);later.number=2;later.observationId='o2';later.deliberation!.modelInput={different:'later path'};records[1].result!.steps.push(later);
 const report=api.analyzeProviderComparison(records),p=report.pairs.find((p:any)=>p.key==='library/changed/r1')!;
 assert.equal(p.status,'match');assert.equal(p.firstAction.sameModelInput,false);assert.equal(p.firstAction.sameQuestions,false);
 assert.equal(report.completeness.planned,24);assert.equal(report.completeness.attempted,2);assert.equal(report.completeness.missing.length,22);
 assert.equal(report.providers.jev.completeness.planned,12);assert.equal(report.providers['openai-decisions'].completeness.planned,12);
 assert.equal(report.totals.requests,4);assert.equal(report.totals.apiMs,20);assert.equal(report.totals.humanTimeMs,null);assert.equal(report.totals.costUSD,null);
 assert.equal(report.integrity.ok,true);assert.equal(p.providers.jev.apiReached,true);assert.equal(p.providers['openai-decisions'].successfulResponse,true);
 assert.deepEqual(report.providers.jev.measurements.returnedModels,{'jev-1.14.0':2});
});

test('initial request and shared trial metadata mismatches fail closed',()=>{
 const cases:[string,(r:ProviderRunRecord)=>void][]=[
  ['INITIAL_PRODUCT_IMAGE_MISMATCH',r=>{r.initialImageSha256=hash('other');r.result!.recovery!.initialProductImage.sha256=r.initialImageSha256;}],
  ['FIRST_CURRENT_IMAGE_MISMATCH',r=>{r.result!.steps[0].assetFiles!.current.sha256=hash('other');r.result!.steps[0].deliberation!.assetFiles.current.sha256=hash('other');}],
  ['FIRST_ASSESSMENT_INPUT_MISMATCH',r=>{r.result!.steps[0].deliberation!.modelInput.userState={wrong:true};}],
  ['FIRST_ASSESSMENT_QUESTIONS_MISMATCH',r=>{r.result!.steps[0].deliberation!.questions.assessment.instructions='Changed instructions';}],
  ['GOAL_MISMATCH',r=>{r.result!.input.charter.goal='wrong';}],
  ['CONFIG_MISMATCH',r=>{r.result!.config.id='wrong';}],
  ['PERSONA_MISMATCH',r=>{r.result!.input.persona={} as any;}],
  ['SOURCE_MISMATCH',r=>{r.result!.code!.sourceHash=hash('other');}]
 ];
 for(const [code,mutate] of cases){const records=pair();mutate(records[1]);const p=api.analyzeProviderComparison(records).pairs.find((p:any)=>p.key==='library/changed/r1')!;assert.equal(p.status,'mismatch',code);assert.ok(p.reasons.includes(code),code);assert.equal(p.eligibleForOutcomeComparison,false);}
});

test('missing provider and missing first evidence never imply parity',()=>{
 const missing=api.analyzeProviderComparison([record('jev')]);assert.equal(missing.pairs.find((p:any)=>p.key==='library/changed/r1')!.status,'missing');assert.equal(missing.completeness.paired,0);
 const records=pair();delete (records[1].result!.steps[0].deliberation! as any).modelInput;
 const p=api.analyzeProviderComparison(records).pairs.find((p:any)=>p.key==='library/changed/r1')!;assert.equal(p.status,'mismatch');assert.ok(p.reasons.includes('MISSING_OR_MALFORMED_FIRST_ASSESSMENT'));
});

test('duplicates remain invalid within provider and global actual run identity is unique',()=>{
 const records=pair(),duplicate=structuredClone(records[0]);duplicate.runId+='-duplicate';duplicate.result!.runId=duplicate.runId;
 let report=api.analyzeProviderComparison([...records,duplicate]);assert.equal(report.integrity.ok,false);assert.equal(report.pairs.find((p:any)=>p.key==='library/changed/r1')!.status,'mismatch');assert.equal(report.providers.jev.totals.valid,0);
 records[1].runId=records[0].runId;records[1].result!.runId=records[1].runId;report=api.analyzeProviderComparison(records);
 assert.ok(report.integrity.errors.some((e:any)=>e.code==='DUPLICATE_ACTUAL_RUN_ID'));
});

test('API failures invalid distributions and setup failures preserve denominators',()=>{
 const records=pair();records[1].result!.termination='API_ERROR';records[1].result!.validForComparison=false;records[1].result!.steps[0].deliberation!.error={code:'INVALID_RESPONSE'};
 let report=api.analyzeProviderComparison(records);assert.equal(report.pairs.find((p:any)=>p.key==='library/changed/r1')!.status,'match');assert.equal(report.pairs.find((p:any)=>p.key==='library/changed/r1')!.eligibleForOutcomeComparison,false);assert.equal(report.providers['openai-decisions'].totals.infrastructure,1);assert.equal(report.providers['openai-decisions'].totals.objectiveSuccesses,0);
 records[1].result!.termination='INVALID_DISTRIBUTION';report=api.analyzeProviderComparison(records);assert.equal(report.providers['openai-decisions'].totals.invalidDistributions,1);
 records[1].result=null as any;records[1].requests=0;records[1].status='FAILED';report=api.analyzeProviderComparison(records);assert.equal(report.providers['openai-decisions'].totals.infrastructure,1);assert.equal(report.pairs.find((p:any)=>p.key==='library/changed/r1')!.providers['openai-decisions'].apiReached,false);assert.equal(report.pairs.find((p:any)=>p.key==='library/changed/r1')!.status,'mismatch');
});

test('malformed result and first evidence are handled without crashing',()=>{
 for(const change of [(r:ProviderRunRecord)=>{r.result!.steps=null as any;},(r:ProviderRunRecord)=>{r.result!.steps[0]=null as any;},(r:ProviderRunRecord)=>{r.result!.steps[0].deliberation!.assetFiles=null as any;}]){
  const records=pair();change(records[1]);const report=api.analyzeProviderComparison(records);assert.equal(report.pairs.find((p:any)=>p.key==='library/changed/r1')!.status,'mismatch');assert.equal(report.pairs.find((p:any)=>p.key==='library/changed/r1')!.eligibleForOutcomeComparison,false);
 }
});

test('returned model mismatch is flagged and explicit mock never claims API use',()=>{
 const records=pair();records[1].result!.steps[0].deliberation!.response!.model='wrong-model';
 let report=api.analyzeProviderComparison(records);assert.equal(report.integrity.ok,false);assert.ok(report.integrity.errors.some((e:any)=>e.code==='MODEL_MISMATCH'));assert.equal(report.pairs.find((p:any)=>p.key==='library/changed/r1')!.eligibleForOutcomeComparison,false);
 for(const r of records)for(const step of r.result!.steps){step.response!.model='MOCK_SCRIPTED_FIXTURE';step.deliberation!.response!.model='MOCK_SCRIPTED_FIXTURE';}
 report=api.analyzeProviderComparison(records,{mock:true});assert.equal(report.dataSource,'synthetic-mock');assert.equal(report.integrity.ok,true);assert.equal(report.totals.apiReachedRuns,0);assert.equal(report.pairs.find((p:any)=>p.key==='library/changed/r1')!.providers.jev.apiReached,false);
});

test('tokens and USD aggregate recorded response evidence while incomplete totals remain unknown',()=>{
 const records=pair();for(const r of records)for(const response of [r.result!.steps[0].response!,r.result!.steps[0].deliberation!.response!])response.costUSD=0.01;
 let report=api.analyzeProviderComparison(records);assert.equal(report.totals.inputTokens,40);assert.equal(report.totals.outputTokens,8);assert.equal(report.totals.costUSD,0.04);
 delete records[1].result!.steps[0].response!.usage;delete records[1].result!.steps[0].response!.costUSD;report=api.analyzeProviderComparison(records);
 assert.equal(report.totals.inputTokens,null);assert.equal(report.totals.knownInputTokens,30);assert.equal(report.totals.costUSD,null);assert.equal(report.totals.knownCostUSD,0.03);
});

test('all planned slots produce exactly 12 pairs and 24 provider runs',async()=>{
 const {recoveryFixtures}=await import('../app/recovery-fixture.js');
 const records=recoveryFixtures().flatMap(fixture=>[1,2].flatMap(replicate=>[record('jev',replicate,fixture),record('openai-decisions',replicate,fixture)]));
 const report=api.analyzeProviderComparison(records);
 assert.equal(report.completeness.complete,true);assert.equal(report.completeness.valid,24);assert.equal(report.completeness.paired,12);assert.equal(report.completeness.eligiblePairs,12);assert.equal(report.integrity.ok,true);
});

test('malformed image references and disagreeing first state cannot establish matched input',()=>{
 for(const change of [(r:ProviderRunRecord)=>{r.result!.steps[0].assetFiles!.current.sha256='malformed';r.result!.steps[0].deliberation!.assetFiles.current.sha256='malformed';},(r:ProviderRunRecord)=>{r.result!.steps[0].audit!.recovery!.verificationAttempts=1;}]){
  const records=pair();change(records[1]);const report=api.analyzeProviderComparison(records);assert.equal(report.pairs.find((p:any)=>p.key==='library/changed/r1')!.status,'mismatch');
 }
});

test('identically malformed requests and wrong request goals are still rejected',()=>{
 for(const change of [(r:ProviderRunRecord)=>{r.result!.steps[0].deliberation!.questions={bad:null} as any;},(r:ProviderRunRecord)=>{r.result!.steps[0].deliberation!.modelInput.goal='wrong goal';}]){
  const records=pair();for(const r of records)change(r);const report=api.analyzeProviderComparison(records);
  assert.equal(report.pairs.find((p:any)=>p.key==='library/changed/r1')!.status,'mismatch');assert.equal(report.completeness.eligiblePairs,0);
 }
});


test('charged RESERVED request without HTTP evidence keeps reach and attempt unknown',()=>{
 const r=record('jev');
 r.requests=1;r.status='FAILED';delete r.result;r.error={code:'BUDGET_SETTLEMENT_AFTER_REQUEST'};
 const report=api.analyzeProviderComparison([r]);
 const evidence=report.pairs.find((p:any)=>p.key==='library/changed/r1')!.providers.jev;
 assert.equal(evidence.requestAttempted,null);assert.equal(evidence.apiReached,null);
 assert.equal(evidence.requests,1);assert.equal(evidence.chargedRequests,1);
 assert.equal(evidence.knownHTTPAttempts,0);assert.equal(evidence.httpAttemptCountsComplete,false);
 assert.equal(report.totals.requests,1);assert.equal(report.totals.chargedRequests,1);
 assert.equal(report.totals.apiReachedRuns,0);assert.equal(report.totals.unknownReachRuns,1);
 assert.equal(report.providers.jev.totals.requests,1);
});

test('explicit pre-HTTP zero attempts do not claim a network request or API reach',()=>{
 const r=record('jev'),step=r.result!.steps[0];
 r.requests=1;r.result!.apiCalls=1;delete step.response;delete step.deliberation!.response;
 step.deliberation!.error={code:'TIMEOUT',attempts:0};step.error=step.deliberation!.error;step.outcome='ASSESSMENT_ERROR';
 const report=api.analyzeProviderComparison([r]);
 const evidence=report.pairs.find((p:any)=>p.key==='library/changed/r1')!.providers.jev;
 assert.equal(evidence.requests,1);assert.equal(evidence.requestAttempted,false);assert.equal(evidence.apiReached,false);
 assert.equal(evidence.knownHTTPAttempts,0);assert.equal(evidence.httpAttemptEvidenceRequests,1);assert.equal(evidence.httpAttemptCountsComplete,true);
 assert.equal(report.totals.unknownReachRuns,0);
});

test('attempted HTTP timeout does not establish that the API received the request',()=>{
 const r=record('jev'),step=r.result!.steps[0];
 r.requests=1;r.result!.apiCalls=1;delete step.response;delete step.deliberation!.response;
 step.deliberation!.error={code:'TIMEOUT',attempts:1};step.error=step.deliberation!.error;step.outcome='ASSESSMENT_ERROR';
 const report=api.analyzeProviderComparison([r]);
 const evidence=report.pairs.find((p:any)=>p.key==='library/changed/r1')!.providers.jev;
 assert.equal(evidence.requestAttempted,true);assert.equal(evidence.apiReached,null);
 assert.equal(evidence.knownHTTPAttempts,1);assert.equal(evidence.httpAttemptEvidenceRequests,1);
 assert.equal(report.totals.requests,1);assert.equal(report.totals.knownHTTPAttempts,1);assert.equal(report.totals.unknownReachRuns,1);
});

test('HTTP status or a safe response establishes reach without inventing unrecorded attempt counts',()=>{
 const r=record('jev'),step=r.result!.steps[0];
 r.requests=1;r.result!.apiCalls=1;delete step.response;delete step.deliberation!.response;
 step.deliberation!.error={code:'HTTP_ERROR',statusCode:503};step.error=step.deliberation!.error;step.outcome='ASSESSMENT_ERROR';
 let report=api.analyzeProviderComparison([r]);
 let evidence=report.pairs.find((p:any)=>p.key==='library/changed/r1')!.providers.jev;
 assert.equal(evidence.requestAttempted,true);assert.equal(evidence.apiReached,true);assert.equal(evidence.knownHTTPAttempts,0);assert.equal(evidence.httpAttemptCountsComplete,false);
 const normal=record('jev');report=api.analyzeProviderComparison([normal]);evidence=report.pairs.find((p:any)=>p.key==='library/changed/r1')!.providers.jev;
 assert.equal(evidence.requestAttempted,true);assert.equal(evidence.apiReached,true);assert.equal(evidence.knownHTTPAttempts,0);assert.equal(evidence.httpAttemptCountsComplete,false);
 normal.result!.steps[0].response!.request={attempts:1,failures:[]};normal.result!.steps[0].deliberation!.response!.request={attempts:1,failures:[]};
 report=api.analyzeProviderComparison([normal]);evidence=report.pairs.find((p:any)=>p.key==='library/changed/r1')!.providers.jev;
 assert.equal(evidence.knownHTTPAttempts,2);assert.equal(evidence.httpAttemptCountsComplete,true);
});

test('mock and zero-charge runs have no actual HTTP while partial and malformed evidence stay unknown',()=>{
 const r=record('jev'),step=r.result!.steps[0];
 step.response!.request={attempts:1,failures:[]};step.deliberation!.response!.request={attempts:1,failures:[]};
 let report=api.analyzeProviderComparison([r],{mock:true}),evidence=report.pairs.find((p:any)=>p.key==='library/changed/r1')!.providers.jev;
 assert.equal(evidence.requests,2);assert.equal(evidence.requestAttempted,false);assert.equal(evidence.apiReached,false);assert.equal(evidence.knownHTTPAttempts,0);assert.equal(report.totals.unknownReachRuns,0);
 delete r.result;r.requests=0;report=api.analyzeProviderComparison([r]);evidence=report.pairs.find((p:any)=>p.key==='library/changed/r1')!.providers.jev;
 assert.equal(evidence.requestAttempted,false);assert.equal(evidence.apiReached,false);
 const partial=record('jev'),s=partial.result!.steps[0];delete s.response;delete s.deliberation!.response;s.deliberation!.error={attempts:0};s.error=s.deliberation!.error;
 report=api.analyzeProviderComparison([partial]);evidence=report.pairs.find((p:any)=>p.key==='library/changed/r1')!.providers.jev;
 assert.equal(evidence.requestAttempted,null);assert.equal(evidence.apiReached,null);assert.equal(evidence.httpAttemptCountsComplete,false);
 s.deliberation!.error={attempts:-1,statusCode:'503'};s.error=s.deliberation!.error;report=api.analyzeProviderComparison([partial]);evidence=report.pairs.find((p:any)=>p.key==='library/changed/r1')!.providers.jev;
 assert.equal(evidence.requestAttempted,null);assert.equal(evidence.apiReached,null);assert.equal(evidence.knownHTTPAttempts,0);
});



test('admission stop and direct zero-attempt wrapper trace retain charged budget without claiming HTTP',()=>{
 const r=record('jev');r.requests=1;r.result!.apiCalls=0;r.result!.steps=[];
 let report=api.analyzeProviderComparison([r]),evidence=report.pairs.find((p:any)=>p.key==='library/changed/r1')!.providers.jev;
 assert.equal(evidence.requests,1);assert.equal(evidence.requestAttempted,false);assert.equal(evidence.apiReached,false);assert.equal(evidence.knownHTTPAttempts,0);
 delete r.result;r.error={code:'TIMEOUT',attempts:0} as any;
 report=api.analyzeProviderComparison([r]);evidence=report.pairs.find((p:any)=>p.key==='library/changed/r1')!.providers.jev;
 assert.equal(evidence.requestAttempted,false);assert.equal(evidence.apiReached,false);assert.equal(evidence.httpAttemptEvidenceRequests,1);
 r.error={code:'TIMEOUT',attempts:1} as any;
 report=api.analyzeProviderComparison([r]);evidence=report.pairs.find((p:any)=>p.key==='library/changed/r1')!.providers.jev;
 assert.equal(evidence.requestAttempted,true);assert.equal(evidence.apiReached,null);assert.equal(evidence.knownHTTPAttempts,1);
 r.error={code:'BUDGET_SETTLEMENT_AFTER_REQUEST'};r.ledgerEvidence={used:1,sha256:hash('reserved'),reserved:1,ok:0,errors:0};
 report=api.analyzeProviderComparison([r]);evidence=report.pairs.find((p:any)=>p.key==='library/changed/r1')!.providers.jev;
 assert.equal(report.totals.requests,1);assert.equal(evidence.requestAttempted,null);assert.equal(evidence.apiReached,null);assert.equal(report.totals.unknownReachRuns,1);
});

