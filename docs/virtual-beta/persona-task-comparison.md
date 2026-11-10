# 知識・経験・制約を使う3課題のPersona比較

2026-11-06。3課題を実装し、baseline/A/B/Cを各3回、実モデルで36枠実行した。通知連携ではCが2/3回で詳細画面から基本アクセスを有効にし、他3条件は9/9回で拡張アクセスを有効にした。知識・経験の課題では経路差はなかった。通知の選択差は候補として記録し、3反復から安定したPersona効果や人間との一致を確定しない。

## 実行結果

36枠をすべて試行、有効35・無効1・未実行0。実モデル292要求は画像抽出98、Jev評価97、行動97。98判断、62UI操作、注視0。97選択すべてでモデルの選択と実選択、補正なしの選択器の基準が一致し、非単位の適用重みと安全除外等のadjustmentは0だった。行動の差を出すための補正・再送・置換は追加していない。

全36枠で、課題ごとの初期画像とPersona以外の初期画像抽出入力が一致した。Personaと固定期待は画像抽出・評価・行動へ正しく配送された。下流のモデル解釈や記憶まで同一だったとはいわない。

- ログイン解除：有効11枠で全条件同じ「別端末のセッションを確認・失効 → この別端末のセッションを失効する」。用語説明は0。Bの2回目だけ画像抽出の形式不正で無効となり、Bは有効2/予定3。他条件は有効3/予定3。条件内距離10ペア0.000、条件間45ペア0.000。
- 表示設定：有効12枠で全条件同じ「コンパクト → 表示を保存」。用語説明・プレビューは0。条件内12ペア0.000、条件間54ペア0.000。
- 通知連携：Cは1回目・3回目に「情報の利用範囲を詳しく確認・変更 → 選んだ範囲で通知を有効にする」で基本アクセス、2回目は拡張アクセスだった。baseline/A/Bはそれぞれ3回とも「拡張アクセスで通知を有効にする」。条件内12ペア0.167、条件間54ペア0.333、差0.167。

通知のCは経路2種類、他条件は各1種類だった。C内の3ペア平均距離は0.667。条件間の方が離れたという記述結果は得たが、少数・相互依存の比較ペア、部分的な順序回転、外部モデルの揺れから、有意差や因果を認定する検定は行っていない。C自身にも経路の揺れがあるため、確定的な人物像ごとの経路分離とはしない。

### 基本アクセスは詳細画面の初期選択

Cの基本アクセス2回は、どちらも詳細画面を開いてそのまま有効化したもので、「基本アクセス」ボタンを改めて押したものではない。観測事実は、開いた画面・実行したコントロール・許可結果の差である。情報最小化を理解して意図的に選んだという推測とは区別する。

[同じ初期入力画像](persona-task-frames/frame-33b03933aa826a6cad21d3779e586dade1bccc89813a2cd9e9cefffec1da7821.png)、[C r1が次に見た詳細画面](persona-task-frames/frame-9548f7807a8768f62808e359411506a197f7ca35f2344c6795450bce15ee0aea.png)、[C r1の基本アクセス有効化後の入力](persona-task-frames/frame-890e28cae5dcb5e822ab800b2d29cb493f55d6744b32d068730a64b0ef61ff3d.png)、[baseline r1の拡張アクセス有効化後の入力](persona-task-frames/frame-f084a27737bbd6ba73b7565f0832199ec066af4020ea5ec9eb1a8114aab8e41c.png)。すべて実際にモデルへ渡した画像で、終端の監査画像を次入力に置き換えていない。

### 同じ画像と、生成された解釈を分ける

ログイン解除187組・表示設定198組・通知連携113組の同画像ペアで、監査から識別した視覚的な対象はすべて一致した。一方、生成された候補説明まで一致するペアは0で、厳格な分布比較は未測定（0差という意味ではない）。過去の比較条件を緩めて分布差を作らず、対象一致と付加解釈の違いを別々に保存した。これらは全記録の最初の画像出現から作る組で、無効枠に由来する出現も明示的に含み、分布測定の対象資格とは別である。

### 画像抽出の不正1件

sessions/B/r2の3判断目で、履歴の3条件に同じpriorIdを3回返した。HTTP200の応答だが、画像抽出の受理条件に違反している。送信内容を保存画像からオフラインで組み立て直すと、continuityは3IDをすべて許可し、別用途のpriorConditionIdsだけが未解決の1IDに絞られていた。応答が両者を取り違えた可能性はあるが、モデル内部の原因までは特定しない。

受理処理は重複を拒否し、API_ERROR/VISUAL_EXTRACTION_OUTPUT_ERRORとして保存した。UIではすでにログイン解除操作を終えていたが、比較には無効の部分経路として残した。ユーザーの迷い・離脱・目的未達へ読み替えず、試行の置換や応答の修復は行っていない。[診断](persona-task-native-invalid-diagnostic.json)、[オフラインの合成検証対照](persona-task-native-invalid-validation-control.json)。対照はID2か所だけを変えた受理テストであり、実応答や有効な試行として記録したものではない。

## 今回確認できたことと残ること

- 同じ新UIを、既存の画像認識・判断処理のまま、Persona別に実行・監査できた。今回の有効35枠では繰り返しクリックや再訪は観測されなかったが、行き詰まり回復や実製品全般の安定性を認定する課題ではない。
- 通知の確認経路と許可範囲にCの仕様と整合する例が2回あり、選択差の候補を得た。Cの2回目や既定選択の影響を残し、慎重さ・知識・期待・名前等のどの項目が効いたかは未分離とする。
- A/Bの用語理解や経験による経路差は確認できなかった。Aが正しく操作できたことだけで知識制約違反とは判定しない。画面の文脈から選べる課題であり、未知語を理解したかも未測定。
- リポジトリ全体のテストは未合格。今回の対象機能に対する検証の合格を、リポジトリ全体の合格や人間の再現へ拡張しない。

次は、曖昧な行動傾向と明示的な制約を分けた対照、知識だけを変える対照、用語の理解が実際に選択を分ける課題を、別の計画として先に固定する。既定の選択肢と確認志向の寄与も切り分ける。今回のCに必須操作を追加したり、再訪を禁止して差を作る方法は取らない。画像抽出の参照ID重複を構造的に起こしにくくする出力形式は、別バージョンの改善候補として検証する。対象ユーザー集団との比較データは今後別に取得する。

## 課題と固定条件

- ログイン解除：共用PCからアカウントを使えなくし、この端末の利用とパスワードを維持する。画面にはセッションの確認・失効、パスワード変更、用語説明がある。目的文には正解ボタンの技術用語を転記しない。
- 表示設定：一覧をコンパクトにし、保存を確認する。編集中・プレビューと保存済みの状態は独立している。操作経験が、説明・プレビュー・保存の選択に関わる可能性を調べる。
- 通知連携：予約リマインダーを有効にして確認する。予約時刻だけの基本アクセスと、架空の氏名・メールアドレス・予約履歴も利用する拡張アクセスの両方で目的を達成できる。許可の違いを目的達成の正誤にしない。

既存のbaseline（Personaなし）/A（初心者）/B（熟練者）/C（慎重）を各課題3回、計36枠。各課題では同じUI・目的・初期状態で、Persona JSON全体だけを変える。ペルソナにクリック手順を与えず、モデルや候補、選択器にペルソナ別の補正を追加しない。

前回と同じ experience-persona-unweighted、argmax/seed20261028、基本の観察記憶容量3（ほかの既存チャネルも共通profileを継承）、1280×900、画像条件抽出OpenAI gpt-6-luna＋Jev 1.14の評価・行動判断を使う。seedは外部モデルの出力を固定しない。傾向は必須操作ではなく、説明を読まない初心者や確認を省く慎重な利用者を、それだけで矛盾とはしない。

3反復をブロックとし、各ブロックの課題順はログイン解除・表示設定・通知連携。条件順は反復と課題番号で開始位置を回す。完全な位置均等化や無作為化ではなく、時間・順序の影響は残る。固定した3反復以外を結果に応じて追加・置換しない。

1枠12判断・36要求・15UI操作・3注視・300秒。画像抽出60秒、全体1296要求・120分・API直列1・再送0。認証・利用枠・入力・会計・監査・安全不整合は停止し、孤立したモデル出力不正やタイムアウトは無効枠として残す。連続2無効で停止する。

## 観測と解釈

実操作、説明・詳細・確認の参照、プレビューと保存、許可の範囲、再訪と繰り返しを、モデルへ実際に届いた画像と監査状態の前後で確認する。監査状態はモデル入力へ渡さない。

経路は画面の種類・実操作・画面に表示されたコントロール文言で識別する。画像ローカルの候補IDだけを画面間で照合しない。同じ画像で視覚的な対象が一致するかと、モデルが生成した説明まで一致するかを分ける。同じ画像でも履歴や抽出結果まで同じとはいわない。

監査のそろった経路だけで、同じPersona内と異なるPersona間の距離を課題ごとに比較する。上限で打ち切られた経路も、打ち切りまでの観測として含め、その先の行動や自発的離脱は推定しない。無効枠の部分経路は別に保持する。距離は長さに影響され、比較ペアは独立でなく、有意差や因果を断定する量ではない。

理由カテゴリは短い自己申告で、内部判断や人間の知識・心理の記録ではない。成功率を自然さの点数にせず、主観的完了・客観的結果・離脱・上限・基盤障害を別々に記録する。

知識・経験・制約を使える場面を用意したが、各属性単独の効果は分離しない。未知用語を画面から理解したのか、モデルの既有知識を使ったのかも、行動だけでは確定できない。スマートフォン条件と対象ユーザーとの一致は今回測定しない。UIには架空のサンプルで外部送信しない旨も表示するため、実際の個人情報を共有する状況の再現ではない。Cも共有を一律拒否する仕様ではなく、拡張アクセスを選んだことだけで制約違反とは判定しない。

## 実行方法

    Set-Location "C:/Users/Maekawa Ao/.codex/worktrees/virtual-beta/Ux_test"
    npm run build
    node --import tsx --test --test-concurrency=1 tests/persona-task-fixture.test.ts tests/persona-task-analysis.test.ts tests/persona-task-comparison.test.ts tests/persona-task-wiring.test.ts tests/persona-beta-wiring.test.ts tests/persona-beta-comparison.test.ts tests/persona-beta-initial-inputs.test.ts tests/persona-beta-analysis.test.ts tests/virtual-beta-replay.test.ts
    $personaStamp = Get-Date -Format yyyyMMdd-HHmmss
    $personaSnapshot = (Resolve-Path reports/persona-tasks-2026-11-06/prior-raw.json).Path
    node --import tsx runner/persona-task-comparison.ts --mock --prior-snapshot $personaSnapshot --out "reports/persona-tasks-mock-$personaStamp"
    node --import tsx runner/persona-task-comparison.ts --prior-snapshot $personaSnapshot --env-file E:/ChatGPT/Ux_test/.env --out "reports/persona-tasks-live-$personaStamp"

出力先は必ず新規ディレクトリにする。認証情報は外部の.envだけから読み、表示・保存しない。通常のrunner経由で架空の画面・目的・Persona・制限内の記憶だけを送り、人間記録や保存済み入力の直接再送は使わない。

## 実装と検証記録

親が共通型・既存runnerへの接続・比較CLIと統合、実装サブが3課題のUI/oracle、別の実装サブが純粋集計を担当した。別コンテキストの検証サブが実行と不整合注入を検証する。

実装時に、保存済み状態がスクロールで画面外に出ただけで客観的完了をfalseへ戻すoracle条件を修正した。回帰テストは非表示・文言偽装を拒否し、画面外への移動でも保存済み状態を維持する。これは人間の理解の証明ではない。

コード固定後の関連67テストは67/67、buildは成功。全体npm testは2692件中2629成功・60失敗・3skipで、全体成功とは報告しない。この全体実行は最終組立・commitと重なり、source freezeの不整合も含むため最終版の全体合格根拠には使わない。holdout-independentの子プロセスは5分以上出力が止まり、対象PIDと親子関係を確認して当該子だけを停止した。失敗名・診断・停止理由と元ログはローカル reports/persona-tasks-2026-11-06/parent/ に保持する。旧比較の固定版チェックと画像転送契約のテストには別途保守が必要なものがあるが、60件すべての原因を解決したとはしない。

独立した実行後監査はPASS。全36枠のfinalVisualHTTPリプレイ、292要求の直列会計、97実選択、657新規原本と177ソース、36ブラウザートレースの1800リソースを照合した。親の14例・28参照・8種類の実入力画像に加え、検証者がログイン解除と保存後の入力画像2枚を確認した。[確認した10画像の対応](persona-task-review-frame-map.json)。

検証用ハーネスでは、不正応答で送信されなかった後段にも成功応答を要求したことや、CSVの引用符内の改行を単純分割したことでFAILを記録した。製品コードは変更せず、検査側を修正して再確認した。原本受入は、元の[raw検査42件成功・CSV検査1件失敗の記録](persona-task-review-live-raw-r2.json)と、修正後のCSV36行22列の照合成功を組み合わせている。元のFAILを全件PASSに書き換えていない。

実行コード2c0876b3dc3848b29ff755885192890c891d2d69。runtime hash 8d591fcb465f06293387391e4647a6b705e865c42b9ffc5f8c4ededda22bd4a3、177ファイル。ZIP SHA-256 9448a4bcb76ec0b0360cfa5b277db3c959f18f0b2beac5e3089f069bda8caf8b。実行時の改行を含むバイト列をZIPに保持し、Gitの改行正規化と分ける。

純粋集計器は、通常driver・runner・台帳と原本監査で確認したsource/config/goal/capsを前提とする。任意の未認証rawを単独で真正と認定するvalidatorではなく、通常driverと原本の独立監査を併用する。

## 成果物と版

[比較JSON](persona-task-results.json)、[36試行CSV](persona-task-runs.csv)、[14例・28画像参照の抽出記録](persona-task-review-cases.json)、[選択と要求の会計](persona-task-review-selection.json)、[固定したプロトコル](../../experiments/virtual-beta/persona-task-comparison.json)、[実行開始記録](persona-task-execution-control.json)、[画像レビュー方針](persona-task-visual-review-plan.json)。レビュー方針は起動中・親の結果経路確認前に作った運用上の方針で、正式な事前登録とはしない。

[コード独立検証](persona-task-review-code.json)、[36モック枠の独立検証](persona-task-review-mock.json)、[実行原本の封印](persona-task-review-seal.json)、[全体テスト60失敗の記録](persona-task-full-suite-findings.json)。[実行後の独立監査](persona-task-review-live.json)、[原本受入の構成](persona-task-review-live-evidence.json)、[目視・CSV照合](persona-task-review-visual.json)、[同画像比較](persona-task-review-same-image.json)、[不正応答の独立診断](persona-task-review-native-invalid.json)、[ブラウザー通信の検査](persona-task-review-network.json)。[公開資料の独立照合](persona-task-review-publication.json)も残す。

[実行ソース177ファイルZIP](persona-task-source-8d591fcb.zip)、[ZIP識別情報](persona-task-source.json)、[ファイル別SHA](persona-task-producer.json)。実行コミットは [2c0876b](https://github.com/MaekawaAo0604/jev-ux-poc/commit/2c0876b3dc3848b29ff755885192890c891d2d69)。ローカル原本は reports/persona-tasks-2026-11-06/ の live-r1/、mock-r1/、independent-code/、parent/。過去8412ファイル、399モックファイル、657実モデルファイルの計9468ファイルを照合・保持した。元の E:/ChatGPT/Ux_test の未コミットのソースは編集していない。

保存済み結果をAPIなしで再生する例：

    npm run replay:virtual-beta -- reports/persona-tasks-2026-11-06/live-r1/persona-task-privacy-C-r1/exploration --require-final-http
