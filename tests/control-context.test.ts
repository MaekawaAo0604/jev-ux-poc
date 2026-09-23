import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {AutoPage} from '../pages/AutoPage.js';
import {AccountPage} from '../pages/AccountPage.js';

test('duplicate visible links retain the heading context of their exact sections',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:800,height:400}});
  await page.setContent(`<main>
   <h1>Directory</h1>
   <section id="adult-private" class="internal-card"><h2>Members</h2><a href="/adult-private">Details</a></section>
   <section id="student-private"><h2>Students</h2><a href="/student-private">Details</a></section>
  </main>`);
  const screen=await new AutoPage(page).observe(false);
  assert.deepEqual(screen.elements.map(element=>element.text),['Details','Details']);
  assert.deepEqual(screen.elements.map(element=>element.context?.headings),[['Directory','Members'],['Directory','Students']]);
  assert.deepEqual(screen.elements.map(element=>element.context?.landmark),['main','main']);
  assert.match(screen.elements[0].context?.section||'',/^s\d+$/);
  assert.notEqual(screen.elements[0].context?.section,screen.elements[1].context?.section);
  assert.ok(screen.elements.every(element=>!('fontSizePx' in element)));
  assert.doesNotMatch(JSON.stringify(screen),/adult-private|student-private|internal-card/);
 }finally{await browser.close();}
});

test('control context excludes hidden and offscreen headings in auto and declared POM observations',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:800,height:400}});
  await page.setContent(`<main>
   <h1>Directory</h1>
   <section><h2>Members</h2><h3 hidden>HIDDEN_HEADING</h3>
    <h3 style="position:absolute;top:1000px">OFFSCREEN_HEADING</h3>
    <a href="/one">Details</a>
   </section>
  </main>`);
  class DeclaredPage extends AccountPage {protected labels=['Details'];}
  for(const pom of [new AutoPage(page),new DeclaredPage(page)]){
   const screen=await pom.observe(false);
   assert.deepEqual(screen.elements[0]?.context?.headings,['Directory','Members']);
   assert.doesNotMatch(JSON.stringify(screen),/HIDDEN_HEADING|OFFSCREEN_HEADING|\/one/);
  }
 }finally{await browser.close();}
});
