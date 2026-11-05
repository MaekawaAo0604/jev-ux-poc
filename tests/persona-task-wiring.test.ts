import test from 'node:test';import assert from 'node:assert/strict';import {mkdir,readFile,access} from 'node:fs/promises';
import {runHumanJev} from '../runner/human-jev-experiment.js';import {replayDirectory} from '../runner/virtual-beta-replay.js';import {verifyTransferFrames} from '../runner/transfer-analysis.js';import {personaInputBindings} from '../runner/persona-beta-comparison.js';
const root='reports/persona-tasks-2026-11-06/parent/wiring-'+Date.now();
test('Persona task rejects invalid/conflicting fixture before output or dispatch',async()=>{
 await mkdir(root,{recursive:true});for(const [id,fixture,extra]of [['bad',{version:1,task:'not-a-task'},{}],['conflict',{version:1,task:'sessions'},{recoveryFixture:{version:1,task:'workshop',condition:'unchanged'}}]]as const){const out=root+'/'+id;await assert.rejects(runHumanJev({out,mock:true,personaTaskFixture:fixture,...extra}as any));await assert.rejects(access(out));}
});
test('ordinary three-stage runner binds Personas, isolates state and keeps fixture audit private for all3tasks',async()=>{
 await mkdir(root,{recursive:true});for(const task of ['sessions','preferences','privacy']as const){const hashes:string[]=[];for(const actor of ['baseline','A','B','C']){
 const persona=actor==='baseline'?undefined:JSON.parse(await readFile('experiments/persona/persona-'+actor.toLowerCase()+'.json','utf8'));
 const out=root+'/'+task+'-'+actor,saved=await runHumanJev({out,mock:true,mode:'experience-persona-unweighted',personaTaskFixture:{version:1,task},persona,maxRunMs:300000,visualRequestMs:60000});
 const r=saved.result;assert.equal(r.steps.length,1);assert.equal(r.termination,'SUBJECTIVE_DONE');assert.equal(r.objectiveSuccess,false);assert.equal(r.personaTask!.terminalSnapshot!.events.length,0);assert.equal(r.steps[0].audit!.personaTask!.task,task);assert.equal(r.personaTask!.terminalSnapshot!.scope,'none');
 assert.deepEqual(personaInputBindings({persona:persona??null,result:r}),{native:1,assessment:1,action:1,errors:[]});
 const s=r.steps[0],input=JSON.stringify({native:s.visualHypotheses!.request,assessment:s.deliberation!.modelInput,action:s.modelInput});for(const key of ['otherSessionActive','draftCompact','passwordChanged','data-persona-task','personaTask','terminalSnapshot'])assert.equal(input.includes(key),false,key+' audit leak');
 assert.equal((s.modelInput!.observation as any).screen,undefined);assert.equal((s.modelInput!.exploration as any).charter.oracle,undefined);
 hashes.push(s.assetFiles!.current.sha256);assert.equal((await replayDirectory(out+'/exploration')).verified,true);assert.ok((await verifyTransferFrames(r,out+'/exploration')).every(x=>x.successfulResponse&&x.validCurrentFrame));
 }assert.equal(new Set(hashes).size,1);}
});
