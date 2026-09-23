// Saved-input diagnosis only: no browser, no production changes, no retry loops.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {experimental_evaluate as evaluate} from 'ai';
import {requestFor,parseDecision} from '../../jev/decide.ts';
import {safeRequestFailure} from '../../jev/client.ts';

process.loadEnvFile('.env');
if(!process.env.AI_GATEWAY_API_KEY)throw new Error('Gateway credentials unavailable');
const source='reports/2026-09-22T19-00-09.081Z-public/exploration/step-8.json';
const step=JSON.parse(await readFile(source,'utf8'));
const original=requestFor(step.state,step.candidates,'');
const compact=structuredClone(original.state);
delete compact.screen.regions;
for(const entry of compact.history)delete entry.observedRegions;
assert.deepEqual(compact.screen.text,original.state.screen.text);
assert.deepEqual(compact.screen.elements,original.state.screen.elements);
assert.deepEqual(compact.history.map(h=>h.observedText),original.state.history.map(h=>h.observedText));
const root=`reports/museum-api-probe-${new Date().toISOString().replaceAll(':','-')}`;
await mkdir(root,{recursive:true});
const cases=[
 {id:'tiny-control',state:{instruction:'Select ok.'},questions:{nextAction:{type:'choice',instructions:'Select ok.',criteria:{ok:'ok',no:'no'}}}},
 {id:'original-1',state:original.state,questions:original.questions},
 {id:'without-regions-1',state:compact,questions:original.questions},
 {id:'without-regions-2',state:compact,questions:original.questions},
 {id:'original-2',state:original.state,questions:original.questions},
];
const rows=[];
const recognizedCauses=error=>{
 const text=[error?.message,error?.responseBody,error?.cause?.message,error?.cause?.responseBody].filter(v=>typeof v==='string').join('\n');
 return Object.entries({contextLimit:/context.{0,40}(?:length|limit)|maximum.{0,30}tokens|token.{0,20}limit/i,
  optionLimit:/too many.{0,40}(?:options|criteria)|(?:options|criteria).{0,40}(?:exceed|maximum)/i,
  schema:/schema|validation|invalid request/i}).filter(([,pattern])=>pattern.test(text)).map(([name])=>name);
};
for(const sample of cases){
 const input=JSON.stringify({state:sample.state,questions:sample.questions});
 const row={id:sample.id,inputBytes:Buffer.byteLength(input),sha256:createHash('sha256').update(input).digest('hex'),startedAt:new Date().toISOString()};
 const started=performance.now();
 try{
  const response=await evaluate({model:process.env.JEV_GATEWAY_MODEL||'typesafe-ai/jev',state:sample.state,questions:sample.questions,maxRetries:0,abortSignal:AbortSignal.timeout(30000)});
  const candidates=sample.id==='tiny-control'?{ok:{action:{type:'done'}},no:{action:{type:'stuck'}}}:step.candidates;
  const decision=parseDecision({model:response.response.modelId,answers:response.answers},candidates);
  row.ok=true;row.choice=decision.choice;row.action=decision.action;
 }catch(error){row.ok=false;row.failure=safeRequestFailure(error);row.recognizedCauses=recognizedCauses(error);}
 row.elapsedMs=performance.now()-started;rows.push(row);
 await writeFile(`${root}/${sample.id}.json`,JSON.stringify(row,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify(row));
 if([401,402,403].includes(row.failure?.statusCode))break;
 if(sample!==cases.at(-1))await new Promise(resolve=>setTimeout(resolve,1000));
}
await writeFile(`${root}/diagnostics.json`,JSON.stringify({source,kind:'saved-input-diagnostic',maxRequests:5,retriesPerRequest:0,browserActions:0,productionChanged:false,rows},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({report:`${root}/diagnostics.json`,requests:rows.length}));
