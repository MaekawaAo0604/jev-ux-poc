import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {AutoPage} from '../pages/AutoPage.js';

const fixture=(paint='',heading='',ancestor='')=>`<style>
 body{margin:24px;font:16px/32px Arial}
 main{${ancestor}}
 h4{display:block;position:relative;width:561px;padding-left:14px;margin:0;font:700 18px/36px Arial;letter-spacing:1px;font-feature-settings:'palt';${heading}}
 h4::before{content:'';position:absolute;left:0;top:16px;width:10px;height:10px;margin-top:1px;background:rgb(43,43,43);border-radius:50%;transform:translateY(-50%);${paint}}
 p{margin:16px 0 0}
 </style><main><h4>利用対象のご案内</h4><p>受付で確認書類をご提示ください。</p></main>`;

test('an empty translated heading decoration preserves visible text and paragraph heading context',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:800,height:600}});
  await page.setContent(fixture());
  assert.equal(await page.locator('h4').evaluate(el=>getComputedStyle(el,'::before').transform),'matrix(1, 0, 0, 1, 0, -5)');
  const screen=await new AutoPage(page).observe(true);
  assert.deepEqual(screen.text,['利用対象のご案内','受付で確認書類をご提示ください。']);
  assert.deepEqual(screen.regions?.find(r=>r.text==='受付で確認書類をご提示ください。')?.context?.headings,['利用対象のご案内']);
  assert.ok(!screen.warnings?.includes('COMPLEX_PAINT_SKIPPED'));
 }finally{await browser.close();}
});

test('translated decoration bounds use both offsets when paint moves away from the heading',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:800,height:600}});
  for(const paint of ['left:18px;transform:matrix(1,0,0,1,-18,-5)','left:18px;transform:matrix(1,0,0,1,0,-40)']){
   await page.setContent(fixture(paint));
   const screen=await new AutoPage(page).observe(false);
   assert.ok(screen.text.includes('利用対象のご案内'),paint);
   assert.ok(!screen.warnings?.includes('COMPLEX_PAINT_SKIPPED'),paint);
  }
 }finally{await browser.close();}
});

test('translated decorations that move into the heading cannot expose covered text',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:800,height:600}});
  for(const paint of ['transform:matrix(1,0,0,1,14,-5)','left:18px;top:60px;transform:matrix(1,0,0,1,0,-50)']){
   await page.setContent(fixture(paint));
   const screen=await new AutoPage(page).observe(false);
   assert.ok(!screen.text.includes('利用対象のご案内'),paint);
   assert.ok(screen.text.includes('受付で確認書類をご提示ください。'),paint);
   assert.ok(screen.warnings?.includes('COMPLEX_PAINT_SKIPPED'),paint);
   assert.deepEqual(screen.regions?.find(r=>r.text==='受付で確認書類をご提示ください。')?.context?.headings,[],paint);
  }
 }finally{await browser.close();}
});

test('a scrolled decoration containing block cannot certify unadjusted paint coordinates',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:800,height:600}});
  await page.setContent(`<style>
   h4{position:relative;width:100px;padding-left:100px;overflow:auto;white-space:nowrap;font:18px/36px Arial}
   h4::before{content:'';position:absolute;left:100px;top:16px;width:10px;height:10px;background:white;transform:translateY(-5px)}
   span{display:inline-block;width:500px;height:1px}
  </style><h4>X<span></span></h4>`);
  await page.locator('h4').evaluate(el=>{el.scrollLeft=70;});
  const screen=await new AutoPage(page).observe(false);
  assert.equal(screen.text.length,0);
  assert.ok(screen.warnings?.includes('COMPLEX_PAINT_SKIPPED'));
 }finally{await browser.close();}
});

test('an inline containing block cannot disclose text covered by a translated decoration',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:800,height:600}});
  await page.setContent(`<style>
   body{margin:24px;background:white;font:18px/36px Arial}
   span{position:relative;border-left:30px solid transparent;padding-left:30px}
   span::before{content:'';position:absolute;left:0;top:0;width:20px;height:30px;background:white;transform:translateX(30px)}
  </style><span>X</span>`);
  const screen=await new AutoPage(page).observe(false);
  assert.equal(screen.text.length,0);
  assert.ok(screen.warnings?.includes('COMPLEX_PAINT_SKIPPED'));
 }finally{await browser.close();}
});

for(const {name,paint,heading,ancestor} of [
 {name:'rotation',paint:'transform:rotate(15deg)'},
 {name:'scale',paint:'transform:scale(2)'},
 {name:'3D matrix',paint:'transform:matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,-5,1,1)'},
 {name:'individual translation',paint:'translate:0 -5px'},
 {name:'individual rotation',paint:'rotate:15deg'},
 {name:'individual scale',paint:'scale:2'},
 {name:'translated generated glyph',paint:'content:".";letter-spacing:normal;font-feature-settings:normal'},
 {name:'translated generated text',paint:'content:"GENERATED"'},
 {name:'translated shadow',paint:'box-shadow:20px 0 0 white'},
 {name:'translated filter',paint:'filter:blur(1px)'},
 {name:'translated outline',paint:'outline:20px solid white'},
 {name:'translated mask',paint:'mask-image:linear-gradient(black,black)'},
 {name:'translated clip path',paint:'clip-path:inset(0)'},
 {name:'translated zoom',paint:'zoom:2'},
 {name:'heading transform',heading:'transform:translateX(5px)'},
 {name:'ancestor transform',ancestor:'transform:translateX(5px)'},
])test(`${name} remains outside certified decoration bounds`,async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:800,height:600}});
  await page.setContent(fixture(paint,heading,ancestor));
  const screen=await new AutoPage(page).observe(false);
  assert.ok(!screen.text.includes('利用対象のご案内'));
  assert.ok(screen.warnings?.includes('COMPLEX_PAINT_SKIPPED'));
 }finally{await browser.close();}
});
