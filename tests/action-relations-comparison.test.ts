import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const api=await import('../runner/action-relations-comparison.js').catch(()=>({} as any));
const oldActor='experience-goal-search-grounded',newActor='experience-action-relations';

test('24-trial schedule pairs identical fixture and reverses second-block fixtures and actor order',()=>{
 assert.equal(typeof api.actionRelationsSchedule,'function');const schedule=api.actionRelationsSchedule();assert.equal(schedule.length,24);
 const pairs=Array.from({length:12},(_,i)=>schedule.slice(i*2,i*2+2));
 for(const [a,b] of pairs){assert.equal(a.id,b.id);assert.deepEqual(a.fixture,b.fixture);assert.equal(a.replicate,b.replicate);assert.deepEqual(new Set([a.actor,b.actor]),new Set([oldActor,newActor]));}
 assert.deepEqual(pairs.slice(6).map(p=>p[0].fixture),pairs.slice(0,6).map(p=>p[0].fixture).reverse());
 assert.deepEqual(pairs[0].map((r:any)=>r.actor),[oldActor,newActor]);assert.deepEqual(pairs[1].map((r:any)=>r.actor),[newActor,oldActor]);assert.deepEqual(pairs[6].map((r:any)=>r.actor),[newActor,oldActor]);
 assert.equal(new Set(schedule.map((r:any)=>r.id+'-'+r.actor)).size,24);assert.equal(api.actionRelationsLimits.parallel,1);
});
test('explicit bounds and external real credentials; mock must never read an env file',()=>{
 assert.equal(typeof api.validateActionRelationsOptions,'function');const base={out:resolve('reports/new'),mock:true,priorSnapshot:resolve('reports/prior.json')};
 for(const o of [{...base,out:''},{...base,limit:0},{...base,limit:25},{...base,limit:1.5},{...base,envFile:'E:/secret.env'},{...base,mock:false},{...base,mock:false,envFile:resolve('.env')},{...base,priorSnapshot:'relative'}])assert.throws(()=>api.validateActionRelationsOptions(o));
 api.validateActionRelationsOptions(base);api.validateActionRelationsOptions({...base,limit:1});api.validateActionRelationsOptions({...base,mock:false,envFile:'E:/ChatGPT/Ux_test/.env'});
});
test('existing output refuses before credential, source, or browser access',async()=>{
 assert.equal(typeof api.runActionRelationsComparison,'function');const out=await mkdtemp(join(tmpdir(),'action-relations-existing-'));
 await assert.rejects(()=>api.runActionRelationsComparison({out,mock:true,priorSnapshot:join(out,'missing')}),{code:'EEXIST'});
});
test('quota/auth and masked accounting faults stop next trial; ordinary action/model failure is distinct',()=>{
 assert.equal(typeof api.actionRelationsStopReason,'function');for(const statusCode of [401,402,403,404,429])assert.equal(api.actionRelationsStopReason({result:{steps:[{error:{statusCode}}]}}),'PROVIDER_UNAVAILABLE');
 for(const code of ['BUDGET_ADMISSION_ERROR','BUDGET_SETTLEMENT_AFTER_REQUEST','LEDGER_ACCOUNTING_UNAVAILABLE'])assert.equal(api.actionRelationsStopReason({error:{code}}),'BUDGET_ACCOUNTING_FAILURE');
 assert.equal(api.actionRelationsStopReason({error:{statusCode:500}}),null);assert.equal(api.actionRelationsStopReason({apiMs:402}),null);
});
test('offline empty summaries retain 24 planned, both actors and all 12 missing pairs',()=>{
 assert.equal(typeof api.analyzeActionRelationsComparison,'function');const r=api.analyzeActionRelationsComparison([],{mock:true});
 assert.equal(r.completeness.planned,24);assert.equal(r.completeness.attempted,0);assert.equal(r.completeness.notAttempted,24);assert.equal(r.completeness.matchedInitialPairs,0);assert.equal(r.completeness.complete,false);assert.equal(r.pairs.length,12);
 for(const actor of [oldActor,newActor]){assert.equal(r.actors[actor].totals.planned,12);assert.equal(r.actors[actor].totals.objectiveSuccesses,0);assert.equal(r.actors[actor].measurements.chargedRequests,0);assert.equal(r.actors[actor].measurements.knownHTTPAttempts,0);}
 assert.match(r.kind,/mock/);
});
test('charged-but-no-result reservations remain invalid and do not prove a HTTP attempt or service receipt',()=>{
 assert.equal(typeof api.analyzeActionRelationsComparison,'function');const s=api.actionRelationsSchedule()[0];
 const r=api.analyzeActionRelationsComparison([{...s,runId:'x',status:'FAILED',dir:'unused',ledger:'unused',resultPath:'unused',requests:1,initialImageSha256:null,ledgerEvidence:{used:1,sha256:'a'.repeat(64),reserved:1,ok:0,errors:0},error:{code:'UNKNOWN'}}]);
 assert.equal(r.completeness.attempted,1);assert.equal(r.completeness.valid,0);assert.equal(r.completeness.notAttempted,23);const m=r.actors[oldActor].measurements;
 assert.equal(m.chargedRequests,1);assert.equal(m.knownHTTPAttempts,0);assert.equal(m.unknownAttemptRuns,1);assert.equal(m.unknownReachRuns,1);assert.equal(r.actors[oldActor].totals.infrastructure,1);
});
test('protocol fixes Jev only, two actors, 24 trial limits and no posthoc actor changes',async()=>{
 const p=JSON.parse(await readFile('experiments/virtual-beta/action-relations-comparison.json','utf8'));
 assert.equal(p.provider,'jev');assert.deepEqual(p.actors,[oldActor,newActor]);assert.equal(p.persona,null);assert.equal(p.repeats,2);assert.equal(p.actorChangesAllowed,false);assert.deepEqual(p.limits,api.actionRelationsLimits);
});

async function syntheticPair(){
 const {humanJevProfile}=await import('../runner/human-jev-profiles.js');const {recoveryDefinition}=await import('../app/recovery-fixture.js');const {createHash}=await import('node:crypto');
 const fixture={version:1,task:'library',condition:'changed'} as const,definition=recoveryDefinition(fixture),hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
 const initial='a'.repeat(64),current='b'.repeat(64),state={schemaVersion:1,route:'primary',eligible:false,verificationAttempts:0,recordChecks:0,savedValue:definition.originalValue,complete:false};
 return [oldActor,newActor].map((actor,index)=>{
  const config=humanJevProfile(actor as any).config,runId='synthetic-'+actor;
  const response={model:'jev-1.14.0',answers:{},request:{attempts:1}},questions:any={goal:{type:'choice',instructions:'Assess whole goal',criteria:{unknown:'Unknown',blocked:'Blocked'}}};
  if(index===1)questions.actionRelation_availability={type:'choice',instructions:'Assess availability',criteria:{unknown:'Unknown',blocked:'Blocked'}};
  const result:any={schemaVersion:1,runId,condition:config.id,config,code:{revision:'frozen',sourceHash:'c'.repeat(64)},input:{charter:{goal:definition.goal}},objectiveSuccess:false,objectiveAssessment:{status:'OK',value:false},terminalObservation:{status:'RECORDED'},validForComparison:true,perceivedDone:false,termination:'DECISION_LIMIT',looks:0,uiActions:0,decisions:1,apiCalls:2,apiMs:10,recovery:{fixture,definitionHash:hash(definition),initialProductImage:{file:'initial-product.png',sha256:initial},terminalSnapshot:state},steps:[{number:1,observationId:'o1',audit:{url:'http://localhost:3000/good/#primary',recovery:state},assetFiles:{current:{file:'input-1.png',sha256:current}},deliberation:{modelInput:{goal:definition.goal,observation:{id:'o1',image:'current'}},questions,assetFiles:{current:{file:'input-1.png',sha256:current}},response},response,action:{type:'wait'},outcome:'WAIT_NO_UI'}]};
  return {id:'recovery-library-changed-r1',fixture,replicate:1,actor,sequence:index+1,runId,status:'RESULT',dir:'unused',ledger:null,resultPath:'unused',requests:2,initialImageSha256:initial,result,frameChecks:[{step:1,stage:'assessment',observationId:'o1',imageSha256:current,validCurrentFrame:true,successfulResponse:true,scope:'full-viewport-current'}]};
 });
}
test('declared config and question differences are valid, while image/goal/undeclared questions fail pairing',async()=>{
 const pair=await syntheticPair(),report=api.analyzeActionRelationsComparison(pair);assert.equal(report.completeness.valid,2);assert.equal(report.completeness.matchedInitialPairs,1);assert.equal(report.completeness.notAttempted,22);assert.equal(report.integrity.ok,true);assert.equal(report.actors[newActor].measurements.knownHTTPAttempts,2);
 for(const change of [(p:any[])=>{p[1].result.steps[0].deliberation.assetFiles.current.sha256='d'.repeat(64);},(p:any[])=>{p[1].result.steps[0].deliberation.modelInput.goal='different';},(p:any[])=>{p[1].result.steps[0].deliberation.questions.goal.instructions='undeclared intervention';},(p:any[])=>{delete p[1].result.steps[0].deliberation.questions.actionRelation_availability;}]){
  const changed=structuredClone(pair);change(changed);const summary=api.analyzeActionRelationsComparison(changed);assert.equal(summary.completeness.matchedInitialPairs,0);assert.equal(summary.integrity.ok,false);
 }
});
test('wrong actor config, duplicate actual identities and returned-model changes never become valid success',async()=>{
 const pair=await syntheticPair();pair[1].result.config=pair[0].result.config;pair[1].result.condition=pair[0].result.condition;let report=api.analyzeActionRelationsComparison(pair);assert.equal(report.actors[newActor].completeness.valid,0);
 const duplicate=await syntheticPair();duplicate[1].runId=duplicate[0].runId;duplicate[1].result.runId=duplicate[0].runId;report=api.analyzeActionRelationsComparison(duplicate);assert.equal(report.completeness.valid,0);
 const model=await syntheticPair();model[1].result.steps[0].response.model='gpt-6-luna';report=api.analyzeActionRelationsComparison(model);assert.equal(report.actors[newActor].completeness.valid,0);assert.ok(report.integrity.errors.some((e:any)=>e.code==='MODEL_MISMATCH'));
});
test('assessment errors mirrored on the action step count only one known HTTP request',async()=>{
 const [record]=await syntheticPair();delete record.result.steps[0].response;delete record.result.steps[0].deliberation.response;const error={code:'HTTP_ERROR',statusCode:500,attempts:1};record.result.steps[0].error=error;record.result.steps[0].deliberation.error=error;record.result.apiCalls=1;record.requests=1;record.result.termination='API_ERROR';record.result.validForComparison=false;
 const report=api.analyzeActionRelationsComparison([record]),measure=report.actors[oldActor].measurements;assert.equal(measure.knownHTTPAttempts,1);assert.equal(measure.apiReachedRuns,1);assert.equal(measure.requestAttemptedRuns,1);assert.equal(report.completeness.valid,0);assert.equal(report.actors[oldActor].totals.infrastructure,1);
});
