import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {PublicSitePage} from '../pages/PublicSitePage.js';

test('same-document fragment links retain local state while cross-document fragments share navigation',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage();
  await page.route('https://example.test/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<h1>Document</h1><a href="/doc#answer">Section</a><a href="/doc#">Empty fragment</a><a href="/doc">Reload</a><a href="/doc?version=2#answer">Other query</a><div id="answer">Section target</div><details open><summary>Panel</summary><p>Answer</p></details>'}));
  await page.goto('https://example.test/doc');
  const pom=new PublicSitePage(page),local=await pom.observe(true);
  const labels=()=>pom.explorationNavigationChoices.map(id=>local.elements.find(e=>e.id===id)!.text);
  assert.deepEqual(labels(),['Reload','Other query'],'page-local fragment transitions must not acquire another document’s shared edge');
  await page.evaluate(()=>document.querySelector('details')!.open=false);
  await pom.act({type:'click',elementId:local.elements.find(e=>e.text==='Section')!.id});
  assert.equal(await page.locator('details').evaluate(e=>(e as HTMLDetailsElement).open),false,'same-document navigation preserves the disclosure state');
  await page.goto('https://example.test/other');
  const remote=await pom.observe(true);
  assert.deepEqual(pom.explorationNavigationChoices.map(id=>remote.elements.find(e=>e.id===id)!.text),['Section','Empty fragment','Reload','Other query']);
  await pom.act({type:'click',elementId:remote.elements.find(e=>e.text==='Section')!.id});
  assert.equal(await page.locator('details').evaluate(e=>(e as HTMLDetailsElement).open),true,'cross-document navigation creates a fresh disclosure state');
 }finally{await browser.close();}
});

test('private operation keys distinguish same-label disclosures and links without exposing route metadata',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage();
  await page.route('https://example.test/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<a href="/private-route-one">Details</a><a href="/private-route-two">Details</a><details><summary>Expand</summary><p>First answer</p></details><details><summary>Expand</summary><p>Second answer</p></details>'}));
  await page.goto('https://example.test/');
  const pom=new PublicSitePage(page),screen=await pom.observe(true),keys=pom.explorationActionKeys;
  const links=screen.elements.filter(e=>e.text==='Details'),panels=screen.elements.filter(e=>e.text==='Expand');
  assert.equal(links.length,2);assert.equal(panels.length,2);
  assert.deepEqual(pom.explorationNavigationChoices,links.map(e=>e.id),'only guarded direct links share history across viewports');
  assert.notEqual(keys[links[0].id],keys[links[1].id]);
  assert.notEqual(keys[panels[0].id],keys[panels[1].id]);
  assert.ok(!JSON.stringify(screen).includes('private-route'));
  assert.ok(!JSON.stringify(screen).includes('identityPath'));
  const before=keys[panels[1].id];
  await page.evaluate(()=>document.querySelector('a')!.style.display='none');
  const after=await pom.observe(true);
  assert.notEqual(after.elements.find(e=>e.text==='Expand')!.id,panels[0].id,'ephemeral element IDs change when controls disappear');
  const panel=after.elements.filter(e=>e.text==='Expand')[1];
  assert.equal(pom.explorationActionKeys[panel.id],before,'hiding an earlier control must not change the retained disclosure identity');
  await pom.act({type:'click',elementId:panel.id});
  const opened=await pom.observe(true);
  assert.ok(opened.text.includes('Second answer'));
  assert.ok(!opened.text.includes('First answer'));
 }finally{await browser.close();}
});
