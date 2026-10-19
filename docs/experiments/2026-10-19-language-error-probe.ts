import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
process.loadEnvFile('.env');
const root=resolve(process.argv[2]),data=JSON.parse(await readFile(join(root,'comparison.json'),'utf8'));
const language=process.argv.includes('--ja')?'ja':'en',single=process.argv.includes('--single');
const request=data.requests.find((r:any)=>r.language===language);
const questions=single?{image_check_1:request.questions.image_check_1}:request.questions;
const opaque=process.argv.includes('--opaque'),reference=opaque?'img_a8e43d715f2b4e64a79c0d86':'current';
const state=structuredClone(request.state);state.screenshot=reference;
for(const o of state.observations)o.screenshot=reference;
const frame=data.fixtures.find((f:any)=>f.step===request.step);
const bytes=await readFile(frame.sourceImage),key=process.env.AI_GATEWAY_API_KEY!;
const response=await fetch('https://ai-gateway.vercel.sh/typesafe/v1/systemone',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','TypeSafe-Danger-Zone-Images':'true'},
 body:JSON.stringify({model:data.model,state,questions,assets:{[reference]:{type:'image',format:'png',data_base64:bytes.toString('base64')}}}),signal:AbortSignal.timeout(30000)});
const body=(await response.text()).replaceAll(key,'[REDACTED]');
await writeFile(join(root,`validation-probe-${single?'single':'full'}-${language}${opaque?'-opaque':''}.json`),JSON.stringify({status:response.status,body:body.slice(0,12000)},null,2));
console.log(JSON.stringify({language,single,opaque,status:response.status,body:body.slice(0,1500)}));
