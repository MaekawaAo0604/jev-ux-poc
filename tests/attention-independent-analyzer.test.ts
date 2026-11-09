import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {analyzeAttention} from '../scripts/analyze-attention-reselection.js';
const phaseFile='reports/attention-reselection-2026-11-09/live-r1/phase.json';
const json=async(p:string)=>JSON.parse(await readFile(p,'utf8'));
const savedPhase=existsSync(phaseFile)?await json(phaseFile):null;const artifactsAvailable=savedPhase?.batches?.every((b:any)=>existsSync(join(b.outDir,'manifest.json'))&&existsSync(join(b.outDir,'comparison.json'))&&existsSync(b.ledger));const artifactOptions={skip:artifactsAvailable?false:'Retained real-run phase, ledger and batch artifacts unavailable; analyzer audit was not run.'};
const sha=(x:string)=>createHash('sha256').update(x).digest('hex');
test('independent analyzer accepts all real artifacts and preserves terminal/request counts',artifactOptions,async()=>{const out=join(await mkdtemp(join(tmpdir(),'attention-analyzer-baseline-')),'analysis');const r=await analyzeAttention(phaseFile,out);assert.equal(r.actual,12);assert.equal(r.requests,114);assert.equal(r.trials.filter((t:any)=>t.enabled).length,6);assert.equal(r.trials.filter((t:any)=>!t.enabled).length,6);assert.ok(r.trials.every((t:any)=>t.objectiveSuccess===false));});
for(const [name,mutate,expected]of [
 ['missing batch',(p:any)=>p.batches.pop(),/STUDY_SCHEDULE/],
 ['mock manifest',(_p:any,m:any)=>{m.mock=true;},/REAL_MODEL_PROVENANCE/],
 ['scripted summary',(_p:any,_m:any,s:any)=>{s.mock=true;s.dataSource='SCRIPTED_FIXTURE_NOT_MODEL_PERFORMANCE';},/REAL_MODEL_PROVENANCE/],
 ['wrong model',(_p:any,m:any)=>{m.model='MOCK_SCRIPTED_FIXTURE';},/REAL_MODEL_PROVENANCE/],
 ['changed plan',(_p:any,m:any)=>{m.plan.configs[0].maxAPICalls=11;},/BATCH_PLAN/],
 ['ON replaced with OFF',(_p:any,_m:any,s:any)=>{s.trials[0].config.attention={enabled:false};},/TRIAL_SCHEDULE/],
 ['duplicate scheduled run',(_p:any,_m:any,s:any)=>{s.trials[0].runId=s.trials[1].runId;},/TRIAL_SCHEDULE/],
 ['extra counted request',(_p:any,_m:any,s:any)=>{s.requests.push(structuredClone(s.requests[0]));},/SOURCE_OR_ACCOUNTING/]
] as const){test('independent analyzer rejects '+name+' even with refreshed outer summary hash',artifactOptions,async()=>{const p=await json(phaseFile),first=p.batches[0],m=await json(join(first.outDir,'manifest.json')),s=await json(join(first.outDir,'comparison.json')),sandbox=await mkdtemp(join(tmpdir(),'attention-analyzer-tamper-'));mutate(p,m,s);const b=p.batches[0];b.outDir=join(sandbox,'batch');await mkdir(b.outDir);const summary=JSON.stringify(s);await writeFile(join(b.outDir,'comparison.json'),summary);await writeFile(join(b.outDir,'manifest.json'),JSON.stringify(m));b.summarySha256=sha(summary);const fake=join(sandbox,'phase.json');await writeFile(fake,JSON.stringify(p));await assert.rejects(analyzeAttention(fake,join(sandbox,'out')),expected);});}
