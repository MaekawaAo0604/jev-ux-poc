import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {recordSavedVisualCompletion} from '../../runner/visual-evidence.js';

process.loadEnvFile('.env');
const source=resolve('reports/2026-10-19T12-27-16.233Z-public/exploration/result.json'),bytes=await readFile(source),run=JSON.parse(bytes.toString());
const root=resolve('reports',`audit-recovery-${new Date().toISOString().replaceAll(':','-')}`);await mkdir(root,{recursive:true});
const requests:any[]=[],original=globalThis.fetch;
globalThis.fetch=async(url,init)=>{
 const body=JSON.parse(String(init?.body));
 const response=await original(url,init);
 requests.push({stage:body.questions.completion?'completion':'screen',longContext:new Headers(init?.headers).get('TypeSafe-Danger-Zone-Long-Context')==='true',
  imageCount:Object.keys(body.assets).length,questionCount:Object.keys(body.questions).length,bodySha256:createHash('sha256').update(String(init?.body)).digest('hex'),http:response.status});
 return response;
};
let audit;
try{audit=await recordSavedVisualCompletion(run.goalText,run.steps[0].state.currentDate,run.dir,run.steps,undefined,run.finalVisualObservation);}
finally{globalThis.fetch=original;}
const attempts=requests.filter(r=>r.stage==='completion');
assert.equal(audit.status,'RECORDED');assert.equal(audit.objectiveVerified,false);
assert.deepEqual(attempts.map(a=>[a.http,a.longContext]),[[400,false],[200,true]]);
assert.equal(attempts[0].bodySha256,attempts[1].bodySha256);
assert.equal(audit.requests.at(-1)?.request?.longContext,true);
assert.deepEqual(await readFile(source),bytes);
const evidence={source,sourceSha256:createHash('sha256').update(bytes).digest('hex'),goal:run.goalText,root,requests,audit,
 method:'Real production post-run visual audit on unchanged saved public screenshots. No public-site requests, no changed Goal, no removed images. Source exploration termination is unchanged.'};
await writeFile(join(root,'validation.json'),JSON.stringify(evidence,null,2));
console.log(JSON.stringify({root,status:audit.status,assessment:audit.assessment,attempts,unchangedSource:true}));
