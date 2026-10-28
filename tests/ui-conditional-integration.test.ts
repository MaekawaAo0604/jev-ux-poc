import test from 'node:test';import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {runHumanJev} from '../runner/human-jev-experiment.js';import {replayDirectory} from '../runner/virtual-beta-replay.js';
test('UI-conditional scope prevents controller-induced stuck and retains a subsequent explicit done',async()=>{
 const root='reports/notification-switch-2026-10-29/integration-'+Date.now();await mkdir(root,{recursive:true});
 for(const condition of ['old','conditional'] as const){const failures:string[]=[];
 const saved=await runHumanJev({out:root+'/'+condition,mock:true,mode:condition==='old'?'experience-reason-grounded':'experience-reason-conditional',longContext:true},async req=>{
  const n=Number((req.input.observation as any).id.slice(1)),script=['','e4','e4','e2','scroll_down','e2','e4','e2','done'],choice=script[n]??'done';
  const special:Record<string,number>={back:.03,e1:.01,e2:.86,e3:.02,look_0:.02,look_1:.01,look_2:.01,stuck:.04};
  return {model:'MOCK_SCRIPTED_FIXTURE',answers:Object.fromEntries(Object.entries(req.questions).map(([id,q])=>{
   const c=id==='nextAction'?choice:id==='decisionBasis'?'goal':id==='knowledge'?'insufficient':id==='goal'?'unsatisfied':id==='goalEvidence'||id.startsWith('evidence_')||id==='experienceEvidence'?'o'+n:id.startsWith('effect_')?'neutral':id==='experienceProgress'?'neutral':id==='experienceExpectation'?'supported':id==='reasonCaptureCategory'?'unknown':id==='reasonCaptureEvidence'?'none':id.endsWith('Grounded')?'unknown':id.endsWith('Status')?'unknown':'none';
   if(!Object.hasOwn(q.criteria,c))failures.push(id+':'+c);
   return [id,{choice:c,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,id==='nextAction'&&n===7?(special[k]??0):Number(k===c)]))}];
  }))};
 });
 assert.deepEqual(failures,[]);const step=saved.result.steps[6];assert.equal(step.selection!.modelChoice,'e2');assert.equal(step.selection!.raw.e2,.86);assert.equal(step.selection!.policy!.weights.e2,.01);
 assert.equal(saved.result.objectiveAssessment.value,false,'No fixture goal success is invented');
 if(condition==='old'){assert.equal(step.selection!.selected,'stuck');assert.equal(saved.result.termination,'STUCK');}
 else{assert.equal(step.selection!.policy!.scope!.baselineSelected,'e2');assert.equal(step.selection!.policy!.scope!.baselineClass,'ui');assert.equal(step.selection!.policy!.scope!.marginal.stuck,.04);assert.equal(step.selection!.selected,'back');assert.equal(step.outcome,'UI_PERFORMED');assert.equal(step.action!.type,'back');assert.equal(saved.result.termination,'SUBJECTIVE_DONE');assert.equal(saved.result.steps[7].selection!.selected,'done');}
 const dir=root+'/'+condition+'/exploration';assert.equal((await replayDirectory(dir)).verified,true);
 if(condition==='conditional'){const path=dir+'/result.json',original=await readFile(path,'utf8');
  for(const change of [(r:any)=>{r.config.deferral.selectionScope='global';},(r:any)=>{r.steps[6].selection.policy.scope.baselineSelected='stuck';},(r:any)=>{r.steps[6].selection.policy.scope.uiCandidates.push('stuck');},(r:any)=>{r.steps[6].selection.policy.scope.marginal.stuck=.99;},(r:any)=>{r.steps[6].action={type:'stuck'};}]){const bad=JSON.parse(original);change(bad);await writeFile(path,JSON.stringify(bad));try{await assert.rejects(replayDirectory(dir));}finally{await writeFile(path,original);}}
 }
 }
});
