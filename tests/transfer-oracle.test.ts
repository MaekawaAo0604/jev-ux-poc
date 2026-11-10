import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {transferDefinition,transferFixtures} from '../app/transfer-fixture.js';
import {checkTransferObjective} from '../runner/transfer-oracle.js';

test('independent oracle rejects wrong/pending status, duplicate markers and incomplete help visibility',async()=>{
 const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 for(const fixture of transferFixtures()){
  const d=transferDefinition(fixture),fields=d.task==='help'?'<p data-transfer-field="place">'+d.place+'</p><p data-transfer-field="belongings">'+d.belongings+'</p>':'';
  const html='<main data-transfer-complete="true"><p role="status">'+d.objectiveText+'</p>'+fields+'</main>';
  await page.setContent(html);assert.equal(await checkTransferObjective(page,fixture),true);
  await page.getByRole('status').evaluate(e=>{e.textContent='変更予定（未保存）';});assert.equal(await checkTransferObjective(page,fixture),false);
  await page.setContent(html+'<div data-transfer-complete="true">duplicate</div>');await assert.rejects(()=>checkTransferObjective(page,fixture),/AMBIGUOUS_TRANSFER_ORACLE/);
  if(d.task==='help'){
   await page.setContent(html);await page.locator('[data-transfer-field="belongings"]').evaluate(e=>{e.style.display='none';});assert.equal(await checkTransferObjective(page,fixture),false);
   await page.setContent(html);await page.locator('[data-transfer-field="place"]').evaluate(e=>{e.style.position='absolute';e.style.top='1000px';});assert.equal(await checkTransferObjective(page,fixture),false);
   await page.setContent(html);await page.locator('[data-transfer-field="place"]').evaluate(e=>{e.textContent='別イベントの場所';});assert.equal(await checkTransferObjective(page,fixture),false);
  }
 }
 }finally{await browser.close();}
});
