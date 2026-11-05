import assert from 'node:assert/strict';
import {readFile,writeFile,access} from 'node:fs/promises';
import {resolve,join,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';

const root=resolve(process.argv[2]),invalidRoot=resolve('reports/prompt-language-2026-10-19T12-15-28.911Z');
const hash=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
const raw=await readFile(join(root,'comparison.json')),data=JSON.parse(raw.toString());
const summary=JSON.parse(await readFile(join(root,'summary.json'),'utf8'));
assert.equal(data.dryRun,false);assert.equal(data.requests.length,30);assert.equal(data.responses.length,30);
assert.equal(summary.errors,0);assert.ok(data.responses.every((r:any)=>r.status==='RECORDED'&&r.response.model===data.model));
for(const fixture of data.fixtures){
 assert.equal(hash(await readFile(fixture.sourceImage)),fixture.imageSha256);
 for(let repeat=1;repeat<=5;repeat++){
  const pair=data.requests.filter((r:any)=>r.step===fixture.step&&r.repeat===repeat);
  assert.equal(pair.length,2);assert.deepEqual(pair[0].state,pair[1].state);
  assert.equal(pair[0].imageSha256,pair[1].imageSha256);assert.equal(pair[0].model,pair[1].model);
  for(const r of pair){
   assert.equal(hash(JSON.stringify(r.state)),fixture.stateSha256);
   assert.ok(!JSON.stringify(r.questions).includes(r.state.screenshot),'opaque asset ID must not collide with instructions');
   assert.ok(!JSON.stringify({state:r.state,questions:r.questions}).includes('expectedRepair'));
  }
  for(const id of Object.keys(pair[0].questions))assert.deepEqual(Object.keys(pair[0].questions[id].criteria),Object.keys(pair[1].questions[id].criteria));
 }
}
const group=(step:number,language:string)=>summary.groups.find((g:any)=>g.step===step&&g.language===language);
const linkJA=group(23,'ja'),linkEN=group(23,'en'),positiveJA=group(6,'ja'),positiveEN=group(6,'en');
const invalidBytes=await readFile(join(invalidRoot,'comparison.json')),invalid=JSON.parse(invalidBytes.toString());
const probes=[];
for(const file of ['validation-probe.json','validation-probe-single-en.json','validation-probe-single-ja.json','validation-probe-full-en-opaque.json','validation-probe-full-ja-opaque.json']){
 const bytes=await readFile(join(invalidRoot,file)),probe=JSON.parse(bytes.toString()),body=JSON.parse(probe.body);
 probes.push({file:join(invalidRoot,file),sha256:hash(bytes),status:probe.status,usage:body.usage,error:body.error?.message});
}
const findings={linkScreen:{japaneseObserved:linkJA.repair.observed,englishObserved:linkEN.repair.observed,repeats:5},
 positiveScreen:{japaneseObserved:positiveJA.repair.observed,englishObserved:positiveEN.repair.observed,repeats:5},
 interpretation:'The translated English instructions removed the link-screen false-positive in these five repetitions while preserving the positive control. This does not prove a general language-only cause or end-to-end success.',
 invalidPhase:{root:invalidRoot,sha256:hash(invalidBytes),completed:invalid.responses.length,errors:invalid.responses.filter((r:any)=>r.status!=='RECORDED').length,excludedFromComparison:true,
  description:'English requests with common asset name current failed with max_tokens_exceeded; opaque reference ID alone restored HTTP200. Extra image expansion is the likely mechanism, not verified provider internals.',probes}};
let html=await readFile(join(root,'index.html'),'utf8');
const finding=`<section class="completion-audit" id="language-findings"><h2>今回の結果</h2><p>修復手順へのリンクがある画面で「方法を確認できた」と判定した回数は、日本語指示 ${linkJA.repair.observed} / 5、英語指示 ${linkEN.repair.observed} / 5 だった。具体的な修復方法の画面は、日本語 ${positiveJA.repair.observed} / 5、英語 ${positiveEN.repair.observed} / 5 だった。</p><p>この保存画像では英語版の指示で誤判定が減った。ただし、日本語 Goal は固定したままで、英訳には表現の違いもある。日本語全般の弱さだけを原因と断定したり、探索全体が直ったと判断したりはしない。本番 Prompt は変更していない。</p><details><summary>最初の比較を除外した理由</summary><p>最初は英語 15 件が入力上限エラーになった。画像名 current を固有 ID に変えるだけで応答できたため、両言語とも固有 ID にそろえて取り直した。失敗した呼出しは精度の比較に含めていない。本番は元から固有 ID を使っている。</p></details></section>`;
if(!html.includes('id="language-findings"'))html=html.replace('<section class="completion-audit">',finding+'<section class="completion-audit">');
html=html.replaceAll('<p>全分類：','<p style="overflow-wrap:anywhere">全分類：');
await writeFile(join(root,'index.html'),html);
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const response=await page.goto(`http://127.0.0.1:5173/reports/${basename(root)}/index.html`);assert.equal(response?.status(),200);
 const images=await page.locator('img').evaluateAll(nodes=>nodes.map(n=>{const image=n as HTMLImageElement;return {complete:image.complete,width:image.naturalWidth,src:image.src};}));
 assert.equal(images.length,3);assert.ok(images.every(i=>i.complete&&i.width>0));
 const urls=await page.locator('a[href]').evaluateAll(nodes=>nodes.map(n=>(n as HTMLAnchorElement).href));
 for(const href of new Set(urls)){const u=new URL(href);assert.equal(u.hostname,'127.0.0.1');await access(resolve('.'+decodeURIComponent(u.pathname)));}
 await page.screenshot({path:join(root,'desktop.png')});await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:join(root,'mobile.png')});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
 const qa={http:200,sourceImages:3,localLinksChecked:new Set(urls).size,pageErrors:errors,mobileOverflow:false,pairedStateChecks:15};
 await writeFile(join(root,'qa.json'),JSON.stringify(qa,null,2));
 await writeFile('docs/experiments/2026-10-19-prompt-language-results.json',JSON.stringify({...summary,comparisonSha256:hash(raw),findings,qa},null,2));
}finally{await browser.close();}
assert.deepEqual(await readFile(join(root,'comparison.json')),raw);
console.log(JSON.stringify({root,findings:findings.linkScreen,positive:findings.positiveScreen,rawUnchanged:true}));
