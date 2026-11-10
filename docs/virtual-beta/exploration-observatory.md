# 探索ログ一覧

Jev の各試行を一覧から選び、操作前の画像、選択、操作結果をステップごとに確認するローカル画面です。
Persona、課題、サイト、終了区分、妥当性で絞り込めます。
「全試行」では異なる課題も一覧に並べ、分布の合算を止めます。
分布を比較するときは同じ比較グループを選びます。

## 記録

元の `result.json` と画像は変更しません。
明示した batch のみを読み、過去の人間記録を探索して収集する処理はありません。
モデルに送った各段階の画像と監査用画像を区別し、準備済み、送信試行、応答受信を表示します。
応答受信は、モデルが画像を正しく理解した証明にはなりません。

全ステップを残すため、注視、クリック、スクロール、戻る、読み直し、待機、主観的完了、離脱、途中の失敗も確認できます。
技術詳細には利用可能な状態、候補、モデルの分布、フィルタ後の分布、正規化後の分布、選択補正、実際の選択を載せます。
理由はモデルの自己申告と観測根拠です。
内部判断の完全な記録とは扱いません。

API 待ち時間、UI 実行時間、モデル化した利用時間を分けます。
記録がない値は不明として扱います。
API 障害と操作失敗を、ユーザーの迷いや離脱へ読み替えません。

## 一覧を開く

コマンドは依存関係を導入したリポジトリのルートで実行します。
手元の作業場所は `C:/Users/Maekawa Ao/.codex/worktrees/virtual-beta/Ux_test` です。
レポートはローカルの `reports/` に生成します。

```powershell
node --import tsx runner/exploration-viewer.ts --batch reports/persona-tasks-2026-11-06/live-r1 --out reports/exploration-observatory-2026-11-06/viewer --serve --port 4175
```

ブラウザーで <http://127.0.0.1:4175/> を開きます。
`--batch` は複数指定できます。
実行中の batch も追う場合は `--watch` を加えます。
server は manifest の変化を 10 秒ごとに確認し、ブラウザーもカタログを 10 秒ごとに更新します。
未実行枠と試行中の枠は、完了した試行の分母に入りません。

出力先の既存ディレクトリは、この生成器の所有情報がある場合のみ更新します。
入力 batch と重なる出力先、任意のファイル参照、外部画像、シンボリックリンクによる外部参照を拒否します。
server は localhost の GET と HEAD のみを受け付けます。
公開ホスティングは今回の範囲に含めません。

## 実サイトを同じ条件で動かす

対象は GitHub 公式の日本語パスキー説明 4 ページです。
[利用規約](https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies)と [CC BY 4.0 のコンテンツライセンス](https://github.com/github/docs/blob/main/LICENSE)を確認し、少数のページを逐次取得して通信記録（HAR）を保存します。
繰り返し実行は保存した実際の HTML、CSS、画像をネットワークなしで再生します。
ログイン、検索、フォーム送信、設定変更、範囲外リンクは使用できません。
この制約を含む情報探索の比較です。

```powershell
node --import tsx runner/capture-public-passkeys.ts --out reports/passkeys-capture-new
```

取得元は [GitHub Docs のパスキー説明](https://docs.github.com/ja/authentication/authenticating-with-a-passkey)、作成者は GitHub とその寄稿者です。
元ページの HTML、CSS、文面や配置は変更しません。
モデル入力画像には既存処理による候補番号と視覚変換を加え、変換前の監査画像とは別に記録します。
再生できない通信を許可して live へ戻す処理もありません。
原本 HAR、除外した通信、画像、取得日時、SHA-256、robots 判定、出典を保存します。
取得物はローカルに保持し、Git へ自動登録しません。

Persona は既存の baseline、A、B、C、チャーターは `experiments/virtual-beta/public-passkeys-charter.json` です。
共通の補正なしユーザーモードを使い、正解経路や Persona 別のクリック先をコードへ登録しません。
説明を理解したかは客観判定できないため、実サイトの客観評価は `UNVERIFIED/null` です。
モデルの「終わった」という判断とは別に表示します。

```powershell
$prior = (Resolve-Path reports/persona-tasks-2026-11-06/final-prior-raw.json).Path
node --import tsx runner/public-persona-comparison.ts --site-spec reports/exploration-observatory-2026-11-06/site-capture/site-spec.json --charter experiments/virtual-beta/public-passkeys-charter.json --prior-snapshot $prior --env-file E:/ChatGPT/Ux_test/.env --repeats 4 --max-requests 576 --max-phase-ms 7200000 --out reports/passkeys-model-new
```

事前に各条件 4 回、合計 16 枠と固定します。
4 反復で実行位置を一巡させます。
不正応答を消して有効な試行で埋め直すことはしません。
試行ごとの上限は 12 判断、36 要求、15 UI 操作、3 注視、300 秒、並列数は 1 です。
認証、利用枠、監査、安全境界の障害で停止し、不正なモデル出力が 3 試行続いた場合も止めます。

`--repeats 100 --max-requests 14400 --max-phase-ms 28800000` とすると各条件 100 枠を計画できます。
これは実行機能の設定例であり、400 枠を実行済みという意味ではありません。
開始後は条件を変えず、同じ引数と出力先に `--resume` を加えて再開します。
再開時は保存済み結果と入力のハッシュ、利用要求数を検査し、試行済みの枠は再実行しません。
割り込み中の枠も残します。
旧コードの試行を新コードで継ぎ足す再開は拒否します。

## 出力

一覧生成器は `catalog.json`、試行別 `runs/*.json`、画像 `assets/*.png`、Raw JSON、trace ZIP、`catalog.csv`、`steps.ndjson` を出力します。
試行別 JSON は選択時に読み込みます。
大きな NDJSON も server はストリームで返します。
画像は内容のハッシュで識別し、ログに記録したハッシュと一致しない画像を正常な証拠として表示しません。

最初の選択の分布は有効で初手が記録された試行を分母にします。
欠損、無効、初手不明、保留を別に表示します。
サイト、目的、モデル種別、コード、設定、初期画像、取得 HAR が異なる試行を黙って合算しません。
回数の増加はモデル試行の分布を調べるためで、人間の行動頻度や一致度の検証には人間データが別途必要です。

## 検証

```powershell
npm run build
node --import tsx --test --test-concurrency=1 tests/exploration-viewer-data.test.ts tests/exploration-viewer-server.test.ts tests/exploration-viewer-ui.test.ts tests/beta-public-site.test.ts tests/beta-public-wiring.test.ts tests/public-persona-comparison.test.ts tests/capture-public-passkeys.test.ts
```

実際の実行結果は末尾に、独立検証は [再検証報告](exploration-observatory-independent-review.md) に保存しています。
リポジトリ全体のテストは前段階で未合格であり、上記の関連検証と区別します。

## 独立検証で修正した点

第1回の独立検証では、成功した HTML 応答の size が -1 の場合、本文がなくても HAR の検査を通る欠陥を再現した。
再生したブラウザーは空の DOM を返していた。
必要な説明ページの埋め込み本文を size にかかわらず必須にし、欠損時は API を呼ぶ前に止める。
取得 fixture も本文受信完了を待ってから HAR を閉じ、壊れた保存データの拒否試験は別に残した。

また、進行中の試行を invalid へ数える集計と、native の schema 不正が連続停止の対象から漏れる問題を修正した。
表示も「計画された枠」と「結果記録」を分けた。
モデル出力の書き換えや、失敗を正常扱いする修正はしていない。

第2回の独立再検証は 78 件中 76 成功、失敗 0、Windows の symlink 権限による未実施 2 件だった。
build は成功し、既存方式の関連回帰 102 件も別に成功した。
旧 raw 9,468 ファイルは SHA-256 が全件一致した。
合成 400 枠、実サイト 4 ページを別コンテキストで 2 回、明示した実ログ 37 件の全 99 ステップ、Raw JSON と画像の対応を検査した。
合成データでの負荷試験と実モデル試行は別の結果である。

第1回の失敗報告と再検証報告は、ローカルの `reports/exploration-observatory-2026-11-06/independent/` に保存した。
今回の計測基盤の修正に重大な未解決は検出されていない。
前段階の全体 `npm test` 未合格と、モデルの探索能力の未検証部分は残っている。

## 実行版

基準の Git revision は `3fd144ccbdeb6229ca5b2c873cc711581e9ee647`。
その上の作業差分を凍結し、186 ファイルの SHA-256 を保存した。
実モデルを実行した時点では今回の変更は未コミットで、この作業スナップショットを用いた。
後から統合した Git コミットと、実行時点の revision は区別する。
実行したソースは revision の文字列だけで特定せず、sourceHash と保存したソースを併記する。

- 中間版 `90260081...`：[ソース](exploration-observatory-source-90260081.zip)。実モデル実行なし。
- 修正前 `9f515b8f...`：[ソース](exploration-observatory-source-9f515b8f.zip)。旧 2 試行、41 要求。
- 修正後 `696fd78a43715f17f6b54ecd2bea41ae4589badb2f24a57a6d3ea1dd7643b663`：[ソース](exploration-observatory-source-696fd78a.zip)。本文欠損、集計、異常分類を修正。actor の入力、選択方策、目的、Persona、HAR は共通。

実装の担当は、親が比較 runner の接続、共通契約、一覧データ、server、統合を管理し、UI 担当と実サイト保存担当が各モジュールとテストを分担した。
新しい検証担当が実装とは独立に検証し、修正を元担当へ戻して再検証した。
元の `E:/ChatGPT/Ux_test` の作業ツリーと未コミット変更は変更していない。
環境ファイルは指定の場所から読み取り、原本ログや公開物へキーを含めない。

## 次の検証

修正前の baseline は 7 操作の後、8 判断目で continuity の形式不整合を含む native 応答を拒否した。
A は 6 操作の後、7 判断目で native が incomplete となり、output tokens は設定上限の 4000 に到達していた。
HTTP は両方 200 で、単なる通信失敗や人間の離脱とは区別する。
4000 の上限到達が原因となった可能性はあるが、上限を増やすだけで continuity の整合性まで解決するとは判断しない。

この 2 件は独立検証の P1 発見後、進行中の試行を保存して次の開始を止めるため、protocol の保持要求を明示的に更新した。
凍結入力の差分を検知した runner の生の停止理由は `FROZEN_SOURCE_CHANGED` で、操作上の離脱ではない。
`parent/operator-boundary-stop.json` に差分と理由を残し、旧 protocol も保存した。
旧 manifest の preservationAfter は false のまま保持し、別の原本ハッシュ検証で保存状態を確認している。
この旧版を、修正版の比較へ混ぜない。

優先する追加課題は、複雑な説明画面での native 出力の長さと、continuity の情報対応付けを別々に測ること。
過去の不正応答の修復や、正解手順の登録で置き換えない。
その後、十分な有効反復と対象ユーザー集団の記録で Persona 条件の分布を比較する。
今回の行動の多様性やタスク結果から人間への一致度を認定しない。


## 実モデルの実測結果

修正版 `live-r2` は計画 16 枠のうち 5 試行、89 要求で `CONSECUTIVE_INVALID_TRIALS` 終了となった。
有効 0、無効 5、未実行 11 枠で、baseline 1 回、A 2 回、B 1 回、C 1 回を試行した。
実モデル比較 CLI は両版とも終了コード 1 で終了しており、比較の完走成功は報告しない。
A の初回は通信タイムアウトで、モデル不正としては数えていない。
その後の B、C、A の native 応答不正が 3 件続き、事前に決めた停止条件が発火した。

修正前の別版 2 試行と合わせると、実サイトで 7 試行、130 要求、48 ステップ、41 UI 操作、注視 0 回を記録した。
これは全試行が正常に完了したという件数ではない。
失敗前の動きを観測済みの部分経路として保持し、原本 JSON、画像、trace、比較用 JSON と CSV から追える。
[全7件の結果JSON](exploration-observatory-results.json)、[全7件の経路CSV](exploration-observatory-runs.csv)。

修正版の最初の選択は 5 件とも下スクロールだった。
その後には説明ページ、ページ内の章、サイドメニュー、再訪などの違いがあるが、有効な全経路の比較分母は 0 で、Persona による差とは判断できない。
「アカウントからパスキーを削除する」は説明ページ内の章リンクを辿った記録で、実際のアカウントからパスキーを削除した操作ではない。
本番のログインや設定変更は行っていない。

各版内で、未操作の初期 PNG、最初のモデル入力画像、Persona 項目を除いた最初の native 入力のハッシュはそれぞれ 1 種類だった。
独立担当は入力と選択、実操作、画像、台帳、停止条件、原本コピーを照合した。
会計は使用 130、未決済予約 0 と一致した。
今回の保存・表示・会計が成立したことと、実サイト上の探索が安定したことは別で、後者は未達である。

最終一覧は 73 枠、結果記録 48 件、未記録 25 枠である。
結果記録には既存実モデル 36 件、今回の実モデル 7 件、モック 5 件を含み、モックは API 0 要求として表示する。
未記録 25 枠は旧版の未実行 14 枠と修正版の未実行 11 枠で、実行済みとして扱わない。
既存実モデル 36 件には前フェーズの無効 1 件があり、今回の有効 0 と混ぜない。

```powershell
node --import tsx runner/exploration-viewer.ts --batch reports/persona-tasks-2026-11-06/live-r1 --batch reports/exploration-observatory-2026-11-06/mock-public --batch reports/exploration-observatory-2026-11-06/mock-cohort-r1 --batch reports/exploration-observatory-2026-11-06/live-r1 --batch reports/exploration-observatory-2026-11-06/live-r2 --out reports/exploration-observatory-2026-11-06/viewer --serve --watch --port 4175
```

[画面例](exploration-observatory-desktop.png)、[モバイル幅の表示](exploration-observatory-mobile.png)。
コピー可能な詳細原本と HAR はこのマシンの reports に保持し、取得時の HTTP ヘッダーを含む HAR を公開物へ自動で含めない。

[実モデルの最終独立監査](exploration-observatory-model-review.md)、[監査 JSON](exploration-observatory-model-review.json)。
今回の変更は関連 180 件の確認を行い、178 成功、2 件は Windows の symlink 権限による未実施だった。
全体 `npm test` の未合格を解消したという意味ではない。
