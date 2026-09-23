import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {AutoPage} from '../pages/AutoPage.js';

test('visible regions carry only their visible section headings and opaque section identities',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:800,height:400}});
  await page.setContent(`<main>
   <h1>Directory</h1>
   <section id="members-a" class="tier-card"><h2>Members</h2><p>All clubs</p></section>
   <section><h2>Students</h2><p>Parent club only</p></section>
   <section><h2>Members</h2><p>Regional clubs</p></section>
   <section><h2 hidden>SECRET_HEADING</h2><p>Public note</p></section>
   <section style="position:absolute;top:1200px"><h2>OFFSCREEN_HEADING</h2><p>OFFSCREEN_COPY</p></section>
  </main>`);

  const observed=await new AutoPage(page).observe(false);
  const allClubs=observed.regions?.find(region=>region.text==='All clubs');
  const students=observed.regions?.find(region=>region.text==='Parent club only');
  const regional=observed.regions?.find(region=>region.text==='Regional clubs');

  assert.deepEqual(allClubs?.context?.headings,['Directory','Members']);
  assert.deepEqual(students?.context?.headings,['Directory','Students']);
  assert.deepEqual(regional?.context?.headings,['Directory','Members']);
  assert.equal(allClubs?.context?.landmark,'main');
  assert.notEqual(allClubs?.context?.section,regional?.context?.section,'same heading text in sibling sections must not merge their identity');
  assert.match(allClubs?.context?.section||'',/^s\d+$/);
  assert.doesNotMatch(JSON.stringify(observed),/SECRET_HEADING|OFFSCREEN_HEADING|OFFSCREEN_COPY|members-a|tier-card|section:nth/);
 }finally{await browser.close();}
});

test('page IDs are stable per fragment-free document URL and viewport ranges are literal observations',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:800,height:400}});
  const pom=new AutoPage(page);
  await page.setContent('<main style="height:1200px"><h1>First</h1></main>');
  const first=await pom.observe(false);
  await page.evaluate(()=>location.hash='details');
  const fragment=await pom.observe(false);
  await page.goto('data:text/html,<main style="height:900px"><h1>Second</h1></main>');
  const second=await pom.observe(false);

  assert.equal(first.pageId,fragment.pageId);
  assert.notEqual(first.pageId,second.pageId);
  assert.deepEqual(first.viewport,{top:0,bottom:400,height:400});
  assert.match(first.pageId||'',/^p\d+$/);
  assert.doesNotMatch(JSON.stringify([first,fragment,second]),/about:blank|data:text\/html|#details/);
 }finally{await browser.close();}
});

test('section identities stay stable when other sections become non-visible',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:800,height:400}});
  const pom=new AutoPage(page);
  await page.setContent('<main><section id="temporary"><h2>First</h2><p>First copy</p></section><section><h2>Second</h2><p>Second copy</p></section></main>');
  const before=(await pom.observe(false)).regions?.find(region=>region.text==='Second copy')?.context?.section;
  await page.locator('#temporary').evaluate(element=>(element as HTMLElement).style.display='none');
  const after=(await pom.observe(false)).regions?.find(region=>region.text==='Second copy')?.context?.section;
  assert.equal(after,before);
 }finally{await browser.close();}
});
