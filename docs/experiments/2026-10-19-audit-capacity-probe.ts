import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {recordSavedVisualCompletion,type VisualEvaluator} from '../../runner/visual-evidence.js';

process.loadEnvFile('.env');
const root=resolve('reports',`audit-capacity-${new Date().toISOString().replaceAll(':','-')}`);await mkdir(root,{recursive:true});
const source=resolve('reports/2026-10-19T12-27-16.233Z-public/exploration/result.json');
const bytes=await readFile(source),run=JSON.parse(bytes.toString());
const previous=JSON.parse(await readFile('reports/english-migration-2026-10-19T12-35-18.588Z/retrospective-audit.json','utf8')).visualCompletionAudit;
let captured:any;
const capture:VisualEvaluator=async(state,questions,images)=>{
 if('relevance' in questions){const screen=previous.screens.find((s:any)=>s.observationId===state.observations[0].id);assert.ok(screen);return {model:screen.model,answers:screen.answers};}
 captured={state,questions,assets:Object.fromEntries(Object.entries(images).map(([id,i])=>[id,{type:'image',format:'png',data_base64:i.data}]))};
 throw new Error('CAPTURE_ONLY');
};
await recordSavedVisualCompletion(run.goalText,run.steps[0].state.currentDate,run.dir,run.steps,capture,run.finalVisualObservation);assert.ok(captured);
const results:any[]=[];
for(const [name,count,allQuestions,longContext] of [['original',11,true,false],['one-question',11,false,false],['seven-images',7,true,false],['seven-one-question',7,false,false],['original-long-context',11,true,true]] as const){
 if(process.argv.includes('--original-only')&&name!=='original')continue;
 const state=structuredClone(captured.state);state.observations=state.observations.slice(0,count);
 const ids=new Set(state.observations.map((o:any)=>o.id)),refs=new Set(state.observations.map((o:any)=>o.screenshot));
 const questions=Object.fromEntries(Object.entries(captured.questions).filter(([id])=>id==='completion'||allQuestions&&ids.has(id.replace('evidence_',''))));
 const assets=Object.fromEntries(Object.entries(captured.assets).filter(([id])=>refs.has(id)));
 const body={model:'jev-1.14.0',state,questions,assets},started=performance.now();
 try{
  const response=await fetch('https://ai-gateway.vercel.sh/typesafe/v1/systemone',{method:'POST',headers:{Authorization:`Bearer ${process.env.AI_GATEWAY_API_KEY}`,'Content-Type':'application/json','TypeSafe-Danger-Zone-Images':'true',...(longContext?{'TypeSafe-Danger-Zone-Long-Context':'true'}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
  const raw=await response.json() as any;
  // Deliberately retain no raw error text, headers, credentials, or echoed inputs.
  const provider=raw.error??{},code=provider.code??provider.type;
  results.push({name,images:count,questions:Object.keys(questions).length,longContext,status:response.status,elapsedMs:performance.now()-started,bodyBytes:Buffer.byteLength(JSON.stringify(body)),
   errorCode:typeof code==='string'&&/^[a-z_]{1,80}$/.test(code)?code:undefined,
   errorKeys:Object.keys(provider),errorType:typeof provider.type==='string'?provider.type.replaceAll(process.env.AI_GATEWAY_API_KEY!,'[REDACTED]').slice(0,120):undefined,
   errorDiagnostic:!response.ok&&typeof provider.message==='string'?provider.message.replaceAll(process.env.AI_GATEWAY_API_KEY!,'[REDACTED]').replace(/[A-Za-z0-9+/=]{120,}/g,'[LONG_DATA]').slice(0,800):undefined,
   tokenLimitMessage:typeof provider.message==='string'&&/token|context/i.test(provider.message),usage:raw.usage,answers:raw.answers});
 }catch(e){results.push({name,status:'TRANSPORT_ERROR',errorName:e instanceof Error?e.name:'UNKNOWN'});}
 await writeFile(join(root,'probe.json'),JSON.stringify({source,sourceSha256:createHash('sha256').update(bytes).digest('hex'),results},null,2));
 console.log(JSON.stringify(results.at(-1)));
}
assert.deepEqual(await readFile(source),bytes);console.log(JSON.stringify({root}));
