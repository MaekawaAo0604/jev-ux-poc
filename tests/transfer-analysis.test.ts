import test from 'node:test';
import assert from 'node:assert/strict';
import {humanJevProfile} from '../runner/human-jev-profiles.js';
import {transferDefinition} from '../app/transfer-fixture.js';
import type {BetaResult,BetaStep} from '../runner/virtual-beta-core.js';
const api=await import('../runner/transfer-analysis.js').catch(()=>({} as any));
function record(task='catalog',replicate=1):any{
 const id=task+'-alpha-r'+replicate,fixture=task==='direct'?{task,variant:'alpha'}:{version:1,task,variant:'alpha'};
 const result:BetaResult={schemaVersion:1,runId:id,condition:'human-screen-goal-search-grounded',code:{revision:'frozen',sourceHash:'source'},config:humanJevProfile('experience-goal-search-grounded').config,input:{charter:{schemaVersion:1,id:'fixture',targetWebsite:'local:good',goal:'fixture goal',initialState:{description:'initial',currentDate:'2026-10-29'},scope:[],prohibitedActions:{actionTypes:[],controlTexts:[],downloads:true},maxActions:15}},initialFingerprint:'fp',objectiveSuccess:false,objectiveAssessment:{status:'OK',value:false},terminalObservation:{status:'RECORDED'},validForComparison:true,perceivedDone:false,termination:'DECISION_LIMIT',looks:0,uiActions:0,decisions:0,apiCalls:0,apiMs:0,uiMs:0,elapsedMs:0,modeledUserMs:null,steps:[]};
 return {id,kind:task==='direct'?'sentinel':'novel',fixture,replicate,initialImageSha256:'initial',requests:0,status:'RESULT',result};
}
function step(number:number,url:string,action?:BetaStep['action']):BetaStep{return {number,observationId:'o'+number,audit:{url,screen:{title:'screen',text:[],elements:[],canScrollDown:false,canScrollUp:false},rawScreenshot:'audit.png',sourceSha256:'raw'},assetFiles:{current:{file:'input.png',sha256:'image-'+number}},...(action?{action,outcome:'UI_PERFORMED'}:{})};}
test('planned attempted result and valid denominators stay separate and sentinel never enters novel',()=>{
 assert.equal(typeof api.analyzeTransferRuns,'function','offline analyzer must exist');
 const good=record(),fault=record('catalog',2),sentinel=record('direct'),setup=record('draft');
 fault.result.termination='API_ERROR';fault.result.uiActions=100;delete setup.result;setup.status='FAILED';setup.error={code:'SETUP_FAILED'};good.result.uiActions=4;sentinel.result.objectiveSuccess=true;sentinel.result.objectiveAssessment.value=true;
 const report=api.analyzeTransferRuns([good,fault,sentinel,setup]);
 assert.equal(report.novel.planned,18);assert.equal(report.novel.attempted,3);assert.equal(report.novel.withResult,2);assert.equal(report.novel.valid,1);assert.equal(report.novel.objectiveFailures,1);assert.equal(report.novel.infrastructure,2);assert.equal(report.novel.objectiveSuccesses,0);assert.equal(report.sentinel.objectiveSuccesses,1);
 assert.equal(report.completeness.planned,21);assert.equal(report.completeness.attempted,4);assert.equal(report.completeness.complete,false);assert.equal(report.cells.length,7);assert.equal(report.cells.find((c:any)=>c.key==='novel/catalog/alpha').meanUIActions,4);
});
test('paths preserve actually observed query and hash and unknown final destinations',()=>{
 const r=record();r.result.steps=[step(1,'http://127.0.0.1:123/good/?transfer=t7#home',{type:'click',elementId:'e2'}),step(2,'http://localhost:456/good/?transfer=t7#detail',{type:'back'}),step(3,'http://localhost:456/good/?transfer=t7#home',{type:'click',elementId:'e9'}),step(4,'http://localhost:456/good/?transfer=t7#detail',{type:'click',elementId:'e3'})];
 r.result.steps[0].audit.screen.elements=[{id:'e2',type:'button',text:'Open screening'}];r.result.steps[2].assetFiles.current.sha256=r.result.steps[0].assetFiles.current.sha256;r.result.steps[3].assetFiles.current.sha256=r.result.steps[1].assetFiles.current.sha256;
 const view=api.analyzeTransferRuns([r]).runs[0];
 assert.equal(view.route.edges[0].from,'/good/?transfer=t7#home');assert.equal(view.route.edges[0].to,'/good/?transfer=t7#detail');assert.equal(view.route.edges[0].label,'Open screening');assert.equal(view.route.edges[3].to,null);assert.equal(view.route.complete,false);assert.equal(view.metrics.repeatedVisualEdges,1);assert.ok(!JSON.stringify(view.route).includes('123'));
});
test('same-cell initial image mismatch remains explicit uncertainty and configs compare with no exclusions',()=>{
 const a=record(),b=record('catalog',2),c=record('catalog',3);b.initialImageSha256='different';c.result.config.id='different';
 const report=api.analyzeTransferRuns([a,b,c]),cell=report.cells.find((v:any)=>v.key==='novel/catalog/alpha');
 assert.equal(cell.initialImages.consistent,false);assert.equal(cell.configs.consistent,false);assert.equal(cell.aggregationUncertain,true);assert.ok(report.integrity.errors.some((e:any)=>e.code==='CONFIG_MISMATCH'));assert.equal(report.runs[2].validity.valid,false);
});
test('invalid distribution safety limits abandon and controller changes retain their separate counts',()=>{
 const r=record();r.result.steps=[step(1,'http://localhost/good/#a')];r.result.steps[0].selection={modelChoice:'e1',raw:{e1:.8,e2:.2},normalized:{e1:.8,e2:.2},filtered:{e1:.01,e2:.99},normalization:{rawTotal:1,filteredTotal:1},adjustments:[],mode:'argmax',seed:1,drawIndex:0,draw:null,selected:'e2'};
 const rows=[r,...(['INVALID_DISTRIBUTION','SAFETY_STOP','LOOK_LIMIT','ABANDONED'] as const).map((termination,i)=>{const v=record('help',i+1);v.result.termination=termination;return v;})];
 const report=api.analyzeTransferRuns(rows);assert.equal(report.novel.invalidDistributions,1);assert.equal(report.novel.safetyStops,1);assert.equal(report.novel.limits,2);assert.equal(report.novel.abandoned,1);assert.equal(report.runs[0].metrics.controllerChangedChoices,1);assert.equal(report.runs[0].choices[0].modelChoice,'e1');
});
test('help UI success alone never credits model exposure, retained image or failed response',()=>{
 const r=record('help');r.result.objectiveSuccess=true;r.result.objectiveAssessment.value=true;
 const def=transferDefinition(r.fixture);assert.equal(def.task,'help');if(def.task!=='help')throw Error('test fixture');
 const s=step(1,'http://localhost/good/?transfer=j4#guide');s.audit!.screen.text=[def.event,def.place,def.belongings];r.result.steps=[s];
 assert.equal(api.analyzeTransferRuns([r]).runs[0].deliveredConfirmation.credited,false);
 r.frameChecks=[{step:1,stage:'action',observationId:'o1',imageSha256:s.assetFiles!.current.sha256,validCurrentFrame:true,successfulResponse:true,scope:'full-viewport-current'}];
 assert.equal(api.analyzeTransferRuns([r]).runs[0].deliveredConfirmation.credited,true);
 r.frameChecks[0].imageSha256='retained';assert.equal(api.analyzeTransferRuns([r]).runs[0].deliveredConfirmation.credited,false);
 r.frameChecks[0].imageSha256=s.assetFiles!.current.sha256;r.frameChecks[0].successfulResponse=false;assert.equal(api.analyzeTransferRuns([r]).runs[0].deliveredConfirmation.credited,false);
});
test('duplicate attempt identities are integrity errors and never inflate valid results',()=>{
 const a=record();const report=api.analyzeTransferRuns([a,structuredClone(a)]);assert.equal(report.integrity.ok,false);assert.equal(report.novel.valid,0);assert.ok(report.integrity.errors.some((e:any)=>e.code==='DUPLICATE_RUN_ID'));
});



test('verified successful current response credits exposure even when the subsequent UI action fails',async()=>{
 const {mkdtemp,mkdir,writeFile,rm}=await import('node:fs/promises');const {join}=await import('node:path');const {tmpdir}=await import('node:os');const {PNG}=await import('pngjs');const {sha}=await import('../runner/virtual-beta-core.js');const {transformVision}=await import('../jev/virtual-beta/vision.js');
 const directory=await mkdtemp(join(tmpdir(),'transfer-frames-'));
 try{
  const r=record('help'),raw=PNG.sync.write(new PNG({width:1280,height:900})),image=transformVision(raw,r.result.config.vision,{x:640,y:450},[]),s=step(1,'http://localhost/good/?transfer=j4#guide',{type:'click',elementId:'e1'});
  const {bytes,...vision}=image;s.vision=vision;s.audit!.sourceSha256=sha(raw);s.audit!.rawScreenshot='audit.png';s.assetFiles={current:{file:'current.png',sha256:sha(bytes)}};
  s.userState={schemaVersion:1,revision:1,fixation:{x:640,y:450},memory:[],expectations:[],lastObservation:{id:'o1',imageSha256:sha(bytes),visibleText:[],fixation:{x:640,y:450},candidateIds:['e1']}};
  s.modelInput={observation:{id:'o1',image:'current'}};s.questions={nextAction:{type:'choice',instructions:'next',criteria:{e1:'open'}}};s.inputSha256=sha(JSON.stringify({input:s.modelInput,questions:s.questions,assets:s.assetFiles}));s.response={model:'jev-1.14.0',answers:{nextAction:{choice:'e1',probabilities:{e1:1}}}};
  s.outcome='ACTION_ERROR';s.error={code:'ACTION_ERROR'};r.result.steps=[s];
  await writeFile(join(directory,'audit.png'),raw);await writeFile(join(directory,'current.png'),bytes);
  let checks=await api.verifyTransferFrames(r.result,directory);assert.equal(checks.length,1);assert.equal(checks[0].validCurrentFrame,true);assert.equal(checks[0].successfulResponse,true);
  await writeFile(join(directory,'current.png'),'tampered');checks=await api.verifyTransferFrames(r.result,directory);assert.equal(checks[0].validCurrentFrame,false);assert.equal(checks[0].successfulResponse,false);
  await writeFile(join(directory,'current.png'),bytes);delete s.response;checks=await api.verifyTransferFrames(r.result,directory);assert.equal(checks[0].successfulResponse,false);
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('a wrapper failure with a saved result stays an infrastructure failure and never becomes task failure',()=>{
 const r=record();r.status='FAILED';r.error={code:'REQUEST_FAILED'};const report=api.analyzeTransferRuns([r]);assert.equal(report.novel.withResult,1);assert.equal(report.novel.infrastructure,1);assert.equal(report.novel.valid,0);assert.equal(report.novel.objectiveFailures,0);
});
test('duplicate actual run IDs cannot hide behind distinct slot IDs',()=>{
 const a=record(),b=record('draft');a.runId=b.runId='shared-actual';a.result.runId=b.result.runId='shared-actual';const report=api.analyzeTransferRuns([a,b]);assert.ok(report.integrity.errors.some((e:any)=>e.code==='DUPLICATE_ACTUAL_RUN_ID'));assert.equal(report.novel.valid,0);
});

test('a post-result identity verification error prevents a valid outcome even when API and objective succeeded',()=>{
 const r=record();r.error={code:'FIXTURE_INITIAL_IDENTITY_MISMATCH'};const report=api.analyzeTransferRuns([r]);assert.equal(report.novel.valid,0);assert.equal(report.novel.objectiveFailures,0);assert.ok(report.runs[0].validity.reasons.includes('TRIAL_ERROR'));
});
