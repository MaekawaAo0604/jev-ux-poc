import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyzeRealPersonas} from '../docs/experiments/real-persona-analysis.js';
const spec={model:'jev-1.14.0',seed:42,repeats:{primary:8,confirmation:6,ablation:3,control:2},conditions:['baseline','A','B','C'],ablations:[{id:'A_kB',base:'A',knowledgeFrom:'B'},{id:'B_kA',base:'B',knowledgeFrom:'A'}],analysis:{permutations:999,alpha:.05,minEffect:.1},scenes:[{id:'two-factor'},{id:'passkeys'},{id:'control'}]};
function rows(diff=true):any[]{
 const out:any[]=[];
 for(const phase of ['primary','confirmation','ablation','control'] as const)
 for(const scene of phase==='control'?['control']:['two-factor','passkeys'])
 for(const condition of phase==='ablation'?['A_kB','B_kA']:spec.conditions)
 for(let repeat=1;repeat<=spec.repeats[phase];repeat++){
  const choice=diff&&condition==='A'&&phase!=='control'?'explanation':'setup';
  out.push({phase,scene,condition,repeat,status:'RECORDED',fake:false,model:'jev-1.14.0',semanticChoice:choice,semanticProbabilities:{[choice]:1},inputWithoutPersonaSha256:scene+'-state',imageSha256:scene+'-image',decision:{decisionReason:{kind:'model-reported-category',category:'goal',probabilities:{goal:1}}}});
 }
 return out;
}
test('a repeated hard-choice difference must pass primary and prespecified confirmation',()=>{const result=analyzeRealPersonas(rows(),spec);assert.equal(result.complete,true);assert.equal(result.qualifiedScenes.length,2);for(const s of result.scenes){assert.ok(s.primary.primaryHolmP<.05);assert.ok(s.confirmation.primaryHolmP<.05);assert.ok(s.primary.primary.effect>=.1);}assert.equal(result.humanValidityEstablished,false);assert.equal(result.fullExplorationEffectEstablished,false);});
test('identical actual choices never qualify even if reason/probability outputs differ',()=>{const data=rows(false);for(const r of data){r.semanticProbabilities=r.condition==='A'?{setup:.51,explanation:.49}:{setup:.99,explanation:.01};r.decision.decisionReason.category=r.condition==='A'?'clarity':'efficiency';}const result=analyzeRealPersonas(data,spec);assert.deepEqual(result.qualifiedScenes,[]);assert.ok(result.scenes.every((s:any)=>s.primary.primary.p===1));});
test('a discovery-only difference does not qualify',()=>{const data=rows();for(const r of data.filter(r=>r.phase==='confirmation')){r.semanticChoice='setup';r.semanticProbabilities={setup:1};}assert.deepEqual(analyzeRealPersonas(data,spec).qualifiedScenes,[]);});
for(const failure of ['missing','duplicate','fake','model','image','across-phase'] as const)test('incomplete or unmatched observations cannot establish an effect: '+failure,()=>{const data=rows();if(failure==='missing')data.pop();else if(failure==='duplicate')data[data.length-1]={...data[0]};else if(failure==='fake')data[0].fake=true;else if(failure==='model')data[0].model='different';else if(failure==='image')data[0].imageSha256='different';else for(const r of data.filter(r=>r.phase==='confirmation'&&r.scene==='two-factor'))r.inputWithoutPersonaSha256='changed-between-stages';assert.deepEqual(analyzeRealPersonas(data,spec).qualifiedScenes,[]);});

test('a uniformly wrong model cannot satisfy the prespecified fixed-model condition',()=>{const data=rows();for(const r of data)r.model='wrong-model';const result=analyzeRealPersonas(data,spec);assert.equal(result.complete,false);assert.ok(result.issues.includes('REQUESTED_MODEL_MISMATCH'));assert.deepEqual(result.qualifiedScenes,[]);});
test('omnibus redetection with reversed preferences must not be called the same preference replication',()=>{const data=rows();for(const r of data.filter(r=>r.phase==='confirmation')){r.semanticChoice=r.condition==='A'?'setup':'explanation';r.semanticProbabilities={[r.semanticChoice]:1};}const result=analyzeRealPersonas(data,spec);assert.ok(result.scenes.every((s:any)=>s.samePreferenceReplicationClaimPermitted===false));});
