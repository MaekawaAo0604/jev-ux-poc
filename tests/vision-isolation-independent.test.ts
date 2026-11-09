import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,mkdtemp,writeFile,access} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {PNG} from 'pngjs';
import {sourceIdentity} from '../runner/virtual-beta-source.js';
import {parseControlledComparisonPlan,scheduleControlledComparison,type ControlledComparisonPlan} from '../runner/controlled-comparison-plan.js';
import {runBeta,modelInput,sha,type ModelRequest,type BetaResult} from '../runner/virtual-beta-core.js';
import {parseCharter,parsePersona} from '../jev/persona.js';
import {replayDirectory} from '../runner/virtual-beta-replay.js';
import type {BetaConfig} from '../jev/virtual-beta/contracts.js';

const root='reports/vision-isolation-2026-11-09/independent';
const studyPath='experiments/virtual-beta/vision-isolation-v1/study.json';
const json=async(file:string)=>JSON.parse(await readFile(file,'utf8'));
const study=await json(studyPath);
const plans:{batch:any;plan:ControlledComparisonPlan}[]=await Promise.all(study.batches.map(async(batch:any)=>({batch,plan:parseControlledComparisonPlan(await json(batch.plan))})));
const canonical=(c:BetaConfig)=>{const value=structuredClone(c);value.id='neutral';return value;};
const inside=(outer:any,r:any)=>r.x>=outer.x&&r.y>=outer.y&&r.width>0&&r.height>0&&r.x+r.width<=outer.x+outer.width&&r.y+r.height<=outer.y+outer.height;
const withoutMemory=(input:any)=>{const value=structuredClone(input);delete value.userState.memory;delete value.memoryObservations;return value;};

test('independent vision preflight: all nine inputs and all 194 source files retain frozen bytes',async t=>{
 const path='reports/vision-isolation-2026-11-09/freeze.json';
 try{await access(path);}catch{t.skip('Frozen local execution record unavailable in clean checkout');return;}
 const freeze=await json(path),current=await sourceIdentity();
 assert.equal(freeze.revision,'9682397dbccdfddb9ef6bc0d9a2227d9b0a6a714');
 assert.equal(freeze.sourceHash,'c91a8213caeb35576e21b0c90c64008b04c016e08db68573bc15c38174fb6389');
 assert.equal(Object.keys(freeze.inputs).length,9);assert.equal(Object.keys(freeze.sourceHashes).length,194);
 assert.deepEqual(current.sourceHashes,freeze.sourceHashes);assert.equal(current.sourceHash,freeze.sourceHash);
 for(const [file,hash] of Object.entries(freeze.inputs))assert.equal(sha(await readFile(file)),hash,file);
});

test('independent vision preflight: fixed 18 slots, 216 allocation, one-axis contrasts and balanced positions',()=>{
 assert.deepEqual(study.seeds,[4001,4002,4003]);assert.deepEqual(study.visionModes,['full','crop','foveated']);assert.deepEqual(study.memoryCapacities,[0,3]);
 assert.equal(plans.length,6);assert.equal(study.maxPhaseMs,45*60000);assert.equal(study.batchDurationMs,10*60000);assert.equal(study.parallel,1);assert.equal(study.retry,0);
 assert.deepEqual(plans.map(p=>p.batch.memoryCapacity),[0,3,3,0,0,3]);
 let slots=0,allocation=0;
 for(const {batch,plan} of plans){
  assert.equal(plan.maxDurationMs,600000);assert.equal(plan.maxTotalAPI,36);assert.equal(plan.allocatedAPIRequests,36);assert.deepEqual(plan.seeds,[batch.seed]);
  const scheduled=scheduleControlledComparison(plan);assert.equal(scheduled.length,3);assert.deepEqual(new Set(plan.configs.map(c=>c.vision.mode)),new Set(['full','crop','foveated']));
  slots+=scheduled.length;allocation+=plan.allocatedAPIRequests;
  for(const {config:c,seed} of scheduled){
   assert.equal(seed,batch.seed);assert.equal(c.selection.seed,batch.seed);assert.equal(c.selection.mode,'argmax');assert.equal(c.behavior,'goal');
   assert.deepEqual(c.state,{enabled:true,memoryCapacity:batch.memoryCapacity});assert.deepEqual(c.factors,{informationChannel:'image-state',extraActions:{look:true,reread:false,wait:false,abandon:false}});
   assert.equal(c.maxAPICalls,12);assert.equal(c.maxUIActions,6);assert.equal(c.maxLooks,4);assert.equal(c.maxDecisions,10);assert.equal(c.maxRunMs,90000);assert.equal(c.modeledActionMs,null);
   const normalized=canonical(c),base=canonical(scheduled[0].config);normalized.vision.mode=base.vision.mode;assert.deepEqual(normalized,base);
  }
 }
 assert.equal(slots,18);assert.equal(allocation,216);assert.equal(study.plannedTrials,slots);assert.equal(study.allocatedAPIRequests,allocation);
 for(const mode of study.visionModes){for(const memory of [0,3]){
  const positions=plans.filter(p=>p.batch.memoryCapacity===memory).map(p=>scheduleControlledComparison(p.plan).find(r=>r.config.vision.mode===mode)!.position).sort();assert.deepEqual(positions,[1,2,3]);
 }for(const seed of study.seeds){
  const pair=[0,3].map(memory=>canonical(scheduleControlledComparison(plans.find(p=>p.batch.memoryCapacity===memory&&p.batch.seed===seed)!.plan).find(r=>r.config.vision.mode===mode)!.config));pair[0].state.memoryCapacity=3;assert.deepEqual(pair[0],pair[1]);
 }}
});

const fixture=`<!doctype html><html lang="ja"><meta charset="utf-8"><title>DOM_INDEPENDENT_SECRET</title><style>html,body{margin:0;width:1280px;height:900px;background:repeating-conic-gradient(#acd 0% 25%,#345 0% 50%) 0 0/16px 16px}button{position:absolute;width:180px;height:50px}#a{left:440px;top:400px}#b{left:25px;top:40px}#c{left:900px;top:400px}</style><button id="a" onclick="document.querySelector('#status').textContent='メール通知を停止しました'">メール通知を停止する</button><button id="b">DOM_INDEPENDENT_SECRET outside</button><button id="c">DOM_INDEPENDENT_SECRET right</button><p id="status" role="status" style="position:absolute;left:440px;top:475px"></p></html>`;

function verifyPixels(rawBytes:Buffer,delivered:Buffer,step:any){
 const raw=PNG.sync.read(rawBytes),image=PNG.sync.read(delivered),v=step.vision,rect=v.clearRect;
 assert.equal(sha(rawBytes),v.sourceSha256);assert.equal(sha(delivered),v.imageSha256);assert.equal(raw.width,1280);assert.equal(raw.height,900);
 const expected=v.mode==='full'?{x:0,y:0,width:1280,height:900}:{x:Math.max(0,v.fixation.x-480),y:Math.max(0,v.fixation.y-310),width:Math.min(1280,v.fixation.x+480)-Math.max(0,v.fixation.x-480),height:Math.min(900,v.fixation.y+310)-Math.max(0,v.fixation.y-310)};
 assert.deepEqual(rect,expected);assert.equal(image.width,v.mode==='crop'?rect.width:1280);assert.equal(image.height,v.mode==='crop'?rect.height:900);
 if(v.mode==='full')assert.deepEqual(delivered,rawBytes);
 if(v.mode==='crop')for(let y=0;y<image.height;y++)assert.deepEqual(image.data.subarray(y*image.width*4,(y+1)*image.width*4),raw.data.subarray(((rect.y+y)*raw.width+rect.x)*4,((rect.y+y)*raw.width+rect.x+rect.width)*4));
 if(v.mode==='foveated'){
  for(let y=rect.y;y<rect.y+rect.height;y++)assert.deepEqual(image.data.subarray((y*1280+rect.x)*4,(y*1280+rect.x+rect.width)*4),raw.data.subarray((y*1280+rect.x)*4,(y*1280+rect.x+rect.width)*4));
  const x=1200,y=850,sums=[0,0,0,0];let count=0;
  for(let yy=y-12;yy<=y+12;yy++)for(let xx=x-12;xx<=x+12;xx++){count++;for(let c=0;c<4;c++)sums[c]+=raw.data[(yy*1280+xx)*4+c];}
  assert.deepEqual([...image.data.subarray((y*1280+x)*4,(y*1280+x)*4+4)],sums.map(n=>Math.round(n/count)));
 }
}

test('independent vision pipeline: all six frozen arms bind actual PNG, offered geometry, look and bounded memory without external API',async()=>{
 await mkdir(root,{recursive:true});const out=await mkdtemp(join(root,'pipeline-'));
 const charter=parseCharter(await json(study.charter)),persona=parsePersona(await json(study.persona));
 const browser=await chromium.launch({headless:true});const all:{capacity:number;mode:string;result:BetaResult;requests:any[];dir:string}[]=[];
 try{for(const capacity of [0,3])for(const mode of ['full','crop','foveated']){
  const config=structuredClone(scheduleControlledComparison(plans.find(p=>p.batch.memoryCapacity===capacity&&p.batch.seed===4001)!.plan).find(r=>r.config.vision.mode===mode)!.config);
  const context=await browser.newContext({viewport:{width:1280,height:900},locale:'ja-JP',timezoneId:'Asia/Tokyo'});let requests:any[]=[];let blocked=0;
  try{
   await context.route('**/*',route=>{if(new URL(route.request().url()).origin==='http://independent.local')return route.fulfill({contentType:'text/html',body:fixture});blocked++;return route.abort();});
   const dir=join(out,mode+'-m'+capacity);
   const result=await runBeta(await context.newPage(),{runId:mode+'-m'+capacity,dir,baseURL:'http://independent.local',charter,persona,config,evaluate:async(request:ModelRequest)=>{
    requests.push(structuredClone(request));assert.doesNotMatch(JSON.stringify(request.input),/DOM_INDEPENDENT_SECRET|"history"|"oracle"|"screen"|"targets"|"regions"/);assert.doesNotMatch(JSON.stringify(request.questions),/DOM_INDEPENDENT_SECRET/);
    const choice=requests.length===1?'look_0':requests.length===2?'e1':'done';assert.ok(choice in request.questions.nextAction.criteria);
    return {model:'INDEPENDENT_LOCAL_STUB',answers:Object.fromEntries(Object.entries(request.questions).map(([id,q])=>{const selected=id==='nextAction'?choice:'goal';return [id,{choice:selected,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,Number(k===selected)]))}];}))};
   }});
   assert.equal(blocked,0);assert.equal(result.termination,'SUBJECTIVE_DONE');assert.equal(result.objectiveSuccess,true);assert.equal(result.steps.length,3);assert.equal(result.uiActions,1);assert.equal(result.looks,1);assert.equal(result.apiCalls,3);assert.equal(result.validForComparison,true);
   const [first,second]=result.steps;assert.deepEqual(first.counts,{looks:1,uiActions:0});assert.deepEqual(first.action,{type:'look',point:{x:320,y:225}});assert.deepEqual(second.vision!.fixation,{x:320,y:225});assert.equal(first.audit!.sourceSha256,second.audit!.sourceSha256);assert.deepEqual(await readFile(join(dir,first.audit!.rawScreenshot)),await readFile(join(dir,second.audit!.rawScreenshot)));
   for(const [i,step] of result.steps.entries()){
    const request=requests[i],raw=await readFile(join(dir,step.audit!.rawScreenshot)),delivered=Buffer.from(request.images.current.data,'base64');verifyPixels(raw,delivered,step);
    const expected=step.audit!.targets!.filter(t=>inside(step.vision!.clearRect,t)&&(!t.badge||inside(step.vision!.clearRect,t.badge))).map(t=>t.id).sort();
    const offered=Object.keys(request.questions.nextAction.criteria).filter(id=>/^e[1-9]\d*$/.test(id)).sort();assert.deepEqual(offered,expected);
    assert.equal(expected.length>0,true);for(const id of offered)assert.equal(request.questions.nextAction.criteria[id],`[${id}]`);
    assert.deepEqual(Object.keys(request.questions.nextAction.criteria).filter(id=>id.startsWith('look_')),['look_0','look_1','look_2','look_3']);assert.ok(!['reread','wait','abandon'].some(id=>id in request.questions.nextAction.criteria));
    assert.deepEqual((request.input.userState as any).lastObservation.visibleText,[]);assert.equal((request.input.userState as any).memory.length,capacity===0?0:i+1);
    for(const [id,asset] of Object.entries(step.assetFiles!)){assert.deepEqual(Buffer.from(request.images[id].data,'base64'),await readFile(join(dir,asset.file)));assert.equal(sha(Buffer.from(request.images[id].data,'base64')),asset.sha256);}
    for(const reference of request.input.memoryObservations as any[]){assert.equal(sha(Buffer.from(request.images[reference.image].data,'base64')),reference.imageSha256);}
   }
   assert.equal(result.steps[0].questions!.nextAction.criteria.e2!==undefined,mode==='full');assert.equal(result.steps[1].questions!.nextAction.criteria.e2!==undefined,true);assert.equal(result.steps[1].questions!.nextAction.criteria.e3!==undefined,mode==='full');
   assert.equal((await replayDirectory(dir)).verified,true);all.push({capacity,mode,result,requests,dir});
  }finally{await context.close();}
 }}finally{await browser.close();}
 for(const mode of ['full','crop','foveated']){const pair=all.filter(r=>r.mode===mode);for(let i=0;i<3;i++){assert.deepEqual(withoutMemory(pair[0].requests[i].input),withoutMemory(pair[1].requests[i].input));assert.deepEqual(pair[0].requests[i].questions,pair[1].requests[i].questions);assert.deepEqual(pair[0].requests[i].images.current,pair[1].requests[i].images.current);}}
 await writeFile(join(out,'verification.json'),JSON.stringify({externalAPIRequests:0,sourceUntouched:true,conditions:all.map(r=>({mode:r.mode,memory:r.capacity,replay:true,lookWithoutUI:true,rawAfterLookUnchanged:true,geometryVerified:true,pixelsVerified:true,dir:r.dir}))},null,2));
});

test('independent vision projection: current nested state is copied, audit text and action extras cannot escape',async()=>{
 const c=structuredClone(plans[0].plan.configs[0]);c.state.memoryCapacity=3;
 const i:any={charter:parseCharter(await json(study.charter)),persona:parsePersona(await json(study.persona))};i.charter.history={text:'AUDIT_SECRET'};
 const observation:any={id:'o2',imageSha256:'image',visibleText:['AUDIT_SECRET'],fixation:{x:640,y:450},candidateIds:['e1','look_0']};
 const vision:any={bytes:Buffer.alloc(0),mode:'full',imageSha256:'image',sourceSha256:'raw',width:1280,height:900,sourceWidth:1280,sourceHeight:900,fixation:{x:640,y:450,secret:'AUDIT_SECRET'},clearRect:{x:0,y:0,width:1280,height:900},transform:{offsetX:0,offsetY:0,scaleX:1,scaleY:1}};
 const state:any={schemaVersion:1,revision:2,fixation:{x:640,y:450},expectations:['fixed'],memory:[{observationId:'o1',imageSha256:'prior',visibleText:['AUDIT_SECRET'],action:{type:'look',point:{x:20,y:30,secret:'AUDIT_SECRET'},label:'AUDIT_SECRET'},outcome:'unchanged'}],lastObservation:observation};
 const before=JSON.stringify({i,observation,vision,state});const wire:any=modelInput(i,vision,observation,state,c,{text:['AUDIT_SECRET']} as any,[{text:'AUDIT_SECRET'}] as any);assert.doesNotMatch(JSON.stringify(wire),/AUDIT_SECRET|history|oracle/);
 wire.userState.fixation.x=0;wire.userState.lastObservation.fixation.x=0;wire.userState.lastObservation.candidateIds.push('x');wire.userState.memory[0].action.point.x=0;wire.userState.expectations.push('x');wire.observation.transform.offsetX=8;wire.exploration.persona.knowledge.push('x');wire.exploration.charter.prohibitedActions.actionTypes.push('x');assert.equal(JSON.stringify({i,observation,vision,state}),before);
});

test('independent vision diagnostics: deduplicated current PNG still delivers a prior goal-control presentation',async()=>{
 const {visionBoundaryFacts}=await import('../scripts/analyze-vision-isolation.js');
 const first:any={number:1,observationId:'o1',audit:{screen:{title:'notifications',elements:[{id:'e3',type:'button',text:'メール通知を停止する'}]},sourceSha256:'same-raw',targets:[{id:'e3',x:50,y:50,width:50,height:20}]},vision:{clearRect:{x:0,y:0,width:100,height:100}},questions:{nextAction:{criteria:{e3:'[e3]',look_0:'look'}}},assetFiles:{current:{file:'input-1.png',sha256:'same-pixels'}},modelInput:{memoryObservations:[]},selection:{selected:'look_0'},action:{type:'look',point:{x:25,y:25}},outcome:'FIXATION_MOVED',counts:{uiActions:0,looks:1}};
 const second:any={...structuredClone(first),number:2,observationId:'o2',assetFiles:{current:{file:'input-2.png',sha256:'same-pixels'}},modelInput:{memoryObservations:[{observationId:'o1',image:'current',imageSha256:'same-pixels'},{observationId:'o2',image:'current',imageSha256:'same-pixels'}]}};
 const facts=visionBoundaryFacts({steps:[first,second]} as any);
 assert.equal(facts[1].priorGoalControlPresentations.length,1);assert.equal(facts[1].priorGoalControlPresentations[0].sourceDecision,1);assert.equal(facts[1].priorGoalControlPresentations[0].image,'current');
});

test('independent vision actual: finished phase accounts every frozen slot, raw artifact, image binding and request debit',async t=>{
 const phasePath='reports/vision-isolation-2026-11-09/live-r1/phase.json';
 try{await access(phasePath);}catch{t.skip('Local actual execution unavailable');return;}
 const phase=await json(phasePath);if(phase.status==='RUNNING'){t.skip('Actual phase is still running; never follow pending batches');return;}
 const frozen=await json('reports/vision-isolation-2026-11-09/freeze.json');assert.equal(phase.mock,false);assert.equal(phase.batches.length,6);assert.equal(phase.allocation,216);assert.equal(phase.plannedTrials,18);assert.deepEqual(phase.inputHashes,frozen.inputs);assert.equal(phase.source.sourceHash,frozen.sourceHash);
 const {auditControlledTrialArtifacts}=await import('../runner/controlled-comparison.js');
 let slots=0,total=0;const initial=new Set<string>(),report:any[]=[];
 for(const [index,batch] of phase.batches.entries()){
  const descriptor=study.batches[index];for(const key of Object.keys(descriptor))assert.deepEqual(batch[key],descriptor[key]);
  const schedule=scheduleControlledComparison(plans[index].plan);slots+=schedule.length;
  if(batch.status==='PENDING'){assert.notEqual(phase.status,'COMPLETED');report.push({batchId:batch.id,missing:schedule.length});continue;}
  assert.ok(['COMPLETED','STOPPED'].includes(batch.status));const summaryPath=join(batch.outDir,'comparison.json'),summary=await json(summaryPath),ledger=await json(batch.ledger),manifest=await json(join(batch.outDir,'manifest.json'));
  assert.equal(sha(await readFile(summaryPath)),batch.summarySha256);assert.equal(summary.trials.length,3);assert.equal(summary.mock,false);assert.equal(summary.actualAPIRequests,batch.actualAPIRequests);assert.equal(ledger.used,summary.actualAPIRequests);assert.equal(ledger.attempts.length,ledger.used);assert.ok(ledger.used<=36);assert.equal(ledger.perRunMaximum,12);assert.equal(ledger.newMaximum,36);
  assert.deepEqual(manifest.sourceHashes,frozen.sourceHashes);assert.equal(manifest.sourceHash,frozen.sourceHash);assert.equal(manifest.revision,frozen.revision);
  total+=ledger.used;
  for(const attempt of ledger.attempts){assert.equal(attempt.sourceHash,frozen.sourceHash);assert.equal(attempt.revision,frozen.revision);assert.ok(['OK','ERROR'].includes(attempt.status));if(attempt.status==='OK')assert.equal(attempt.metadata.attempts,1);}
  for(const slot of schedule){
   const row=summary.trials.find((r:any)=>r.runId===slot.runId);assert.ok(row);assert.equal(row.seed,slot.seed);assert.equal(row.position,slot.position);
   const record=manifest.records.find((r:any)=>r.runId===slot.runId);if(!record){assert.equal(row.status,'missing');continue;}
   const dir=join(batch.outDir,slot.runId),raw=await readFile(join(dir,'result.json')),result=JSON.parse(raw.toString()) as BetaResult;
   assert.equal(sha(raw),row.rawSha256);assert.equal(sha(raw),record.rawSha256);assert.deepEqual(result.config,slot.config);assert.deepEqual(result.code,phase.source);
   assert.equal(result.apiCalls,ledger.attempts.filter((a:any)=>a.runKey.endsWith('/'+slot.runId)).length);assert.ok(result.apiCalls<=12);assert.ok(result.uiActions<=6);assert.ok(result.looks<=4);assert.ok(result.decisions<=10);
   for(const [file,hash] of Object.entries(row.artifactHashes))assert.equal(sha(await readFile(join(dir,file))),hash,file);
   await auditControlledTrialArtifacts(dir,{runId:slot.runId,condition:slot.condition,config:slot.config,code:phase.source},result);assert.equal((await replayDirectory(dir)).verified,true);
   initial.add(result.steps[0].audit!.sourceSha256);
   for(const [stepIndex,step] of result.steps.entries()){
    if(!step.modelInput||!step.assetFiles||!step.vision||!step.audit)continue;
    const rawBytes=await readFile(join(dir,step.audit.rawScreenshot)),pixels=await readFile(join(dir,step.assetFiles.current.file));verifyPixels(rawBytes,pixels,step);
    const criteria=step.questions!.nextAction.criteria,offered=Object.keys(criteria).filter(id=>/^e[1-9]\d*$/.test(id)).sort();
    const expected=step.audit.targets!.filter(target=>inside(step.vision!.clearRect,target)&&(!target.badge||inside(step.vision!.clearRect,target.badge))).map(target=>target.id).sort();assert.deepEqual(offered,expected);
    assert.doesNotMatch(JSON.stringify(step.modelInput),/"history"|"screen"|"oracle"|"targets"|"regions"/);
    for(const ref of (step.modelInput as any).memoryObservations??[]){assert.equal(step.assetFiles[ref.image].sha256,ref.imageSha256);assert.equal(sha(await readFile(join(dir,step.assetFiles[ref.image].file))),ref.imageSha256);}
    if(step.action?.type==='look'&&step.outcome==='FIXATION_MOVED'){
     const prior=result.steps.slice(0,stepIndex).reverse().find(p=>p.counts)?.counts?.uiActions??0;assert.equal(step.counts!.uiActions,prior);
     const next=result.steps[stepIndex+1];if(next?.vision){assert.deepEqual(next.vision.fixation,step.action.point);assert.equal(next.audit!.sourceSha256,step.audit.sourceSha256);}
    }
   }
   report.push({batchId:batch.id,runId:slot.runId,vision:result.config.vision.mode,memory:result.config.state.memoryCapacity,status:row.status,termination:result.termination,objectiveSuccess:result.objectiveSuccess,requests:result.apiCalls,replay:true,rawSha256:sha(raw)});
  }
 }
 assert.equal(slots,18);assert.ok(total<=216);assert.equal(initial.size,1);assert.equal(phase.preservationBefore,true);assert.equal(phase.preservationAfter,true);
 await mkdir(root,{recursive:true});await writeFile(join(root,'actual-verification.json'),JSON.stringify({phaseSha256:sha(await readFile(phasePath)),sourceHash:frozen.sourceHash,inputHashes:frozen.inputs,slots,actualRequests:total,initialRawHashes:[...initial],allRecordedArtifactsVerified:true,trials:report},null,2));
});
