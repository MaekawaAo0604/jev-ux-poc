// Live smoke test is gated on the complete, frozen-code saved-state validation.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const validation=JSON.parse(await readFile(process.argv[2],'utf8'));
if(!validation.pass){
 assert.ok(process.argv[3],'A transport-only failure requires a recorded one-shot follow-up');
 const recovery=JSON.parse(await readFile(process.argv[3],'utf8'));
 assert.equal(recovery.originalPath,process.argv[2]);assert.equal(recovery.pass,true);assert.equal(recovery.codeUnchanged,true);
 assert.deepEqual(recovery.sourceHashes,validation.sourceHashes);
 const failures=validation.results.filter(r=>r.error);
 assert.equal(recovery.results.length,failures.length);
 assert.ok(validation.results.every(r=>r.error?.code==='HTTP_ERROR'&&r.error.statusCode===503||!r.error&&r.complete===r.expectedComplete));
 assert.ok(failures.every(r=>recovery.results.some(f=>f.id===r.id&&f.repeat===r.repeat&&!f.error&&f.complete===r.expectedComplete)));
 console.log(`Offline: ${validation.results.length-failures.length} original judgments matched; ${failures.length} HTTP 503 failures remain recorded, with one-shot follow-ups matching.`);
}
assert.equal(validation.codeUnchanged,true);
assert.equal(validation.results.length,20);
for(const [file,hash] of Object.entries(validation.sourceHashes))assert.equal(createHash('sha256').update(await readFile(join('jev',file))).digest('hex'),hash);
// Reuse the predeclared two highschool trials and one tour trial, same goals and limits.
await import('./2026-09-20-goal-check-live.mjs');
