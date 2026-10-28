# 再訪補正の範囲を分ける検証（2026-10-29）

再訪補正が終了を押し上げる不具合を修正し、独立検証と実モデル 12 試行を行った。成功は旧 4/6、新 4/6 で改善未確認。必要再訪 8 件は達成したが、通知設定の往復 4 件は未解決。

## 原因と今回の変更

基準は `4197971b987e6250ca747bd1907c3ce5d02c611d`、初回実装固定版は `29b3a0b2b70c97820c840d20d58bd65a4e67f646`、修正版は `e432f1895aa1ed2c85f8cb322ceb15e190c34c44`。
製品 sourceHash は `d03ff817a9f40102851d25386e573925923adb93b80aa1c91f349e8563f374a3`。

前回の通知設定の未達 3 件は、モデルの生分布では戻る候補が .86 / .83 / .86、stuck が .04 / .05 / .04 だった。
戻る候補へ再訪抑制の .01 を掛けて全候補を正規化した結果、controller が stuck を選んだ。
履歴がないためでも、生分布でモデルが停止を選んだためでもない。
[前回レポート](deferral-grounding.md) の説明を訂正した。
原 result と画像は変更せず、新しい補正の 1 判断だけを offline 計算すると、3 件とも stuck → back となった。
この計算だけでは、その後の目的達成は確認できない。

新しい `deferral.selectionScope: 'ui-conditional'` は、安全フィルタ後・再訪補正前の分布から従来と同じ seed / draw で一度選択し、その選択が UI 操作なら UI 操作の中で補正する。
UI は実 action.type の click / back / scroll と定義する。
補正前に done / stuck / abandon / look / reread / wait を選んだ場合は、その選択を保持する。
既定・`global` は従来の質問、入力、分布、seed を維持する。

これは controller の補正を分離するヒューリスティックであり、人間の意図や頻度を測ったものではない。
再訪の全面禁止、正解の「その他」への誘導、終了・離脱の無効化は行っていない。
同じ画面の hover / scroll による画像差や候補 ID の変化、通過のための戻る操作を保留する学習は今回変更していない。

## 設定と記録

`experience-reason-conditional` profile は既存 `experience-reason-grounded` の id と selectionScope だけを変更する。
評価→行動の二段階、画像上限、記憶、Persona / Charter、API 段階数は維持する。
`--comparison deferral-scope` は既存 12 枠（通知、必要再訪 alpha / beta、それぞれ 2 反復×新旧）を使う。
反復 2 で新旧の順番を逆にし、pair の設定比較から除外するのは id と selectionScope だけとする。
1 試行 24 要求、判断 12、UI 15、注視 3、180 秒。全体 288 要求、20 分、並列 1、再試行なし。

`selection.policy.scope` に補正前の選択、区分、実型から求めた UI 候補、UI の確率総量、重み付け後の UI 総量、全体分布 `marginal`、条件付き抽選値を保存する。
`marginal` は UI 全体の確率と各非 UI 確率を保つ。
`filtered` は選ばれた区分内での条件付き分布で、区分外の 0 は永久禁止や安全除外を意味しない。
modelChoice、補正前の seed による選択、実際の選択を別々に集計する。
保存分布の replay は監査側の実 action.type を再構築し、保存された区分一覧を正解として扱わない。

## 実行方法

新規出力ディレクトリを指定する。既存ディレクトリは上書きしない。
実モデルでは通常 gateway がローカルの架空画面・目的・許可された観察記憶を送る。
人間の操作・感想や保存済みの入力を再送しない。

```powershell
node --import tsx --test --test-concurrency=1 tests/ui-conditional-selection.test.ts tests/ui-conditional-profile.test.ts tests/ui-conditional-replay-candidates.test.ts tests/ui-conditional-integration.test.ts tests/deferral-scope-experiment.test.ts
node --import tsx runner/deferral-reason-experiment.ts --comparison deferral-scope --mock --limit 2 --out reports/scope-mock-new
node --import tsx runner/deferral-reason-experiment.ts --comparison deferral-scope --env-file 'E:/ChatGPT/Ux_test/.env' --out reports/scope-live-new
node --import tsx docs/experiments/2026-10-29-deferral-scope-counterfactual.mjs reports/deferral-grounding-2026-10-29/live reports/scope-counterfactual-new.json
node --import tsx docs/experiments/2026-10-29-deferral-scope-audit.mjs reports/scope-live-new reports/scope-audit-new.json
npm run build
```

counterfactual は旧原ログがある環境で動作する。audit は実行時と同じ製品 sourceHash で実行する。
モデルや UI 操作は replay で再実行しない。個別には `npm run replay:virtual-beta -- RUN_DIRECTORY` を使う。

## 分担

親が共通契約、設定、profile、core / replay、統合、offline 計算、版固定、実モデルと報告を担当した。
実装サブは selection.ts と専用テスト、比較サブは比較 runner と専用テストを担当した。
同一作業ツリーで所有ファイルを分け、製品を固定してから新しいコンテキストの独立検証を行う。

## 残る課題

意味精度、通過と目的操作の区別、見え方が変わった同じ画面の対応付け、未変更・無関係の変化での誤解除、保存前 preview の完了誤認は分けて検証する。
条件あたり 2 反復の比較は記述的な結果であり、安定性・統計的な差・人間への一致を結論しない。
今回は新しい研究コード・重み・依存関係を導入していない。

## 検証と修正の経過

実装担当の新 30＋旧 18 件、親の初回回帰 99 件、統合・設定・候補再構築・比較 15 件、旧比較 pure 24 件を確認した（重複する担当テストを加算していない）。
独立担当は初回固定版で不正な click / scroll / look の形を受理して乱数 counter も進むことを再現した。
親も disabled な deferral に scope だけが残ると INVALID_DISTRIBUTION になることを実ブラウザーで再現した。
新 scope の action 形状検査 3 条件、core / replay の enabled guard を最小修正した。
修正後は追加 20 件の形状制御と disabled scope 1 件を含む関連 70 件、型検査、build が成功した。
初回と修正後を合わせた関連試験の種類は 159 件で、同じ試験を繰り返した回数とは区別する。
旧実保存 36 件の replay は修正版でも 36/36 成功、過去 3 失敗は原ログ不変のまま再計算できた。

既存 current / vision / state / combined は修正版の通常 runner の mock で全 4 件が客観的成功、初期状態一致、外部 API 0 件。
current / state は UI 2、注視 0、判断 3。vision / combined は UI 2、注視 2、判断 5。
これは scripted fixture による機能回帰であり、4 条件の実モデル性能測定ではない。

独立検証の通常 gateway fetch stub では最初の o1〜o5 の 10 要求が質問・入力とも完全一致した。
別 run の o6 は 1152000 画素中 716 画素、最大 channel 差 1 の画像差があり、その参照 hash が o7 の記憶へ伝播した。
文言・配置は同じに見え、カード border の描画タイミングと整合するが、原因は確定していない。
全段の完全同一入力を要求した初回テストは失敗したまま証拠を保持する。
画像差の実参照を対応付けた質問・入力契約の比較と、完全一致の主張は分ける。

独立再検証の 2 回目にも o6 の画像差があり、21306 画素（1.84948%）、最大 channel 差 7、同じカード領域だった。
初回の 716 画素 / 最大 1 と両方を保持し、完全一致の試験結果へ置き換えない。
修正版の独立 13 項目は成功し、通常 gateway の外部 fetch を stub に置き換えた新旧の実ブラウザーでは、旧 14 要求で STUCK、新 16 要求で back の実操作を経て主観的 done、客観的目的達成は両方 false だった。
新旧双方の保存 replay と 6 種の保存改変拒否、512 seed の独立 oracle、非 UI 全 6 種、境界値、安全除外、不正形状と counter 非消費、状態分離、旧 70 台帳不変を確認した。
独立試験の実 API 要求は 0。詳細は [独立検証記録](deferral-scope-independent-review.md)。

seed の再生は保存した分布からの選択計算の再現であり、API の生分布が毎回同じになることを保証しない。
同じ初期入力でもモデル出力が変わる可能性を、実比較の初期入力 hash と生応答の一致で別々に集計する。
モデルの理由説明は短い自己報告として保持し、内部判断の完全な記録とは扱わない。

## 変更したファイルと成果物

- 選択担当: `jev/virtual-beta/selection.ts`、`tests/ui-conditional-selection.test.ts`。
- 比較担当: `runner/deferral-reason-experiment.ts`、`tests/deferral-scope-experiment.test.ts`。
- 親: `jev/virtual-beta/contracts.ts`、`deferral-contracts.ts`、`config.ts`、`deferral.ts`、`runner/human-jev-profiles.ts`、`virtual-beta-core.ts`、`virtual-beta-replay.ts`、`virtual-beta-replay-candidates.ts` と profile / replay-candidates / integration テスト。
- 独立検証: `tests/ui-conditional-independent.test.ts`。既定は実行時の製品 snapshot に対して検証し、履歴版 pin を使う場合だけ `UI_CONDITIONAL_AUDIT_PIN` を指定する。
- 親の再集計: `docs/experiments/2026-10-29-deferral-scope-counterfactual.mjs` と `2026-10-29-deferral-scope-audit.mjs`。
- 作業計画: `docs/superpowers/plans/2026-10-29-ui-conditional-deferral.md`。
- 原画像・trace・全応答・台帳・固定版・RED/GREEN ログ: ローカル `reports/notification-switch-2026-10-29/`。旧実験を上書きしない。

統合先は `feature/virtual-beta-information-state`。製品の最終固定版は上記 e432f18 で、報告と独立試験の保存コミットは別に記録する。

## 実モデル 12 試行の結果

[機械可読の比較結果](deferral-scope-results.json) に全試行の設定、source、初期入力比較、生分布、補正前と実選択、分布の区分、経路、理由解除と会計を保存した。
全 12 件完走、224/288 要求、旧 112 / 新 112、各要求 attempts=1、再試行なし、基盤障害 0。
6 pair の初期画像・Persona・Charter・設定条件が一致し、旧 70 台帳不変、全 12 件の保存 replay が成功した。

- 通知設定: 旧 0/2、新 0/2。全件 12 判断で DECISION_LIMIT。旧 UI は 12 / 11、新は 12 / 12。旧の反復 2 の第 7 判断は look_0 による注視移動で、UI 操作ではなかった。
- 必要再訪 alpha: 旧 2/2、新 2/2。全件 7 UI / 8 判断。
- 必要再訪 beta: 旧 2/2、新 2/2。全件 7 UI / 8 判断。
- 合計: 旧 4/6、新 4/6。成功率の改善は確認できない。

今回の実モデルで実際に選ばれた終了への補正昇格は旧 0 / 新 0 件だった。今回の旧 arm では、過去の 3 件と同じ終了昇格は観測されなかった。
修正の根拠は過去 3 件の同一分布再計算、独立 stub の実操作、今回の新方式の実分布 2 件での反実仮想比較である。
通知の新方式 2 件の第 7 判断は、戻る e2 の生確率 .80 / .83、stuck .05 だった。同じ raw / weights に旧 global を適用すると stuck になるが、実際の conditional は back を選んで UI_PERFORMED となった。旧方式でその後まで実操作した反実仮想ではなく、選択計算だけの比較であり、目的達成の改善とは扱わない。
今回の新 56 判断では scope を記録し、必要再訪 4 件で補正前 done をそのまま維持した。
新方式の離脱・stuck・注視等の保持は制御テストで確認したが、今回の実モデルにその選択の正例はない。
新旧の必要再訪 8 件は全て根拠付き解除を経て 7 UI で達成した。

初期評価入力と初期行動入力の hash は 6 pair 全てで一致した。
評価の生応答は 6 pair 全て、行動の生応答は 4 pair で異なった。
後続の経路差や同じ入力のモデル変動を、この補正変更による意味理解の改善と解釈しない。

通知設定では、ホーム→各種設定→キャンペーン→ホーム→scroll→各種設定→キャンペーンのあと、back を含む往復が続いた。
新方式でも最後まで正しい通知設定へ到達していない。
終了へ誤って押し上げる controller の不具合と、履歴から探索先を切り替えられない問題は別であり、後者は未解決である。

## 次の改善の優先順位

1. P0: 現在の可視候補と過去に実行した操作・結果を対応付ける。hover / scroll の画像差、候補 ID の変化を計測し、過去の非進展を無かったことにしない。文字や前提が変わった画面を同じものへ誤統合しない対照も必要。全再訪の禁止へ置き換えない。
2. P0: 目的操作と通過のための戻る操作を区別して保留理由を検証する。未実行の候補についてのモデル予測を、実際に失敗した証拠として扱わない。
3. P0: 保存前 preview の完了誤認と、未変更・無関係な変化での理由解除を独立して検証する。
4. P1: ペルソナ間の差、人間の切り替え行動、別の製品やチャーターでの安定性を検証する。人間との比較データを追加してから一致度を評価する。

今回の controller 実装の受入と、人間の再現や自律探索の安定化の完了は分ける。後者の目標は継続中。

## 実モデルの独立監査

独立担当は親の summary を使わず、12 result、224 の保存応答、画像、台帳から再計算した。
224 応答が jev-1.14.0、attempts=1、会計 224 と一致し、新 scope の全 56 選択を実 action.type / baseline / mass / filtered / actual action から照合した。
原ファイル 536 件と旧 70 台帳は不変。12 replay と 12 trace archive の CRC、click / scroll の完了と実 frame URL 列も確認した。
CDP Back コマンド自体は trace の before-event に記録されていないため、戻る操作は raw action / outcome と後続 frame URL / 画像で裏付ける。
実モデルの sample mode、離脱の意味精度、一般的な探索安定性、人間一致は未検証。

独立監査の utility は `docs/experiments/2026-10-29-deferral-scope-independent-audit.mjs`、補助の trace 検査は同 `2026-10-29-deferral-scope-trace-audit.py`（Python 標準ライブラリーのみ）。
リポジトリへ移した実体でも両方を再実行し、raw / trace の検証が成功した。
保存した製品 revision は厳密照合し、現在の HEAD が報告コミットで異なる場合も、製品 sourceHash と全 sourceHashes の完全一致を要求する。

```powershell
node --import tsx --test --test-concurrency=1 tests/ui-conditional-independent.test.ts
node --import tsx docs/experiments/2026-10-29-deferral-scope-independent-audit.mjs reports/notification-switch-2026-10-29/live reports/scope-independent-new
python docs/experiments/2026-10-29-deferral-scope-trace-audit.py reports/notification-switch-2026-10-29/live reports/scope-independent-new
```
