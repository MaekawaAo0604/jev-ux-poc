# ペルソナベース探索的テスト PoC

LOOPの再分析、画面ID修正の再実験、同一画面での確率比較、人間対照の記録方法は [第2フェーズ検証](persona-phase2.md) を参照してください。

ペルソナと探索チャーターを別々の JSON で与え、同じ画面と目的で探索行動を比較するための実験用 CLI を追加した。
既存の画面観測、操作候補生成、Jev による選択、ExplorationMemoryとfrontier判断、独立した達成確認を流用する。

## 実行方法

既存の依存パッケージと Playwright Chromium が必要になる。
実モデルの実行には `.env` の `AI_GATEWAY_API_KEY` または `TYPESAFE_API_KEY` を使う。
キーをログへ書き出さない。
CLI 自身が Vite を起動するため、別途開発サーバーを起動する必要はない。

```powershell
# ベースライン、A、B、C を各3回。画面画像＋DOMの既存モード
npm run experiment:persona -- --vision

# DOMの既存モード。条件間ではモードを揃える
npm run experiment:persona

# APIを呼ばず、4条件×各3回の保存・比較処理を確認する
npm run experiment:persona -- --fake

# 別の入力ファイルを使う。ベースラインも同じ回数実行する
npm run experiment:persona -- --vision --charter experiments/persona/charter.json --persona experiments/persona/persona-a.json --repeat 3

# 保存したデータだけで比較レポートを再生成する。APIは呼ばない
npm run compare:persona -- reports/<実験フォルダー>

# 個別試行のPlaywright traceを開く
npx playwright show-trace reports/<実験フォルダー>/A-1/trace.zip
```

`--persona` は複数指定できる。
省略すると A、B、C を使用し、`--baseline-only` ではペルソナなしの条件だけを実行する。
`--out` は新しい出力先を指定するためのオプションで、既存フォルダーの上書きは拒否する。
`--repeat` は 1〜30、チャーターの `maxActions` は 1〜100 を受け付ける。
既定では `--exploration-memory on` とし、既存の探索記憶とfrontier判断を利用する。試行済み遷移・重複候補の除外、到達済み経路から未探索候補への移動を記録する。旧ローカル経路の対照には `--exploration-memory off` を指定する。この旧経路だけは同じ画面・操作の3回目でLOOP終了する。新経路でも最大操作回数、stuck、達成確認等の終了条件を維持する。

## 入力

`experiments/persona/persona-a.json`、`persona-b.json`、`persona-c.json` に、次の項目を独立して定義する。

- `id`、`name`：条件の識別子と名前。`baseline` は予約済み。
- `itLiteracy`、`serviceExperience`：IT リテラシーとサービス利用経験。
- `knowledge`、`expectations`：利用者の知識と目的に対する期待。
- `behavioralTendencies`：強制する手順ではなく、判断に用いる行動仮説。
- `contextAndConstraints`：利用状況と制約。

`experiments/persona/charter.json` に、次の項目を定義する。

- `targetWebsite`：今回対応する対象は、既存の検証画面 `local:good` または `local:bad`。
- `goal`：目的の文章。クリック順序や正解の経路は含めない。
- `initialState`：初期状態の説明と基準日。実装上は毎回、新しいコンテキストでデモアカウントのホームから開始する。説明文から任意の状態を作る機能はない。
- `scope`：モデルへ与える探索範囲の説明。コードでは対象のローカル画面、同一オリジン、GET／HEAD の境界を固定する。
- `prohibitedActions.actionTypes`：`click`、`scroll`、`back` の禁止指定。
- `prohibitedActions.controlTexts`：禁止する操作の表示文字列。説明を含む複数行のラベルは先頭行と完全一致で照合する。
- `prohibitedActions.downloads`：ダウンロードの禁止。対応するローカル UI の請求書保存ボタンを候補から除き、ブラウザー側でも保存を許可しない。
- `maxActions`：最大操作回数。
- `oracle`：モデルから独立した達成確認。既存の `notifications` または `invoice` を使う。`oracle` をモデル入力へ含めない。

サンプルの目的は、既存の Bad UI でメール通知を停止し、停止を確認すること。
パスワード変更は入力例であり、この追加実装ではフォーム入力やパスワード変更画面を作っていない。
外部サイトへの適用、任意の初期状態の復元、任意の目的に対する達成判定は今回の追加 CLI の対象外になる。
既存の `npm run explore` は維持しており、このペルソナ一括実験との接続は行っていない。

`goal` と `oracle` の整合性は、チャーター作成者が確認する。
既存の `invoice` 判定は `invoice-2026-08.pdf` の保存を確認するため、サンプルの基準日 2026-09-19 を用いる。

## 固定する条件

全条件で、画面サイズ 1280×900、ロケール ja-JP、タイムゾーン Asia/Tokyo、同じ目的、同じ操作制限、同じ観測モードを使う。
試行ごとに新しい BrowserContext を作り、ストレージ、通知状態、閲覧履歴を共有しない。
各反復の中で条件順を固定シードで並べ替え、実行順を保存する。
ペルソナ A のスマートフォン利用は人物の説明に残すが、実験1では画面サイズを変えない。
実際のモバイル表示の影響は別の実験になる。

画像入力では、既存の番号付き画像と DOM 観測を併用する。
OCR や image-only モードはこの CLI では有効にしない。
追加した理由カテゴリの質問を、ベースラインを含む全条件へ同じように与える。
したがって、このベースラインは「理由カテゴリの質問を追加した実験用入力で、ペルソナだけを省略した条件」を意味する。

モデルの指定値、応答したモデル、ブラウザー版、Node.js 版、Git リビジョン、入力とソースのハッシュを保存する。
未追跡の新規ファイルもソースハッシュに含める。
既存クライアントに生成シードの指定機能はないため、モデル応答そのものの完全再現は保証しない。

## 出力

`reports/<日時>-persona-<識別子>/` に保存する。

- `comparison.html`：4条件の達成数、操作数、経路差、問題候補、根拠画像へのリンク。
- `comparison.json`：実験1〜3の機械処理用データ。`conditions`、`variation`、`issues`、`evaluationDifferences`、`runs` に分けて保存する。
- `comparison.csv`：条件別の集計値。操作数平均・標準偏差、達成率、経路種類数、最頻経路率、条件内の経路差など。
- `index.html`：既存の操作経路・画面レポート。各試行にペルソナ ID も表示する。
- `manifest.json`、`inputs.json`、`environment.json`：条件、入力、実行順、環境の記録。
- `<条件>-<試行>/result.json`：試行全体の状態、候補、判断、結果。
- `<条件>-<試行>/events.jsonl`：1判断1行。`state.screen` が操作前の画面、`decision` が選択、`outcome` が実行後の画面。
- `<条件>-<試行>/findings.json`：観測事実、推測、改善候補、試行とステップへの参照。
- `<条件>-<試行>/step-*.json`、`step-*.png`、`after-*.png`、`final.png`：判断前と実行後の画面証拠。
- `<条件>-<試行>/action-trace.json`、`trace.zip`：既存の操作記録と Playwright trace。

Jev は自由文の内的推論を返す API ではない。
`decision.decisionReason` には、同じリクエストで選択させた理由カテゴリと確率を記録する。
カテゴリは goal、clarity、efficiency、confirmation、uncertainty、other。
これはモデルの自己申告であり、実際の内的理由や人間の感情を観測したものではない。
別の完了確認で最終判断が変わった場合など、対応する理由が取れないときは `unavailable` とする。

## 比較方法

経路は「画面のパス・ハッシュ、見出し、実行した操作ラベル」の順序列として表す。
操作候補の一時的な ID だけでは比較しない。
経路差はレーベンシュタイン距離を長い方の操作数で割った値とし、同じ条件内の平均と、異なる条件間の平均を算出する。
0 は同じ経路、1 は全て異なる経路を意味する。

参考値として、反復ブロック内で条件ラベルを入れ替える片側の置換検定を 1,999 回行う。
モデル混在、計測エラー、欠測がある場合は置換検定を行わない。
各3回の小さな実験であり、この値だけでペルソナ効果を確定しない。
`complete` は予定した記録が揃った状態、`comparable` は記録と応答モデルが揃い、計測エラーがない状態を示す。
`comparable` は統計的に十分な検出力があるという意味ではない。

問題候補は、戻る操作、同じ表示での操作再選択、観測範囲内で変化がない操作、上位候補の確率が近い判断、不確実性の自己申告、未達、完了判断と独立した達成確認の不一致から抽出する。
操作のやり直しがあっても、誤操作だったとは断定しない。
実行時間には推論と通信が含まれるため、人間の迷い時間として扱わない。

同じ種類・画面・操作の候補を試行間でまとめ、全条件に共通、今回1条件だけ、複数条件、比較未成立を区別する。
1条件だけで検出された候補も、そのペルソナ固有の問題と確定しない。
優先度は「影響度係数×条件数＋発生試行数」の人手確認用の暫定値。
UI 品質の自動判定には使わない。

`PAGE_ERROR`、`ACTION_ERROR`、`DECISION_ERROR` は計測処理の失敗として別に数える。
`--fake` の結果は `PLUMBING_ONLY` と明示し、ペルソナ効果の根拠に含めない。

## 2026-10-26 の試行結果

実際の Jev 1.14.0 を使い、画像＋DOM モードで4条件を各3回、計12回実行した。
有効な12試行は全て9操作の後、次の同一状態・操作の選択でループ検出により停止した。
目的達成は各条件 0/3 だった。

ベースラインと A はそれぞれ3回とも同一経路だった。
B と C はそれぞれ2種類の経路を取り、最頻経路は 2/3 だった。
条件内と条件間の平均経路差はどちらも約 0.0556 で、差は 0、置換検定の参考 p 値は 1.0 だった。
今回の画面・目的・入力では、実行ごとの変動を超えるペルソナによる経路差を確認できなかった。

共通する観測事実は、ホームの「各種設定」を選び、その配下の「お知らせ」や「アカウント情報」へ進んだ後、ホームへ戻って再選択したこと。
12試行とも通知停止には到達していない。
「通知設定への入口が目的と結び付きにくい」は、この事実から人手確認に回す UI の改善仮説になる。
Jev の探索能力や既存のループ停止処理の影響もあり、UI だけを原因と確定することはできない。

全条件で、目的未達、同じ操作の再選択、不確実性の自己申告に対応する共通候補が得られた。
一部の試行だけに出た確率差の小さい判断や理由カテゴリも記録したが、ペルソナ固有の問題としては確定しない。
操作結果に対する期待と実際の結果の不一致は、今回の記録だけでは完了判断の不一致以外を確定できない。

生データは `reports/2026-10-26T06-06-27.255Z-persona-d361d0b5/` に保存した。
初回のソース指紋には未追跡ファイルが含まれていなかったため、実行中にソースを変更する前のハッシュを `source-integrity.json` として補足した。
最終版 CLI は新規ファイルも含む `sourceHashes` と `sourceHash` を最初から保存する。
それより前の通信権限がない状態での試行は全て API エラーとなり、有効な12試行とは別フォルダーに保存している。

今回確認できたのは、入力の分離、同じペルソナ内の再現性の計測、操作証拠の保存、根拠付き候補の比較まで。
「ペルソナで意味のある探索行動差が生まれる」という成功条件は未達であり、人間の体験との一致度も未検証である。

## 検証

```powershell
npm run build
npx tsx --test --test-concurrency=1 tests/persona.test.ts tests/persona-comparison.test.ts tests/persona-browser.test.ts tests/persona-cli.test.ts tests/decision.test.ts tests/browser.test.ts tests/action-trace.test.ts tests/vision.test.ts tests/report.test.ts tests/image-only.test.ts tests/client.test.ts
```

既存のブラウザーテストを多数並列実行した際に、Vite のページ読み込みで3件のタイムアウトが発生した。
その3件を含むブラウザー関連テストを直列で再実行し、6件全ての通過を確認した。
比較 HTML はブラウザーで表示を確認し、レポート内の331個のファイルリンクが実在することも確認した。
