// Fixed input-format ablation. No browser, no reference facts in model inputs.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {evaluateChoices,safeRequestFailure} from '../../jev/client.ts';
const source='reports/goal-gate-probe-2026-09-20T11-24-54.270Z/probe.json';
const probe=JSON.parse(await readFile(source,'utf8'));
const variants=['recent-first','recent-unique','flat-unique'];
function transform(input,variant){
 const state=structuredClone(input);state.observations.reverse();
 if(variant==='recent-first')return state;
 const seen=new Set();
 state.observations=state.observations.map(o=>({...o,text:o.text.filter(t=>{
  // Keep identical text if its observation warnings differ.
  const key=JSON.stringify([t,o.warnings]);if(seen.has(key))return false;seen.add(key);return true;
 })})).filter(o=>o.text.length||o.omitted);
 if(variant==='recent-unique')return state;
 return {goal:state.goal,currentDate:state.currentDate,evidence:state.observations.flatMap(o=>o.text.map(text=>({text,warnings:o.warnings}))),omitted:state.observations.some(o=>o.omitted),operationResults:state.operationResults};
}
const root=resolve('reports',`goal-memory-ablation-${new Date().toISOString().replaceAll(':','-')}`);
await mkdir(root,{recursive:true});
const result={source,questions:probe.questions,variants,results:[]};
const save=()=>writeFile(join(root,'ablation.json'),JSON.stringify(result,null,2));
await save();process.loadEnvFile('.env');
for(const variant of variants)for(const c of probe.cases){
 const input=transform(c.input,variant);let output;
 try{output=await evaluateChoices(input,probe.questions);}catch(e){output={error:safeRequestFailure(e),request:e.request};}
 const entry={id:c.id,variant,expected:c.expected,input,output};result.results.push(entry);await save();
 console.log(JSON.stringify({id:c.id,variant,expected:c.expected,output}));
}
console.log(JSON.stringify({report:join(root,'ablation.json')}));
