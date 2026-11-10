import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {main} from '../runner/virtual-beta.js';
import {createSemanticTrials} from '../runner/semantic-protocol.js';
import {replayDirectory} from '../runner/virtual-beta-replay.js';

test('semantic CLI reaches real adapter stub with private assignment absent, equal initial inputs and both choices offered',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'semantic-cli-')),budget=join(dir,'budget.json'),output=join(dir,'runs'),seed=313977649;
 await writeFile(budget,JSON.stringify({schemaVersion:1,status:'APPROVED',phase:'LOCAL_STUB',newMaximum:8,perRunMaximum:4,used:0,attempts:[]}));
 const trials=createSemanticTrials(['reference'],1,seed),fetchBefore=globalThis.fetch,keyBefore=process.env.AI_GATEWAY_API_KEY;let calls=0;
 process.env.AI_GATEWAY_API_KEY='LOCAL_ONLY';
 try{
  globalThis.fetch=async(_url,options)=>{const body=JSON.parse(String(options!.body)),wire=JSON.stringify({state:body.state,questions:body.questions});assert.doesNotMatch(wire,/semanticFixture|mapping|pairId|definitionHash|semantic-cue|semantic-a|semantic-b|設定Aは|設定Bは|設定A、|設定B、/);assert.equal(body.state.exploration.charter.targetWebsite,'local:demo');assert.equal(body.state.observation.screen,undefined);assert.ok(body.questions.nextAction.criteria.e1);assert.ok(body.questions.nextAction.criteria.e2);
   const index=calls++,choice=index%3===0?'look_3':index%3===1?(trials[Math.floor(index/3)].fixture.mapping==='A'?'e1':'e2'):'done';
   return new Response(JSON.stringify({model:'jev-1.14.0',answers:Object.fromEntries(Object.entries(body.questions as Record<string,{criteria:Record<string,string>}>).map(([key,q])=>{const selected=key==='nextAction'?choice:'goal';return [key,{choice:selected,probabilities:Object.fromEntries(Object.keys(q.criteria).map(id=>[id,id===selected?1:0]))}];}))}),{status:200});
  };
  const result=await main(['--semantic','--order-seed',String(seed),'--repeat','1','--conditions','semantic-capability','--ui','reference','--config','experiments/virtual-beta/semantic-capability.json','--charter','experiments/persona/charter-semantic.json','--env-file',join(dir,'ABSENT'),'--phase-budget',budget,'--max-total-api','8','--out',output]);assert.equal(calls,6);assert.equal(result!.results.length,2);
  const [a,b]=result!.results;assert.equal(a.steps[0].inputSha256,b.steps[0].inputSha256);assert.equal(a.steps[0].vision!.imageSha256,b.steps[0].vision!.imageSha256);assert.notEqual(a.steps[0].audit!.sourceSha256,b.steps[0].audit!.sourceSha256);
  for(const r of result!.results){assert.equal(r.objectiveAssessment.value,true);assert.equal(r.perceivedDone,true);assert.equal(r.looks,1);assert.equal(r.uiActions,1);assert.equal(r.steps[0].audit!.sourceSha256,r.steps[1].audit!.sourceSha256);assert.ok(r.semantic?.initialProductImage.sha256);assert.equal((await replayDirectory(join(output,r.runId))).verified,true);}
  const comparison=JSON.parse(await readFile(join(output,'comparison.json'),'utf8'));assert.equal(comparison.actualAPIRequests,6);assert.equal(comparison.semanticComparison.dataSource,'REAL_JEV');assert.equal(comparison.semanticComparison.mappingTest.status,'unavailable','Only two local stub trials, not full preregistered dataset');assert.ok(comparison.initialStateGroups.every((g:any)=>g.match));
 }finally{globalThis.fetch=fetchBefore;if(keyBefore===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=keyBefore;}
});
