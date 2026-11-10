import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {humanJevProfile} from '../runner/human-jev-profiles.js';
import {validateContinuityOptions,runContinuityComparison,analyzeContinuityRecords} from '../runner/condition-continuity-comparison.js';
import {replayDirectory} from '../runner/virtual-beta-replay.js';
const actors=['experience-visual-conditions-retention','experience-visual-conditions-checks'] as const;
test('explicit common runtime override changes only elapsed-time limit and leaves legacy defaults intact',()=>{
 for(const mode of actors){const original=humanJevProfile(mode),expected=structuredClone(original);expected.config.maxRunMs=300000;assert.deepEqual((humanJevProfile as any)(mode,300000),expected);assert.equal(humanJevProfile(mode).config.maxRunMs,180000);for(const value of [0,300001,1.5,NaN,'300000',null])assert.throws(()=>(humanJevProfile as any)(mode,value));}
});
test('comparison runtime accepts only explicit 180s or 300s and keeps request/operation bounds',()=>{
 const base={out:'reports/runtime-invalid',mock:true,priorSnapshot:resolve('reports/prior.json'),checks:true};
 for(const trialMs of [0,179999,180001,299999,300001,NaN,Infinity,'300000',null])assert.throws(()=>validateContinuityOptions({...base,trialMs} as any));
 for(const trialMs of [180000,300000])validateContinuityOptions({...base,trialMs} as any);
});
test('fresh 300s mock pair carries effective config through wrapper, manifest, analysis and replay without environment access',async()=>{
 const root='reports/visual-action-checks-2026-10-30/parent/runtime-'+Date.now();await mkdir(root,{recursive:true});const prior=resolve(root,'prior.json');await writeFile(prior,JSON.stringify({count:0,files:[]}));const load=process.loadEnvFile;let envReads=0;(process as any).loadEnvFile=()=>{envReads++;throw Error('MOCK_ENV_READ');};
 try{const out=root+'/pair',saved=await runContinuityComparison({out,mock:true,checks:true,trialMs:300000,priorSnapshot:prior,limit:2} as any);assert.equal(saved.requests,0);assert.equal(saved.status,'INCOMPLETE');const m=JSON.parse(await readFile(out+'/manifest.json','utf8')),s=JSON.parse(await readFile(out+'/summary.json','utf8'));assert.equal(m.limits.maxTrialMs,300000);assert.equal(m.limits.phaseMs,1260000);assert.equal(m.executionMaximumRequests,144);assert.equal(m.limits.maxRequestsPerTrial,36);assert.equal(m.limits.maxJudgments,12);assert.equal(m.limits.maxUIActions,15);assert.equal(m.limits.maxLooks,3);assert.equal(m.limits.parallel,1);assert.equal(m.limits.retry,0);for(const mode of actors)assert.equal(m.profiles[mode].config.maxRunMs,300000);assert.equal(s.valid,2);assert.equal(s.invalid,0);assert.equal(s.notAttempted,2);assert.equal(s.pairs[0].matched,true);assert.deepEqual((analyzeContinuityRecords as any)(m.records,true,false,true,300000),s);assert.equal(analyzeContinuityRecords(m.records,true,false,true).valid,0,'300s records cannot be passed as default 180s runs');for(const r of m.records){assert.equal(r.result.config.maxRunMs,300000);assert.equal(r.result.config.maxAPICalls,36);assert.equal(r.result.steps[0].conditionContinuity.before.entries.length,0);assert.equal((await replayDirectory(r.dir+'/exploration')).verified,true);}assert.equal(envReads,0);}finally{process.loadEnvFile=load;}
});
