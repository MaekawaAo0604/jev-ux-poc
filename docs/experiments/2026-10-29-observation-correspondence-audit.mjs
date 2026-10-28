import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {sourceIdentity} from '../../runner/virtual-beta-source.ts';
import {replayDirectory} from '../../runner/virtual-beta-replay.ts';
import {analyzeReasonRuns} from '../../runner/deferral-reason-experiment.ts';
const root=process.argv[2]??'reports/observation-correspondence-2026-10-29/live';
const output=process.argv[3]??root+'/audit.json';
const read=async p=>JSON.parse(await readFile(p,'utf8')),sha=v=>createHash('sha256').update(v).digest('hex');
const manifest=await read(root+'/manifest.json'),code=await sourceIdentity();
if(manifest.comparison!=='observation-correspondence'||manifest.mock!==false||manifest.status!=='COMPLETED'||manifest.records.length!==12)throw Error('COMPLETE_REAL_COMPARISON_REQUIRED');
if(code.sourceHash!==manifest.sourceHash||JSON.stringify(code.sourceHashes)!==JSON.stringify(manifest.sourceHashes))throw Error('PRODUCT_SOURCE_CHANGED');
const records=[],rawAudits=[];
for(const entry of manifest.records){
 const dir=root+'/'+entry.dir,result=await read(dir+'/exploration/result.json'),trial=await read(dir+'/manifest.json'),ledger=await read(root+'/'+entry.id+'-budget.json'),replay=await replayDirectory(dir+'/exploration');
 if(!replay.verified||result.code.sourceHash!==manifest.sourceHash||result.code.revision!==manifest.revision||entry.requests!==trial.actualAPIRequests||result.apiCalls!==trial.actualAPIRequests||ledger.used!==trial.actualAPIRequests)throw Error('SOURCE_ACCOUNTING_OR_REPLAY_MISMATCH');
 if(ledger.attempts.length!==ledger.used||ledger.attempts.some(a=>a.metadata?.attempts!==1))throw Error('ATTEMPT_ACCOUNTING_MISMATCH');
 records.push({...entry,result});rawAudits.push({id:entry.id,objective:result.objectiveAssessment,termination:result.termination,valid:result.validForComparison,uiActions:result.uiActions,decisions:result.decisions,requests:ledger.used,replay});
}
const summary=analyzeReasonRuns(records,'observation-correspondence'),prior=await read(root+'/prior-ledger-check.json');
const priorNow=await Promise.all(prior.ledgers.map(async p=>({path:p.path,unchanged:sha(await readFile(p.path))===p.sha256})));
if(!prior.unchanged||priorNow.some(p=>!p.unchanged)||summary.pairs.some(p=>p.status==='paired'&&!p.consistent))throw Error('PAIR_OR_PRIOR_CHANGED');
const initialPairs=summary.pairs.map(p=>{const a=records.find(r=>r.scenario===p.scenario&&r.replicate===p.replicate&&r.condition==='old'),b=records.find(r=>r.scenario===p.scenario&&r.replicate===p.replicate&&r.condition==='reason');const x=a?.result.steps[0],y=b?.result.steps[0];return {scenario:p.scenario,replicate:p.replicate,assessmentInputEqual:!!x?.deliberation?.inputSha256&&x.deliberation.inputSha256===y?.deliberation?.inputSha256,assessmentAnswersEqual:JSON.stringify(x?.deliberation?.response?.answers)===JSON.stringify(y?.deliberation?.response?.answers),actionInputEqual:!!x?.inputSha256&&x.inputSha256===y?.inputSha256,actionAnswersEqual:JSON.stringify(x?.response?.answers)===JSON.stringify(y?.response?.answers)};});
const conditions=['old','reason'].map(condition=>{const rows=summary.runs.filter(r=>r.condition===condition);return {condition,trials:rows.length,valid:rows.filter(r=>r.valid).length,successes:rows.filter(r=>r.success).length,faults:rows.filter(r=>r.fault).length,requests:rows.reduce((s,r)=>s+r.requests,0),correspondenceProposals:rows.reduce((s,r)=>s+(r.correspondenceProposals??0),0),annotations:rows.reduce((s,r)=>s+(r.correspondenceAnnotations??0),0),selectedAnnotatedSteps:rows.reduce((s,r)=>s+(r.selectedAnnotatedSteps??0),0)};});
for(const run of summary.runs)for(const trace of run.correspondenceTrace??[]){
 if(trace.preparation?.reason==='PROPOSED'&&run.valid&&(!trace.assessment.sourceMatched||!trace.actionStage.sourceMatched))throw Error('SOURCE_NOT_ATTACHED');
 if(trace.assessment.totalUniqueImages>4||trace.actionStage.totalUniqueImages>4||trace.annotations.some(a=>!a.criteriaMatches||!a.hasUnchangedLink))throw Error('BAD_IMAGE_CAP_OR_ANNOTATION');
}
const report={schemaVersion:1,kind:'observation-correspondence-descriptive-comparison',frozenRevision:manifest.revision,sourceHash:manifest.sourceHash,status:manifest.status,model:manifest.model,mock:false,humanFidelityEvaluated:false,humanInputsRead:false,savedInputsResent:false,sourceHashMatches:true,currentRevisionMatchesManifest:code.revision===manifest.revision,limits:manifest.limits,requests:manifest.requestAccounting,priorLedgers:{checked:prior.checked,unchanged:priorNow.every(p=>p.unchanged)},conditions,initialPairs,pairs:summary.pairs,cells:summary.cells,runs:summary.runs,rawAudits,limitations:summary.limitations};
await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({output,conditions,prior:report.priorLedgers,cells:summary.cells},null,2));
