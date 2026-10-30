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


## Deliberation recovery（2026-10-28）

既存二段階をsame bad/同目的へ接続（6981925）。初回7要求でdecision4 assessmentのmax_tokens_exceeded。長文脈を最初から明示するopt-in接続だけを68f4455へ固定、画像/本文/候補・方策不変・1attemptで再実行24要求全OK。12判断で3画面4循環、目的false/DECISION_LIMIT、切替未達。独立監査で評価→選択入力・全画像・候補・台帳一致、関連44件/型/build成功。都度API許可を聞かない指示を保存し、旧枠は保持。次はsource scene+target+prediction+observed outcomeを結ぶ経験状態、再訪が必要な正例を含む受入条件。単に訪問済みを禁止したり、根拠なしのgoal自己申告を事実にしない。結果はdeliberation-recovery.md。

## 経験状態と選択の切り分け（2026-10-28）

- 実装済み：画像bufferと独立した経験容量、出発画像+候補ID+予想+実結果の対応、根拠付き結果評価、現在の同画像/同候補への提示、保存経験のreplay。旧モード維持。
- 確認済み：関連127件、独立検証、型/build、実モデル2+1試行72要求。根拠説明は別opt-inで固定し、旧結果と台帳を保持。
- 未達：3試行とも同3画面を反復、12判断で未達。最新では根拠付きneutral/not_supportedがあってもe4を再選択し、履歴の接続だけでは不十分だった。詳細experience-recovery.md。
- 次のP0：自己評価と次行動分布の矛盾を扱う再計画/選択方策の比較。反証された期待と合法な再訪を両方含むホールドアウト課題で検証する。P1：自己評価の意味精度、P2：別参加者・別課題の人間記録による較正。今回は未実装・未検証。


## 非進展の入口を一時保留（2026-10-28）

基準dfa2360、製品凍結5abeef3。実装サブが境界付き保留状態、親が正の重みとrunner/replay、新規の独立サブが実ブラウザー/実入力/保存実験を検証した。保留をモデル本文に入れず、同じ経験から選択直前に補正するopt-in experience-deferを追加。実API対照24＋保留14=38/48。対照12判断未達に対し、保留ありは一周後の元入口e4=.91を下げてe5へ実移動し、6 UI操作/7判断で客観達成・主観完了。e5とscroll_downは同率、既存キー順argmaxで選択された。人間頻度やモデルの再計画能力の検証とは区別する。

関連145件、型/build、旧3実験と今回2実験のoffline replay成功。独立fixture初回失敗はhover差による画像不一致を確認し、実ホームリンクでの同画像帰還へfixtureを修正。全候補保留後の実再訪はscripted browserで成立、live成功経路では未観測。詳細・設定・実行コマンドはtemporary-deferral.md、匿名測定temporary-deferral-results.json、独立記録temporary-deferral-independent-review.md。

次の優先事項：1) 正解ラベルやIDに依存しない別配置・別課題/複数seedで、切替・必要な再訪・誤保留を固定版で反復測定する。2) hover/描画差でも同じ画面と扱う観察同一性を、誤った同一視の負例込みで設計する。3) 閾値/重みを、較正用と評価用を分けた人間記録で検証する。モデル確率0の代替先は今回探索できない制約も対象にする。追加モデル学習や意味理解の解決は今回未実装。


## 別課題・画面の固定版比較（2026-10-28）

76d687bで3課題×2画面×2反復×2条件の比較runner/fixture/分析を追加。実行前の独立REDでnative Backによる正当なホーム帰還が前提成立に反映されないfixture不具合を修正し、5798717へ固定。方策・重み・profileは4a67772から不変。24試行244/576要求、全API1attempt/longContext、0fault、24replayと12組の初期条件一致、旧10台帳不変を独立確認した。

結果：対照10/12・保留10/12。必要再訪と直接操作は全16試行達成、配送alphaは全4試行が保存前doneで未達、beta全4達成。保留ありrevisit-alphaでは確認済みの前提が変わっても古い保留が残り、必要な共有設定への再訪を妨げて各2操作増えた。後で候補枯渇解除により達成した。人間の頻度やUI変更の因果効果には読み替えない。

実行後にemptyhash/#homeの同じUIを別routeとした集計不具合を、専用aliasと20回帰追加で修正。旧summary/result/manifestを保持し同じ24件をoffline再集計、API追加0。旧126＋新47＋独立9=182関連検証、型/build、全実保存監査を記録。詳細はholdout-stability.md/holdout-stability-results.json/holdout-independent-review.md。

次のP0：変更予定・プレビューと保存済み現在状態を区別する完了評価。P0：観測した前提変更に応じて保留理由を再評価し、必要な再訪を遅らせない。P1：描画差の観察同一性。今回はここを結果に合わせて修正せず、先に固定版の能力限界を確定した。ペルソナ差・人間への一致・公開製品での安定性は次段階。

## 保留理由と前提変化の固定版比較（2026-10-28）

基準a106214、製品凍結0898405。理由担当が世代に結ぶモデル仮説と原画像参照、比較担当が12固定枠と会計、親がprofile/config/core/replayを接続し、別コンテキストの独立担当が通常アダプターのfetchスタブと実ブラウザーを確認した。旧experience-deferを維持し、新experience-reasonだけ有効化。追加API段階0、recency3に理由元画像最大1を追加する宣言済み比較。

12試行208/288要求、旧34台帳不変、6組の初期条件一致。旧4/6、新4/6で全体改善は未確認。beta反復1でprerequisite/o2→本人確認済みo5→basis_changed→raw保持/effective解除→実再訪が成立し7UI、旧方式は古い重みで迂回して9UIだった。理由の質問14回に対し受理1・レビュー1・解除1のみ。alphaでは妥当なo2でも旧非進展evidenceに含まれず拒否する例があり、通知停止の新2件はunknown/noneのまま未達。成否と理由更新を分けた結果はdeferral-reason.md/deferral-reason-results.json、独立記録はdeferral-reason-independent-review.md。

関連114+独立6件、型/build、旧24と今回12のoffline再生を確認。次はP0:非進展の根拠と阻害理由の根拠の分離、P0:切替と観察同一性の独立検査、P1:未変更/無関係な変化を含むモデルの解除判断の評価。今回結果に合わせた受理条件や重みの変更はしない。保存前プレビューの完了誤認は別の未解決P0、人間の再現と一般的安定性は未検証。

## 阻害理由と非進展根拠の分離（2026-10-29）

基準aed3dcd、製品凍結959c5de。新experience-reason-excursionで同世代・同じ連続経路の添付済み画像を理由として受理し、negativeEvidenceとexcursionEvidenceを別記録。旧reasonと12試行204要求で比較、旧46台帳保全・6pair一致・12replay・基盤障害0。旧4/6、新5/6だが、増えた通知停止には理由記憶がなく因果効果とは扱わない。新方式は有効な共有prerequisite4件を保持、レビューのbasis_changed/noneやstill_blocksにより不要往復が残った。詳細deferral-admission.md/results/independent-review。

106関連＋独立6件、型/build、旧保存12の互換を確認。追加の独立反復でpersist境界の基盤エラーがあり、一時ファイルを保全、最終6件と500回probeは成功したがOS原因は未特定。次に判断/根拠の結合、台帳write/replace診断、見え方が変わった同経路の認識を改善する。人間一致や探索安定化の目標は未達で継続。

## 予算保存の診断（2026-10-29）

予約と送信後の台帳保存失敗を分け、write-temp / replace-ledger と許可リスト内の OS コードを記録する最小修正を完了。
helper 42 件と既存予算 3 件、human wrapper 5 件、型と build が成功。
関連回帰の初回 2 件は初期 navigation timeout で失敗し、trace を保全した後の直列 7 件は成功した。
過去の間欠的な保存障害の OS 原因は未特定。
独立 16 件と通常/明示 pin の各 2 件も成功。判断と根拠の整合性、画像差への経路認識、保存前 preview の完了誤認を継続する。
詳細は budget-diagnostics.md。

## 判断と根拠の結合（2026-10-29）

基準 dbbae0b、最終製品固定版 7861582。
新 reviewMode=grounded-choice / experience-reason-grounded を opt-in で追加し、原根拠、後続の実添付、世代、画像の検査を維持した。
既存の二段階と画像上限を揃え、reason-grounding で新旧 12 試行、188/288 要求、基盤障害 0、初期 6 pair 整合、旧 58 台帳不変、新 12 replay 成功。
新方式は必要再訪 4 件で changed_o5 による最初のレビュー解除が成立したが、全体成功は旧 5/6、新 4/6。
alpha 反復 2 のみ 9→7 UI、他の必要再訪は全て 7 UI。
通知設定は全 4 件で理由レビューを使わず、旧 1/2、新 0/2 だった。

関連 122 件と独立最終 9 件、型、build、旧 24 replay、最新の既存 4 条件 mock が成功。
独立レビューで比較 plan の返却 mapping が共有される不具合を再現し、1 行のコピー修正後に再検証した。
実モデル結果は別途 raw artifact と画像を独立監査した。
未変更・無関係画像での誤解除、人間一致は未測定。
次は通知設定の行き詰まり、scroll / hover 後の同一画面認識と探索候補の扱いを実観察から切り分け、負例のモデル対照を追加する。
preview の完了誤認も未解決。
詳細は deferral-grounding.md / results.json / independent-review.md。

## UI 操作内に再訪補正を限定（2026-10-29）

基準4197971、製品初回29b3a0b、最終e432f18。
旧通知失敗3件のraw戻る .86/.83/.86 とstuck .04/.05/.04を確認し、global補正によるcontroller停止と訂正した。
新experience-reason-conditionalはid/selectionScopeだけをgroundedから変更。補正前UI選択ならUI内補正、非UI選択は保持し、marginal/条件付き分布/実型によるscope/replayを保存。
独立検証が形状検査不足を検出、親もdisabled scope不具合を再現し、最小修正後に独立13件と型/buildが成功。関連159種類（修正後の関係70件を再実行）、旧36replay、既存4条件mockも成功した。
独立の全段画像一致試験はo6の描画差で成立せず、exact初期10要求と画像参照以外の契約比較を別に保存した。

実12試行224/288要求、旧70台帳不変、6pair整合、12replay、基盤障害0。旧4/6・新4/6、必要再訪8件全7UI成功、通知4件は12判断の上限終了。
今回の実モデルでcontroller停止昇格は新旧0件で、新通知2件では同じraw/weightをglobal再計算するとSTUCK、実conditionalはBack実操作となることを独立照合した（目的改善とは別）。過去3件offlineと独立stubでも確認。新56scopeと補正前done保持4件を記録した。
意味理解や成功率の改善、人間一致を確認したとは扱わない。

次のP0は、hover/scrollと候補ID変化を跨ぐ、実際に観察した候補と操作結果の対応付け。前提や文字の変化を誤統合しない対照を用意する。
P0:通過操作と目的操作の保留理由、preview保存前完了、未変更/無関係な変更での誤解除。
P1:ペルソナ差・人間の探索切替・別製品の安定性。新たな比較では今回を含む旧82台帳を保全する。
詳細はdeferral-scope.md / deferral-scope-results.json / deferral-scope-independent-review.md。

## 観察の対応付けの追加検証（2026-10-29）

- [x] 実画像hash・実操作経験を改変せず、過去実画像を検索し、現在候補との対応仮説を評価・行動へ接続するopt-inを実装。
- [x] 複数候補の同じ出典への衝突、不正分布、画像上限、時系列、試行分離、無効設定の回帰と改変拒否を独立検証。34/34、過去48replay、82台帳不変。
- [x] 同じ製品版で実モデル12試行・224要求を完了。旧4/6、新4/6。対応注記7件と実選択を確認したが、通知設定の切り替えは未改善。
- [ ] 画像検索が候補を取りこぼす割合と、unchanged/changed/noneの意味精度を目的と前提条件の正解付き追加課題で計測する。今回の少数実行やリンク数を精度とみなさない。
- [ ] 正しく対応した過去の非進展注記があっても繰り返す場合、ページで見つからなかった情報・探索仮説・他候補への切り替えに必要な意味記憶を切り分ける。再訪禁止や制御器の正解経路で隠さない。
- [ ] 人間の必要再訪・見落とし・探索切り替えを未学習の課題で比較する。人間データをモデル入力に混ぜない。

## Goal別探索結果の追加（2026-10-29）

- [x] 既存ImageJudgmentMemoryとChoice契約を棚卸しし、自由記述と選択式の意味を区別する。
- [x] 容量8のGoal束縛記憶、current画像のGoal項目・非網羅finding、実行済み経路のsource/resultを保つ候補注記をopt-in実装。禁再訪や新しい分布補正はなし。
- [x] 純粋82、接続1、通常mock1、従来4条件mock、過去60replay、既存browser回帰4、型/buildを確認。記憶コピー落ちとmockの不正回答はREDを保存して修正。
- [x] 配線の独立検証・指摘修正・19件の再検証、部分実行5件のraw監査を完了。
- [x] HTTP402で次試行へ進まない運用修正と独立検証5件を完了（実API0）。
- [ ] 外部HTTP402復旧後、固定版で実モデル12試行を新規出力先に実行し、完全な比較を監査する。
- [ ] 分類が正しいのに同じ入口を選ぶ場合、Choiceの粗い意味表現とactorへの接続方式を再検討する。単なるneutral→失敗の置換や再訪禁止で成功を作らない。
- [ ] 未学習画面・複合Goalの同時発見・人間の探索切り替えを追加測定する。今回の部品成立と人間一致を同一視しない。

Goal探索の実比較はHTTP402で中断。有効pair0・38要求、全12試行と必要再訪は未完了として維持する。配線独立19/19、保存5replay/trace、94台帳とraw214件不変は確認した。運用修正として、HTTP402を受けたバッチを次試行へ進めず、個別台帳に基づく使用数と失敗理由を確定して停止する処理を追加し、独立検証を終えた。要求断片のcontext誤分類の懸念は別の意味評価タスクで、コードの特例や再訪禁止で隠さない。

## Goal断片の意味監査（2026-10-29）

- [x] 保存された元回答・全文・受理後評価を独立に確認。停止要求のコード上の削除は観測せず、初回からのcontext分類とNO_ADMITTED_EVIDENCEによる全Goalのuncertain化を区別した。
- [x] 読み取り専用監査、親AI作成・人間未検証のrubric、実rawへの実行と独立検証を完了。初回3P2を修正、独立再検証83/83＋関連71/71。分類の食い違いと全文/記憶の保持を別に集計した。
- [ ] HTTP402復旧後、同画面の接続形/完全文と記憶なし/過去分類ありを別条件にし、分類、全Goal、実選択を比較する。表現を変えただけで意味理解を実証したとは扱わない。

## Gateway再確認と残る実行（2026-10-29）

約1時間後の新規再開でも、最初の評価要求が実HTTP402。修正した停止処理は実サービスでも1要求・1試行で止まり、会計をused1/ERROR1として確定した。独立監査で次試行不在、旧215・新raw16不変、replay/traceを確認した。正常モデル応答0、有効pair0のため、性能比較の未完了を維持する。停止処理の実サービス確認は完了し、次の実行は外部gatewayの復旧待ち。詳細は[gateway-stop.md](gateway-stop.md)。


## チーム予算変更後の実モデル再比較（2026-10-29）

[goal-search-resumed.md](goal-search-resumed.md) に固定版6cb8/source1b8の12試行・202正常要求を記録した。旧5/6、新6/6、必要再訪は両方式4/4で全7UI、基盤障害0。過去の中断記録は保持する。同条件2反復の記述比較で、モデルの自発的な切り替えや新部品の安定した優位、人間一致を実証していない。要求の役割と現在の観察状態の分離、既存補正の効果を切り分ける対照は未解決の次タスクとして残す。独立検証は基盤PASS、12replay/trace・6pair・原本不変を確認した。navigation/target分類14提案とaction/context分類38提案の意味上の対立は未解決。関連91/91・build成功。詳細は同文書と独立所見に保存した。

## Goal 役割と出典参照の修正（2026-10-29）

- [x] role-state-v2 で要求の役割と画像状態、execute と navigation を分離。通常 12 試行 210 要求、親と独立の分類監査を完了。既存の全文、画像、候補と選択補正を維持した。
- [x] 元の 2 分類について今回の rubric 対立の減少を記録。旧 6/6、新 5/6 のため、探索性能の安定化とは扱わない。
- [x] 独立が発見した unsupported contradicted 6 件を受け、source-grounded を追加。新規記録の出典参照と既存 evicted 参照の保持を分け、独立 P2 を同じ 2 ケースで修正確認した。
- [x] 標準初期 goto の hard10sec を残り予算以内、最大 30 秒へ修正。遅延実画面と短予算で RED/GREEN、既存の予算注入 2 件の回帰を確認した。
- [x] source-grounded の通常 12 試行・193 要求を独立監査。1 件の応答後保存障害を原本と未決済のまま保全し、有効旧4/5・新6/6を記録。
- [x] 0f0/source5120 で全体 1666 件を完走。1656 成功、7 失敗、3 opt-in skip を保存。途中中断分や今回を全体成功と扱わない。7 件は後続の最小修正と関連再検証へ分離。
- [ ] 過去非進展が届いても入口を繰り返す原因を、候補の観察 ID と通過経路を保つ比較で検証する。欠損記憶を未試行と決めず、再訪を一律禁止しない。
- [ ] 正しい出典への誤読、別画面、複合 Goal、対象ユーザー集団との一致を追加測定する。

## 台帳修正後の再比較（2026-10-29）

- [x] 実 FS 共有ロックで EPERM を再現し、同じ temp の rename のみ最大 4 回、250ms の新規試行開始ガードを追加。JSON 化と wx は 1 回、HTTP 再送なし。
- [x] 同一台帳の FIFO と呼出時の保存先を固定。独立 P2 の相対パス/CWD を既存 assertion のまま修正確認。新旧 helper65/65、独立14/14、型と build が成功。
- [x] 0f0ba07/source5120 で通常の新規 12 試行を完了。194 OK、未決済0、基盤障害0、旧6/6・新5/6。必要再訪8/8、全7UI。安定化や人間一致とは扱わない。
- [x] 最終 194 要求の原本、全 24 unique PNG、12 trace/replay、6 pair、出典を独立監査。旧 1517 原本・130 台帳と最終 422 原本が不変。
- [x] 最終比較版の全体 suite を完走し、7 失敗の独立診断と元ログを保全。
- [x] 固定版比較の 7 失敗を期待を維持して修正。関連 42/42、独立 13/13、skip0、build exit0。元全体 7 失敗と skip3 は原本のまま保存し、全体再実行の成功とはしない。
- [x] 旧 persona 初期 goto 10 秒超過を 11 秒 HTML 遅延で RED 再現。初回だけ 30 秒へ修正し、同じ test GREEN 1/1、API0・他操作 10 秒保持。
- [ ] P0: 正しい役割と非進展が届いても同じ入口を再選択する判断、候補の観察ID付き経路の接続を検証する。
- [ ] P1: 実モデルで保持中 observed が覆る正負対照と無関係変更、人間の探索との比較を追加する。


## 方式固定の別課題評価（2026-10-29）

- [x] 基準999a7e4/全profileを固定。既存116filesとactor segmentsを維持し、catalog/draft/helpの2版を追加。18新規・3既知、上限/順序/停止規則を実行前に登録。
- [x] 新6UIの到達・誤対象・未保存・部分案内・reset/Backを実ブラウザーで確認。独立31/31＋6UI/44項目、親transport2/2・型/build。
- [x] 関連199件は198pass/1failとして原本保存。旧test単独10/12、基準parser比較1/2で短timeoutの既存不安定性を区別。full suite成功とはしない。
- [x] 73b1ff3/source8a5bを固定して通常Jevを実行。13試行92要求（91OK/1ERROR）、402即停止。有効新規10/10・既知2/2、障害1・未実行8。3巡目完走は未達。
- [x] 独立が299実行原本・13replay/trace・92currentframe・66uniquePNG・旧1939原本/142台帳を監査。
- [x] 保存文抽出空白によるoptional credit偽陰性6件を、3件RED→関連26GREENで最小修正。原本不変のderived-v2へ分離。API0/UI0。
- [x] P0: 未試行枠だけを固定producerで継続。第2フェーズ1件/1要求は402停止のまま保持、第3フェーズ7件/54要求は全件達成。累計21試行/147要求（145OK/2ERROR/0RES）、有効新規16・既知3、未試行0。障害2枠は再実行しない。
- [x] 継続専用script/testと厳密な3フェーズ集計を追加。親関連28/28・型/build、final7事前独立3/3と通常wrapper mock1を確認。旧2258原本・129source・旧script/test不変。
- [x] 独立が全21replay/trace/1732回答/72選択/147台帳を監査し、旧2258＋新170原本・129source不変、公開JSON/CSV一致を確認。2障害を保持した最終PASS。
- [x] P1: 別課題で行き詰まり後の切替・前提変更前後の再訪を事前登録して実測。以下の探索切替・再訪評価を参照。
- [ ] P1: 旧holdoutの初回navigation/2秒click待機の不安定性を、actor最適化と混ぜずに診断。
- [ ] P2: 個人差・人間一致・実製品への転移は専用データで検証。今回nullpersonaの成功から主張しない。


## 別課題の探索切替・再訪評価（2026-10-29）

- [x] b7ce1cdを基準に2課題×3条件×2反復を登録。actorと通常transportを維持し、blocked開始、目的、全画面、personaなし、上限と順序を固定。
- [x] 別担当がUIと到達性テスト、解析モジュールを実装。親が最小adapter、oracle、batchを統合。既存source129のうち変更7adapter、新規8source。
- [x] 新規36件、従来関連44件、transport3件、型/build。独立preflightはAPI0、モック3件。台帳settlement時に停止理由が隠れるP1を再現・修正・再検証。
- [x] ca1f078/source16ab01bを固定し12/12試行、184 OK、障害0。switch4/4、changed4/4、unchanged0/4。未達は全件DECISION_LIMIT。失敗枠の置換や結果を見たactor調整は行わない。
- [x] 独立が原本423件、12replay/trace、全現在画像・分布・実選択・上限を照合。以前の2428原本、137source、147固定ファイルが不変。公開JSON/CSVと実入力PNGも照合。
- [ ] P0: 可視の前提操作を目的と結び付ける判断を検証。照合候補を未実行のまま戻る4未達を、無関係な確認操作も含む固定対照で調べる。
- [ ] P1: 保留方策による8選択変更を、同じ上限・UIで方策の有無と比較。必要再訪を妨げないことを測る。8変更を4未達の原因と断定しない。
- [ ] P2: 自力の行き詰まり発見、視覚制約、ペルソナ、対象集団の人間比較を別測定。今回の8成功から人間一致や一般的安定性を主張しない。

実行方法と全結果は [recovery-transfer.md](recovery-transfer.md)。実装・証拠監査のPASSと探索安定性の未達を分ける。


## Jev / OpenAI Decisions 同条件比較（2026-10-29）

- [x] 既存source141のactor・画像・候補・質問・操作方策を維持し、通常wrapperへ明示backendを追加。OpenAI Decisionsはnative fetch、追加依存なし。
- [x] 実装AがOpenAI adapter/test、実装Bが比較解析/test、親がwrapper・parallel2 batch・protocol・統合test・docsを担当。既定Jev dispatch本体は旧版と同一。
- [x] 新旧関連67/67、並列HTTPスタブ2/2、型/build。独立が予約のみをAPI到達と誤集計するP2をRED再現。消費数を保持してHTTP試行・到達・不明を分離し、独立GREEN。
- [x] producer0d4b450/source8cf3を固定し24/24有効・12pair初回一致、408 OK/ERROR0/RESERVED0。Jev8/12、OpenAI4/12。未達12件はDECISION_LIMIT、基盤障害0・偽完了0。失敗の置換と事後actor調整なし。
- [x] first assessmentの同一性と、その回答後のaction・経路差を分離。API待ち時間を人間時間にしない。両providerのUSD費用は未提供としてnullを保持。
- [ ] P0: 既存Jevを既定のまま、可視の未解決前提と候補の対応付けを選択式で追加し、無関係な確認操作を含む固定対照で検証する。今回のAPI差し替えでは改善しなかった。
- [ ] P1: 前提変更後の再評価・保留解除を検証。OpenAIの変更後4未達には選択方策による補正0で、モデルの出力に由来する選択が残った。
- [ ] P2: より自由な画像読解が必要ならResponsesの構造化出力を別方式として比較。今回Decisions単独の結果から他のOpenAIモデルの性能を推定しない。

原本・独立検証・実行方法は [provider-comparison.md](provider-comparison.md)。比較結果の検証と人間一致の検証を分ける。

## 候補役割と操作後確認の比較（2026-10-29）

- [x] d219f84を基準に、独立したactionRelations部品と新modeを追加。既存の画像・候補・二段階判断・sampler・oracleを維持し、追加API段階や再訪禁止は入れない。
- [x] 実装Aが部品/test、実装Bが比較runner/protocol/test、親が共通契約・core・replay・統合を担当。新しいコンテキストの独立検証を実施。
- [x] 関連193、新規最終31、独立36+4、build。出典数と画像種類数の混同を実験前に修正。独立が余分なreplay項目を受理するP1をRED再現し、修正後GREENを確認。
- [x] c8e3052/source233752を固定し24/24有効、12初回一致、368 OK/0 ERROR/0 RESERVED。旧・新とも8/12成功。unchangedは両方0/4で照合未実行。役割評価だけの改善は確認できず、任意modeに維持。
- [x] 独立が全24 replay/trace、画像・分布・実選択・会計・実状態遷移、143archive/149freeze/3754過去原本を照合。モデルの意味仮説の正しさとは分離。
- [ ] P0: 現在候補の直接根拠を現在観察へ束縛し、過去の条件根拠を別欄で扱う。過去o1のe1を現在o6の保存e1へ引用した実例が残る。
- [ ] P0: 実画像から未解決条件の具体文・短い根拠転記・現在候補との関係・操作後確認を取得する型付き接続点を実装・評価する。Responses仕様は確認済み、利用可否・精度は未測定。追加要求を別計数し、今回のrole追加とは別modeで比較する。
- [ ] P1: 旧方式も今回unchangedの記録画面へ4/4到達したが照合0/4。単なる画面到達や再訪回数を成功とせず、条件を変える操作まで評価する。
- [ ] P2: 対象ユーザーの比較データ、視覚制約・persona条件・実製品への転移を別測定。今回の8成功から人間一致を主張しない。

原本・比較コマンド・実際の画像は [action-relations.md](action-relations.md)、検証範囲は [action-relations-independent-review.md](action-relations-independent-review.md)。


## 画像からの具体条件と送信境界（2026-10-30）

- [x] 現在の候補の直接根拠と、過去の状況の根拠を分離。既定の役割質問は維持。
- [x] 任意のネイティブ Responses 抽出段階、仮説の容量制限、独立した要求台帳、失敗保存、リプレイを追加。
- [x] 三度の入力上限停止を原本のまま保持し、`current` の部分一致による画像複製を特定。
- [x] 明示画像フィールドだけを UUID 化する部品、成功・失敗時の対応表、実ブラウザーの回帰テストを追加。
- [x] 修正後の送信版を独立検証し、既知の失敗地点を通過。Responses の HTTP 200 応答も取得。最初の抽出は根拠なし未達として拒否。
- [x] 根拠条件を nested anyOf で送信し、受理基準は維持。固定版 ac2b8d7/source d36dd の18枠を実行し、全6初期組・289要求・15有効/3基盤無効を独立照合。
- [x] 独立AIが事前12画像/47引用と事後診断3画像を点検。8引用の結合記号不整合を原文のまま記録。中間操作と未達、3タイムアウト、入力保持と解釈変化を分離。意味理解の実証とはしない。
- [ ] 同条件の反復数を増やす前に、一試行ごとの入力・画像出現回数・要求数を固定できることを確認する。
- [ ] provider の旧比較を、修正済み送信における画像出現の違いも明記して再測定する。
- [ ] 人間データとの一致・ペルソナごとの行動頻度・未学習画面への一般化を別に検証する。

- [ ] P0: 未解決条件の継続・変更・解消を根拠付きで更新する。library/unchangedでは過去画像/記憶が届いても仮説が弱まり、変更入口へ再訪した。
- [ ] P1: 抽出の effort だけを変える比較で、3基盤無効の待ち時間と意味仮説の質を切り分ける。今回 low は未実行。
- [ ] P1: 逐字引用と解釈の境界を明確にし、画面にない「／」を追加した8件を保持したまま検証する。
- [ ] P2: dispatchに実適用したtimeoutMs/試行期限/準備時間を保存し、時間切れ分類の推定を減らす。

最新の全18枠・版別停止・独立画像監査は [visual-conditions.md](visual-conditions.md)。旧/現在根拠は各4/6達成、追加抽出は3/6達成・3基盤無効。優位性や人間一致は確認していない。


## 保存資料による起動遅延の修正（2026-10-30、後続版）

- [x] 全文一致による古い回帰検査を、隔離した旧b7 producer由来の実行契約比較へ移行。元の失敗結果を保持。
- [x] ページ準備約31.8秒の要因を単変数診断し、reports監視除外だけを追加。アプリの監視継続・reports非監視を実watcherで確認。HTML探索設定は変更なし。
- [x] d488a9a/source150=7e27d09aを固定し、独立16/16成功、改ざん拒否・env除外を確認。Windows限定、全体スイート成功とはしない。
- [x] 同版でswitchの3方式を各1回、通常実モデルで新規実行。全3有効・達成、28要求。残る予定15枠は未実行。元18枠とは合算しない。
- [ ] 元18枠で残ったunchangedの未解決条件の更新・中間操作の価値評価を改善し、必要再訪を含む別課題でも比較する。今回の起動修正から解決を推定しない。

コード版別の原本・独立ゲート・結果・次の改善は [visual-conditions.md](visual-conditions.md) を参照。


## 条件の継続記憶（2026-10-30）

- [x] 容量3の条件ID・過去根拠・現在状態・遷移・容量破棄を独立部品にし、opt-in actorへ接続。
- [x] native入力、両Jev段階、core、replayを接続し、改ざん・入力欠落・出典矛盾の初回3指摘を修正。FAILゲートも保存。
- [x] HTTP400用bounded診断と厳格なスキーマ整合、HTTP200出力矛盾を防ぐ一般化指示を追加。旧本文・schema/admission維持を独立確認。
- [x] 関連239テスト・型・build、実モデル5試行・104要求、固定ZIPでの独立394チェック、原本5709保全。
- [ ] 予定8枠の完了。連続TIMEOUT2件で5枠停止、3未実行。後から成功枠で置換しない。
- [ ] P0: 条件の同一性と現在の確証を分離し、未観測の同じ条件を新IDで重複登録して古い根拠を押し出す問題を改善する。現契約の限界であり、保持改善を認定しない。
- [ ] P1: native実dispatch期限と残り試行時間を保存し、API待ちを切り分ける。その後、effort単独比較を検討する。
- [ ] P1: 記録画面で情報操作を選ばず戻った事後例を、異なる履歴と実effectを保持して検証する。分類名だけを正解に固定しない。
- [ ] 反復・別画面・persona・人間対象集団の評価。今回の単回比較から安定化や人間一致を主張しない。

成果は [condition-continuity.md](condition-continuity.md)。以前22＋4要求と今回104の計130、フェーズ上限288、残158。


## 未解決条件の保持と残る送信期限計測

- [x] 任意grounded-unresolved保持・順位監査・actorへの監査ヒント除外。従来既定の互換性を維持。
- [x] 容量・過去根拠・解消・分離・replay改ざん・両判断段階配送を検査。関連339、独立6、型/build。
- [x] 2actor画像名衝突を独立再現して修正。関連15＋exporter4を再検証。FAILも保持。
- [x] 固定43f2f06/source154b1f1で新規48要求、2/4枠を実行。残2未実行、両TIMEOUTは性能分母から除外。
- [ ] P0: adapterが最終fetchへ渡すtimeoutを成功・失敗とも記録する。今回core計画値と最終値の差を独立再現し、未達を認める。API待ち・最終期限・準備時間を分ける。
- [ ] P0: 条件の同一性と現在根拠の契約を分離。保持順位だけで重複や誤対応が解決したとはしない。
- [ ] P1: 計測修正後、保持から中間操作選択への効果を別課題・反復で比較。今回照合0で優位性未認定。
- [ ] 人間対象集団・persona頻度・未学習画面への転移を別測定。

結果とコマンドは [condition-retention.md](condition-retention.md)。原本5784件、今回枠残96・未割当14を維持する。


## 最終HTTP計測の修正（後続版）

- [x] 最終AbortSignal値・外側期限・台帳準備の記録とrequired replay、欠測時停止。実API/独立確認は [final-http-timeout.md](final-http-timeout.md)。旧版欠測を遡及して埋めない。
- [x] 小さい明示要求上限、台帳との一致、全段階の消費停止、既定の互換を確認。
- [ ] P0: 条件の同一性と現在の根拠の契約。
- [ ] P1: 保持から中間操作選択への効果を別課題・反復で比較。人間集団への一致は別測定。


## 過去の未解決条件リンク：実装と実行

- [x] opt-inの候補別過去条件対応、厳格受理、両判断段階配送、旧方式互換、replay。
- [x] 独立P2の改ざん受理を修正・再検証。17改ざん拒否、関連236、型/build。
- [x] Jev4試行124要求と、別のOpenAI機能確認2試行72要求を実行・独立原本監査。
- [ ] P1: 対応を渡した後にも残る反復と、中間操作の選択を改善・別課題で検証する。最終達成は今回0。
- [ ] P1: 重複条件の同一性と現在根拠を分離する契約を、厳格受理を維持して設計する。
- [ ] 反復・対象集団の比較を追加する。persona効果・人間一致は今回未測定。

結果・版・コマンドは [visual-prior-links.md](visual-prior-links.md)。過去のFAIL・欠測・未実行を成功へ書き換えない。


## 2026-10-30 Working inquiry追記

実装・独立検証・修正再検証・実Jev新旧4試行は[working-inquiry.md](working-inquiry.md)。新1/2・対照0/2、各条件1反復で安定性未確認。次の未実装タスクは、選択条件/check/操作の次観察での結果評価、整合したintent/check生成、活動中の条件と保持記憶の分離、現在引用への過去文混入の検証。全体Goal進展と個別前提の解消を混ぜず、必要再訪・別課題・非null personaを含む反復と人間比較は別途行う。


## 2026-10-31 Inquiry outcome

[条件別結果の保持](inquiry-outcome.md)を実装・独立検証・実モデル比較した。予定8枠のうち実行8、有効8、無効0、未実行0。新方式は有効4件中3件、従来方式は有効4件中2件が目的達成。合計222要求。各条件1反復であり、安定した改善はまだ判定できない。 次は作業対象/intent/check更新、現在引用の出典検証、複数反復・別課題・非null persona・人間比較を分けて進める。過去のFAIL・欠測を成功へ書き換えない。
