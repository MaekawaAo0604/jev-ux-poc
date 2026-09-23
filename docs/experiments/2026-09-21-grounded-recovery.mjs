// One follow-up per transport-only failure, with unchanged inference code.
// Original failures remain in their original file; no retry-until-pass loop.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {assessGoal,isGoalComplete} from '../../jev/goal-status.ts';
import {safeRequestFailure} from '../../jev/client.ts';
const originalPath=process.argv[2],original=JSON.parse(await readFile(originalPath,'utf8'));
assert.equal(original.codeUnchanged,true);
assert.ok(original.results.every(r=>r.error||r.complete===r.expectedComplete),'Do not retry model misclassifications');
const failed=original.results.filter(r=>r.error);assert.ok(failed.length>0&&failed.length<=2);
assert.ok(failed.every(r=>r.error.code==='HTTP_ERROR'&&r.error.statusCode===503));
const checkCode=async()=>{for(const [f,h] of Object.entries(original.sourceHashes))assert.equal(createHash('sha256').update(await readFile(join('jev',f))).digest('hex'),h);};
await checkCode();
const cases=JSON.parse(await readFile(original.source,'utf8')).cases;
const root=resolve('reports',`grounded-recovery-${new Date().toISOString().replaceAll(':','-')}`);await mkdir(root,{recursive:true});
const result={originalPath,sourceHashes:original.sourceHashes,startedAt:new Date().toISOString(),planned:failed.map(({id,repeat})=>({id,repeat})),results:[]};
const save=()=>writeFile(join(root,'validation.json'),JSON.stringify(result,null,2));await save();process.loadEnvFile('.env');
for(const entry of failed){
 const c=cases.find(c=>c.id===entry.id);let assessment,error;
 try{assessment=await assessGoal(c.state,c.checks);}catch(e){error=safeRequestFailure(e);assessment=e.goalAssessment;}
 const complete=!error&&!!assessment&&isGoalComplete(assessment);
 result.results.push({id:entry.id,repeat:entry.repeat,expectedComplete:entry.expectedComplete,complete,assessment,error});await save();
 console.log(JSON.stringify({id:entry.id,repeat:entry.repeat,complete,error,checks:assessment?.grounding?.checks.map(c=>({text:c.text,directCount:c.evidence.length,assessment:c.assessment?.choice}))}));
}
await checkCode();result.codeUnchanged=true;result.pass=result.results.every(r=>!r.error&&r.complete===r.expectedComplete);result.finishedAt=new Date().toISOString();await save();
console.log(JSON.stringify({report:join(root,'validation.json'),pass:result.pass}));assert.ok(result.pass,'Recovery failed: stop before live testing');
