import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {sha} from '../runner/virtual-beta-core.js';
import {sourceIdentity} from '../runner/virtual-beta-source.js';
import {runControlledComparison} from '../runner/controlled-comparison.js';
const argv=process.argv.slice(2),value=(key:string)=>argv[argv.indexOf(key)+1];
if(!argv.includes('--out')||!argv.includes('--freeze'))throw Error('OUT_AND_FREEZE_REQUIRED');
const out=resolve(value('--out')),freeze=JSON.parse(await readFile(value('--freeze'),'utf8')),mock=argv.includes('--mock');
const studyFile='experiments/virtual-beta/attention-task-frame-v1/study.json',study=JSON.parse(await readFile(studyFile,'utf8'));
const frozen=async()=>{const current=await sourceIdentity();if(current.revision!==freeze.revision||current.sourceHash!==freeze.sourceHash)throw Error('SOURCE_CHANGED');for(const [file,hash]of Object.entries(freeze.inputs))if(sha(await readFile(file))!==hash)throw Error('INPUT_CHANGED');};
const prior=freeze.priorFile?JSON.parse(await readFile(freeze.priorFile,'utf8')):null;
const preserve=async()=>{if(prior)for(const f of prior.files)if(sha(await readFile(f.path))!==f.sha256)throw Error('PRIOR_RAW_CHANGED');};
const previous=JSON.parse(await readFile(study.previousPhase,'utf8'));if(previous.status!=='COMPLETED'||previous.batches.reduce((n:number,b:any)=>n+b.actualAPIRequests,0)!==study.previousActualRequests||study.previousActualRequests+study.allocatedAPIRequests>study.taskMaximumTotalRequests)throw Error('TASK_CALL_CAP_EXCEEDED');await frozen();await preserve();await mkdir(out,{recursive:false});
const phase:any={schemaVersion:1,study:studyFile,studySha256:sha(await readFile(studyFile)),inputHashes:freeze.inputs,source:{revision:freeze.revision,sourceHash:freeze.sourceHash},driverSha256:sha(await readFile(process.argv[1])),mock,status:'RUNNING',allocation:study.allocatedAPIRequests,plannedTrials:study.plannedTrials,preservationBefore:true,preservationAfter:false,batches:study.batches.map((b:any)=>({...b,outDir:join(out,b.id),ledger:mock?null:join(out,b.id+'-budget.json'),status:'PENDING'}))};
const save=()=>writeFile(join(out,'phase.json'),JSON.stringify(phase,null,2)+'\n');await save();const started=performance.now();
try{for(const b of phase.batches){if(study.maxPhaseMs-(performance.now()-started)<600000){phase.status='PHASE_TIME_LIMIT';break;}await frozen();const plan=JSON.parse(await readFile(b.plan,'utf8'));if(b.ledger)await writeFile(b.ledger,JSON.stringify({schemaVersion:1,status:'APPROVED',phase:b.id,newMaximum:b.allocatedAPIRequests,perRunMaximum:8,used:0,attempts:[]})+'\n',{flag:'wx'});b.status='RUNNING';await save();const {summary}=await runControlledComparison({plan,out:b.outDir,mock,envFile:argv.includes('--env-file')?value('--env-file'):undefined,charterFile:study.charter,personaFile:study.persona,...(b.ledger?{phaseBudgetFile:b.ledger}:{})});b.status=summary.stopReason?'STOPPED':'COMPLETED';b.actualAPIRequests=summary.actualAPIRequests;b.summarySha256=sha(await readFile(join(b.outDir,'comparison.json')));await frozen();await save();console.log(JSON.stringify({batch:b.id,status:b.status,requests:b.actualAPIRequests,completed:summary.completedTrials,censored:summary.censoredTrials,invalid:summary.invalidTrials,missing:summary.missingTrials}));if(summary.stopReason){phase.status=summary.stopReason;break;}}
if(phase.status==='RUNNING')phase.status='COMPLETED';}catch(error){phase.status=error instanceof Error&&/^[A-Z_]+$/.test(error.message)?error.message:'PHASE_ERROR';}
finally{try{await frozen();await preserve();phase.preservationAfter=true;}catch{phase.status='PRESERVATION_OR_FREEZE_ERROR';}phase.elapsedMs=performance.now()-started;await save();}
console.log(JSON.stringify({phase:phase.status,requests:phase.batches.reduce((n:number,b:any)=>n+(b.actualAPIRequests??0),0)}));if(phase.status!=='COMPLETED')process.exitCode=1;
