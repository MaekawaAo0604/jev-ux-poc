import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {report} from '../../runner/report.js';

// Regenerate only the view, without API calls or changing original result data.
const root=resolve(process.argv[2]),file=join(root,'exploration/result.json');
const bytes=await readFile(file),result=JSON.parse(bytes.toString('utf8'));
assert.equal(result.settings.observationMode,'image-only');
assert.equal(result.completionAudit.status,'NOT_RUN');
await report(root,[result]);
assert.deepEqual(await readFile(file),bytes);
console.log(JSON.stringify({report:join(root,'index.html'),sourceSha256:createHash('sha256').update(bytes).digest('hex'),reason:result.reason,actions:result.actionCount,explorationMs:result.elapsedMs,visualAudit:{status:result.visualCompletionAudit?.status,assessment:result.visualCompletionAudit?.assessment,elapsedMs:result.visualCompletionAudit?.elapsedMs,error:result.visualCompletionAudit?.error}}));
