# 極端な Persona による比較

8 種類の意図的に差を大きくした Persona を、同じ保存済み実サイト画面と目的で実行する。
[定義一覧](../../experiments/persona/extreme-passkeys-v1/README.md)は、知識、経験、判断の優先順位、利用端末の制約の 4 対照ペアである。
既存の A、B、C と過去の実行原本は保持した。

## 比較の分離

初回判断は、各 Persona を 4 回ずつ、計 32 枠で比較する。
通常の 3 段階判断を用い、1 判断で計測を打ち切る。
目的や最初の画面、候補、判断方法を変えず、打ち切り回数をモデルへのクリック指示として渡さない。
通常の上限 12 判断と上限 1 判断で、初回の native、assessment、action 入力と画像が一致することをモックで検査した。
`DECISION_LIMIT` は予定した計測終了であり、人間の離脱や目的達成を表さない。

経路の確認は、同じ 8 条件を各 1 回、従来どおり上限 12 判断で別に行う。
長い探索の不正応答を、初回判断の有効性と混同しない。
両段階は設定とログのグループを分け、失敗した試行の置換は行わない。
安全、認証、会計、凍結入力の不整合では直ちに停止し、モデル不正が 3 試行続いた場合も止める。
HTTP タイムアウトは基盤側の記録としてモデル不正とは分ける。

対象は既に取得した GitHub Docs のパスキー説明 4 ページで、HAR の SHA-256 は `2f3ef9f0fbe3d819c824b0381a2f49053b2c20d8350840bef32de6ae04061bb6`。
実験中に live サイトへの通信で欠けた画面を補わない。
説明を理解したかの客観 oracle はないため、客観評価は `UNVERIFIED/null` を維持する。
[共通チャーター](../../experiments/virtual-beta/public-passkeys-charter.json)と [実行計画](../../experiments/virtual-beta/public-persona-comparison.json)に条件を記録している。

## 実装

`--persona-set` で明示した JSON セットを読み込み、実際の actor 数で巡回順、集計、ハッシュ固定、再開を行う。
指定しない場合の baseline/A/B/C は維持する。
set は 256 KiB、各 Persona は 1 MiB までとし、外部へのパス、junction による脱出、ID の大文字小文字衝突、ID と表示名の不一致、凍結後の内容変更を拒否する。

`--max-decisions` は既存の上限以下の整数で計測期間を指定する。
既定の 12 判断、知覚、状態更新、選択、重み、安全制約、出力形式は変えない。
台帳の試行ごとの割り当て 36 要求は維持し、実使用数を別に数える。

実装担当がセット読み込みと cohort を担当し、親が profile と通常 runner の上限設定、実行、統合を担当した。
別コンテキストの検証担当は通常の実 HAR 上で 8 Persona × 2 上限をモック実行し、状態分離、入力一致、再開、原本と viewer を確認した。
モック 16 試行は API 0 要求であり、実モデルの成功件数には含めない。

## 実行

リポジトリのルートはこのマシンでは `C:/Users/Maekawa Ao/.codex/worktrees/virtual-beta/Ux_test`。
元の `E:/ChatGPT/Ux_test` の作業ツリーは変更せず、環境ファイルだけを読み込む。
API の認証値はログや公開物へ含めない。

```powershell
$prior = (Resolve-Path reports/extreme-persona-study-2026-11-06/prior-raw.json).Path
node --import tsx runner/public-persona-comparison.ts --persona-set experiments/persona/extreme-passkeys-v1/set.json --max-decisions 1 --site-spec reports/exploration-observatory-2026-11-06/site-capture/site-spec.json --charter experiments/virtual-beta/public-passkeys-charter.json --prior-snapshot $prior --env-file E:/ChatGPT/Ux_test/.env --repeats 4 --max-requests 1152 --max-phase-ms 7200000 --out reports/extreme-persona-study-2026-11-06/probe
node --import tsx runner/public-persona-comparison.ts --persona-set experiments/persona/extreme-passkeys-v1/set.json --max-decisions 12 --site-spec reports/exploration-observatory-2026-11-06/site-capture/site-spec.json --charter experiments/virtual-beta/public-passkeys-charter.json --prior-snapshot $prior --env-file E:/ChatGPT/Ux_test/.env --repeats 1 --max-requests 288 --max-phase-ms 3600000 --out reports/extreme-persona-study-2026-11-06/flow
```

これらは今回使う出力先で、新規実行では未作成の名前へ変更する。
同じ引数に `--resume` を加えると、同じコード、入力、期限の範囲で未試行枠だけを再開する。
コードや set を変えて過去の実行へ継ぎ足す再開は拒否する。
前段階の出力上限や continuity 不整合を修復する機能は追加していない。

## 解釈

初手の実選択件数と、モデルの正規化分布を分けて比較する。
同じラベルのリンクがメイン領域とサイドバーにあるため、選択した候補 ID も残す。
分布は候補と画面の対応が一致する場合のみ比較し、不足した候補や不明値を確率 0 として補わない。

条件内の反復間と、対照ペアの条件間で総変動距離（TV）を記録する。
これは記述的な比較で、モデルの確率を人間の行動頻度や主観的な自信と同一視しない。
各条件 4 回、部分的な順序均衡で、ランダム割り当てや全順序の均衡ではない。
ID、表示名もモデル入力であり、利用経験から知識をモデルが補う可能性も残る。

理由はモデルの自己申告、native の条件や引用も誤り得る観測解釈である。
選択が変わったことだけで、意味理解や人間との一致、各属性単独の効果を認定しない。
実行版は commit `7905e32` 上の未コミット作業差分で凍結し、sourceHash は `bfb1e80ee80308bb84ae6cc9dc8aafd27c69ef72c75a59bd9e7739dd129c7f44`。
[187 ファイルの実行ソース](extreme-persona-study-source-bfb1e80e.zip)に、実行時のバイト列と freeze を保持する。
## 初回判断の結果

32 枠すべてを実行し、32 件が比較に有効だった。96 API 要求、無効 0、未実行 0。すべて上限 1 判断による DECISION_LIMIT で、主観的完了は 0。客観評価は全件 UNVERIFIED/null である。

実際の最初の操作は次のとおり。各条件の分母は 4 で、「管理」は画面に表示された「パスキーを管理する」リンクのクリックを表す。候補 ID と位置の対応は JSON に別途保持し、同じラベルの別リンクを同一経路と断定しない。

- 知識なし XK0：下スクロール 4。知識豊富 XK1：下スクロール 3、管理 1。
- 利用経験なし XE0：下スクロール 2、管理 2。日常利用 XE1：下スクロール 3、管理 1。
- 速さ優先 XP0、根拠優先 XP1：どちらも下スクロール 3、管理 1。
- 個人端末 XD0：下スクロール 3、管理 1。共用管理端末 XD1：下スクロール 4。

分布比較は、同じ初期画面・候補対応の 1 グループで行えた。各側の反復間 6 組、ペア間 16 組を使う。
知識ペアの条件内平均 TV は 0.232 / 0.432、条件間は 0.328。経験は 0.452 / 0.355 と 0.367、優先は 0.420 / 0.450 と 0.420、端末は 0.395 / 0.342 と 0.338 だった。
この測定では条件間の差が条件内のばらつきを明確に上回っておらず、極端な Persona が安定して異なる初手を生むとはまだ確認できない。サンプル数 4 の記述統計であり、差がないことの証明でもない。

32 件の初期プロダクト画像、モデル入力画像、Persona だけを除いた native 入力は一致した。native が生成した条件や assessment、action まで同一という意味ではない。モデルの解釈のばらつきも含む、通常の探索パイプラインの比較である。

[分析実装](../../scripts/analyze-extreme-personas.ts)は有効な結果だけを分母にし、無効や欠測を確率 0 で補わない。raw、正規化後、フィルタ後の分布、モデルが返した選択と実際の選択、補正と原本 hash を別々に残す。

## 理由への反映と残る課題

全 32 件の native と assessment を読み、8 定義と照合した。引用 226 箇所を JSON pointer と原本 hash で再確認している。これは出力理由の点検であり、内部判断の完全な記録ではない。

共用管理端末 XD1 は 4/4 件で共用 OS や認証情報保存禁止を native の条件に含めた。根拠優先 XP1 は 4/4 件で紛失・復旧を独立の条件にしたが、速さ優先 XP0 も 3/4 件で復旧への不明点を挙げた。XK1 は紛失・別端末を 4/4 件で条件化したが、XK0 も同期・復旧への不明点を 4/4 件で挙げた。
経験 500 回や速度と手間の比較を生成条件に明示的に利用した証拠は乏しかった。全件の assessment は knowledge=insufficient だが、GitHub 固有の知識を持たない設定なので、経験や一般知識への直接の違反と断定しない。
また、チャーターが求めていない「判断結果の保存」を不明点に含めた例が 5/32 件あった。目的外の確認条件が増える仮説として残す。

初手のモデル選択と実際の選択の差し替えは 0/32 件。既存の UI 条件付き選択は残っており、重みが全て 1 でも非 UI の確率を条件付けした filtered 分布は 27/32 件で normalized と異なった。今回の TV は、この条件付け前の normalized 分布を使う。重みなしを「選択処理も全て無い」とは表現しない。

次に切り分ける候補は次の順序とする。

1. 共通の読む操作で差が出ないことと、Persona が使われないことを分ける。初期画面だけでなく、知識・制約に応じて代替手段を選ぶ必要が生じた画面の分布と実行を比較する。今回の 4 反復から全課題への効果を認定しない。
2. GitHub 固有の未知点と、Persona が既に知っている一般知識を区別してログで確認する。知識を増やしただけで未解決条件が減ると決めつけず、画像の根拠と生成条件を対照する。
3. 目的外の「保存」等がどこで加わったかを、知覚→評価→行動の入力と出力で照合する。正解クリックを登録したり、既存ログを正常値に修復したりしない。
4. 長い探索での出力不正と計測時間上限を別に改善・検証する。今回の凍結版の途中で条件やモデル応答を変えて、経路差を Persona の効果にしない。

## 経路と最終検証

経路は 8 枠を予定し、4 件を実行して停止した。有効 0、無効 4、未実行 4、65 API 要求。初回比較と合わせた実モデル実行は 36 件・161 要求で、モックは含めない。

- XK0：29 要求、9 UI 操作。10 観測目の評価で TIMEOUT。約 5 分の計測期限に達した。主観的な離脱ではない。
- XK1：16 要求、5 UI 操作。6 観測目の native が incomplete。
- XE0 と XE1：それぞれ 10 要求、3 UI 操作。4 観測目の native が incomplete。
- XP0、XP1、XD0、XD1 の経路枠は未実行。3 件連続のモデル不正で停止する事前条件 CONSECUTIVE_INVALID_TRIALS に従った。失敗した枠を別試行へ置換しなかった。

native incomplete の 3 件は outputTokens=4000 に達していた。形式や出力量の問題であり、人間の迷い・離脱や UI の不具合として集計しない。時間上限の 1 件とは分類を分ける。以前から残る native の出力制約で、今回の Persona 読み込み追加が原因だと確定したものではない。

初回 32 件はすべて予定された打ち切りまで有効だった。一方、長い経路の有効な Persona 別比較は成立していない。失敗前の経路と画像を残すが、有効なフル経路の分母へ混ぜない。

## 出力と再確認

- [分析 JSON](extreme-persona-study-results.json)：32 初回判断と 4 経路 prefix、分母と除外理由、分布、選択、初期入力一致、原本のパスと hash。
- [1 試行 1 行 CSV](extreme-persona-study-runs.csv)。未実行 4 枠は manifest の schedule と summary.missing に残す。
- [全 32 件の理由点検](extreme-persona-study-traits.md)と[引用・pointer の JSON](extreme-persona-study-traits.json)。
- ローカルの原本は reports/extreme-persona-study-2026-11-06/{probe,flow}。台帳、入力画像、通常 runner の trace を保持した。HAR や認証値は Git の公開対象に含めない。

```powershell
node --import tsx scripts/analyze-extreme-personas.ts --probe reports/extreme-persona-study-2026-11-06/probe --flow reports/extreme-persona-study-2026-11-06/flow --persona-set experiments/persona/extreme-passkeys-v1/set.json --out reports/extreme-persona-analysis-new
node --import tsx runner/exploration-viewer.ts --batch reports/extreme-persona-study-2026-11-06/probe --batch reports/extreme-persona-study-2026-11-06/flow --batch reports/extreme-persona-study-2026-11-06/mock-set --out reports/extreme-persona-study-2026-11-06/viewer --serve --watch --port 4176
node --import tsx --test --test-concurrency=1 tests/public-persona-set.test.ts tests/public-persona-comparison.test.ts tests/human-jev-decision-cap.test.ts tests/extreme-persona-analysis.test.ts tests/extreme-persona-study-independent.test.ts
npm run build
```

一覧は [localhost:4176](http://127.0.0.1:4176/)。実モデル 40 計画枠のうち 36 記録と未実行 4、モック 8 記録を区別する。cap 1、cap 12、モックの比較グループは合算しない。
このマシンの取得 HAR と prior snapshot を使うコマンドであり、新しい clone に非公開の reports が揃うことは前提にしない。別環境では [取得手順](exploration-observatory.md)に従って新規 HAR と reports 用 prior snapshot を用意する。新規取得版は今回と同一条件ではなく、別の source/site identity で記録する。

統合前の親検証は feature・分析・viewer data 51/51、public site・profile・viewer 57 成功・2 skip、既存 Persona/状態/視覚/replay 102/102、build 成功。分析修正後は分析 12 と独立回帰 1 が成功し、artifact 依存の opt-in 1 件は通常実行では skip した。同じテストの反復を足して独立試験数とはしない。以前の全体 npm test の 60 失敗は今回の関連検証とは別に残り、全体 green は宣言しない。

独立検証では、saved selected=scroll_down なのに recorded action=scroll up 等でも分析の分母へ入る照合漏れを P2 として再現した。クリック以外も既存の候補再構築でアクション全体を照合する修正を行い、scroll、wait、look 座標の不整合を除外する回帰試験を維持した。実際の 32 件は元から対応しており、件数・TV に変化はない。これは分析処理の修正で、モデルの入力・選択・今回の原本は変更していない。


## 経路で観測した動き

[4 prefix の点検](extreme-persona-study-flow.md)と[画像・原文参照 JSON](extreme-persona-study-flow.json)。20 UI 操作すべてで、選択、実行アクション、次の画像・URL が整合した。削除の説明リンクは Docs 内の anchor であり、アカウントを削除する操作ではない。
XK0 は管理→概要→管理への再訪があったが、同期説明を取得し、新しい削除説明へも進んだ。再訪を全て無意味な loop とは扱わない。
XK1 は管理の説明を順にスクロールし、XE0/XE1 は入口から管理へ進んだ短い範囲だった。

具体的な状態上の懸念は、XK0 で同義に近い「判断に必要な説明」条件が 3 件の記憶枠中 2 件を占めたこと、XE0 で広い「本人端末が適合するか」を狭い「対象ユーザー説明を読んだ」へ対応付けて resolved としたこと。後者でも unknowns に本人適合の未確認は残り、利用可能と断定した証拠にはしない。
記憶整理と条件の意味の保持は改善候補だが、正しい再訪まで禁止する根拠にはならない。失敗した prefix を有効な Persona 経路差へ変換しない。

## 独立検証と保存

[実装の事前検証](extreme-persona-study-independent-r1.md)、[実モデルの原本監査](extreme-persona-study-independent-model.md)と[詳細 JSON](extreme-persona-study-independent-model.json)、[分析・表示の独立照合](extreme-persona-study-independent-analysis.md)と[検証 JSON](extreme-persona-study-independent-analysis.json)。検証担当はモデル API を追加使用せず、実装担当の自己申告に依存せずに台帳、入力、画像、選択の再現、実操作、終了理由を照合した。

最終の実モデル監査では、32 初回選択は全件適格、4 経路は全件無効の prefix と確認した。分析修正の前後で 32 件の件数・分布・TV は同一だった。
実行時ソースと公開時の統合 commit は分けて追跡する。実行ソース 187 ファイルは hash と ZIP で固定し、分析スクリプトの hash は分析 JSON に別記した。統合 commit を実験時の commit へ書き換えない。

今回、新しい人間の操作データは取得しておらず、人間との一致、意味理解、Persona の因果的な効果は未検証である。

独立担当の[最終検証](extreme-persona-study-independent-final.md)と[機械可読記録](extreme-persona-study-independent-final.json)：最終の artifact 依存 16 モック試行と分析・回帰をまとめた検査は 14/14 成功、skip 0、追加 API 0。表示側は 44 原本・64 ステップ、全 stage PNG、trace、CSV/NDJSON を照合した。未解決の重大実装不具合は見つからなかったが、長い探索 4 件のモデル・時間制約による無効は残る。
