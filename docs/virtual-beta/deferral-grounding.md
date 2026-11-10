# 保留理由と根拠を一つの判断で選ぶ（2026-10-29）

既存方式では「阻害理由が変わった」と「その根拠はない」を同じ評価要求で別々に選べた。
前回の実モデル比較では、この回答の組み合わせで必要な再訪が遅れた。
今回は再評価を一つの選択にする。
基準は `dbbae0b`、最終製品固定版は `78615827064b790b41515b8037dfe6d3b3479555`。
sourceHash は `d6f0f040dbe5710679a1b556f7df3bf30e748b7e96196da62d01bfffa7b0c80d`。

## 設定

`deferralReason.reviewMode` を `grounded-choice` にすると、新しい再評価を有効にする。
省略または `separate` は既存の質問形式を維持する。
既存 profile `experience-reason-excursion` に対し、新 profile `experience-reason-grounded` は設定 ID とこの項目だけを変える。
Persona と Charter は引き続き別入力である。

新方式は `reasonReview0Grounded` などの一つの選択質問で、`unknown`、`still_blocks`、`changed_o5` などを提示する。
`changed_o5` は「添付した観察 o5 によって元の阻害理由が解消された」というモデル仮説を表す。
元の理由が既知で、その元画像が実際に添付され、候補画像が当該保留より後かつ現在までに観察され、元画像と入口画像の画素と異なる場合にだけ changed 候補を作る。
選択後にも既存の世代、添付、順序、画像、理由の検査を適用する。

生分布は質問の応答として全て保持し、選択した token から既存の status と根拠参照を導く。
過去の二つの分布から新しい分布を合成しない。
理由記憶、画像の枚数、探索の二段階構成、行動分布の補正は既存実装を流用する。

## 比較

新しい `reason-grounding` 比較は、通知停止、必要再訪 alpha、必要再訪 beta の 3 課題を、旧方式と新方式で 2 回ずつ実行する。
計 12 試行で、各組の初期画像、Persona、目的、ソース、設定を確認する。
設定の比較から除外するのは ID と `reviewMode` だけであり、`basisAdmission` は両者で同一にする。

1 試行の上限は 24 要求、12 判断、15 UI 操作、3 注視、180 秒。
全体の上限は 288 要求、20 分、並列 1。
API の自動再試行は行わない。

```powershell
node --import tsx runner/deferral-reason-experiment.ts --comparison reason-grounding --mock --out reports/grounding-mock-new
node --import tsx runner/deferral-reason-experiment.ts --comparison reason-grounding --env-file 'E:\ChatGPT\Ux_test\.env' --out reports/grounding-live-new
```

実モデルのコマンドは通常の gateway に架空のローカル画面、目的、容量内の観察記憶を送信する。
認証情報は出力しない。
人間の操作記録や感想は入力に含めず、保存済み入力の直接再送もしない。

## 評価の限界

新形式で「変化あり、根拠なし」が出せなくなるのは出力契約の効果であり、意味理解の改善を示す結果ではない。
実際の最初のレビューから解除までの遅延、実行した再訪、不要な往復、客観的な目的達成を比較する。
変更のない画像や無関係な画像を選ばない能力は、別途モデルで検証する必要がある。
少数の反復から安定性や人間への一致を主張しない。

保留理由の判断は引き続きモデル仮説である。
hover や scroll による同じ画面の認識、preview と保存済み状態の区別も別の未解決項目として残る。

## 実モデルの結果

12 試行を完走し、実送信と台帳予約はともに 188/288 件だった。
6 組すべてで初期画像、Persona、目的、設定差、ソースの整合を確認した。
新 12 件の offline replay は全件成功し、旧 58 台帳の hash は不変だった。
API、観察、操作などの基盤障害は 0 件だった。
ただし通知失敗の STUCK は補正後の選択であり、後続の診断で、生の分布は戻る操作を最大としていたことを確認した。
モデルが停止を希望した証拠とは扱わない。

- 全体の目的達成：旧 5/6、新 4/6。全体性能の向上は確認できない。
- 通知設定：旧 1/2、新 0/2。全 4 試行で理由の受理とレビューは 0。今回の再評価質問を使わない場面の差であり、新形式の効果とは扱わない。
- 必要再訪 alpha：両方式 2/2 達成。旧の UI 操作は 7、9、新は 7、7。
- 必要再訪 beta：両方式 2/2 達成。全 4 試行で 7 UI 操作。
- 旧方式のレビューは 5 回、根拠付き解除は 0 回。「変化あり、根拠なし」が 2 回あった。
- 新方式のレビューは 4 回、4 回とも最初のレビューで `changed_o5` を選び、元の保留を有効状態から外して再訪した。

alpha 反復 2 では、旧方式が本人確認の完了後も o6 で still_blocks と判断し、アカウントへ入り直した。
o8 は basis_changed だが根拠 none のため解除されず、代替候補を使い切った `ALTERNATIVES_EXHAUSTED` によって共有入口へ戻った。
新方式は o6 に添付された「本人確認が完了しました」の o5 を選んで解除し、往復が 2 UI 操作少なかった。
他の 3 組は両方式が 7 操作だった。
旧方式の到達には代替枯渇による再訪があり、理由に基づく解除の成果とは数えていない。

親は alpha / beta の元画像と完了画像を実際に閲覧し、必要条件と完了表示があることを確認した。
これは正例の監査であり、未変更や無関係な画像で誤解除しない精度を測った結果ではない。
新形式の 4 正例から一般的な意味理解や人間再現を結論しない。

6 組すべてで初回の評価入力 hash は同じだったが、モデルの回答分布は異なった。
各条件 2 反復の比較だけではモデルのばらつきと変更効果を統計的に分離できない。
画像の枚数と API 段階を揃えた上で、根拠付き解除から実操作までの接続が実モデルでも成立したことを確認した範囲である。

[機械可読の結果](deferral-grounding-results.json) に各試行、入力 hash、生分布、参照画像、解除と実操作を保存した。
原画像、trace、予算台帳、全応答はローカル `reports/deferral-grounding-2026-10-29/live/` に保持する。

## 分担と検証

親は共通型、設定、profile、core、replay、統合試験、固定版と実モデル実行を担当した。
理由担当は `deferral-reason.ts` と専用テスト、比較担当は `deferral-reason-experiment.ts` と専用テストを担当した。
新しいコンテキストの独立担当は通常 gateway の fetch stub と実ブラウザーで検証した。
同じ作業ツリーを使い、製品の編集範囲を分けて統合した。

関連テストは理由部品 88 件、比較 pure 25 件、親の新旧統合 9 件、計 122 件が成功した。
比較担当の旧 browser / env テスト 4 件は担当制約で除外し、pure 11 件を回帰確認した。
実ブラウザーの新旧統合と独立アダプター検証は別途実行した。
型検査と build、旧 24 保存試行の互換 replay も成功した。

独立検証では最初の固定版で 8 件が成功した後、返した比較 mode の mapping が次の比較にも共有される不具合を追加で再現した。
mapping をコピーする 1 行の修正を行い、修正版で 9/9 件が成功した。
質問、記録、画像、世代、実行候補など 12 種類の改変も拒否した。
実 API 要求は独立検証では 0 件だった。
[独立検証記録](deferral-grounding-independent-review.md) に初回、RED、修正、再検証を区別して保存する。

最新固定版の既存 current / vision / state / combined 4 条件も mock で実行し、すべて目的達成した。
これは fixture script による回帰確認であり、実モデルの 4 条件性能比較とは区別する。
current / state は各 2 UI 操作、注視 0、評価呼び出し 3 回、vision / combined は各 2 UI 操作、注視 2、評価呼び出し 5 回だった。
実 API は 0 件である。

```powershell
node --import tsx --test --test-concurrency=1 tests/deferral-grounding.test.ts tests/deferral-grounding-profiles.test.ts tests/deferral-grounding-integration.test.ts tests/deferral-grounding-independent.test.ts
node --import tsx runner/virtual-beta.ts --mock --out reports/four-condition-regression-new
node --import tsx docs/experiments/2026-10-29-grounding-audit.mjs reports/deferral-grounding-2026-10-29/live reports/grounding-audit-new.json
npm run build
```

監査コマンドは新規 API 要求なしで保存画像と分布を再生し、現在の旧台帳 hash も再照合する。
原ファイルを変更しない。

## 次に必要な実装

1. 通知設定の失敗地点を調べ、未知の行き先を残したまま探索を止める判断と、scroll / hover 後の同じ画面の認識を切り分ける。観測した画面に基づいて対応付け、監査 DOM や正解経路を判断へ渡さない。
2. 未変更、無関係な変化、元の阻害理由が解消していない場面を実モデルの対照として追加し、解除精度を測る。今回の正例と stub の非解除制御だけで安全な意味判断を確認したとは扱わない。
3. preview と保存済み状態を区別する完了評価を検証する。
4. ペルソナ差、人間の探索との一致、別製品での安定性を別の比較で測る。今回は初心者 A を固定した goal / argmax の探索比較である。

研究コード、重み、依存関係は追加していない。
新しい大規模基盤を作らず、既存 Choice API と型、runner、理由記憶、画像、選択補正、replay を流用した。


## 後続診断による訂正（2026-10-29）

通知の失敗 3 件では raw の戻る候補が .86 / .83 / .86、stuck が .04 / .05 / .04 だった。
再訪抑制が戻る候補に .01 を掛け、全候補で正規化した結果、stuck が最大になった。
以前の「モデルが選んだ STUCK」という記述を訂正した。
これらの試行の実送信数、目的未達、記録された終了理由は変わらないが、人間の行き詰まりやモデル自体の停止判断として解釈しない。
画像の同一性と未知の候補の評価に加え、選択補正の区分を独立した改善対象とする。
