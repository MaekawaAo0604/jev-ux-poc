import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdtemp,mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {PNG} from 'pngjs';
import {attentionObservationContext} from '../jev/virtual-beta/attention-observation-context.js';
import {transformVision} from '../jev/virtual-beta/vision.js';
import {replayDirectory} from '../runner/virtual-beta-replay.js';
import {sourceIdentity} from '../runner/virtual-beta-source.js';
const sha=(v:Buffer|string)=>createHash('sha256').update(v).digest('hex');
const reportParent='reports/crop-stuck-2026-11-10/independent';
await mkdir(reportParent,{recursive:true});
const output=await mkdtemp(join(reportParent,'preflight-'));
const evidence:any={schemaVersion:1,scope:'Independent offline preflight; no model/API calls or UI operations',frozen:null,initialFrames:[],historicalReplays:[],eligibility:null};
after(async()=>{await writeFile(join(output,'independent-evidence.json'),JSON.stringify(evidence,null,2)+'\n');console.log('Independent evidence: '+output);});
const currentFreeze=process.env.CROP_CONTEXT_PREFLIGHT_FREEZE;
const historicalRoots=['reports/attention-repair-2026-11-10/live-r1','reports/attention-repair-2026-11-10/live-r2'];
async function results(path:string):Promise<string[]>{const found:string[]=[];if(!existsSync(path))return found;for(const item of await readdir(path,{withFileTypes:true})){const p=join(path,item.name);if(item.isDirectory())found.push(...await results(p));else if(item.name==='result.json')found.push(p);}return found.sort();}
const historicalFiles=(await Promise.all(historicalRoots.map(results))).flat();
const initialFiles=['crop','foveated'].flatMap(mode=>[7001,7002,7003].map(seed=>`reports/attention-repair-2026-11-10/live-r2/${mode}-seed${seed}/${mode}-framed-seed-${seed}/result.json`));

test('independent current source and six study inputs match only the new freeze',{skip:currentFreeze&&existsSync(currentFreeze)?false:'Set CROP_CONTEXT_PREFLIGHT_FREEZE to explicitly audit the current experiment freeze; historical source identity is not compared to a future tree.'},async()=>{
 const f=JSON.parse(await readFile(currentFreeze!,'utf8')),current=await sourceIdentity();
 assert.equal(current.revision,f.revision);assert.equal(current.sourceHash,f.sourceHash);assert.deepEqual(current.sourceHashes,f.sourceHashes);
 assert.equal(Object.keys(f.inputs).length,6);for(const [file,digest]of Object.entries(f.inputs))assert.equal(sha(await readFile(file)),digest);
 evidence.frozen={revision:current.revision,sourceHash:current.sourceHash,sourceFiles:Object.keys(current.sourceHashes).length,inputFiles:Object.keys(f.inputs).length};
});

test('independent strict full-control and badge containment boundaries remain unchanged',()=>{
 const png=PNG.sync.write(new PNG({width:100,height:100}));
 const targets:any[]=[
  {id:'e1',x:25,y:25,width:50,height:50,badge:{x:25,y:25,width:5,height:5}},
  {id:'e2',x:24.999,y:25,width:50,height:50,badge:{x:25,y:25,width:5,height:5}},
  {id:'e3',x:25,y:25,width:50,height:50,badge:{x:74,y:25,width:1.001,height:5}},
  {id:'e4',x:25,y:25,width:50,height:50,badge:{x:74,y:25,width:1,height:5}},
  {id:'e5',x:25,y:25,width:50,height:50}
 ];
 const v=transformVision(png,{mode:'crop',clearWidth:50,clearHeight:50,blurRadius:1},{x:50,y:50},targets);
 assert.deepEqual(v.visibleTargets.map(t=>t.id),['e1','e4','e5']);
 evidence.eligibility={clearRect:v.clearRect,eligible:v.visibleTargets.map(t=>t.id),note:'Existing missing-badge compatibility is unchanged. Badge containment is enforced when the adapter supplies a badge.'};
});

test('independent actual six initial frames add only existing geometry and exact offered non-look IDs',{skip:initialFiles.every(existsSync)?false:'Historical six framed raw result files unavailable; offline projection audit skipped.'},async()=>{
 for(const file of initialFiles){
  const r=JSON.parse(await readFile(file,'utf8')),s=r.steps[0],base=s.attention.modelInput,ids:string[]=base.observation.candidateIds;
  assert.equal(base.attentionObservationContext,undefined);
  const candidates:any={};
  for(const id of ids){const action=/^(e[1-9]\d*|0|[1-9]\d*)$/.test(id)?{type:'click',elementId:id}:id.startsWith('scroll_')?{type:'scroll',direction:id.slice(7)}:id.startsWith('look_')?{type:'look',point:{x:9999,y:9998}}:{type:id};candidates[id]={action:{...action,privateAudit:'TARGET_SECRET'},label:'DOM_TARGET_SECRET'};}
  candidates.e999={action:{type:'click',elementId:'e999'},label:'OMITTED_SECRET'};
  for(const option of ['geometry-v1','actions-v1','geometry-actions-v1']as const){
   const augmented:any=attentionObservationContext(base,candidates,r.config.vision.mode,option),{attentionObservationContext:context,...preserved}=augmented;
   assert.deepEqual(preserved,base);assert.doesNotMatch(JSON.stringify(context),/TARGET_SECRET|OMITTED_SECRET|e999|9999|9998|"visibleTargets":|"oracle":|"audit":|"targets":/);
   if(context.geometry){const g=context.geometry,o=base.observation;assert.deepEqual(g.viewport,o.viewport);assert.deepEqual(g.clearRect,o.clearRect);assert.deepEqual(g.transform,o.transform);assert.deepEqual(g.fixation,o.fixation);assert.equal(g.width,o.width);assert.equal(g.height,o.height);assert.deepEqual(g.croppedImageCoversRect,{x:o.transform.offsetX,y:o.transform.offsetY,width:o.width*o.transform.scaleX,height:o.height*o.transform.scaleY});}
   if(context.actions)assert.deepEqual(context.actions.currentNonLookCandidates.map((c:any)=>c.id),ids.filter(id=>!id.startsWith('look_')));
  }
  assert.ok(s.audit.targets.every((t:any)=>t.badge),'All actual adapter targets carry badges');
  const rect=s.vision.clearRect,contains=(t:any)=>t.x>=rect.x&&t.y>=rect.y&&t.x+t.width<=rect.x+rect.width&&t.y+t.height<=rect.y+rect.height;
  const eligible=s.audit.targets.filter((t:any)=>contains(t)&&contains(t.badge)).map((t:any)=>t.id);
  assert.deepEqual(ids.filter(id=>/^e\d+$/.test(id)),eligible);
  if(r.config.vision.mode==='crop'){assert.equal(r.termination,'STUCK');assert.equal(s.attention.selection.selected,'continue');assert.equal(s.selection.selected,'stuck');assert.ok(!ids.includes('e5'));}
  evidence.initialFrames.push({file,mode:r.config.vision.mode,termination:r.termination,publicCandidates:ids,allTargetsHaveBadges:true,eligible,gateInputSha256:s.attention.inputSha256});
 }
});

test('independent every retained repair phase run replays with unchanged failure/success outcomes',{skip:historicalFiles.length===42?false:`Historical raw artifact cohort incomplete (${historicalFiles.length}/42); no substitute data used.`},async()=>{
 for(const file of historicalFiles){const before=await readFile(file),r=JSON.parse(before.toString()),dir=file.slice(0,-'result.json'.length);assert.equal(r.config.attention?.observationContext,undefined);const replay=await replayDirectory(dir);assert.equal(replay.verified,true);assert.equal(sha(await readFile(file)),sha(before));evidence.historicalReplays.push({file,runId:r.runId,mode:r.config.vision.mode,termination:r.termination,objectiveSuccess:r.objectiveSuccess,apiCalls:r.apiCalls,verified:true,resultSha256:sha(before)});}
 assert.equal(evidence.historicalReplays.length,42);
 const framed=evidence.historicalReplays.filter((r:any)=>/live-r2.*framed/.test(r.file));assert.equal(framed.length,6);assert.equal(framed.filter((r:any)=>r.mode==='crop'&&r.termination==='STUCK').length,3);assert.equal(framed.filter((r:any)=>r.mode==='foveated'&&r.objectiveSuccess===true).length,3);
});



// Verifies the actual HTTP adapter locally; global fetch is replaced before invoking it.
test('independent adapter leaves coordinateFrames.image literal and rewrites only declared observation image paths',async()=>{
 const {evaluateBetaRequest}=await import('../runner/virtual-beta-evaluator.js');
 const {prepareJevImageRequest}=await import('../runner/jev-image-references.js');
 const image=PNG.sync.write(new PNG({width:32,height:24})),input:any={goal:'current image is ordinary text',observation:{id:'o1',image:'current',width:32,height:24,viewport:{width:100,height:100},clearRect:{x:5,y:7,width:32,height:24},transform:{offsetX:5,offsetY:7,scaleX:1,scaleY:1},fixation:{x:21,y:19},candidateIds:['done','look_0']},memoryObservations:[{observationId:'o1',image:'current'}]};
 const request:any={input:attentionObservationContext(input,{done:{action:{type:'done'},label:'SECRET'},look_0:{action:{type:'look',point:{x:30,y:30}},label:'SECRET'}},'crop','geometry-actions-v1'),images:{current:{mediaType:'image/png',data:image.toString('base64')}},questions:{nextAction:{type:'choice',instructions:'current is literal',criteria:{continue:'Continue',inspect:'Inspect'}}},timeoutMs:1000};
 const fetchBefore=globalThis.fetch,keyBefore=process.env.AI_GATEWAY_API_KEY;let calls=0;
 process.env.AI_GATEWAY_API_KEY='INDEPENDENT_FETCH_STUB_ONLY';
 globalThis.fetch=async(url,init)=>{calls++;assert.equal(String(url),'https://ai-gateway.vercel.sh/typesafe/v1/systemone');const body=JSON.parse(String(init?.body)),reference=body.state.observation.image;assert.notEqual(reference,'current');assert.equal(body.state.memoryObservations[0].image,reference);assert.equal(body.state.attentionObservationContext.geometry.coordinateFrames.image,'image-pixels');assert.deepEqual(body.state.attentionObservationContext,request.input.attentionObservationContext);assert.equal(body.state.goal,'current image is ordinary text');assert.deepEqual(Object.keys(body.assets),[reference]);assert.equal(sha(Buffer.from(body.assets[reference].data_base64,'base64')),sha(image));return Response.json({model:'jev-1.14.0',answers:{nextAction:{choice:'continue',probabilities:{continue:1,inspect:0}}}});};
 try{const response=await evaluateBetaRequest(request);assert.equal(calls,1);assert.deepEqual(response.request!.imageBindings!.assets[0].paths,[['observation','image'],['memoryObservations',0,'image']]);const invalid=structuredClone(request);invalid.input.attentionObservationContext.geometry.coordinateFrames.image='current';assert.throws(()=>prepareJevImageRequest(invalid),/INVALID_JEV_IMAGE_REFERENCES/);evidence.adapter={simulatedFetches:calls,actualNetworkRequests:0,literalImageFrame:'image-pixels',onlyCanonicalImageLeaves:true,undeclaredLogicalImageReferenceRejected:true};}
 finally{globalThis.fetch=fetchBefore;if(keyBefore===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=keyBefore;}
});
