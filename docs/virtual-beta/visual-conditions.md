# 画像から具体的な条件を抽出する比較

この変更は、現在の候補に対する根拠を現在画像へ限定する修正と、具体的な条件を画像から取り出す段階を分けて比較する。
既定の Jev 方式は維持する。
現在は独立検証の修正後再検証中で、この版の実モデル比較は未実行である。

## 入力と判断

`experience-action-relations` は前フェーズの役割判定である。
`experience-action-relations-current` は `actionRelations.evidencePolicy: "current-candidate"` を追加し、現在候補の根拠と過去の文脈を別々に記録する。
現在の根拠がない候補は `unknown` とし、過去画像に同じ番号があることを代用にしない。

`experience-visual-conditions` は後者を継承し、`visualHypotheses: {enabled: true, capacity: 3}` を追加する。
OpenAI Responses の `gpt-6-luna` が、実際に添付する現在画像と限定された過去画像から、最大 3 件の条件、転記した短い根拠、候補との関係、操作後に確認する結果を JSON で生成する。
その後、既存の Jev による評価、行動の 2 段階へ渡す。
この抽出段は行動を選ばず、操作確率も生成しない。

引用には `model-transcribed-unverified` を付ける。
画像ハッシュの一致と、転記や条件解釈の正しさは別である。
記憶するのは最大 3 件の仮説であり、以前の仮説を現在の画面の事実として扱わない。
DOM、候補ラベル、座標、監査ログ、正解判定、人間の操作や感想は抽出段へ渡さない。
固定のペルソナが指定された場合は保持するが、今回の比較にはペルソナを指定しない。

接続は [Responses の構造化出力](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses)と[画像入力](https://developers.openai.com/api/docs/guides/images-vision)の公式仕様に従う。
`store: false`、ツールと会話状態なし、最大 4,000 出力トークン、要求ごとに 30 秒以内、再試行なしとする。
HTTP 成功後の拒否、未完了、不正 JSON、形式不正は、通信失敗と別に保存して停止する。
形式が正しいことから、画像の理解や人間への一致を結論しない。

## 実行

この作業環境の feature/virtual-beta-information-state を使用する。
認証は既存の `E:/ChatGPT/Ux_test/.env` にある `AI_GATEWAY_API_KEY` と `OPENAI_API_KEY` を通常 wrapper が読む。
環境ファイルを作業ブランチへコピーする必要はなく、値をログや Git へ保存しない。

```powershell
Set-Location 'C:/Users/Maekawa Ao/.codex/worktrees/virtual-beta/Ux_test'

# API を使わず、先頭の三方式だけを接続確認する
node --import tsx runner/visual-conditions-comparison.ts --mock --limit 3 --prior-snapshot (Resolve-Path reports/visual-conditions-2026-10-30/prior-raw.json).Path --out reports/visual-conditions-mock-new

# 新しい画像を通常 runner から取得する実モデル比較
node --import tsx runner/visual-conditions-comparison.ts --env-file E:/ChatGPT/Ux_test/.env --prior-snapshot (Resolve-Path reports/visual-conditions-2026-10-30/prior-raw.json).Path --out reports/visual-conditions-real-new

node --import tsx --test --test-concurrency=1 tests/visual-hypotheses.test.ts tests/openai-visual-hypotheses.test.ts tests/visual-conditions-comparison.test.ts tests/visual-conditions-integration.test.ts
npm run build
```

出力先は毎回新しくする。
過去 4,597 原本を照合する snapshot と生データは、この環境に残るローカル資料であり Git には含めない。
別の clone で同じ原本保全を確認したことにはならない。
ブラウザーを使う検証は同時に起動せず、初期ページ読み込みのタイムアウトをモデルの失敗へ置き換えない。

## 比較条件

図書予約と講習予約の 2 課題に、それぞれ別入口への切替、確認で前提が変わる条件、別途照合が必要な条件を設ける。
各条件で三方式を 1 回ずつ実行し、予定は 18 試行である。
方式の実行順を条件ごとに回し、同じ製品画像、目的、初期状態、許可した情報を照合する。
現在根拠の修正と、具体条件の追加を別々の差分として保存する。

全体の上限は 504 要求、40 分、並列数 1 とする。
各試行は 12 判断、15 UI 操作、3 注視、180 秒以内とし、旧方式と現在根拠方式は 24 要求、抽出あり方式は 36 要求以内とする。
各 API 段階の上限は 12 要求である。
HTTP 400、認証、利用制限、会計不明、抽出形式不正では次の試行へ進まない。
再試行、失敗枠の置換、保存済み入力の直接再送は行わない。

`manifest.json` に予定枠、版、設定、要求台帳、初期画像の照合、原本保全を記録する。
`summary.json` は方式ごとの分母、成功、上限終了、基盤障害、実際の前提変更、照合、再訪、保存を分ける。
各試行には実際の画像、条件仮説、両段階の Jev 入力、元の分布と補正後分布、選択、実操作、終了理由、trace、リプレイ結果を残す。
API 待ち時間は人間の行動時間とは別に扱い、未報告の費用は 0 とせず不明のまま残す。

## 検証の範囲

部品テスト、実ブラウザーを使う通信スタブ、モック比較と実モデルの成績は分ける。
独立検証では、失敗証拠の削除や成功応答の偽造をリプレイが受理する問題、余計な抽出記録の受理、HTTP 200 受領済み失敗の誤集計、宣言外の質問変更の見逃しを再現した。
修正前の証拠を保持し、修正後の版を別のハッシュで再検証する。

この比較は各条件 1 試行なので、再現性や一般的な改善率は検証できない。
人間との一致、転記と条件解釈の正確さ、他画面への一般化は別の検証が必要である。
