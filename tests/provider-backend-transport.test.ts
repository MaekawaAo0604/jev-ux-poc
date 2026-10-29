import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {runProviderComparison} from '../runner/provider-comparison.js';
import {resolveDecisionBackend} from '../runner/decision-backend.js';

const choose=(id:string,q:any)=>{
 const keys=q.criteria?Object.keys(q.criteria):q.choices.map((x:any)=>x.value);
 const wanted=id==='nextAction'?'done':id==='decisionBasis'?'goal':id==='knowledge'?'insufficient':id==='goal'?'uncertain':id.startsWith('effect_')?'unknown':'none';
 return keys.includes(wanted)?wanted:keys.includes('uncertain')?'uncertain':keys.includes('unknown')?'unknown':keys[0];
};

test('backend is an explicit local option and rejects undocumented model/provider names',()=>{
 assert.equal(resolveDecisionBackend(),'jev');assert.equal(resolveDecisionBackend('openai-decisions'),'openai-decisions');for(const v of ['',null,'gpt-6-luna','random'])assert.throws(()=>resolveDecisionBackend(v));
});

test('actual parallel wrapper dispatches isolated providers, preserves first evidence, and stops after auth failure',async t=>{
 await mkdir('reports/provider-comparison-2026-10-29',{recursive:true});const dir=await mkdtemp(resolve('reports/provider-comparison-2026-10-29/transport-'));
 const priorFile=join(dir,'protected.txt');await writeFile(priorFile,'unchanged');const prior=join(dir,'prior.json');await writeFile(prior,JSON.stringify({count:1,files:[{path:priorFile,sha256:createHash('sha256').update('unchanged').digest('hex')}]}));
 const originals={jev:process.env.AI_GATEWAY_API_KEY,openai:process.env.OPENAI_API_KEY};process.env.AI_GATEWAY_API_KEY='FAKE_PROVIDER_TEST_ONLY';process.env.OPENAI_API_KEY='FAKE_PROVIDER_TEST_ONLY';
 t.after(()=>{for(const [key,value]of [['AI_GATEWAY_API_KEY',originals.jev],['OPENAI_API_KEY',originals.openai]]as const)if(value===undefined)delete process.env[key];else process.env[key]=value;});
 t.mock.method(process,'loadEnvFile',()=>{});const requests:{provider:string;body:any}[]=[];let active=0,maxActive=0,arrivals=0;let release!:()=>void;const both=new Promise<void>(r=>release=r);
 t.mock.method(globalThis,'fetch',async(url:any,init:any)=>{
  const provider=String(url).includes('api.openai.com')?'openai-decisions':'jev';assert.ok(['https://api.openai.com/v1/decisions','https://ai-gateway.vercel.sh/typesafe/v1/systemone'].includes(String(url)));
  const body=JSON.parse(init.body);requests.push({provider,body});active++;maxActive=Math.max(maxActive,active);arrivals++;if(arrivals===2)release();if(arrivals<=2)await both;
  try{
   if(provider==='openai-decisions')return new Response(JSON.stringify({error:{message:'DO_NOT_PERSIST_PROVIDER_SECRET'}}),{status:401});
   return new Response(JSON.stringify({model:'jev-1.14.0',answers:Object.fromEntries(Object.entries(body.questions).map(([id,q]:[string,any])=>{const c=choose(id,q);return[id,{choice:c,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,Number(k===c)]))}];}))}),{status:200});
  }finally{active--;}
 });
 const out=join(dir,'batch');const r=await runProviderComparison({out,mock:false,envFile:'E:/ChatGPT/Ux_test/.env',priorSnapshot:prior});
 assert.equal(r.status,'PROVIDER_UNAVAILABLE');assert.equal(r.trials,2);assert.equal(r.requests,3);assert.equal(maxActive,2);assert.equal(requests.filter(r=>r.provider==='openai-decisions').length,1);
 const jev=requests.find(r=>r.provider==='jev')!.body,openai=requests.find(r=>r.provider==='openai-decisions')!.body;
 assert.deepEqual(openai.input[0].content[0].data,jev.state);assert.deepEqual(openai.questions.map((q:any)=>({id:q.name,instructions:q.instructions,criteria:Object.fromEntries(q.choices.map((c:any)=>[c.value,c.description]))})),Object.entries(jev.questions).map(([id,q]:[string,any])=>({id,instructions:q.instructions,criteria:q.criteria})));
 const imageParts=openai.input[0].content.filter((p:any)=>p.type==='input_image');assert.equal(imageParts.length,Object.keys(jev.assets).length);assert.ok(imageParts[0].image_url.endsWith(jev.assets.current.data_base64));
 const m=JSON.parse(await readFile(join(out,'manifest.json'),'utf8'));assert.equal(m.records.length,2);assert.equal(m.preservationAfter.unchanged,true);assert.equal(m.records.find((x:any)=>x.provider==='openai-decisions').ledgerEvidence.errors,1);assert.equal(m.records.find((x:any)=>x.provider==='jev').ledgerEvidence.ok,2);
 assert.ok(!JSON.stringify(m).includes('DO_NOT_PERSIST_PROVIDER_SECRET'));const summary=JSON.parse(await readFile(join(out,'summary.json'),'utf8'));assert.equal(summary.completeness.planned,24);
});
