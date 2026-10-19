import {chromium} from 'playwright';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import assert from 'node:assert/strict';
import {PublicSitePage} from '../../pages/PublicSitePage.js';
import {candidatesFor} from '../../jev/types.js';
import {numberedScreenshot} from '../../pages/visual-numbering.js';
import {evaluateChoices} from '../../jev/client.js';
process.loadEnvFile('.env');
const dir=`reports/tight-menu-pair-${new Date().toISOString().replaceAll(':','-')}`;await mkdir(dir,{recursive:true});
const original=JSON.parse(await readFile('reports/2026-10-19T07-25-20.426Z-public/exploration/step-1.json','utf8'));
const questions=JSON.parse(await readFile('reports/cross-site-review-2026-10-19/number-association.json','utf8')).questions;
const oldSource=execFileSync('git',['show','b2b291e:pages/visual-numbering.ts'],{encoding:'utf8'}),js=ts.transpileModule(oldSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const old=(await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)).numberedScreenshot;
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},locale:'ja-JP'});
 await page.goto('https://www.7-zip.org/',{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);
 const pom=new PublicSitePage(page,undefined,undefined,true),screen=await pom.observe(false),candidates=candidatesFor(screen,false);
 for(const id of Object.keys(candidates))if(!Object.hasOwn(original.candidates,id))delete candidates[id];
 const targets=(await pom.captureDecisionScreenshot(screen,candidates)).targets.map(({id,x,y,width,height})=>({id,x,y,width,height}));
 assert.deepEqual(targets,original.visualTargets.map(({id,x,y,width,height}:any)=>({id,x,y,width,height})));
 const plain=await page.screenshot({path:`${dir}/plain.png`}),before=await old(page,targets,`${dir}/before.png`),after=await numberedScreenshot(page,targets,`${dir}/after.png`);
 assert.deepEqual(await page.screenshot(),plain);
 const digest=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
 const responses=[];
 for(let repeat=1;repeat<=3;repeat++)for(const [variant,capture] of [['before',before],['after',after]] as const){
  const response=await evaluateChoices({task:'保存された同一の現在画像で、表示文言と候補番号の対応を確認する。',screenshot:'current'},questions,{maxAttempts:2,maxElapsedMs:30000},{images:{current:{mediaType:'image/png',data:capture.bytes.toString('base64')}}});
  responses.push({repeat,variant,response});console.log(JSON.stringify({repeat,variant,answers:Object.fromEntries(Object.entries(response.answers).map(([k,v])=>[k,v.choice]))}));
  await writeFile(`${dir}/probe.json`,JSON.stringify({dir,hashes:{plain:digest(plain),before:digest(before.bytes),after:digest(after.bytes)},targets,before:before.targets,after:after.targets,questions,responses},null,2));
 }
 // Follow one selected number through production action binding, not a supplied route.
 const chosen=responses.find(r=>r.variant==='after')!.response.answers.faq.choice;
 assert.ok(candidates[chosen]);const action=candidates[chosen].action,draft=await pom.describeAction(action,1);await pom.act(action);
 await page.screenshot({path:`${dir}/selected-destination.png`});
 await writeFile(`${dir}/execution.json`,JSON.stringify({chosen,draft,urlAfter:page.url()},null,2));console.log(JSON.stringify({dir,chosen,urlAfter:page.url()}));
}finally{await browser.close();}
