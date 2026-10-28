# 案内の取得と意味に応じた選択の検証 — 2026-10-28

今回の実モデル実験では、自律的な「別の場所を見る→案内を取得→意味に応じて選択」は成立しなかった。初期に案内を隠した18試行すべてで注視移動は0だった。一方、案内が初めから見える別の対照2試行では、入れ替えた案内に対応するA/Bをそれぞれ選んだ。後者は可視の案内に対応した選択の観測例であり、内部の理解の証明や、人間の予測精度の実証ではない。

以前の「意味を読まなくても候補が出たら押せる」課題から進め、どちらのボタンも最初から押せる一方、意味を記した案内だけが初期画像に入らない課題を実装した。成功した試行だけを選ぶことなく、事前固定した12試行、目的を厳しくした4試行、可視対照2試行、座標契約修正後2試行を保存した。今回の新規実APIは47/48要求。前フェーズ48要求とは別枠で、保存入力の直接再送は行っていない。

## 基準と担当

開始基準は `960ba57496e1f8abd577d306d94590a7cf1c77f4`、前フェーズ製品固定版 `ad1d644`。既存の視覚変換、状態、分布処理、旧LOOP修正、4条件runner、累積API予約、F1〜F6、画像・trace・replayを流用した。元の `E:\ChatGPT\Ux_test` と未コミット変更は変更せず、既存の隔離worktreeで新しい `feature/virtual-beta-semantic-controls` を作成した。

親が共通型、CLI、監査、入力境界、人間記録の接続、API予算、統合を担当した。実装サブ `semantic_ui` は `app/semantic-fixture.ts`、`app/SemanticFixture.tsx`、fixtureテストと仕様を担当。実装サブ `semantic_analysis` は `runner/semantic-analysis.ts`、解析テストと仕様を担当。担当が重なる製品ファイルの同時編集は避けた。実装後の新しい検証サブ `semantic_verify` は製品コードを修正せず、独立テスト、実ブラウザー、全体回帰、保存実測の照合を行った。

製品・実験条件を固定してから各バッチを実行した。

- 最初の12試行：`e333750a75dfba596bcb80029bd49614c99d6889`、source hash `5f3e59d19f76f968e35872805171a234530053d5bebf67566d1d7c3e37add276`。
- 可視対照と表示維持の追試：`69b55cc7fb0e4ce92f5526c97becac2288289cdf`、source hash `614879e509b8b395ed275a180be81b9c4ed102c8a935d7710f34fbbf4b62fea9`。
- 最終の座標契約修正後：`e13a3be291452e56b6ce6522248e92e92a2b1ab4`、source hash `7d27ef96406e10e1a28fd32f1fcf29e2ff676c93c33a8bf42c0ef18d9bf1eab9`。

この後の文書コミットは製品コードを変更しない。新しい依存、学習モデル、動的注意モデルは追加していない。今回の部品の仕様は [semantic-fixture.md](semantic-fixture.md) と [semantic-analysis.md](semantic-analysis.md)、事前の分担と受入条件は [実施計画](../superpowers/plans/2026-10-28-semantic-controls.md) にある。

## 実装した制御

通知停止を担当する設定をA/Bで反転する。同じUI・初期状態では、モデルへ渡す初期cropと公開入力、A/B両候補は同一。監査用の全画面では、画面外周の案内だけが反転する。正解側はメールを停止し、他方は表示設定を切り替える。間違った側も押せるので、候補生成による正解の誘導を避けられる。各試行はfresh contextから始め、設定は保持しない。

reference、案内の位置だけを変えるposition-only、同じ意味の文言だけを変えるwording-onlyを用意した。ボタンの文言・位置・順序・機能は3UIで固定し、見た目の差分を実ブラウザーのgeometry/styleとPNGで検査する。案内と監査の正解情報をDOM、URL、候補ラベル、状態からモデルへ渡さない。crop条件で候補ラベルは番号と一般的な操作だけとなる。

`--semantic` がこのfixtureと監査を有効にする。`--order-seed` は実行順を再現するseedであり、モデルの生成seedではない。固定12枠への割当は `experiments/virtual-beta/semantic-protocol.json` に実API前に保存した。モデルの分布は保存し、実選択にはargmaxを使った。人間らしい確率的選択の実験とは混ぜていない。初心者Aは固定し、今回の主対象は意味に対応した探索能力である。

新しい `initialFixation` は初期注視を設定する。可視対照に使うが、通常の探索途中に正解位置を強制するものではない。最終修正では `observation.viewport` に元画面の1280×900を渡し、crop画像の寸法640×480（右下では640×465）と区別した。注視座標は元画面基準で、切り取り範囲外でもviewport内のlookは有効と一般的に説明する。特定の注視点、案内の位置、正解の操作順は教えない。

`--preserve-display` は「表示設定を一度も変えない」という目的の独立oracleを有効にする。メール停止だけでなく、非公開の表示変更回数が0である必要がある。一度変えてから元に戻しても失敗。監査が取得できなければORACLE_ERRORであり成功とは扱わない。

## 実Jevの結果

実行条件はJev 1.14.0、初心者A、1280×900、ja-JP、Asia/Tokyo、固定基準日、外部フォント無効、crop640×480、観察記憶3、goal/argmax、並列1。各試行のAPI・判断・注視・UI操作・90秒上限を維持した。API待ち時間とUI操作時間は別々に記録し、モデル上のユーザー時間は未校正のためnull。全バッチの個別20試行、終了理由、操作列、画像参照、版、hashは [semantic-results.json](semantic-results.json) に保存した。

最初の12試行は3UI×2対応×2反復、実API30要求。初回操作は12件すべてBで、注視移動0。正解Bの6件はB→done、正解Aの6件はB→A→done。メール停止は12/12、主観的doneも12/12だった。案内を取得してからの最初の正しい選択という事前指標は0/12、各UIも0/4。全12件の終了理由はSUBJECTIVE_DONE、基盤障害・打切りは0。

初期のA/B対はモデル入力hashと入力画像hashが6対すべて一致し、全画面hashは案内の反転により異なる。各UI×対応の反復でも初期入力は同一だったが、モデルの正規化分布は6組すべてで変動した。最初のargmax選択と操作列は一致した。保存分布からの選択の再現性と、APIへ新しく問い合わせた分布の再現性は区別する。

事前固定した厳しい指標に対する対応反転の正確検定はp=1、UI差の正確検定もp=1。3UIに行動差は観測されなかった。これは12件でUI効果が存在しないと証明する結果ではない。今回は変更箇所を一度も観察していないため、文言を読んだ後の差は測れていない。小標本の条件付き検定であり、人間の成功確率やモデル内部の理解の確率ではない。

次の2件は案内が初めから見える可視対照で、実API2要求。対応AではA、対応BではBを最初に選び、メール停止は2/2。注視移動0、UI操作各1。1判断上限なので、両方DECISION_LIMITで主観的doneは未取得。事前ファイルにはAPI_LIMITを予想した記述があるが、実際には判断ループの上限が先に終わった。最初から見えるので、元の「新規取得」指標には不適格と明示し、自律探索の成功には加算しない。各1件だけの選び分けで、偶然を十分排除した意味理解の実証とはしない。

表示を一度も変更しない目的の追試4件は実API10要求。正解A-r1はB→A→doneで失敗、正解B-r1はB→doneで成功、正解A-r2はA→doneで成功、正解B-r2はA→B→doneで失敗。初回はB,B,A,A、注視移動は全件0。メール自体は4件とも止まったが、独立した目的達成は2/4。全件SUBJECTIVE_DONEで、2件は主観的完了と客観的結果が食い違った。案内取得指標は0/4。

座標契約修正後の別の2件は実API5要求。正解AはB→A→done、正解BはB→done、注視移動は両方0。メール停止は2/2、両方SUBJECTIVE_DONE、案内取得指標は0/2。入力契約の欠落は修正したが、この修正だけで注視探索が起こるという仮説は支持されなかった。

12+2+4+2の20試行、30+2+10+5=47要求。全47件は1実要求でOK、予約拒否・通信失敗・隠れた再試行はない。残り1要求は使っていない。異なる目的・初期注視・製品版の追試は、元の12件に足してUI効果の検定をやり直していない。

## 追える証拠と問題の分類

`reports/semantic-controls-2026-10-28/live/semantic-01-reference-a-r1/` は、案内未取得のままBを押し、表示だけ変わり、次にAでメールを止めてdoneに至る代表例。`input-1.png` と `step-1.json` がモデルへ渡った画像・状態・候補・分布、`audit-1.png` はユーザーには渡していない全画面、`result.json` と `trace.zip` が実操作と最終監査を示す。各runは同じ構成で記録する。

可視の意味と選択の対応は `exposed/semantic-01-reference-a-r1/` と `exposed/semantic-02-reference-b-r1/` の最初の入力画像・実分布・操作で確認できる。注視を強制した成功列を自律経路と称する例はない。今回、実モデルの「注視→新案内→操作」の成功例は得られていない。機械的な経路自体は、別の `independent-mock-e13a3be/` で注視のみ→画像更新→正しいボタン→doneを検証する。モックは対応を知ったスクリプトで、自律能力の証拠には使わない。

観測された問題と次の仮説を分ける。

- 実装不具合：表示維持oracleを定義したのに判定箇所へ接続していなかった。独立テストがREDを再現し、実API前に両方の判定箇所へ接続してGREENを確認。表示を元へ戻すケースも失敗となる。
- 実装不具合：semantic UIのCSVがlegacyと表示された。fixtureからUI名を取得するよう修正し、新規CSVとCLIテストで確認。
- 入力契約の不足：crop寸法と元画面基準の注視点はあったが元画面寸法がなかった。RED→修正→GREEN。修正後実Jevでも注視は0なので、以前の失敗原因と確定できない。
- 探索・選択上の不足：注視先候補が利用可能で、正解は案内にあるのに、現在見える設定を直接試した。可視対照では選び分けたため、案内を全く扱えないという説明だけでは足りない。未取得情報の必要性や、探索行動の価値を判断する機能の不足は仮説として残る。正解位置の強制で覆い隠さない。
- 目的・完了判断上の不足：表示維持という追加制約に反した2件でもdoneした。主観的doneと独立oracleを分けたことで検出できた。persona違反の一般的な発生率や、人間も同様に行動するかは未測定。

制御UIは正解側を押せば両対応・全UIで達成でき、反復時に初期化されることを実ブラウザーで確認した。ただしこの架空UIの曖昧なA/Bは情報取得を測るための課題であり、実製品のUX不良や一般製品への適用性能を示さない。

## 検証と人間記録

最終製品版e13a3beで `npm run build`、standalone型チェック、全体回帰708件（705成功・失敗0・skip3）が完了した。skipは実API用の2件と明示opt-inのOCR統合1件で、通常のローカル回帰を全件実施した。新しい独立検証サブの受入記録は [semantic-independent-review.md](semantic-independent-review.md)。最終版の12件モックは全件成功（36スクリプト評価、実API0）、人間記録器の自動スモークも2クリック・記録エラー0・画像/ソース一致・automation除外を確認した。初期2版の途中で停止した全体回帰ログはpartialとして残し、最終版の全体回帰と混ぜない。

人間記録は既存 `runner/persona-human.ts` を拡張し、`--compare-to RUN_DIR` で同じUI・対応・目的・独立oracle・ソースhash・番号のない初期画面hashを照合する。traceと実クリックを保存し、監査失敗では判定をnullにする。fixture/source/初期画面/policyが異なる記録を同条件としない。自動スモークはactor=automation、selfAttested=falseで、人間データへ加算しない。

人間の実測はユーザー指定により今回は実施しない。普通の全画面ブラウザー操作とJevのcrop視覚は同じ観察条件ではなく、マウス座標も視線ではない。記録基盤の一致検査が通っても、人間への一致度・意味の認識・読了時間・感情・予測精度は未検証である。人間の本計測では、同条件の定義、必要なら視覚条件や視線計測、参加者属性、未見の評価課題、認識・制約の確認が追加で必要となる。

## 再実行

リポジトリのルートでNode22.12以上（または20.19系）とnpm依存・Playwright Chromiumを用意する。以下のローカル検証はAPI要求を発生させない。既存のlive用環境フラグを外してから実行する。

```powershell
Remove-Item Env:JEV_LIVE_COMPOSITE,Env:JEV_LIVE_SEMANTICS,Env:RUN_OCR_INTEGRATION -ErrorAction SilentlyContinue
npm run build
node node_modules/typescript/bin/tsc --noEmit
node --import tsx --test --test-concurrency=1 tests/*.test.ts

# 対応を知るスクリプトによる12試行の実ブラウザー疎通。実モデル性能ではない
npm run experiment:virtual-beta -- --mock --semantic --order-seed 313977649 --repeat 2 --conditions semantic-capability --ui reference,position-only,wording-only --config experiments/virtual-beta/semantic-capability.json --charter experiments/persona/charter-semantic.json --max-total-api 48 --out reports/semantic-mock-new

# 保存分布と画像hashを検証。APIや実操作の再送はしない
npm run replay:virtual-beta -- reports/semantic-controls-2026-10-28/viewport-recheck/semantic-01-reference-a-r1

# 人間記録器の自動スモーク。人間の実測には数えない
npm run record:persona-human -- --smoke --compare-to reports/semantic-controls-2026-10-28/viewport-recheck/semantic-01-reference-a-r1 --out reports/semantic-human-smoke-new

# 後日の実参加者記録（--smokeを外す）。正解順序は表示しない
npm run record:persona-human -- --compare-to reports/semantic-controls-2026-10-28/viewport-recheck/semantic-01-reference-a-r1 --out reports/semantic-human-new
```

humanのsource hash一致には、記録対象の製品コードと同じソースの実bytes（改行を含む）が必要。commit名だけでは一致を保証しない。文書だけを変更した最終コミットなら製品hashは同じ。過去の結果とコードが違う場合は比較不適格になる。録画終了は記録用の別タブで申告する。

実APIを使った正確なコマンドは以下。今回の承認枠で自動再実行しない。過去の台帳をリセットしたり、残り1要求でこのバッチを走らせたりしない。将来は新規承認に対応する別の予算JSONが必要である。

```powershell
# 初回12件・最大48、実際30要求
npm run experiment:virtual-beta -- --semantic --order-seed 313977649 --repeat 2 --conditions semantic-capability --ui reference,position-only,wording-only --config experiments/virtual-beta/semantic-capability.json --charter experiments/persona/charter-semantic.json --phase-budget reports/semantic-controls-2026-10-28/api-budget.json --max-total-api 48 --env-file E:\ChatGPT\Ux_test\.env --out reports/semantic-controls-2026-10-28/live

# 可視対照・実際2要求
npm run experiment:virtual-beta -- --semantic --order-seed 313977649 --repeat 1 --conditions semantic-capability --ui reference --config experiments/virtual-beta/semantic-exposed-control.json --charter experiments/persona/charter-semantic.json --phase-budget reports/semantic-controls-2026-10-28/api-budget.json --max-total-api 2 --env-file E:\ChatGPT\Ux_test\.env --out reports/semantic-controls-2026-10-28/exposed

# 表示維持・実際10要求
npm run experiment:virtual-beta -- --semantic --preserve-display --order-seed 313977649 --repeat 2 --conditions semantic-capability --ui reference --config experiments/virtual-beta/semantic-preservation.json --charter experiments/persona/charter-semantic-preservation.json --phase-budget reports/semantic-controls-2026-10-28/api-budget.json --max-total-api 16 --env-file E:\ChatGPT\Ux_test\.env --out reports/semantic-controls-2026-10-28/preservation

# 座標修正後・実際5要求
npm run experiment:virtual-beta -- --semantic --order-seed 313977649 --repeat 1 --conditions semantic-capability --ui reference --config experiments/virtual-beta/semantic-viewport-recheck.json --charter experiments/persona/charter-semantic.json --phase-budget reports/semantic-controls-2026-10-28/api-budget.json --max-total-api 6 --env-file E:\ChatGPT\Ux_test\.env --out reports/semantic-controls-2026-10-28/viewport-recheck
```

各出力先は実行済みなので、再利用せず新しいパスを使う。`manifest.json` がコード・UI・設定・Persona・Charter・割当・予算・環境、`result.json`/`step-N.json` が判断と実行、`semantic-comparison.json` が厳しい指標と正確検定、`comparison.json/csv/html` が共通の比較結果を示す。大きいPNG・trace・生応答は既存方針どおりignoredの `reports/semantic-controls-2026-10-28/` に保持する。Gitには小さな結果JSON、仕様、実行条件、テスト、独立記録を含める。

## 次に必要な3件

1. 未取得情報と操作の副作用を判断に結ぶ部品を、現在の画像recency bufferから分離して実装する。観察を根拠とする「まだ分からないこと」と候補操作の予想結果を記録し、正解位置やDOMの答えを渡さずに、情報取得を選ぶ方策と既存方策を比較する。正解を教える強制lookや、誤操作を自動除外する処理で成功させない。意味の認識・副作用制約・doneの整合性を別々に検査する。
2. 新たな実API枠で、案内が隠れる/見える対照を同じ最終版・目的・予算で反復し、未見の対応や配置にも広げる。自律取得が成立してからUIごとの効果を測る。今回の0/12を取り替えたり、偶然よい試行だけを採用したりしない。
3. 用意した人間記録基盤で比較データを取得する。まず全画面とcropの観察条件の違いを定義し、操作・制約理解・読んだ情報・離脱理由を取得する。較正と評価を分け、実参加者との一致度はその時点で評価する。
