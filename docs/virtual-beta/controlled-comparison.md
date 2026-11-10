# 予算・seed・機構を分離した比較

2026-11-09JST。[Issue2](https://github.com/MaekawaAo0604/jev-ux-poc/issues/2)の測定基盤と[Issue3](https://github.com/MaekawaAo0604/jev-ux-poc/issues/3)の一要因比較を対象にする。Issueの参照先はfoundation5f7051d、今回の基準はinformation-state037c754。既存実装を流用し、変更前の実験結果を上書きしない。[人間比較のIssue4](https://github.com/MaekawaAo0604/jev-ux-poc/issues/4)の一致度・品質問題検出性能は今回の検証対象に含めない。

## 追加したもの

- `--comparison-plan FILE`：条件×反復seedの計画を事前保存し、各runへ独立したAPI上限を割り当てる。合計割当が48を超えるplan、同じ反復seed、条件ID重複、予算不足のphase ledgerは事前拒否。既存48/12の安全上限を変更しない。
- seedは条件間で対応させ、反復間で変える。ローカルsamplerをrunごとに作り直し、外部モデルの非決定性と分ける。条件順は固定した巡回で、今回の3反復では4/6条件の全位置を完全には釣り合わせられない。
- planned/attempted/completed/censored/invalid/missing、要求予約/HTTP実要求/モック段階、未知コスト、APIアダプター待機時間を別保存する。API_LIMITなどの上限と自発的なABANDONED、API障害を混同しない。
- raw・画像・trace・設定・sourceをhashで束ね、checkpointと既存ビューアーへ接続する。候補や意味判断の差し替えで結果を作らない。

## 独立した設定

任意の`BetaConfig.factors`を追加した。未指定の旧4条件と通常CLIは互換経路を通る。

```json
{"informationChannel":"image-state","extraActions":{"look":false,"reread":false,"wait":false,"abandon":false}}
```

`informationChannel`は`image-state`または`dom-state`。画像のみでは全画面でも候補を匿名化し、DOM screen/history/visibleTextを送らない。DOM条件では現在のDOM文字と候補名を渡すが、無制限の履歴を送らない。DOM条件は全画面に限る。画像・文字・候補ラベルという情報経路の束であり、画像変換だけの比較ではない。

追加候補のlook/reread/wait/abandonは記憶とは独立し、既存のUI操作・done/stuckを共通にする。注視だけではUI操作しない。`behavior`と`selection.mode/seed`は既存設定を使う。

状態engineは有効にそろえ、記憶なしは`memoryCapacity:0`、ありは3にする。現在の観察・固定Persona期待をそろえたまま、保持記憶だけを変える。この最初の契約は単段の基本runnerに限定し、deliberation/experience/native条件抽出などの高次profileとの併用を拒否する。最新の複合profile全ての要因分離を完了したとは扱わない。

## 固定した比較

[study.json](../../experiments/virtual-beta/controlled-v1/study.json)と12個のplanを保存した。既存reference通知停止UI、同じ目的・初期画面・初心者A（専用PC）の定義を共通にする。

予算比較は旧4条件×上限3/6/12×seed3001/3002/3003で36枠。一要因比較は共通baseと、samplingだけ・記憶容量だけ・追加候補だけ・方策質問だけ・DOM情報経路だけを変えた6条件×3seedで18枠。合計54予定、最大360要求の割当、並列1/retry0。全体45分、各batch10分。残り時間がbatch上限より少ない場合は新規batchを開始しない。障害・3連続の信頼できるモデル不正・source/会計/安全/監査の不整合は停止し、欠測を置換しない。

## 実行方法

新しいoutとledger名を使う。例はcap6/seed3001の4条件、最大24要求。

```powershell
Set-Location "C:/Users/Maekawa Ao/.codex/worktrees/virtual-beta/Ux_test"
$budgetFile = 'reports/my-controlled-budget.json'
if (Test-Path -LiteralPath $budgetFile) { throw '既存台帳を上書きしないでください' }
@{schemaVersion=1;status='APPROVED';phase='my-controlled';newMaximum=24;perRunMaximum=12;used=0;attempts=@()} | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $budgetFile -Encoding utf8
npm run experiment:virtual-beta -- --comparison-plan experiments/virtual-beta/controlled-v1/budget-cap6-seed3001.json --phase-budget $budgetFile --persona experiments/persona/clear-notifications-v1/a.json --env-file E:/ChatGPT/Ux_test/.env --out reports/my-controlled-run
```

APIゼロの疎通では`--mock`を使い、`--phase-budget`を渡さない。原本と比較JSON/CSV/HTML、trace、状態・分布・実操作はout内へ保存する。APIキーは.envから読むだけで、ログやコミットへ含めない。過去の人間記録をモデル入力に使わず、保存入力の直接再送も行わない。

## 検証と版

実行sourceは194ファイル、hash `b8c1b8087a05baf5c1c9f0988d08c86caaa21e2a7896ae9a743311b8cc815ee8`。[実行ソースZIP](controlled-source-b8c1b808.zip)にバイト列と入力hashを保存する。実行時のcommitは037c754上の未コミット差分で、公開時のcommitと分ける。

親の統合62テスト・build、実装担当13テストと純粋投影7テスト、独立の初回11テストが成功した。解析器11/11・独立16/16・最終buildも成功した。既存viewerを含む独立検証は33成功/Windows symlink権限の既存skip1/失敗0で、独立16件と重複するため足し合わせない。既知の全体npm test未合格を今回の関連テスト成功で置き換えない。途中のfixture構文/charset不備、viewer既定フィルタのテスト期待修正、独立再現した注視除外のreplay不具合はそれぞれのログに残す。

## 実モデル結果

54予定を全て実行し、54原本が監査通過、実HTTP199要求・199判断、無効0・未実行0・API失敗0。上限以外で終了39、資源上限による打切り15（API11/UI4）。39には主観的完了33とSTUCK6を含み、39件の達成という意味ではない。客観的達成37は打切り試行も含むため、主観的完了や打切りの件数と別に読む。自発的なABANDONEDは0。実コストはproviderから全要求分を取得できずnullで、0ドルとしない。

[全試行JSON](controlled-results.json)、[試行別CSV](controlled-trials.csv)、[全操作・理由・分布のJSON](controlled-paths.json)、[実行phase](controlled-phase.json)。局所の全画面・モデル入力画像・trace・原本は[一覧4179](http://127.0.0.1:4179/)で確認できる。保存分布の数学的argmaxとモデル提案、sampling後の選択、実操作を分けた。

### 予算比較で観測したこと

- currentは全3seed・全3上限で、2回のUI操作から主観的完了し、客観的達成も成立。
- visionは上限3/6で各3件ともAPI_LIMIT、上限12では各3件ともUI_ACTION_LIMIT。上限を増やしても、繰り返し操作と画面認識・判断の課題が残った。予算不足だけの問題ではない。コードが正しいターゲットを実行したことと、モデルの選択の妥当性は別である。
- stateは各上限で3件のうち1件が打切りだったが、客観的な通知停止は全9件で成立した。操作後の主観的完了前に打切られた場合を、目的未達や離脱に一括変換しない。
- combinedはSTUCKも含み、上限12で3件とも資源上限以外の終了になったが、主観的完了は1件だけ。完走を達成率へ読み替えない。

### 一要因比較で観測したこと

基準base・記憶3・追加候補・goal方策・DOM経路は各3回とも「通知設定→停止→done」。この簡単な画面では、記憶・追加候補・方策・DOMの変更による実操作の差は確認できなかった。追加候補は提供したが、look/reread/wait/abandonはこの18枠では選ばれなかった。

samplingだけの条件は2回が同経路、seed3003の最後だけstuckになった。停止表示が出た画面でモデル提案はdone、確率done0.78/stuck0.01、保存draw0.9901651300024241でstuckを選択。実操作の停止自体は成功済み、主観的完了はfalse。これは抽選の実装不具合ではなく保存seed/分布で再現し、同じ保存分布のargmaxはdoneだった。モデルの確率を人間の行動頻度として校正した証拠はなく、こうした動きが人間に合うとは認定しない。対策としてstuckを一律に削除して正解へ誘導もしない。

全体ではsampling79判断のうち23件が、同じ保存分布の数学的argmaxと異なった。これはその保存状態での選択規則の違いで、argmaxにした場合の全探索経路や人間の反実仮想ではない。全51初期比較（機構15組/予算36組）は、許可した差分と同じ初期画面を確認できたが、後続のモデル出力のばらつきは残る。3反復の記述的pilotで有意差や人間一致を認定しない。

## 独立監査・修正・実行版

[事前検証](controlled-independent-preflight.json)、[実原本の監査](controlled-independent-actual.json)、[公開版での再監査](controlled-independent-publication-actual.json)、[保存データの照合](controlled-independent-preservation.json)、[独立最終報告](controlled-independent-final.json)、[解析器の独立レビュー](controlled-independent-analysis.json)、[親の検証記録](controlled-parent-verification.json)。54回のreplay、199要求/判断、452PNG、54trace ZIPのCRCとhash、入力・設定・実選択を独立照合した。過去10,954ファイルは内容を解釈せずhashだけで照合し、変更0。検証担当の外部API要求は0。

独立検証が見つけたLOOK上限時のreplay不具合をREDで再現し、実行と同じ除外分布で不正応答を再現するよう修正した。設定削除で検証を迂回するケースと、終端の選択/実操作欠落も回帰検査を追加した。元の失敗ログを削除しない。

実験終了後に、未実行行がbaselineと表示されるP2を修正した。固定Personaを継承しつつ、実記録でPersonaがない場合と明示nullはbaselineを維持する。実行source b8c1b808から公開source c91a8213への差分は、この[viewer-data](../../runner/exploration-viewer-data.ts)だけで、モデル入力・方策・実行・rawは不変。[公開版のsource記録](controlled-publication-source.json)に194ファイルの差分を残し、原本を公開版で再監査した。

モックphaseは4batch/18試行/72擬似段階・実API0で、実モデル性能の分母に含めない。全体の実行用[driverスナップショット](controlled-phase-driver.snapshot.txt)はprovenance用。マシン固有の過去rawを要求するため、新しいcloneでは上記の単batch CLIとテストを入口にする。実行時のsource ZIPと公開commitを混同しない。

```powershell
node --import tsx --test --test-concurrency=1 tests/controlled-comparison-plan.test.ts tests/controlled-comparison-runner.test.ts tests/controlled-comparison-cli.test.ts tests/controlled-factor-wiring.test.ts tests/controlled-protocol.test.ts tests/virtual-beta-factors.test.ts tests/controlled-study-analysis.test.ts tests/controlled-viewer-persona.test.ts
npm run build
node --import tsx scripts/analyze-controlled-study.ts --phase reports/controlled-comparison-2026-11-09/live-r1/phase.json --out reports/my-controlled-analysis
```

解析コマンドは保持した全54原本を読むオフライン処理で、新規API要求はない。公開解析JSON/CSV/画像は全体結果と例の参照用で、全raw/traceはローカルに保持する。

## 残る作業

Issue2の比較経路は実装・実測したが、旧CLIの共有予算経路は互換用に残る。Issue3は基本runnerの5機構を分離した段階で、高次状態profileとの組合せ、視覚制約だけを変えた対照、別課題への移植、モデル確率の校正は未完了。Issue4の対応する人間集団・未使用課題での一致度と品質問題検出力は未検証。Issueの自動closeやコメント送信は行わない。

優先P1は、予算を十分にした上で、同じimage-state/方策/選択法から視覚制約だけを変える対照を固定し、繰り返し箇所の入力画像・候補・記憶・選択を追うこと。次にsamplerの確率と人間の行動頻度を分離した校正評価、知識/経験だけを変えるPersona対照を設計する。達成や経路差だけで人間再現の成功としない。

## 代表画像

- [initial-full-model](controlled-frames/initial-full-model-bea8c424a1456af4013d4eb99b451db78f00e31565084ab284513839dcb79802.png)：factor-base-seed-3001、判断1のaction要求に配送した画像。
- [vision-before-first-action](controlled-frames/vision-before-first-action-5bc229cc439823e85908c7de09575cb9f36acda396a80cdca0baeea0ff3e0049.png)：vision-seed-3001、判断1のaction要求に配送した画像。
- [vision-after-first-action](controlled-frames/vision-after-first-action-2774ad3f6c5c84a0cc3b7e4b71a2d1e2c1acd11d4889b310946b5293922fb095.png)：vision-seed-3001、判断2のaction要求に配送した画像。
- [sample-stuck-after-completion](controlled-frames/sample-stuck-after-completion-d2f93f9342a9cf59dea351b80383b3932625be65e231635b1e1d72b5dd5a06da.png)：factor-sample-seed-3003、判断3のaction要求に配送した画像。

[画像対応JSON](controlled-frames.json)にrawSHA・run・判断・選択を保持する。例の選択は54件の分母を変えない。
