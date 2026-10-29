import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';

import {evaluateOpenAIDecisionsRequest,buildDecisionsRequest} from '../runner/openai-decisions-evaluator.js';
import {createSampler} from '../jev/virtual-beta/selection.js';
import {runProviderComparison,providerSchedule} from '../runner/provider-comparison.js';
import {analyzeProviderComparison} from '../runner/provider-comparison-analysis.js';
import {PhaseBudget} from '../runner/virtual-beta-budget.js';
const root='reports/provider-comparison-2026-10-29/independent-preflight';
const sha=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
const req={input:{goal:'Local fictional test',observation:{image:'current'},userState:{memory:[{image:'memory-1'},{image:'memory-2'}]}},questions:{nextAction:{type:'choice' as const,instructions:'Original instructions',criteria:{done:'Done',stuck:'Stuck'}}},images:{current:{mediaType:'image/png' as const,data:'YQ=='},'memory-1':{mediaType:'image/png' as const,data:'Yg=='},'memory-2':{mediaType:'image/png' as const,data:'Yw=='}},timeoutMs:100};

test('independent: converter preserves all image IDs, order and exact payload with no extra source fields',()=>{
 const body=buildDecisionsRequest({...req,audit:{oracle:'PRIVATE_ORACLE'},dom:'PRIVATE_DOM'} as any);
 assert.deepEqual(body.input[0].content[0],{type:'input_json',data:req.input});
 assert.deepEqual(body.questions,[{name:'nextAction',type:'choice',instructions:'Original instructions',choices:[{value:'done',description:'Done'},{value:'stuck',description:'Stuck'}]}]);
 assert.deepEqual(body.input[0].content.slice(1),Object.entries(req.images).flatMap(([id,x])=>[{type:'input_text',text:'Image asset ID: '+JSON.stringify(id)},{type:'input_image',image_url:'data:'+x.mediaType+';base64,'+x.data,detail:'original'}]));
 assert.doesNotMatch(JSON.stringify(body),/PRIVATE_ORACLE|PRIVATE_DOM/);
});

test('independent: normalized Decisions probabilities drive sampler even when provider choice disagrees',async t=>{
 const old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='INDEPENDENT_FAKE_ONLY';t.after(()=>{if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;});
 t.mock.method(globalThis,'fetch',async()=>Response.json({model:'gpt-6-luna',answers:[{name:'nextAction',type:'choice',choice:'done',confidence:0.1,probabilities:[{value:'done',probability:0.1},{value:'stuck',probability:0.9}]}]}));
 const answer=(await evaluateOpenAIDecisionsRequest(req)).answers.nextAction;
 const result=createSampler({mode:'argmax',seed:20261028}).select(answer.choice,answer.probabilities,{done:{label:'Done',action:{type:'done'}},stuck:{label:'Stuck',action:{type:'stuck'}}} as any);
 assert.equal(result.modelChoice,'done');assert.equal(result.selected,'stuck');assert.deepEqual(result.raw,{done:0.1,stuck:0.9});
});

test('independent: masked post-HTTP settlement fault stops batch before another pair and retains charged requests',async t=>{
 await mkdir(root,{recursive:true});const dir=await mkdtemp(resolve(root,'masked-accounting-'));
 const protectedFile=join(dir,'protected.txt');await writeFile(protectedFile,'fixed');const prior=join(dir,'prior.json');await writeFile(prior,JSON.stringify({count:1,files:[{path:protectedFile,sha256:sha('fixed')}]}));
 const old={jev:process.env.AI_GATEWAY_API_KEY,openai:process.env.OPENAI_API_KEY};process.env.AI_GATEWAY_API_KEY='INDEPENDENT_FAKE_ONLY';process.env.OPENAI_API_KEY='INDEPENDENT_FAKE_ONLY';
 t.after(()=>{for(const [key,value]of [['AI_GATEWAY_API_KEY',old.jev],['OPENAI_API_KEY',old.openai]]as const)if(value===undefined)delete process.env[key];else process.env[key]=value;});
 t.mock.method(process,'loadEnvFile',()=>{});
 const realSettle=PhaseBudget.prototype.settle,realClose=PhaseBudget.prototype.close;let chargedFaults=0;
 t.mock.method(PhaseBudget.prototype,'settle',async function(this:PhaseBudget,...args:Parameters<PhaseBudget['settle']>){if(this.snapshot().phase.includes('openai-decisions')&&args[1]==='OK'){chargedFaults++;throw Error('PRIVATE_SETTLEMENT_FAULT');}return realSettle.apply(this,args);});
 t.mock.method(PhaseBudget.prototype,'close',async function(this:PhaseBudget){const failed=this.snapshot().phase.includes('openai-decisions');await realClose.call(this);if(failed)throw Error('PRIVATE_FINALIZER_MASK');});
 const calls:string[]=[];
 t.mock.method(globalThis,'fetch',async(url:any,init:any)=>{
  const openai=String(url)==='https://api.openai.com/v1/decisions';assert.ok(openai||String(url)==='https://ai-gateway.vercel.sh/typesafe/v1/systemone');calls.push(openai?'openai-decisions':'jev');const b=JSON.parse(init.body);
  const questionEntries=openai?b.questions.map((q:any)=>[q.name,{criteria:Object.fromEntries(q.choices.map((c:any)=>[c.value,c.description]))}]):Object.entries(b.questions);
  const answers=questionEntries.map(([id,q]:[string,any])=>{const keys=Object.keys(q.criteria),want=id==='nextAction'?'done':id==='decisionBasis'?'goal':id==='knowledge'?'insufficient':id==='goal'?'uncertain':id.startsWith('effect_')?'unknown':'none',choice=keys.includes(want)?want:keys.includes('uncertain')?'uncertain':keys.includes('unknown')?'unknown':keys[0],probabilities=keys.map(value=>({value,probability:Number(value===choice)}));return openai?{name:id,type:'choice',choice,confidence:1,probabilities}:[id,{choice,probabilities:Object.fromEntries(probabilities.map(p=>[p.value,p.probability]))}];});
  return Response.json({model:openai?'gpt-6-luna':'jev-1.14.0',answers:openai?answers:Object.fromEntries(answers)});
 });
 const out=join(dir,'batch'),result=await runProviderComparison({out,mock:false,envFile:'E:/ChatGPT/Ux_test/.env',priorSnapshot:prior});
 assert.equal(chargedFaults,1);assert.equal(result.status,'BUDGET_ACCOUNTING_FAILURE');assert.equal(result.trials,2);assert.equal(calls.length,3);assert.equal(result.requests,3);
 const m=JSON.parse(await readFile(join(out,'manifest.json'),'utf8'));assert.equal(m.records.length,2);const failed=m.records.find((r:any)=>r.provider==='openai-decisions');assert.equal(failed.requests,1);assert.equal(failed.ledgerEvidence.reserved,1);assert.equal(failed.result.apiCalls,1);assert.equal(failed.result.termination,'API_ERROR');assert.equal(failed.result.validForComparison,false);assert.equal(failed.result.steps[0].error.code,'BUDGET_SETTLEMENT_AFTER_REQUEST');assert.equal(m.preservationAfter.unchanged,true);assert.doesNotMatch(JSON.stringify(m),/PRIVATE_SETTLEMENT_FAULT|PRIVATE_FINALIZER_MASK/);
 const summary=JSON.parse(await readFile(join(out,'summary.json'),'utf8'));assert.equal(summary.completeness.planned,24);assert.equal(summary.providers['openai-decisions'].totals.objectiveSuccesses,0);
});


test('independent: charged reservation without HTTP does not count as API reach or attempted request',()=>{
 const slot=providerSchedule()[0];
 const record={...slot,provider:'openai-decisions' as const,runId:'charged-only',status:'FAILED' as const,dir:'unused',ledger:'unused',resultPath:'unused',requests:1,initialImageSha256:null,result:{apiCalls:0,steps:[],apiMs:0} as any,ledgerEvidence:{used:1,reserved:1,ok:0,errors:0,sha256:'x'}};
 const report=analyzeProviderComparison([record]);
 assert.equal(report.providers['openai-decisions'].measurements.apiReachedRuns,0);
 assert.equal(report.pairs[0].providers['openai-decisions']?.requestAttempted,false);
});


