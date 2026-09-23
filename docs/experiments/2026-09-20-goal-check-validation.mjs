// Saved-state checks, including removal controls. Reference labels never enter requests.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {assessGoal} from '../../jev/goal-status.ts';
import {safeRequestFailure} from '../../jev/client.ts';
const source='reports/goal-gate-probe-2026-09-20T11-24-54.270Z/probe.json';
const probe=JSON.parse(await readFile(source,'utf8'));
const full=probe.cases.find(c=>c.id==='highschool-complete').state;
const highschoolChecks=['制度の対象条件','利用できる店舗','時間帯'];
function without(pattern){
 const state=structuredClone(full);
 state.screen.text=state.screen.text.filter(t=>!pattern.test(t));
 // The production gate does not consume regions; don't leave stale debug evidence.
 state.screen.regions=state.screen.regions?.filter(r=>!pattern.test(r.text));
 for(const h of state.history){h.observedText=h.observedText?.filter(t=>!pattern.test(t));if(pattern.test(h.result))h.result='';}
 return state;
}
const cases=probe.cases.map(c=>({...c,checks:c.id.startsWith('highschool')?highschoolChecks:[c.state.goal],expectedComplete:c.expected==='satisfied'}));
cases.push(
 {id:'removed-eligibility',checks:highschoolChecks,state:without(/15歳|18歳|保護者がエニタイムメンバー/),expectedComplete:false},
 {id:'removed-store-rule',checks:highschoolChecks,state:without(/保護者の登録店舗/),expectedComplete:false},
 {id:'removed-time-rule',checks:highschoolChecks,state:without(/スタッフアワー|スタッフ受付時間/),expectedComplete:false},
 {id:'incomplete-checklist',checks:['制度の対象条件'],state:full,expectedComplete:false},
);
const root=resolve('reports',`goal-check-validation-${new Date().toISOString().replaceAll(':','-')}`);await mkdir(root,{recursive:true});
const result={source,repeats:2,modelInputsContainReferenceLabels:false,cases,results:[]};
const save=()=>writeFile(join(root,'validation.json'),JSON.stringify(result,null,2));
await save();process.loadEnvFile('.env');
for(let repeat=1;repeat<=2;repeat++)for(const c of cases){
 let assessment,error;
 try{assessment=await assessGoal(c.state,c.checks);}catch(e){error=safeRequestFailure(e);}
 const complete=assessment?.coverage.choice==='complete'&&assessment.checks.every(a=>a.choice==='present');
 const entry={id:c.id,repeat,expectedComplete:c.expectedComplete,complete,assessment,error};result.results.push(entry);await save();console.log(JSON.stringify(entry));
}
result.pass=result.results.every(r=>!r.error&&r.complete===r.expectedComplete);await save();console.log(JSON.stringify({report:join(root,'validation.json'),pass:result.pass}));
assert.ok(result.pass,'Saved-state validation failed; do not claim the gate is verified');
