import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import * as experiment from '../runner/deferral-reason-experiment.js';
import {replayDirectory} from '../runner/virtual-beta-replay.js';
import type {BetaResult,BetaStep} from '../runner/virtual-beta-core.js';

const gateway='https://ai-gateway.vercel.sh/typesafe/v1/systemone';
const root=resolve('reports/gateway-stop-2026-10-29');
const invocation=Date.now()+'-'+process.pid;
const json=async(path:string)=>JSON.parse(await readFile(path,'utf8'));
type BlockingFailure={code:'HTTP_ERROR';statusCode:402;step:number;stage:'assessment'|'action'};
function detect(result:BetaResult){
 const helper=(experiment as unknown as {blockingGatewayFailure?:(result:BetaResult)=>BlockingFailure|undefined}).blockingGatewayFailure;
 assert.equal(typeof helper,'function','pure final gateway failure detector must exist');return helper!(result);
}
function failedResult(stage:'assessment'|'action',statusCode=402):BetaResult{
 const error={code:'HTTP_ERROR',statusCode},step:BetaStep={number:3,error,...(stage==='assessment'?{deliberation:{modelInput:{},questions:{},assetFiles:{},inputSha256:'input',apiCalls:1,error},outcome:'ASSESSMENT_ERROR'}:{})};
 return {termination:'API_ERROR',steps:[step]} as BetaResult;
}

test('normal two-slot batch stops after the first HTTP402 fake request and finalizes failure evidence and budgets',async()=>{
 const dir=join(root,invocation),out=join(dir,'batch');await mkdir(dir,{recursive:true});
 const dummyEnv=join(dir,'dummy.env');await writeFile(dummyEnv,'AI_GATEWAY_API_KEY=LOCAL_HTTP_402_TEST_ONLY\n',{flag:'wx'});
 const prior=await experiment.snapshotReasonPriorLedgers('goal-search'),previousFetch=globalThis.fetch;
 let calls=0;const stages:string[]=[];
 process.env.AI_GATEWAY_API_KEY='LOCAL_HTTP_402_TEST_ONLY';
 globalThis.fetch=async(input,options)=>{
  const url=input instanceof Request?input.url:String(input);assert.equal(url,gateway,'all external fetch calls must be intercepted at the expected gateway');
  assert.ok(new Headers(options?.headers).get('Authorization')==='Bearer LOCAL_HTTP_402_TEST_ONLY','the test must use only the dummy credential');
  calls++;assert.ok(calls<=2,'the old bounded two-slot reproduction must never make more than two fake requests');
  const body=JSON.parse(String(options?.body));stages.push(body.questions.nextAction?'action':'assessment');
  return Response.json({error:{message:'LOCAL_GATEWAY_HTTP_402_TEST_ONLY'}},{status:402});
 };
 let saved:Awaited<ReturnType<typeof experiment.runDeferralReasonExperiment>>;
 try{saved=await experiment.runDeferralReasonExperiment({out,mock:false,envFile:dummyEnv,comparison:'goal-search',limit:2});}
 finally{globalThis.fetch=previousFetch;delete process.env.AI_GATEWAY_API_KEY;}
 await writeFile(join(dir,'stub-observed.json'),JSON.stringify({fakeRequests:calls,externalRequests:0,stages,priorLedgers:prior.length,result:saved},null,2)+'\n');
 assert.equal(calls,1,'HTTP402 must stop before a second trial makes another request');assert.deepEqual(stages,['assessment']);assert.equal(saved.status,'GATEWAY_HTTP_402');assert.equal(saved.trials,1);assert.equal(saved.requests,1);
 const manifest=await json(join(out,'manifest.json'));assert.equal(manifest.status,'GATEWAY_HTTP_402');assert.equal(manifest.records.length,1);assert.equal(manifest.requestAccounting.used,1);assert.equal(manifest.budgetLedgers.length,1);assert.equal(manifest.budgetLedgers[0].used,1);
 const first=experiment.reasonSchedule()[0],second=experiment.reasonSchedule()[1];assert.equal(manifest.records[0].id,first.id);assert.equal(manifest.records[0].requests,1);assert.deepEqual(manifest.gatewayFailure,{code:'HTTP_ERROR',statusCode:402,step:1,stage:'assessment',runId:first.id,resultPath:first.id+'/exploration/result.json'});await assert.rejects(readFile(join(out,second.id+'-budget.json')),{code:'ENOENT'});await assert.rejects(readFile(join(out,second.id,'manifest.json')),{code:'ENOENT'});
 const ledger=await json(join(out,first.id+'-budget.json'));assert.equal(ledger.used,1);assert.equal(ledger.attempts.length,1);assert.equal(ledger.attempts[0].status,'ERROR');assert.equal(ledger.attempts[0].metadata.attempts,1);assert.equal(ledger.attempts[0].metadata.failureCode,'HTTP_ERROR');
 const result:BetaResult=await json(join(out,manifest.records[0].resultPath));assert.equal(result.termination,'API_ERROR');assert.equal(result.validForComparison,false);assert.equal(result.perceivedDone,false);assert.equal(result.objectiveSuccess,false);assert.equal(result.steps.at(-1)?.error!==undefined,true);assert.deepEqual(detect(result),{code:'HTTP_ERROR',statusCode:402,step:1,stage:'assessment'});
 const replay=await replayDirectory(join(out,first.id,'exploration'));assert.equal(replay.verified,true);assert.equal((await json(join(out,manifest.records[0].replayPath))).verified,true);
 const check=await json(join(out,'prior-ledger-check.json'));assert.equal(check.unchanged,true);assert.equal(check.checked,prior.length);assert.deepEqual(await experiment.snapshotReasonPriorLedgers('goal-search'),prior);
 const summary=await json(join(out,'summary.json'));assert.equal(summary.received,1);assert.equal(summary.runs[0].fault,true);assert.equal(summary.cells[0].valid,0);assert.equal(summary.cells[0].successes,0);assert.equal(summary.cells[0].falseDone,0);
});
test('blocking gateway detector preserves assessment and action stage evidence only for final HTTP402 API errors',()=>{
 assert.deepEqual(detect(failedResult('assessment')),{code:'HTTP_ERROR',statusCode:402,step:3,stage:'assessment'});
 assert.deepEqual(detect(failedResult('action')),{code:'HTTP_ERROR',statusCode:402,step:3,stage:'action'});
});
test('blocking gateway detector does not broaden stopping to HTTP500 other codes nonfinal errors or non-API terminations',()=>{
 for(const stage of ['assessment','action'] as const)for(const status of [400,401,403,408,429,500,503])assert.equal(detect(failedResult(stage,status)),undefined);
 for(const termination of ['SUBJECTIVE_DONE','ABANDONED','STUCK','API_LIMIT','TIME_LIMIT','DECISION_LIMIT'] as const){const result=failedResult('assessment');result.termination=termination;assert.equal(detect(result),undefined);}
 const previous=failedResult('assessment');previous.steps.push({number:4,error:{code:'HTTP_ERROR',statusCode:500}});assert.equal(detect(previous),undefined);
 const wrongCode=failedResult('action');wrongCode.steps[0].error={code:'REQUEST_FAILED',statusCode:402};assert.equal(detect(wrongCode),undefined);
 const stringStatus=failedResult('action');stringStatus.steps[0].error={code:'HTTP_ERROR',statusCode:'402'};assert.equal(detect(stringStatus),undefined);
 const absentError=failedResult('assessment');delete absentError.steps[0].error;assert.equal(detect(absentError),undefined);
 const empty=failedResult('action');empty.steps=[];assert.equal(detect(empty),undefined);
});
