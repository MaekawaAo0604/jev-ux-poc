# 統合・独立検証の結果 — 2026-10-27

今回の実装上の受入条件は、ローカル通知停止UIを対象に満たしました。重大な未解決実装不具合は独立再検証では残っていません。人間への一致度、性能上の有意差、公開製品全般への適用は未検証です。

## 版と担当

元ツリーは fix/sufficiency-voting / a442b44f2c9e235fdf23d94c082da9964be95930 のまま保全。最新未コミット実装を隔離worktreeに写した基準は f09047e45ab13fe891a3686c58c310b2d03f7f82。統合初版5b336d4、独立修正後の製品固定版9218366d9f58095986512472d4e761152543bb2c、branch feature/virtual-beta-foundation。既定ブランチへpush、リリース、本番変更はしていません。

Aは vision.ts / vision専用テスト / vision-research.md。Bは user-state.ts / selection.ts / state専用テスト / state-research.md。親は contracts/config、比較・実行・リプレイ・APIアダプター、既存clientの任意監査フック、設定/文書/統合。新しい独立検証サブは製品コードを編集せず、専用12テストと独立レビューを作成し、実行して問題を返しました。共有worktree内で編集範囲を分離し、親が統合コミットを作りました。

## テスト・実行の事実

- T00: 既存型チェック成功。旧LOOP修正、ペルソナ/禁止操作、completion画像、native Backの18件成功。
- 統合段階の全体回帰: 623件、620成功、失敗0、skip3。約521.5秒。skipは任意OCR1件と実API2件。ログ reports/virtual-beta-regression.log。この全体実行後に独立指摘を修正したため、最終版の全体テストを再実行した数値とは扱いません。
- 最終固定版: npm run build 成功。既存client/画像回復/completion/旧ペルソナ探索の関連回帰21件成功。ログ reports/virtual-beta-final-legacy-regression.log。
- 最終独立再検証: TypeScript成功、β関連50件成功（独立12、APIアダプター3、状態/分布15、視覚15、runner5）。ログ reports/virtual-beta-independent-freeze2.log。
- 最終版の実ブラウザー＋モック: foveatedとcropそれぞれ4条件。全8runで客観成功・主観完了・監査有効、初期fingerprint一致。current/stateはUI2・注視0・判断3、vision/combinedはUI2・注視2・判断5。これはfixture用スクリプトによる疎通確認です。
- 独立リプレイ: 最終8runの32判断・52画像参照を検証。保存入力・質問・画像SHAとseed選択が一致。全89ソースファイルのhashを別途計算して一致。2つのmanifestは固定版9218366、sourceHash afa2412167f0add8351ae7fa15074e801a20972d1c754f7470fb4d139153d587。明示指定した設定JSONとの完全一致も確認。
- 実選択の統合検証: 同一の非退化分布、fresh seed16個で、モデル提案doneに対し実際はclick8・abandon8。全選択が保存seedで再現。分布選択の実装確認であり人間頻度ではありません。

## 独立指摘と修正（1ラウンド）

F1 期限後操作: 観察後・API応答後・実操作前で期限を検査。残り時間のAPI timeoutをTIME_LIMITと区別。遅い観察/応答でも新しいAPIやUI操作を開始しない再現テスト成功。

F2 不正分布: 既存clientのデフォルトを変えず、任意の複製回答フックでβアダプターが不正分布の証拠を取得。INVALID_DISTRIBUTIONとして保存し、任意のプロバイダー文字列/追加フィールドを落とす。実HTTP形式を使ったローカルstubで確認。

F3 全確率除外: 選択を捏造せず、raw/normalized/filteredWeights/正規化量/除外理由をselectionFailureに保存。無効なraw入力は任意の文字列を証拠としてechoしない。

F4 モデル不一致: 実βアダプターで要求したjev-1.14.0以外をAPI_ERROR/MODEL_MISMATCHとして停止。不正な回答と同時の場合も保存項目を制限。

F5 最終監査: 利用者の終了判断を維持して、最終画像とoracleの状態を別々に保存。oracle不明はobjectiveAssessment.value=null、監査失敗はvalidForComparison=false。失敗をUI迷いや成功へ混ぜない。

F6 API件数: 全体予算予約で拒否したものを実要求数に含めない。apiCalls=0を再現テストで確認。

詳細と再現情報は [independent-review.md](independent-review.md)。旧失敗証拠は reports/beta-independent-findings-round0、最終通過fixtureは reports/beta-independent-findings-freeze2 に保持しています。

## 実Jevの4条件（最終修正前の統合版）

実モデル測定版は5b336d4、各条件API3回上限・同じUI/目的/初心者A/初期状態です。条件間の初期fingerprintは一致。設定は experiments/virtual-beta/smoke-3-calls.json に保存。

- current: 客観成功、主観完了、UI2、注視0、API3。
- vision: 未達・未完了、UI2、注視1、API_LIMIT。
- state: 客観成功、主観完了、UI2、注視0、API3。
- combined: 未達・未完了、UI1、注視2、API_LIMIT。

combinedの3判断目はモデル提案backから、seed分布によりlook_3が選ばれ実行。draw=0.6018468029797077。4run全12判断・18画像参照を独立サブもローカルリプレイし、全回答モデルjev-1.14.0を確認しました。

実モデルの初回11要求では、current成功・vision上限、state/combinedはHTTP400。その後に未参照記憶画像を修正して新規初期化UIから12要求実施し、HTTP400は再現しませんでした。合計23要求で終了。直接の保存入力再送診断は自動承認審査で再送の明示承認不足として拒否され未実施。新規UIからの通常runner実行は承認されました。HTTP400のプロバイダー内部の直接原因まで確定したとは扱いません。

実モデル成果は reports/virtual-beta-live-v2-2026-10-27/{comparison.html,comparison.json,manifest.json}、初回は reports/virtual-beta-live-2026-10-27。リポジトリには小さな smoke-results.json も保持。独立6件修正後の実モデル再実行は予算上限により未実施で、修正後のAPI経路はネットワークを置換したローカル検証です。結果の版を混同しません。

## 残る制約と次の作業

現行条件は既存部品を使う制御されたharnessで、旧CLIのfrontierや独立completion再質問を含む同一方策ではありません。旧CLIは残し回帰確認しました。Bは記憶・行動語彙・方策質問・samplingの束であり、単一要因への因果帰属には別設定のablationが必要です。

通知停止以外の独立oracle、公開製品向けアダプター、動的注意/学習済み視線、認識・読解・忘却・感情・信頼、人間の比較データは未実装または未検証。次の優先順位は tasks.md に残しました。上限に達した1回の疎通から、視覚制約が人間の失敗を予測した、Bが人間らしくなった等とは結論しません。
