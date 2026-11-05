import {test} from 'node:test';
import assert from 'node:assert/strict';
import {measurementClass,measurementForRun,probabilityLabels,report} from '../runner/report.js';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from 'playwright';

test('structured outcome shows partial information and source links without replacing the original stopping reason',async()=>{
 const html=await renderFixture({reason:'STUCK',goalOutcome:{status:'RECORDED',coverage:'selected-images-only',objectiveVerified:false,items:[
  {text:'料金 <script>',status:'confirmed',evidence:[{id:'v1',step:1,sha256:'a'.repeat(64),phase:'decision'}]},
  {text:'土日の利用',status:'conditional',evidence:[{id:'final',step:3,sha256:'b'.repeat(64),phase:'final'}]},
  {text:'所要時間',status:'unconfirmed',evidence:[]},
 ],warnings:[]}});
 assert.match(html,/今回確認できたこと・未確定のこと/);assert.match(html,/条件付きの案内/);assert.match(html,/観測範囲では未確認/);
 assert.match(html,/料金 &lt;script&gt;/);assert.match(html,/href="#trial-0-screen-final"/);assert.match(html,/途中停止/);
 assert.doesNotMatch(html,/data-outcome="success"/);
});

test('structured outcome API errors are reported separately, not as missing site information',async()=>{
 const html=await renderFixture({reason:'JEV_DONE',goalOutcome:{status:'ERROR',items:[],error:{code:'HTTP_ERROR',statusCode:400}}});
 assert.match(html,/結果整理に失敗/);assert.match(html,/HTTP 400/);assert.match(html,/Jevが完了と判断/);
});
test('outcome evidence links can reach the final frame even when legacy completion audit is absent',async()=>{
 const html=await renderFixture({reason:'STUCK',steps:[step(1,'案内','https://example.test/','STUCK','stuck')],goalOutcome:{status:'RECORDED',items:[],warnings:[],observations:[{id:'final',phase:'final',step:2}]}});
 assert.ok(html.includes('id="trial-0-screen-final"'),'the selected final image must have a real report anchor');
});

test('image memory report shows source-linked model judgments without claiming objective evidence or no memory',async()=>{
 const s:any=step(1,'案内','https://example.test/','STUCK','stuck');
 s.visualContext={imageJudgments:{requirements:[{id:'g1',text:'条件 <script>',status:'observed',records:[{assessment:'observed',source:{id:'v1',step:1,sha256:'a'.repeat(64)},model:'TEST'}]}],routes:[{targetId:'f1',assessment:'promising',source:{id:'v1',step:1,sha256:'a'.repeat(64)},model:'TEST'}]}};
 const html=await renderFixture({vision:true,reason:'STUCK',settings:{observationMode:'image-only',visualJudgmentMemory:'enabled'},steps:[s]});
 assert.match(html,/画像由来の判断記録/);assert.match(html,/モデル判断/);assert.match(html,/条件 &lt;script&gt;/);assert.doesNotMatch(html,/<script>/);
 assert.match(html,/href="#trial-0-screen-1"/);assert.match(html,/f1/);assert.match(html,/aaaa/);
 assert.doesNotMatch(html,/過去画像の内容は保持しない/);
});

test('image-only reports distinguish private DOM logs from model inputs and do not claim site UX validity',async()=>{
 const run={reason:'STUCK',vision:true,settings:{observationMode:'image-only',completionAuditInput:'disabled'}};
 assert.equal(measurementForRun(run),'unknown');
 const html=await renderFixture(run);
 assert.match(html,/画像のみ/);assert.doesNotMatch(html,/画像 \+ DOM/);
 assert.match(html,/DOM.*送信していません/);assert.match(html,/過去画像/);
});

test('readable negative outcomes stay UX observations while unreadability and audit errors are qualified separately',()=>{
 const base={reason:'STUCK',steps:[step(1,'案内','https://example.test/','STUCK','stuck')],visualCompletionAudit:{status:'RECORDED',assessment:'insufficient',warnings:[],screens:[{readability:'readable'}]}};
 assert.equal(measurementForRun(base),'ux');
 assert.equal(measurementForRun({...base,visualCompletionAudit:{...base.visualCompletionAudit,screens:[{readability:'unreadable'}]}}),'instrument');
 assert.equal(measurementForRun({...base,visualCompletionAudit:{...base.visualCompletionAudit,status:'ERROR'}}),'instrument');
 assert.equal(measurementForRun({...base,visualCompletionAudit:{...base.visualCompletionAudit,assessment:'uncertain',warnings:['NO_EVIDENCE_SELECTED']}}),'unknown');
});

const stoppedAfterReselection=()=>({number:23,url:'https://example.test/',result:'STUCK',
 state:{screen:{title:'FAQ',text:[],elements:[]}},candidates:{scroll_up:{label:'上にスクロール'}},
 decision:{choice:'stuck',action:{type:'stuck'},recovery:{initialDecision:{choice:'scroll_up',action:{type:'scroll',direction:'up'}},requests:[{model:'TEST'}]}},
 loopAvoidance:{excludedChoices:['e3']},
});
test('a route-reselection stop is not reported as inability to choose the initial action',async()=>{
 const run={reason:'STUCK',steps:[stoppedAfterReselection()]};
 assert.equal(measurementForRun(run),'unknown');
 const html=await renderFixture(run);
 assert.match(html,/別ルート再選択で停止/);
 assert.match(html,/再選択前：上にスクロール/);
 assert.match(html,/再選択後：stuck/);
 assert.match(html,/再選択のモデル呼出し：1/);
 assert.match(html,/元の終了理由：STUCK/);
 assert.doesNotMatch(html,/Jevが次の操作を選べず終了しました/);
 assert.doesNotMatch(html,/data-action-state="executed"/);
});

test('restricted controls are observations, not proof that scope caused a primary-model stop',async()=>{
 const s:any=step(1,'Support','https://example.test/','STUCK','stuck');
 s.state.screen.elements=[{id:'e18',text:'Forum <script>',available:false,unavailableReason:'SAFETY_BOUNDARY'},
  {id:'e19',text:'Unread label',available:false,unavailableReason:'UNOBSERVABLE_LABEL'}];
 const run={reason:'STUCK',steps:[s]};
 assert.equal(measurementForRun(run),'unknown');
 const html=await renderFixture(run);
 assert.match(html,/操作選択で停止/);assert.match(html,/探索制限の観測：1 件/);
 assert.match(html,/Forum &lt;script&gt;/);assert.doesNotMatch(html,/<script>/);
 assert.match(html,/停止との因果は未確定/);
 assert.doesNotMatch(html,/探索範囲外で停止/);
});

test('unrelated blocked links do not turn successful or unqualified primary stops into scope failures',()=>{
 const s:any=step(1,'Home','https://example.test/','STUCK','stuck');
 assert.equal(measurementForRun({reason:'STUCK',steps:[s]}),'ux');
 s.state.screen.elements=[{id:'e1',text:'Other language',available:false,unavailableReason:'SAFETY_BOUNDARY'}];
 assert.equal(measurementForRun({reason:'JEV_DONE',steps:[s]}),'ux');
 assert.equal(measurementForRun({reason:'PAGE_ERROR',steps:[s]}),'instrument');
 assert.equal(measurementForRun({reason:'SAFETY_BOUNDARY',steps:[s]}),'scope');
 assert.equal(measurementForRun({reason:'STUCK',steps:[s],reliability:{middlewareFailures:1}}),'instrument');
});

test('legacy STUCK without a matching terminal decision has unknown decision provenance',async()=>{
 assert.equal(measurementForRun({reason:'STUCK',steps:[]}),'unknown');
 const html=await renderFixture({reason:'STUCK',steps:[]});
 assert.match(html,/停止した判断段階：記録なし/);
 assert.doesNotMatch(html,/Jevが次の操作を選べず終了しました/);
});

test('a stale action decision is not presented as a model STUCK verdict',async()=>{
 const s=step(1,'Home','https://example.test/','STUCK','e1');
 const html=await renderFixture({reason:'STUCK',steps:[s]});
 assert.match(html,/停止した判断段階：記録なし/);
 assert.equal(measurementForRun({reason:'STUCK',steps:[s]}),'unknown');
});

for(const decision of [
 {choice:'stuck'},
 {choice:'e1',action:{type:'stuck'}},
 {choice:'stuck',action:{type:'stuck'},completionCheck:{assessment:'incomplete'}},
 {choice:'stuck',action:{type:'stuck'},recovery:{initialDecision:{choice:'scroll_up',action:{type:'scroll',direction:'up'}}}},
])test(`incomplete legacy decisions remain renderable and unqualified: ${JSON.stringify(decision)}`,async()=>{
 const s:any=step(1,'Home','https://example.test/','STUCK','stuck');s.decision=decision;
 assert.equal(measurementForRun({reason:'STUCK',steps:[s]}),'unknown');
 const html=await renderFixture({reason:'STUCK',steps:[s]});
 assert.match(html,/停止した判断段階：記録なし/);
});

test('missing recovery request records are not displayed as zero model calls',async()=>{
 const s:any=stoppedAfterReselection();delete s.decision.recovery.requests;
 const html=await renderFixture({reason:'STUCK',steps:[s]});
 assert.match(html,/再選択のモデル呼出し：記録なし/);
 assert.doesNotMatch(html,/再選択のモデル呼出し：0/);
});

test('report summary retains the raw reason and includes separately derived diagnostic facts',async()=>{
 const root=await mkdtemp(join(tmpdir(),'jev-stop-summary-'));
 await report(root,[{dir:root,reason:'STUCK',steps:[stoppedAfterReselection()]}]);
 const [saved]=JSON.parse(await readFile(join(root,'summary.json'),'utf8'));
 assert.equal(saved.reason,'STUCK');assert.equal(saved.measurement,'unknown');
 assert.equal(saved.stopAssessment.schemaVersion,1);
 assert.equal(saved.stopAssessment.terminalDecision.stage,'route-reselection');
 assert.equal(saved.stopAssessment.terminalDecision.beforeReselection.choice,'scroll_up');
 assert.equal(saved.stopAssessment.terminalDecision.final.choice,'stuck');
 assert.deepEqual(saved.stopAssessment.terminalDecision.excludedChoices,['e3']);
 assert.equal(saved.stopAssessment.attribution,'undetermined');
});

test('known independent reliability failures cannot count as valid site UX, even with a successful model audit',async()=>{
 const base={reason:'JEV_DONE',visualCompletionAudit:{status:'RECORDED',assessment:'supported',warnings:[],screens:[{readability:'readable'}]}};
 assert.equal(measurementForRun({...base,reliability:{middlewareFailures:1}}),'instrument');
 assert.equal(measurementForRun({...base,reliability:{middlewareFailures:0}}),'ux');
 assert.equal(measurementForRun({reason:'STUCK',reliability:{middlewareFailures:1}}),'instrument');
 const html=await renderFixture({...base,reliability:{middlewareFailures:1}});
 assert.match(html,/独立照合の不一致/);
});

test('visual audits show reached, unreached and instrument errors without rewriting the exploration ending',async()=>{
 for(const assessment of ['supported','insufficient','uncertain']){
  const html=await renderFixture({reason:'STUCK',vision:true,steps:[step(1,'案内','https://example.test/')],visualCompletionAudit:{status:assessment==='uncertain'?'ERROR':'RECORDED',assessment,objectiveVerified:false,evidence:assessment==='supported'?[{id:'v1',step:1,sha256:'a'.repeat(64)}]:[],uncertainEvidence:[],screens:[{}],observations:[{}],warnings:[],...(assessment==='uncertain'?{error:{code:'SOURCE_MISSING'}}:{})}});
  assert.match(html,/画像記録による到達判定/);assert.match(html,/途中停止/);
  if(assessment==='supported')assert.match(html,/href="#trial-0-screen-1"/);
  if(assessment==='insufficient')assert.match(html,/未到達・情報不足/);
  if(assessment==='uncertain')assert.match(html,/監査エラー/);
 }
});
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

test('terminal reasons separate UX difficulty from instrument failure and out-of-scope stops',()=>{
 // Action count is the difficulty signal, so it must only be read as such when
 // the run ended for a reason that is about the site or the agent.
 for(const reason of ['SUCCESS','JEV_DONE','DONE_WITHOUT_SUCCESS','STUCK','LOOP','ACTION_LIMIT'])assert.equal(measurementClass(reason),'ux',reason);
 // Our own tooling broke: the count is inflated by the instrument, not the UX.
 for(const reason of ['ACTION_ERROR','DECISION_ERROR','PAGE_ERROR','GOAL_CONFIG_ERROR','REOBSERVE'])assert.equal(measurementClass(reason),'instrument',reason);
 // Neither: the run left what the tool is allowed or able to observe.
 for(const reason of ['SAFETY_BOUNDARY','UNSUPPORTED_CONTENT'])assert.equal(measurementClass(reason),'scope',reason);
 assert.equal(measurementClass(''),'unknown');
});

test('a run that ended on an instrument failure is marked so its action count is not read as UX difficulty',async()=>{
 const html=await renderFixture({reason:'ACTION_ERROR',steps:[step(1,'ホーム','https://example.test/','ACTION_ERROR')]});
 assert.match(html,/data-measurement="instrument"/);
 assert.match(html,/UXの指標としては使えません/);
});

test('a run that reached an action limit keeps its action count usable as a UX signal',async()=>{
 const html=await renderFixture({reason:'ACTION_LIMIT',steps:[step(1,'ホーム','https://example.test/','ACTION_LIMIT')]});
 assert.match(html,/data-measurement="ux"/);
 assert.doesNotMatch(html,/UXの指標としては使えません/);
});

test('the overview counts how many runs may be aggregated as UX difficulty and summary.json records the class',async()=>{
 const root=await mkdtemp(join(tmpdir(),'jev-report-')),dir=join(root,'trial');await mkdir(dir);
 const base={variant:'good',goalText:'請求書を保存',font:false,repeat:1,dir,fake:false,actionCount:2,backCount:0,loopCount:0,elapsedMs:1200,path:[],steps:[]};
 await report(root,[{...base,reason:'JEV_DONE'},{...base,reason:'ACTION_LIMIT'},{...base,reason:'ACTION_ERROR'},{...base,reason:'SAFETY_BOUNDARY'}]);
 const html=await readFile(join(root,'index.html'),'utf8');
 assert.match(html,/<b>2<\/b><span>UX指標として有効<\/span>/);
 const summary=JSON.parse(await readFile(join(root,'summary.json'),'utf8'));
 assert.deepEqual(summary.map((r:any)=>r.measurement),['ux','ux','instrument','scope']);
});

test('a split sufficiency verdict is shown as a split, not just its majority',async()=>{
 const s=step(1,'料金','https://example.test/','JEV_DONE','done') as any;
 const a=(choice:string)=>({choice,probabilities:{present:choice==='present'?1:0,absent:choice==='absent'?1:0,uncertain:0}});
 s.decision.goalAssessment={coverage:{choice:'complete'},checks:[{text:'料金',choice:'present'}],grounding:{requests:[],checks:[
  {text:'料金',evidence:[{id:'s1-t1',step:1,text:'630円',warnings:[],omitted:false}],relatedEvidence:[],uncertainEvidence:[],
   assessment:a('present'),contradictions:a('present'),assessmentDraws:[a('absent'),a('present'),a('absent'),a('present'),a('present')]},
 ]}};
 const html=await renderFixture({reason:'JEV_DONE',steps:[s]});
 assert.match(html,/十分性の判定：5回中3回 present/);
});

test('a single-draw sufficiency verdict adds no split line',async()=>{
 const s=step(1,'料金','https://example.test/','JEV_DONE','done') as any;
 const a=(choice:string)=>({choice,probabilities:{present:1,absent:0,uncertain:0}});
 s.decision.goalAssessment={coverage:{choice:'complete'},checks:[{text:'料金',choice:'present'}],grounding:{requests:[],checks:[
  {text:'料金',evidence:[{id:'s1-t1',step:1,text:'630円',warnings:[],omitted:false}],relatedEvidence:[],uncertainEvidence:[],
   assessment:a('present'),contradictions:a('present'),assessmentDraws:[a('present')]},
 ]}};
 const html=await renderFixture({reason:'JEV_DONE',steps:[s]});
 assert.doesNotMatch(html,/十分性の判定：/);
});
