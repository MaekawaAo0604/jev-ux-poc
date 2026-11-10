import {test} from 'node:test';
import assert from 'node:assert/strict';
import {humanJevProfile} from '../runner/human-jev-profiles.js';
import {offeredCandidates} from '../runner/virtual-beta-core.js';
import type {BetaConfig,VisionObservation} from '../jev/virtual-beta/contracts.js';
import type {Candidate} from '../jev/types.js';

const baseline:BetaConfig={schemaVersion:1,id:'human-screen-baseline',vision:{mode:'crop',clearWidth:4096,clearHeight:4096,blurRadius:12},state:{enabled:true,memoryCapacity:3},selection:{mode:'argmax',seed:20261028},behavior:'goal',maxUIActions:15,maxLooks:3,maxDecisions:12,maxAPICalls:12,maxRunMs:180000,modeledActionMs:null};

test('default and explicit baseline profiles preserve the existing configuration and request allocations',()=>{
 const expected={config:baseline,maximumRequests:13,explorationMaximum:12,reviewMaximum:1,perRunMaximum:12};
 assert.deepEqual(humanJevProfile(),expected);
 assert.deepEqual(humanJevProfile('baseline'),expected);
});

test('deliberation changes only the three declared config fields and assigns its exploration-only budget',()=>{
 const profile=humanJevProfile('deliberation');
 assert.equal(profile.config.id,'human-screen-deliberation');
 assert.deepEqual(profile.config.deliberation,{enabled:true,memoryCapacity:3,candidateEffects:true});
 assert.equal(profile.config.maxAPICalls,24);
 const {id:_id,maxAPICalls:_api,deliberation:_deliberation,...unchanged}=profile.config;
 const {id:_baselineId,maxAPICalls:_baselineAPI,...baselineUnchanged}=baseline;
 assert.deepEqual(unchanged,baselineUnchanged);
 assert.deepEqual({maximumRequests:profile.maximumRequests,explorationMaximum:profile.explorationMaximum,reviewMaximum:profile.reviewMaximum,perRunMaximum:profile.perRunMaximum},{maximumRequests:24,explorationMaximum:24,reviewMaximum:0,perRunMaximum:12});
 assert.equal(profile.config.maxDecisions,12);assert.equal(profile.config.maxUIActions,15);assert.equal(profile.config.maxLooks,3);
});

test('each profile returns independent nested config and allocation values across modes and calls',()=>{
 const first=humanJevProfile(),second=humanJevProfile('baseline'),deliberation=humanJevProfile('deliberation');
 first.config.vision.clearWidth=1;first.config.state.memoryCapacity=1;first.config.selection.seed=0;first.config.maxDecisions=1;first.maximumRequests=1;
 deliberation.config.deliberation!.candidateEffects=false;deliberation.config.deliberation!.memoryCapacity=1;deliberation.explorationMaximum=1;
 assert.deepEqual(second,{config:baseline,maximumRequests:13,explorationMaximum:12,reviewMaximum:1,perRunMaximum:12});
 assert.deepEqual(humanJevProfile('baseline'),second);
 const fresh=humanJevProfile('deliberation');assert.deepEqual(fresh.config.deliberation,{enabled:true,memoryCapacity:3,candidateEffects:true});assert.equal(fresh.explorationMaximum,24);assert.deepEqual(fresh.config.vision,baseline.vision);assert.deepEqual(fresh.config.selection,baseline.selection);
});

test('unknown runtime modes fail closed rather than silently selecting a request budget',()=>{
 for(const mode of ['unknown','BASELINE','',null,0,{},['deliberation']])assert.throws(()=>humanJevProfile(mode as never));
});

test('deliberation profile preserves the baseline offered action candidates and original input',()=>{
 const original:Record<string,Candidate>={e1:{action:{type:'click',elementId:'e1'},label:'First visible control'},e2:{action:{type:'click',elementId:'e2'},label:'Second visible control'},back:{action:{type:'back'},label:'Back'},scroll_down:{action:{type:'scroll',direction:'down'},label:'Scroll'},done:{action:{type:'done'},label:'Done'},stuck:{action:{type:'stuck'},label:'Stuck'}};
 const before=structuredClone(original);
 const observation:VisionObservation={bytes:Buffer.alloc(0),sourceSha256:'unused-source',imageSha256:'unused-image',width:1280,height:900,sourceWidth:1280,sourceHeight:900,fixation:{x:640,y:450},clearRect:{x:0,y:0,width:1280,height:900},transform:{offsetX:0,offsetY:0,scaleX:1,scaleY:1},mode:'crop',visibleTargets:[{id:'e1',x:20,y:20,width:40,height:20},{id:'e2',x:100,y:20,width:40,height:20}]};
 const baselineCandidates=offeredCandidates(original,observation,humanJevProfile().config);
 const deliberationCandidates=offeredCandidates(original,observation,humanJevProfile('deliberation').config);
 assert.deepEqual(Object.keys(deliberationCandidates),['e1','e2','back','scroll_down','done','stuck','look_0','look_1','look_2','look_3','reread','wait','abandon']);
 assert.deepEqual(deliberationCandidates,baselineCandidates);assert.deepEqual(original,before);
});
