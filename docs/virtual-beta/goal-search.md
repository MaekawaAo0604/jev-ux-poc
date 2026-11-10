# Goalに関する探索結果の記憶

## 対象と変更

基準は `7fdaa5f044292f3316e050a9e2228453d9ab0ba2`。前段階の通知設定では、現在候補と過去経験が対応しても、モデルの元評価がneutral/unknownなどのままで同じ入口を再選択した。候補の対応付け不足と、経験を探索に使う能力の不足は別の問題だった。

今回は既存 `jev/image-judgments.ts` の `ImageJudgmentMemory` を再利用し、実際に見た範囲でGoalについて何が確認できたかを、構造化した仮説として記憶する部品を追加した。通常のChoice APIには自由記述の回答契約がないため、読んだ文章そのものや自由文の理解内容を保存したとは扱わない。

設定 `goalSearch: {enabled: true, capacity: 8}` とprofile `experience-goal-search` で有効にする。profileは `experience-reason-correspondence` からidと当該部品だけを変更する。state・deliberation・experienceの有効化が前提。容量は1〜8。Goalの文字どおりの分割は最大8断片で、超過は黙って切り捨てず不正入力として拒否する。

既存評価の要求に次を加える。追加API段階・画像・依存はない。

- `goalSearch_image_check_i`: 既存と同じ定義で、現在画像に要求結果が見えるかをobserved/not_shown/context/contradicted/uncertainで評価。
- `goalSearch_finding`: 現在提供された実画像から、直接使える目的固有の操作target_eN、明示されたprerequisite、guidance、no_target_in_view、uncertainを選ぶ。targetのIDは実際に提示されたclick候補だけ。

findingは主に記録する一つの発見で、網羅的ではない。前提条件と操作が同時にある画面も表現対象だが、一つを選んだことから他が存在しないとは推論しない。no_target_in_viewは確認した範囲についての判断であり、画面外、未読の領域、行先、サイト全体の不存在を示さない。not_shownは要求結果が現在見えないという意味で、操作がないという意味とは区別する。

## 行動判断への接続

記憶は画像ID/hash、Goalのhash、文字どおりの要件、findingを持ち、試行ごとに新規作成する。監査DOM、全画面、ラベル、URL、全履歴を流し込まない。モデルの自由文やconfidenceは保持しない。現在の結果と過去の結果は区別する。

実行済みclickのsource候補とresult観察が一致する場合にだけ、過去のfindingを現在候補の説明へ添える。候補の対応は実画像hash一致または受理したunchanged仮説で行い、changedでは持ち越さない。元のsource/resultと画像hashは書き換えない。注記には当時見た範囲の記憶であることと、前提の変化・新情報で再訪できることを明示する。

候補の削除、確率の追加補正、自動的な操作選択、再訪禁止、doneやoracleの上書きは行わない。goal/userモードとPersonaを維持する。この部品の追加だけで人間の記憶や探索を再現したとは結論しない。

`userState.goalSearch` がモデルに利用可能な容量内記憶、`step.goalSearch` がrecord・memory・候補説明の変更前後。評価要求の時点は過去まで、行動要求には今回の評価を追加した記憶が入る。分布は元のresponse/selectionに、実操作はaction/outcome、独立目的判定と終了はresultに残る。replayは質問・出典・候補・記憶・注記を再構成する。

## 実行

未使用の出力先を使う。保存入力のAPIへの直接再送は行わない。

```powershell
npx tsx --test --test-concurrency=1 tests/goal-search.test.ts tests/goal-search-profile.test.ts tests/goal-search-experiment.test.ts tests/goal-search-integration.test.ts tests/goal-search-mock.test.ts
node --import tsx --test --test-concurrency=1 tests/goal-search-independent.test.ts
npm run build

# 実Jev、12試行・最大288要求・並列1・再試行なし
node --import tsx runner/deferral-reason-experiment.ts --comparison goal-search --env-file .env --out reports/goal-search-new

# API・操作を再実行しない保存記録の監査
node --import tsx docs/experiments/2026-10-29-goal-search-audit.mjs reports/goal-search-new reports/goal-search-new/audit.json
npm run replay:virtual-beta -- reports/goal-search-new/notifications-r1-reason/exploration
```

旧correspondence／新searchを通知設定と必要再訪2課題に各2反復、順序を反転して比較する。UI・初期画像・Goal・Persona・seed・他設定を固定する。初回から質問と記憶の入力形式は異なる。質問・記憶・注記を一つの部品として比較するため、個別の効果は分離できない。

1試行最大24要求、12判断、15UI操作、3注視、180秒。phase最大288要求・20分。旧94台帳を保持する。API待ち時間はモデル上のユーザー時間に換算しない。

## 検証状況

配線の独立検証は19/19件成功、skip0、型検査も成功した。実ブラウザーと通常gatewayのfetch stubを使い、改変24件と無効・未設定時の別名挿入20件を拒否した。過去60試行と従来4mockの全64replay、94台帳不変も確認した。初版fc4835dでは契約外のgoalSearchMemory/goalSearchAssessmentが両段階に挿入されても検査を通った。ee8fe221で未契約のgoalSearch*フィールドを拒否し、同じassertを維持して再検証した。独立fixture自体の初回HTML不備とpath誤りは、製品の不具合と区別して記録した。

[配線・修正の独立報告](goal-search-engineering-review.json) を保存した。実モデルに使った固定版は ee8fe22183e4fd6c30f6919f1af35158d8bef634、sourceHash d3e77a5f2e1a0a1ae757999252d116902414a838192223b3de7c5521b573b186。

親の純粋テスト82件、接続テスト1件、通常runnerのmock1件、既存60保存replay、従来4条件のmockとbuildは成功した。既存の状態コピーで新しい記憶が落ちる問題を接続テストで再現して修正した。通常mockが新質問へnoneを返してしまう問題も再現し、新質問にはuncertainを返す明示的な疎通スクリプトにした。どちらも実モデルの性能の証拠ではない。

既存の無効deferralテストは、cold ViteのCSS要求が初回10.9秒かかり、実探索内のgoto10秒上限を超えた。モデル要求0・step0のOBSERVATION_ERRORを2回確認した。通常runnerと同じく計測前に初期読み込みを完了するテスト初期化に合わせ、元のassertは通過した。製品のtimeoutや受入条件は変更していない。

## 制約と次の検証

文字どおりのGoal断片は完全な要求分解ではない。findingは単一の主な発見であり、複合画面の全情報を保存しない。画像出典の整合性は意味の正しさや読了の証明にならない。過去画像が容量外なら、記憶は当時のモデル判断として扱い、今見えた事実にしない。新しいscoreや信頼感の数値は導入していない。

まず分類の妥当性、注記後の実選択、行き詰まり後の切り替え、前提変更後の必要再訪を分けて測る。API・操作・観察の障害は行動性能の失敗や離脱と混同しない。少数課題で改善しても、安定性・未知画面への一般化・人間一致は追加検証が必要。

## 実モデル実行はHTTP 402で中断

12試行を予定して実行を開始したが、新通知r1の11判断目の評価要求でHTTP 402となり、続く3試行でも初回要求に同じエラーが出た。親が実行を停止し、Nodeプロセスの終了を確認した。以後モデル要求は行っていない。HTTP 402の背後の請求・利用制限の原因までは、この応答だけで断定しない。

永続台帳は38要求＝正常応答34、ERROR4、未決済RESERVED0。保存結果は5件、次の1件は台帳0の途中状態、残る6件は未着手である。元manifestはRUNNING・集約used0のままだが、強制停止でfinallyが完了しなかったための古い値であり、実使用0とは扱わない。原本を書き換えず、個別台帳から再計算した中断監査を別に保存した。

有効な試行は従来方式の通知1件のみで、6UI・7判断・14要求で目的達成した。新方式の通知は10UI・21要求でAPI_ERROR。ほか3件はAPI要求1回・UI0でAPI_ERRORだった。有効な比較ペアは0であり、成功率・安定性・新旧の優劣は判定できない。過去の同方式が未達だったことと今回の従来方式の達成を併せても、変動の可能性を示す記述であり因果効果とは扱わない。

新通知の実行できた10判断では、実画像からのfindingは全てno-target-in-viewだった。画像はホーム・設定・広告で、停止操作が実際に見えるとは誤認していなかった。ただし、過去結果の注記が届いたstep6/8でも設定のお知らせe4を再選択し、次の画像は同じ広告だった。raw e4は.81/.59、filteredは約.862/.663。歴史注記5候補のうち2回が実選択された。current注記146件は別集計で、履歴を使った証拠へ加算しない。この観測は途中prefixの繰り返しであり、APIが続けば最後まで回復しなかったという証明ではない。

別の意味上の懸念として、Goalの断片「メール通知を停止し」が10/10でcontextと分類された。全Goalから見れば要求される操作であり、背景・制約だけと扱うことには疑問がある。全Goalは引き続き入力し、当該分類だけでコードが要求やoracleを削除するわけではない。文字どおりの分割と分類の妥当性は未解決で、正解ラベル付きの意味評価や、Goalの一部を誤って落とさない表現の再検討が必要。コードで当該文言だけを特例補正していない。

独立監査は実入力10枚とterminal5枚を確認し、5replay、5traceのCRC・実click/scroll・URL進行、94旧台帳とraw214ファイルの不変を検査した。必要再訪の課題はAPI障害で操作に進めず、今回の新部品での必要再訪性能は未測定。人間一致も未検証である。

[部分結果のJSON](goal-search-results.json)、[独立raw・画像所見](goal-search-live-review.json) を保存した。ローカル原本は reports/goal-search-2026-10-29/live/。HTTP402復旧後に新しい出力先で固定条件の12試行を再実行する。API利用の再承認は不要だが、外部サービスの状態復旧が必要。

## HTTP402停止の運用修正

実モデル記録を保存・独立監査した後、比較runnerだけにHTTP402で次試行へ進まない共通停止処理を追加した。最新版のab71a150はee8fe221からrunner12行追加の差分があり、元の実モデル結果のproducerは引き続きee8fe221。停止処理は約1時間後の通常runner再開でも実HTTP402の1要求で停止し、使用数を正常確定できた。正常な実モデル応答による性能比較は引き続き外部復旧待ち。実サービスと完全stubの検査を区別して [gateway-stop.md](gateway-stop.md) に記録する。

独立raw監査コードは実producer ee8fe221の全製品hashを厳格に検証する。後から停止処理を追加した最新版から原実験の同一版を装って監査し直さない。原記録の追試はproducer版の作業ツリーへ当該解析コードだけを配置し、保存済みreportsを指定して --interrupted で行う。解析コードはモデルやUIを再実行しない。新しい12試行が完了した場合は上記の汎用goal-search-auditコマンドを用いる。

## 担当と記録の復元

親は契約・config・core・replay・profile・統合と報告、実装Aはgoal-search.tsと単体テスト、実装Bは比較runnerと比較テストを担当した。別コンテキストの検証担当は製品を編集せず、実ブラウザー、改変、分布と実選択、障害、保存rawを確認した。指摘した未契約フィールド漏れを親が修正し、同じ検査で再確認した。

実モデルproducerの122製品ファイルは、保存した全hashとZIP CRCを照合して reports/goal-search-2026-10-29/producer-source-ee8fe221.zip へ保全した。[スナップショット情報](goal-search-producer-snapshot.json) にhashと除外事項を記録する。認証情報・.env・依存物・過去ログは含めない。Git checkout時の改行変換で元の生バイトhashが変わる場合は、この照合済みスナップショットを元producer用の別作業領域へ展開して使う。現行の作業ツリーや原本reportsを上書きしない。

納品前の統合版ab71a150で、GoalSearchの単体・比較・接続・通常mockとHTTP402停止を合わせた87件を再実行し、87/87成功・skip0、build（型検査含む）成功を確認した。ログは reports/goal-search-2026-10-29/delivery-tests.log と delivery-build.log。実モデルは追加呼び出ししていない。

同じ統合版で独立検証コードも再実行し、19/19成功・skip0、過去64replayと94台帳不変を再確認した（delivery-independent.log、independent-1793219206090/report.json）。これは親による再実行であり、先の別担当の独立報告とは区別する。


## チーム予算変更後の実モデル再比較（2026-10-29）

[goal-search-resumed.md](goal-search-resumed.md) に固定版6cb8/source1b8の12試行・202正常要求を記録した。旧5/6、新6/6、必要再訪は両方式4/4で全7UI、基盤障害0。過去の中断記録は保持する。同条件2反復の記述比較で、モデルの自発的な切り替えや新部品の安定した優位、人間一致を実証していない。要求の役割と現在の観察状態の分離、既存補正の効果を切り分ける対照は未解決の次タスクとして残す。独立検証は基盤PASS、12replay/trace・6pair・原本不変を確認した。navigation/target分類14提案とaction/context分類38提案の意味上の対立は未解決。関連91/91・build成功。詳細は同文書と独立所見に保存した。
