# 保留理由と根拠を一つの判断で選ぶ（2026-10-29）

既存方式では「阻害理由が変わった」と「その根拠はない」を同じ評価要求で別々に選べた。
前回の実モデル比較では、この回答の組み合わせで必要な再訪が遅れた。
今回は再評価を一つの選択にする。
実モデルの比較結果は実行後に追記する。

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
