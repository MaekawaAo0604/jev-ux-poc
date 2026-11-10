import {chromium} from 'playwright';
import {AutoPage} from '../../pages/AutoPage.js';
import {candidatesFor} from '../../jev/types.js';
import {PNG} from 'pngjs';
import {mkdir,writeFile} from 'node:fs/promises';
const dir='reports/modal-numbering-diagnostic';await mkdir(dir,{recursive:true});
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:640,height:480}});
 await page.setContent('<dialog style="position:fixed;inset:0;margin:0;width:100vw;height:100vh;max-width:none;max-height:none;box-sizing:border-box;background:white"><a style="display:inline-block;margin:80px" href="#a">Alpha</a></dialog><script>document.querySelector("dialog").showModal()</script>');
 const pom=new AutoPage(page),screen=await pom.observe(false);
 const state=()=>page.evaluate(()=>({html:document.documentElement.outerHTML,focus:document.activeElement?.outerHTML,focusVisible:document.activeElement?.matches(':focus-visible'),box:document.querySelector('a')!.getBoundingClientRect().toJSON()}));
 const initial=await state(),before=await page.screenshot({path:`${dir}/before.png`}),control=await page.screenshot();
 const captured=await pom.captureDecisionScreenshot(screen,candidatesFor(screen,false));await writeFile(`${dir}/numbered.png`,captured.bytes);
 const after=await page.screenshot({path:`${dir}/after.png`}),a=PNG.sync.read(before),b=PNG.sync.read(after);
 let x0=640,y0=480,x1=0,y1=0,n=0;
 for(let y=0;y<a.height;y++)for(let x=0;x<a.width;x++){const i=(y*a.width+x)*4;if(a.data.subarray(i,i+4).equals(b.data.subarray(i,i+4)))continue;n++;x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
 await page.evaluate(()=>new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r()))));
 const after2=await page.screenshot();
 console.log(JSON.stringify({initial,after:await state(),unmodifiedConsecutiveEqual:before.equals(control),after2Equal:before.equals(after2),pixelBefore:[...a.data.subarray((97*640+99)*4,(97*640+99)*4+4)],pixelAfter:[...b.data.subarray((97*640+99)*4,(97*640+99)*4+4)],diff:{n,x0,y0,x1,y1},targets:captured.targets}));
}finally{await browser.close();}
