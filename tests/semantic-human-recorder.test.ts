import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {main} from '../runner/virtual-beta.js';
const run=promisify(execFile);
test('same-fixture human recorder smoke captures trusted operations but remains excluded as automation',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'semantic-human-')),out=join(dir,'model-mock');
 const result=await main(['--semantic','--mock','--ui','reference','--conditions','semantic-capability','--config','experiments/virtual-beta/semantic-capability.json','--charter','experiments/persona/charter-semantic.json','--out',out,'--max-total-api','8']);
 const target=result!.results[0],humanDir=join(dir,'human-smoke');
 await run(process.execPath,['--import','tsx','runner/persona-human.ts','--smoke','--compare-to',join(out,target.runId),'--out',humanDir],{timeout:60000,maxBuffer:1024*1024});
 const r=JSON.parse(await readFile(join(humanDir,'human-result.json'),'utf8'));
 assert.equal(r.actor,'automation');assert.equal(r.selfAttested,false);assert.equal(r.objectiveSuccess,true);assert.equal(r.recorderReady,true);assert.deepEqual(r.recordingErrors,[]);assert.equal(r.clickCount,2);assert.equal(r.comparisonAudit.status,'UNVERIFIED_ACTOR');assert.equal(r.comparisonAudit.conditionsMatch,false);
 assert.deepEqual(r.semantic.fixture,target.semantic!.trial.fixture);assert.equal(r.semantic.definitionHash,target.semantic!.definitionHash);assert.equal(r.semantic.sourceHash,target.code!.sourceHash);assert.equal(r.semantic.initialProductImageSha256,target.semantic!.initialProductImage.sha256,'Native screenshot matches unnumbered model-side initial product screenshot');
});
