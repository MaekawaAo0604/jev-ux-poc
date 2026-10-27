import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,readFile,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const exec=promisify(execFile);
test('manual recorder smoke captures actual browser events and is never a human trial',async()=>{
 const root=join(await mkdtemp(join(tmpdir(),'jev-human-recorder-')),'recording');
 await exec(process.execPath,['--import','tsx','runner/persona-human.ts','--smoke','--out',root],{timeout:60000});
 const result=JSON.parse(await readFile(join(root,'human-result.json'),'utf8'));
 assert.equal(result.actor,'automation');assert.equal(result.selfAttested,false);
 assert.equal(result.objectiveSuccess,true);assert.equal(result.recorderReady,true);
 assert.deepEqual(result.recordingErrors,[]);assert.equal(result.clickCount,3);
 assert.deepEqual(result.events.filter((e:any)=>e.action==='click').map((e:any)=>e.target.split('\n')[0]),['その他','お知らせの管理','メール通知を停止する']);
 assert.ok((await stat(join(root,'trace.zip'))).size>100);
 assert.equal((await readFile(join(root,'events.jsonl'),'utf8')).trim().split('\n').length,result.events.length);
});
