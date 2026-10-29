# 方式を固定した別課題・画面の評価

目的は、通知設定への追加調整を止め、現行方式が別の課題でも動くかを測ること。成功回数だけで人間再現や安定化を判断しない。

## 基準と事前登録

基準は `999a7e451917c0ec05c0961d6d417a5ea43a180d`、製品 source hash は `f65a0feaef10f31c512b008685ddbc359715dc99bc9c0dd8bd28b49fd9b9f063`。
[固定条件](../../experiments/virtual-beta/transfer-evaluation.json) は `experience-goal-search-grounded`、personaなし、全画面画像、状態記憶3、経験記憶8、argmax、Jev1.14、longContext、HTTP再送なし。知識・期待・制約の個人差や視覚制約の効果は今回の測定対象に含めない。

新しい架空UIを3課題×2版で作った。上映回の条件を読み取って保存する catalog、対象メモの公開範囲を変更して保存する draft、指定イベントの集合場所と持ち物の案内を表示する help。各版3反復で18試行とする。「新しい」はこのリポジトリで今回作成した意味で、モデルの事前学習に対する未知性を保証しない。

既存の direct/alpha は3回の確認用 sentinel として別集計する。各ブロックは sentinel→6新規条件、順序をブロックごとに2条件ずらす。結果による設定・画面・候補・重みの変更はしない。正解経路は到達性確認のテストだけに使い、モデルには渡さない。

1試行24要求・12判断・15 UI操作・3注視・180秒、全体21試行・504要求・45分・並列1。HTTP402または連続2件の基盤障害で停止する。失敗・未決済予約も消費として数え、台帳をリセットしない。

## 実行

Nodeと依存、Playwright Chromiumを用意し、リポジトリのルートで実行する。出力先は毎回新しい名前にする。実行前に作業版をcommitし、実行中は製品コード・設定・チャーターを編集しない。

```powershell
# ローカル疎通。API0、doneを返すstubで性能評価には使わない
node --import tsx runner/transfer-evaluation.ts --mock --limit 2 --out reports/transfer-smoke-new

# 実Jev。認証ファイルはこのworktree外の明示パス
node --import tsx runner/transfer-evaluation.ts --env-file E:/ChatGPT/Ux_test/.env --prior-snapshot reports/transfer-evaluation-2026-10-29/prior-originals.json --out reports/transfer-live-new

# 関連検証（ブラウザー負荷を抑える）
node --import tsx --test --test-concurrency=1 tests/transfer-*.test.ts
npx tsc --noEmit
npm run build

# 実操作なしの再検証とtrace閲覧
node --import tsx runner/virtual-beta-replay.ts reports/transfer-live-new/transfer-catalog-alpha-r1/exploration
npx playwright show-trace reports/transfer-live-new/transfer-catalog-alpha-r1/exploration/trace.zip
```

`--limit` は1〜21だけを受け付ける。途中の疎通でも計画分母21を残し、未実行を成功・失敗に足さない。`--prior-snapshot` は過去原本と実台帳のパス・SHA256辞書で、ローカルに保持する。別環境で原本がない場合はオプションを省略できるが、その場合は過去原本の保全確認なしと明示される。環境ファイルや人間記録をsnapshotに入れない。

## 記録と読み方

`manifest.json` に実行UUID・スロットID・全予定順序・実行種別・版・全製品hash・protocol hash・固定profile・上限・停止状態・台帳消費を保存する。同条件の初期PNGとconfigを厳密比較し、差があれば比較の不確かさを表示する。

`summary.json` と `summary.csv` は新規18件と既知3件を分離する。予定、試行済み、結果あり、有効の分母、客観達成、主観完了、基盤障害、分布不正、安全停止、上限終了、離脱を別々に保持する。原因区分は重複しうる。API待ち時間・実操作時間・経過時間は人間の行動時間ではない。

各試行の `exploration/result.json` に実観察・監査画面・モデル分布・補正後分布・選択・実操作・終了理由を残す。`offline-replay.json` で画像と入力・選択の整合性を検証し、`delivered-current-frames.json` で原画像から変換PNGを再構成する。実観測したURLのpath/query/hashを保存し、次の観察がない遷移先を推測で埋めない。

catalogは条件に合う作品の保存、draftは対象メモへの保存確定をoracleで判定する。選択中の値や別メモの保存では達成しない。helpの客観達成は両情報を画面内に表示したこと。さらに、その情報が正常応答を得たモデル要求のcurrent画像に入ったかを別集計する。ページを開いたこと、画像を送ったこと、内容を理解したことは区別する。

## 実装と未検証範囲

既存の判断質問・記憶・候補生成・controller・sampling・transportは維持する。共通変更はfixture選択とoracle・監査metadataへの接続だけ。新規UIのCSSは局所クラスに限定し、既存direct/alphaの入力・質問・画像が変更前と一致することをローカル原本で確認する。この履歴原本はGitへ含めないため、他のcloneでは当該歴史比較だけ明示skipとなる。

新しい公開研究コード、モデル重み、依存は採用していない。学習モデルや人間の視覚・感情を実装したという扱いもしない。3反復の経路差は記述統計にとどまり、人間の行動頻度、UI変更の因果効果、実製品への転移性能は評価できない。

## 実測結果と現在地

**21試行の計画は未完了。13試行目のHTTP402で停止した。** 新課題は18予定・11試行・有効10・達成10・API障害1・未実行7。既知sentinelは3予定・有効2・達成2・未実行1。合計92要求（91 OK・1 ERROR・RESERVED0）。HTTP402を利用者の失敗や離脱に数えず、再送もしなかった。gateway側で何の制限に掛かったかは今回の保存ログだけでは特定していない。

[個別JSON](transfer-results.json)、[CSV](transfer-results.csv)、[独立検証](transfer-independent-review.md) に版・分母・結果・制限を保存した。実測のproducerは `73b1ff3603b84c0019332970590b1f0d1406dc91`、source `8a5bc5c03daaf99df38795fd218dc5e19e0ed916d390620e602286955c6ee3d7`。事前登録のSHA256は `ae65d167928aa0990acc17c9e27944f28c9f2133c537f2436c28f0d3f883163b`。実行開始から停止まで製品source・profile・チャーター・protocolを変更していない。

catalogは2件とも対象作品を保存、draftは4件とも対象メモをチーム内へ保存、helpは4件とも集合場所と持ち物を表示した。help4件は両情報が正常応答を得たcurrent画像に入っていたことも確認した。既知sentinelは2件とも予約変更を確認した。各有効経路のUI操作数は2〜3、注視移動0、controllerによる選択変更0、同一画像の反復エッジ0。これは全画面の固定条件で、視覚制約を測った結果ではない。

反復が得られた条件では設定と初期PNGが一致し、各セルの有効経路は同じだった。ただし3巡目は全件未実行。初期画像が2件以上ある6条件の一致には、catalog/alphaのAPI障害試行の初期記録も含む。単発のcatalog/betaで再現性が確認できたとはしない。

今回の範囲では、方式を変えずに別の3課題で前進と完了が成立した。一方、行き詰まりや必要再訪を含む経路には入っていない。通知設定で残ったループの汎用的な解消や、人間への一致はこの成功から判断できない。

## 計測修正と原本の保全

独立監査で、catalog2件・draft4件の保存確認が補助集計から漏れていた。Reactの文字ノード間に抽出空白が入り、保存文の厳密一致だけが失敗していた。目的達成oracleとhelpの主要指標には影響しない。

修正版は空白だけを除去し、対象名・句読点を含む確認文の包含照合・正常応答・current画像の同一性を維持する。`matchPolicy=literal-includes-whitespace-removed-v2` を記録した。3件REDを保存し、関連26件GREENを確認した。未計上は未提示・未読・未理解の証明にはならない。確認文をそのまま含む疑問文も一致しうるため、任意の文章の意味判定には使わず、今回の固定fixtureの監査用表示の照合として扱う。

実行時の `live/manifest.json`・`live/summary.json`・台帳・画像は変更していない。`derived-v2/summary.json` に再集計し、6件の補助creditだけがfalseからtrueに変わった。達成数・失敗数・経路・分布・選択・API数は変わらない。再解析はAPI0・UI操作0。実測版から変更した製品fileは解析module1個だけで、探索actor・画面・profile・transportには変更していない。

## 残りの実行と追加タスク

サービス復旧後の未試行8スロットは `reports/transfer-evaluation-2026-10-29/pending-slots.json` に保存した。失敗したcatalog/alpha-r2は障害記録として残し、成功率のために再実行しない。通常のバッチコマンドは先頭から開始するため、既存出力への再実行を再開と扱わない。継続は固定producerの別作業場所、残り8件の別フェーズ・fresh台帳で行う。上限は追加192要求、既存分との合計最大284。継続フェーズは現時点で未実行。

次は未試行分を完了し、実際に行き詰まりが起こる別課題と必要再訪の正負対照を事前登録する。今回の成功経路を見てUIやactorを最適化しない。旧holdoutの短いテスト待機の不安定性は、実行環境・navigation待ちの切り分けを別タスクにする。人間比較は対象集団の複数人の記録と事前定義した一致指標が必要で、本人1件や経路の多様性だけで再現を結論しない。

原本の保管先は `reports/transfer-evaluation-2026-10-29/`。固定producerのZIP・source各hash、事前登録、既存1,939原本・142台帳の前後照合、独立監査、修正前後の集計を残している。
