import assert from 'node:assert/strict';
import {readFile,writeFile,access,mkdir,readdir,lstat,unlink} from 'node:fs/promises';
import {resolve,join,dirname,relative,isAbsolute} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {normalizeJevImageWire,assertJevImageBindings} from './jev-image-wire.js';
const sha=(data:Buffer|string)=>createHash('sha256').update(data).digest('hex');
const digest=(value:unknown)=>sha(JSON.stringify(value));
const json=async(path:string)=>JSON.parse(await readFile(path,'utf8'));
const script=['e1','back','done'];
const fixture={version:1,task:'help',variant:'alpha'};

/** Browser/ordinary wrapper with a completely closed synthetic gateway. No saved input is sent. */
export async function captureRecoveryLegacyTrace(out:string,workspace=process.cwd(),opaque=true){
 const cwd=process.cwd();assert.equal(resolve(workspace),cwd,'Run the capture in the actual producer checkout');
 for(const name of ['.env','.env.local','.env.development','.env.development.local'])await assert.rejects(access(name),{code:'ENOENT'});
 const previousFetch=globalThis.fetch,previousLoad=process.loadEnvFile;
 process.env.AI_GATEWAY_API_KEY='CLOSED_LEGACY_COMPATIBILITY_DUMMY';process.env.OPENAI_API_KEY='CLOSED_LEGACY_COMPATIBILITY_DUMMY';
 let calls=0,actionIndex=0,envReads=0;const requests:any[]=[];
 process.loadEnvFile=()=>{envReads++;throw Error('ENV_FILE_READ_FORBIDDEN');};
 try{
  globalThis.fetch=async(url,init)=>{
   assert.equal(String(url),'https://ai-gateway.vercel.sh/typesafe/v1/systemone','Every attempted network call must hit the local stub');
   assert.equal(init?.method,'POST');const headers=new Headers(init?.headers);
   assert.ok(headers.get('authorization')==='Bearer CLOSED_LEGACY_COMPATIBILITY_DUMMY','Fixture requires the dummy credential');assert.equal(headers.get('TypeSafe-Danger-Zone-Images'),'true');assert.equal(headers.get('TypeSafe-Danger-Zone-Long-Context'),'true');
   assert.ok(++calls<=6,'Unexpected extra API/review/extraction call');
   const native=JSON.parse(String(init?.body)),body=opaque?normalizeJevImageWire(native):native;
   assert.equal(body.model,'jev-1.14.0');assert.equal(body.state.observation.screen,undefined);assert.equal(body.state.history,undefined);
   const wire=JSON.stringify({input:body.state,questions:body.questions});assert.doesNotMatch(wire,/data-transfer-|definitionHash|referencePath|rawScreenshot|"audit"|"oracle"|"eligible"|"verificationAttempts"|"recordChecks"|"terminalSnapshot"|visualHypotheses|actionRelations/);
   assert.doesNotMatch(wire,/CLOSED_ENV_SENTINEL/);
   assert.ok(body.state.userState.memory.every((m:any)=>m.visibleText.length===0));
   const stage=body.questions.nextAction?'action':'assessment';assert.equal(stage,calls%2===1?'assessment':'action');
   requests.push({stage,inputSha256:digest(body.state),questionsSha256:digest(body.questions),questionIds:Object.keys(body.questions),candidateOrder:body.questions.nextAction?Object.keys(body.questions.nextAction.criteria):null,assets:Object.entries(body.assets).map(([logicalId,asset]:[string,any])=>({logicalId,type:asset.type,format:asset.format,sha256:sha(Buffer.from(asset.data_base64,'base64'))}))});
   const chosen=stage==='action'?script[actionIndex++]:undefined;
   return Response.json({model:'jev-1.14.0',answers:Object.fromEntries(Object.entries(body.questions).map(([id,q]:[string,any])=>{
    const choice=id==='nextAction'?chosen:id.startsWith('goalSearch_')?'uncertain':id==='decisionBasis'?'goal':id==='experienceProgress'||id==='experienceExpectation'?'unknown':id==='reasonCaptureCategory'?'unknown':id==='knowledge'?'insufficient':id==='goal'?'uncertain':id.startsWith('effect_')?'unknown':'none';
    assert.ok(typeof choice==='string','Synthetic fixture reply must be defined');
    assert.ok(Object.hasOwn(q.criteria,choice),'Synthetic fixture reply must remain offered: '+id+':'+choice);
    return [id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(key=>[key,Number(key===choice)]))}];
   }))});
  };
  const {runHumanJev}=await import(pathToFileURL(join(cwd,'runner/human-jev-experiment.ts')).href);
  const {replayDirectory}=await import(pathToFileURL(join(cwd,'runner/virtual-beta-replay.ts')).href);
  await mkdir(out,{recursive:true});const ledger=join(out,'budget.json');
  await writeFile(ledger,JSON.stringify({schemaVersion:1,status:'APPROVED',phase:'CLOSED_LEGACY_COMPATIBILITY_STUB',newMaximum:24,perRunMaximum:12,used:0,attempts:[]}),{flag:'wx'});
  const saved=await runHumanJev({out:join(out,'run'),mock:false,phaseBudget:ledger,mode:'experience-goal-search-grounded',longContext:true,transferFixture:fixture,runId:'legacy-compatibility'});
  const r=saved.result,manifest=await json(join(saved.root,'manifest.json')),budget=await json(ledger);
  assert.equal(calls,6);assert.equal(actionIndex,3);assert.equal(envReads,0);assert.equal(manifest.actualAPIRequests,6);assert.equal(manifest.mock,false);assert.equal(saved.review.reason,'PROFILE_DISABLED');
  assert.equal(r.config.actionRelations,undefined);assert.equal(r.config.visualHypotheses,undefined);assert.equal(r.config.behavior,'goal');assert.deepEqual(r.config.selection,{mode:'argmax',seed:20261028});
  assert.equal(r.decisions,3);assert.equal(r.uiActions,2);assert.equal(r.looks,0);assert.equal(r.apiCalls,6);assert.equal(r.termination,'SUBJECTIVE_DONE');assert.equal(r.perceivedDone,true);assert.equal(r.objectiveSuccess,false);assert.deepEqual(r.objectiveAssessment,{status:'OK',value:false});assert.equal(r.validForComparison,true);
  assert.deepEqual(r.steps.map((s:any)=>s.action),[{type:'click',elementId:'e1'},{type:'back'},{type:'done'}]);
  assert.equal(budget.used,6);assert.equal(budget.attempts.length,6);assert.ok(budget.attempts.every((a:any)=>a.status==='OK'&&a.metadata.attempts===1&&a.revision===manifest.revision&&a.sourceHash===manifest.sourceHash));
  for(const step of r.steps){
   assert.equal(step.actionRelations,undefined);assert.equal(step.visualHypotheses,undefined);
   for(const stage of [step.deliberation,step]){
    assert.equal(stage.response.model,'jev-1.14.0');assert.equal(stage.response.request.attempts,1);assert.equal(stage.response.request.longContext,true);
    if(opaque)assertJevImageBindings(stage,stage.response.request.imageBindings);else assert.equal(stage.response.request.imageBindings,undefined);
   }
  }
  assert.equal((await replayDirectory(join(saved.root,'exploration'))).verified,true);
  const trace={config:r.config,inputSha256:digest(r.input),initialFingerprint:r.initialFingerprint,requests,steps:r.steps.map((step:any)=>({number:step.number,observationId:step.observationId,userStateSha256:digest(step.userState),modelInputSha256:digest(step.modelInput),questionsSha256:digest(step.questions),assetFiles:step.assetFiles,assessment:{modelInputSha256:digest(step.deliberation.modelInput),questionsSha256:digest(step.deliberation.questions),assetFiles:step.deliberation.assetFiles,answersSha256:digest(step.deliberation.response.answers)},answersSha256:digest(step.response.answers),selection:step.selection,action:step.action,outcome:step.outcome,...(step.objectiveSuccess===undefined?{}:{objectiveSuccess:step.objectiveSuccess}),...(step.counts===undefined?{}:{counts:step.counts})})),outcome:{termination:r.termination,perceivedDone:r.perceivedDone,objectiveSuccess:r.objectiveSuccess,objectiveAssessment:r.objectiveAssessment,validForComparison:r.validForComparison,decisions:r.decisions,uiActions:r.uiActions,looks:r.looks,apiCalls:r.apiCalls,terminalObservation:r.terminalObservation},initialProductSha256:sha(await readFile(join(saved.root,'initial-product.png'))),finalImageSha256:sha(await readFile(join(saved.root,'exploration/final.png'))),ledger:{used:budget.used,statuses:budget.attempts.map((a:any)=>a.status),attempts:budget.attempts.map((a:any)=>a.metadata.attempts)}};
  return {trace,producer:{revision:manifest.revision,sourceHash:manifest.sourceHash},externalAPIRequests:0,syntheticHTTPCalls:calls,environmentFilesRead:envReads,opaqueTransportValidated:opaque};
 }finally{globalThis.fetch=previousFetch;process.loadEnvFile=previousLoad;delete process.env.AI_GATEWAY_API_KEY;delete process.env.OPENAI_API_KEY;}
}

/** Full trace comparison; only separately validated transport UUIDs/timings/provenance are outside the logical trace. */
export function assertRecoveryLegacyTrace(actual:unknown,expected:unknown){assert.deepEqual(actual,expected);}

const legacyRevision='b7ce1cdc2123d12136a63675f0ee437497f9154d';
const excluded=(name:string)=>name.split('/').some(part=>/^\.env(?:$|\.)|^(?:\.git|node_modules|reports)$|^(?:credentials?|secrets?)(?:$|\.)/i.test(part))||/\.(?:pem|key|p12|pfx)$/i.test(name);
function within(root:string,name:string){assert.ok(!isAbsolute(name)&&!name.split(/[\\/]/).includes('..'),'Only checkout-relative paths are permitted');const result=resolve(root,name);assert.ok(relative(root,result)&&!relative(root,result).startsWith('..'),'Path must stay inside checkout');return result;}
/** Mirrors the runtime sourceIdentity inventory without importing any producer/runtime module. */
async function runtimeIdentity(root:string){
 const sourceHashes:Record<string,string>={};
 async function visit(name:string){for(const entry of (await readdir(join(root,name),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const file=name+'/'+entry.name;if(entry.isDirectory())await visit(file);else if(/\.(tsx?|css|html)$/.test(entry.name)){assert.ok(!excluded(file));assert.ok((await lstat(within(root,file))).isFile(),'Runtime symlinks are forbidden');sourceHashes[file]=sha(await readFile(within(root,file)));}}}
 for(const name of ['app','pages','jev','runner'])await visit(name);
 for(const name of ['package.json','package-lock.json','tests/goals.ts','index.html','vite.config.ts'])sourceHashes[name]=sha(await readFile(within(root,name)));
 return {revision:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sourceHashes,sourceHash:digest(sourceHashes)};
}
async function overlayWorkspace(root:string,target:string){
 const identity=await runtimeIdentity(root),tracked=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean),files:Record<string,string>={};
 for(const name of [...new Set([...tracked,...Object.keys(identity.sourceHashes)])].sort()){
  if(excluded(name))continue;
  const from=within(root,name),to=within(target,name);let stat;
  try{stat=await lstat(from);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;try{await unlink(to);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}continue;}
  assert.ok(stat.isFile(),'Overlay allows regular files only');const bytes=await readFile(from);await mkdir(dirname(to),{recursive:true});await writeFile(to,bytes);files[name]=sha(bytes);assert.equal(sha(await readFile(to)),files[name]);
 }
 assert.deepEqual(await runtimeIdentity(target),identity,'Isolated runtime must exactly match the working tree, including uncommitted sources');
 assert.deepEqual(await runtimeIdentity(root),identity,'Workspace runtime changed while taking the snapshot');
 for(const name of ['experiments/persona/charter.json','tsconfig.json','package.json','package-lock.json'])assert.equal(sha(await readFile(within(target,name))),sha(await readFile(within(root,name))));
 return {identity,files};
}
/** Snapshot current tracked bytes and newly inventoried runtime sources, excluding credentials. */
export async function prepareRecoveryCurrentClone(root:string,target:string){
 execFileSync('git',['clone','--shared','--no-checkout','--',resolve(root),target],{cwd:root,encoding:'utf8',timeout:60000});
 execFileSync('git',['checkout','--detach','HEAD'],{cwd:target,encoding:'utf8',timeout:60000});
 return overlayWorkspace(resolve(root),target);
}
/** Old and current run in isolated local clones; no caller env file is copied/read. */
export async function compareRecoveryLegacyProducers(out:string,workspace=process.cwd()){
 const root=resolve(workspace),dir=resolve(out),old=join(dir,'old-producer'),current=join(dir,'current-producer');
 assert.ok(dir.startsWith(resolve(process.cwd())+(process.platform==='win32'?'\\':'/')),'Evidence directory must be inside the invoking checkout');
 await mkdir(dir,{recursive:true});
 for(const [target,revision]of [[old,legacyRevision]]){
  execFileSync('git',['clone','--shared','--no-checkout','--',root,target],{cwd:root,encoding:'utf8',timeout:60000});
  execFileSync('git',['checkout','--detach',revision],{cwd:target,encoding:'utf8',timeout:60000});
 }
 assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:old,encoding:'utf8'}).trim(),legacyRevision);
 const overlay=await prepareRecoveryCurrentClone(root,current);await writeFile(join(dir,'current-overlay.json'),JSON.stringify(overlay,null,2));
 const helper=fileURLToPath(import.meta.url),loader=pathToFileURL(join(process.cwd(),'node_modules/tsx/dist/loader.mjs')).href;
 const capture=(cwd:string,name:string,opaque:boolean)=>{
  const evidenceFile=join(dir,name+'-evidence.json');
  execFileSync(process.execPath,['--import',loader,helper,'--capture-recovery-legacy',join(dir,name),String(opaque),evidenceFile],{cwd,encoding:'utf8',timeout:180000,maxBuffer:2*1024*1024,env:{...process.env,AI_GATEWAY_API_KEY:'CLOSED_LEGACY_COMPATIBILITY_DUMMY',OPENAI_API_KEY:'CLOSED_LEGACY_COMPATIBILITY_DUMMY'}});
  return evidenceFile;
 };
 const expected=await json(capture(old,'old',false));assert.equal(expected.producer.revision,legacyRevision);
 const actual=await json(capture(current,'current',true));assert.equal(actual.producer.sourceHash,overlay.identity.sourceHash);
 assertRecoveryLegacyTrace(actual.trace,expected.trace);
 await writeFile(join(dir,'comparison.json'),JSON.stringify({expected:expected.producer,actual:actual.producer,match:true,overlayRuntimeSources:Object.keys(overlay.identity.sourceHashes).length,overlayFiles:Object.keys(overlay.files).length,externalAPIRequests:0,environmentFilesRead:0,syntheticHTTPCalls:expected.syntheticHTTPCalls+actual.syntheticHTTPCalls},null,2));
 return {expected,actual,overlay};
}
if(process.argv[2]==='--capture-recovery-legacy'){
 const evidence=await captureRecoveryLegacyTrace(process.argv[3],process.cwd(),process.argv[4]==='true');
 await writeFile(process.argv[5],JSON.stringify(evidence,null,2));
 console.log(JSON.stringify({gate:'CLOSED_LEGACY_TRACE_CAPTURED',producer:evidence.producer,calls:evidence.syntheticHTTPCalls,externalAPIRequests:0,environmentFilesRead:0}));
}
