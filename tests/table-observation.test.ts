import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {AutoPage} from '../pages/AutoPage.js';

test('native table rows preserve visible label-value relationships, row order and union geometry',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:800,height:600}});
  await page.setContent(`<style>body{margin:20px;font:18px/30px Arial}th,td{padding:8px 20px;text-align:left}td{font-size:22px}</style>
   <main><h2>料金</h2><table>
    <tr><th><span id="label">一般</span></th><td><span id="value">1,000円</span></td></tr>
    <tr><th>学生</th><td>500円</td></tr>
   </table><p>表の外の文章</p><p>別の文章</p></main>`);
  const bounds=await page.locator('#label,#value').evaluateAll(elements=>elements.map(el=>{
   const range=document.createRange();range.selectNodeContents(el);const r=range.getBoundingClientRect();
   return {x0:r.left,y0:r.top,x1:r.right,y1:r.bottom};
  }));
  const screen=await new AutoPage(page).observe(true);
  assert.deepEqual(screen.text,['料金','一般 1,000円','学生 500円','表の外の文章','別の文章']);
  const region=screen.regions!.find(r=>r.text==='一般 1,000円')!;
  assert.equal(region.source,'dom');assert.equal(region.fontSizePx,22);
  assert.deepEqual(region.bbox,{x0:bounds[0].x0,y0:Math.min(bounds[0].y0,bounds[1].y0),x1:bounds[1].x1,y1:Math.max(bounds[0].y1,bounds[1].y1)});
  assert.equal(region.context?.landmark,'main');assert.deepEqual(region.context?.headings,['料金']);
  assert.equal(new Set(screen.regions!.map(r=>r.id)).size,screen.regions!.length);
 }finally{await browser.close();}
});

test('a table row joins only visible fragments and never fills a hidden or covered cell',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:800,height:600}});
  await page.setContent(`<style>body{font:18px/30px Arial}th,td{padding:8px}.covered{position:relative}.cover{position:absolute;inset:0;background:white;pointer-events:none}</style>
   <table>
    <tr><th>表示中</th><td hidden>HIDDEN_VALUE</td><td>100</td></tr>
    <tr><th class="covered">COVERED_HEADER<div class="cover"></div></th><td>200</td></tr>
    <tr><th>値を遮蔽</th><td class="covered">COVERED_VALUE<div class="cover"></div></td></tr>
    <tr><th>一部表示</th><td>300<span hidden>HIDDEN_SUFFIX</span></td></tr>
   </table>`);
  const screen=await new AutoPage(page).observe(false);
  assert.deepEqual(screen.text,['表示中 100','200','値を遮蔽','一部表示 300']);
  assert.doesNotMatch(JSON.stringify(screen),/HIDDEN_|COVERED_/);
  assert.ok(screen.warnings?.includes('POSSIBLE_PAINT_OVERLAP'));
 }finally{await browser.close();}
});

test('clipped values retain only observed digits and the partial-text warning when joined to a row',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:800,height:600}});
  await page.setContent(`<style>td div{font:20px monospace;width:28px;overflow:hidden;white-space:nowrap}</style>
   <table><tr><th>料金</th><td><div>50000円</div></td></tr></table>`);
  const screen=await new AutoPage(page).observe(false);
  assert.deepEqual(screen.text,['料金 50']);
  assert.ok(screen.warnings?.includes('PARTIAL_TEXT'));
  assert.doesNotMatch(JSON.stringify(screen),/50000/);
 }finally{await browser.close();}
});

test('nested table rows and captions never merge into their outer row',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:800,height:600}});
  await page.setContent(`<style>body{font:18px/28px Arial}th,td{padding:4px}</style>
   <table><tr><th>外側</th><td>前の値<table><caption>内側の表</caption>
    <tr><th>内側A</th><td>100</td></tr><tr><th>内側B</th><td>200</td></tr>
   </table>後の値</td><td>外側末尾</td></tr><tr><th>外側の次行</th><td>300</td></tr></table>`);
  const screen=await new AutoPage(page).observe(false);
  assert.deepEqual(screen.text,['外側 前の値 後の値 外側末尾','内側の表','内側A 100','内側B 200','外側の次行 300']);
  assert.ok(screen.regions!.every(r=>!(r.text.includes('外側')&&r.text.includes('内側'))));
 }finally{await browser.close();}
});

test('row grouping preserves individual control labels and does not group generic ARIA rows',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:800,height:600}});
  await page.setContent(`<style>body{font:18px/30px Arial}</style>
   <table><tr><th><div>案内</div></th><td><a href="/local">詳細</a></td><td><button>確認</button></td></tr></table>
   <div role="row"><div role="cell">独立ラベル</div><div role="cell">独立値</div></div>`);
  const screen=await new AutoPage(page).observe(false);
  assert.deepEqual(screen.text,['案内 詳細 確認','独立ラベル','独立値']);
  assert.deepEqual(screen.elements.map(e=>e.text),['詳細','確認']);
 }finally{await browser.close();}
});
