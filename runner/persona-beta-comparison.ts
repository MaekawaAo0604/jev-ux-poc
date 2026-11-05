import{personaBetaActors,type PersonaBetaActor,type PersonaBetaRecord}from'./persona-beta-contracts.js';
import{analyzePersonaBetaRuns}from'./persona-beta-analysis.js';
import{readFile,writeFile,mkdir}from'node:fs/promises';import{resolve,join,isAbsolute}from'node:path';import{pathToFileURL}from'node:url';import{createHash,randomUUID}from'node:crypto';import{isDeepStrictEqual as eq}from'node:util';
import{parsePersona,type Persona}from'../jev/persona.js';import{runHumanJev}from'./human-jev-experiment.js';import{humanJevProfile}from'./human-jev-profiles.js';import{sourceIdentity}from'./virtual-beta-source.js';import{validateAlignmentOptions,alignmentLedgerMismatch}from'./inquiry-alignment-comparison.js';import{readTransferLedger}from'./transfer-evaluation.js';import{verifyTransferFrames}from'./transfer-analysis.js';import{replayDirectory}from'./virtual-beta-replay.js';import{safeRequestFailure}from'../jev/client.js';
const sha=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex'),protocolFile='experiments/virtual-beta/persona-beta-comparison.json';
type Options={out:string;mock:boolean;priorSnapshot:string;envFile?:string};
type RecordRow=PersonaBetaRecord&{accountingCause?:{code:string;statusCode?:number}};
export function personaBetaSchedule(){return[0,1,2].flatMap(offset=>Array.from({length:4},(_,i)=>{const actor=personaBetaActors[(offset+i)%4],replicate=offset+1;return{id:'persona-workshop-'+actor+'-r'+replicate,actor,replicate,sequence:offset*4+i+1,fixture:{version:1 as const,task:'workshop' as const,condition:'unchanged' as const}};}));}
/** Input bindings are separate from image/HTTP replay and from cognitive use. */
export function personaInputBindings(record:Pick<PersonaBetaRecord,'persona'|'result'>){
 const expected=record.persona??null,errors:{step:number;stage:string;code:string}[]=[];let native=0,assessment=0,action=0;
 const check=(p:unknown,step:number,stage:string)=>{if(!eq(p??null,expected))errors.push({step,stage,code:'PERSONA_BINDING_MISMATCH'});};
 if(record.result)check(record.result.input.persona,0,'run');
 for(const s of record.result?.steps??[]){
  const v=s.visualHypotheses;if(v){check(v.request?.persona,s.number,'native');if(v.response?.status==='completed')native++;}
  for(const [stage,input,response]of[['assessment',s.deliberation?.modelInput,s.deliberation?.response],['action',s.modelInput,s.response]]as const)if(input){
   check((input.exploration as any)?.persona,s.number,stage);
   if(!eq((input.userState as any)?.expectations,expected?.expectations??[]))errors.push({step:s.number,stage,code:'PERSONA_EXPECTATION_MISMATCH'});
   if(response?.answers){if(stage==='assessment')assessment++;else action++;}
  }
 }
 return{native,assessment,action,errors};
}
export function personaBetaStopReason(record:unknown,consecutiveInvalid:number):string|null{
 const codes=new Set<string>(),statuses=new Set<number>();let safety=false;
 function visit(v:unknown){if(!v||typeof v!=='object')return;const x=v as any;if(typeof x.code==='string')codes.add(x.code);if(typeof x.statusCode==='number')statuses.add(x.statusCode);if(x.termination==='SAFETY_STOP')safety=true;for(const value of Object.values(x))visit(value);}visit(record);
 if(['BUDGET_ADMISSION_ERROR','BUDGET_SETTLEMENT_AFTER_REQUEST','LEDGER_ACCOUNTING_UNAVAILABLE'].some(c=>codes.has(c)))return'BUDGET_ACCOUNTING_FAILURE';
 if(codes.has('MISSING_CREDENTIALS')||[400,401,402,403,404,429].some(c=>statuses.has(c)))return'PROVIDER_UNAVAILABLE';
 if(safety)return'SAFETY_STOP';
 return consecutiveInvalid>=2?'CONSECUTIVE_INVALID_TRIALS':null;
}
/** Annotate only comparison rows; never rewrite recorded model input or image evidence. */
export function personaInitialInputs(records:RecordRow[]){
 const first=records.filter(r=>r.result?.steps[0]?.visualHypotheses).map(r=>{const v=r.result!.steps[0].visualHypotheses!,{persona,...input}=v.request;return{sequence:r.sequence,actor:r.actor,image:r.result!.steps[0].assetFiles?.current?.sha256??null,product:r.initialImageSha256,input,assets:v.assetFiles};});
 const checks=first.map(v=>({sequence:v.sequence,actor:v.actor,measured:true,matched:!!v.image&&!!v.product&&v.image===first[0].image&&v.product===first[0].product&&eq(v.input,first[0].input)&&eq(v.assets,first[0].assets)}));
 for(const check of checks.filter(v=>!v.matched)){const row=records.find(r=>r.sequence===check.sequence)!;row.error??={code:'INITIAL_NONPERSONA_INPUT_MISMATCH'};}return checks;
}
export async function runPersonaBetaComparison(o:Options){
 validateAlignmentOptions(o);const out=resolve(o.out),code=await sourceIdentity(),protocolBytes=await readFile(protocolFile),priorBytes=await readFile(o.priorSnapshot),prior=JSON.parse(priorBytes.toString()),charter=await readFile('experiments/persona/charter.json'),profile=humanJevProfile('experience-persona-unweighted',300000,60000);
 const personas:Record<PersonaBetaActor,Persona|null>={baseline:null,A:null,B:null,C:null},personaFiles:{file:string;sha256:string;bytes:Buffer}[]=[];
 for(const actor of personaBetaActors.filter(a=>a!=='baseline')){const file='experiments/persona/persona-'+actor.toLowerCase()+'.json',bytes=await readFile(file),p=parsePersona(JSON.parse(bytes.toString()));if(p.id!==actor)throw Error('PERSONA_FILE_ID_MISMATCH');personas[actor]=p;personaFiles.push({file,sha256:sha(bytes),bytes});}
 if(prior.count!==prior.files?.length||!Number.isInteger(prior.count)||new Set(prior.files.map((f:any)=>f.path)).size!==prior.count||prior.files.some((f:any)=>typeof f.path!=='string'||!isAbsolute(f.path)||!f.path.includes('reports')||!/^[a-f0-9]{64}$/.test(f.sha256)))throw Error('INVALID_PRIOR_SNAPSHOT');
 const preserve=async()=>{if(!eq(code,await sourceIdentity())||sha(await readFile(protocolFile))!==sha(protocolBytes)||sha(await readFile(o.priorSnapshot))!==sha(priorBytes)||sha(await readFile('experiments/persona/charter.json'))!==sha(charter))throw Error('FROZEN_SOURCE_CHANGED');for(const p of personaFiles)if(sha(await readFile(p.file))!==p.sha256)throw Error('PERSONA_FILE_CHANGED');for(const f of prior.files)if(sha(await readFile(f.path))!==f.sha256)throw Error('PRIOR_RAW_CHANGED');};await preserve();
 const schedule=personaBetaSchedule(),records:RecordRow[]=[],batchId=randomUUID(),deadline=Date.now()+3960000;let consecutiveInvalid=0;
 const manifest:any={schemaVersion:1,phase:'persona-beta-2026-11-05',...code,batchId,mock:o.mock,profile,personas,personaFiles:personaFiles.map(({bytes,...v})=>v),schedule,records,protocolSha256:sha(protocolBytes),priorFile:o.priorSnapshot,priorSha256:sha(priorBytes),priorCount:prior.count,charterSha256:sha(charter),limits:{trials:12,maxRequests:432,perTrialRequests:36,judgments:12,uiActions:15,looks:3,trialMs:300000,nativeRequestMs:60000,phaseMs:3960000,parallel:1,retry:0},totalRequests:0,status:'RUNNING',preservationBefore:true,preservationAfter:false,humanInputsRead:false,savedInputResends:0};
 async function save(){
  manifest.totalRequests=records.reduce((s,r)=>s+r.requests,0);manifest.initialInputs=personaInitialInputs(records);const analysis=analyzePersonaBetaRuns(records);
  manifest.auditErrors=[...analysis.integrity.errors,...analysis.motion.integrity.errors,...records.flatMap(r=>(r.personaDelivery?.errors??[]).map(e=>({id:r.id,...e}))),...manifest.initialInputs.filter((v:any)=>!v.matched).map((v:any)=>({code:'INITIAL_NONPERSONA_INPUT_MISMATCH',...v}))];
  const summary={schemaVersion:1,scope:'Persona-only comparison in common unweighted user mode; within/between variation and self-reported basis, no goal-based naturalness ranking or human fit.',status:manifest.status,planned:12,attempted:records.length,valid:analysis.runs.filter(r=>r.validity.valid).length,invalid:analysis.runs.filter(r=>!r.validity.valid).length,complete:analysis.paths.complete.length,missing:schedule.filter(s=>!records.some(r=>r.sequence===s.sequence)),requests:manifest.totalRequests,initialInputs:manifest.initialInputs,analysis};
  await writeFile(join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');await writeFile(join(out,'summary.json'),JSON.stringify(summary,null,2)+'\n');return summary;
 }
 await mkdir(resolve(out,'..'),{recursive:true});await mkdir(out);await writeFile(join(out,'protocol.json'),protocolBytes);await save();
 try{
  for(const slot of schedule){
   if(Date.now()>=deadline){manifest.status='PHASE_TIME_LIMIT';break;}if(manifest.totalRequests+36>432){manifest.status='REQUEST_LIMIT';break;}await preserve();
   const dir=join(out,slot.id),ledger=o.mock?null:dir+'-budget.json',persona=structuredClone(personas[slot.actor]),record:RecordRow={...slot,persona,personaSha256:persona?sha(JSON.stringify(persona)):null,runId:batchId+'-'+slot.sequence,status:'ATTEMPTING',dir,ledger,resultPath:join(dir,'exploration/result.json'),requests:0,initialImageSha256:null};records.push(record);await save();
   if(ledger)await writeFile(ledger,JSON.stringify({schemaVersion:1,status:'APPROVED',phase:'persona-beta-'+slot.sequence,newMaximum:36,perRunMaximum:12,used:0,attempts:[]},null,2),{flag:'wx'});
   try{
    const saved=await runHumanJev({out:dir,mock:o.mock,mode:'experience-persona-unweighted',...(persona?{persona}:{}),longContext:true,maxRunMs:300000,visualRequestMs:60000,recoveryFixture:slot.fixture,runId:record.runId,deadlineEpochMs:Math.min(deadline,Date.now()+300000),...(!o.mock?{phaseBudget:ledger!,envFile:o.envFile}:{})});
    record.result=saved.result;record.status='RESULT';record.requests=o.mock?0:saved.result.apiCalls;
    if(!eq(saved.result.code,{revision:code.revision,sourceHash:code.sourceHash})||!eq(saved.result.config,profile.config)||!eq(saved.result.input.persona??null,persona))throw Error('TRIAL_IDENTITY_MISMATCH');
    record.initialImageSha256=sha(await readFile(join(dir,'exploration/initial-product.png')));await replayDirectory(join(dir,'exploration'),{finalVisualHTTP:!o.mock});record.replay={status:'OK'};record.frameChecks=await verifyTransferFrames(saved.result,join(dir,'exploration'));
   }catch(error){const f=safeRequestFailure(error);record.error={code:error instanceof Error&&/^[A-Z_]{1,80}$/.test(error.message)?error.message:f.code,...(f.statusCode?{statusCode:f.statusCode}:{})};if(!record.result){record.status='FAILED';try{record.result=JSON.parse(await readFile(record.resultPath,'utf8'));record.requests=o.mock?0:record.result!.apiCalls;}catch{}}}
   finally{
    if(record.result)record.personaDelivery=personaInputBindings(record);
    if(ledger)try{const l=await readTransferLedger(ledger,36);record.ledgerEvidence=l;record.requests=Math.max(record.requests,l.used);if(alignmentLedgerMismatch(l.used,l.reserved,record.result)){record.accountingCause=record.error;record.error={code:'LEDGER_ACCOUNTING_UNAVAILABLE'};}}catch{record.accountingCause=record.error;record.error={code:'LEDGER_ACCOUNTING_UNAVAILABLE'};}
    await save();
   }
   await preserve();const review=analyzePersonaBetaRuns([record]);consecutiveInvalid=review.runs[0].validity.valid?0:consecutiveInvalid+1;
   console.log(JSON.stringify({sequence:slot.sequence,actor:slot.actor,replicate:slot.replicate,requests:record.requests,termination:record.result?.termination,valid:review.runs[0].validity.valid,personaInputs:record.personaDelivery,motion:review.motion.overall,error:record.error}));
   const stop=personaBetaStopReason(record,consecutiveInvalid)??(record.error?'TRIAL_AUDIT_ERROR':manifest.auditErrors.length?'COMPARISON_AUDIT_ERROR':null);if(stop){manifest.status=stop;break;}
  }
  if(manifest.status==='RUNNING')manifest.status=records.length===12?'COMPLETED':'INCOMPLETE';
 }catch(error){manifest.status=error instanceof Error&&/^[A-Z_]{1,80}$/.test(error.message)?error.message:'PHASE_ERROR';manifest.error={code:manifest.status};const last=records.at(-1);if(last?.status==='ATTEMPTING'){last.status='FAILED';last.error={code:manifest.status};}}
 finally{try{await preserve();manifest.preservationAfter=true;}catch{manifest.status='FROZEN_SOURCE_OR_PRIOR_CHANGED';manifest.preservationAfter=false;}await save();}
 return manifest;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2),o:any={mock:false};for(let i=0;i<args.length;i++){const k=args[i];if(k==='--mock'){o.mock=true;continue;}if(!['--out','--prior-snapshot','--env-file'].includes(k)||!args[i+1]||args[i+1].startsWith('--'))throw Error('INVALID_OPTION');o[{'--out':'out','--prior-snapshot':'priorSnapshot','--env-file':'envFile'}[k]as string]=args[++i];}
 const m=await runPersonaBetaComparison(o);console.log(JSON.stringify({status:m.status,attempted:m.records.length,requests:m.totalRequests}));if(m.status!=='COMPLETED')process.exitCode=1;
}
