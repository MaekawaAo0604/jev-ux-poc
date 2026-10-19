import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evaluateDiversityTrial} from '../runner/goal-diversity-fixture.js';
import {diversityHTML} from '../runner/goal-diversity-fixture.js';
import {chromium} from 'playwright';
async function implementation(){return {evaluateDiversityTrial};}
const seen=(url:string,top=0,bottom=1000)=>({url:`http://local.test${url}`,state:{screen:{viewport:{top,bottom,height:1000}}}});
test('multi-screen oracle requires every fact to have actually been in the viewport',async()=>{
 const {evaluateDiversityTrial:e}=await implementation();
 assert.equal(e('split',{steps:[seen('/split/rates'),seen('/split/hours',600,1600)]}).displayCoverage,false);
 assert.equal(e('split',{steps:[seen('/split/rates'),seen('/split/hours')]}).displayCoverage,true);
});
test('matching-plan oracle checks actual destination, not a model done verdict',async()=>{
 const {evaluateDiversityTrial:e}=await implementation();
 assert.equal(e('matching',{reason:'JEV_DONE',steps:[seen('/matching/p1')]}).objectiveSuccess,false);
 assert.equal(e('matching',{reason:'STUCK',steps:[seen('/matching/p2')]}).objectiveSuccess,true);
});
test('consultation policy is visible evidence but not a definitive availability answer',async()=>{
 const {evaluateDiversityTrial:e}=await implementation();
 const result=e('conditional',{steps:[seen('/conditional/')]});
 assert.equal(result.displayCoverage,true);assert.equal(result.objectiveSuccess,null);assert.equal(result.expectedSubstantiveStatus,'conditional');
});
test('information display coverage does not certify answer accuracy or a subjective state of knowing',async()=>{
 assert.equal(evaluateDiversityTrial('single',{steps:[seen('/single/')]}).objectiveSuccess,null);
});

test('owned operation updates the rendered setting as well as the completion status',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});await page.setContent(diversityHTML('/operation/good/')!);
  const before=await page.locator('canvas').screenshot();await page.getByRole('button',{name:'メール通知を停止する'}).click();
  assert.equal(await page.getByRole('status').innerText(),'メール通知を停止しました');
  assert.notDeepEqual(await page.locator('canvas').screenshot(),before,'the primary setting display must not keep saying receiving after stop');
 }finally{await browser.close();}
});
