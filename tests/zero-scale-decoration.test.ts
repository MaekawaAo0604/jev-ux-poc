import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {AutoPage} from '../pages/AutoPage.js';
import {PublicSitePage} from '../pages/PublicSitePage.js';
import {candidatesFor} from '../jev/types.js';

const labels=['展示・催し物','来館案内','教育','コレクション','調査・研究・貸与','東博について'];
const fixture=(paint='',content=labels,ancestor='')=>`<style>
 body{margin:24px;font:700 16px/24px Arial}
 header{${ancestor}}li{display:inline-block;margin-right:20px}
 a{display:inline;position:relative;color:black;text-decoration:none}
 a::after{content:'';position:absolute;left:0;right:0;bottom:-3px;height:3px;background:rgb(27,133,77);transform:scaleX(0);${paint}}
 @keyframes reveal{from{transform:scaleX(0)}to{transform:scaleX(1)}}
 </style><header><nav><ul>${content.map((text,i)=>`<li><a href='/entry-${i}'>${text}</a></li>`).join('')}</ul></nav></header>`;

test('zero-width inline menu underlines preserve visible labels and public action candidates',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  await page.route('**/*',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:fixture()}));
  await page.goto('https://fixture.test/');
  assert.equal(await page.locator('a').first().evaluate(el=>getComputedStyle(el,'::after').transform),'matrix(0, 0, 0, 1, 0, 0)');
  const screen=await new PublicSitePage(page).observe(true);
  for(const label of labels){
   assert.ok(screen.text.includes(label),`${label} must remain observed`);
   const control=screen.elements.find(el=>el.text===label);
   assert.ok(control&&control.available!==false,`${label} must remain actionable`);
   assert.equal(candidatesFor(screen,false)[control.id]?.action.type,'click');
  }
  assert.ok(!screen.warnings?.includes('COMPLEX_PAINT_SKIPPED'));
  assert.doesNotMatch(JSON.stringify(screen),/entry-\d|fixture\.test|js-open-dropdown-menu/);
 }finally{await browser.close();}
});

test('an empty decoration collapsed exactly on the Y axis also preserves text',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();await page.setContent(fixture('transform:scaleY(0)',['Visible label']));
  const screen=await new AutoPage(page).observe(false);
  assert.ok(screen.text.includes('Visible label'));
  assert.ok(!screen.warnings?.includes('COMPLEX_PAINT_SKIPPED'));
 }finally{await browser.close();}
});

test('zero-axis support does not admit nonzero, combined, animated or uncertain paint',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();
  for(const {name,paint,ancestor} of [
   {name:'tiny nonzero X scale',paint:'transform:scaleX(0.000000001)'},
   {name:'tiny nonzero Y scale',paint:'transform:scaleY(0.000000001)'},
   {name:'actual full overlay',paint:'top:0;bottom:auto;height:24px;transform:none;background:white'},
   {name:'ordinary nonzero scale',paint:'transform:scaleX(0.5)'},
   {name:'singular shear',paint:'transform:matrix(0,0,1,1,0,0)'},
   {name:'rotation',paint:'transform:rotate(15deg)'},
   {name:'3D singular matrix',paint:'transform:matrix3d(0,0,0,0,0,1,0,0,0,0,1,0,0,0,1,1)'},
   {name:'individual scale',paint:'scale:2'},
   {name:'individual rotation',paint:'rotate:15deg'},
   {name:'individual translation',paint:'translate:1px'},
   {name:'current nonzero animation value',paint:'animation:reveal 1s linear -0.5s both paused'},
   {name:'generated glyph',paint:'content:"X"'},
   {name:'background image',paint:'background-image:linear-gradient(white,white)'},
   {name:'border',paint:'border:1px solid white'},
   {name:'border image',paint:'border:1px solid; border-image:linear-gradient(white,white) 1'},
   {name:'reflection',paint:'-webkit-box-reflect:below 0px'},
   {name:'filter',paint:'filter:blur(1px)'},
   {name:'backdrop filter',paint:'backdrop-filter:blur(1px)'},
   {name:'box shadow',paint:'box-shadow:0 0 20px white'},
   {name:'text shadow',paint:'text-shadow:0 0 20px white'},
   {name:'outline',paint:'outline:20px solid white'},
   {name:'clip path',paint:'clip-path:inset(0)'},
   {name:'mask',paint:'mask-image:linear-gradient(black,black)'},
   {name:'individual ancestor transform',ancestor:'translate:1px'},
  ]){
   await page.setContent(fixture(paint,['UNVERIFIED_LABEL'],ancestor));
   if(name==='current nonzero animation value')assert.equal(await page.locator('a').evaluate(el=>getComputedStyle(el,'::after').transform),'matrix(0.5, 0, 0, 1, 0, 0)');
   const screen=await new AutoPage(page).observe(false);
   assert.ok(!screen.text.includes('UNVERIFIED_LABEL'),name);
   assert.ok(!screen.elements.some(el=>el.text==='UNVERIFIED_LABEL'),name);
   assert.ok(screen.warnings?.includes('COMPLEX_PAINT_SKIPPED'),name);
  }
 }finally{await browser.close();}
});
