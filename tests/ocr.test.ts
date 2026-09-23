import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve} from 'node:path';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {pngDimensions,ocrLines,referenceText,localOcrFile,type OcrDocument} from '../runner/ocr-data.js';
import {ocrReport} from '../runner/ocr-report.js';

test('local-only input rejects mixed-separator network paths before any file access',()=>{
 for(const path of ['/\\server\\share\\image.png','\\/server/share/step.json','\\\\server\\share\\image.png','file:///tmp/image.png','https://example.com/image.png'])assert.throws(()=>localOcrFile(path),/local PNG/);
 assert.equal(localOcrFile('image.png'),resolve('image.png'));
});

test('real local OCR starts both language models cleanly and recognizes a rendered price',{skip:process.env.RUN_OCR_INTEGRATION!=='1'},async()=>{
 const dir=await mkdtemp(resolve(tmpdir(),'jev-ocr-')),png=resolve(dir,'price.png');
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:800,height:300}});
  await page.setContent('<main style="font:42px sans-serif;padding:30px;color:black;background:white">¥500<p>税込 1ユーザー・1ヶ月</p></main>');
  await page.screenshot({path:png});
 }finally{await browser.close();}
 const {stdout,stderr}=await promisify(execFile)(process.execPath,['--import','tsx',resolve('runner/ocr.ts'),png],{timeout:130000});
 assert.doesNotMatch(stderr,/Failed loading language|Error opening data file/);
 const summary=JSON.parse(stdout.trim().split('\n').at(-1)!);
 const doc=JSON.parse(await readFile(resolve(summary.report,'../ocr.json'),'utf8'));
 assert.match(doc.rawText,/500/);
 assert.match(doc.rawText.replace(/\s/g,''),/税込/);
 assert.ok(doc.lines.length>0);
});

test('OCR CLI rejects remote URLs and malformed arguments before loading models',async()=>{
 for(const args of [['https://example.com/image.png'],['local.png','--typo','value'],[]]){
  await assert.rejects(promisify(execFile)(process.execPath,['--import','tsx',resolve('runner/ocr.ts'),...args]),error=>{
   const stderr=(error as {stderr:string}).stderr;assert.match(stderr,/local PNG|Usage|Unknown option/);assert.doesNotMatch(stderr,/ERR_MODULE_NOT_FOUND/);return true;
  });
 }
});

test('PNG dimensions reject unsupported and excessively large images before OCR',()=>{
 const header=Buffer.alloc(24);Buffer.from('89504e470d0a1a0a0000000d49484452','hex').copy(header);
 header.writeUInt32BE(1440,16);header.writeUInt32BE(1000,20);
 assert.deepEqual(pngDimensions(header),{width:1440,height:1000});
 assert.throws(()=>pngDimensions(Buffer.from('not a PNG')),/PNG/);
 header.writeUInt32BE(100000,16);assert.throws(()=>pngDimensions(header),/size/);
 header.writeUInt32BE(0,16);assert.throws(()=>pngDimensions(header),/size/);
});

test('OCR preserves recognized characters, separate line regions and low confidence',()=>{
 const lines=ocrLines({blocks:[{paragraphs:[{lines:[
  {text:' ¥500\n',confidence:91.5,bbox:{x0:10,y0:20,x1:160,y1:70}},
  {text:'1ユーザー・1ヶ月',confidence:32,bbox:{x0:200,y0:80,x1:450,y1:110}},
  {text:' ',confidence:0,bbox:{x0:0,y0:0,x1:1,y1:1}},
 ]}]}]},500,200);
 assert.equal(lines.length,2);assert.equal(lines[0].text,'¥500');assert.equal(lines[1].confidence,32);
 assert.deepEqual(lines[1].bbox,{x0:200,y0:80,x1:450,y1:110});
 assert.deepEqual(ocrLines({blocks:null},500,200),[]);
 assert.throws(()=>ocrLines({blocks:[{paragraphs:[{lines:[{text:'bad',confidence:80,bbox:{x0:-5,y0:0,x1:5,y1:5}}]}]}]},500,200),/bounds/);
});

test('DOM reference contains only observed text, never goals, URLs or answers',()=>{
 assert.deepEqual(referenceText({url:'https://secret.test/',state:{goal:'ANSWER',screen:{title:'価格',text:['税込'],elements:[{id:'e1',text:'購入',href:'https://secret.test'}]}}}),['価格','税込','購入']);
 assert.throws(()=>referenceText({other:true}),/screen/);
});

const fixture:OcrDocument={source:'sample.png',width:500,height:200,engine:'Tesseract.js 7',languages:['jpn','eng'],createdAt:'2026-09-20T00:00:00Z',initializationMs:1000,recognitionMs:1234,lines:[{id:'ocr-1',text:'¥500 <script>window.pwned=1</script>',confidence:90,bbox:{x0:100,y0:40,x1:200,y1:80}},{id:'ocr-2',text:'税込',confidence:40,bbox:{x0:210,y0:60,x1:250,y1:80}}],reference:['ご利用料金']};

test('report links selectable text to image-relative boxes, supports keyboard and narrow screens',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  await page.setContent(ocrReport(fixture));
  assert.equal(await page.evaluate(()=>Object.hasOwn(window,'pwned')),false);
  await page.getByRole('button',{name:/¥500/}).focus();await page.keyboard.press('Enter');
  assert.equal(await page.locator('[data-box="ocr-1"]').getAttribute('data-selected'),'true');
  assert.equal(await page.getByRole('button',{name:/¥500/}).getAttribute('aria-pressed'),'true');
  const position=await page.locator('[data-box="ocr-1"]').evaluate(el=>({left:(el as HTMLElement).style.left,top:(el as HTMLElement).style.top,width:(el as HTMLElement).style.width}));
  assert.deepEqual(position,{left:'20%',top:'20%',width:'20%'});
  await page.getByLabel('枠を表示').uncheck();assert.equal(await page.locator('.overlay').isVisible(),false);
  assert.equal(await page.getByRole('button',{name:/¥500/}).isVisible(),true);
  await page.getByLabel('文字を検索').fill('税込');
  assert.equal(await page.getByRole('button',{name:/¥500/}).isVisible(),false);
  assert.equal(await page.getByRole('button',{name:/税込/}).isVisible(),true);
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.setContent(ocrReport({...fixture,lines:[],reference:undefined}));
  assert.match(await page.locator('body').innerText(),/文字を認識できませんでした/);
 }finally{await browser.close();}
});
