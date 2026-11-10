# 端末制約で選択が分かれる画面の比較

前回の GitHub Docs の説明読みでは、8 種類を極端にしても初手が大きく重なった。今回は、読むための共通操作を挟まず、画面上の要件と本人の端末制約を直接照合できる架空の設定画面へ移した。人間との一致度の実験ではない。

## 比較条件

知識、経験、期待、行動傾向は固定し、PC の OS への個人認証情報保存の可否と、本人のスマートフォンの有無だけを 2×2 にした。全員が同じブラウザーで自分の既存メールを確認でき、外付けキーは持っていない。

- M0：保存できる私物 PC、スマートフォンなし。
- M1：保存禁止の共用 PC、スマートフォンなし。
- M2：保存できる私物 PC、スマートフォンあり。
- M3：保存禁止の共用 PC、スマートフォンあり。

名前は中立な「条件1」等にしたが、ID と名前もモデル入力なので完全な属性単独の因果証明とはしない。
[4 定義](../../experiments/persona/constraint-choice-v1/set.json)の contextAndConstraints の 2 要素以外は、ID・名前を除いて同じである。

初期画面に同じ大きさの 3 選択肢を表示する。選択済み・推奨の方式はない。
「このPCに保存」は OS の認証情報ストアへの保存許可が必要で、次回 5 秒の想定。「スマートフォンで承認」は手元の本人スマホと Bluetooth が必要で、PC の認証情報ストアには残さず次回 10 秒の想定。「メールの一時コード」はスマホも OS 保存も不要で、毎回コード入力に 60 秒の想定。いずれもサンプルの製品説明で、実測した人間の行動時間ではない。

共通目的は「自分の利用環境で次回から使うログイン方法を設定し、設定が保存されたことを確認してください」。本人が利用できる方法の中で、今後の手間を減らしたいという期待を全条件で共有する。
方式を選ぶと内容確認、保存後は結果確認へ進む。どの方式も同じように保存でき、Persona に応じてボタンを無効化・除外・重み付けしない。正解のクリック順をモデルに渡さない。

## 判定を分ける

機能上の完了は、設定が保存され、保存済み方式に一致する確認表示が見えていることで判定する。全 3 方式で成立する。
本人の制約との整合性は実行後の監査で別に確認する。保存禁止なら PC 保存、スマホなしならスマホ承認が利用想定に合わない。一時コードは全条件で利用できる。機能上は完了していても、本人には使えない設定を保存する可能性を消さない。

最初に方式を開くことと、保存確定は別である。使えない方法を確認のために開くことを、そのまま制約違反と数えない。まだ何も保存していなければ not-saved、整合性は null とする。
実際のメール、認証情報、OS、スマートフォンを操作する試験ではない。制約との整合は架空の利用想定の評価であり、現実の OS ポリシー強制や情報流出の検証ではない。

## 実装と事前確認

既存の PersonaTaskFixture、LocalExplorationPage、通常 runHumanJev の native → assessment → action を維持した。旧 3 課題の一覧と PersonaTask 型は維持し、新課題は methods として明示的に選ぶ。旧の 36 枠が勝手に 48 枠へ増えないことを検査した。
親が共通型、oracle、薄い cohort、比較条件と統合を担当し、実装サブが画面・状態・ブラウザーテストを担当した。別コンテキストの検証サブは製品コードを修正せず、実画面と通常のモック pipeline を実行して確認した。

実装の独立検証で、INVALID_DISTRIBUTION / INVALID_ASSESSMENT 等の信頼できる不正応答を連続停止へ数えない P1 を再現した。終了理由による分類を加え、3 件で停止する回帰試験を再実行した。自由なモデル出力中の code や statusCode を停止条件に使わず、クライアントと harness のエラーだけを照合する。保存原本が欠ける場合は記録基盤の問題として直ちに監査停止し、元のエラーと記録エラーを分けて残す。
独立テストの 1/64 ピクセルの grid 幅丸めと、モックの補助質問への不正回答は検査側を修正し、元の FAIL 記録も保持した。

親の関連 90 テストと build は成功。独立した 7 検査は通過した。モックは API 0 要求であり、モデルの挙動差の証拠へ数えない。モック原本の apiCalls にはシミュレーション段階数が入るため、実要求の台帳・row.requests と分ける。以前の全体 npm test の未合格を、今回の関連成功で全体 green に置き換えない。

## 固定した実行

[事前プロトコル](../../experiments/virtual-beta/constraint-choice.json)。各 4 回、16 枠。4 位置の巡回順を 4 反復で均等化するが、無作為化ではない。最大 3 判断、UI15・注視3、試行300秒、画像解析60秒、並列1、再送・置換0。台帳は既存の 36 要求割り当てを維持し、合計割り当て576。3段階×3判断により実要求上限は144。全体時間上限は1時間。

3 件連続のモデル不正では停止する。認証・利用枠・安全・会計・入力凍結の不整合は直ちに停止する。タイムアウトをユーザーの迷い・離脱として数えない。
実行時は commit 7ef309f 上の未コミット変更を凍結し、sourceHash は baec5721f39219f227313e4e8b935d076ea97f8ab132c8c388b71eda42124467、189 ファイル。[実行ソース](constraint-choice-source-baec5721.zip)に改行を含むバイト列と freeze を保存した。後の統合 commit と実行時の版は区別する。

```powershell
Set-Location "C:/Users/Maekawa Ao/.codex/worktrees/virtual-beta/Ux_test"
node --import tsx runner/constraint-choice-comparison.ts --prior-snapshot "C:/Users/Maekawa Ao/.codex/worktrees/virtual-beta/Ux_test/reports/constraint-choice-2026-11-08/prior-raw.json" --env-file E:/ChatGPT/Ux_test/.env --out reports/constraint-choice-2026-11-08/live-r1
node --import tsx runner/exploration-viewer.ts --batch reports/constraint-choice-2026-11-08/live-r1 --out reports/constraint-choice-2026-11-08/viewer --serve --watch --port 4177
node --import tsx --test --test-concurrency=1 tests/constraint-choice-fixture.test.ts tests/constraint-choice-oracle.test.ts tests/constraint-choice-comparison.test.ts
npm run build
```

出力先は今回のもの。新規実行は未作成の出力名へ変更する。既存の出力へ継ぎ足す・上書きする再開はこの薄い driver には実装せず拒否する。台帳と試行原本は残る。このマシンの prior snapshot は以前の 10,379 ファイルの期待 hash を保持しており、新しい clone にそれらがあるとは仮定しない。

## 実モデルの結果

16 枠をすべて実行し、16 有効・無効 0・未実行 0。144 API 要求、48 判断、32 UI 操作、注視 0。全員が方式選択→保存→結果を見て主観的完了の順に進み、予定した 3 判断の範囲で終えた。途中の API・基盤障害は 0。失敗枠の追加・置換は行っていない。

- M0：私物 PC・スマホなし。4/4 回で PC 保存を選択・保存。
- M1：保存禁止 PC・スマホなし。4/4 回で一時コードを選択・保存。
- M2：私物 PC・スマホあり。4/4 回で PC 保存を選択・保存。
- M3：保存禁止 PC・スマホあり。4/4 回でスマホ承認を選択・保存。

全 16 件で最初に開いた方式と保存方式が一致した。機能上の完了も、利用想定上の端末制約との整合も 16/16 件だった。これらは別に検査した結果であり、不適合方式を保存できない UI にしたためではない。独立モックでは保存禁止 Persona が PC 保存を確定して機能上完了する例も実行し、不適合を別判定できることを確認した。

16 件のモデル初期画像、Persona だけを除いた native 入力、候補と画面の対応は同じ 1 グループだった。生成された native の解釈や、後段の全 action 入力まで同一とは仮定しない。全 48 判断でモデルの提案と実際の選択は一致し、操作の差し替えは 0。既存の条件付き分布・正規化・監査は残しており、選択処理全体を取り除いたとはいわない。

### 分布と条件内の揺れ

初回の正規化モデル分布を使う。各側の反復間 6 組、条件間 16 組の TV を比較した。

- スマホなしで PC 保存可否を比較：条件内 0.005 / 0.033、条件間 0.970。
- スマホありで PC 保存可否を比較：条件内 0.015 / 0.012、条件間 0.969。
- 保存禁止 PC でスマホ有無を比較：条件内 0.033 / 0.012、条件間 0.981。
- 私物 PC でスマホ有無を比較：条件内 0.005 / 0.015、条件間 0.033。少しの確率差はあるが、実際の選択はどちらも PC 保存だった。

この課題では、端末制約で利用できる選択肢が変わる 3 比較で、実選択が反復して分かれ、分布の条件間差も条件内の揺れを大きく上回った。PC 保存が利用できる場合はスマホ有無で実選択が変わらず、変更した属性すべてに無理に別行動を作ったわけでもない。
各 4 回の記述結果であり、TV の比較ペアは独立ではない。モデルの確率を人間の行動頻度に置き換えず、有意差・人間への一致を認定する検定は行わない。

## 根拠と出力

[全16試行の分析 JSON](constraint-choice-results.json)、[16行 CSV](constraint-choice-runs.csv)。raw / normalized / filtered の分布、候補 ID、実際の選択、状態、短い理由、原本の hash と JSON pointer を保持する。[画像の対応表](constraint-choice-frames.json)は全件の分母とは別に、各方式の最初の有効例を機械的に選んだ説明用のもの。

初期の[モデル入力画像](constraint-choice-frames/initial-model-5342474ebefff66b6c42cf083c5692f56862875b12efe18d3b289558e71dbe46.png)には全 3 方式が見えている。保存後の例も実際にモデルへ渡して応答を受信した画像を使い、終端監査画像を次入力として代用していない。

[独立した実装事前検証](constraint-choice-independent-preflight.json)、[分析修正の独立検証](constraint-choice-independent-analysis.json)。分析レビューで、入力の期待事項と Persona の不一致、添付されない current 画像参照を、再計算済み hash があれば集計に残す P2 を 2 件再現した。意味の対応と全段階の画像 binding を検査する修正を加え、同じ再現ケースを含む 18/18 テストと型検査で確認した。モデルの入力や実原本は変更せず、修正した分析で 16 件すべてが適格だった。

分析 producer の SHA は 92cfcf974332386e79d55cead793c4931b347c7650a2264ae0c6c5ef98f3724f。actor の sourceHash baec5721 とは別に記録する。旧分析版と RED はローカル analysis-implementation/version1 と independent に保全した。

```powershell
node --import tsx scripts/analyze-constraint-choice.ts --batch reports/constraint-choice-2026-11-08/live-r1 --out reports/constraint-choice-analysis-new
node --import tsx --test tests/constraint-choice-analysis.test.ts
```

ローカルの原本と台帳は reports/constraint-choice-2026-11-08/live-r1、分析は analysis-final、画面一覧は [localhost:4177](http://127.0.0.1:4177/)。以前の説明サイトの一覧 localhost:4176 と別にしている。元の E:/ChatGPT/Ux_test のソースは編集せず、認証値は通常 runner が .env から読むだけで公開物へ含めない。

## 現時点の切り分け

この限定された設定課題では、同じ基盤で Persona の明示的な端末制約に対応した選択差を確認できた。前の説明読みでは見えなかった差を、初期画面で選択を必要とする課題で観測できたことになる。
ただし、前回とは課題・Persona 定義が異なる。以前の差の弱さを単一の UI 改良や Persona 文面だけの効果へ帰属しない。

今回は、明示された利用可否と、共通の少ない手間という期待を照合する短い課題である。知識・経験・曖昧な好みが人間らしい迷い・再訪・選択頻度を作るかは未検証。複雑な実サイトでの 4000 token 到達や履歴条件の保持の問題も残る。人間データは取得しておらず、人間の体験を再現したとは結論しない。

## 実行後の独立監査

[監査要約と代表例](constraint-choice-independent.md)、[最終検証 JSON](constraint-choice-independent-final.json)、[原本監査](constraint-choice-independent-actual.json)、[段階数・時刻・TV の照合](constraint-choice-independent-supplement.json)、[表示と export](constraint-choice-independent-viewer.json)。すべて PASS、未解決の今回の指摘は 0。
16 原本・16 台帳・16 trace・16 終端画像・48 判断を照合し、144 要求は全て計上・未精算予約 0。実画像解析は gpt-6-luna、評価・行動は jev-1.14.0。検証担当の追加モデル API は 0。

単なる配送確認に加え、代表の初回評価では M1 が PC 保存とスマホ承認を conflicts、一時コードを advances とし、M3 は PC 保存を conflicts、スマホ承認と一時コードを advances とした。M2 は 3 方式とも advances で、実際には PC 保存を選んだ。native の要件整理にも本人の端末条件が現れている。これは短い構造化された自己申告で、内部推論や意味理解の完全な証拠とは扱わない。原文の pointer と SHA は独立監査に記録した。

表示は 16 試行・48 ステップ、CSV 17 行と NDJSON 48 行、全入力 PNG と raw JSON の一致を確認した。実行時間約47〜80秒は API と runner の待ち時間を含み、モデル化したユーザー時間は null。架空の5/10/60秒と混ぜない。

過去 10,379 ファイルの期待 hash は driver の前後確認で維持した。最終公開前には別の hash 照合、認証値検査、staged allowlist と source ZIP の照合を行う。既定ブランチの変更、リリース、本番操作は行わない。
