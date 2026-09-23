// Replays saved observations only. Expected labels are never passed to Jev.
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {assessGoal,isGoalComplete} from '../../jev/goal-status.ts';
import {safeRequestFailure} from '../../jev/client.ts';
const source='reports/goal-check-validation-2026-09-20T11-35-17.953Z/validation.json';
const previous=JSON.parse(await readFile(source,'utf8'));
const all=process.argv.includes('--all');
const cases=previous.cases.filter(c=>all||['highschool-complete','removed-eligibility','removed-store-rule','removed-time-rule'].includes(c.id));
const repeats=all?2:1;
const root=resolve('reports',`grounded-${all?'validation':'probe'}-${new Date().toISOString().replaceAll(':','-')}`);await mkdir(root,{recursive:true});
const files=(await readdir('jev')).filter(f=>f.endsWith('.ts'));
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async f=>[f,createHash('sha256').update(await readFile(join('jev',f))).digest('hex')])));
const out={source,startedAt:new Date().toISOString(),repeats,plannedCases:cases.map(c=>({id:c.id,expectedComplete:c.expectedComplete})),sourceHashes:await hashes(),results:[]};
const save=()=>writeFile(join(root,'validation.json'),JSON.stringify(out,null,2));
await save();process.loadEnvFile('.env');
for(let repeat=1;repeat<=repeats;repeat++)for(const c of cases){
 assert.deepEqual(await hashes(),out.sourceHashes,'Do not modify inference code during the batch');
 let assessment,error;
 try{assessment=await assessGoal(c.state,c.checks);}catch(e){error=safeRequestFailure(e);assessment=e.goalAssessment;}
 const complete=!error&&!!assessment&&isGoalComplete(assessment);
 out.results.push({id:c.id,repeat,expectedComplete:c.expectedComplete,complete,assessment,error});await save();
 console.log(JSON.stringify({id:c.id,repeat,expectedComplete:c.expectedComplete,complete,error,checks:assessment?.grounding?.checks.map(c=>({text:c.text,direct:c.evidence.map(e=>e.text),related:c.relatedEvidence.map(e=>e.text),assessment:c.assessment?.choice}))}));
}
assert.deepEqual(await hashes(),out.sourceHashes);out.finishedAt=new Date().toISOString();out.codeUnchanged=true;out.pass=out.results.every(r=>!r.error&&r.complete===r.expectedComplete);await save();
console.log(JSON.stringify({report:join(root,'validation.json'),pass:out.pass}));
assert.ok(out.pass,'Grounded validation failed; do not proceed to live testing');
