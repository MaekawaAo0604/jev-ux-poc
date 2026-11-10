import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('merging master does not automatically deploy Pages; existing feature and manual publication remain',()=>{
 const workflow=readFileSync(new URL('../.github/workflows/public-pages.yml',import.meta.url),'utf8');
 const push=workflow.match(/^  push:\s*\n([\s\S]*?)(?=^  \w|^\S)/m)?.[1];
 assert.ok(push,'push trigger must be explicit');
 const branches=push.match(/branches:\s*\[([^\]]+)\]/)?.[1].split(',').map(x=>x.trim());
 assert.deepEqual(branches,['fix/sufficiency-voting']);
 assert.match(workflow,/^  workflow_dispatch:\s*$/m);
});
