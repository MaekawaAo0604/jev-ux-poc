/** Offline strict combination for the three recorded service-separated phases.
 * This does not replace or weaken reports/.../combine-continuation.ts (two-phase only).
 * No env file, model call, browser, or replayed model request is used here.
 */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {analyzeTransferRuns,verifyTransferFrames} from '../../runner/transfer-analysis.js';
import {transferSchedule,readTransferLedger} from '../../runner/transfer-evaluation.js';
import {sourceIdentity} from '../../runner/virtual-beta-source.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');process.chdir(root);
const base=join(root,'reports/transfer-evaluation-2026-10-29');
const sha=(v:Buffer|string)=>createHash('sha256').update(v).digest('hex');
const expectedFinalHash=process.argv[2],output=process.argv[3];
assert.match(expectedFinalHash??'',/^[a-f0-9]{64}$/,'Explicit final manifest SHA required');
assert.ok(output,'New output directory required');
const files=['live/manifest.json','continuation/manifest.json','continuation-final/manifest.json'];
const expected=['db9857b740a995ea208bd5f4e9111c493bc00851c31e9ea88255a7856e87cf93','df163bbfb4ac7d53e5c61ca72059fb4a2633f9a02bb082fe71b9a620f339fb4e',expectedFinalHash];
const inputs=await Promise.all(files.map(async(file,i)=>{const bytes=await readFile(join(base,file));assert.equal(sha(bytes),expected[i],file);return {file,sha256:sha(bytes),manifest:JSON.parse(bytes.toString('utf8'))};}));
const [original,interrupted,final]=inputs.map(i=>i.manifest);
assert.equal(original.status,'HTTP_402');assert.equal(interrupted.status,'HTTP_402');assert.equal(final.status,'COMPLETED');
assert.equal(original.records.length,13);assert.equal(interrupted.records.length,1);assert.equal(final.records.length,7);
assert.equal(original.totalRequests,92);assert.equal(interrupted.totalRequests,1);assert.ok(final.totalRequests<=168);
assert.equal(original.sourceHash,'8a5bc5c03daaf99df38795fd218dc5e19e0ed916d390620e602286955c6ee3d7');
assert.equal(original.revision,'73b1ff3603b84c0019332970590b1f0d1406dc91');
assert.deepEqual(original.schedule,transferSchedule());
for(const phase of [original,interrupted,final]){
 assert.equal(phase.mock,false);assert.equal(phase.model,'jev-1.14.0');
 for(const key of ['revision','sourceHash','sourceHashes','protocol','charterSha256','method','configSha256','schedule'])assert.deepEqual(phase[key],original[key],key);
 if(phase.orchestrator)assert.equal(sha(await readFile(phase.orchestrator.file)),phase.orchestrator.sha256);
}
assert.deepEqual(interrupted.continuationSchedule,original.schedule.slice(13));assert.deepEqual(final.continuationSchedule,original.schedule.slice(14));
const records=inputs.flatMap(i=>i.manifest.records);assert.equal(records.length,21);
assert.equal(new Set(records.map(r=>r.id)).size,21);assert.equal(new Set(records.map(r=>r.runId)).size,21);
const seen=new Set<string>(),before:Record<string,string>={};let charged=0,OK=0,ERROR=0,RESERVED=0;
for(const [i,record] of records.entries()){
 assert.deepEqual({id:record.id,kind:record.kind,fixture:record.fixture,replicate:record.replicate},original.schedule[i]);
 assert.equal(record.status,'RESULT');assert.deepEqual(JSON.parse(await readFile(record.resultPath,'utf8')),record.result);
 const ledger=await readTransferLedger(record.ledger);assert.equal(ledger.used,record.requests);assert.equal(ledger.used,record.result.apiCalls);
 const rawLedger=JSON.parse(await readFile(record.ledger,'utf8'));
 for(const entry of rawLedger.attempts){assert.ok(!seen.has(entry.id),'Reservation ID reused');seen.add(entry.id);}
 charged+=ledger.used;OK+=ledger.ok;ERROR+=ledger.errors;RESERVED+=ledger.reserved;
 assert.deepEqual(await verifyTransferFrames(record.result,join(record.dir,'exploration')),record.frameChecks);
 for(const path of [record.resultPath,record.ledger])before[path]=sha(await readFile(path));
}
assert.equal(charged,93+final.totalRequests);assert.ok(charged<=261);assert.equal(ERROR,2);assert.equal(RESERVED,0);assert.equal(OK+ERROR+RESERVED,charged);
const summary=analyzeTransferRuns(records);assert.equal(summary.integrity.ok,true);assert.equal(summary.completeness.complete,true);
assert.equal(summary.novel.attempted,18);assert.equal(summary.sentinel.attempted,3);assert.equal(summary.novel.infrastructure,2);assert.equal(summary.sentinel.infrastructure,0);
assert.deepEqual(summary.runs.filter(r=>r.categories.infrastructure).map(r=>r.id),['transfer-catalog-alpha-r2','transfer-catalog-beta-r2']);
for(const [path,digest] of Object.entries(before))assert.equal(sha(await readFile(path)),digest);
const analysis=await sourceIdentity(),out=resolve(output);await mkdir(out);
await writeFile(join(out,'summary.json'),JSON.stringify(summary,null,2)+'\n',{flag:'wx'});
const provenance={schemaVersion:1,kind:'OFFLINE_THREE_PHASE_COMBINATION_WITH_TWO_PRESERVED_INFRASTRUCTURE_FAILURES',producer:{revision:original.revision,sourceHash:original.sourceHash,protocol:original.protocol},analysis,inputs:inputs.map(({file,sha256,manifest})=>({file,sha256,status:manifest.status,attempted:manifest.records.length,requests:manifest.totalRequests})),requests:{charged,OK,ERROR,RESERVED},readOnlyInputs:before,APIRequests:0,UIReexecutions:0,twoPhaseChecker:'UNCHANGED_NOT_APPLICABLE_REQUIRES_ONLY_ONE_HTTP402',interpretation:'21 original slots attempted once across three service-separated phases. Two original HTTP402 slots retained and excluded from valid outcome denominator. Completion is coverage, not 21 valid successes, human fidelity, or loop-recovery evidence.'};
await writeFile(join(out,'provenance.json'),JSON.stringify(provenance,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({out,requests:provenance.requests,completeness:summary.completeness,novel:summary.novel,sentinel:summary.sentinel}));
