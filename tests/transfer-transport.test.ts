import {currentJevImage} from './jev-image-wire.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {runHumanJev} from '../runner/human-jev-experiment.js';
import {transferDefinition,type TransferFixture} from '../app/transfer-fixture.js';
import {replayDirectory} from '../runner/virtual-beta-replay.js';
const sha=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
const answer=(b:any)=>({model:'jev-1.14.0',answers:Object.fromEntries(Object.entries(b.questions).map(([id,q]:[string,any])=>{const choice=id==='nextAction'?'done':id.startsWith('goalSearch_')?'uncertain':id==='decisionBasis'?'goal':id==='experienceProgress'||id==='experienceExpectation'?'unknown':id==='knowledge'?'insufficient':id==='goal'?'uncertain':id.startsWith('effect_')?'unknown':'none';assert.ok(Object.hasOwn(q.criteria,choice),id);return [id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,Number(k===choice)]))}];}))});

test('ordinary transfer HTTP stages retain the image-only boundary, exact profile and separate objective',async t=>{
 t.mock.method(process,'loadEnvFile',()=>{throw Error('REAL_ENV_READ_FORBIDDEN');});process.env.AI_GATEWAY_API_KEY='LOCAL_TRANSFER_TRANSPORT_ONLY';
 const base='reports/transfer-evaluation-2026-10-29';await mkdir(base,{recursive:true});const root=await mkdtemp(join(base,'transport-'));let calls:any[]=[];
 t.mock.method(globalThis,'fetch',async(url:Parameters<typeof fetch>[0],init?:Parameters<typeof fetch>[1])=>{assert.equal(String(url),'https://ai-gateway.vercel.sh/typesafe/v1/systemone');const b=JSON.parse(String(init?.body));calls.push(b);assert.equal(b.model,'jev-1.14.0');const wire=JSON.stringify({input:b.state,questions:b.questions});assert.doesNotMatch(wire,/transferFixture|definitionHash|objectiveDefinition|referencePath|expectedPath|data-transfer-|transfer=|sourceHash|rawScreenshot|"audit"|"oracle"/);assert.equal(b.state.exploration.charter.targetWebsite,'local:demo');assert.equal(b.state.exploration.charter.id,'holdout-task');assert.equal(b.state.observation.screen,undefined);assert.equal(b.state.history,undefined);assert.ok(b.state.userState.memory.every((m:any)=>m.visibleText.length===0));assert.ok(currentJevImage(b).data_base64);assert.equal(sha(Buffer.from(currentJevImage(b).data_base64,'base64')),b.state.userState.lastObservation.imageSha256);return Response.json(answer(b));});
 for(const task of ['catalog','draft','help'] as const){
  const fixture:TransferFixture={version:1,task,variant:'alpha'},ledger=join(root,task+'-budget.json');await writeFile(ledger,JSON.stringify({schemaVersion:1,status:'APPROVED',phase:'LOCAL_TRANSFER_STUB',newMaximum:24,perRunMaximum:12,used:0,attempts:[]}),{flag:'wx'});calls=[];
  const saved=await runHumanJev({out:join(root,task),mock:false,phaseBudget:ledger,mode:'experience-goal-search-grounded',longContext:true,transferFixture:fixture,runId:'transport-'+task});
  assert.equal(calls.length,2);assert.ok(calls[0].questions.knowledge);assert.ok(calls[1].questions.nextAction);assert.equal(saved.result.input.charter.goal,transferDefinition(fixture).goal);assert.equal(saved.result.perceivedDone,true);assert.equal(saved.result.objectiveAssessment.value,false);assert.equal(saved.result.uiActions,0);assert.equal(saved.result.apiCalls,2);assert.deepEqual(saved.result.transfer?.fixture,fixture);assert.equal((await replayDirectory(join(saved.root,'exploration'))).verified,true);const durable=JSON.parse(await readFile(ledger,'utf8'));assert.equal(durable.used,2);assert.ok(durable.attempts.every((a:any)=>a.status==='OK'));
 }
 delete process.env.AI_GATEWAY_API_KEY;
});

test('legacy sentinel input, questions and current images remain identical to pre-adapter baseline',async t=>{
 const base='reports/transfer-evaluation-2026-10-29';let original:any;try{original=JSON.parse(await readFile(join(base,'baseline-wire/exploration/result.json'),'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT'){t.skip('Historical pre-adapter raw baseline is a local artifact; generate it before adapters to check exact compatibility.');return;}throw e;}await mkdir(base,{recursive:true});const root=await mkdtemp(join(base,'sentinel-compat-'));
 const saved=await runHumanJev({out:join(root,'new'),mock:true,mode:'experience-goal-search-grounded',longContext:true,holdoutFixture:{task:'direct',variant:'alpha'},runId:'new-sentinel'});
 const now=saved.result.steps[0],old=original.steps[0];assert.deepEqual(now.deliberation?.modelInput,old.deliberation.modelInput);assert.deepEqual(now.deliberation?.questions,old.deliberation.questions);assert.deepEqual(now.modelInput,old.modelInput);assert.deepEqual(now.questions,old.questions);assert.deepEqual(now.assetFiles,old.assetFiles);assert.deepEqual(saved.result.config,original.config);
});
