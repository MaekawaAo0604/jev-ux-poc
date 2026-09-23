import {test} from 'node:test';
import assert from 'node:assert/strict';
import {probabilityLabels,report} from '../runner/report.js';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from 'playwright';
test('probabilities keep human labels and duplicate labels retain distinct IDs',()=>{
 const text=probabilityLabels({candidates:{e1:{label:'契約情報'},e2:{label:'契約情報'}},decision:{probabilities:{e1:.3,e2:.7}}});
 assert.equal(text,'契約情報 (e2): 70.0%\n契約情報 (e1): 30.0%');
});
test('goal coverage and each information check are displayed separately from action probabilities',async()=>{
 const s=step(1,'条件','https://example.test/','JEV_DONE','done') as any;
 s.decision={action:{type:'done'},choice:'done',probabilities:{},goalAssessment:{coverage:{choice:'complete'},checks:[{text:'対象条件',choice:'present',probabilities:{present:.95,absent:.05,uncertain:0}},{text:'時間 <script>',choice:'present',probabilities:{present:.9,absent:.1,uncertain:0}}]}};
 const html=await renderFixture({reason:'JEV_DONE',steps:[s]});
 assert.match(html,/探索中の到達判定/);assert.match(html,/対象条件/);assert.match(html,/取得済み/);assert.match(html,/時間 &lt;script&gt;/);
 assert.match(html,/操作選択は行っていません/);assert.doesNotMatch(html,/done.*100\.0%/);
});

test('grounded goal progress shows exact quotes and does not label missing direct evidence as confirmed',async()=>{
 const s=step(2,'条件','https://example.test/','ACTION_LIMIT','scroll_down') as any;
 s.decision.goalAssessment={coverage:{choice:'complete'},checks:[{text:'条件',choice:'present'},{text:'時間',choice:'present'}],grounding:{requests:[],checks:[
  {text:'条件',evidence:[],relatedEvidence:[{id:'s1-t1',step:1,text:'登録方法 <script>',warnings:[],omitted:false}],uncertainEvidence:[],assessment:{choice:'present'}},
  {text:'時間',evidence:[{id:'s2-t1',step:2,text:'平日10時 <img src=x onerror=alert(1)>',warnings:['PARTIAL_TEXT'],omitted:true}],relatedEvidence:[],uncertainEvidence:[],assessment:{choice:'present'}},
 ]}};
 const html=await renderFixture({reason:'ACTION_LIMIT',steps:[step(1,'案内','https://example.test/'),s]});
 assert.match(html,/直接の根拠なし/);assert.match(html,/関連する説明/);
 assert.match(html,/登録方法 &lt;script&gt;/);assert.match(html,/平日10時 &lt;img/);assert.doesNotMatch(html,/<img src=x/);
 assert.match(html,/href="#trial-0-screen-2"/);assert.match(html,/s2-t1/);
 assert.match(html,/PARTIAL_TEXT/);assert.match(html,/観察の一部省略あり/);
});

test('report separates subject scope, sufficiency, screening and whole-session accounting',async()=>{
 const s=step(1,'Students','https://example.test/','DECISION_ERROR','stuck') as any;
 s.decisionStage='goal-evidence';s.decision.goalAssessment={coverage:{choice:'complete'},checks:[{text:'hours',choice:'present'}],grounding:{checks:[{text:'hours',evidence:[{id:'s1-t1',step:1,text:'Hours',warnings:[],omitted:false}],scope:{choice:'mismatch'},assessment:{choice:'present'}}],screening:[{key:'x',assessment:{choice:'irrelevant'},evidence:[]}]}};
 const html=await renderFixture({reason:'DECISION_ERROR',steps:[s],evidenceSession:{accounting:{logicalCalls:5,attempts:7,failures:2,questions:19,reusedCalls:3,reusedQuestions:8},interruptedStage:'scope-sufficiency'}});
 assert.match(html,/対象の適合性/);assert.match(html,/対象不一致/);assert.match(html,/情報の十分性/);assert.match(html,/スクリーニング/);assert.match(html,/再利用/);assert.match(html,/scope-sufficiency/);
});

test('rejected quote applicability remains visible without becoming positive evidence',async()=>{
 const s=step(1,'Students','https://example.test/','ACTION_LIMIT','stuck') as any;
 s.decision.goalAssessment={coverage:{choice:'complete'},checks:[{text:'hours',choice:'present'}],grounding:{checks:[{text:'hours',evidence:[],scopeEvidence:[{quote:{id:'s1-t1',step:1,text:'General members <script>',warnings:[],omitted:false},assessment:{choice:'mismatch'}}]}]}};
 const html=await renderFixture({reason:'ACTION_LIMIT',steps:[s]});
 assert.match(html,/直接の根拠なし/);assert.match(html,/引用ごとの対象確認/);assert.match(html,/対象不一致/);
 assert.match(html,/General members &lt;script&gt;/);assert.doesNotMatch(html,/<script>/);
});

test('partial contradiction checks show batch progress without labelling the information complete',async()=>{
 const s=step(1,'料金','https://example.test/','DECISION_ERROR','stuck') as any;
 const proof={text:'料金',evidence:[{id:'s1-t1',step:1,text:'一般 1000円',warnings:[],omitted:false}],scope:{choice:'match'},assessment:{choice:'present'},contradictionSource:'batch-vetoes',contradictionBatchCount:3,contradictionBatches:[{blockKeys:['x<script>'],assessment:{choice:'present'}}]};
 s.decision.goalAssessment={coverage:{choice:'complete'},checks:[{text:'料金',choice:'present'}],grounding:{checks:[proof]}};
 const html=await renderFixture({reason:'DECISION_ERROR',steps:[s]});
 assert.match(html,/<h3>料金：矛盾・例外の照合未完了<\/h3>/);
 assert.match(html,/矛盾・例外の確認：1 \/ 3 バッチ/);
 assert.match(html,/x&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);
});

const step=(number:number,title:string,url:string,result='OK',choice='e1')=>({
 number,url,screenshot:`step-${number}.png`,state:{screen:{title,text:[title],elements:[]}},
 candidates:{e1:{label:'「次へ」をクリック',action:{type:'click',id:'e1'}},stuck:{label:'次の操作が分からない',action:{type:'stuck'}}},
 decision:{choice,action:choice==='stuck'?{type:'stuck'}:{type:'click',id:'e1'},probabilities:{e1:.6,stuck:.4}},result,
});
async function renderFixture(overrides:Record<string,unknown>,screenshots=true){
 const root=await mkdtemp(join(tmpdir(),'jev-report-')),dir=join(root,'trial');await mkdir(dir);
 const result={variant:'good',goalText:'請求書を保存',font:false,repeat:1,dir,fake:false,status:'SUCCESS',reason:'SUCCESS',
 actionCount:2,backCount:0,loopCount:0,elapsedMs:1200,path:[{screen:'ホーム',action:'「次へ」をクリック',result:'画面: 請求書'},{screen:'請求書',action:'「次へ」をクリック',result:'画面: 保存完了'}],
 steps:[step(1,'ホーム','https://example.test/'),step(2,'請求書','https://example.test/invoice')],...overrides};
 if(screenshots)for(const file of ['step-1.png','step-2.png','step-3.png','final.png'])await writeFile(join(dir,file),'fixture');
 await report(root,[result]);return await readFile(join(root,'index.html'),'utf8');
}
test('journey connects successful actions to the final screenshot and Japanese outcome',async()=>{
 const html=await renderFixture({});
 assert.match(html,/aria-label="操作経路"/);
 assert.match(html,/data-outcome="success"/);
 assert.match(html,/処理成功/);
 assert.match(html,/保存完了/);
 assert.equal((html.match(/data-action-state="executed"/g)||[]).length,2);
 assert.match(html,/src="trial\/final.png"/);
});
test('journey marks revisits by URL and observation, and does not execute a blocked loop',async()=>{
 const html=await renderFixture({reason:'LOOP',status:'FAILED',steps:[step(1,'ホーム','https://example.test/'),step(2,'ホーム','https://example.test/other'),step(3,'ホーム','https://example.test/','LOOP')]});
 assert.match(html,/data-outcome="loop"/);
 assert.equal((html.match(/class="revisit"/g)||[]).length,1);
 assert.match(html,/画面 1 と同じ観察状態/);
 assert.equal((html.match(/data-action-state="executed"/g)||[]).length,2);
 assert.match(html,/実行せず停止/);
});

test('report discloses loop avoidance separately from the action Jev actually chose',async()=>{
 const selected=step(1,'案内','https://example.test/') as any;
 selected.loopAvoidance={excludedChoices:['old'],offeredCandidates:{old:{label:'以前の操作 <script>'}}};
 const html=await renderFixture({steps:[selected]});
 assert.match(html,/繰り返しを回避/);
 assert.match(html,/以前の操作 &lt;script&gt;/);
 assert.doesNotMatch(html,/<script>/);
 assert.equal((html.match(/data-action-state="executed"/g)||[]).length,1);
});

test('exploration exclusions show transition reasons without inventing repeated executions',async()=>{
 const selected=step(1,'案内','https://example.test/') as any;
 selected.loopAvoidance={excludedChoices:['old','offRoute','duplicate'],reason:'explored-transition',offeredCandidates:{
  old:{label:'探索したリンク <script>'},offRoute:{label:'経路外へ戻る操作 <img src=x>'},duplicate:{label:'同じリンク & 別の表示'},
 }};
 selected.explorationMemory={stateId:'state-1',revision:4,transitChoices:[],exclusions:{old:'explored',offRoute:'transit-route',duplicate:'duplicate'}};
 const html=await renderFixture({reason:'ACTION_LIMIT',steps:[selected]});
 assert.match(html,/探索したリンク &lt;script&gt;（探索済みの遷移）/);
 assert.match(html,/経路外へ戻る操作 &lt;img src=x&gt;（未試行の操作へ進む再通過経路から外れる操作）/);
 assert.match(html,/同じリンク &amp; 別の表示（同じ遷移の重複候補）/);
 assert.doesNotMatch(html,/2回実行/);assert.doesNotMatch(html,/<script>|<img src=x>/);
 assert.doesNotMatch(html,/未探索候補へ向かう再通過を候補に残しました/);
 assert.equal((html.match(/data-action-state="executed"/g)||[]).length,1);
});

test('allowed transit is disclosed without exclusions or a claim of goal completion',async()=>{
 const selected=step(1,'案内','https://example.test/') as any;
 selected.candidates.route={label:'未探索候補への経路 <script>',action:{type:'back'}};
 selected.explorationMemory={stateId:'state-1',revision:4,transitChoices:['route'],exclusions:{}};
 const html=await renderFixture({reason:'ACTION_LIMIT',successMode:'jev',comparison:'UNVERIFIED',steps:[selected]});
 assert.match(html,/未探索候補へ向かう再通過を候補に残しました：未探索候補への経路 &lt;script&gt;/);
 assert.match(html,/目的達成や対象内容の確認完了を示すものではありません/);
 assert.doesNotMatch(html,/<script>|2回実行/);
 assert.match(html,/data-outcome="limit"/);
 assert.equal((html.match(/data-action-state="executed"/g)||[]).length,1);
});

test('report shows exploration priorities without calling verification-pending items complete',async()=>{
 const selected=step(1,'案内','https://example.test/') as any;
 selected.decision.goalAssessment={coverage:{choice:'complete'},checks:[{text:'料金',choice:'present'}]};
 selected.decision.navigationFocus={priorityGoalChecks:['再入館 <script>'],verificationPendingGoalChecks:['料金']};
 const html=await renderFixture({steps:[selected]});
 assert.match(html,/今回の探索で優先：再入館 &lt;script&gt;/);
 assert.match(html,/一次判定では情報あり・根拠確認は未完了：料金/);
 assert.doesNotMatch(html,/<script>/);
});
test('stuck, perceived completion and API failures remain distinct from confirmed success',async()=>{
 for(const [reason,label,kind] of [['STUCK','途中停止','stuck'],['JEV_DONE','Jevが完了と判断','unverified'],['DECISION_ERROR','判断APIエラー','error'],['ACTION_LIMIT','操作上限','limit']]){
  const html=await renderFixture({reason,status:'FAILED',steps:[step(1,'ホーム','https://example.test/',reason,'stuck')]});
  assert.ok(html.includes(label));assert.ok(html.includes(`data-outcome="${kind}"`));
  assert.equal((html.match(/data-action-state="executed"/g)||[]).length,0);
 }
});
test('missing screenshots and empty trials show placeholders without unsafe HTML',async()=>{
 const html=await renderFixture({goalText:'<script>alert(1)</script>',reason:'PAGE_ERROR',steps:[],path:[]},false);
 assert.match(html,/画面の記録なし/);assert.doesNotMatch(html,/<img /);
 assert.doesNotMatch(html,/<script>alert/);assert.match(html,/&lt;script&gt;/);
 const partial=await renderFixture({steps:[step(1,'<img src=x onerror=alert(1)>','https://example.test/','STUCK','stuck')],reason:'STUCK'},false);
 assert.match(partial,/スクリーンショットなし/);assert.doesNotMatch(partial,/<img /);
});

test('completion audit shows source text without upgrading perceived success or executing HTML',async()=>{
 const html=await renderFixture({reason:'JEV_DONE',successMode:'jev',comparison:'UNVERIFIED',completionAudit:{status:'RECORDED',assessment:'supported',objectiveVerified:false,evidence:[{id:'s2-t1',step:2,source:'dom',text:'¥500 <img src=x onerror=alert(1)>',bbox:{x0:10,y0:20,x1:100,y1:50}}],uncertainEvidence:[],warnings:['NO_EVIDENCE_SELECTED']}});
 assert.match(html,/完了判断の根拠/);assert.match(html,/終了後/);assert.match(html,/客観的な成功確認ではありません/);
 assert.match(html,/href="#trial-0-screen-2"/);assert.match(html,/s2-t1/);assert.match(html,/¥500 &lt;img/);
 assert.doesNotMatch(html,/<img src=x/);assert.match(html,/data-outcome="unverified"/);
 const error=await renderFixture({reason:'JEV_DONE',completionAudit:{status:'ERROR',evidence:[],warnings:['AUDIT_FAILED'],error:{stage:'request',code:'HTTP_ERROR',statusCode:503}}});
 assert.match(error,/根拠の確認に失敗/);assert.match(error,/Jevが完了と判断/);
 assert.match(error,/API通信/);assert.match(error,/HTTP_ERROR/);assert.match(error,/503/);
 const old=await renderFixture({reason:'JEV_DONE'});assert.match(old,/根拠の記録なし/);
});

test('an incomplete audit retains a validated overall assessment without displaying a completed audit',async()=>{
 const html=await renderFixture({reason:'JEV_DONE',completionAudit:{status:'ERROR',assessment:'insufficient',evidence:[],warnings:['AUDIT_FAILED'],error:{stage:'request',code:'HTTP_ERROR',statusCode:503}}});
 assert.match(html,/記録では達成の根拠が不足/);
 assert.match(html,/詳細の確認は未完了/);
 assert.match(html,/根拠の確認に失敗/);
 assert.match(html,/Jevが完了と判断/);
});

test('long journeys scroll within the desktop panel and stack without horizontal overflow on mobile',async()=>{
 const html=await renderFixture({reason:'LOOP',steps:Array.from({length:10},(_,i)=>step(i+1,'画面名が長い場合の表示確認','https://example.test/',i===9?'LOOP':'OK'))},false);
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}});await page.setContent(html);
  const sizes=()=>page.evaluate(()=>{const panel=document.querySelector('.journey')!;return {page:document.documentElement.scrollWidth,viewport:innerWidth,panel:panel.clientWidth,content:panel.scrollWidth,direction:getComputedStyle(document.querySelector('.flow>li')!).flexDirection};});
  const desktop=await sizes();assert.ok(desktop.content>desktop.panel);assert.ok(desktop.page<=desktop.viewport);
  await page.setViewportSize({width:390,height:844});const mobile=await sizes();assert.equal(mobile.direction,'column');assert.ok(mobile.page<=mobile.viewport);assert.ok(mobile.content<=mobile.panel+1);
  const summary=page.locator('.run>summary');await summary.focus();await page.keyboard.press('Enter');assert.equal(await page.locator('.journey').isVisible(),false);
  await page.keyboard.press('Enter');assert.equal(await page.locator('.journey').isVisible(),true);
 }finally{await browser.close();}
});
