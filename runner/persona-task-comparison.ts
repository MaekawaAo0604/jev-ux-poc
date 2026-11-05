import{personaBetaActors,type PersonaBetaActor}from'./persona-beta-contracts.js';
import{personaTasks}from'../app/persona-task-types.js';
import{personaTaskDefinition}from'../app/persona-task-fixture.js';
import type{PersonaTaskRecord}from'./persona-task-contracts.js';
import{personaInputBindings,personaBetaStopReason}from'./persona-beta-comparison.js';
import{analyzePersonaTaskRuns}from'./persona-task-analysis.js';
import{readFile,writeFile,mkdir}from'node:fs/promises';import{resolve,join,isAbsolute}from'node:path';import{pathToFileURL}from'node:url';import{createHash,randomUUID}from'node:crypto';import{isDeepStrictEqual as eq}from'node:util';
import{parsePersona,type Persona}from'../jev/persona.js';import{runHumanJev}from'./human-jev-experiment.js';import{humanJevProfile}from'./human-jev-profiles.js';import{sourceIdentity}from'./virtual-beta-source.js';import{validateAlignmentOptions,alignmentLedgerMismatch}from'./inquiry-alignment-comparison.js';import{readTransferLedger}from'./transfer-evaluation.js';import{verifyTransferFrames}from'./transfer-analysis.js';import{replayDirectory}from'./virtual-beta-replay.js';import{safeRequestFailure}from'../jev/client.js';
const sha=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex'),protocolFile='experiments/virtual-beta/persona-task-comparison.json';
type Options={out:string;mock:boolean;priorSnapshot:string;envFile?:string};
type RecordRow=PersonaTaskRecord;
export function personaTaskSchedule(){
 return Array.from({length:3},(_,rep)=>personaTasks.flatMap((task,taskIndex)=>Array.from({length:4},(_,i)=>{const actor=personaBetaActors[(rep+taskIndex+i)%4];return{id:'persona-task-'+task+'-'+actor+'-r'+(rep+1),actor,replicate:rep+1,sequence:rep*12+taskIndex*4+i+1,fixture:{version:1 as const,task}};}))).flat();
}
/** Annotate only comparison rows; never rewrite recorded model input or image evidence. */
export function personaTaskInitialInputs(records:RecordRow[]){
 const first=records.filter(r=>r.result?.steps[0]?.visualHypotheses).map(r=>{const v=r.result!.steps[0].visualHypotheses!,{persona,...input}=v.request;return{sequence:r.sequence,actor:r.actor,task:r.fixture.task,image:r.result!.steps[0].assetFiles?.current?.sha256??null,product:r.initialImageSha256,input,assets:v.assetFiles};});
 const checks=first.map(v=>{const reference=first.find(x=>x.task===v.task)!;return{sequence:v.sequence,actor:v.actor,task:v.task,measured:true,matched:!!v.image&&!!v.product&&v.image===reference.image&&v.product===reference.product&&eq(v.input,reference.input)&&eq(v.assets,reference.assets)};});
 for(const check of checks.filter(v=>!v.matched)){const row=records.find(r=>r.sequence===check.sequence)!;row.error??={code:'INITIAL_NONPERSONA_INPUT_MISMATCH'};}return checks;
}
export async function runPersonaTaskComparison(o:Options){
 validateAlignmentOptions(o);const out=resolve(o.out),code=await sourceIdentity(),protocolBytes=await readFile(protocolFile),priorBytes=await readFile(o.priorSnapshot),prior=JSON.parse(priorBytes.toString()),charter=await readFile('experiments/persona/charter.json'),profile=humanJevProfile('experience-persona-unweighted',300000,60000);
 const personas:Record<PersonaBetaActor,Persona|null>={baseline:null,A:null,B:null,C:null},personaFiles:{file:string;sha256:string;bytes:Buffer}[]=[];
 for(const actor of personaBetaActors.filter(a=>a!=='baseline')){const file='experiments/persona/persona-'+actor.toLowerCase()+'.json',bytes=await readFile(file),p=parsePersona(JSON.parse(bytes.toString()));if(p.id!==actor)throw Error('PERSONA_FILE_ID_MISMATCH');personas[actor]=p;personaFiles.push({file,sha256:sha(bytes),bytes});}
 if(prior.count!==prior.files?.length||!Number.isInteger(prior.count)||new Set(prior.files.map((f:any)=>f.path)).size!==prior.count||prior.files.some((f:any)=>typeof f.path!=='string'||!isAbsolute(f.path)||!f.path.includes('reports')||!/^[a-f0-9]{64}$/.test(f.sha256)))throw Error('INVALID_PRIOR_SNAPSHOT');
 const preserve=async()=>{if(!eq(code,await sourceIdentity())||sha(await readFile(protocolFile))!==sha(protocolBytes)||sha(await readFile(o.priorSnapshot))!==sha(priorBytes)||sha(await readFile('experiments/persona/charter.json'))!==sha(charter))throw Error('FROZEN_SOURCE_CHANGED');for(const p of personaFiles)if(sha(await readFile(p.file))!==p.sha256)throw Error('PERSONA_FILE_CHANGED');for(const f of prior.files)if(sha(await readFile(f.path))!==f.sha256)throw Error('PRIOR_RAW_CHANGED');};await preserve();
 const schedule=personaTaskSchedule(),records:RecordRow[]=[],batchId=randomUUID(),deadline=Date.now()+7200000;let consecutiveInvalid=0;
 const manifest:any={schemaVersion:1,phase:'persona-tasks-2026-11-06',...code,batchId,mock:o.mock,profile,personas,personaFiles:personaFiles.map(({bytes,...v})=>v),schedule,records,protocolSha256:sha(protocolBytes),priorFile:o.priorSnapshot,priorSha256:sha(priorBytes),priorCount:prior.count,charterSha256:sha(charter),limits:{trials:36,maxRequests:1296,perTrialRequests:36,judgments:12,uiActions:15,looks:3,trialMs:300000,nativeRequestMs:60000,phaseMs:7200000,parallel:1,retry:0},totalRequests:0,status:'RUNNING',preservationBefore:true,preservationAfter:false,humanInputsRead:false,savedInputResends:0};
 async function save(){
  manifest.totalRequests=records.reduce((s,r)=>s+r.requests,0);manifest.initialInputs=personaTaskInitialInputs(records);const analysis=analyzePersonaTaskRuns(records);
  manifest.auditErrors=[...analysis.integrity.errors,...records.flatMap(r=>(r.personaDelivery?.errors??[]).map(e=>({id:r.id,...e}))),...manifest.initialInputs.filter((v:any)=>!v.matched).map((v:any)=>({code:'INITIAL_NONPERSONA_INPUT_MISMATCH',...v}))];
  const summary={schemaVersion:1,scope:'Persona-only comparison in common unweighted user mode; within/between variation and self-reported basis, no goal-based naturalness ranking or human fit.',status:manifest.status,planned:36,attempted:records.length,valid:analysis.runs.filter(r=>r.validity.valid).length,invalid:analysis.runs.filter(r=>!r.validity.valid).length,complete:analysis.runs.filter(r=>r.validity.valid).length,missing:schedule.filter(s=>!records.some(r=>r.sequence===s.sequence)),requests:manifest.totalRequests,initialInputs:manifest.initialInputs,analysis};
  await writeFile(join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');await writeFile(join(out,'summary.json'),JSON.stringify(summary,null,2)+'\n');return summary;
 }
 await mkdir(resolve(out,'..'),{recursive:true});await mkdir(out);await writeFile(join(out,'protocol.json'),protocolBytes);await save();
 try{
  for(const slot of schedule){
   if(Date.now()>=deadline){manifest.status='PHASE_TIME_LIMIT';break;}if(manifest.totalRequests+36>1296){manifest.status='REQUEST_LIMIT';break;}await preserve();
   const dir=join(out,slot.id),ledger=o.mock?null:dir+'-budget.json',persona=structuredClone(personas[slot.actor]),record:RecordRow={...slot,persona,personaSha256:persona?sha(JSON.stringify(persona)):null,runId:batchId+'-'+slot.sequence,status:'ATTEMPTING',dir,ledger,resultPath:join(dir,'exploration/result.json'),requests:0,initialImageSha256:null};records.push(record);await save();
   if(ledger)await writeFile(ledger,JSON.stringify({schemaVersion:1,status:'APPROVED',phase:'persona-tasks-'+slot.sequence,newMaximum:36,perRunMaximum:12,used:0,attempts:[]},null,2),{flag:'wx'});
   try{
    const saved=await runHumanJev({out:dir,mock:o.mock,mode:'experience-persona-unweighted',...(persona?{persona}:{}),longContext:true,maxRunMs:300000,visualRequestMs:60000,personaTaskFixture:slot.fixture,runId:record.runId,deadlineEpochMs:Math.min(deadline,Date.now()+300000),...(!o.mock?{phaseBudget:ledger!,envFile:o.envFile}:{})});
    record.result=saved.result;record.status='RESULT';record.requests=o.mock?0:saved.result.apiCalls;
    if(!eq(saved.result.code,{revision:code.revision,sourceHash:code.sourceHash})||!eq(saved.result.config,profile.config)||!eq(saved.result.input.persona??null,persona)||saved.result.input.charter.goal!==personaTaskDefinition(slot.fixture).goal)throw Error('TRIAL_IDENTITY_MISMATCH');
    record.initialImageSha256=sha(await readFile(join(dir,'exploration/initial-product.png')));await replayDirectory(join(dir,'exploration'),{finalVisualHTTP:!o.mock});record.replay={status:'OK'};record.frameChecks=await verifyTransferFrames(saved.result,join(dir,'exploration'));
   }catch(error){const f=safeRequestFailure(error);record.error={code:error instanceof Error&&/^[A-Z_]{1,80}$/.test(error.message)?error.message:f.code,...(f.statusCode?{statusCode:f.statusCode}:{})};if(!record.result){record.status='FAILED';try{record.result=JSON.parse(await readFile(record.resultPath,'utf8'));record.requests=o.mock?0:record.result!.apiCalls;}catch{}}}
   finally{
    if(record.result)record.personaDelivery=personaInputBindings(record);
    if(ledger)try{const l=await readTransferLedger(ledger,36);record.ledgerEvidence=l;record.requests=Math.max(record.requests,l.used);if(alignmentLedgerMismatch(l.used,l.reserved,record.result)){record.accountingCause=record.error;record.error={code:'LEDGER_ACCOUNTING_UNAVAILABLE'};}}catch{record.accountingCause=record.error;record.error={code:'LEDGER_ACCOUNTING_UNAVAILABLE'};}
    await save();
   }
   await preserve();const review=analyzePersonaTaskRuns([record]);consecutiveInvalid=review.runs[0].validity.valid?0:consecutiveInvalid+1;
   console.log(JSON.stringify({sequence:slot.sequence,actor:slot.actor,replicate:slot.replicate,requests:record.requests,termination:record.result?.termination,valid:review.runs[0].validity.valid,personaInputs:record.personaDelivery,error:record.error}));
   const stop=personaBetaStopReason(record,consecutiveInvalid)??(record.error?'TRIAL_AUDIT_ERROR':manifest.auditErrors.length?'COMPARISON_AUDIT_ERROR':null);if(stop){manifest.status=stop;break;}
  }
  if(manifest.status==='RUNNING')manifest.status=records.length===36?'COMPLETED':'INCOMPLETE';
 }catch(error){manifest.status=error instanceof Error&&/^[A-Z_]{1,80}$/.test(error.message)?error.message:'PHASE_ERROR';manifest.error={code:manifest.status};const last=records.at(-1);if(last?.status==='ATTEMPTING'){last.status='FAILED';last.error={code:manifest.status};}}
 finally{try{await preserve();manifest.preservationAfter=true;}catch{manifest.status='FROZEN_SOURCE_OR_PRIOR_CHANGED';manifest.preservationAfter=false;}await save();}
 return manifest;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2),o:any={mock:false};for(let i=0;i<args.length;i++){const k=args[i];if(k==='--mock'){o.mock=true;continue;}if(!['--out','--prior-snapshot','--env-file'].includes(k)||!args[i+1]||args[i+1].startsWith('--'))throw Error('INVALID_OPTION');o[{'--out':'out','--prior-snapshot':'priorSnapshot','--env-file':'envFile'}[k]as string]=args[++i];}
 const m=await runPersonaTaskComparison(o);console.log(JSON.stringify({status:m.status,attempted:m.records.length,requests:m.totalRequests}));if(m.status!=='COMPLETED')process.exitCode=1;
}
