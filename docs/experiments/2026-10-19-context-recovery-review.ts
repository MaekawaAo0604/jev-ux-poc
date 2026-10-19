import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {resolve,join,relative,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {report} from '../../runner/report.js';

assert.ok(process.argv[2]&&process.argv[3]&&process.argv[4],'Pass capacity probe.json, reading probe.json, audit validation.json');
const files=process.argv.slice(2,5).map(f=>resolve(f)),buffers=await Promise.all(files.map(f=>readFile(f)));
const [capacity,reading,validation]=buffers.map(b=>JSON.parse(b.toString()));
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
assert.equal(validation.audit.status,'RECORDED');assert.equal(validation.audit.objectiveVerified,false);
const completion=validation.requests.filter((r:any)=>r.stage==='completion');
assert.deepEqual(completion.map((r:any)=>[r.http,r.longContext]),[[400,false],[200,true]]);
assert.equal(completion[0].bodySha256,completion[1].bodySha256);
assert.equal(reading.responses.length,25);assert.ok(reading.responses.every((r:any)=>r.status==='RECORDED'));
const names=['full-batch','checks-only','no-judgment-memory','no-executed-history','current-image-only'];
const groups=names.map(name=>({name,valid:reading.responses.filter((r:any)=>r.name===name).length,
 observed:reading.responses.filter((r:any)=>r.name===name&&r.response.answers.image_check_1.choice==='observed').length}));
const root=resolve('reports',`context-recovery-review-${new Date().toISOString().replaceAll(':','-')}`);await mkdir(root,{recursive:true});
const publicBytes=await readFile(validation.source),raw=JSON.parse(publicBytes.toString());assert.equal(hash(publicBytes),validation.sourceSha256);
await report(root,[{...raw,visualCompletionAudit:validation.audit,variant:'元の探索は変更せず、保存画像の監査のみ修正後で再実行'}]);
const url=(file:string)=>relative(root,file).replaceAll('\\','/').split('/').map(encodeURIComponent).join('/');
const labels:Record<string,string>={'full-batch':'当時の履歴と過去判断あり','checks-only':'操作選択の質問だけ除外','no-judgment-memory':'過去の画像判断だけ除外','no-executed-history':'実行済み操作履歴だけ除外','current-image-only':'履歴と過去判断を除外（項目確認のみ）'};
const notes=`<section class="completion-audit" id="findings"><h2>今回分かったこと</h2>
<p>全体監査の HTTP 400 は、画像の破損ではなく max_tokens_exceeded だった。元の 11 枚は質問を 1 個にしても失敗し、7 枚なら通った。元の 11 枚も長文コンテキストの指定だけを変えると通った。</p>
<p>修正後の本番監査でも回復を確認した。今回は ${completion[0].imageCount} 枚を選択し、通常モードで HTTP 400、同じ本文を長文モードで送ると HTTP 200 になった。監査結果は ${validation.audit.assessment}。画像、質問、Goal、順番は変えていない。</p>
<p>長文モードは全体画像監査が明示的なトークン上限エラーになった時だけ使用する。既存の回数・時間制限内で再試行し、2 回目も上限超過なら停止する。通常の操作選択は変更していない。長文モードは精度が落ちる可能性があるため、使った事実を記録し、客観的な成功証明とは扱わない。</p>
<h2>残る誤判定の切り分け</h2><p>同じ FAQ の保存画像を固定し、各条件 5 回。開発者の画像確認では修復手順への入口だけで、具体的な方法は写っていない。observed を選ぶと誤判定になる。</p>
<ul>${groups.map(g=>`<li>${labels[g.name]}：誤判定 ${g.observed} / ${g.valid} 回</li>`).join('')}</ul>
<p>この入力では、過去の文脈を外すと現在画像の判定が変わった。操作質問を外すだけでは改善しなかった。1 枚だけの実験なので、全サイトの精度や一般的な因果関係は保証しない。項目確認の独立呼び出しへの分離は未実装。</p>
<p><a href="${url(files[0])}">入力容量の比較</a> / <a href="${url(files[1])}">同じ画像の文脈比較</a> / <a href="${url(files[2])}">本番監査の実 Jev 再検証</a> / <a href="${url(join(raw.dir,'step-25.png'))}">誤判定した FAQ 画像</a> / <a href="verification.json">検証記録</a></p>
<p>仕様：<a href="https://docs.typesafe.ai/models#long-context">TypeSafe の長文コンテキスト</a>。保存画像のみを再評価し、今回の調査では公開サイトへの追加アクセスを行っていない。</p></section>`;
const htmlFile=join(root,'index.html'),html=await readFile(htmlFile,'utf8');await writeFile(htmlFile,html.replace('<div class="overview">',notes+'<div class="overview">'));
await writeFile(join(root,'verification.json'),'{}');
const browser=await chromium.launch();let qa;
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors:string[]=[],external:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(new URL(r.url()).hostname!=='127.0.0.1')external.push(r.url());});
 const response=await page.goto(`http://127.0.0.1:5173/reports/${basename(root)}/index.html`);assert.equal(response?.status(),200);
 assert.equal(await page.locator('details.run').count(),1);
 const links=await page.locator('a[href],img[src]').evaluateAll(nodes=>nodes.map(n=>n instanceof HTMLAnchorElement?n.href:(n as HTMLImageElement).src));
 let checked=0;for(const link of new Set(links)){const u=new URL(link);if(u.hostname!=='127.0.0.1')continue;await access(resolve('.'+decodeURIComponent(u.pathname)));checked++;}
 const images=await page.locator('img').evaluateAll(async nodes=>Promise.all(nodes.map(async n=>{const img=n as HTMLImageElement;img.loading='eager';await img.decode();return img.naturalWidth;})));assert.ok(images.every(width=>width>0));
 await page.screenshot({path:join(root,'desktop.png')});await page.setViewportSize({width:390,height:844});await page.screenshot({path:join(root,'mobile.png')});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 qa={http:200,images:images.length,checkedLocalLinks:checked,pageErrors:errors,externalRequests:external,mobileOverflow:false};
}finally{await browser.close();}
for(const [i,file] of files.entries())assert.deepEqual(await readFile(file),buffers[i]);assert.deepEqual(await readFile(validation.source),publicBytes);
const evidence={root,sources:files.map((file,i)=>({file,sha256:hash(buffers[i])})),publicSource:{file:validation.source,sha256:hash(publicBytes)},sourceFilesUnchanged:true,
 productionCode:await Promise.all(['jev/client.ts','runner/visual-evidence.ts'].map(async file=>({file,sha256:hash(await readFile(file))}))),
 capacity:capacity.results.map(({answers,...r}:any)=>r),completionRecovery:completion,assessment:validation.audit.assessment,objectiveVerified:false,readingGroups:groups,readingChangeImplemented:false,qa};
await writeFile(join(root,'verification.json'),JSON.stringify(evidence,null,2));
await writeFile('docs/experiments/2026-10-19-context-recovery-results.json',JSON.stringify(evidence,null,2));
console.log(JSON.stringify({root,qa,groups,assessment:evidence.assessment}));
