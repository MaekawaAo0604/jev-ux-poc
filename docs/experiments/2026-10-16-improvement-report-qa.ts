import assert from 'node:assert/strict';
import {resolve,join} from 'node:path';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const root=resolve(process.argv[2]);
const review=JSON.parse(await readFile(join(root,'review.json'),'utf8'));
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('file:///'+join(root,'index.html').replaceAll('\\','/'));
 assert.equal(await page.locator('#independent-review h3').count(),5);
 assert.equal(await page.locator('details.run').count(),4);
 assert.equal(await page.locator('.overview').innerText().then(s=>s.includes('UX指標として有効')),false);
 assert.match(await page.locator('#independent-review').innerText(),/未解決|未達/);
 const broken=await page.evaluate(()=>[...document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')].filter(a=>!document.getElementById(a.hash.slice(1))).map(a=>a.hash));assert.deepEqual(broken,[]);
 for(const r of review.reviews)for(const e of r.evidence){const s=await page.locator(`section[id$="-screen-${e.step}"]`).count();assert.ok(s>0);}
 await page.screenshot({path:join(root,'review-desktop.png'),fullPage:false});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:join(root,'review-mobile.png'),fullPage:false});
 assert.deepEqual(errors,[]);console.log(JSON.stringify({runs:4,brokenAnchors:broken.length,pageErrors:errors.length,mobileOverflow:false}));
}finally{await browser.close();}
