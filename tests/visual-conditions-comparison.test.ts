import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {visualConditionsActors,visualConditionsSchedule,visualConditionsLimits,analyzeVisualConditionsComparison,visualConditionsStopReason,validateVisualConditionsOptions} from '../runner/visual-conditions-comparison.js';
import {humanJevProfile} from '../runner/human-jev-profiles.js';
import {analyzeRecoveryRuns} from '../runner/recovery-analysis.js';
import {readTransferLedger} from '../runner/transfer-evaluation.js';
test('18 fixed slots rotate three actors over six same-fixture triplets, one repetition, 504 maximum requests',()=>{
 const s=visualConditionsSchedule();assert.equal(s.length,18);assert.equal(new Set(s.map(x=>x.id+'/'+x.actor)).size,18);assert.ok(s.every(x=>x.replicate===1));
 for(let i=0;i<18;i+=3){assert.equal(new Set(s.slice(i,i+3).map(x=>JSON.stringify(x.fixture))).size,1);assert.equal(new Set(s.slice(i,i+3).map(x=>x.actor)).size,3);}
 assert.equal(s.reduce((n,x)=>n+humanJevProfile(x.actor).maximumRequests,0),504);assert.equal(visualConditionsLimits.maxRequests,504);
 assert.equal(new Set([s[0].actor,s[3].actor,s[6].actor]).size,3);
});
test('one-repeat analysis keeps planned six per actor and eighteen overall; default old analysis still plans twelve',()=>{
 const report=analyzeVisualConditionsComparison([],{mock:true});assert.equal(report.completeness.planned,18);assert.equal(report.completeness.notAttempted,18);assert.equal(report.pairs.length,6);assert.match(report.kind,/mock/);
 for(const a of visualConditionsActors)assert.equal(report.actors[a].totals.planned,6);
 assert.equal(analyzeRecoveryRuns([]).totals.planned,12);
});
test('HTTP400/schema, auth/quota and accounting stop; malformed model output stops without treating it as user confusion',()=>{
 for(const statusCode of [400,401,402,403,404,429])assert.ok(visualConditionsStopReason({steps:[{error:{statusCode}}]}));
 for(const value of [{code:'MISSING_CREDENTIALS',attempts:0,httpReceived:false},{steps:[{visualHypotheses:{error:{code:'MISSING_CREDENTIALS',attempts:0,httpReceived:false}}}]}])assert.equal(visualConditionsStopReason(value),'PROVIDER_UNAVAILABLE');
 assert.equal(visualConditionsStopReason({code:'INVALID_VISUAL_HYPOTHESES'}),'MODEL_OUTPUT_FAILURE');
 assert.equal(visualConditionsStopReason({code:'BUDGET_SETTLEMENT_AFTER_REQUEST'}),'BUDGET_ACCOUNTING_FAILURE');
 assert.equal(visualConditionsStopReason({error:{statusCode:500}}),null);
});
test('explicit new outputs, external env and absolute prior required; mock cannot read credentials',()=>{
 assert.throws(()=>validateVisualConditionsOptions({out:'x',mock:true,priorSnapshot:'relative'}));
 assert.throws(()=>validateVisualConditionsOptions({out:'x',mock:true,priorSnapshot:resolve('reports/prior.json'),envFile:'E:/ChatGPT/Ux_test/.env'}));
 assert.throws(()=>validateVisualConditionsOptions({out:'x',mock:false,priorSnapshot:resolve('reports/prior.json'),envFile:resolve('.env')}));
 for(const limit of [0,19])assert.throws(()=>validateVisualConditionsOptions({out:'x',mock:true,priorSnapshot:resolve('reports/prior.json'),limit}));
});
test('new protocol freezes three actors, one repeat and exact bounded limits',async()=>{
 const p=JSON.parse(await readFile('experiments/virtual-beta/visual-conditions-comparison.json','utf8'));assert.deepEqual(p.actors,visualConditionsActors);assert.deepEqual(p.limits,visualConditionsLimits);assert.equal(p.repeats,1);assert.equal(p.extractor.model,'gpt-6-luna');assert.equal(p.actorChangesAllowed,false);
});
test('36-request ledgers require explicit mode cap and preserve old24 guard',async()=>{
 const dir='reports/visual-conditions-2026-10-30/parent/ledger-'+Date.now();await mkdir(dir,{recursive:true});const file=dir+'/budget.json';await writeFile(file,JSON.stringify({schemaVersion:1,newMaximum:36,perRunMaximum:12,used:0,attempts:[]}));await assert.rejects(readTransferLedger(file));assert.equal((await readTransferLedger(file,36)).used,0);
});

test('HTTP200 body-read failures with explicit response evidence prove receipt; absent evidence stays unknown',()=>{
 const slot=visualConditionsSchedule().find(s=>s.actor==='experience-visual-conditions')!,error={code:'TIMEOUT',attempts:1,httpReceived:true,statusCode:200};
 const result:any={runId:'receipt',condition:humanJevProfile(slot.actor).config.id,config:humanJevProfile(slot.actor).config,input:{charter:{goal:'local'}},objectiveAssessment:{status:'OK',value:false},terminalObservation:{status:'RECORDED'},validForComparison:false,termination:'API_ERROR',steps:[{number:1,visualHypotheses:{error},error}],apiCalls:1};
 const record:any={...slot,runId:'receipt',status:'RESULT',dir:'none',resultPath:'none',ledger:null,requests:1,initialImageSha256:null,result};
 assert.equal(analyzeVisualConditionsComparison([record]).actors[slot.actor].requestEvidence[0].apiReached,true);
 result.steps[0].visualHypotheses.error={code:'TIMEOUT',attempts:1,httpReceived:false};result.steps[0].error=result.steps[0].visualHypotheses.error;assert.equal(analyzeVisualConditionsComparison([record]).actors[slot.actor].requestEvidence[0].apiReached,null);
});

import {actionRelationQuestions} from '../jev/virtual-beta/action-relations.js';
import {offeredCandidates} from '../runner/virtual-beta-core.js';
import {candidatesFor} from '../jev/types.js';
import {recoveryDefinition} from '../app/recovery-fixture.js';
test('triplet admits only generated role questions; a changed legacy availability instruction cannot hide among declared differences',()=>{
 const fixture={version:1,task:'library',condition:'switch'} as const,goal=recoveryDefinition(fixture).goal,hash='b'.repeat(64),screen={title:'local',text:['local'],elements:[{id:'e1',type:'button' as const,text:'local'}],canScrollUp:false,canScrollDown:false},vision:any={mode:'crop',imageSha256:hash,sourceSha256:hash,width:1280,height:900,sourceWidth:1280,sourceHeight:900,fixation:{x:640,y:450},clearRect:{x:0,y:0,width:1280,height:900},transform:{offsetX:0,offsetY:0,scaleX:1,scaleY:1},visibleTargets:[{id:'e1',x:20,y:20,width:100,height:40}]};
 const records=visualConditionsActors.map((actor,i)=>{const config=humanJevProfile(actor).config,candidates=offeredCandidates(candidatesFor(screen,false),{...vision,bytes:Buffer.alloc(0)},config),current={id:'o1',imageSha256:hash,visibleText:[],fixation:vision.fixation,candidateIds:Object.keys(candidates)},input:any={goal,observation:{id:'o1',image:'current'},userState:{lastObservation:current}};if(i===2){input.visualHypotheses={kind:'test'};input.userState.visualHypotheses={schemaVersion:1,records:[]};}const stage={modelInput:input,assetFiles:{current:{file:'input-1.png',sha256:hash}},questions:actionRelationQuestions(goal,current,candidates,[{observationId:'o1',imageSha256:hash}],config.actionRelations?.evidencePolicy)};return {id:'x',fixture,replicate:1,actor,sequence:i+1,runId:'id'+i,status:'RESULT',dir:'none',ledger:null,resultPath:'none',requests:0,initialImageSha256:'a'.repeat(64),result:{runId:'id'+i,config,condition:config.id,input:{charter:{goal,prohibitedActions:{actionTypes:[],controlTexts:[],downloads:true}}},objectiveAssessment:{status:'OK',value:false},terminalObservation:{status:'RECORDED'},termination:'DECISION_LIMIT',steps:[{number:1,audit:{screen,recovery:{route:'primary'}},vision,assetFiles:stage.assetFiles,deliberation:stage}],code:{revision:'frozen',sourceHash:hash}}} as any;});
 for(const r of records){const q=r.result.steps[0].deliberation.questions;assert.ok(!Object.keys(q).some(k=>k.startsWith('actionRelation_contextEvidence_')));assert.equal(Object.keys(q).length,Object.keys(records[0].result.steps[0].deliberation.questions).length);}assert.equal(analyzeVisualConditionsComparison(records).pairs[0].matchedInitialEvidence,true);records[0].result.steps[0].deliberation.questions.actionRelation_availability.instructions='undeclared change';const report=analyzeVisualConditionsComparison(records);assert.equal(report.pairs[0].matchedInitialEvidence,false);assert.ok(report.pairs[0].reasons.includes('ACTION_RELATION_QUESTION_CONTRACT_MISMATCH'));
});
