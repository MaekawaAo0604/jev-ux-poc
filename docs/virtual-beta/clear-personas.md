# 分かりやすい通知設定画面での Persona 比較

端末条件だけを変えた前回の対照に続き、今回は初心者・熟練者・慎重な利用者の全体像を使う。画面は既存の架空サービス「まちの予約帖」の「予約のお知らせ」。UIは作り変えず、通常のJevの画面認識・評価・行動選択で反復する。人間を再現できたと結論する実験ではない。

## Persona

[入力セット](../../experiments/persona/clear-notifications-v1/set.json)と、各 JSON に全定義を残す。

- **A：IT初心者**。[定義](../../experiments/persona/clear-notifications-v1/a.json)。ITリテラシーは低く、このサービスは初回、通知・情報利用設定の経験はほとんどない。一般的なリンクとボタンの操作だけを知っている。説明を頼りに達成したく、知らない用語には慎重という傾向。説明を必ず開く指示はない。
- **B：IT熟練者**。[定義](../../experiments/persona/clear-notifications-v1/b.json)。ITリテラシーは高い。このサービスは初回だが同種の通知・アカウント設定の経験が豊富。一般的な認証や設定画面を理解し、少ない操作を期待して効率を重視する。近道を必ず選ぶ指示はない。
- **C：セキュリティに慎重な利用者**。[定義](../../experiments/persona/clear-notifications-v1/c.json)。ITリテラシーは中程度、一般的なWeb利用経験と基本的な安全対策の知識を持つ。個人情報の用途と設定結果を確かめたい。追加情報の利用を一律に禁止する制約はない。
- **baseline：Personaなし**。入力からPersonaを省き、期待事項の初期値は空。人間の平均的な利用者の実測モデルではない。

A/B/Cの端末状況は全て同じ「自分専用PCのブラウザー、必要な端末・アカウント利用可」。実ブラウザーと初期画面も全条件で同じ。初心者だけスマホ画面にしたり、慎重な人だけ許可ボタンを消したりしない。
知識・経験・期待・傾向・名前の複数項目が変わる全体Personaの比較であり、単一項目だけの因果効果の実験ではない。

## 同じサイトと目的

共通の目的は「予約のリマインダー通知を有効にし、有効になったことを確認してください」。同じ画面に使い方・用語説明、拡張アクセスでの即時有効化、情報利用範囲の詳細へのリンクがある。
拡張アクセスは時刻に加え架空の氏名・メールアドレス・予約履歴を使い、基本アクセスは予約時刻だけを使う。どちらも通知という目的を満たす。利用範囲を目的達成の正誤や自然さの点数にしない。

詳細画面では基本アクセスが既に選択されている。これは既存UIの挙動で、今回は変更しない。明示的なscope-basicクリック、初期選択をそのまま保存、以前の選択を再編集で持ち越す場合を分ける。quick-enable-extendedも編集中の選択をextendedへ変え、help・Back・disableでは初期化されない。保存された範囲だけから、意図的な最小化や意味理解を推定しない。
説明や詳細を開いた事実は分かるが、文章を読んだ時間・理解した内容を操作イベントだけで断定しない。

## 実装と固定条件

既存privacy fixture、AutoPage、Persona parser、native→assessment→action、unweighted user profile、台帳・replay・ビューアーを流用した。追加は薄いcohortと実行後の集計で、モデル処理・UI・候補のPersona別補正は変更しない。
親がcohort/入力/実行/統合、実装サブがoffline解析、別コンテキストの検証サブがUI・通常mock・実原本を確認する。

[プロトコル](../../experiments/virtual-beta/clear-personas.json)。baseline/A/B/C各4回で16枠、4位置を巡回して均等化するが無作為化ではない。最大6判断、18段階要求/試行、台帳割り当て36/試行・576全体、実段階上限288。試行300秒/native60秒/全体1時間、並列1、retry0、無効枠の置換0。
3件連続の信頼できるモデル不正で停止する。source・会計・安全・監査の不整合は直ちに停止。provider停止の実装は400/401/402/403/404/429の既存判定を継承する。5xxやtimeoutは基盤障害として無効に残し、ユーザー離脱へ読み替えない。プロトコルのprovider即時停止という一般表現は、この実装上の分類で解釈する。

親の23関連テストとbuild、独立の7UI経路・通常4actor mock・配送/初期入力/停止/原本表示を事前確認した。モックは実API0で、原本のapiCallsにはシミュレーション段階数が入る。実要求台帳と分ける。以前のリポジトリ全体npm test未合格を今回の成功で全体greenに置き換えない。

実行版はcommit fbc1a97上の未コミット差分。sourceHashは bdf060f57f3c3bc8bf1105682238efc12e21120754ef35b0901f24c3d90d67f2、190ファイル。[実行ソースZIP](clear-personas-source-bdf060f5.zip)に改行を含むバイト列とfreezeを保存する。公開時の統合commitと実行時の版を混同しない。

```powershell
Set-Location "C:/Users/Maekawa Ao/.codex/worktrees/virtual-beta/Ux_test"
node --import tsx runner/clear-persona-comparison.ts --prior-snapshot "C:/Users/Maekawa Ao/.codex/worktrees/virtual-beta/Ux_test/reports/clear-personas-2026-11-08/prior-raw.json" --env-file E:/ChatGPT/Ux_test/.env --out reports/clear-personas-2026-11-08/live-r1
node --import tsx runner/exploration-viewer.ts --batch reports/clear-personas-2026-11-08/live-r1 --out reports/clear-personas-2026-11-08/viewer --serve --watch --port 4178
node --import tsx --test --test-concurrency=1 tests/clear-persona-comparison.test.ts tests/persona-task-fixture.test.ts tests/persona-task-wiring.test.ts
npm run build
```

新規実行では未作成の出力名を使う。同じ出力への上書き・継ぎ足し再開は拒否する。prior snapshotはこのマシンの過去10,686ファイルの期待hashを維持したもので、新しいcloneに同じrawがあるとは仮定しない。認証値はEの.envから読むだけで、ログ・公開物へ含めない。以前の人間の操作内容はモデルへ送らず、保存API入力の直接再送も行わない。

## 実行結果

16枠すべてを実行し、16有効・無効0・未実行0、実API105要求。35判断、UI操作19、注視0。通知有効化と確認は全16件で成立したが、達成率を自然さや人間再現の点数にはしない。

- baseline：4/4回、直接「拡張アクセスで通知を有効にする」。詳細・ヘルプ0回。
- A初心者：4/4回、直接拡張アクセス。詳細・ヘルプ0回。
- B熟練者：4/4回、直接拡張アクセス。詳細・ヘルプ0回。
- C慎重な利用者：3/4回、利用範囲の詳細→初期選択basicのまま有効化。1/4回は直接拡張アクセス。ヘルプ0回。

全16件でscope-basic/extendedボタンの明示クリックは0回。Cのbasic3件は初期既定値の保存で、以前の選択の再利用ではなかった。基本範囲を理解して意図的に最小化した、とまではいわない。観測されたのは確認画面へ進む経路と、保存された範囲の違いである。

同じPersona内の経路はbaseline/A/B各1種類、Cは2種類だった。初回も2回目もCという同じ定義だが、2回目は直接拡張を有効化した。慎重Personaに必須の確認手順を強制する実装ではないことと、出力に揺れが残ることを両方示す。

[共有の初期モデル入力画像](clear-personas-frames/initial-model-33b03933aa826a6cad21d3779e586dade1bccc89813a2cd9e9cefffec1da7821.png)、[C1の詳細画面・既定basic](clear-personas-frames/c-details-default-9548f7807a8768f62808e359411506a197f7ca35f2344c6795450bce15ee0aea.png)、[C1のbasic保存後](clear-personas-frames/c-basic-result-890e28cae5dcb5e822ab800b2d29cb493f55d6744b32d068730a64b0ef61ff3d.png)、[C2の直接extendedの反例](clear-personas-frames/c-extended-counterexample-f084a27737bbd6ba73b7565f0832199ec066af4020ea5ec9eb1a8114aab8e41c.png)。[画像対応JSON](clear-personas-frames.json)に元run/step/stage/SHAを保持する。これらは実際にモデルへ渡して応答を受けた画像であり、終端監査を次入力へ置き換えない。説明用の例の選択は全16件の集計分母を変えない。

## 実原本の独立照合

[事前検証](clear-personas-independent-preflight.json)、[実ログ監査](clear-personas-independent-actual.json)、[実行監査の要約](clear-personas-independent-summary.json)、[Cの2経路の構造化出力](clear-personas-c-counterexample.json)、[画像・export・sourceの照合](clear-personas-independent-viewer.json)、[ブラウザー確認](clear-personas-viewer-browser.json)。いずれも追加モデルAPI0。旧人間記録の意味内容や認証ファイルは検証担当へ渡していない。

全35選択でモデルの提案・argmax・実操作が一致し、差し替え0だった。既存ui-conditionalの投影で20分布はnormalizedとfilteredが異なるが、Persona別の非単位重みは適用しない。105台帳は全て精算済み、予約残0。190sourceとプロトコル・Persona・初期画像/Persona以外のnative入力も照合した。

C1の最初のnativeは詳細リンクをinformation関係として記録し、C2は即時有効化をexecuteとして記録した。両者の最初の理由カテゴリはgoal、最後はconfirmation。これは短い構造化されたモデルの自己申告で、内部判断や人間の主観的自信の記録ではない。C2という反例を隠して、確認が必ず起こると結論しない。

## 現時点で分かったこと

この画面では、慎重なCに確認経路の違いが3/4件現れた。一方、初心者Aと熟練者Bの経路差は確認できなかった。全員がヘルプを開かなかったことは、画面内の説明を読まなかった・理解していた、のどちらの証拠でもない。

Cには条件内の揺れと初期値の影響がある。知識・経験・期待等を同時に変えた全体Personaなので、どの項目だけが効いたかの因果分離もしていない。明示制約の前回対照と混ぜて人間らしさの改善率を計算しない。今後は知識や経験単独の対照と、対応する対象利用者の記録が必要である。

実行原本と画面一覧は [localhost:4178](http://127.0.0.1:4178/)。全16件の操作・理由・分布・原本参照は[解析JSON](clear-personas-results.json)、試行別の経路は[CSV](clear-personas-runs.csv)へ保存した。

## 分布と実操作の違い

初手の正規化されたモデル分布の平均では、Aは直接有効化0.85・説明0.075・詳細0.05・読み直し0.025だった。Bは直接有効化0.985・詳細0.015。Aの説明候補の確率は高めだったが、各回とも最大は直接有効化で、argmax方式での実操作はA/Bとも同じだった。この確率を人間の行動頻度や主観的自信とは扱わない。

同じ初期画像・Personaを除くnative入力・source/configと候補対応を満たした16件で、条件内の平均TVはbaseline 0.0083、A 0.0450、B 0.0100、C 0.1183（各6組）。条件間はbaseline–A 0.1350、baseline–B 0.0081、baseline–C 0.5319、A–B 0.1350、A–C 0.4925、B–C 0.5300（各16組）。正規化モデル分布の記述統計で、検定結果ではない。画像入力後に生成される解釈と後段の判断入力まで同一ではなく、単一属性の因果効果を示さない。

最初の理由カテゴリは全4条件ともgoalが4/4で、カテゴリ差はなかった。実操作、モデル分布、短い自己申告の理由を別々に比較する。Cの確認経路の差は観測できたが、初心者の理解負荷や熟練者の知識利用まで実証したことにはならない。

## 解析器の修正と再検証

独立検証で、保存済みnativeの条件状態だけを改ざんし原本hashを更新すると、旧解析器が有効として数えるP2を再現した。既存の完全replayは同じデータをVISUAL_HYPOTHESES_RECORD_MISMATCHで拒否した。解析器も全完了行で完全replayを必須にし、元の応答・要求と受理済み状態を再照合するよう修正した。実ログは修正前から全16件の完全replayを通り、修正による結果や105要求の数値変更はない。再実験や追加API要求は0。

[修正記録](clear-personas-analysis-fix.json)、[独立再検証](clear-personas-analysis-review.json)。[親の最終関連回帰とbuild](clear-personas-parent-verification.json)は30/30成功（skip 0）、型検査・buildも成功。解析15テストと独立の改ざん再現・型検査・全16原本CLIも成功し、6組の分布比較は修正前および独立手計算と一致した。15件の解析テストは、通常runnerのAPIゼロmockと、[持ち運べる保存fixture](../../tests/fixtures/clear-persona-replay/README.md)を使う。保存fixtureは架空UIに対する4件の完了モデル出力で、人間記録ではない。認証・HTTPヘッダー・ブラウザーtrace ZIPは含めない。新規cloneでもローカルreportsを前提にせず回帰検査できる。

```powershell
node --import tsx --test --test-concurrency=1 tests/clear-persona-comparison.test.ts tests/clear-persona-analysis.test.ts tests/persona-task-fixture.test.ts tests/persona-task-wiring.test.ts
npm run build
node --import tsx scripts/analyze-clear-personas.ts --batch reports/clear-personas-2026-11-08/live-r1 --out reports/clear-personas-2026-11-08/analysis-next
```

最後のコマンドは、このマシンに保持した全16原本を読むオフライン解析で、新規API要求はない。新規cloneでは上のテストを実行し、公開JSON/CSVで集計を確認できる。rawの全16試行とtraceはローカルreportsに残し、公開fixtureはそのうち最初の各条件1件に限定する。

次のP1は、初心者と熟練者で意味理解が必要になる知識項目を一つだけ変えた対照、既定選択への追随と明示選択の分離である。モデル分布からサンプリングする対照はargmaxと別条件で固定してから比較する。人間への一致度は対象ユーザー集団の実測記録が得られるまで未検証。複雑な実サイトの長い探索やnative出力上限の問題も、この短いUIで解決済みとはしない。
