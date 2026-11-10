import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {analyzeRepair} from '../scripts/analyze-attention-repair.js';
import {analyzeFrame} from '../scripts/analyze-attention-task-frame.js';
const sha=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
const json=async(p:string)=>JSON.parse(await readFile(p,'utf8'));
const phases=[{name:'phase-one',file:'reports/attention-repair-2026-11-10/live-r1/phase.json',analyze:analyzeRepair},{name:'phase-two',file:'reports/attention-repair-2026-11-10/live-r2/phase.json',analyze:analyzeFrame}];
const available=async(file:string)=>{try{const p=await json(file);if(p.status!=='COMPLETED')return false;for(const b of p.batches){const s=await json(join(b.outDir,'comparison.json'));if(!existsSync(join(b.outDir,'manifest.json'))||!existsSync(b.ledger))return false;for(const r of s.trials)if(!existsSync(join(b.outDir,r.runId,'result.json')))return false;}return true;}catch{return false;}};
for(const phase of phases){
 const options={skip:await available(phase.file)?false:'Retained completed phase, batch manifests, ledgers and raw results are unavailable in this checkout; only artifact-dependent analyzer checks are skipped.'};
 for(const [name,mutate,expected]of [
  ['mock phase',(p:any)=>{p.mock=true;},/PHASE_NOT_ADMISSIBLE/],
  ['wrong source hash',(_p:any,m:any)=>{m.sourceHash='0'.repeat(64);},/SOURCE_OR_ACCOUNTING/],
  ['wrong source revision',(_p:any,m:any)=>{m.revision='0'.repeat(40);},/SOURCE_OR_ACCOUNTING/],
  ['wrong declared model',(_p:any,m:any)=>{m.model='WRONG_MODEL';},/REAL_MODEL_PROVENANCE/],
  ['scripted data flag',(_p:any,_m:any,s:any)=>{s.dataSource='SCRIPTED_FIXTURE';},/REAL_MODEL_PROVENANCE/],
  ['missing scheduled batch',(p:any)=>{p.batches.pop();},/STUDY_SCHEDULE/],
  ['duplicate trial identity',(_p:any,_m:any,s:any)=>{s.trials[0].runId=s.trials[1].runId;},/TRIAL_SCHEDULE/],
  ['changed policy assignment',(_p:any,_m:any,s:any)=>{s.trials[0].config.attention={enabled:true,policy:'exclusive-hierarchical-v2',sampling:'domain-separated-v1',taskFrame:'attention-v1'};},/TRIAL_SCHEDULE/],
  ['unbound reservation',(_p:any,_m:any,s:any)=>{s.requests[0].reservationId='unbound-reservation';},/RESERVATION/]
 ]as const){
  test('independent '+phase.name+' analysis rejects '+name+' with refreshed outer summary hash',options,async()=>{
   const p=await json(phase.file),old=p.batches[0].outDir,m=await json(join(old,'manifest.json')),s=await json(join(old,'comparison.json')),dir=await mkdtemp(join(tmpdir(),'attention-analysis-'+phase.name+'-'));
   mutate(p,m,s);const b=p.batches[0];b.outDir=join(dir,'batch');await mkdir(b.outDir);const bytes=JSON.stringify(s);await writeFile(join(b.outDir,'manifest.json'),JSON.stringify(m));await writeFile(join(b.outDir,'comparison.json'),bytes);b.summarySha256=sha(bytes);const file=join(dir,'phase.json');await writeFile(file,JSON.stringify(p));await assert.rejects(phase.analyze(file,join(dir,'analysis')),expected);
  });
 }
 for(const mismatch of ['raw-source','response-model'])test('independent '+phase.name+' analysis rejects coherently rehashed '+mismatch,options,async()=>{
  const p=await json(phase.file),b=p.batches[0],old=b.outDir,m=await json(join(old,'manifest.json')),s=await json(join(old,'comparison.json')),first=s.trials[0],r=await json(join(old,first.runId,'result.json')),dir=await mkdtemp(join(tmpdir(),'attention-analysis-raw-'+phase.name+'-'));
  if(mismatch==='raw-source')r.code.sourceHash='0'.repeat(64);else{const stage=r.steps.find((x:any)=>x.response||x.attention?.response);(stage.response??stage.attention.response).model='WRONG_MODEL';}
  b.outDir=join(dir,'batch');const run=join(b.outDir,first.runId);await mkdir(run,{recursive:true});const raw=JSON.stringify(r);await writeFile(join(run,'result.json'),raw);first.rawSha256=sha(raw);first.artifactHashes={'result.json':sha(raw)};const summary=JSON.stringify(s);b.summarySha256=sha(summary);await writeFile(join(b.outDir,'manifest.json'),JSON.stringify(m));await writeFile(join(b.outDir,'comparison.json'),summary);const file=join(dir,'phase.json');await writeFile(file,JSON.stringify(p));await assert.rejects(phase.analyze(file,join(dir,'analysis')),mismatch==='raw-source'?/TRIAL_CODE_MISMATCH/:/RESPONSE_MODEL_MISMATCH/);
 });
}
