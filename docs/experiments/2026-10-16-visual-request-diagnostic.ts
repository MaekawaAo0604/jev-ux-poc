// Replays one saved decision input only. No browser operations, credentials or
// raw provider messages are logged. The original exploration remains unchanged.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {VisualDecisionContext} from '../../jev/visual-context.js';
import {jevDecide} from '../../jev/decide.js';
const root=resolve(process.argv[2]),step=Number(process.argv[3]);
if(!Number.isSafeInteger(step)||step<1)throw new Error('Expected report directory and step');
const dir=join(root,'exploration'),saved=JSON.parse(await readFile(join(dir,`step-${step}.json`),'utf8'));
const image=await readFile(join(dir,`step-${step}.png`));
if(process.argv.includes('--dom-deduplicated')){
 const canonical=(text:string)=>text.normalize('NFKC').replace(/\s/g,'');
 const frames=new Map<number,any>();
 for(let n=1;n<=step;n++)frames.set(n,JSON.parse(await readFile(join(dir,`step-${n}.json`),'utf8')).state.screen);
 saved.visualContext.visualMemory=saved.visualContext.visualMemory.filter((note:any)=>{
  const screen=frames.get(note.source.step);
  return ![...(screen?.text??[]),...(screen?.elements??[]).map((e:any)=>e.text)].some(text=>canonical(text).includes(canonical(note.text)));
 });
}
try{process.loadEnvFile('.env');}catch{}
if(!process.env.AI_GATEWAY_API_KEY)throw new Error('Missing credentials');
let body:any;const original=globalThis.fetch;
const visual=new VisualDecisionContext({recognize:async()=>saved.visualContext.checks.map(({assessment,questionId,...line}:any)=>line),close:async()=>{}});
visual.capture(image,saved.visualContext.observations[0]);
(visual as any).memory=structuredClone(saved.visualContext.visualMemory);
try{
 globalThis.fetch=async(_url,init)=>{body=JSON.parse(String(init?.body));return new Response('',{status:400});};
 try{await jevDecide(saved.state,saved.candidates,{verifyCompletion:true,frontier:saved.frontier},(input,questions)=>visual.evaluate(input,questions,{maxAttempts:1,maxElapsedMs:30000}));}catch{}
}finally{globalThis.fetch=original;await visual.close();}
if(!body)throw new Error('No request reconstructed');
if(process.argv.includes('--inline')){
 const context=body.state.context;
 context.visualMemory=context.visualMemory.map((note:any)=>({...note,source:{...context.visualSources[note.source.reference],bbox:note.source.bbox}}));
 delete context.visualSources;
}
const representation=(body.state.context.visualSources?'pooled':'inline')+(process.argv.includes('--dom-deduplicated')?'-dom-deduplicated':'');
const known=['max_tokens_exceeded','invalid_request_error','context_length_exceeded','invalid_image','invalid_asset','too_many_questions','request_too_large'];
const results:any[]=[];
for(const variant of ['original','one-question']){
 const request=structuredClone(body);
 if(variant==='one-question')request.questions={nextAction:request.questions.nextAction};
 const started=performance.now();
 const response=await original('https://ai-gateway.vercel.sh/typesafe/v1/systemone',{method:'POST',headers:{Authorization:`Bearer ${process.env.AI_GATEWAY_API_KEY}`,'Content-Type':'application/json','TypeSafe-Danger-Zone-Images':'true'},body:JSON.stringify(request),signal:AbortSignal.timeout(30000)});
 const data=await response.json().catch(()=>null),serialized=JSON.stringify(data??{});
 const result={representation,variant,status:response.status,elapsedMs:performance.now()-started,questions:Object.keys(request.questions).length,stateBytes:Buffer.byteLength(JSON.stringify(request.state)),bodyBytes:Buffer.byteLength(JSON.stringify(request)),diagnosticCodes:known.filter(code=>serialized.includes(code)),errorTopics:['token','context','image','asset','question','length','limit'].filter(word=>!response.ok&&serialized.toLowerCase().includes(word)),...(response.ok?{model:data?.model,usage:data?.usage}:{} )};
 results.push(result);console.log(JSON.stringify(result));
}
await writeFile(join(root,`request-diagnostic-step-${step}-${representation}.json`),JSON.stringify(results,null,2));
