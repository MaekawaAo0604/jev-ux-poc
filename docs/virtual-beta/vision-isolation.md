# 視覚制約だけを変えた反復の切り分け

2026-11-09 JST。[前段の比較](controlled-comparison.md)で残った通知設定の往復を調べた。既存actorは変更せず、full／crop／foveatedを、同じ情報経路・質問・選択法・候補語彙・Personaで比較した。記憶容量0／3は別の対応比較にした。人間の視覚や行動を再現したという評価ではない。

## 固定条件と変更範囲

[study.json](../../experiments/virtual-beta/vision-isolation-v1/study.json)と6つのplanに、18枠と上限を保存した。既存reference通知UIで「メール通知を停止して確認する」。Personaは[初心者A・専用PC](../../experiments/persona/clear-notifications-v1/a.json)で共通。初期画面、1280×900、fixation(640,450)、goal方策、argmax、image-state、lookのみ追加する語彙をそろえた。DOM/history/意味付き候補名はfullでも渡さない。正解クリック列は与えない。

各記憶容量でvision.modeだけを変える主比較と、各視覚モードで記憶容量だけを変える副比較を分ける。エンジン有効のままmemoryCapacity0／3にし、現在の観察とPersona期待を維持する。旧legacy vision条件はengine無効等も違うため、新条件との増減を視覚単独の効果へ換算しない。

3視覚×2記憶×3反復＝18枠。seed4001/4002/4003は対応・割当用で、今回argmaxなので抽選結果を変えない。外部モデルのseedは制御していない。視覚3条件の全3位置は各記憶容量で巡回均衡し、記憶ブロック順は交互だが3反復で2位置を完全均衡していない。

6batch各36、合計最大216要求、1試行12要求/UI6/look4/判断10/90秒。各batch10分、全体45分、並列1/retry0。残りがbatch上限未満なら開始しない。障害・source/会計/安全/監査不整合・3連続モデル不正で停止し、失敗枠を置換しない。

追加実装はオフライン境界診断と固定protocol・テスト。runBeta、画像変換、候補化、UI実行、既存制約はそのまま。新規依存・学習・UI修正・自動注視リセット・再訪禁止は追加していない。

## 実測結果

18予定をすべて実行し、実HTTP102要求・102判断。18原本が監査通過、6件が主観的完了かつ客観的達成、12件はUI_ACTION_LIMIT、無効/未実行/基盤障害0。12件を自発的離脱と数えない。

- full：記憶0で3/3、記憶3で3/3達成。経路は通知設定→停止→done、各3判断・2UI操作。
- crop：記憶0/3とも0/3達成。各7判断・6UI操作・1lookでUI上限。
- foveated：記憶0/3とも0/3達成。各7判断・6UI操作・1lookでUI上限。

[全試行・診断JSON](vision-results.json)、[試行別CSV](vision-trials.csv)、[判断別時系列](vision-timeline.json)、[実行phase](vision-phase.json)。[18件の画面・操作一覧](http://127.0.0.1:4180/)で原本・画像・traceも追える。異なる設定の全件を表示する際は一覧の全試行フィルタを選ぶ。

[分布の数値照合](vision-distribution-numeric-audit.json)では、全102判断でモデル提案と選択が一致し、追加の候補除外adjustmentsは0件だった。normalized/filteredの12差分は最大1.67e-16の再正規化差で、選択を変更した補正12件とは数えない。

## どの境界で詰まったか

制限あり12試行はすべて`look_3 → 通知設定 → back → 通知設定 → back → 通知設定 → back`だった。初回look先は(960,675)。以後UI遷移してもfixationが同じ位置に残った。

計36回の通知画面訪問で、監査画面には停止ボタンe3が存在した。ボタン矩形は(330,440.0625,173.3125,50)、鮮明領域は(480,365,800,535)。本体と番号badgeが全て鮮明領域内に入る既存候補化条件を満たさず、e3は提示候補に入らなかった。提示されていたlook_0〜3の追加注視を選ばず、モデルはbackを選択し、実操作はその通りに行われた。

12回のlookはUI操作0、次のfixation一致、raw画面不変を確認し、look後にe5が新しく候補になった。画像配送・座標変換・選択と実操作は一致した。停止ボタンは制限条件で一度も選択・実行されていないため、「停止をクリックしたのに効かなかった」という障害ではない。

記憶3では過去画像は実際に配送されていたが、制限条件の配送済み記憶に、停止ボタンが候補として提示されていた過去の観察は0件だった。今回の記憶容量の追加だけでは、未観察の領域を見る行動へ切り替わらなかった。記憶機能一般が不要、またはモデルが忘れた、と結論しない。

繰り返しは、実行済みUIの意味署名で48回、同一raw画面と同じUI操作に限定すると12回だった。訪問・focus・描画に伴う画素差があるため、全経路を同一画像入力の反復とは呼ばない。lookで同じraw画面を再観察することも、同じUI操作の反復とは分けた。

内部の認識・理解・忘却は測定していない。今回確認できたのは、候補化に必要な領域へ注視が移らず、ボタン未提示の状態で戻るを繰り返したという、提示→選択→実行の境界である。goal方策・初心者A・短い1課題・各3反復の結果で、user方策や他課題・人間集団への一般化は未検証。

## 独立検証と修正

[実原本の独立検証](vision-independent-actual.json)、[診断の再計算](vision-independent-analysis.json)、[公開画像対応](vision-frames.json)、[旧記録の保全](vision-independent-preservation.json)、[親の検証](vision-parent-verification.json)。独立で全102判断の画素・候補・幾何・分布・選択・操作・記憶を再計算して一致を確認した。18 replay、台帳102要求、初期raw一致、DOM/history非配送、注視時のUI操作0を確認した。過去11,852ファイルは内容を解釈せずSHA256だけで照合し、変更0。

独立検証で、同じPNGをcurrentへ重複排除した場合に過去の提示を数え損ねる診断不具合を再現した。履歴filenameの一致ではなく、観察ID・画像hash・実際の配送assetのhashを結び付けて修正した。さらに、選択後の安全/時間停止を実行失敗と混同せず、観察の再表示と実UIの反復を分ける回帰検査を追加した。actorと実モデル出力は変更していない。

protocol3/3、解析18/18、独立6/6、独立重複画像回帰1/1、型/buildが成功した。重複する検査件数は合計しない。モックは6試行・30擬似段階・外部API0で、実モデルの102要求と混ぜない。既知のリポジトリ全体npm test未合格を今回の関連テスト成功で置き換えない。

解析器とテストは末尾空行だけを除去し、[書式差分の独立照合](vision-analysis-format-verification.json)で確認した。旧解析と新解析のCSV・時系列JSONは同一、数値結果は不変。失敗した回帰・旧producer・旧集計はローカルreportへ残した。

## 実行版と保存物

actorの実行版はcommit9682397、194ファイル、sourceHash c91a8213caeb35576e21b0c90c64008b04c016e08db68573bc15c38174fb6389。[実行ソースZIP](vision-source-c91a8213.zip)は194ファイルと9入力hashを含むfreezeを保存する。今回の公開commitではactorを編集していない。

最終解析器のSHAはfb4bf8ff37ef744c3f6cfd50b09af1440c12498e562dd1ce55f47932897305d9。[解析器の実バイト列ZIP](vision-analysis-source-fb4bf8ff.zip)でGitの改行正規化と区別する。[phase driverスナップショット](vision-phase-driver.snapshot.txt)はprovenance用で、過去rawを要求するマシン固有の実験記録。新しいcloneは下記の単batch CLIとAPIゼロのテストを入口にする。全raw/traceはローカルreports、公開物は全体集計と例画像である。

## コマンド

単batch例はmemory0・3視覚条件・seed4001、最大36要求。新しいout/ledger名を使い、既存台帳を上書きしない。

```powershell
Set-Location "C:/Users/Maekawa Ao/.codex/worktrees/virtual-beta/Ux_test"
$budgetFile = 'reports/my-vision-budget.json'
if (Test-Path -LiteralPath $budgetFile) { throw '既存台帳を上書きしないでください' }
@{schemaVersion=1;status='APPROVED';phase='my-vision';newMaximum=36;perRunMaximum=12;used=0;attempts=@()} | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $budgetFile -Encoding utf8
npm run experiment:virtual-beta -- --comparison-plan experiments/virtual-beta/vision-isolation-v1/vision-m0-seed4001.json --phase-budget $budgetFile --persona experiments/persona/clear-notifications-v1/a.json --env-file E:/ChatGPT/Ux_test/.env --out reports/my-vision-run
node --import tsx --test --test-concurrency=1 tests/vision-isolation-protocol.test.ts tests/vision-isolation-analysis.test.ts tests/vision-isolation-independent.test.ts
npm run build
node --import tsx scripts/analyze-vision-isolation.ts --phase reports/vision-isolation-2026-11-09/live-r1/phase.json --out reports/my-vision-analysis
```

モックCLIは`--mock`を付け`--phase-budget`を省く。解析コマンドは保持された原本だけを読むオフライン処理で追加APIはない。人間記録をモデルに送らず、保存入力の直接再送も行っていない。認証値は.envから読み、ログ/公開物へ含めない。

## 次の実装対象

候補が見つからない画面で、新しい領域へ注視を動かす方策を検証する。入力はユーザーに配送された画像・現在の鮮明領域・利用可能な記憶と操作結果に限定し、注視判断をUI操作判断と分けて記録する。backの一律禁止、遷移時の自動リセット、停止ボタンの座標や正解順序の登録で今回の課題だけを救わない。配置を入れ替えた別課題も固定して比較する必要がある。高次profileへの接続、知識/経験単独のPersona対照、人間との一致・UX問題検出力は引き続き未検証。

## 実際に配送した例画像

[画像対応JSON](vision-frames.json)にはrawSHA・判断・選択・鮮明領域・配送記憶を保存する。例の選択は18件の分母を変えない。

- [full-goal-control-offered](vision-frames/full-goal-control-offered-dbd695b776be3bbda208f7c32175dddaedfeb312c96d75ec628cd563c7fd265e.png)：full-m0-seed-4001 判断2
- [foveated-before-look](vision-frames/foveated-before-look-5bc229cc439823e85908c7de09575cb9f36acda396a80cdca0baeea0ff3e0049.png)：foveated-m3-seed-4001 判断1
- [foveated-after-look-entry](vision-frames/foveated-after-look-entry-2774ad3f6c5c84a0cc3b7e4b71a2d1e2c1acd11d4889b310946b5293922fb095.png)：foveated-m3-seed-4001 判断2
- [foveated-goal-not-offered-back](vision-frames/foveated-goal-not-offered-back-9aeb18e0648386b41b8601cf75429fdd33fc69ae5c77de16d6f7e479107a0485.png)：foveated-m3-seed-4001 判断3
- [crop-goal-not-offered-back](vision-frames/crop-goal-not-offered-back-749df656a367614f61b4f6af2e30641a82e9f10ee79dcae902378062fdb9d17b.png)：crop-m3-seed-4001 判断3
