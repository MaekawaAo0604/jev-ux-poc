import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {createSampler} from '../../jev/virtual-beta/selection.ts';
import {reconstructReplayCandidates} from '../../runner/virtual-beta-replay-candidates.ts';
import {sourceIdentity} from '../../runner/virtual-beta-source.ts';
import {replayDirectory} from '../../runner/virtual-beta-replay.ts';
import {analyzeReasonRuns} from '../../runner/deferral-reason-experiment.ts';
const root=process.argv[2]??'reports/notification-switch-2026-10-29/live';
const outputPath=process.argv[3]??root+'/audit.json';
const read=async p=>JSON.parse(await readFile(p,'utf8')),sha=v=>createHash('sha256').update(v).digest('hex');
const manifest=await read(root+'/manifest.json'),source=await sourceIdentity();
if(manifest.comparison!=='deferral-scope'||manifest.mock!==false)throw Error('REAL_SCOPE_COMPARISON_REQUIRED');
if(manifest.sourceHash!==source.sourceHash)throw Error('SOURCE_CHANGED');
const records=[],audits=[];
for(const entry of manifest.records){
 const dir=root+'/'+entry.dir,r=await read(dir+'/exploration/result.json'),trial=await read(dir+'/manifest.json'),ledger=await read(root+'/'+entry.id+'-budget.json');
 const replay=await replayDirectory(dir+'/exploration');
 if(!replay.verified||r.code.sourceHash!==manifest.sourceHash||r.code.revision!==manifest.revision||entry.requests!==trial.actualAPIRequests||r.apiCalls!==trial.actualAPIRequests||ledger.used!==trial.actualAPIRequests)throw Error('ACCOUNTING_OR_SOURCE_OR_REPLAY_MISMATCH');
 if(ledger.attempts.length!==ledger.used||ledger.attempts.some(a=>a.metadata?.attempts!==1))throw Error('ATTEMPT_ACCOUNTING_MISMATCH');
 records.push({...entry,result:r});audits.push({id:entry.id,scenario:entry.scenario,condition:entry.condition,replicate:entry.replicate,termination:r.termination,objective:r.objectiveAssessment,valid:r.validForComparison,uiActions:r.uiActions,decisions:r.decisions,requests:trial.actualAPIRequests,replay});
}
const summary=analyzeReasonRuns(records,'deferral-scope'),prior=await read(root+'/prior-ledger-check.json');
const priorNow=await Promise.all(prior.ledgers.map(async p=>({path:p.path,unchanged:sha(await readFile(p.path))===p.sha256})));
if(!prior.unchanged||priorNow.some(p=>!p.unchanged)||summary.pairs.some(p=>p.status==='paired'&&!p.consistent))throw Error('PRIOR_OR_PAIR_CHANGED');
const initialPairs=summary.pairs.map(p=>{const a=records.find(r=>r.scenario===p.scenario&&r.replicate===p.replicate&&r.condition==='old'),b=records.find(r=>r.scenario===p.scenario&&r.replicate===p.replicate&&r.condition==='reason');const x=a?.result.steps[0],y=b?.result.steps[0];return {scenario:p.scenario,replicate:p.replicate,assessmentInputEqual:!!x?.deliberation?.inputSha256&&x.deliberation.inputSha256===y?.deliberation?.inputSha256,assessmentAnswersEqual:JSON.stringify(x?.deliberation?.response?.answers)===JSON.stringify(y?.deliberation?.response?.answers),actionInputEqual:!!x?.inputSha256&&x.inputSha256===y?.inputSha256,actionAnswersEqual:JSON.stringify(x?.response?.answers)===JSON.stringify(y?.response?.answers)};});
const conditions=['old','reason'].map(condition=>{const rows=summary.runs.filter(r=>r.condition===condition);return {condition,trials:rows.length,valid:rows.filter(r=>r.valid).length,successes:rows.filter(r=>r.success).length,faults:rows.filter(r=>r.fault).length,requests:rows.reduce((s,r)=>s+r.requests,0),policyPromotedTerminal:rows.reduce((s,r)=>s+r.policyPromotedTerminal,0),baselineTerminalPreserved:rows.reduce((s,r)=>s+r.baselineTerminalPreserved,0),scopeRecorded:rows.reduce((s,r)=>s+r.scopeRecorded,0)};});
const counterfactuals=[];
for(const run of records.filter(r=>r.condition==='reason'))for(const step of run.result.steps){
 const record=step.selection;if(!record?.policy?.scope)continue;
 const candidates=reconstructReplayCandidates(step.audit.screen,Object.keys(record.raw)),sampler=createSampler({mode:record.mode,seed:record.seed});let global;
 for(let index=0;index<=record.drawIndex;index++)global=sampler.select(record.modelChoice,record.raw,candidates,Object.fromEntries(record.adjustments.map(a=>[a.candidate,a.reason])),record.policy.weights);
 if(global.selected!==record.selected)counterfactuals.push({id:run.id,step:step.number,raw:record.raw,before:record.policy.before,weights:record.policy.weights,baseline:record.policy.scope.baselineSelected,actualSelected:record.selected,actualAction:step.action,actualOutcome:step.outcome,globalCounterfactualSelected:global.selected,globalCounterfactualAction:candidates[global.selected].action,globalWouldPromoteTerminal:['done','stuck','abandon'].includes(candidates[global.selected].action.type),noAPIOrUIReexecution:true,eventualCounterfactualGoal:'NOT_EXECUTED'});
}
const report={counterfactuals,schemaVersion:1,kind:'ui-conditional-deferral-descriptive-comparison',baselineRevision:'4197971b987e6250ca747bd1907c3ce5d02c611d',frozenRevision:manifest.revision,sourceHash:manifest.sourceHash,status:manifest.status,mock:manifest.mock,model:manifest.model,currentRevisionMatchesManifest:source.revision===manifest.revision,sourceHashMatches:true,humanFidelityEvaluated:false,humanInputsRead:false,savedInputsResent:false,limits:manifest.limits,requests:manifest.requestAccounting,priorLedgers:{checked:prior.checked,unchanged:priorNow.every(p=>p.unchanged)},conditions,pairs:summary.pairs,initialPairs,cells:summary.cells,runs:summary.runs,rawAudits:audits,limitations:summary.limitations};
await writeFile(outputPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({outputPath,conditions,prior:report.priorLedgers,cells:summary.cells,initialPairs},null,2));
