import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PNG} from 'pngjs';
import {runBeta,sha,BetaBudgetError,BetaAdmissionError,BetaSettlementError,type ModelRequest,type BetaEvaluator} from '../runner/virtual-beta-core.js';
import {replayDirectory} from '../runner/virtual-beta-replay.js';
const config=(enabled=true):any=>({schemaVersion:1,id:'attention-runtime',vision:{mode:'crop',clearWidth:300,clearHeight:200,blurRadius:1},state:{enabled:true,memoryCapacity:2},selection:{mode:'sample',seed:7},behavior:'user',maxUIActions:6,maxLooks:4,maxDecisions:3,maxAPICalls:8,maxRunMs:90000,modeledActionMs:null,factors:{informationChannel:'image-state',extraActions:{look:true,reread:false,wait:false,abandon:false}},...(enabled?{attention:{enabled:true}}:{})});
const charter:any={schemaVersion:1,id:'attention',targetWebsite:'https://fixture.invalid/',goal:'Find the answer',initialState:{description:'Public fixture',currentDate:'2026-11-09'},scope:['fixture'],prohibitedActions:{actionTypes:[],controlTexts:[],downloads:true},maxActions:6};
const answer=(request:ModelRequest,choice:string)=>({model:'TEST',answers:Object.fromEntries(Object.entries(request.questions).map(([id,q])=>{const selected=id==='nextAction'?choice:Object.keys(q.criteria)[0];return [id,{choice:selected,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,Number(k===selected)]))}];}))});
async function fixture(evaluate:BetaEvaluator,c=config(),safety?:()=>boolean){
 const dir=await mkdtemp(join(tmpdir(),'attention-runtime-')),png=new PNG({width:1280,height:900}),bytes=PNG.sync.write(png),actions:any[]=[];
 const page:any={url:()=>charter.targetWebsite,screenshot:async()=>bytes};
 const adapter:any={canGoBack:true,observe:async()=>({title:'DOM_SECRET',text:['DOM_SECRET'],elements:[{id:'e1',type:'button',text:'FIRST_SECRET'},{id:'e2',type:'button',text:'SECOND_SECRET'}],canScrollUp:false,canScrollDown:false}),captureDecisionScreenshot:async()=>({bytes,targets:[{id:'e1',x:630,y:440,width:20,height:20},{id:'e2',x:300,y:210,width:20,height:20}]}),act:async(action:any)=>actions.push(action)};
 const result=await runBeta(page,{runId:'attention-runtime',dir,baseURL:charter.targetWebsite,charter,config:c,evaluate,isSafetyStopped:safety,publicSite:{adapter,startURL:charter.targetWebsite,evidence:()=>({spec:{schemaVersion:1,id:'fixture',startURL:charter.targetWebsite,allowedDocuments:[charter.targetWebsite],harPath:'fixture.har',harSha256:sha('fixture'),capturedAtUTC:'2026-11-09T00:00:00Z',sourceDescription:'unit fixture'},events:[],networkMode:'frozen-har-no-fallback'})}});
 return {dir,result,actions};
}
const policies=['exclusive-flat-v2','exclusive-hierarchical-v2'] as const;
const configured=(policy:typeof policies[number],extra:any={})=>({...config(),maxDecisions:1,attention:{enabled:true,policy,sampling:'domain-separated-v1'},...extra});
for(const policy of policies){
 test(policy+' continue permits only current-view actions and retains back',async()=>{
  const requests:ModelRequest[]=[];
  const f=await fixture(async request=>{requests.push(structuredClone(request));return answer(request,requests.length===1?'continue':'back');},configured(policy));
  assert.equal(requests.length,2);assert.equal(f.result.apiCalls,2);assert.equal(f.result.looks,0);assert.deepEqual(f.actions,[{type:'back'}]);
  assert.deepEqual(Object.keys(requests[1].questions.nextAction.criteria),['e1','back','done','stuck']);
  assert.deepEqual((requests[1].input.observation as any).candidateIds,['e1','back','done','stuck']);
  assert.deepEqual((requests[1].input.userState as any).lastObservation.candidateIds,['e1','back','done','stuck']);
  assert.ok((requests[0].input.observation as any).candidateIds.includes('look_0'));
  assert.match(requests[1].questions.nextAction.instructions,/current(?:-| (?:transformed )?)view|current transformed image/i);
  assert.equal(f.result.steps[0].attention?.selection?.drawIndex,0);assert.equal(f.result.steps[0].selection?.drawIndex,0);
  assert.equal((await replayDirectory(f.dir)).verified,true);
 });
 test(policy+' attention inspection executes the selected gaze in one request',async()=>{
  let calls=0;const f=await fixture(async request=>{calls++;const r=answer(request,policy==='exclusive-hierarchical-v2'?'inspect':'look_0');if(r.answers.gazeTarget){r.answers.gazeTarget.choice='look_2';r.answers.gazeTarget.probabilities=Object.fromEntries(Object.keys(request.questions.gazeTarget.criteria).map(k=>[k,Number(k==='look_2')]));}return r;},configured(policy));
  assert.equal(calls,1);assert.equal(f.result.apiCalls,1);assert.equal(f.result.looks,1);assert.equal(f.result.uiActions,0);assert.equal(f.result.steps[0].action?.type,'look');assert.equal(f.result.steps[0].attention?.actionAPICalls,0);
  if(policy==='exclusive-hierarchical-v2'){assert.equal(f.result.steps[0].attention?.selection?.selected,'inspect');assert.deepEqual(f.result.steps[0].selection,(f.result.steps[0].attention as any).gazeSelection);assert.equal(f.result.steps[0].selection?.selected,'look_2');}
  assert.equal((await replayDirectory(f.dir)).verified,true);
 });
}
for(const policy of policies){
 test(policy+' rejects a look reintroduced through ordinary action inference',async()=>{
  let calls=0;const f=await fixture(async request=>answer(request,++calls===1?'continue':'look_0'),configured(policy));
  assert.equal(f.result.termination,'INVALID_DISTRIBUTION');assert.equal(calls,2);assert.equal(f.result.looks,0);assert.deepEqual(f.actions,[]);assert.equal((await replayDirectory(f.dir)).verified,true);
 });
 test(policy+' filters exhausted look budget using the gate vocabulary',async()=>{
  let calls=0;const f=await fixture(async request=>{calls++;const r=answer(request,calls===1?'continue':'done');if(calls===1){const id=policy==='exclusive-hierarchical-v2'?'inspect':'look_0';r.answers.nextAction.choice=id;r.answers.nextAction.probabilities.continue=.25;r.answers.nextAction.probabilities[id]=.75;}return r;},configured(policy,{maxLooks:0}));
  assert.equal(calls,2);assert.equal(f.result.looks,0);assert.equal(f.result.steps[0].attention?.selection?.selected,'continue');
  assert.deepEqual(f.result.steps[0].attention?.selection?.adjustments,policy==='exclusive-hierarchical-v2'?[{candidate:'inspect',reason:'LOOK_BUDGET_EXHAUSTED'}]:[0,1,2,3].map(i=>({candidate:'look_'+i,reason:'LOOK_BUDGET_EXHAUSTED'})));
  assert.equal((f.result.steps[0].attention as any).gazeSelection,undefined);assert.equal((await replayDirectory(f.dir)).verified,true);
 });
 test(policy+' preserves budget failure admission and settlement accounting',async()=>{
  for(const stage of ['attention','action'])for(const error of [new BetaBudgetError('API_LIMIT'),new BetaAdmissionError(),new BetaSettlementError()]){
   let calls=0;const f=await fixture(async request=>{calls++;if(stage==='attention'||calls===2)throw error;return answer(request,'continue');},configured(policy));
   assert.equal(calls,stage==='attention'?1:2);assert.equal(f.result.apiCalls,(stage==='action'?1:0)+(error instanceof BetaSettlementError?1:0));assert.deepEqual(f.actions,[]);assert.equal((await replayDirectory(f.dir)).verified,true);
  }
 });
 test(policy+' continue stops at API or safety limit before an ordinary request',async()=>{
  for(const stop of ['api','safety']){let calls=0,stopped=false;const f=await fixture(async request=>{calls++;stopped=true;return answer(request,'continue');},configured(policy,stop==='api'?{maxAPICalls:1}:{}),stop==='safety'?()=>stopped:undefined);
   assert.equal(calls,1);assert.equal(f.result.termination,stop==='api'?'API_LIMIT':'SAFETY_STOP');assert.equal(f.result.steps[0].action,undefined);assert.equal((await replayDirectory(f.dir)).verified,true);
  }
 });
 test(policy+' rejects attention received after the deadline without sampling',async()=>{
  let calls=0;const f=await fixture(async request=>{calls++;await new Promise(resolve=>setTimeout(resolve,600));return answer(request,'continue');},configured(policy,{maxRunMs:500}));
  assert.equal(calls,1);assert.equal(f.result.termination,'TIME_LIMIT');assert.equal(f.result.steps[0].outcome,'ATTENTION_AFTER_DEADLINE');assert.equal(f.result.steps[0].attention?.selection,undefined);assert.equal((await replayDirectory(f.dir)).verified,true);
 });
 test(policy+' strict replay rejects downgrade, modified gate, projection, and action evidence',async()=>{
  let calls=0;const f=await fixture(async request=>answer(request,++calls===1?'continue':'back'),configured(policy));const path=join(f.dir,'result.json'),saved=await readFile(path,'utf8');
  for(const mutate of [(r:any)=>delete r.config.attention.policy,(r:any)=>{r.steps[0].attention.modelInput.observation.candidateIds.pop();},(r:any)=>{r.steps[0].modelInput.observation.candidateIds.push('look_0');r.steps[0].inputSha256=sha(JSON.stringify({input:r.steps[0].modelInput,questions:r.steps[0].questions,assets:r.steps[0].assetFiles}));},(r:any)=>{r.steps[0].selection.drawIndex++;},(r:any)=>{r.looks++;},(r:any)=>{r.steps[0].attention.gazeSelection=r.steps[0].selection;}]){
   const r=JSON.parse(saved);mutate(r);await writeFile(path,JSON.stringify(r));await assert.rejects(replayDirectory(f.dir),/ATTENTION|FACTOR/);
  }
 });
}
test('hierarchical conditional gaze is fully validated even when continue wins',async()=>{
 for(const broken of ['missing','keys','sum','basis']){let calls=0;const f=await fixture(async request=>{calls++;const r=answer(request,'continue');if(broken==='missing')delete r.answers.gazeTarget;else if(broken==='basis')r.answers.decisionBasis.probabilities={goal:1};else if(broken==='keys')r.answers.gazeTarget.probabilities={look_0:1};else r.answers.gazeTarget.probabilities.look_0=.5;return r;},configured('exclusive-hierarchical-v2'));
  assert.equal(f.result.termination,'INVALID_DISTRIBUTION');assert.equal(calls,1);assert.equal(f.result.steps[0].attention?.selection,undefined);assert.equal((await replayDirectory(f.dir)).verified,true);
 }
});
test('hierarchical gaze draw counter advances only on inspect and replay rejects forged gaze evidence',async()=>{
 let gates=0;const f=await fixture(async request=>{const gate=Object.hasOwn(request.questions.nextAction.criteria,'continue');return answer(request,gate?(++gates%2?'continue':'inspect'):'back');},configured('exclusive-hierarchical-v2',{maxDecisions:4}));
 assert.equal(f.result.apiCalls,6);assert.equal(f.result.looks,2);assert.equal(f.result.uiActions,2);assert.deepEqual(f.result.steps.map(s=>s.attention?.selection?.drawIndex),[0,1,2,3]);assert.deepEqual(f.result.steps.map(s=>s.selection?.drawIndex),[0,0,1,1]);assert.deepEqual(f.result.steps.map(s=>(s.attention as any)?.gazeSelection?.drawIndex),[undefined,0,undefined,1]);assert.equal((await replayDirectory(f.dir)).verified,true);
 const path=join(f.dir,'result.json'),saved=await readFile(path,'utf8');for(const mutate of [(r:any)=>delete r.steps[1].attention.gazeSelection,(r:any)=>{r.steps[1].attention.gazeSelection.drawIndex++;},(r:any)=>{r.steps[1].selection=r.steps[1].attention.selection;},(r:any)=>{r.steps[1].action={type:'wait'};},(r:any)=>{r.steps[1].attention.response.answers.gazeTarget.choice='look_2';},(r:any)=>{r.config.attention.policy='exclusive-flat-v2';}]){const r=JSON.parse(saved);mutate(r);await writeFile(path,JSON.stringify(r));await assert.rejects(replayDirectory(f.dir),/ATTENTION|FACTOR/);}
});
