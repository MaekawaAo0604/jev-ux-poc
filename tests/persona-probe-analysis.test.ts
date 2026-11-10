import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyzeProbes} from '../docs/experiments/persona-probe-analysis.js';
const spec={repeats:6,seed:20261026,analysis:{permutations:999,alpha:.05},ablations:[],scenes:[{id:'knowledge',options:[{id:'direct'},{id:'guided'}]}]};
const rows=(vary:boolean)=>['baseline','A','B','C'].flatMap(condition=>Array.from({length:6},(_,i)=>({scene:'knowledge',condition,repeat:i+1,reversed:i%2===1,status:'RECORDED',fake:false,model:'jev-1.14.0',semanticChoice:vary&&['A','C'].includes(condition)?'guided':'direct',semanticProbabilities:vary&&['A','C'].includes(condition)?{direct:0,guided:1}:{direct:1,guided:0},inputWithoutPersonaSha256:'state'+i,imageSha256:'image'+i,decision:{decisionReason:{kind:'model-reported-category',category:'goal',probabilities:{goal:1}}}})));
test('matched scene comparison detects semantic action differences and preserves identical-action null',()=>{
 const different=analyzeProbes(rows(true),spec).scenes[0];assert.equal(different.inferenceEligible,true);assert.ok(different.primary.p!<.01);assert.equal(different.primaryHolmP,different.primary.p);
 const same=analyzeProbes(rows(false),spec).scenes[0];assert.equal(same.primary.p,1);assert.equal(same.primary.effect,0);
});
test('fake, missing, mismatched scene and model drift never establish a persona effect',()=>{
 for(const change of [(r:any[])=>{r[0].fake=true;},(r:any[])=>{r.pop();},(r:any[])=>{r[0].imageSha256='different';},(r:any[])=>{r[0].model='different';}]){const r=rows(true);change(r);const scene=analyzeProbes(r,spec).scenes[0];assert.equal(scene.inferenceEligible,false);assert.equal(scene.primary,null);assert.equal(scene.primaryHolmP,null);}
});

test('ablation analysis never assigns a direction absent from the pre-execution plan',()=>{
 const ablationSpec={...spec,ablations:[{id:'C_no_caution',base:'C'}]};
 const all=rows(true);const extra=all.filter(r=>r.condition==='C').map(r=>({...r,condition:'C_no_caution',semanticChoice:'direct',semanticProbabilities:{direct:1,guided:0}}));
 const result=analyzeProbes([...all,...extra],ablationSpec).ablations[0];
 assert.equal(result.expectedAction,null);assert.equal(result.directionWasPrespecified,false);assert.equal(result.changedPairs,6);assert.equal(result.pairedExactTwoSidedP,null);
});
