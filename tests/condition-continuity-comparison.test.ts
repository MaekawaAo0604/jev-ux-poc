import test from 'node:test';
import assert from 'node:assert/strict';
import {continuitySchedule,compareContinuityInitial,validateContinuityOptions,analyzeContinuityRecords} from '../runner/condition-continuity-comparison.js';
test('eight fixed slots rotate actor order without adding switch controls or hidden repetitions',()=>{
 const s=continuitySchedule();assert.equal(s.length,8);assert.equal(new Set(s.map(x=>x.sequence)).size,8);
 for(const task of ['library','workshop'])for(const condition of ['changed','unchanged']){const pair=s.filter(x=>x.fixture.task===task&&x.fixture.condition===condition);assert.equal(pair.length,2);assert.equal(new Set(pair.map(x=>x.actor)).size,2);}
 assert.deepEqual(s.slice(0,2).map(x=>x.actor),['experience-visual-conditions-continuity','experience-visual-conditions']);
 assert.deepEqual(s.slice(2,4).map(x=>x.actor),['experience-visual-conditions','experience-visual-conditions-continuity']);
});
test('options reject mock env access, unlimited trials and implicit prior preservation',()=>{
 assert.throws(()=>validateContinuityOptions({out:'reports/example',mock:true,priorSnapshot:'relative'}));
 assert.throws(()=>validateContinuityOptions({out:'reports/example',mock:true,priorSnapshot:'C:/snapshot.json',envFile:'C:/external.env'}));
 for(const maxRequests of [0,289,NaN])assert.throws(()=>validateContinuityOptions({out:'reports/example',mock:true,priorSnapshot:'C:/snapshot.json',maxRequests}));
 for(const limit of [0,9,NaN])assert.throws(()=>validateContinuityOptions({out:'reports/example',mock:true,priorSnapshot:'C:/snapshot.json',limit}));
});
test('empty and missing trial evidence remains unattempted, never passing initial comparison',()=>{
 assert.equal(compareContinuityInitial([]).matched,false);
 const s=analyzeContinuityRecords([]);assert.equal(s.planned,8);assert.equal(s.attempted,0);assert.equal(s.notAttempted,8);assert.equal(s.valid,0);assert.equal(s.complete,false);
});

import {runContinuityComparison} from '../runner/condition-continuity-comparison.js';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
test('normal two-slot mock batch tracks initial pairing, bounded fresh state and zero environment access',async()=>{
 const root='reports/condition-continuity-2026-10-30/parent/mock-'+Date.now();await mkdir(root,{recursive:true});const marker=resolve(root,'preserved.txt');await writeFile(marker,'bounded mocked prior');
 const hash=createHash('sha256').update(await readFile(marker)).digest('hex'),prior=resolve(root,'prior.json');await writeFile(prior,JSON.stringify({count:1,files:[{path:marker,sha256:hash}]}));
 const load=process.loadEnvFile;let envReads=0;(process as any).loadEnvFile=()=>{envReads++;throw Error('MOCK_ENV_READ');};
 try{const saved=await runContinuityComparison({out:root+'/batch',mock:true,priorSnapshot:prior,limit:2});assert.equal(saved.status,'INCOMPLETE');assert.equal(saved.requests,0);const m=JSON.parse(await readFile(root+'/batch/manifest.json','utf8')),s=JSON.parse(await readFile(root+'/batch/summary.json','utf8'));assert.equal(m.mock,true);assert.equal(m.totalRequests,0);assert.equal(m.preservationAfter,true);assert.equal(s.kind,'MOCK_CONTINUITY_INTEGRATION_ONLY');assert.equal(s.measurements.chargedRequests,0);assert.equal(s.measurements.knownHTTPAttempts,0);assert.equal(s.measurements.knownHTTPReceipts,0);assert.equal(s.attempted,2);assert.equal(s.notAttempted,6);assert.equal(s.pairs[0].matched,true);const corrupt=structuredClone(m.records);delete corrupt[0].result.steps[0].visualHypotheses;assert.equal(compareContinuityInitial(corrupt).matched,false);const rejected=analyzeContinuityRecords(corrupt,true);assert.equal(rejected.integrity.ok,false);assert.equal(rejected.valid,1);assert.equal(new Set(m.records.map((r:any)=>r.runId)).size,2);assert.equal(m.records.find((r:any)=>r.actor==='experience-visual-conditions-continuity').result.steps[0].conditionContinuity.before.entries.length,0);assert.equal(envReads,0);assert.equal(createHash('sha256').update(await readFile(marker)).digest('hex'),hash);}finally{process.loadEnvFile=load;}
});

test('a charged reservation without response evidence remains unknown receipt and cannot become user failure',()=>{
 const slot=continuitySchedule()[0];const s=analyzeContinuityRecords([{...slot,runId:'reserved',status:'FAILED',dir:'reports/missing',ledger:'reports/missing-budget.json',resultPath:'reports/missing/result.json',requests:1,initialImageSha256:null,error:{code:'LEDGER_ACCOUNTING_UNAVAILABLE'},ledgerEvidence:{used:1,sha256:'a'.repeat(64),reserved:1,ok:0,errors:0}}]);
 assert.equal(s.measurements.chargedRequests,1);assert.equal(s.measurements.knownHTTPAttempts,0);assert.equal(s.measurements.knownHTTPReceipts,0);assert.equal(s.measurements.receiptUnconfirmedChargedRequests,1);assert.equal(s.measurements.httpAttemptCountsComplete,false);assert.equal(s.requestEvidence[0].apiReached,null);assert.equal(s.valid,0);assert.equal(s.notAttempted,7);assert.equal(s.actors['experience-visual-conditions'].totals.objectiveFailures,0);assert.equal(s.actors['experience-visual-conditions'].totals.abandoned,0);
});
