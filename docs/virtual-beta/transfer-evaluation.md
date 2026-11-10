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

**予定21枠をすべて試行し、有効19件が達成した。残る2件は課金エラーによる無効試行として保持した。**
新課題は18予定、18試行、有効16件で達成16件、基盤障害2件。
既知の確認課題は3試行すべて有効で達成した。
合計147要求（145 OK、2 ERROR、0 RESERVED）で、未実行枠は0。
全予定枠を試行したことを、21件すべての有効結果が得られたことと区別する。

実行はサービス停止を挟む3フェーズに分かれた。
初回は13試行92要求で catalog/alpha-r2 のactionがHTTP402、第2フェーズは catalog/beta-r2 のassessment1要求がHTTP402となり、それぞれ再送せず停止した。
その後、読み取り専用metadataで残高正とHTTP availableを確認し、残り7件だけを実行した。
第3フェーズは54要求で7件すべて達成し、新たなAPI障害はなかった。
失敗済み2枠を再実行して置き換えていない。

[個別JSON](transfer-results.json)、[CSV](transfer-results.csv)、[独立検証](transfer-independent-review.md) に版、分母、結果、制限を保存した。
3フェーズの実測producerはすべて `73b1ff3603b84c0019332970590b1f0d1406dc91`、sourceは `8a5bc5c03daaf99df38795fd218dc5e19e0ed916d390620e602286955c6ee3d7`。
事前登録のSHA256は `ae65d167928aa0990acc17c9e27944f28c9f2133c537f2436c28f0d3f883163b`。
同じ129 sourceのバイト列、profile、チャーター、protocolを各試行前後に検証した。
今回追加したのは未試行枠の実行管理とオフライン集計で、探索actorや画面への調整はない。

catalogは有効4件で対象作品を保存、draftは6件で対象メモをチーム内へ保存、helpは6件で集合場所と持ち物を表示した。
help6件では両情報が正常応答を得たcurrent画像に含まれることも確認した。
有効試行のUI操作は2〜3回、注視移動0回、controllerによる選択変更0件、同一画像の反復エッジ0件だった。
これは全画面条件の結果であり、視覚制約や内容の理解を測ったものではない。

同じ条件の初期PNGとconfigは7条件とも一致した。
ただし catalog/alpha の有効経路は2種類で、r1は対象作品を直接開いて保存する2操作、r3は先に「土曜日」を選んでから同じ作品を保存する3操作だった。
他6条件の有効経路は各1種類。
catalogの各版はAPI障害が1件ずつあるため有効反復は2件、draftとhelpの各版と既知課題は各3件である。
少数の反復や完了率だけで広い範囲の安定性を保証しない。

方式を変えずに別の3課題で前進と完了が成立した。
今回の経路では行き詰まりや必要再訪が起きていないため、通知設定で残ったループの汎用的な解消や人間との一致は未検証である。
また、サービス停止を挟んだ実行であり、プロバイダー側の時間変動を排除した比較実験ではない。

## 計測修正と原本の保全

独立監査で、catalog2件・draft4件の保存確認が補助集計から漏れていた。Reactの文字ノード間に抽出空白が入り、保存文の厳密一致だけが失敗していた。目的達成oracleとhelpの主要指標には影響しない。

修正版は空白だけを除去し、対象名・句読点を含む確認文の包含照合・正常応答・current画像の同一性を維持する。`matchPolicy=literal-includes-whitespace-removed-v2` を記録した。3件REDを保存し、関連26件GREENを確認した。未計上は未提示・未読・未理解の証明にはならない。確認文をそのまま含む疑問文も一致しうるため、任意の文章の意味判定には使わず、今回の固定fixtureの監査用表示の照合として扱う。

実行時の `live/manifest.json`・`live/summary.json`・台帳・画像は変更していない。`derived-v2/summary.json` に再集計し、6件の補助creditだけがfalseからtrueに変わった。達成数・失敗数・経路・分布・選択・API数は変わらない。再解析はAPI0・UI操作0。実測版から変更した製品fileは解析module1個だけで、探索actor・画面・profile・transportには変更していない。

## 次の検証

元の21枠はすべて試行済みで、未試行枠はない。
初回8枠用の `pending-slots.json` と、その後の7枠用の `pending-slots-final.json` は当時の実行計画として保持する。
現在の未実行一覧と取り違えない。
障害2件を有効な3反復に埋め直す実験は今回実施していない。

次は、行き詰まりが起こる別課題で、他の入口への切り替え、必要な再訪、不要な再訪の正負対照を事前登録する。
今回の成功経路を見てactorや画面を最適化せず、方式を固定して測定する。
旧holdoutの短い待機時間の不安定性は、実行環境とnavigation待ちを別タスクで診断する。
人間比較には対象集団の複数人の記録と事前定義した一致指標が必要で、今回のnullpersonaの成功からは判断できない。

原本は `reports/transfer-evaluation-2026-10-29/` に保持した。
初回は `live/`、第2フェーズは `continuation/`、第3フェーズは `continuation-final/`、3フェーズのオフライン再集計は `combined-final-v2/`。
実測に使った固定worktreeも再現用に保持する。
過去1,939原本と142台帳参照、初回299原本、第2フェーズ20原本の合計2,258ファイルを、第3フェーズ前後で照合した。

## 停止後の継続手順

継続専用 script は当日の原本 SHA と未試行枠を検証する。
第2フェーズ用の [8枠版](../experiments/2026-10-29-transfer-continuation.ts) は最初の13試行、第3フェーズ用の [7枠版](../experiments/2026-10-29-transfer-continuation-final.ts) は続く障害1件も固定する。
これらは一般的な再開コマンドではなく、保存済み実験の原本を必要とする。
別 clone で原本がない場合、履歴に依存するテストだけを理由付き skip とし、純粋な入力検証は実行する。

当日の第3フェーズは以下で実行した。
同じ出力先が存在すれば再実行を拒否するため、完了済み7枠をこのコマンドで上書きしない。
新しい実験は先の通常バッチを新規出力へ実行し、別の試行として集計する。

```powershell
$repo = (Get-Location).Path
$base = Join-Path $repo 'reports/transfer-evaluation-2026-10-29'
$frozen = 'C:/Users/Maekawa Ao/.codex/worktrees/transfer-frozen-continuation/Ux_test'
node --import tsx docs/experiments/2026-10-29-transfer-continuation-final.ts `
  --previous (Join-Path $base 'live/manifest.json') `
  --continuation (Join-Path $base 'continuation/manifest.json') `
  --pending (Join-Path $base 'pending-slots-final.json') `
  --prior-snapshot (Join-Path $base 'prior-originals.json') `
  --frozen-root $frozen --env-file E:/ChatGPT/Ux_test/.env `
  --out (Join-Path $base 'continuation-final')

# APIを使わない、保存結果の再検証
node --import tsx --test --test-concurrency=1 tests/transfer-continuation.test.ts tests/transfer-continuation-final.test.ts
node --import tsx runner/virtual-beta-replay.ts reports/transfer-evaluation-2026-10-29/continuation-final/transfer-help-alpha-r3/exploration
```

3フェーズの集計には [専用のオフライン script](../experiments/2026-10-29-transfer-combine.ts) を使う。
元13件、第2フェーズ1件、第3フェーズ7件の一意性、台帳、画像、2件の既存障害を厳密に照合する。
旧2フェーズ用 script の障害数チェックを緩める変更は自動承認レビューで却下されたため採用していない。
旧 script は未変更かつ未実行のまま保持し、3フェーズ用では2件の障害を明示して検証する。

当日の3フェーズをAPI0で再集計する場合は、最終manifestのSHAを明示する。
出力先は新規ディレクトリにする。

```powershell
node --import tsx docs/experiments/2026-10-29-transfer-combine.ts 3b9f1a691cc572ee655a25206f4d08cfa224eef6da841d10ced53ca15b2bc877 reports/transfer-evaluation-2026-10-29/combined-final-verification
```

実行時の7枠用script SHAは `4905b51e05a08bcc413c8b43816a73f7338a1f1a438c37f0f5cb01cafd9ab1ef`、pending SHAは `45a10b2b53a274741340d6885eee7532376840f88afdad44f09ee30ceed66ec3`。
実測producerのバイト列を使うため、元のLF/CRLF混在をGitの改行差と分けて保全した。
別cloneで過去原本なしにこの履歴専用scriptを実行できるとは扱わない。
今回の親の追加検証は関連28/28と継続10/10、型チェック、buildで、全体suiteの成功とは区別する。
