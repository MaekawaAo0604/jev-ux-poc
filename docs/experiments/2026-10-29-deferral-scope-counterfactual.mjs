import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {createSampler,replaySelection} from '../../jev/virtual-beta/selection.ts';
import {reconstructReplayCandidates} from '../../runner/virtual-beta-replay-candidates.ts';
const root=process.argv[2]??'reports/deferral-grounding-2026-10-29/live';
const output=process.argv[3]??'reports/notification-switch-2026-10-29/archived-counterfactual.json';
const sha=v=>createHash('sha256').update(v).digest('hex');
const cases=[];
for(const id of ['notifications-r1-old','notifications-r1-reason','notifications-r2-reason']){
 const path=root+'/'+id+'/exploration/result.json',bytes=await readFile(path),result=JSON.parse(bytes.toString());
 const step=result.steps.at(-1),record=step.selection;
 assert.equal(result.termination,'STUCK');assert.equal(record.selected,'stuck');assert.equal(record.modelChoice,'e2');
 const candidates=reconstructReplayCandidates(step.audit.screen,Object.keys(record.raw));
 assert.deepEqual(replaySelection(record,candidates),record);
 const sampler=createSampler({mode:record.mode,seed:record.seed});
 for(let index=0;index<record.drawIndex;index++)sampler.select(record.modelChoice,record.raw,candidates);
 const conditional=sampler.select(record.modelChoice,record.raw,candidates,Object.fromEntries(record.adjustments.map(a=>[a.candidate,a.reason])),record.policy.weights,'ui-conditional');
 assert.equal(conditional.policy.scope.baselineSelected,'e2');assert.equal(conditional.policy.scope.baselineClass,'ui');
 assert.ok(['click','back','scroll'].includes(candidates[conditional.selected].action.type));
 assert.equal(conditional.policy.scope.marginal.stuck,record.policy.before.stuck);
 assert.deepEqual(replaySelection(conditional,candidates),conditional);
 assert.equal(sha(await readFile(path)),sha(bytes));
 cases.push({id,path,sourceSha256:sha(bytes),step:step.number,modelChoice:record.modelChoice,raw:record.raw,weights:record.policy.weights,legacySelected:record.selected,conditionalSelected:conditional.selected,conditionalAction:candidates[conditional.selected].action,conditionalRecord:conditional,archivedSourceUnchanged:true});
}
const report={schemaVersion:1,kind:'offline-one-step-policy-counterfactual',APIRequests:0,savedInputsResent:false,cases,limitations:['Only selection arithmetic is replayed; no model or UI operation is reexecuted.','A corrected nonterminal choice does not establish eventual task success or human fidelity.','Archived traces remain under their original producer revisions; this script tests a new policy on their saved distributions.']};
await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({output,cases:cases.map(c=>({id:c.id,old:c.legacySelected,new:c.conditionalSelected}))}));
