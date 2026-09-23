// Fresh autonomous production CLI runs. No expected facts or routes enter Jev input.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {report} from '../../runner/report.ts';
import {preflight} from './2026-09-22-preflight.mjs';
const plan=JSON.parse(await readFile('docs/experiments/2026-09-20-six-case-plan.json','utf8'));
const runs=[{id:'anytime-highschool',checks:['制度の対象条件','利用できる店舗','時間帯']},{id:'anytime-tour',checks:['施設を見学できるか','見学を申し込む方法']}];
const root=resolve('reports',`production-live-${new Date().toISOString().replaceAll(':','-')}`);await mkdir(root,{recursive:true});
const files=['package-lock.json',...(await Promise.all(['jev','pages','runner'].map(async dir=>(await readdir(dir)).filter(f=>f.endsWith('.ts')).map(f=>join(dir,f))))).flat()];
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async f=>[f,createHash('sha256').update(await readFile(f)).digest('hex')])));
const manifest={startedAt:new Date().toISOString(),sourceHashes:await hashes(),settings:{maxActions:24,intervalMs:3000,decisionMode:'goal-checks-experimental',ocr:false,freshContextPerRun:true},plannedRuns:runs,cases:[]};
const save=()=>writeFile(join(root,'validation.json'),JSON.stringify(manifest,null,2));await save();
process.loadEnvFile('.env');manifest.preflight=await preflight(runs.map(run=>plan.cases.find(c=>c.id===run.id).url));await save();
if(!manifest.preflight.ok){manifest.notRun=runs;await save();console.log(JSON.stringify({report:join(root,'validation.json'),preflight:manifest.preflight}));process.exit(1);}
const results=[];
for(const run of runs){
 assert.deepEqual(await hashes(),manifest.sourceHashes,'Production must remain frozen');
 const c=plan.cases.find(c=>c.id===run.id);
 console.log(`START ${run.id}`);
 const stdout=await new Promise((ok,fail)=>{
  const child=spawn(process.execPath,['--import','tsx','runner/public-site.ts',c.url,c.goal,'--reviewed','--max-actions','24','--interval-ms','3000',...run.checks.flatMap(check=>['--goal-check',check])],{stdio:['ignore','pipe','pipe'],windowsHide:true});
  let output='';child.stdout.on('data',b=>{output+=b;process.stdout.write(b);});
  // Production records sanitized failures. Do not print arbitrary exception payloads.
  child.stderr.on('data',()=>{});child.on('error',()=>fail(new Error('CLI_START_FAILED')));child.on('exit',code=>code===0?ok(output):fail(new Error(`CLI_EXIT_${code}`)));
 });
 const summary=JSON.parse(stdout.trim().split(/\r?\n/).at(-1)),resultPath=resolve(summary.report,'../exploration/result.json'),result=JSON.parse(await readFile(resultPath,'utf8'));
 assert.equal(result.goalText,c.goal);assert.equal(result.fake,false);assert.deepEqual(result.settings.goalChecks,run.checks);
 results.push(result);manifest.cases.push({...run,resultPath,reason:result.reason,actionCount:result.actionCount,completionAudit:result.completionAudit});await save();
}
assert.deepEqual(await hashes(),manifest.sourceHashes);manifest.finishedAt=new Date().toISOString();manifest.codeUnchanged=true;await save();await report(root,results);
console.log(JSON.stringify({report:join(root,'index.html'),cases:manifest.cases.map(({id,reason,actionCount})=>({id,reason,actionCount}))}));
