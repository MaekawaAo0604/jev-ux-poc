import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {AutoPage} from '../pages/AutoPage.js';

test('observation waits for a replacing document body instead of failing or judging an empty frame',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();await page.setContent('<p>Previous document</p>');
  await page.evaluate(()=>{
   document.body.remove();
   setTimeout(()=>{const body=document.createElement('body');body.innerHTML='<h1>Ready</h1><p>Actual condition</p>';document.documentElement.append(body);},200);
  });
  const observed=await new AutoPage(page).observe(false);
  assert.equal(observed.title,'Ready');assert.ok(observed.text.includes('Actual condition'));
  assert.ok(!observed.text.includes('Previous document'));
  page.setDefaultTimeout(200);await page.evaluate(()=>document.body.remove());
  await assert.rejects(new AutoPage(page).observe(false),/Timeout/,'a document that never becomes ready must fail rather than return empty evidence');
 }finally{await browser.close();}
});

test('a body replacement after the readiness check retries only observation and is bounded',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();
  for(const persistent of [false,true]){
   await page.setContent('<p>Old</p>');
   class ReplacingPage extends AutoPage{
    calls=0;
    protected async observeControls(font:boolean){
     const replace=++this.calls===1||persistent;
     if(replace)await this.page.evaluate(()=>document.body.remove());
     // Hold the missing-body condition until the observation actually fails:
     // a 50ms timer can restore it too early under the parallel test suite.
     try{return await super.observeControls(font);}
     finally{if(replace)await this.page.evaluate(()=>{
      const body=document.createElement('body');body.innerHTML='<p>Ready again</p>';document.documentElement.append(body);
     });}
    }
   }
   const pom=new ReplacingPage(page);
   if(persistent){await assert.rejects(pom.observe(false),/OBSERVATION_NOT_READY/);assert.equal(pom.calls,3);}
   else{assert.ok((await pom.observe(false)).text.includes('Ready again'));assert.equal(pom.calls,2);}
  }
 }finally{await browser.close();}
});

test('observed DOM fragment geometry cannot cover image-only gaps inside grouped text',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:800,height:600}});
  await page.setContent('<p style="font:24px sans-serif">Known first line<br><canvas width="300" height="80" style="display:block"></canvas>Known last line</p>');
  const screen=await new AutoPage(page).observe(false);
  const region=screen.regions!.find(r=>r.text.includes('Known first line'))!;
  const image=await page.locator('canvas').boundingBox();assert.ok(image);
  assert.ok(region.bbox.y0<image.y&&region.bbox.y1>image.y+image.height,'the old grouped bounding box really includes the image gap');
  assert.ok(region.fragments?.length&&region.fragments.length>=2,'actual contiguous observed fragments are retained');
  for(const f of region.fragments!)assert.ok(f.y1<=image.y||f.y0>=image.y+image.height,'no DOM fragment contains image-only pixels');
 }finally{await browser.close();}
});

test('visible DOM prices, units and table cells are observed with grounded regions',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:800,height:600}});
  await page.setContent(`<main style="font:20px sans-serif"><h1>料金</h1>
   <div><span>¥</span> <span>500</span> <span>（税込）</span></div>
   <div>1ユーザー・1ヶ月につき</div><table><tr><th>無料期間</th><td>2ヶ月</td></tr></table>
   <ul><li>毎月1日に請求</li></ul><a href="/next" aria-label="内部の正解">次へ<span hidden>秘密の経路</span></a>
  </main>`);
  const pom=new AutoPage(page),screen=await pom.observe(true);
  assert.ok(screen.text.some(t=>t.includes('500')&&t.includes('税込')),'price and tax are in the same observed region');
  assert.ok(screen.text.includes('1ユーザー・1ヶ月につき'));
  assert.ok(screen.text.includes('無料期間 2ヶ月'));assert.ok(screen.text.includes('毎月1日に請求'));
  const regions=(screen as any).regions;
  assert.ok(Array.isArray(regions)&&regions.length>0,'observed text has region IDs');
  assert.equal(new Set(regions.map((r:any)=>r.id)).size,regions.length);
  for(const r of regions){
   assert.equal(r.source,'dom');assert.ok(r.bbox.x0>=0&&r.bbox.x1<=800&&r.bbox.y0>=0&&r.bbox.y1<=600);
   assert.ok(r.fontSizePx>0);assert.ok(screen.text.includes(r.text));
  }
  const withoutFont=await pom.observe(false);
  assert.deepEqual({...screen,elements:screen.elements.map(({fontSizePx,...e})=>e),regions:regions.map(({fontSizePx,...r}:any)=>r)},withoutFont);
  assert.doesNotMatch(JSON.stringify(screen),/内部の正解|秘密の経路|href|selector/);
 }finally{await browser.close();}
});

test('observation excludes hidden, clipped, covered and offscreen text without losing visible fragments',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:800,height:600}});
  await page.setContent(`<style>body{margin:0;font:20px monospace}.row{position:absolute;left:20px;height:30px}</style>
   <div class="row" style="top:10px">見える文字<span hidden>HIDDEN</span></div>
   <div style="opacity:0"><p>TRANSPARENT</p></div>
   <div style="display:none"><p>DISPLAYNONE</p></div>
   <div style="visibility:hidden"><p>INVISIBLE</p></div>
   <div class="row" style="top:100px">COVERED</div><div style="position:absolute;left:0;top:95px;width:400px;height:45px;background:white;z-index:9"></div>
   <div class="row" style="top:170px;width:80px;overflow:hidden;white-space:nowrap"><span>VISIBLE</span><span>CLIPPEDSECRET</span></div>
   <div class="row" style="top:230px;width:2000px">画面内の部分<span style="position:absolute;left:1000px">RIGHTSECRET</span></div>
   <div style="position:absolute;top:2000px">OFFSCREEN</div>
   <details><summary>開く</summary>CLOSEDSECRET</details>
   <script>const INTERNALSECRET='route';</script><style>/* STYLESECRET */</style>`);
  const screen=await new AutoPage(page).observe(false),text=screen.text.join('\n');
  assert.match(text,/見える文字/);assert.match(text,/画面内の部分/);
  assert.doesNotMatch(JSON.stringify(screen),/HIDDEN|TRANSPARENT|DISPLAYNONE|INVISIBLE|COVERED|CLIPPEDSECRET|RIGHTSECRET|OFFSCREEN|CLOSEDSECRET|INTERNALSECRET|STYLESECRET/);
 }finally{await browser.close();}
});

test('painted descendant and pointer-transparent overlays cannot leak covered text',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();
  await page.setContent(`<div style="position:relative">CHILDCOVERED<div style="position:absolute;inset:0;background:white"></div></div>
   <div style="position:relative">PASSCOVERED<div style="position:absolute;inset:0;background:white;pointer-events:none"></div></div>
   <div style="color:transparent">TRANSPARENTCOLOR</div><div style="-webkit-text-fill-color:transparent">TRANSPARENTFILL</div>
   <div style="filter:opacity(0)">TRANSPARENTFILTER</div>
   <div style="visibility:hidden"><span style="visibility:visible">RESTORED</span></div>
   <div style="pointer-events:none">PASSTEXT</div>`);
  const screen=await new AutoPage(page).observe(false),text=screen.text.join('\n');
  assert.doesNotMatch(text,/CHILDCOVERED|PASSCOVERED|TRANSPARENTCOLOR|TRANSPARENTFILL|TRANSPARENTFILTER/);
  assert.match(text,/RESTORED/);assert.match(text,/PASSTEXT/);
 }finally{await browser.close();}
});

test('partly clipped numbers are disclosed rather than silently represented as complete amounts',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();await page.setContent('<div style="font:20px monospace;width:28px;overflow:hidden;white-space:nowrap">50000円</div>');
  const screen=await new AutoPage(page).observe(false);
  assert.ok(screen.text.length>0);assert.ok(screen.warnings?.some(w=>w.includes('PARTIAL_TEXT')));
 }finally{await browser.close();}
});

test('unsupported CSS clipping and painted pseudo overlays are excluded with a warning',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();await page.setContent(`<style>.covered{position:relative}.covered::after{content:'';position:absolute;inset:0;background:white}</style>
   <div style="clip-path:inset(100%)">CLIPPATHSECRET</div>
   <div style="position:absolute;clip:rect(0,0,0,0)">CLIPSECRET</div>
   <div class="covered">PSEUDOSECRET</div><p>通常の表示</p>`);
  const screen=await new AutoPage(page).observe(false);
  assert.doesNotMatch(screen.text.join('\n'),/CLIPPATHSECRET|CLIPSECRET|PSEUDOSECRET/);
  assert.match(screen.text.join('\n'),/通常の表示/);assert.ok(screen.warnings?.includes('COMPLEX_PAINT_SKIPPED'));
 }finally{await browser.close();}
});

test('small non-overlapping pseudo arrows preserve labels, but overlapping or unbounded paint does not',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();
  await page.setContent(`<style>
   a{display:block;position:relative;width:250px;padding-left:20px;line-height:30px}
   a::before{content:'';position:absolute;left:0;top:8px;width:8px;height:14px;background:blue}
   .cover::before{width:250px;left:0;top:0;height:30px}
   .unknown::before{transform:scale(100)}
  </style><a href='/faq'>よくある質問</a><a href='/school'>高校生の利用</a>
  <a class='cover' href='/secret'>COVEREDLABEL</a><a class='unknown' href='/unknown'>UNCERTAINLABEL</a>`);
  // Keep the unknown transformed overlay away from the labels under test.
  await page.locator('.unknown').evaluate(el=>(el as HTMLElement).style.marginTop='1000px');
  const screen=await new AutoPage(page).observe(false);
  assert.ok(screen.text.includes('よくある質問'));
  assert.ok(screen.text.includes('高校生の利用'));
  assert.equal(screen.elements.find(e=>e.text==='よくある質問')?.type,'link');
  assert.doesNotMatch(JSON.stringify(screen),/COVEREDLABEL|UNCERTAINLABEL/);
 }finally{await browser.close();}
});

test('pseudo outlines and overflowing generated text fail closed',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();
  for(const paint of ['outline:100px solid white','content:"OVERFLOWING GENERATED TEXT";white-space:nowrap','transform:scale(100)']){
   await page.setContent(`<style>a{display:block;position:relative;padding-left:20px}a::before{content:'';position:absolute;left:0;top:0;width:8px;height:14px;background:white;${paint}}</style><a href='/x'>COVEREDLABEL</a>`);
   const screen=await new AutoPage(page).observe(false);
   assert.doesNotMatch(JSON.stringify(screen),/COVEREDLABEL/,paint);
   assert.ok(screen.warnings?.includes('COMPLEX_PAINT_SKIPPED'));
  }
 }finally{await browser.close();}
});

test('a non-overlapping generated bullet preserves the actual link text without exposing generated content',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();
  await page.setContent(`<style>
   a{display:block;position:relative;padding:5.6px 0 5.6px 14px;font:14px/21px Arial}
   a::before{content:'・';position:absolute;left:-2.8px;top:5.6px;width:14px;height:21px}
  </style><a href='/school'>高校生無料制度</a>`);
  const screen=await new AutoPage(page).observe(false);
  assert.ok(screen.text.includes('高校生無料制度'));
  assert.equal(screen.elements.find(e=>e.text==='高校生無料制度')?.type,'link');
  assert.doesNotMatch(screen.text.join('\n'),/・/,'generated content is not observed DOM text');
 }finally{await browser.close();}
});

test('generated glyphs with overlapping or uncertain paint cannot expose labels',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();
  for(const paint of [
   'left:20px',
   'content:"W";font-size:100px;width:1px',
   'content:"W";zoom:5',
   'outline:100px solid white',
   'text-shadow:30px 0 1px white',
   '-webkit-text-stroke:40px white',
   'transform:translateX(30px)',
   'text-indent:30px',
   'letter-spacing:30px',
   'direction:rtl',
   'writing-mode:vertical-rl',
   'content:"OVERFLOWING GENERATED TEXT";white-space:nowrap',
  ]){
   await page.setContent(`<style>
    a{display:block;position:relative;padding-left:20px;font:14px/21px Arial}
    a::before{content:'・';position:absolute;left:0;top:0;width:14px;height:21px;${paint}}
   </style><a href='/x'>COVEREDLABEL</a>`);
   const screen=await new AutoPage(page).observe(false);
   assert.doesNotMatch(JSON.stringify(screen),/COVEREDLABEL/,paint);
   assert.ok(screen.warnings?.includes('COMPLEX_PAINT_SKIPPED'),paint);
  }
 }finally{await browser.close();}
});

test('generated glyph alignment cannot move overflow outside the measured strip',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();
  for(const paint of ['text-align-last:right','display:flex;justify-content:flex-end']){
   await page.setContent(`<style>
    a{display:block;position:relative;padding-left:20px;font:14px/21px Arial}
    a::before{content:'W';position:absolute;left:80px;top:0;width:1px;height:21px;font-size:100px;${paint}}
   </style><a href='/x'>X</a>`);
   const screen=await new AutoPage(page).observe(false);
   assert.equal(screen.text.length,0,paint);
   assert.ok(screen.warnings?.includes('COMPLEX_PAINT_SKIPPED'),paint);
  }
 }finally{await browser.close();}
});

test('scrolling a generated glyph containing block does not expose covered text',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();
  await page.setContent(`<style>
   a{display:block;position:relative;width:100px;padding-left:100px;overflow:auto;white-space:nowrap;font:14px/21px Arial}
   a::before{content:'W';position:absolute;left:80px;top:0;width:1px;height:21px;font-size:100px}
   span{display:inline-block;width:500px;height:1px}
  </style><a href='/x'>X<span></span></a>`);
  await page.locator('a').evaluate(el=>{el.scrollLeft=70;});
  const screen=await new AutoPage(page).observe(false);
  assert.equal(screen.text.length,0);
  assert.ok(screen.warnings?.includes('COMPLEX_PAINT_SKIPPED'));
 }finally{await browser.close();}
});

for(const {name,paint} of [
 {name:'border image outset',paint:'border:1px solid transparent;border-image:linear-gradient(white,white) 1 fill / 1 / 100px'},
 {name:'box reflection',paint:'background:white;-webkit-box-reflect:right 40px'},
 {name:'motion path',paint:'background:white;offset-path:path("M 0 0 L 80 0");offset-distance:100%'},
 {name:'text security replacement',paint:'content:"I";font-size:80px;-webkit-text-security:square'},
])test(`generated glyph ${name} cannot paint outside its certified bounds`,async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();
  await page.setContent(`<style>
   a{display:block;position:relative;padding-left:40px;font:20px/30px Arial}
   a::before{content:'W';position:absolute;left:0;top:0;width:14px;height:30px;${paint}}
  </style><a href='/x'>COVEREDLABEL</a>`);
  const screen=await new AutoPage(page).observe(false);
  assert.equal(screen.text.length,0,name);
  assert.ok(screen.warnings?.includes('COMPLEX_PAINT_SKIPPED'),name);
 }finally{await browser.close();}
});
