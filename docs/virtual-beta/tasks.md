# Implementation ledger — 2026-10-27

T00 complete: requested virtual-beta docs absent in working tree and both available origin branches. No filesystem AGENTS found at repo/parents; supplied instructions apply. Baseline HEAD a442b44; latest dirty source copied into isolated feature/virtual-beta-foundation and committed. Original tree preserved. TypeScript passes; 18 persona/memory/completion/back regression tests pass. Existing LOOP fix verified. Existing actual image-only proof and persona experiments retained; human equivalence not established.

Parent owns contracts.ts, runner/virtual-beta*, configuration, shared engine changes if needed, package scripts/docs/integration. A owns jev/virtual-beta/vision.ts + tests/virtual-beta-vision.test.ts + docs/virtual-beta/vision-research.md. B owns jev/virtual-beta/user-state.ts + selection.ts + tests/virtual-beta-state.test.ts + docs/virtual-beta/state-research.md. Same isolated worktree; distinct ownership because copying uncommitted latest work into three independent checkouts would complicate verification without adding isolation between these non-overlapping files. No dependency changes by workers.

Acceptance fixed before parallel work: four saved configurations same reset UI, goal/persona/date/viewport/seed, only A vision and B state/selection toggles. Crop/foveated actual transmitted PNG and SHA/coordinate metadata; constrained wire payload excludes DOM/title/semantic candidate labels/history/audit. Separate look vs UI execution budgets; look must not invoke UI. User memory only user observations, capped and fresh each run. Validate distributions fail closed, raw/filter/selection and seed draw persisted/replay. Outcomes distinguish objective and subjective, abandonment and infrastructure errors. Latency not modeled human time. Legacy regression + browser four-arm smoke + fresh independent reviewer on frozen snapshot; findings fixed/retested <=3 rounds. No human-validity claim.

Baseline: existing full-frame numbered image + DOM goal-driven choice. Comparison harness reuses requestFor goal instructions, evaluateChoices, local POM, charter filtering, oracle, and image numbering; old experiment CLI remains untouched and separately regression tested. Existing frontier recovery is a goal-assistance feature, not assumed human memory; comparison harness does not remove revisits by default in any arm. This controlled harness baseline is not identical to every legacy CLI option; settings document the differences.

Next: A/B implement; parent comparison/replay; integrate; freeze; independent verify; fix/reverify; final commands/results.

## 実施記録

T01/T02: Aが視覚変換・候補境界15テスト、Bが状態・sampler15テストを実装。親が比較runner/設定/入力allowlist/リプレイを統合。初回独立対象5b336d4。実装前基準と旧LOOP回帰は維持。

T03: 実ブラウザーで4条件（モック）成功。実Jevは初回11calls中B2条件がHTTP400。未参照記憶アセットをローカルRED/GREENで修正し、新規UIから12calls再実行してHTTP400なし。計23callsで終了。4条件の初期fingerprint一致。モデル提案backをseed分布がlookへ変えて実行した証拠あり。初期不具合版と修正版を混ぜて成功率を推定しない。

T04 round0: 新しい独立検証サブが6件のP2不具合を再現。期限、分布分類/根拠、モデル同一性、最終監査、API予約数。親とBがround1で修正。再検証固定版9218366。旧全体テスト623件中620pass/0fail/3skip、最終版の関連回帰と独立再検証はverification.mdへ追記。

## 次の作業（今回未実装・未検証）

優先1: 同じ予算を十分に確保して反復4条件実験を設計し、API/操作上限による打切りをUX離脱と分ける。今回は各条件1回の疎通で性能差を検定しない。

優先1: Bの状態容量・方策質問・samplingを1要素ずつ切り替えるablation。現4条件はB部品全体の比較であり、記憶だけの因果効果ではない。

優先1: 認識・期待更新のモデルを拡張する場合、観察画像と短い出典付き認識を結び、監査知識を使わず更新する契約を定める。現在は観察のrecency bufferで、理解や忘却の再現性能は未検証。

優先2: 公開製品へ同じ境界を適用する監査/実行アダプター、通知以外の独立oracle（特にダウンロード）、UI操作リプレイの拡張。既存PublicSitePageとaction-traceを再利用する。現リプレイは分布算術と入力画像の検証。

優先2: 動的注意/視線学習は、公開コード・実在する重み・データ・利用許諾・依存・必要性能を一次資料で確認し、fixation生成接続へ限定して比較する。今回学習モデルを採用したとは扱わない。

人間との比較: 母集団/課題/初期状態/デバイスを揃えた参加者データ、操作時間とAPI latencyの分離、必要な視線・認識・離脱理由、同意、較正用と評価用課題の分離。人間の一致度は今回の完了条件に含めず未検証を維持。

## 完了

T04 round1 再検証完了: 新しい独立検証サブが固定製品版9218366を受入。F1〜F6すべて解消、追加の期限/unknown oracleケースも通過。型・β50件成功、foveated/crop各4条件の実ブラウザー疎通、32選択52画像参照と89ソースhash一致。親の最終buildと旧機能関連21件も成功。最終製品コードは再検証後変更していません。文書/測定設定だけを最終コミットへ追加。詳細verification.md、独立記録independent-review.md。人間再現・最終版の外部モデル性能は未検証。

## Phase 2 引き継ぎ

開始基準5f7051dで全体回帰640件637成功3skipを確認後、3UIの制御比較、監査ROIと時系列、累積API台帳、予算による終端分布変更の注記を追加。UI比較4c72c3f、期限修正後の最終製品固定ad1d644。新規実APIは診断23＋UI初期反応21＋修正後確認4＝48/48。最終検証はphase2-verification.md、独立記録はphase2-independent-review.md。

次の優先タスクはphase2-verification.mdの3件へ集約する。意味と番号の両方が初期に隠れる最小課題、視覚・状態を固定した選択方式の分離、人間比較データ契約。既存観察例を理解の証明やUI優劣へ読み替えない。

## Semantic controls（2026-10-28）

親とsemantic_ui/semantic_analysisが、意味を示す案内だけを隠し、両A/B操作を常に候補に残す反転課題と固定12枠の比較を実装した。新規実API47/48、20試行。可視対照は2/2選び分け、自律取得は初期非可視18件すべて注視0。表示維持追試2件では主観的doneと独立結果が不一致。座標契約の補完後も注視0。実装・API・UI・状態・分布の追跡と、人間記録器の接続を追加し、能力未達と区別した。基準・各版・修正・個別結果はsemantic-verification.mdとsemantic-results.json。

次の優先順位はsemantic-verification.md末尾の3件に限定：観察に根拠を持つ未取得情報/副作用の判断部品、同じ最終版での可視対照と自律取得の反復、その後の人間比較。新しい実APIは既存台帳をリセットせず別の承認枠で実行する。

## Information state（2026-10-28）

a064e98から新ブランチfeature/virtual-beta-information-stateへ分離。親共通接続、information_stateモジュール、information_analysis解析、fresh information_verify独立検証。初版b4d6a36の状態提示のみでは、不足→盲目的クリック、未達評価→doneが実モデルで発生した。候補説明にも同じ仮説を提示するcandidateEffectsを任意追加。最終製品6b3c418では、1件が自律注視2→新案内→正解B→done・表示維持oracle true、もう1件は案内未取得でA正解。全8試行31/32要求、以前の47台帳は別保存。独立P2はreplayの記憶画像参照の結合不足で、RED再現→修正→GREEN。結果・設定・コマンドはinformation-verification.md、個別値information-results.json。安定性・因果効果・人間一致は今回の少数例から結論しない。

次の実装・検証は同最終版反復、評価と選択の不整合の比較、人間実測の3件。新しい無根拠スコアや強制注視・正解候補フィルタで未達を隠さない。


## Human comparison（2026-10-28）

ea27c3cで通常bad/同Charter/全viewport画像のみ/Personaなしgoal baselineを固定し、人間の操作・感想を入力せず1回実行。最初のカテゴリは各種設定で一致したが、各種設定→お知らせ→マイページを4反復しDECISION_LIMIT/objectivefalse。本人は別カテゴリから達成。新規13要求=探索12OK+レビュー1ERROR、以前の残り枠は保持。新wrapperの会計・出力再利用を独立RED→修正→GREEN、レビュー診断不足も事後に修正し実API再確認は未実施。初期画素4.35%差・有限記憶・番号の差があり、人間一般や内的期待の一致は未検証。人間の原文・rawログはローカルのみ。結果と次の優先事項はhuman-comparison.md。
