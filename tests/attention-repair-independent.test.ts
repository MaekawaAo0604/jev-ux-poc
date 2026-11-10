import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {PNG} from 'pngjs';
import {runBeta,sha,type ModelRequest,type BetaEvaluator} from '../runner/virtual-beta-core.js';
import {replayDirectory} from '../runner/virtual-beta-replay.js';
import {sourceIdentity} from '../runner/virtual-beta-source.js';
const reportRoot='reports/attention-repair-2026-11-10/independent';
await mkdir(reportRoot,{recursive:true});
const root=await mkdtemp(join(reportRoot,'preflight-runtime-'));
const charter:any={schemaVersion:1,id:'independent-repair',targetWebsite:'https://repair.invalid/',goal:'Read the visible answer',initialState:{description:'Independent fixture',currentDate:'2026-11-10'},scope:['fixture'],prohibitedActions:{actionTypes:[],controlTexts:[],downloads:true},maxActions:6};
const config=(policy:string,mode='crop',selection='sample'):any=>({schemaVersion:1,id:'independent-repair',vision:{mode,clearWidth:300,clearHeight:200,blurRadius:8},state:{enabled:true,memoryCapacity:2},selection:{mode:selection,seed:831},behavior:'goal',maxUIActions:6,maxLooks:4,maxDecisions:3,maxAPICalls:8,maxRunMs:90000,modeledActionMs:null,factors:{informationChannel:'image-state',extraActions:{look:true,reread:false,wait:false,abandon:false}},attention:{enabled:true,policy,sampling:'domain-separated-v1'}});
function response(r:ModelRequest,selected:string,proposed=selected,gaze?:Record<string,number>){
 return {model:'INDEPENDENT_REPAIR_FIXTURE',answers:Object.fromEntries(Object.entries(r.questions).map(([id,q])=>{
  const mass=id==='nextAction'?selected:Object.keys(q.criteria)[0];
  return [id,{choice:id==='nextAction'?proposed:Object.keys(q.criteria)[0],probabilities:id==='gazeTarget'&&gaze?gaze:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,Number(k===mass)]))}];
 }))};
}
async function run(id:string,evaluate:BetaEvaluator,c:any){
 const dir=join(root,id),png=new PNG({width:1280,height:900}),actions:any[]=[];
 for(let y=0;y<900;y++)for(let x=0;x<1280;x++){const p=4*(y*1280+x);png.data[p]=x%251;png.data[p+1]=y%251;png.data[p+2]=(x+y)%251;png.data[p+3]=255;}
 const bytes=PNG.sync.write(png);let captures=0;
 const adapter:any={canGoBack:true,observe:async()=>({title:'HIDDEN_DOM_SENTINEL',text:['HIDDEN_DOM_SENTINEL'],elements:[{id:'e1',type:'button',text:'HIDDEN_DOM_SENTINEL'}],canScrollUp:false,canScrollDown:false}),captureDecisionScreenshot:async()=>{captures++;return {bytes,targets:[{id:'e1',x:630,y:440,width:20,height:20}]};},act:async(a:any)=>actions.push(a)};
 const result=await runBeta({url:()=>charter.targetWebsite,screenshot:async()=>bytes}as any,{runId:id,dir,baseURL:charter.targetWebsite,charter,config:c,evaluate,publicSite:{adapter,startURL:charter.targetWebsite,evidence:()=>({spec:{schemaVersion:1,id:'independent-repair',startURL:charter.targetWebsite,allowedDocuments:[charter.targetWebsite],harPath:'fixture.har',harSha256:sha('fixture'),capturedAtUTC:'2026-11-10T00:00:00Z',sourceDescription:'independent unit fixture'},events:[],networkMode:'frozen-har-no-fallback'})}});
 return {dir,result,actions,captures};
}
const drawAt=(seed:number,index:number)=>createHash('sha256').update('jev-virtual-beta-selection:v1:'+seed+':'+index).digest().readUInt32BE(0)/2**32;
const streamSeed=(stage:'gate'|'gaze',root=831)=>createHash('sha256').update('jev-virtual-beta-attention-stream:v2:'+stage+':'+root).digest().readUInt32BE(0);
const cdf=(raw:Record<string,number>,draw:number)=>{let sum=0;for(const id of Object.keys(raw).sort()){sum+=raw[id];if(draw<sum)return id;}throw Error('bad independent CDF');};
test('independent repair target source and every input match the predeclared freeze',{skip:existsSync('reports/attention-repair-2026-11-10/freeze-v2.json')?false:'Retained freeze report unavailable; source audit requires experiment artifacts.'},async()=>{
 const freeze=JSON.parse(await readFile('reports/attention-repair-2026-11-10/freeze-v2.json','utf8')),s=await sourceIdentity();
 assert.equal(s.sourceHash,freeze.sourceHash);assert.deepEqual(s.sourceHashes,freeze.sourceHashes);
 assert.equal(Object.keys(freeze.inputs).length,9);for(const [file,hash]of Object.entries(freeze.inputs))assert.equal(sha(await readFile(file)),hash);
});
for(const policy of ['exclusive-flat-v2','exclusive-hierarchical-v2'])for(const mode of ['crop','foveated']){
 test('independent '+policy+' '+mode+' selects distributions, binds fresh images and isolates samplers',async()=>{
  const runs=[];
  for(const person of ['person-a','person-b']){
   const req:ModelRequest[]=[];let gates=0;
   const f=await run(policy+'-'+mode+'-'+person,async r=>{
    req.push(structuredClone(r));assert.doesNotMatch(JSON.stringify(r.input),/HIDDEN_DOM_SENTINEL|oracle|targets|history|correctRegion/);
    assert.ok(Object.keys(r.images).length<=2);const u:any=r.input.userState;assert.ok(u.memory.length<=2);assert.ok((r.input.memoryObservations as any[]).length<=2);
    for(const asset of Object.values(r.images)){const png=PNG.sync.read(Buffer.from(asset.data,'base64'));assert.equal(png.width,mode==='crop'?300:1280);assert.equal(png.height,mode==='crop'?200:900);}
    if(Object.hasOwn(r.questions.nextAction.criteria,'continue')){
     gates++;const inspect=gates<=2;
     if(policy==='exclusive-hierarchical-v2')return response(r,inspect?'inspect':'continue',inspect?'continue':'inspect',{look_0:.2,look_1:.3,look_2:.1,look_3:.4});
     return response(r,inspect?(gates===1?'look_2':'look_0'):'continue',inspect?'continue':'look_3');
    }
    assert.ok(!Object.keys(r.questions.nextAction.criteria).some(k=>k.startsWith('look_')));
    return response(r,'back','done');
   },config(policy,mode));
   assert.equal(req.length,4);assert.equal(f.result.apiCalls,4);assert.equal(f.result.looks,2);assert.equal(f.result.uiActions,1);assert.deepEqual(f.actions,[{type:'back'}]);assert.equal(f.captures,3);
   assert.deepEqual(f.result.steps.map(s=>s.attention!.selection!.drawIndex),[0,1,2]);
   assert.equal(f.result.steps[2].selection!.drawIndex,0);assert.equal(f.result.steps[2].selection!.seed,831);assert.equal(f.result.steps[2].selection!.draw,drawAt(831,0));
   assert.deepEqual((req[0].input.userState as any).memory.map((m:any)=>m.observationId),['o1']);
   assert.deepEqual((req[3].input.userState as any).memory.map((m:any)=>m.observationId),['o2','o3']);
   for(const [i,s]of f.result.steps.entries()){
    assert.notEqual(s.attention!.selection!.modelChoice,s.attention!.selection!.selected);assert.equal(s.attention!.selection!.seed,streamSeed('gate'));assert.equal(s.attention!.selection!.draw,drawAt(streamSeed('gate'),i));
    if(i<2){
     assert.equal(s.attention!.actionAPICalls,0);assert.equal(s.action!.type,'look');assert.equal(s.counts!.uiActions,0);
     const id=policy==='exclusive-hierarchical-v2'?cdf({look_0:.2,look_1:.3,look_2:.1,look_3:.4},drawAt(streamSeed('gaze'),i)):i===0?'look_2':'look_0';
     assert.equal(s.selection!.selected,id);const xy=[[320,225],[960,225],[320,675],[960,675]][Number(id.slice(-1))];
     assert.deepEqual(s.action,{type:'look',point:{x:xy[0],y:xy[1]}});
     assert.deepEqual(f.result.steps[i+1].vision!.fixation,{x:xy[0],y:xy[1]});
     if(s.vision!.fixation.x===xy[0]&&s.vision!.fixation.y===xy[1])assert.equal(s.vision!.imageSha256,f.result.steps[i+1].vision!.imageSha256);else assert.notEqual(s.vision!.imageSha256,f.result.steps[i+1].vision!.imageSha256); // Same-point revisits remain valid fresh captures.
     if(policy==='exclusive-hierarchical-v2'){assert.equal(s.attention!.gazeSelection!.drawIndex,i);assert.equal(s.attention!.gazeSelection!.draw,drawAt(streamSeed('gaze'),i));assert.equal(s.attention!.gazeSelection!.seed,streamSeed('gaze'));}
    }else assert.equal(s.attention!.gazeSelection,undefined);
   }
   assert.equal((await replayDirectory(f.dir)).verified,true);runs.push(f);
  }
  assert.deepEqual(runs[0].result.steps.map(s=>s.userState),runs[1].result.steps.map(s=>s.userState));
  assert.deepEqual(runs[0].result.steps.map(s=>[s.attention!.selection,s.attention!.gazeSelection,s.selection]),runs[1].result.steps.map(s=>[s.attention!.selection,s.attention!.gazeSelection,s.selection]));
 });
}
test('independent exhausted inspection mass fails closed with no UI or fallback',async()=>{
 for(const policy of ['exclusive-flat-v2','exclusive-hierarchical-v2']){
  let calls=0;const c=config(policy);c.maxLooks=0;
  const f=await run('zero-mass-'+policy,async r=>{calls++;return response(r,policy==='exclusive-hierarchical-v2'?'inspect':'look_2');},c);
  assert.equal(calls,1);assert.equal(f.result.termination,'INVALID_DISTRIBUTION');assert.equal(f.result.looks,0);assert.deepEqual(f.actions,[]);
  assert.equal(f.result.steps[0].attention!.selectionFailure!.reason,'ZERO_SURVIVING_MASS');
  assert.equal((await replayDirectory(f.dir)).verified,true);
 }
});
test('independent unused conditional gaze rejects invalid choice and nonfinite values before gate sampling',async()=>{
 for(const broken of ['choice','nan','negative','extra']){
  let calls=0;const f=await run('unused-'+broken,async r=>{calls++;const a:any=response(r,'continue');if(broken==='choice')a.answers.gazeTarget.choice='not-offered';if(broken==='nan')a.answers.gazeTarget.probabilities.look_0=NaN;if(broken==='negative')a.answers.gazeTarget.probabilities.look_0=-1;if(broken==='extra')a.answers.gazeTarget.probabilities.hidden=0;return a;},config('exclusive-hierarchical-v2'));
  assert.equal(calls,1);assert.equal(f.result.termination,'INVALID_DISTRIBUTION');assert.equal(f.result.steps[0].attention!.selection,undefined);assert.equal(f.result.looks,0);assert.deepEqual(f.actions,[]);assert.equal((await replayDirectory(f.dir)).verified,true);
 }
});
const priorPhase='reports/attention-reselection-2026-11-09/live-r1/phase.json';
const priorRawAvailable=await (async()=>{try{const p=JSON.parse(await readFile(priorPhase,'utf8'));for(const b of p.batches){const s=JSON.parse(await readFile(join(b.outDir,'comparison.json'),'utf8'));for(const t of s.trials)if(!existsSync(join(t.dir??t.directory??join(b.outDir,t.runId),'result.json')))return false;}return true;}catch{return false;}})();
test('independent repaired replay preserves all 12 retained OFF and legacy real runs',{skip:priorRawAvailable?false:'Retained historical raw phase/results are unavailable in this checkout; runtime tests remain enabled.'},async()=>{
 const phase=JSON.parse(await readFile(priorPhase,'utf8'));let runs=0,calls=0,legacy=0;
 for(const b of phase.batches){const summary=JSON.parse(await readFile(join(b.outDir,'comparison.json'),'utf8'));for(const trial of summary.trials){const dir=trial.dir??trial.directory??join(b.outDir,trial.runId);const r=JSON.parse(await readFile(join(dir,'result.json'),'utf8'));assert.equal(r.config.attention?.policy,undefined);assert.equal((await replayDirectory(dir)).verified,true);runs++;calls+=r.apiCalls;if(r.config.attention?.enabled)legacy++;}}
 assert.equal(runs,12);assert.equal(legacy,6);assert.equal(calls,114);
});



test('independent framed gate changes only its task objective and keeps ordinary requests identical',async()=>{
 const runs=[],requests:ModelRequest[][]=[];
 for(const framed of [false,true]){
  const c=config('exclusive-hierarchical-v2');c.maxDecisions=1;if(framed)c.attention.taskFrame='attention-v1';
  const req:ModelRequest[]=[];requests.push(req);
  const f=await run('task-frame-'+framed,async r=>{req.push(structuredClone(r));return response(r,req.length===1?'continue':'back');},c);
  assert.equal(req.length,2);assert.equal(f.result.apiCalls,2);assert.deepEqual(f.actions,[{type:'back'}]);assert.equal(f.result.looks,0);assert.equal((await replayDirectory(f.dir)).verified,true);runs.push(f);
 }
 const plain=requests[0][0],framed=requests[1][0];
 assert.deepEqual(plain.images,framed.images);assert.deepEqual(plain.questions,framed.questions);
 const {goal,endUserGoal,decisionTask,...evidence}=framed.input,{goal:oldGoal,...oldEvidence}=plain.input;
 assert.deepEqual(evidence,oldEvidence);assert.equal(endUserGoal,charter.goal);assert.equal((framed.input.exploration as any).charter.goal,charter.goal);assert.equal(decisionTask,'visual-attention-only');assert.ok((goal as string).includes(charter.goal));
 assert.doesNotMatch(JSON.stringify(framed.input),/HIDDEN_DOM_SENTINEL|oracle|targets|history|correctRegion/);
 assert.deepEqual(requests[0][1].input,requests[1][1].input);assert.deepEqual(requests[0][1].questions,requests[1][1].questions);assert.deepEqual(requests[0][1].images,requests[1][1].images);
 assert.equal(requests[1][1].input.endUserGoal,undefined);assert.equal(requests[1][1].input.decisionTask,undefined);assert.equal(requests[1][1].input.goal,charter.goal);
 const path=join(runs[1].dir,'result.json'),saved=await readFile(path,'utf8');
 for(const mutate of [(r:any)=>delete r.config.attention.taskFrame,(r:any)=>delete r.steps[0].attention.modelInput.endUserGoal,(r:any)=>{r.steps[0].attention.modelInput.endUserGoal='changed';},(r:any)=>{r.steps[0].attention.modelInput.goal=charter.goal;},(r:any)=>{r.steps[0].attention.modelInput.decisionTask='operate-ui';}]){
  const r=JSON.parse(saved);mutate(r);const a=r.steps[0].attention;a.inputSha256=sha(JSON.stringify({input:a.modelInput,questions:a.questions,assets:a.assetFiles}));await writeFile(path,JSON.stringify(r));await assert.rejects(replayDirectory(runs[1].dir),/ATTENTION|FACTOR/);
 }
 await writeFile(path,saved);
});
const phaseOne='reports/attention-repair-2026-11-10/live-r1/phase.json';
const phaseOneAvailable=await (async()=>{try{const p=JSON.parse(await readFile(phaseOne,'utf8'));if(p.status!=='COMPLETED')return false;for(const b of p.batches){const s=JSON.parse(await readFile(join(b.outDir,'comparison.json'),'utf8'));for(const t of s.trials)if(!existsSync(join(b.outDir,t.runId,'result.json')))return false;}return true;}catch{return false;}})();
test('independent second repair preserves every phase-one untagged argmax raw replay',{skip:phaseOneAvailable?false:'Retained completed phase-one raw cohort unavailable; runtime tests remain enabled.'},async()=>{
 const p=JSON.parse(await readFile(phaseOne,'utf8'));let count=0,calls=0;
 for(const b of p.batches){const summary=JSON.parse(await readFile(join(b.outDir,'comparison.json'),'utf8'));for(const row of summary.trials){const dir=join(b.outDir,row.runId),r=JSON.parse(await readFile(join(dir,'result.json'),'utf8'));assert.equal(r.config.selection.mode,'argmax');assert.equal(r.config.attention?.sampling,undefined);assert.equal((await replayDirectory(dir)).verified,true);count++;calls+=r.apiCalls;}}
 assert.equal(count,24);assert.equal(calls,138);
});
