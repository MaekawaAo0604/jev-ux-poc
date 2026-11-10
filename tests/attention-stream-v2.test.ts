import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PNG} from 'pngjs';
import {runBeta,sha,type ModelRequest} from '../runner/virtual-beta-core.js';
import {replayDirectory} from '../runner/virtual-beta-replay.js';

const charter:any={schemaVersion:1,id:'attention-stream',targetWebsite:'https://fixture.invalid/',goal:'Find the answer',initialState:{description:'Public fixture',currentDate:'2026-11-10'},scope:['fixture'],prohibitedActions:{actionTypes:[],controlTexts:[],downloads:true},maxActions:1};
const bytes=PNG.sync.write(new PNG({width:32,height:32}));
const config=(policy:string,seed:number):any=>({schemaVersion:1,id:'attention-stream',initialFixation:{x:16,y:16},vision:{mode:'full',clearWidth:32,clearHeight:32,blurRadius:1},state:{enabled:true,memoryCapacity:0},selection:{mode:'sample',seed},behavior:'user',maxUIActions:1,maxLooks:1,maxDecisions:1,maxAPICalls:2,maxRunMs:90000,modeledActionMs:null,factors:{informationChannel:'image-state',extraActions:{look:true,reread:false,wait:false,abandon:false}},attention:{enabled:true,policy,sampling:'domain-separated-v1'}});
async function fixture(dir:string,policy:string,seed:number,inspectProbability:number,extra:any={}){
 const page:any={url:()=>charter.targetWebsite,screenshot:async()=>bytes};
 const adapter:any={canGoBack:false,observe:async()=>({title:'',text:[],elements:[],canScrollUp:false,canScrollDown:false}),captureDecisionScreenshot:async()=>({bytes,targets:[]}),act:async()=>{throw Error('unexpected UI operation');}};
 const evaluate=async(request:ModelRequest)=>({model:'TEST',answers:Object.fromEntries(Object.entries(request.questions).map(([id,q])=>{
  const gate=id==='nextAction'&&Object.hasOwn(q.criteria,'continue');
  const choice=gate?'continue':id==='gazeTarget'?'look_0':Object.keys(q.criteria)[0];
  const probabilities=Object.fromEntries(Object.keys(q.criteria).map(key=>[key,id==='gazeTarget'?.25:gate?(key==='continue'?1-inspectProbability:key==='inspect'?inspectProbability:0):Number(key===choice)]));
  return [id,{choice,probabilities}];
 }))});
 return runBeta(page,{runId:'attention-stream-'+seed,dir,baseURL:charter.targetWebsite,charter,config:{...config(policy,seed),...extra},evaluate,publicSite:{adapter,startURL:charter.targetWebsite,evidence:()=>({spec:{schemaVersion:1,id:'fixture',startURL:charter.targetWebsite,allowedDocuments:[charter.targetWebsite],harPath:'fixture.har',harSha256:sha('fixture'),capturedAtUTC:'2026-11-10T00:00:00Z',sourceDescription:'unit fixture'},events:[],networkMode:'frozen-har-no-fallback'})}});
}

test('hierarchical gaze preserves its offered conditional distribution across root seeds',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'attention-stream-conditional-')),counts={look_0:0,look_1:0,look_2:0,look_3:0};let inspections=0;
 for(let seed=0;seed<512;seed++){
  const result=await fixture(join(directory,String(seed)),'exclusive-hierarchical-v2',seed,.2),step=result.steps[0];
  assert.equal(result.apiCalls,step.attention?.selection?.selected==='inspect'?1:2);
  assert.deepEqual(step.attention?.response?.answers.nextAction.probabilities,{continue:.8,inspect:.2});
  assert.deepEqual(step.attention?.response?.answers.gazeTarget.probabilities,{look_0:.25,look_1:.25,look_2:.25,look_3:.25});
  if(seed<4)assert.equal((await replayDirectory(join(directory,String(seed)))).verified,true);
  if(step.attention?.selection?.selected!=='inspect')continue;
  inspections++;assert.equal(step.action?.type,'look');counts[step.selection!.selected as keyof typeof counts]++;
 }
 assert.ok(inspections>=50,'the fixture must exercise enough conditional inspections');
 console.log(JSON.stringify({rootSeeds:512,offeredGate:{continue:.8,inspect:.2},offeredGaze:{look_0:.25,look_1:.25,look_2:.25,look_3:.25},inspections,counts}));
 for(const [point,count] of Object.entries(counts))assert.ok(count/inspections>=.1&&count/inspections<=.4,JSON.stringify({point,count,inspections,counts,offeredConditionalProbability:.25}));
});

for(const policy of ['exclusive-flat-v2','exclusive-hierarchical-v2'])test(policy+' samples continuing actions from a stream distinct from its attention gate',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'attention-stream-continue-')),result=await fixture(directory,policy,1,0),step=result.steps[0];
 assert.equal(step.attention?.selection?.selected,'continue');assert.ok(step.selection);
 assert.notEqual(step.attention.selection.draw,step.selection.draw,'equal seed and counter reuse the gate uniform for the conditional action');
});

for(const policy of ['exclusive-flat-v2','exclusive-hierarchical-v2'])test(policy+' persists and replays root and effective stream seeds',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'attention-stream-metadata-')),result=await fixture(directory,policy,1,0),step=result.steps[0];
 assert.deepEqual((step.attention as any).sampling,{scheme:'domain-separated-v1',rootSeed:1,gateSeed:1146771349,gazeSeed:1506557937});
 assert.equal(step.attention?.selection?.seed,1146771349);assert.equal(step.selection?.seed,1);assert.equal((await replayDirectory(directory)).verified,true);
});

test('tagged argmax keeps choices identical to prior untagged v2 and forbids silent sampling downgrade',async()=>{
 for(const inspectProbability of [0,1]){
  const base=await mkdtemp(join(tmpdir(),'attention-stream-argmax-')),selection={mode:'argmax',seed:1};
  const tagged=await fixture(join(base,'tagged'),'exclusive-hierarchical-v2',1,inspectProbability,{selection});
  const prior=await fixture(join(base,'prior'),'exclusive-hierarchical-v2',1,inspectProbability,{selection,attention:{enabled:true,policy:'exclusive-hierarchical-v2'}});
  const step=tagged.steps[0],oldStep=prior.steps[0];assert.deepEqual(step.action,oldStep.action);assert.equal(step.attention?.selection?.selected,oldStep.attention?.selection?.selected);assert.equal(step.selection?.selected,oldStep.selection?.selected);assert.equal(step.selection?.draw,null);
  assert.equal((oldStep.attention as any).sampling,undefined);assert.equal(oldStep.attention?.selection?.seed,1);assert.equal((await replayDirectory(join(base,'prior'))).verified,true);assert.equal((await replayDirectory(join(base,'tagged'))).verified,true);
  const path=join(base,'tagged','result.json'),saved=await readFile(path,'utf8');
  for(const mutate of [(r:any)=>delete r.config.attention.sampling,(r:any)=>delete r.steps[0].attention.sampling,(r:any)=>{r.steps[0].attention.sampling.rootSeed++;},(r:any)=>{r.steps[0].attention.sampling.gateSeed++;},(r:any)=>{r.steps[0].attention.sampling.gazeSeed++;},(r:any)=>{r.steps[0].attention.sampling.scheme='forged';},(r:any)=>{r.steps[0].attention.sampling.extra=true;},(r:any)=>{r.steps[0].attention.selection.seed=1;}]){
   const r=JSON.parse(saved);mutate(r);await writeFile(path,JSON.stringify(r));await assert.rejects(replayDirectory(join(base,'tagged')),/ATTENTION/);
  }
  if(inspectProbability===1){assert.equal((step.attention as any).gazeSelection.seed,1506557937);const r=JSON.parse(saved);r.steps[0].attention.gazeSelection.seed=1;await writeFile(path,JSON.stringify(r));await assert.rejects(replayDirectory(join(base,'tagged')),/ATTENTION/);}
  const priorPath=join(base,'prior','result.json'),r=JSON.parse(await readFile(priorPath,'utf8'));r.steps[0].attention.sampling=(step.attention as any).sampling;await writeFile(priorPath,JSON.stringify(r));await assert.rejects(replayDirectory(join(base,'prior')),/ATTENTION/);
 }
});

test('default legacy sampling retains root seeds and its prior record shape',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'attention-stream-legacy-')),result=await fixture(directory,'exclusive-hierarchical-v2',1,0,{attention:{enabled:true}}),step=result.steps[0];
 assert.equal((step.attention as any).sampling,undefined);assert.equal(step.attention?.selection?.seed,1);assert.equal(step.selection?.seed,1);assert.equal(step.attention?.selection?.draw,step.selection?.draw);assert.equal((await replayDirectory(directory)).verified,true);
});

test('attention task framing is applied to the gate and strictly replayed while current-view action keeps the user goal',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'attention-stream-frame-')),result=await fixture(directory,'exclusive-hierarchical-v2',1,0,{attention:{enabled:true,policy:'exclusive-hierarchical-v2',sampling:'domain-separated-v1',taskFrame:'attention-v1'}}),step=result.steps[0],gate=step.attention!;
 assert.equal(gate.modelInput.decisionTask,'visual-attention-only');assert.equal(gate.modelInput.endUserGoal,'Find the answer');assert.equal((gate.modelInput.exploration as any).charter.goal,'Find the answer');assert.notEqual(gate.modelInput.goal,'Find the answer');assert.equal(step.modelInput?.goal,'Find the answer');assert.equal(step.modelInput?.decisionTask,undefined);assert.equal((await replayDirectory(directory)).verified,true);
 const path=join(directory,'result.json'),saved=await readFile(path,'utf8');
 for(const mutate of [(r:any)=>delete r.config.attention.taskFrame,(r:any)=>{r.steps[0].attention.modelInput.goal='Find the answer';r.steps[0].attention.inputSha256=sha(JSON.stringify({input:r.steps[0].attention.modelInput,questions:r.steps[0].attention.questions,assets:r.steps[0].attention.assetFiles}));}]){const r=JSON.parse(saved);mutate(r);await writeFile(path,JSON.stringify(r));await assert.rejects(replayDirectory(directory),/ATTENTION/);}
});
