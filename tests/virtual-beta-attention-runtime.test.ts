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
 const adapter:any={canGoBack:false,observe:async()=>({title:'DOM_SECRET',text:['DOM_SECRET'],elements:[{id:'e1',type:'button',text:'FIRST_SECRET'},{id:'e2',type:'button',text:'SECOND_SECRET'}],canScrollUp:false,canScrollDown:false}),captureDecisionScreenshot:async()=>({bytes,targets:[{id:'e1',x:630,y:440,width:20,height:20},{id:'e2',x:300,y:210,width:20,height:20}]}),act:async(action:any)=>actions.push(action)};
 const result=await runBeta(page,{runId:'attention-runtime',dir,baseURL:charter.targetWebsite,charter,config:c,evaluate,isSafetyStopped:safety,publicSite:{adapter,startURL:charter.targetWebsite,evidence:()=>({spec:{schemaVersion:1,id:'fixture',startURL:charter.targetWebsite,allowedDocuments:[charter.targetWebsite],harPath:'fixture.har',harSha256:sha('fixture'),capturedAtUTC:'2026-11-09T00:00:00Z',sourceDescription:'unit fixture'},events:[],networkMode:'frozen-har-no-fallback'})}});
 return {dir,result,actions};
}
test('attention look consumes one request, moves fixation without UI, and exposes fresh candidates',async()=>{
 const requests:ModelRequest[]=[];
 const f=await fixture(async request=>{requests.push(structuredClone(request));assert.doesNotMatch(JSON.stringify(request.input),/SECRET/);return answer(request,requests.length===1?'look_0':requests.length===2?'continue':'done');});
 assert.equal(requests.length,3);assert.equal(f.result.attentionContract,'gaze-review-v1');assert.equal(f.result.looks,1);assert.equal(f.result.uiActions,0);assert.deepEqual(f.actions,[]);
 assert.equal(f.result.steps[0].action?.type,'look');assert.equal(f.result.steps[0].response,undefined);assert.ok(f.result.steps[0].attention?.selection);assert.equal(f.result.steps[0].outcome,'FIXATION_MOVED');
 assert.deepEqual((requests[0].input.observation as any).candidateIds,['e1','done','stuck','look_0','look_1','look_2','look_3']);assert.deepEqual((requests[1].input.observation as any).candidateIds,['e2','done','stuck','look_0','look_1','look_2','look_3']);
 assert.equal(f.result.steps[1].selection?.drawIndex,0);assert.equal(f.result.steps[1].attention?.selection?.drawIndex,1);assert.equal((await replayDirectory(f.dir)).verified,true);
 const path=join(f.dir,'result.json'),saved=await readFile(path,'utf8');
 for(const mutate of [(r:any)=>delete r.config.attention,(r:any)=>delete r.attentionContract,(r:any)=>delete r.steps[0].attention,(r:any)=>{r.steps[0].action.point.x=960;},(r:any)=>{r.steps[0].attention.selection.drawIndex++;},(r:any)=>{r.steps[0].attention.modelInput.goal='forged';r.steps[0].attention.inputSha256=sha(JSON.stringify({input:r.steps[0].attention.modelInput,questions:r.steps[0].attention.questions,assets:r.steps[0].attention.assetFiles}));},(r:any)=>{r.apiCalls--; }]){const r=JSON.parse(saved);mutate(r);await writeFile(path,JSON.stringify(r));await assert.rejects(replayDirectory(f.dir),/ATTENTION|FACTOR/);}
});
test('attention continue preserves ordinary action inference and independent sampling',async()=>{
 let calls=0;const f=await fixture(async request=>answer(request,++calls===1?'continue':'e1'),{...config(),maxDecisions:1});
 assert.equal(calls,2);assert.deepEqual(f.actions,[{type:'click',elementId:'e1'}]);assert.equal(f.result.apiCalls,2);assert.equal(f.result.steps[0].attention?.selection?.selected,'continue');assert.equal(f.result.steps[0].selection?.drawIndex,0);assert.equal((await replayDirectory(f.dir)).verified,true);
});
test('invalid attention distribution stops before UI or action inference',async()=>{
 let calls=0;const f=await fixture(async request=>{calls++;const response=answer(request,'continue');response.answers.nextAction.probabilities={continue:1};return response;});assert.equal(calls,1);assert.equal(f.result.termination,'INVALID_DISTRIBUTION');assert.ok(f.result.steps[0].attention?.response);assert.equal(f.result.apiCalls,1);assert.deepEqual(f.actions,[]);assert.equal((await replayDirectory(f.dir)).verified,true);
});
test('attention continue obeys API limit before a second request',async()=>{
 let calls=0;const f=await fixture(async request=>{calls++;return answer(request,'continue');},{...config(),maxAPICalls:1});assert.equal(calls,1);assert.equal(f.result.termination,'API_LIMIT');assert.equal(f.result.steps[0].action,undefined);assert.equal((await replayDirectory(f.dir)).verified,true);
});
test('attention absence and explicit disable retain a single ordinary request and no log stage',async()=>{
 for(const c of [config(false),{...config(false),attention:{enabled:false}}]){let calls=0;const f=await fixture(async request=>{calls++;return answer(request,'done');},c);assert.equal(calls,1);assert.equal(f.result.attentionContract,undefined);assert.equal(f.result.steps[0].attention,undefined);assert.equal((await replayDirectory(f.dir)).verified,true);}
});

test('attention continue respects a safety stop before ordinary inference',async()=>{
 let stopped=false,calls=0;const f=await fixture(async request=>{calls++;stopped=true;return answer(request,'continue');},config(),()=>stopped);assert.equal(calls,1);assert.equal(f.result.termination,'SAFETY_STOP');assert.equal(f.result.steps[0].action,undefined);assert.equal((await replayDirectory(f.dir)).verified,true);
});
test('attention preserves request budget admission and settlement evidence',async()=>{
 for(const error of [new BetaBudgetError('API_LIMIT'),new BetaAdmissionError(),new BetaSettlementError()]){let calls=0;const f=await fixture(async()=>{calls++;throw error;});assert.equal(calls,1);assert.equal(f.result.apiCalls,error instanceof BetaSettlementError?1:0);assert.equal(f.result.steps[0].attention?.apiCalls,f.result.apiCalls);assert.deepEqual(f.actions,[]);assert.equal((await replayDirectory(f.dir)).verified,true);}
});
test('attention response arriving after deadline never admits a selection or second request',async()=>{
 let calls=0;const f=await fixture(async request=>{calls++;await new Promise(resolve=>setTimeout(resolve,600));return answer(request,'continue');},{...config(),maxRunMs:500});assert.equal(calls,1);assert.equal(f.result.termination,'TIME_LIMIT');assert.equal(f.result.steps[0].outcome,'ATTENTION_AFTER_DEADLINE');assert.equal(f.result.steps[0].attention?.selection,undefined);assert.equal((await replayDirectory(f.dir)).verified,true);
});

test('strict replay rejects invented attention failure evidence',async()=>{
 const f=await fixture(async request=>{const response=answer(request,'continue');response.answers.nextAction.probabilities={continue:1};return response;});const path=join(f.dir,'result.json'),r=JSON.parse(await readFile(path,'utf8'));r.steps[0].attention.error={code:'FORGED'};r.steps[0].error={code:'FORGED'};await writeFile(path,JSON.stringify(r));await assert.rejects(replayDirectory(f.dir),/ATTENTION/);
});
test('exhausted look budget filters attention mass and keeps continue available',async()=>{
 let calls=0;const f=await fixture(async request=>{calls++;const response=answer(request,calls===1?'look_0':'done');if(calls===1){response.answers.nextAction.probabilities.look_0=0.75;response.answers.nextAction.probabilities.continue=0.25;}return response;},{...config(),maxLooks:0});assert.equal(calls,2);assert.equal(f.result.looks,0);assert.equal(f.result.uiActions,0);assert.deepEqual(f.actions,[]);assert.equal(f.result.steps[0].attention?.selection?.selected,'continue');assert.deepEqual(f.result.steps[0].attention?.selection?.adjustments,[0,1,2,3].map(i=>({candidate:'look_'+i,reason:'LOOK_BUDGET_EXHAUSTED'})));assert.equal((await replayDirectory(f.dir)).verified,true);
});
