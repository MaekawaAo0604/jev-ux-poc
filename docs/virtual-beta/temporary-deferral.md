# 失敗した見立ての一時保留 — 2026-10-28

## 方策

「一度だめだった入口はいったん保留し、他のそれっぽい入口を先に試し、他もだめなら戻る」というユーザーの仮説を設定可能な方策として実装した。前回の [経験状態](experience-recovery.md) と同じ画像・評価・分布を使い、選択前に明示した正の重みを掛ける。Jevの学習済みモデルを変えたものではなく、人間に較正した方策でもない。

保留を学習する条件は、観察画像へ実際に戻った連続経路が2操作以上あり、最初が実クリックで、受理済みの根拠付き「進展なし・制約違反・予想不支持」のいずれかを含み、根拠付きの正の進展を含まず、現在の主観的目的状態も達成ではないこと。帰還やunknownだけ、通常の経由移動、情報取得後の有用な再訪を一律に失敗とは扱わない。

現在のクリック候補で、モデルの正規化確率が0.01以上、予想効果がconflictsではないものを、今回の「それっぽい」候補とした。これは未検証の工学的な定義で、人間の関連性判断や頻度ではない。未保留の有望候補が残っているときだけ、同じ観察画像・同じ候補IDの保留入口に重み0.01を掛ける。重みは0にしない。有望候補がすべて保留になれば重み1へ戻す。done/stuck/戻る/スクロール/注視などは重み1、モデル確率0の候補へ勝手に確率を加えない。

`deferral:{enabled:true,capacity:8,weight:0.01,minAlternativeProbability:0.01}` で有効化する。保留記憶は最大8件で、画像記憶3・経験8とは独立する。画像や対象が変われば同じIDだけでは適用しない。既存モードでは無効のまま。

## 実装と観測境界

実装サブが `jev/virtual-beta/deferral*.ts` とunit test、親が共通config/contracts/selection、runner/core/profile/replayと統合test、新コンテキストの独立サブが受入確認を担当した。基準版dfa2360、実装凍結版5abeef326a4f20bb9962aad6a3f34e7b5c5d851f。

保留状態はrunnerの方策部品だけが保持し、モデル入力に注入しない。監査DOM、oracle、人間の操作や感想を使わず、既存のJevが実際に見た観察と、そのモデル自身の受理済み評価から作る。

保存するもの：

- `step.deferral.state`：出発画像/候補、帰還元・先、非進展と判断した出典。
- `step.deferral.decision`：有望候補、保留候補、適用候補、継続保留/候補枯渇による解除などの理由、全候補の重み。
- `selection.raw/normalized`：Jevの生分布と正規化。`selection.adjustments`：従来の安全上の除外。
- `selection.policy.before/weights/weightedTotal`：安全処理後・保留補正前の分布、正の重み、再正規化の分母。`selection.filtered`：実選択に使った最終分布。
- `selection.modelChoice/selected` と実action/outcome：モデル提案、方策後の選択、実操作を区別。モデルの理由カテゴリは元の提案に対する自己申告のまま。

同じ保存分布とseedから選択を再現する。replayは経験から保留状態と重みも再構築して一致確認し、保留記録の差替えを検出する。モデル候補を削除したり、正解の候補IDや経路を与えたりしていない。

## 実行

```powershell
# APIなし。default mockはdoneを返す疎通で、方策の性能の証拠ではない
node --import tsx runner/human-jev-experiment.ts --mode experience-defer --mock --out reports/deferral-mock-new

# 新機能と統合。成功するscriptは自律探索の証拠にしない
node --import tsx --test --test-concurrency=1 tests/virtual-beta-deferral.test.ts tests/temporary-deferral-selection.test.ts tests/temporary-deferral-integration.test.ts tests/temporary-deferral-independent.test.ts

# 保存物の検査。APIを再送しない
npm run replay:virtual-beta -- reports/temporary-deferral-2026-10-28/live-policy/exploration
```

比較条件は [temporary-deferral-protocol.json](../../experiments/virtual-beta/human-comparison/temporary-deferral-protocol.json) に実行前固定。対照 `--mode experience-basis`、方策 `--mode experience-defer`。同じ通常bad UI、通知停止Charter、Personaなし、全viewport画像のみ、argmax/seed20261028、毎回fresh browser context。各12判断/24要求/180秒、合計48要求、並列1、追加UX要求なし。新台帳を使い、既存8台帳はhashで保全する。

## 実モデルで確認した結果

凍結した製品版5abeef3で各条件1回を順に実行し、計38/48要求（対照24、保留14）を使用した。全要求1attemptで成功、長文脈転送あり、追加UX抽出なし。既存8台帳は実行前後のhashが一致した。両試行の初期未操作画像SHA-256も一致した。個別設定・経路・補正は [temporary-deferral-results.json](temporary-deferral-results.json)、独立受入は [temporary-deferral-independent-review.md](temporary-deferral-independent-review.md)。

- 対照：各種設定→お知らせ→マイページを4周。12判断・12 UI操作・注視0、客観達成false、主観完了false、DECISION_LIMIT。API時間30.04秒、総経過34.14秒。
- 保留：各種設定→お知らせ→マイページ→その他→お知らせの管理→メール通知を停止する→done。7判断・6 UI操作・注視0、客観達成true、主観完了true、SUBJECTIVE_DONE。API時間15.33秒、総経過17.89秒。これらの時間を人間の迷い時間とは扱わない。

4判断目の同じ保存分布では、モデルは各種設定e4を提案し、補正前argmaxもe4（0.91）。帰還経路中のo3に根拠付きneutral/not_supportedがあり、e4だけを0.01倍した。最終分布はe4=0.091826、その他e5=0.403633、scroll_down=0.403633、stuck=0.100908。e5とスクロールが同率となり、既存argmaxのキー昇順tie-breakでe5が選択され、実クリック後の次観察URLがlocal:/bad/#otherになった。その先で通知停止oracleもtrueになった。実選択変更はこの1判断だけである。

したがって今回確認できたのは、根拠付きで非進展の経路を保留する方策が実選択を変え、実際に別経路から目的へ達した1例である。モデル自身は元の入口を再提案しており、記憶を理解して自律的に再計画できるようになったとは言えない。同率候補や別のモデル分布では違う結果になり得る。全候補保留後の解除・実再訪は独立したscripted browser testで確認し、今回の実モデル成功経路では発生していない。

## 検証と成果物

関連する旧回帰117、新実装22、別コンテキストの独立6、計145件が成功（0失敗・0skip）。全リポジトリの全件を今回再実行した数ではない。型チェックとbuildも成功。旧モードの実行、実入力の境界、状態分離、不正分布、安全除外、seed再現、保留解除、同一経路でのgateway本文一致、保存記録改変の検出を確認した。実モデル2試行の保存入力・画像・分布のoffline replayも成功した。replayはAPIやUIを再実行しない。

初回の独立fixtureではブラウザーの戻る後に画像が一致せず、保留が効かなかった。再調査で、マウスが残った各種設定タイルのhover描画に31,829画素の差があると確認した。製品の画像を置換せず、同じ画像へ戻るfixtureを実ホームリンクに修正して再検証した。製品側の厳密画像一致という制約は残す。

ローカルの全画面・モデル入力画像・trace・result・台帳は reports/temporary-deferral-2026-10-28/live-control と live-policy に保存。公開するのは匿名要約・受入記録・コード・テストで、人間原記録、秘密情報、raw reportsはコミットしない。

## 新しい比較を実行するコマンド

以下は既存台帳を再利用せず、新しい最大48要求の比較を作る。この環境の認証ファイルパスを使用する。出力名は毎回一意で、失敗要求も予算へ算入する。

```powershell
$phaseOut = 'reports/deferral-repeat-' + [guid]::NewGuid().ToString('N')
New-Item -ItemType Directory -Path $phaseOut | Out-Null
foreach ($arm in @('control','policy')) {
  @{ schemaVersion=1; status='APPROVED'; phase=$phaseOut; newMaximum=24; perRunMaximum=12; used=0; attempts=@() } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath "$phaseOut/api-budget-$arm.json" -Encoding utf8NoBOM
}
node --import tsx runner/human-jev-experiment.ts --mode experience-basis --long-context --phase-budget "$phaseOut/api-budget-control.json" --env-file E:/ChatGPT/Ux_test/.env --out "$phaseOut/live-control"
node --import tsx runner/human-jev-experiment.ts --mode experience-defer --long-context --phase-budget "$phaseOut/api-budget-policy.json" --env-file E:/ChatGPT/Ux_test/.env --out "$phaseOut/live-policy"
npm run replay:virtual-beta -- "$phaseOut/live-control/exploration"
npm run replay:virtual-beta -- "$phaseOut/live-policy/exploration"
```

PowerShell 7のutf8NoBOMを使う。別環境ではenv-fileだけ既存の認証設定ファイルへ変える。再実験はここでは追加実行していない。

## 解釈の限界

重みと有望さの閾値は未較正で、人間の行動頻度を表さない。1条件1試行の非ランダム比較で一般的な改善率や因果効果を主張しない。同じ保存分布の補正前後の選択比較はその判断に限られ、方策なしの全将来経路を再現するものではない。

同じ画面でもスクロールや描画変化で画像hashが変われば、既存の保留と対応しないことがある。逆に根拠付きの自己評価でも意味の誤りは残り得る。有望候補が尽きたという解除は今回の閾値で有望な候補に限り、画面の全項目を調べ尽くした意味ではない。
