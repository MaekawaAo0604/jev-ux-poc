// Diagnostic only: original pixels, no site requests, no answers/routes in
// model text. Synthetic controls are separate from the real-site evidence.
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {ImageJudgmentMemory} from '../../jev/image-judgments.js';
import {evaluateChoices,safeRequestFailure} from '../../jev/client.js';

process.loadEnvFile('.env');
const source='reports/2026-10-19T10-13-03.265Z-public/exploration';
const root=resolve('reports',`password-visibility-audit-${new Date().toISOString().replaceAll(':','-')}`);await mkdir(root,{recursive:true});
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const files=(await readdir(source)).filter(f=>/^step-\d+\.json$/.test(f));
const steps=await Promise.all(files.map(async f=>JSON.parse(await readFile(join(source,f),'utf8'))));steps.sort((a,b)=>a.number-b.number);
assert.equal(steps.length,23);
const goal=steps[0].state.goal,date=steps[0].state.currentDate,memory=new ImageJudgmentMemory();memory.bind(goal);
const inputs:Record<string,{sha256:string;bytes:Buffer;steps:number[];file:string;synthetic:boolean;expectedPassword?:string}>= {};
const audit=steps.map(s=>{
 const text=[s.state.screen.text,...(s.state.screen.regions??[]).map((r:any)=>r.text),...(s.state.screen.elements??[]).map((e:any)=>e.text)].flat().filter(x=>typeof x==='string').join('\n');
 const matches=[...new Set(text.match(/.{0,65}(?:password|passphrase|forgot|パスワード).{0,110}/gi)??[])];
 const checks=s.visualContext.requests.flatMap((r:any)=>r.answers?.image_check_0?[r.answers]:[]).at(-1);
 return {step:s.number,url:s.url,file:join(source,s.screenshot),sha256:s.visualObservation.sha256,viewport:s.state.screen.viewport,offlineDOMPasswordMatches:matches,originalCurrentJudgments:checks?{password:checks.image_check_0.choice,repair:checks.image_check_1.choice}:null};
});
for(const frame of audit){
 const bytes=await readFile(frame.file);assert.equal(hash(bytes),frame.sha256);
 const prior=Object.values(inputs).find(x=>x.sha256===frame.sha256);
 if(prior){prior.steps.push(frame.step);continue;}
 inputs[`real-${frame.step}`]={sha256:frame.sha256,bytes,steps:[frame.step],file:frame.file,synthetic:false};
}

// A single local page, all networking blocked. These texts are hand-written
// test inputs, NOT collected site claims or expectations fed back to Jev.
const controls={
 answer:'<h1>7-Zip: forgotten password</h1><p>If you forget the archive password, 7-Zip has no built-in password reset or recovery feature.</p>',
 heading:'<h1>7-Zip: forgotten password</h1><p>Support information</p>',
 unrelated:'<h1>7-Zip: corrupted archive</h1><p>This page explains data errors or CRC errors in corrupted 7z archives.</p>',
};
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});await page.route('**/*',r=>r.abort());
 for(const [id,html] of Object.entries(controls)){
  await page.setContent(`<html lang="en"><style>body{font:14px Arial,sans-serif;padding:18px;color:#000;background:#fff}h1{font-size:20px}</style>${html}</html>`);
  const file=join(root,`synthetic-${id}.png`),bytes=await page.screenshot({path:file});
  inputs[`synthetic-${id}`]={sha256:hash(bytes),bytes,steps:[],file,synthetic:true,expectedPassword:id==='answer'?'observed':'not_shown'};
 }
}finally{await browser.close();}

const responses:any[]=[],requests:any[]=[];
const codeFiles=['jev/image-judgments.ts','jev/client.ts'],codeSha256=Object.fromEntries(await Promise.all(codeFiles.map(async file=>[file,hash(await readFile(file))])));
const checkpoint=async()=>writeFile(join(root,'audit.json'),JSON.stringify({source,root,goal,method:'Isolated current-image re-evaluation, not an exact replay of navigation requests. Offline DOM inspection is never model input. Control statements are synthetic, not website facts.',audit,inputs:Object.fromEntries(Object.entries(inputs).map(([id,{bytes,...meta}])=>[id,meta])),codeSha256,requests,responses},null,2));
await checkpoint();
for(const [id,frame] of Object.entries(inputs))for(let repeat=1;repeat<=(frame.synthetic?3:1);repeat++){
 const questions=memory.questions({id,step:frame.steps[0]??0,sha256:frame.sha256},[]);
 const state={goal,currentDate:date,observationMode:'image-only',screenshot:'current',observations:[{id,step:frame.steps[0]??0,sha256:frame.sha256,current:true,screenshot:'current'}]};
 // No DOM, extracted strings, expected answer, URL, prior verdict or route.
 assert.doesNotMatch(JSON.stringify(state),/offlineDOM|expectedPassword|https?:|regions|not_shown|observed/);
 requests.push({id,repeat,state,questions});
 try{
  const response=await evaluateChoices(state,questions,{maxAttempts:2,maxElapsedMs:30000,retryDelaysMs:[1000]},{images:{current:{mediaType:'image/png',data:frame.bytes.toString('base64')}}});
  responses.push({id,repeat,status:'RECORDED',response});
  console.log(JSON.stringify({id,repeat,password:response.answers.image_check_0.choice,repair:response.answers.image_check_1.choice}));
 }catch(error){const failure=safeRequestFailure(error);responses.push({id,repeat,status:'ERROR',failure});console.log(JSON.stringify({id,repeat,failure}));}
 await checkpoint();
}
for(const f of audit)assert.equal(hash(await readFile(f.file)),f.sha256,'original image changed');
console.log(JSON.stringify({root,realUniqueImages:Object.values(inputs).filter(x=>!x.synthetic).length,originalScreens:steps.length,offlineDOMMatches:audit.filter(f=>f.offlineDOMPasswordMatches.length).length,errors:responses.filter(r=>r.status==='ERROR').length,originalsUnchanged:true}));
