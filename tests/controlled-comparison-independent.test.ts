import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,mkdtemp,readFile,writeFile,access,rename,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {comparisonConfigs,validateConfig} from '../jev/virtual-beta/config.js';
import type {BetaConfig} from '../jev/virtual-beta/contracts.js';
import {factorCandidates,factorModelInput} from '../jev/virtual-beta/factors.js';
import {createUserState,updateUserState} from '../jev/virtual-beta/user-state.js';
import {createSampler} from '../jev/virtual-beta/selection.js';
import {ChoiceRequestError} from '../jev/client.js';
import {parseControlledComparisonPlan,scheduleControlledComparison} from '../runner/controlled-comparison-plan.js';
import {runControlledComparison,auditControlledTrialArtifacts,classifyControlledTrial} from '../runner/controlled-comparison.js';
import {sourceIdentity} from '../runner/virtual-beta-source.js';
import {buildExplorationViewer} from '../runner/exploration-viewer-data.js';
import {serveExplorationViewer} from '../runner/exploration-viewer.js';
import {parseCharter} from '../jev/persona.js';
import {runBeta,sha,modelInput,offeredCandidates,type BetaEvaluator,type BetaResult} from '../runner/virtual-beta-core.js';
import {replayDirectory} from '../runner/virtual-beta-replay.js';

const reportRoot='reports/controlled-comparison-2026-11-09/independent';
const charter=parseCharter({schemaVersion:1,id:'independent-controlled',targetWebsite:'local:good',goal:'メール通知を停止して確認する',initialState:{description:'Independent local fixture',currentDate:'2026-11-09'},scope:['Local fixture only'],prohibitedActions:{actionTypes:[],controlTexts:[],downloads:true},maxActions:6,oracle:'notifications'});
const response=(request:Parameters<BetaEvaluator>[0],choice:string)=>({model:'INDEPENDENT_MOCK',answers:Object.fromEntries(Object.entries(request.questions).map(([id,q])=>{const selected=id==='nextAction'?choice:'goal';return [id,{choice:selected,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k===selected?1:0]))}];}))});
const config=(capacity=0):BetaConfig=>({...comparisonConfigs()[0],id:'independent-base',state:{enabled:true,memoryCapacity:capacity},behavior:'user',factors:{informationChannel:'image-state',extraActions:{look:false,reread:false,wait:false,abandon:false}}});
const plan=(configs:BetaConfig[],seeds=[19,71,193])=>({schemaVersion:1,id:'independent',configs,seeds,maxTotalAPI:48});
const json=async(file:string)=>JSON.parse(await readFile(file,'utf8'));
async function target(label:string){await mkdir(reportRoot,{recursive:true});const dir=await mkdtemp(join(reportRoot,label+'-'));return {dir,out:join(dir,'output')};}
const draw=(seed:number,index:number)=>createHash('sha256').update(`jev-virtual-beta-selection:v1:${seed}:${index}`).digest().readUInt32BE(0)/0x100000000;
const screen:any={title:'DOM_SECRET',text:['DOM_SECRET'],elements:[{id:'e1',type:'button',text:'DOM_SECRET'}],canScrollUp:false,canScrollDown:false};
const vision:any={bytes:Buffer.alloc(0),mode:'full',imageSha256:'image',sourceSha256:'raw',width:1280,height:900,sourceWidth:1280,sourceHeight:900,fixation:{x:640,y:450},clearRect:{x:0,y:0,width:1280,height:900},transform:{offsetX:0,offsetY:0,scaleX:1,scaleY:1},visibleTargets:[{id:'e1',x:100,y:100,width:100,height:40}]};
const originals:any={e1:{action:{type:'click',elementId:'e1'},label:'DOM_SECRET'},done:{action:{type:'done'},label:'Complete'},stuck:{action:{type:'stuck'},label:'Stuck'}};

test('independent: frozen actor source or declared postexecution viewer-only patch matches authority',async t=>{
 const file='reports/controlled-comparison-2026-11-09/freeze.json';try{await access(file);}catch{t.skip('Local recorded execution snapshot is unavailable in a clean checkout');return;}
 const frozen=await json(file),current=await sourceIdentity();
 assert.equal(frozen.sourceHash,'b8c1b8087a05baf5c1c9f0988d08c86caaa21e2a7896ae9a743311b8cc815ee8');assert.match(current.revision,/^[a-f0-9]{40}$/);
 if(current.sourceHash!==frozen.sourceHash){const publication=await json('reports/controlled-comparison-2026-11-09/publication-source.json');assert.equal(current.sourceHash,'c91a8213caeb35576e21b0c90c64008b04c016e08db68573bc15c38174fb6389');assert.equal(current.sourceHash,publication.sourceHash);assert.equal(publication.executedSourceHash,frozen.sourceHash);assert.deepEqual([...new Set([...Object.keys(current.sourceHashes),...Object.keys(frozen.sourceHashes)])].filter(file=>current.sourceHashes[file]!==frozen.sourceHashes[file]),['runner/exploration-viewer-data.ts']);}
 assert.equal(Object.keys(frozen.inputs).length,15);for(const [file,hash]of Object.entries(frozen.inputs))assert.equal(sha(await readFile(file)),hash,file);
});

test('independent: frozen 12-batch protocol accounts 54 trials/360 allocations and only declared single-factor contrasts',async()=>{
 const study=await json('experiments/virtual-beta/controlled-v1/study.json');assert.equal(study.batches.length,12);assert.equal(study.maxPhaseMs,2700000);assert.equal(study.parallel,1);assert.equal(study.retry,0);assert.equal(study.batchDurationMs,600000);
 let trials=0,allocated=0;const seeds=new Set<number>();
 for(const batch of study.batches){const parsed=parseControlledComparisonPlan(await json(batch.plan));trials+=scheduleControlledComparison(parsed).length;allocated+=parsed.allocatedAPIRequests;assert.equal(parsed.maxDurationMs,600000);assert.equal(parsed.seeds.length,1);assert.equal(parsed.seeds[0],batch.seed);seeds.add(batch.seed);assert.equal(parsed.allocatedAPIRequests,batch.allocatedAPIRequests);
  if(batch.group==='factors'){const base=parsed.configs.find(c=>c.id==='factor-base')!;assert.ok(base);assert.equal(base.state.memoryCapacity,0);assert.equal(base.state.enabled,true);assert.equal(base.vision.mode,'full');assert.equal(base.factors!.informationChannel,'image-state');assert.equal(base.behavior,'user');assert.equal(base.selection.mode,'argmax');
   for(const variant of parsed.configs.filter(c=>c.id!=='factor-base')){const fixed=structuredClone(variant);fixed.id=base.id;const factor=study.factorPairs[variant.id];assert.ok(factor);const keys=factor.split('.');let dest:any=fixed,src:any=base;for(const key of keys.slice(0,-1)){dest=dest[key];src=src[key];}dest[keys.at(-1)!]=structuredClone(src[keys.at(-1)!]);assert.deepEqual(fixed,base,variant.id);}
  }else{assert.equal(parsed.configs.length,4);for(const c of parsed.configs){assert.equal(c.factors,undefined);assert.equal(c.maxAPICalls,batch.apiCap);}}
 }
 assert.equal(trials,54);assert.equal(allocated,360);assert.equal(seeds.size,3);assert.equal(study.plannedTrials,trials);assert.equal(study.allocatedAPIRequests,allocated);
});

test('independent: exact 48 admission, paired distinct seeds, cyclic positions and isolated config copies',()=>{
 const configs=[1,3,12].map((cap,i)=>({...config(),id:'cap-'+i,maxAPICalls:cap})),input=plan(configs,[0,1337,0xffffffff]);
 const admitted=parseControlledComparisonPlan(input),schedule=scheduleControlledComparison(admitted);
 assert.equal(admitted.allocatedAPIRequests,48);assert.equal(schedule.length,9);assert.equal(new Set(schedule.map(r=>r.runId)).size,9);
 for(const condition of configs.map(c=>c.id)){
  const trials=schedule.filter(r=>r.condition===condition);assert.deepEqual(trials.map(r=>r.seed),input.seeds);assert.deepEqual(trials.map(r=>r.position).sort(),[1,2,3]);
 }
 assert.deepEqual(schedule.slice(0,3).map(r=>r.condition),['cap-0','cap-1','cap-2']);assert.deepEqual(schedule.slice(3,6).map(r=>r.condition),['cap-1','cap-2','cap-0']);
 schedule[0].config.state.memoryCapacity=8;assert.equal(schedule[5].config.state.memoryCapacity,0);assert.equal(admitted.configs[0].state.memoryCapacity,0);assert.equal(input.configs[0].state.memoryCapacity,0);
 for(const bad of [{maxTotalAPI:47},{maxTotalAPI:49},{seeds:[1,1]},{seeds:[NaN]},{seeds:[0x100000000]},{maxDurationMs:2700001},{configs:[{...config(),maxAPICalls:13}]},{unknown:true}])assert.throws(()=>parseControlledComparisonPlan({...input,...bad}));
});

test('independent: all 16 extra-action masks are orthogonal to memory, full image labels are neutral',()=>{
 const names=['look','reread','wait','abandon'] as const;
 for(let mask=0;mask<16;mask++)for(const capacity of [0,3]){
  const c=config(capacity);for(const [i,name]of names.entries())c.factors!.extraActions[name]=!!(mask&(1<<i));
  validateConfig(c);const candidates=factorCandidates(originals,vision,c);
  assert.equal(candidates.e1.label,'[e1]');assert.ok(!JSON.stringify(candidates).includes('DOM_SECRET'));
  for(const [i,name]of names.entries())assert.equal(Object.values(candidates).some(candidate=>candidate.action.type===name),!!(mask&(1<<i)),`${mask}/${capacity}/${name}`);
  assert.equal(Object.values(candidates).filter(candidate=>candidate.action.type==='look').length,(mask&1)?4:0);
 }
 for(const altered of [{...config(),factors:{...config().factors,extraActions:{...config().factors!.extraActions,unknown:true}}},{...config(),state:{enabled:false,memoryCapacity:0}},{...config(),factors:{...config().factors,informationChannel:'raw'}},{...config(),factors:{...config().factors,informationChannel:'dom-state'},vision:{...config().vision,mode:'crop'}}])assert.throws(()=>validateConfig(altered as BetaConfig));
});

test('independent: memory zero preserves current observation, fixed expectations and questions; DOM is current-only',()=>{
 const persona:any={expectations:['FIXED_EXPECTATION']},observation:any={id:'o2',imageSha256:'image',visibleText:['DOM_SECRET'],fixation:{x:640,y:450},candidateIds:['e1','done','stuck']};
 const outputs=[0,3].map(capacity=>{const c=config(capacity),state=updateUserState(createUserState(persona,observation.fixation),observation,c.state);return factorModelInput({charter},vision,observation,state,c,screen,[{secret:'UNBOUNDED_HISTORY'}] as any);});
 const withoutMemory=(wire:any)=>{const clone=structuredClone(wire);delete clone.userState.memory;return clone;};
 assert.deepEqual(withoutMemory(outputs[0]),withoutMemory(outputs[1]));assert.deepEqual((outputs[0].userState as any).expectations,['FIXED_EXPECTATION']);assert.deepEqual((outputs[0].userState as any).memory,[]);
 assert.ok(!JSON.stringify(outputs).includes('DOM_SECRET'));assert.ok(!JSON.stringify(outputs).includes('UNBOUNDED_HISTORY'));
 const dom=config();dom.factors!.informationChannel='dom-state';const state=updateUserState(createUserState(persona,observation.fixation),observation,dom.state),wire=factorModelInput({charter},vision,observation,state,dom,screen,[{secret:'UNBOUNDED_HISTORY'}] as any);
 assert.equal((wire.observation as any).screen.title,'DOM_SECRET');assert.deepEqual((wire.userState as any).lastObservation.visibleText,['DOM_SECRET']);assert.equal(wire.history,undefined);assert.ok(!JSON.stringify(wire).includes('UNBOUNDED_HISTORY'));
});

test('independent: legacy four configurations retain IDs, bundled behavior, wire shape and candidate vocabulary',()=>{
 const legacy=comparisonConfigs(83);assert.deepEqual(legacy.map(c=>[c.id,c.vision.mode,c.state.enabled,c.selection.mode,c.behavior,c.factors]),[['current','full',false,'argmax','goal',undefined],['vision','foveated',false,'argmax','goal',undefined],['state','full',true,'sample','user',undefined],['combined','foveated',true,'sample','user',undefined]]);
 const observation:any={id:'o1',imageSha256:'image',visibleText:['DOM_SECRET'],fixation:{x:640,y:450},candidateIds:['e1','done','stuck']},user=createUserState(undefined,observation.fixation),history:any=[{screen:'legacy-history'}];
 const current=modelInput({charter},vision,observation,user,legacy[0],screen,history);assert.deepEqual(current.history,history);assert.ok((current.observation as any).screen);assert.equal(current.userState,undefined);
 const candidates=offeredCandidates(originals,vision,legacy[0]);assert.equal(candidates.e1.label,'DOM_SECRET');assert.ok(!Object.hasOwn(candidates,'wait'));
 const stateWire=modelInput({charter},vision,observation,user,legacy[2],screen,history);assert.deepEqual(stateWire.userState,user);assert.equal(stateWire.history,undefined);assert.ok(Object.hasOwn(offeredCandidates(originals,vision,legacy[2]),'abandon'));
});

test('independent: actual pipeline privacy, memory0/3, fresh draws and hash-consistent canonical tamper rejection',async()=>{
 const browser=await chromium.launch({headless:true});const runs:{dir:string;result:BetaResult}[]=[];
 try{
  for(const capacity of [0,3,0]){
   const {dir}=await target('canonical-'+capacity),context=await browser.newContext({viewport:{width:1280,height:900}});
   try{
    await context.route('http://independent.local/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><title>DOM_SECRET</title><h1>DOM_SECRET</h1><button onclick="this.insertAdjacentHTML(\'afterend\',\'<p role=status>メール通知を停止しました</p>\')">メール通知を停止する</button>'}));
    let calls=0;const c=config(capacity);c.selection={mode:'sample',seed:193};
    const result=await runBeta(await context.newPage(),{runId:'independent-canonical-'+runs.length,dir,baseURL:'http://independent.local',charter,persona:{schemaVersion:1,id:'independent',name:'Independent',itLiteracy:'ordinary',serviceExperience:'ordinary',knowledge:['visible controls'],expectations:['FIXED_EXPECTATION'],behavioralTendencies:['inspect'],contextAndConstraints:[]},config:c,evaluate:async request=>{assert.ok(!JSON.stringify(request.input).includes('DOM_SECRET'));assert.equal(request.input.history,undefined);assert.ok(Object.values(request.questions.nextAction.criteria).every(label=>!label.includes('メール')));return response(request,calls++===0?'e1':'done');}});
    assert.equal(result.termination,'SUBJECTIVE_DONE');assert.equal(result.objectiveSuccess,true);assert.equal(result.steps.length,2);assert.equal((await replayDirectory(dir)).verified,true);
    result.steps.forEach((step,i)=>{assert.equal(step.selection!.drawIndex,i);assert.equal(step.selection!.draw,draw(193,i));});runs.push({dir,result});
   }finally{await context.close();}
  }
 }finally{await browser.close();}
 const strip=(wire:any)=>{const out=structuredClone(wire);delete out.userState.memory;delete out.memoryObservations;return out;};
 for(let i=0;i<2;i++){assert.deepEqual(strip(runs[0].result.steps[i].modelInput),strip(runs[1].result.steps[i].modelInput));assert.deepEqual(runs[0].result.steps[i].questions,runs[1].result.steps[i].questions);assert.equal(runs[0].result.steps[i].vision!.imageSha256,runs[1].result.steps[i].vision!.imageSha256);assert.deepEqual(runs[0].result.steps[i].selection,runs[2].result.steps[i].selection);}
 assert.deepEqual((runs[0].result.steps[1].modelInput!.userState as any).memory,[]);assert.equal(runs[1].result.steps[1].userState!.memory.length,2);
 const {dir}=runs[1],path=join(dir,'result.json'),saved=await readFile(path,'utf8');
 const mutations:[string,(r:any)=>void][]=[
  ['current DOM leak',r=>r.steps[0].modelInput.observation.screen={text:['FORGED']}],
  ['unbounded history',r=>r.steps[0].modelInput.history=[{text:'FORGED'}]],
  ['current text',r=>r.steps[0].modelInput.userState.lastObservation.visibleText=['FORGED']],
  ['expectation',r=>r.steps[0].modelInput.userState.expectations=['FORGED']],
  ['criteria labels',r=>r.steps[0].questions.nextAction.criteria.e1='FORGED'],
  ['criterion key',r=>r.steps[0].questions.nextAction.criteria.forged='FORGED'],
  ['question guidance',r=>r.steps[0].questions.nextAction.instructions+=' FORGED'],
  ['reason prompt',r=>r.steps[0].questions.decisionBasis.instructions+=' FORGED'],
  ['asset name',r=>r.steps[0].assetFiles.current.file='input-2.png'],
  ['memory reference',r=>r.steps[1].modelInput.memoryObservations[0].observationId='FORGED'],
  ['selection seed config',r=>r.config.selection.seed++],
  ['selection mode config',r=>r.config.selection.mode='argmax'],
  ['behavior config',r=>r.config.behavior='goal'],
  ['factor channel',r=>r.config.factors.informationChannel='dom-state'],
  ['extra action config',r=>r.config.factors.extraActions.wait=true],
  ['factor downgrade',r=>{delete r.config.factors;delete r.factorContract;}],
  ['action binding',r=>r.steps[0].action={type:'wait'}],
  ['terminal action deletion',r=>delete r.steps[1].action],
  ['terminal selection deletion',r=>{delete r.steps[1].action;delete r.steps[1].selection;}],
  ['forged invalid',r=>{delete r.steps[1].action;delete r.steps[1].selection;r.steps[1].error={code:'INVALID_DISTRIBUTION'};}],
  ['fresh counter',r=>{const s=r.steps[1],candidates=Object.fromEntries(Object.keys(s.selection.raw).map(k=>[k,{action:{type:'stuck'},label:k}])),sampler=createSampler(r.config.selection);s.selection=sampler.select(s.response.answers.nextAction.choice,s.response.answers.nextAction.probabilities,candidates as any);}],
 ];
 try{for(const [label,mutate]of mutations){const changed=JSON.parse(saved);mutate(changed);for(const step of changed.steps)if(step.modelInput)step.inputSha256=sha(JSON.stringify({input:step.modelInput,questions:step.questions,assets:step.assetFiles}));await writeFile(path,JSON.stringify(changed));await assert.rejects(replayDirectory(dir),error=>error instanceof Error,label);}}
 finally{await writeFile(path,saved);}
 assert.equal((await replayDirectory(dir)).verified,true);
 await writeFile(join(dir,'independent-tamper-cases.json'),JSON.stringify({cases:mutations.map(([name])=>name),allRejected:true,externalAPICalls:0},null,2));
});

test('independent: unequal per-trial caps, durable request checkpoints, complete ledger and viewer records',async()=>{
 const {out}=await target('isolated-budget'),configs=[1,2,3].map((cap,i)=>{const c=config();c.id='independent-cap-'+i;c.maxAPICalls=cap;c.selection={mode:'sample',seed:0};c.factors!.extraActions.wait=true;return c;});let checked=0,factories=0;
 const result=await runControlledComparison({plan:plan(configs,[71,193]),out,mock:true},()=>{factories++;return async request=>{const checkpoint=await json(join(out,'checkpoint.json')),entry=checkpoint.requests.at(-1);assert.equal(entry.status,'in-flight');assert.equal(entry.actualAPIRequests,0);assert.equal(checkpoint.trials.length,6);assert.equal(checkpoint.trials.find((t:any)=>t.runId===entry.runId).status,'attempted');checked++;return response(request,'wait');};});
 assert.equal(factories,6);assert.equal(checked,12);assert.equal(result.summary.stopReason,null);assert.equal(result.summary.actualAPIRequests,0);assert.equal(result.summary.simulatedAPIRequests,12);assert.equal(result.summary.censoredTrials,6);assert.equal(result.summary.allocatedAPIRequests,12);
 const manifest=await json(join(out,'manifest.json')),checkpoint=await json(join(out,'checkpoint.json'));assert.equal(manifest.records.length,6);assert.equal(manifest.schedule.length,6);assert.equal(manifest.status,'COMPLETED');assert.equal(manifest.totalRequests,0);assert.equal(checkpoint.trials.length,6);
 for(const row of result.summary.trials){assert.equal(row.simulatedAPIRequests,row.config.maxAPICalls);assert.equal(row.perTrialAPICap,row.config.maxAPICalls);assert.equal(row.termination,'API_LIMIT');assert.deepEqual(row.statusHistory.map(h=>h.status),['planned','attempted','censored']);assert.equal(row.replay?.status,'OK');assert.equal(row.rawSha256,sha(await readFile(join(out,row.runId,'result.json'))));for(const [file,hash]of Object.entries(row.artifactHashes))assert.equal(sha(await readFile(join(out,row.runId,file))),hash);}
 for(const run of result.results){assert.equal(run.steps[0].selection!.drawIndex,0);assert.equal(run.steps[0].selection!.draw,draw(run.config.selection.seed,0));for(let i=0;i<run.steps.length;i++)assert.equal(run.steps[i].selection!.drawIndex,i);}
 const csv=await readFile(join(out,'comparison.csv'),'utf8'),html=await readFile(join(out,'comparison.html'),'utf8');assert.equal(csv.trim().split('\n').length,7);for(const row of result.summary.trials){assert.ok(csv.includes(row.runId));assert.ok(html.includes(row.runId));}
 const row=result.summary.trials[0],run=result.results[0],path=join(out,row.runId,'result.json'),saved=await readFile(path,'utf8');const changed=JSON.parse(saved);changed.config.maxAPICalls++;await writeFile(path,JSON.stringify(changed));try{await assert.rejects(auditControlledTrialArtifacts(join(out,row.runId),{runId:row.runId,condition:row.condition,config:run.config,code:run.code!},changed),/BINDING|MISMATCH/);}finally{await writeFile(path,saved);}
});

test('independent: plan failure precedes output/fixture access and phase deadline leaves every row missing',async()=>{
 const {out}=await target('invalid-plan');await assert.rejects(runControlledComparison({plan:{...plan([config()]),maxTotalAPI:1},out,mock:true,charterFile:'DO_NOT_READ'},()=>{throw Error('MUST_NOT_EVALUATE');}),/ALLOCATION/);await assert.rejects(access(out));
 const stopped=await target('deadline'),result=await runControlledComparison({plan:{...plan([config(),{...config(),id:'another'}]),maxDurationMs:1},out:stopped.out,mock:true},()=>{throw Error('MUST_NOT_EVALUATE');});assert.equal(result.summary.stopReason,'PHASE_TIME_LIMIT');assert.equal(result.summary.plannedTrials,6);assert.equal(result.summary.missingTrials,6);assert.equal(result.summary.attemptedTrials,0);assert.equal(result.summary.actualAPIRequests,0);
});

test('independent: provider and timeout failures stop once, retain accounting and missing rows',async()=>{
 for(const code of ['HTTP_ERROR','TIMEOUT'] as const){
  const {out}=await target('infrastructure-'+code);let calls=0;const result=await runControlledComparison({plan:plan([config(),{...config(),id:'unattempted'}]),out,mock:true},()=>async()=>{calls++;throw new ChoiceRequestError({code,...(code==='HTTP_ERROR'?{statusCode:503}:{})},{attempts:1,failures:[{code}]});});
  assert.equal(calls,1);assert.equal(result.summary.invalidTrials,1);assert.equal(result.summary.missingTrials,5);assert.equal(result.summary.simulatedAPIRequests,1);assert.equal(result.summary.actualAPIRequests,0);assert.equal(result.summary.requests[0].status,'error');assert.equal(result.summary.requests[0].failureCode,code);assert.equal(result.summary.stopReason,code==='TIMEOUT'?'INFRASTRUCTURE_TIMEOUT':'API_ERROR');assert.equal((await json(join(out,'checkpoint.json'))).requests.length,1);
 }
});

test('independent: voluntary abandonment stays distinct from imposed limits; invalid streak stops at three',async()=>{
 const c=config();c.factors!.extraActions.abandon=true;const voluntary=await target('abandon'),done=await runControlledComparison({plan:plan([c],[71]),out:voluntary.out,mock:true},()=>async request=>response(request,'abandon'));assert.equal(done.summary.completedTrials,1);assert.equal(done.summary.censoredTrials,0);assert.equal(done.summary.trials[0].termination,'ABANDONED');
 const invalid=await target('invalid-streak');const result=await runControlledComparison({plan:plan(Array.from({length:4},(_,i)=>({...config(),id:'invalid-'+i})),[71]),out:invalid.out,mock:true},()=>async request=>({...response(request,'done'),answers:{nextAction:{choice:'done',probabilities:{done:1}}}}));assert.equal(result.summary.stopReason,'THREE_CONSECUTIVE_MODEL_INVALID');assert.deepEqual(result.summary.trials.map(r=>r.status),['invalid','invalid','invalid','missing']);assert.equal(result.summary.simulatedAPIRequests,3);
 const base:any={termination:'SUBJECTIVE_DONE',validForComparison:true,terminalObservation:{status:'RECORDED'},objectiveAssessment:{status:'OK',value:false},objectiveSuccess:false,steps:[]};
 for(const termination of ['API_LIMIT','TIME_LIMIT','UI_ACTION_LIMIT','LOOK_LIMIT','DECISION_LIMIT'])assert.equal(classifyControlledTrial({...base,termination}).status,'censored');assert.equal(classifyControlledTrial({...base,termination:'SAFETY_STOP'}).status,'invalid');assert.equal(classifyControlledTrial({...base,termination:'TIME_LIMIT'},{requestFailureCodes:['TIMEOUT']}).stopReason,'INFRASTRUCTURE_TIMEOUT');
});

test('independent: exhausted LOOK zero-surviving-mass is a replayable model-invalid record',async()=>{
 await mkdir(reportRoot,{recursive:true});const dir=await mkdtemp(join(reportRoot,'look-exhausted-'));
 const browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  try{
   await context.route('http://independent.local/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><title>Independent</title><button>通知設定</button>'}));
   const config={...comparisonConfigs()[0],id:'independent-look-zero',state:{enabled:true,memoryCapacity:0},maxLooks:0,factors:{informationChannel:'image-state' as const,extraActions:{look:true,reread:false,wait:false,abandon:false}}};
   let calls=0;
   const result=await runBeta(await context.newPage(),{runId:'independent-look-zero',dir,baseURL:'http://independent.local',charter,config,evaluate:async request=>{calls++;assert.ok(Object.hasOwn(request.questions.nextAction.criteria,'look_0'));return response(request,'look_0');}});
   assert.equal(calls,1);assert.equal(result.termination,'INVALID_DISTRIBUTION');assert.equal(result.steps[0].selection,undefined);assert.equal(result.steps[0].selectionFailure?.reason,'ZERO_SURVIVING_MASS');
   assert.equal((await replayDirectory(dir)).verified,true);
  }finally{await context.close();}
 }finally{await browser.close();}
});

test('independent: safety stop after inference preserves the selected evidence without executing an action',async()=>{
 const {dir}=await target('safety'),browser=await chromium.launch({headless:true});let stopped=false,calls=0;
 try{
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  try{
   await context.route('http://independent.local/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><button>Local control</button>'}));
   const result=await runBeta(await context.newPage(),{runId:'independent-safety',dir,baseURL:'http://independent.local',charter,config:config(),isSafetyStopped:()=>stopped,evaluate:async request=>{calls++;stopped=true;return response(request,'e1');}});
   assert.equal(calls,1);assert.equal(result.termination,'SAFETY_STOP');assert.equal(result.uiActions,0);assert.equal(result.validForComparison,false);assert.ok(result.steps[0].selection);assert.equal(result.steps[0].action,undefined);assert.equal(result.steps[0].outcome,'SAFETY_STOP');assert.equal((await replayDirectory(dir)).verified,true);assert.equal(classifyControlledTrial(result).status,'invalid');
  }finally{await context.close();}
 }finally{await browser.close();}
});

test('independent: checkpoint replacement failure stops dispatch and retains prior plus attempted snapshots',async()=>{
 const {out}=await target('checkpoint-failure');let calls=0,obstructed=false;
 try{
  await assert.rejects(runControlledComparison({plan:plan([config(),{...config(),id:'pending'}],[71]),out,mock:true},()=>async request=>{calls++;if(!obstructed){await rename(join(out,'checkpoint.json'),join(out,'checkpoint-retained.json'));await mkdir(join(out,'checkpoint.json'));obstructed=true;}return response(request,'done');}),/BUDGET_PERSISTENCE_ERROR/);
  assert.equal(calls,1);const retained=await json(join(out,'checkpoint-retained.json'));assert.equal(retained.trials.length,2);assert.equal(retained.requests.length,1);assert.equal(retained.requests[0].status,'in-flight');
  const snapshots=await Promise.all((await readdir(out)).filter(file=>file.startsWith('checkpoint.json.tmp-')).map(file=>json(join(out,file))));
  assert.ok(snapshots.length>0);assert.ok(snapshots.some(snapshot=>snapshot.requests[0].status==='ok'&&snapshot.requests[0].simulatedAPIRequests===1));assert.ok(snapshots.every(snapshot=>snapshot.requests.length===1));
 }finally{if(obstructed){await rename(join(out,'checkpoint.json'),join(out,'checkpoint-obstruction'));await rename(join(out,'checkpoint-retained.json'),join(out,'checkpoint.json'));}}
});

test('independent: generated viewer loads own invalid and missing trials with trace, images and raw hashes',async()=>{
 const {out}=await target('viewer-batch'),viewer=await target('viewer-artifact');
 const saved=await runControlledComparison({plan:plan([config(),{...config(),id:'viewer-missing'}],[71]),out,mock:true},()=>async()=>{throw new ChoiceRequestError({code:'HTTP_ERROR',statusCode:503},{attempts:1,failures:[{code:'HTTP_ERROR',statusCode:503}]});});
 const catalog=await buildExplorationViewer({batches:[out],out:viewer.out});assert.equal(catalog.runs.length,2);assert.equal(catalog.issues.length,0);assert.equal(catalog.batches[0].planned,2);assert.equal(catalog.batches[0].attempted,1);assert.equal(catalog.runs.filter(r=>r.status==='missing').length,1);assert.equal(catalog.runs.filter(r=>r.validity==='invalid').length,1);
 const recorded=catalog.runs.find(r=>r.detailFile)!;const detail=await json(join(viewer.out,recorded.detailFile!));assert.equal(detail.provenance.rawSha256,saved.summary.trials[0].rawSha256);assert.ok(detail.traceFile);assert.equal(sha(await readFile(join(viewer.out,detail.rawFile))),detail.provenance.rawSha256);assert.ok(detail.steps[0].images.every((image:any)=>image.file));
 const server=await serveExplorationViewer(viewer.out),browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(server.url,{waitUntil:'networkidle'});await page.getByRole('button',{name:new RegExp(recorded.runId)}).click();await page.locator('#step-title').waitFor();assert.match(await page.locator('#run-summary').innerText(),/API_ERROR/);assert.equal(await page.getByRole('link',{name:'Raw JSON'}).getAttribute('href'),detail.rawFile);await page.getByLabel('比較グループ').selectOption('');assert.equal(await page.locator('#run-list button').count(),2);assert.deepEqual(errors,[]);await page.screenshot({path:join(viewer.dir,'viewer-independent.png'),fullPage:true});
 }finally{await browser.close();await server.close();}
});

test('independent: missing cohort Persona inherits A, recorded baseline and explicit null remain baseline',async()=>{
 const {dir,out}=await target('persona-publication'),batch=join(dir,'batch'),rawDir=join(batch,'raw-baseline');await mkdir(rawDir,{recursive:true});
 await writeFile(join(rawDir,'result.json'),JSON.stringify({schemaVersion:1,runId:'raw-baseline',condition:'current',config:{id:'current'},input:{charter:{goal:'independent fixture',targetWebsite:'local:demo'}},objectiveAssessment:{status:'OK',value:false},perceivedDone:false,termination:'SUBJECTIVE_DONE',decisions:0,looks:0,uiActions:0,apiCalls:0,validForComparison:true,steps:[]}));
 await writeFile(join(batch,'manifest.json'),JSON.stringify({schemaVersion:1,status:'STOPPED',mock:true,persona:{id:'A',name:'Cohort A'},personas:{actorB:{id:'B',name:'Cohort B'}},records:[{id:'raw-baseline',runId:'raw-baseline',resultPath:join(rawDir,'result.json'),status:'RESULT'}],schedule:[{id:'raw-baseline'},{id:'missing-A'},{id:'explicit-null',persona:null},{id:'explicit-C',persona:{id:'C',name:'Explicit C'}},{id:'actor-B',actor:'actorB'}]}));
 const catalog=await buildExplorationViewer({batches:[batch],out});assert.equal(catalog.runs.length,5);assert.equal(catalog.runs.find(r=>r.runId==='missing-A')!.personaId,'A');assert.equal(catalog.runs.find(r=>r.runId==='raw-baseline')!.personaId,'baseline');assert.equal(catalog.runs.find(r=>r.runId==='explicit-null')!.personaId,'baseline');assert.equal(catalog.runs.find(r=>r.runId==='explicit-C')!.personaId,'C');assert.equal(catalog.runs.find(r=>r.runId==='actor-B')!.personaId,'B');
});
