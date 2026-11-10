import {chromium} from 'playwright';
import {readFile,writeFile,stat} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=resolve(process.argv[2]),file=join(root,'index.html'),html=await readFile(file,'utf8');
const missing:string[]=[];let checked=0;
for(const match of html.matchAll(/(?:href|src)="([^"]+)"/g)){
 const path=match[1].split('#')[0];if(!path||/^(?:https?:|data:)/.test(path))continue;
 checked++;try{await stat(resolve(dirname(file),decodeURIComponent(path)));}catch{missing.push(path);}
}
const browser=await chromium.launch();
try{
 const page=await browser.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(pathToFileURL(file).href);await page.locator('#direct-image-findings').waitFor();
 const sections=await page.locator('#direct-image-findings').count(),rows=await page.locator('#direct-image-findings tbody tr').count();
 await page.setViewportSize({width:1440,height:1000});await page.locator('#direct-image-findings').scrollIntoViewIfNeeded();
 await page.screenshot({path:join(root,'direct-image-desktop.png')});
 await page.setViewportSize({width:390,height:844});await page.locator('#direct-image-findings').scrollIntoViewIfNeeded();
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 await page.screenshot({path:join(root,'direct-image-mobile.png')});
 const result={checkedLocalLinks:checked,missing,sections,rows,pageErrors:errors,mobileOverflow:overflow};
 await writeFile(join(root,'direct-image-qa.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 if(missing.length||errors.length||sections!==1||overflow)process.exitCode=1;
}finally{await browser.close();}
