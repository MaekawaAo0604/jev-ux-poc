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

結果と独立検証は実行後に追記する。ローカル原本の保管先は `reports/transfer-evaluation-2026-10-29/`。
