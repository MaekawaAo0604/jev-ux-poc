import assert from 'node:assert/strict';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readFile,writeFile,access} from 'node:fs/promises';
import {chromium} from 'playwright';
const root=resolve(process.argv[2]);
const measured=JSON.parse(await readFile(join(root,'measurements.json'),'utf8'));
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(pathToFileURL(join(root,'index.html')).href);
 assert.equal(await page.locator('#reliability').count(),1);
 assert.equal(await page.locator('details.run').count(),measured.trials.length);
 assert.equal(await page.locator('.overview').count(),0);
 assert.match(await page.locator('#reliability').innerText(),/情報保持/);
 const broken=await page.evaluate(()=>[...document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')].filter(a=>!document.getElementById(a.hash.slice(1))).map(a=>a.hash));
 assert.deepEqual(broken,[]);
 const findings=await page.locator('#resolution-findings').count();
 let failuresExcluded=0;
 if(findings){
  const summary=JSON.parse(await readFile(join(root,'summary.json'),'utf8'));
  for(const trial of measured.trials.filter((t:any)=>t.middlewareFailures>0)){
   const saved=summary.find((r:any)=>r.variant===trial.scenario&&r.repeat===trial.repeat);
   assert.equal(saved?.measurement,'instrument','known reliability failures cannot appear as valid site UX');failuresExcluded++;
  }
 }
 const files=await page.locator('#reliability a, #resolution-findings a').evaluateAll(links=>links.map(a=>(a as HTMLAnchorElement).getAttribute('href')!).filter(href=>!href.startsWith('#')&&!/^https?:/.test(href)));
 for(const file of files)await access(resolve(root,file));
 await page.locator(findings?'#resolution-findings':'#reliability').scrollIntoViewIfNeeded();
 await page.screenshot({path:join(root,'reliability-desktop.png')});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:join(root,'reliability-mobile.png')});
 assert.deepEqual(errors,[]);
 const qa={trials:measured.trials.length,findingsSections:findings,failuresExcluded,brokenAnchors:broken.length,measurementLinks:files.length,pageErrors:errors.length,mobileOverflow:false};
 await writeFile(join(root,'report-qa.json'),JSON.stringify(qa,null,2));console.log(JSON.stringify(qa));
}finally{await browser.close();}
