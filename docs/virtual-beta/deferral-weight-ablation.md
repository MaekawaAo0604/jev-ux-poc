# 一時保留の補正を掛けるかどうかで、探索の動きを比較する

2026-11-05。
補正がモデルの再確認選択を「戻る」へ変えた 3 件を、講座予約の 2 反復で確認した。
動作観察用には補正案と実適用を分離し、履歴を保ったまま重みの適用だけを止める設定を追加した。
目的達成率による ON/OFF の自然さの順位は付けない。
人間との一致度は未検証。

## 比較する変更

既存の一時保留は、過去結果から作った重みで UI 候補の分布を変更する。
今回は deferral.applyWeights を追加した。
true は重みを適用し、false は単位重みを適用する。
動作を観察する用途では experience-inquiry-policy-off、補正の影響を調べる対照には experience-inquiry-policy-on を選べる。
両条件で、履歴、条件抽出、保留案の生成、理由質問、記憶、安全除外、選択器、seed を保つ。
OFF は自由な再訪を残しつつ、安全除外や禁止操作を無効化しない。
未指定は従来動作を保つ。

モデルが返した choice、強制除外後の無補正選択、重み適用後の選択、実操作を別々に保存する。
choice と確率最大値の食い違いまで補正の効果として数えない。
旧ログの decision.appliedCandidates は既存の提案段階の名称であり、新しい application.appliedWeights が実適用を示す。

## 実行の構成

共通構造を持つローカル検証用の図書館 UI と講座予約 UI を使い、各課題の目的と初期状態を条件間で固定する。
実製品や異なる操作構造へ一般化できるかは今回未検証。
ペルソナは既存基準と同じ null、画像は全画面の番号付き入力、判断方式は既存の argmax。
条件ごとに 2 反復、ON/OFF の順序を入れ替える。
画像条件抽出は既存の OpenAI Responses 経由 gpt-6-luna、評価と行動選択は既存 gateway 経由の Jev を使う。
seed は選択器の再現用で、外部モデルの出力を固定するものではない。

最初のバッチは、1 枠目の 9 番目の画像抽出で停止した。
実行済み 8 判断と失敗した抽出を含む 25 要求を保存した。
抽出モデルは、根拠が null の 2 条件へ revised の対応を返した。
書面の指示と既存の受理規則は、ここでは unobserved と conditionId:null を要求しており、検査が正しく拒否した。
JSON Schema の形状検査を通ることと、条件間の意味契約を満たすことは異なる。
回答の補修、受理規則の緩和、API 再送はしていない。

元のプロトコルは異常出力時に停止するため、そのバッチは MODEL_OUTPUT_FAILURE のまま保つ。
停止後に継続方針を明示し、未着手の 7 枠だけを別バッチで実行する。
失敗した 1 枠は置き換えず、合算にも無効として残す。
この事後の継続を、当初のプロトコルが正常完了したものとして扱わない。
継続処理自体も hash を固定し、次の異常出力、会計不整合、認証障害等で再び停止する。

## 観測された動き

合算は予定 8 枠、実行 8、有効 6、無効 2、未実行 0、239 要求（画像抽出 81、Jev 評価 79、行動 79）。
当初バッチは 1 枠で異常出力停止、継続バッチは未着手 7 枠を実行した。
無効 2 枠はともに OFF の図書館で、r1 は意味契約違反、r2 は 60 秒の画像抽出待機上限だった。
途中の有効な操作は動作集計に残すが、完走した比較として扱わない。
初期画像と保存入力から再構成する画像抽出要求は 4 組で一致した。
両側とも有効な試行の組は講座予約の 2 組だけで、図書館では条件間の完全な比較ができていない。

- ON：44 判断、42 UI 操作。非単位の保留案を実適用した 10 判断のうち、選択を変えたのは 3。
- OFF：35 判断、35 UI 操作。非単位の保留案は 11 判断で生成したが、実適用は全て単位重みで、選択差し替えは 0。
- 同一画像と同一コントロールへの再操作は ON 8、OFF 13。全て間に別画像の探索があり、同一画像のままの連続再操作は両側 0。
- 同一の実入力画像を交互に観察した A-B-A-B の窓は ON 1、OFF 0。これは特定の 4 観察窓の検出で、あらゆるループの有無を判定するものではない。
- 注視移動は両側 0。今回、実モデルでの注視の効果を追加確認したわけではない。

### 再確認をコードが「戻る」に変えた例

講座予約 r1 は、両側で step1–9 の操作列が一致した。
利用情報を一度確認した後、予約記録と変更画面を探索し、同じ利用情報画面へ戻った。
step10 の現在画像も同じ hash だった。

ON のモデルは確認 e1 を 0.99、戻る e2 を 0.01 と出力した。
補正は e1 に 0.01 を掛け、再正規化後は e1 が約 0.497、e2 が約 0.503 となった。
実際には e2 をクリックし、step11 の入力はマイページだった。
OFF の同じ画面では、モデルが確認 e1 を 0.98 と出力し、そのまま確認をクリックした。
OFF にも e1 の保留案 0.01 は残り、適用値だけが 1 だった。
数値はモデルの出力分布であり、人間の自信や選択頻度を示さない。

別候補を試してからの再確認は、今回の利用者が挙げた動きとして説明できる。
その再確認を ON が戻る操作へ差し替えたことは、コードの介入として確認できた。
ただし、評価内容や保持した仮説は試行ごとに異なり、両側の入力全体まで同一だったとはいわない。
同じ保存分布に対する無補正の選択記録から、この 1 手の差し替えを特定している。

[ON の実入力](deferral-weight-frames/slot-3-s10-current.png) と [操作後の次入力](deferral-weight-frames/slot-3-s10-next.png)。
同じ現在画像の OFF step10 は結果 JSON の slot4 で照合できる。

### モデルだけの反復と分類できない往復

講座予約 ON r2 の step9–12 は、マイページ → 利用情報 → マイページ → 利用情報。
step10 と step12 のモデルは確認 e1 を選んだが、補正後の実操作は戻る e2 だった。
モデルによる再入場と、補正による退出が組み合わさった観測列である。
モデルが単に履歴を忘れた例として分類することはできない。
step12 の実操作後の監査画面は保存するが、それを次にモデルが見た画面として列へ足さない。

[step9 の実入力](deferral-weight-frames/slot-8-s9-current.png) と [step10 の実入力](deferral-weight-frames/slot-8-s9-next.png)。

### 未達でも説明できる探索

OFF 図書館 r1 は、確認を実行してから変更画面へ戻り、まだ利用できない表示を見て、利用情報を再訪した。
OFF 講座予約も別候補の探索後に確認を再実行した。
これらを目的未達や再訪回数だけで異常としない。
一方、ON 図書館の 2 試行は重みを適用した判断があっても選択差し替えは 0 だった。
従って、今回見られた経路の差全てを補正の効果と呼ぶこともできない。

記憶チャネルと観察出典は判断ごとに保存している。
受付表示が画面から消えたこと、画像記憶の上限、操作結果の記録の有無、モデルがその記録を使ったかを別々に確認する。
今回の記録は人間の忘却や理解を実証しない。

5 例を事前に定めた優先順で抽出し、現在と次入力の 10 枚を公開した。
これは問題が強く見える例だけを目標達成の成否で選ぶ方式ではない。

## コードの修正と検証

独立検証で、リプレイが保存回答の choice／分布と、選択器に渡した値の一致を確認していない P2 を発見した。
実回答を書き換えた診断コピーまで通過したため、この結合を検査する最小修正を行った。
15 改ざん例は拒否し、キー順序だけ違う 3 例は受理することを再検証した。
最初の修正は JSON のキー順序を値の違いと誤認し、回帰検証で失敗した。
順序を問わず値を比較する修正に直し、最初の FAIL 証跡も保存した。

親の関連 57 テストと build、独立の対象 84 テスト、通常 CLI の 8 モック試行を確認した。
モックは配線確認であり、モデル入力の実配信や人間らしさの実証ではない。
一時保留が実行する UI 操作を切り替えるブラウザ統合検証は、同じ学習済み案、同じ入力で ON/OFF を比較した。
これらの件数には重複があり、合計しない。

## 残る範囲

同じ設定と初期画像でも、外部モデルの回答は揺れる。
初期の画像抽出入力が一致しても、その新しい抽出結果を含む評価入力や行動入力まで一致するとは限らない。
1 手の局所的な差し替えは保存された分布から確認できるが、別試行の経路全体の差を補正だけの効果とは断定しない。
往復数は重なりを含む観測窓の件数であり、異常判定の閾値ではない。
受付表示が再訪時に消えたことと、過去の結果が記憶に渡っていないことを混同しない。
記憶の配送とモデルによる利用も分ける。
制限終了、モデル回答エラー、本人の離脱は別に集計する。

## 次に使う設定

対象ユーザーの動きを調べる基準には、まず experience-inquiry-policy-off を明示する。
履歴を維持したまま選択の差し替えを切り離せるためであり、OFF のほうが人間に近いと認定したためではない。
従来の目的達成用の補正は ON と未指定に残し、今回は既定値を変えていない。
次は、未補正でも残る意図と操作の対応、別の操作構造、非 null persona、対象ユーザーの反復記録を分けて検証する。
画像抽出の契約違反と待機上限についても、今回の欠測を保持して別途扱う。

## 実行方法

今回使用した feature/virtual-beta-information-state の作業コピーで実行する。
元の E:/ChatGPT/Ux_test の未コミット変更は編集していない。

    Set-Location "C:/Users/Maekawa Ao/.codex/worktrees/virtual-beta/Ux_test"

以下の保存原本と外部 .env は今回のローカル環境に存在する。
新しい出力先を毎回作り、モデル要求を含む実行とモックを区別する。

    npm run build
    node --import tsx --test tests/deferral-ablation-profile.test.ts tests/deferral-ablation-comparison.test.ts tests/deferral-weight-application.test.ts tests/deferral-application-integration.test.ts tests/motion-comparison-analysis.test.ts

    $comparisonStamp = Get-Date -Format yyyyMMdd-HHmmss
    $snapshotFile = (Resolve-Path reports/deferral-ablation-2026-11-05/continuation-final-prior-raw.json).Path
    node --import tsx runner/inquiry-alignment-comparison.ts --deferral-weights --mock --prior-snapshot $snapshotFile --out "reports/deferral-weight-mock-$comparisonStamp"

実モデルの通常比較は次を使う（最大 8 枠、288 要求、直列 1）。
.env の値をログへ出さない。

    node --import tsx runner/inquiry-alignment-comparison.ts --deferral-weights --prior-snapshot $snapshotFile --env-file E:/ChatGPT/Ux_test/.env --out "reports/deferral-weight-live-$comparisonStamp"

既存結果のリプレイは API や実操作を再実行しない。

    npm run replay:virtual-beta -- reports/deferral-ablation-2026-11-05/continuation-live/recovery-workshop-unchanged-r1-experience-inquiry-policy-on/exploration --require-final-http

## 版と成果物

実行コードは [6f098d9](https://github.com/MaekawaAo0604/jev-ux-poc/commit/6f098d9003f245c9eacb84a1e23dfc2307a50ec2)、runtime hash は 9f1dc69815b16cfc0eaaec9e5e1386afebb024dd66561e7e1aef29923b511365。
[実行ソース 166 ファイルの ZIP](deferral-weight-source-9f1dc698.zip) と [hash メタデータ](deferral-weight-source.json)、[ファイル別の識別情報](deferral-weight-producer.json) を保存した。
ZIP SHA-256 は c27db5d12a4ef4ee166dc1dc94877daa3a393c5bcac86509508d289cfccaef2a。
実行時の作業コピーのバイト列を保存しており、Git の改行正規化による差と区別する。
新しい依存関係、学習モデル、論文コード、正解経路を追加していない。

[結果と判断別 JSON](deferral-weight-results.json)、[元の比較プロトコル](../../experiments/virtual-beta/deferral-weight-comparison.json)、[動作の観察計画](deferral-weight-motion-plan.json)、[停止後の継続宣言](deferral-weight-amendment.json)、[実際の継続処理の保存原文](deferral-weight-continuation-runner.txt)、[異常抽出の診断](deferral-weight-invalid-native.txt)。
継続処理の原文は実行当時の revision と保存原本に結び付けた監査資料で、任意の HEAD で継続するコマンドではない。
新しい比較には上記の通常 runner を使う。

独立記録：[修正前の FAIL](deferral-weight-review-code-r1.json)、[修正後の PASS](deferral-weight-review-code-r2.json)、[通常 CLI モック](deferral-weight-review-mock.json)、[最初の停止バッチの監査](deferral-weight-review-initial-live.json)、[継続処理の事前検証](deferral-weight-review-continuation-preflight.json)、[継続実行の原本監査](deferral-weight-review-live.json)。
[原本の照合詳細](deferral-weight-review-live-evidence.json)と[5 例の実画像レビュー](deferral-weight-review-visual.json)も保存した。
監査の PASS は記録の整合性を示し、自然さや探索性能の認定ではない。

ローカル原本は reports/deferral-ablation-2026-11-05/。
当初 live と、継続 continuation-live、各台帳、失敗、改ざん診断、画像、検証ログを保持する。
最終保存対象は過去 7294、最初の停止バッチ 40、継続 289 の計 7623 ファイル。
公開結果と画像には今回の架空 UI の記録を使い、人間の操作記録や感想をモデルへ送っていない。
