# 注視の選び直し：同条件のあり／なし比較

2026-11-09 JST。**独立した注視判断を実装したが、今回の比較では往復を改善できなかった。** 同じ初心者A・通知設定課題でcrop／周辺ブラー×注視判断OFF／ONを各3回、計12試行・実Jev114要求。人間の再現性や別課題への安定性は未検証。

## 実装と基準

基準commitは9e403ae。前段の視覚制約比較で、制限視野12件が同じ注視のまま通知設定とbackを繰り返した。既存画像変換・候補化・UI実行を流用し、attention.enabledを設定で切り替える。OFFの入力・質問・候補・選択を維持する。

ONではUI判断の前に、配送された画像と容量3の利用可能な観察記憶だけで、continue（今の視野で従来判断を続ける）／従来の4地点へのlookをモデルが選ぶ。lookを選ぶとUIを操作せず、次の判断で新しい画像を観察する。continueなら別要求で従来の行動選択へ進む。注視とUI判断は独立sampler、分布・フィルタ・選択・要求数を記録する。モデル分布を人間の行動頻度と扱わない。

正解地点・目標部品の矩形・DOM・監査画像・oracleは注視モデルに渡さない。一般的な四分点は従来と同じ。再訪禁止、クリック後の自動注視リセット、正解経路の登録は追加していない。人物仕様とチャーターの分離を維持する。

担当Aはjev/virtual-beta/attention.tsと専用テスト、担当Bはcore・factor replay・generic replayと専用テスト。親は共通設定・型、protocol、比較driver・解析、viewer、統合を担当。新しい独立検証担当が別途テストと原本照合を行った。依存追加・学習モデル採用なし。既存のtransformVision、factor projection、sampler、通常Jev adapter、PhaseBudgetを接続した。動的注意や視線学習が解決済みとはしない。

## 固定した比較

[studyと3plan](../../experiments/virtual-beta/attention-reselection-v1/study.json)。各視覚モードでattentionだけを変更し、Persona・goal方策・argmax・image-state・記憶3・既存look候補をそろえた。初期1280×900／fixation(640,450)、全試行の初期fingerprintは一致した。

seed5001／5002／5003は対応割当とローカルsampler用で、外部モデルのseedは制御していない。各試行UI6／look4／判断8／API12／150秒、各batch48要求以内、全体144要求以内・45分・並列1・retry0。要求の追加も介入に含まれる。同じAPI上限ではONの判断機会が少なくなるため、共有した先頭6判断を操作比較の主な根拠とした。配置・課題・Personaを同時変更していない。

## 実測結果

[試行別結果](attention-results.json)、[判断別境界診断](attention-timeline.json)、[実行phase](attention-phase.json)。12原本はreplayと台帳照合を通過し、無効・未実行・基盤障害0。全12件は上限による打切りで、自発的離脱や正常完了とは数えない。

- OFF：crop3件／周辺ブラー3件とも、各7判断・7要求・6UI・1lookでUI_ACTION_LIMIT。
- ON：crop3件／周辺ブラー3件とも、各6判断・12要求・5UI・1lookでAPI_LIMIT。
- 追加した注視判断は36/36回でcontinue。そこから直接選ばれたlookは0回。
- 全12件の最初の通常判断はlook(960,675)。その後の通知設定→back→通知設定→backの往復が残った。対応6組の共有する先頭6判断の実行内容は一致した。
- 注視は全12回でUI操作0、次のfixation一致、raw画面不変、新たにe5が候補化。追加部品が注視を変えた実証ではない。
- 客観的達成・主観的完了とも0/12。ただし主評価は達成率ではなく動きで、注視切替と往復の改善を確認できなかった。

同じ意味のUI操作の反復はOFF各4回、ON各3回だが、ONがAPI上限で早く切られた差であり、改善と数えない。API待ち時間とモデル上のユーザー行動時間は別フィールドで、後者はnull。人間操作時間も今回取得していない。

## 何が残ったか

観測事実：ONの通知画面12訪問で、注視判断の説明カテゴリはuncertaintyだったが、実選択はcontinueだった。その後の通常判断がbackを選んだ。候補・分布・実操作の不一致は確認されていない。

設計上の仮説：continue1候補とlook4候補を直接argmax比較しており、「視野を変えるか」と「どこを見るか」を同じ分布で扱っている。36判断中4件ではlook4候補の合算がcontinueを上回るが、各地点単独はcontinueより小さかった。これは保存分布の算術であり、二択の質問を出せば同じ確率や行動になる証拠ではない。

優先する次タスクは、視野変更の要否と注視先選択を別の判断として比較し、現在の視野で得られる根拠と新しい視野で確かめたい内容を対応づけること。正解座標の指定やループ禁止で救わない。今回の否定的結果と分けて事前固定し、同じ課題に加えて配置を変えた別課題で検証する。Persona差・人間との一致・UX問題発見力はその後に別途評価する。

## 検証と修正

[独立事前検証](attention-independent-preflight.json)、[実原本の独立検証](attention-independent-actual.json)、[動きの集計の独立再計算](attention-independent-comparison.json)、[比較の補足照合](attention-independent-addendum.json)、[過去記録の保全](attention-independent-preservation.json)、[親の検証](attention-parent-verification.json)、[独立最終レビュー](attention-independent-final.json)。12原本・114要求・282成果物hashを照合し、全12 replayが通過した。親の対象回帰91件は90通過・既存Windows symlink権限による1skip、実ブラウザーの通常比較runnerのモック疎通1件・解析単体1件も通過。独立で既存対象80件、新規6件、解析器の実原本1件・改ざん8件、型チェック・Vite buildが通過した。過去12,255ファイルはハッシュだけで照合した。専用テストは一意の出力先を使い、無視対象の実原本を持たないcloneでは原本依存の検証だけを未検証としてskipする。リポジトリ全体のテスト合格は主張しない。全体テストの途中実行はVite権限制約等の既存失敗が出て停止しており、合格として扱わない。

実装中、架空の注視エラーをreplayが受け入れる問題を回帰テストで検出し、エラー内容・終了理由・会計を対応付ける検証を追加した。独立検証では解析器が固定予定表とON/OFFの存在、モック／実モデルの種別を十分に照合しないP2を指摘。actorを変えず解析器だけを修正した。独立テストの2件は「注視後に見えなくなった候補を提案」「既存の現在観察slotを空と想定」というfixtureの誤りで、製品側は変更していない。初期失敗と修正理由はローカル記録に残す。

## 実行方法

単batch4試行、最大48要求。既存のout／台帳を上書きしない。別seedはplanのseed5002.json／seed5003.jsonで別台帳・別outを使う。

```powershell
$budgetFile = 'reports/my-attention-budget.json'
if (Test-Path -LiteralPath $budgetFile) { throw '既存台帳を上書きしないでください' }
@{schemaVersion=1;status='APPROVED';phase='my-attention';newMaximum=48;perRunMaximum=12;used=0;attempts=@()} | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $budgetFile -Encoding utf8
npm run experiment:virtual-beta -- --comparison-plan experiments/virtual-beta/attention-reselection-v1/seed5001.json --phase-budget $budgetFile --persona experiments/persona/clear-notifications-v1/a.json --env-file E:/ChatGPT/Ux_test/.env --out reports/my-attention-run
node --import tsx --test --test-concurrency=1 tests/virtual-beta-attention.test.ts tests/virtual-beta-attention-runtime.test.ts tests/virtual-beta-attention-config.test.ts tests/attention-reselection-protocol.test.ts tests/attention-comparison-wiring.test.ts tests/attention-reselection-analysis.test.ts tests/attention-independent.test.ts
npm run build
```

APIゼロのChromium疎通はattention-comparison-wiring.test.ts。モックで通ったものと実Jev114要求の結果は別記録。保存済み入力の直接再送や人間のログの送信は行っていない。

[ローカル一覧](http://127.0.0.1:4181/)は全試行表示で12件を確認できる。各判断のモデル入力画像、注視判断の入力・分布・応答、従来の行動判断、実操作、終了理由を表示する。注視だけで行動要求を送らなかった場合は、行動画像をpreparedと表示する。原本・全画像・traceはreports/attention-reselection-2026-11-09/live-r1、集計はanalysis-r1に保持する。

## 実行版

feature/virtual-beta-information-state上に統合。実行時revision9e403ae＋今回の未コミット変更、sourceHash **3decbfde991586a623258781f440024255dda55c125ca293c1c950f2a9b6d46a**、actor195ファイル。[実行バイト列ZIP](attention-source-3decbfde.zip)・[解析器とdriverの実バイト列](attention-analysis-source.zip)でGit改行正規化と区別する。実行中のactor・入力変更はゼロ。コミット後の版・保存物は別途照合する。
