import assert from 'node:assert/strict';
import {access,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {chromium} from 'playwright';
const root=resolve('reports/measurement-2026-09-22'),origin='http://127.0.0.1:5173';
const browser=await chromium.launch({headless:true}),out=[];
try{
 for(const [id,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]] ){
  const page=await browser.newPage({viewport}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const response=await page.goto(`${origin}/reports/measurement-2026-09-22/index.html`,{waitUntil:'networkidle'});
  assert.equal(response.status(),200);
  assert.equal(await page.locator('h1').count(),1);
  for(const anchor of ['observation','facts','judgment','paths','scope'])assert.equal(await page.locator(`#${anchor}`).count(),1);
  const dom=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,images:[...document.images].map(i=>({src:i.getAttribute('src'),loaded:i.complete&&i.naturalWidth>0})),links:[...document.querySelectorAll('a[href]')].map(a=>({href:a.href,hash:a.hash}))}));
  assert.ok(dom.scrollWidth<=dom.width,`${id}: page overflows viewport`);
  assert.ok(dom.images.every(i=>i.loaded),`${id}: image did not load`);
  for(const link of dom.links){
   const url=new URL(link.href);assert.equal(url.origin,origin,'Report should link only to local evidence');
   await access(resolve('.',decodeURIComponent(url.pathname).slice(1)));
   if(url.pathname.endsWith('/index.html')&&url.hash&&url.pathname.includes('measurement-2026-09-22'))assert.equal(await page.locator(url.hash).count(),1);
  }
  await page.screenshot({path:join(root,`report-${id}.png`)});
  await page.locator('#judgment').scrollIntoViewIfNeeded();
  await page.screenshot({path:join(root,`report-${id}-judgment.png`)});
  assert.deepEqual(errors,[]);
  out.push({id,viewport,status:response.status(),linksChecked:dom.links.length,imagesChecked:dom.images.length,pageErrors:errors,pageOverflow:false});
  await page.close();
 }
 await writeFile(join(root,'report-verification.json'),JSON.stringify({verifiedAt:new Date().toISOString(),views:out},null,2));
 console.log(JSON.stringify(out));
}finally{await browser.close();}
