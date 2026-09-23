// Frozen-code live evaluation. Goals/checks contain no reference facts or routes.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {report} from '../../runner/report.ts';
import {preflight} from './2026-09-22-preflight.mjs';
const plan=JSON.parse(await readFile('docs/experiments/2026-09-20-six-case-plan.json','utf8'));
const runs=[{id:'anytime-highschool',repeat:1,checks:['制度の対象条件','利用できる店舗','時間帯']},{id:'anytime-highschool',repeat:2,checks:['制度の対象条件','利用できる店舗','時間帯']},{id:'anytime-tour',repeat:1}];
const root=resolve('reports',`goal-check-live-${new Date().toISOString().replaceAll(':','-')}`);await mkdir(root,{recursive:true});
const files=['package-lock.json',...(await Promise.all(['jev','pages','runner'].map(async dir=>(await readdir(dir)).filter(f=>f.endsWith('.ts')).map(f=>join(dir,f))))).flat()];
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async f=>[f,createHash('sha256').update(await readFile(f)).digest('hex')])));
const manifest={startedAt:new Date().toISOString(),sourceHashes:await hashes(),settings:{maxActions:24,intervalMs:3000,decisionMode:'goal-checks-experimental',ocr:false,freshContextPerRun:true},plannedRuns:runs,cases:[]};
const save=()=>writeFile(join(root,'validation.json'),JSON.stringify(manifest,null,2));
await save();const results=[];
process.loadEnvFile('.env');
manifest.preflight=await preflight(runs.map(run=>plan.cases.find(c=>c.id===run.id).url));await save();
if(!manifest.preflight.ok){manifest.notRun=runs;await save();console.log(JSON.stringify({report:join(root,'validation.json'),preflight:manifest.preflight,notRun:runs.length}));process.exit(1);}
for(const run of runs){
 assert.deepEqual(await hashes(),manifest.sourceHashes,'Do not change production code during the trials');
 const c=plan.cases.find(c=>c.id===run.id),checks=run.checks||[c.goal];
 console.log(`START ${run.id} #${run.repeat}`);
 const stdout=await new Promise((ok,fail)=>{
  const child=spawn(process.execPath,['--import','tsx','runner/public-site.ts',c.url,c.goal,'--reviewed','--max-actions','24','--interval-ms','3000',...checks.flatMap(check=>['--goal-check',check])],{stdio:['ignore','pipe','pipe'],windowsHide:true});
  let out='';child.stdout.on('data',b=>{out+=b;process.stdout.write(b);});child.stderr.on('data',b=>process.stderr.write(b));child.on('error',fail);child.on('exit',code=>code===0?ok(out):fail(new Error(`CLI exit ${code}`)));
 });
 const summary=JSON.parse(stdout.trim().split(/\r?\n/).at(-1)),resultPath=resolve(summary.report,'../exploration/result.json');
 const result=JSON.parse(await readFile(resultPath,'utf8'));
 assert.equal(result.goalText,c.goal);assert.equal(result.objectiveSuccess,null);assert.equal(result.fake,false);assert.deepEqual(result.settings.goalChecks,checks);
 results.push({...result,repeat:run.repeat});manifest.cases.push({...run,resultPath,reason:result.reason,actionCount:result.actionCount,completionAudit:result.completionAudit});await save();
}
assert.deepEqual(await hashes(),manifest.sourceHashes);manifest.finishedAt=new Date().toISOString();manifest.codeUnchanged=true;await save();await report(root,results);
console.log(JSON.stringify({report:join(root,'index.html'),cases:manifest.cases.map(({id,repeat,reason,actionCount})=>({id,repeat,reason,actionCount}))}));
