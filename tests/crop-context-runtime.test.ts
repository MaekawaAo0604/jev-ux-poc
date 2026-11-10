import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PNG} from 'pngjs';
import {runBeta,sha,type ModelRequest,type BetaEvaluator} from '../runner/virtual-beta-core.js';
import {attentionInput} from '../jev/virtual-beta/attention.js';
import {replayDirectory} from '../runner/virtual-beta-replay.js';

type ContextOption='geometry-v1'|'actions-v1'|'geometry-actions-v1';
const charter:any={schemaVersion:1,id:'crop-context',targetWebsite:'https://fixture.invalid/',goal:'Find the answer and confirm it',initialState:{description:'Public fixture',currentDate:'2026-11-10'},scope:['fixture'],prohibitedActions:{actionTypes:[],controlTexts:[],downloads:true},maxActions:6};
const config=(option?:ContextOption):any=>({schemaVersion:1,id:'crop-context',vision:{mode:'crop',clearWidth:300,clearHeight:200,blurRadius:1},state:{enabled:true,memoryCapacity:2},selection:{mode:'sample',seed:7},behavior:'user',maxUIActions:6,maxLooks:4,maxDecisions:1,maxAPICalls:8,maxRunMs:90000,modeledActionMs:null,factors:{informationChannel:'image-state',extraActions:{look:true,reread:true,wait:true,abandon:true}},attention:{enabled:true,policy:'exclusive-hierarchical-v2',sampling:'domain-separated-v1',taskFrame:'attention-v1',...(option?{observationContext:option}:{})}});
const answer=(request:ModelRequest,choice:string,gaze='look_0')=>({model:'TEST',answers:Object.fromEntries(Object.entries(request.questions).map(([id,q])=>{const selected=id==='nextAction'?choice:id==='gazeTarget'?gaze:Object.keys(q.criteria)[0];return [id,{choice:selected,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,Number(k===selected)]))}];}))});
async function fixture(evaluate:BetaEvaluator,c=config()){
 const dir=await mkdtemp(join(tmpdir(),'crop-context-runtime-')),bytes=PNG.sync.write(new PNG({width:1280,height:900})),actions:any[]=[];
 let observations=0,captures=0;
 const page:any={url:()=>charter.targetWebsite,screenshot:async()=>bytes};
 const adapter:any={canGoBack:true,observe:async()=>{observations++;return {title:'DOM_SECRET',text:['DOM_SECRET'],elements:[{id:'e1',type:'button',text:'FIRST_SECRET'},{id:'e2',type:'button',text:'SECOND_SECRET'},{id:'e5',type:'button',text:'PARTIAL_GOAL_SECRET'}],canScrollUp:true,canScrollDown:true};},captureDecisionScreenshot:async()=>{captures++;return {bytes,targets:[{id:'e1',x:630,y:440,width:20,height:20,badge:{x:630,y:440,width:12,height:12}},{id:'e2',x:300,y:210,width:20,height:20},{id:'e5',x:775,y:440,width:50,height:20,badge:{x:785,y:440,width:15,height:12}}]};},act:async(action:any)=>actions.push(action)};
 const result=await runBeta(page,{runId:'crop-context',dir,baseURL:charter.targetWebsite,charter,config:c,evaluate,publicSite:{adapter,startURL:charter.targetWebsite,evidence:()=>({spec:{schemaVersion:1,id:'fixture',startURL:charter.targetWebsite,allowedDocuments:[charter.targetWebsite],harPath:'fixture.har',harSha256:sha('fixture'),capturedAtUTC:'2026-11-10T00:00:00Z',sourceDescription:'unit fixture'},events:[],networkMode:'frozen-har-no-fallback'})}});
 return {dir,result,actions,observations,captures};
}
const nonLookIds=['e1','back','scroll_down','scroll_up','done','stuck','reread','wait','abandon'];
const offeredIds=['e1','back','scroll_down','scroll_up','done','stuck','look_0','look_1','look_2','look_3','reread','wait','abandon'];
const nonLookCandidates=[{id:'e1',action:{type:'click',elementId:'e1'},label:'[e1]'},{id:'back',action:{type:'back'},label:'back'},{id:'scroll_down',action:{type:'scroll',direction:'down'},label:'scroll down'},{id:'scroll_up',action:{type:'scroll',direction:'up'},label:'scroll up'},{id:'done',action:{type:'done'},label:'done'},{id:'stuck',action:{type:'stuck'},label:'stuck'},{id:'reread',action:{type:'reread'},label:'reread'},{id:'wait',action:{type:'wait'},label:'wait'},{id:'abandon',action:{type:'abandon'},label:'abandon'}];

// Catches missing gate augmentation, using projected action candidates, or leaking audit labels.
for(const option of ['geometry-v1','actions-v1','geometry-actions-v1'] as const)test(option+' augments only attention and preserves current-view continuation',async()=>{
 const requests:ModelRequest[]=[];
 const f=await fixture(async request=>{requests.push(structuredClone(request));return answer(request,requests.length===1?'continue':'e1');},config(option));
 assert.equal(requests.length,2);
 const gate=requests[0].input,context=gate.attentionObservationContext as any;
 assert.ok(context,'opt-in context must reach the actual attention evaluator');assert.equal(context.kind,option);
 assert.equal(gate.endUserGoal,charter.goal);assert.equal(gate.decisionTask,'visual-attention-only');
 assert.doesNotMatch(JSON.stringify(requests.map(r=>r.input)),/SECRET|PARTIAL_GOAL|visibleTargets|"badge"/);
 assert.deepEqual((gate.observation as any).candidateIds,offeredIds);
 if(option!=='actions-v1'){
  assert.equal(context.geometry.mode,'crop');assert.equal(context.geometry.width,300);assert.equal(context.geometry.height,200);
  assert.deepEqual(context.geometry.viewport,{width:1280,height:900});assert.deepEqual(context.geometry.clearRect,{x:490,y:350,width:300,height:200});
  assert.deepEqual(context.geometry.transform,{offsetX:490,offsetY:350,scaleX:1,scaleY:1});assert.deepEqual(context.geometry.fixation,{x:640,y:450});
  assert.deepEqual(context.geometry.croppedImageCoversRect,{x:490,y:350,width:300,height:200});
 }else assert.equal(context.geometry,undefined);
 if(option!=='geometry-v1')assert.deepEqual(context.actions.currentNonLookCandidates,nonLookCandidates);else assert.equal(context.actions,undefined);
 assert.equal(requests[1].input.goal,charter.goal);assert.equal(requests[1].input.endUserGoal,undefined);assert.equal(requests[1].input.decisionTask,undefined);assert.equal(requests[1].input.attentionObservationContext,undefined);
 assert.deepEqual(Object.keys(requests[1].questions.nextAction.criteria),nonLookIds);assert.deepEqual((requests[1].input.observation as any).candidateIds,nonLookIds);
 assert.equal(f.result.looks,0);assert.equal(f.result.uiActions,1);assert.deepEqual(f.actions,[{type:'click',elementId:'e1'}]);assert.equal(f.observations,1);assert.equal(f.captures,1);
 assert.deepEqual(f.result.steps[0].attention!.modelInput,gate);assert.equal(f.result.steps[0].attention!.inputSha256,sha(JSON.stringify({input:gate,questions:requests[0].questions,assets:f.result.steps[0].attention!.assetFiles})));
 assert.equal((await replayDirectory(f.dir)).verified,true);
});

// Catches context accidentally triggering observation, action inference, or UI work.
test('context inspection still performs only the selected fixation movement',async()=>{
 const requests:ModelRequest[]=[];const f=await fixture(async request=>{requests.push(structuredClone(request));return answer(request,'inspect','look_2');},config('geometry-actions-v1'));
 assert.equal(requests.length,1);assert.ok(requests[0].input.attentionObservationContext);assert.equal(f.result.apiCalls,1);assert.equal(f.result.looks,1);assert.equal(f.result.uiActions,0);assert.deepEqual(f.actions,[]);
 assert.deepEqual(f.result.steps[0].action,{type:'look',point:{x:320,y:675}});assert.equal(f.result.steps[0].outcome,'FIXATION_MOVED');assert.equal(f.observations,1);assert.equal(f.captures,1);
 assert.equal(f.result.steps[0].modelInput!.attentionObservationContext,undefined);assert.equal((await replayDirectory(f.dir)).verified,true);
});

// Catches accepting attacker-rehashed context changes or downgrading an augmented run to legacy config.
test('strict replay reconstructs context and rejects drops, injections and config downgrades',async()=>{
 let calls=0;const f=await fixture(async request=>answer(request,++calls===1?'continue':'done'),config('geometry-actions-v1'));
 const path=join(f.dir,'result.json'),saved=await readFile(path,'utf8');
 for(const mutate of [(r:any)=>delete r.steps[0].attention.modelInput.attentionObservationContext,(r:any)=>{r.steps[0].attention.modelInput.attentionObservationContext.geometry.clearRect.x++;},(r:any)=>{r.steps[0].attention.modelInput.attentionObservationContext.actions.currentNonLookCandidates.push({id:'e5',action:{type:'click',elementId:'e5'},label:'[e5]'});},(r:any)=>{r.steps[0].attention.modelInput.attentionObservationContext.audit={label:'DOM_SECRET'};},(r:any)=>{r.steps[0].attention.modelInput.audit={label:'DOM_SECRET'};},(r:any)=>delete r.config.attention.observationContext,(r:any)=>{r.config.attention.observationContext='geometry-v1';}]){
  const r=JSON.parse(saved);mutate(r);const a=r.steps[0].attention;a.inputSha256=sha(JSON.stringify({input:a.modelInput,questions:a.questions,assets:a.assetFiles}));await writeFile(path,JSON.stringify(r));await assert.rejects(replayDirectory(f.dir),/ATTENTION_REQUEST_MISMATCH/);
 }
 await writeFile(path,saved);assert.equal((await replayDirectory(f.dir)).verified,true);
});

// Catches changing legacy gate bytes or retaining context between independent runs.
test('context absence remains the exact old gate projection after an augmented run',async()=>{
 let calls=0;await fixture(async request=>answer(request,++calls===1?'continue':'done'),config('geometry-actions-v1'));
 const requests:ModelRequest[]=[];const f=await fixture(async request=>{requests.push(structuredClone(request));return answer(request,requests.length===1?'continue':'done');});
 const source=structuredClone(requests[1].input) as any;source.observation.candidateIds=offeredIds;source.userState.lastObservation.candidateIds=[...source.observation.candidateIds];
 assert.deepEqual(requests[0].input,attentionInput(source,'attention-v1'));assert.equal(requests[0].input.attentionObservationContext,undefined);
 assert.equal((await replayDirectory(f.dir)).verified,true);
});
