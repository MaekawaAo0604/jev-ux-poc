# 二段階判断を有効にした経路切替の検証 — 2026-10-28

既存の二段階判断を有効にしても、今回の完走1試行では経路の切替は起きなかった。Jevは「各種設定 → お知らせ → ホーム」の3画面を4回循環し、12判断・24要求で上限終了、通知停止は未達だった。本人の操作や感想は入力していない。

評価は行動入力と候補説明へ実際に渡っていた。12回とも「情報不足」、生の目的評価は12回とも「未達」だったが、ホームへ戻った後も同じ入口を「目的に進む」と再評価して選び続けた。二段階化の接続漏れや通信障害と、経験を使った探索の切替不足を分けて確認できた。人間の探索を再現できたとは扱わない。

## 条件と版

[前回のbaseline](human-comparison.md)と同じ通常local:bad、通知停止Charter、全viewport画像のみ、1280×900、ja-JP、Asia/Tokyo、画像記憶3、Personaなし、goal/argmax、seed20261028、UI15・注視3・12判断・180秒を使った。判断ごとに評価と行動の2要求を使うためAPI上限を24にし、既存の `deliberation:{enabled:true,memoryCapacity:3,candidateEffects:true}` を追加した。行動候補の除外・正解への誘導・繰り返し禁止・doneの強制書換えは加えていない。

`runner/human-jev-profiles.ts` にbaseline/deliberationの配分だけを分離し、既存runnerへ `--mode deliberation` を接続した。assessment/actionは別runKeyで各12要求、phase全体24を超えない。別のUXレビューはこのモードでは送信しない。基準条件と評価方法は実行前に [deliberation-protocol.json](../../experiments/virtual-beta/human-comparison/deliberation-protocol.json) へ固定した。

初回実行版は `6981925`、転送修正版は `68f4455ef2dbacba47d22c2a8cbb1977c0372b0f`。後者のsource hashは `bb6892e00f44e9f8c80e1f329c0d42f1b6de41977085cd35636866c5ff3b2b4e`。UI・画像変換・UserState・deliberation評価/候補提示・samplerの実装はこの修正で変更していない。

人間のnative画面は番号がなく、初期の画素差4.35%も残る。一方、今回の各初期の番号なし準備画像と、比較対象の旧baselineの準備画像は同一画素だった。人間との厳密な知覚比較ではなく、同じ課題で既存機能を有効化したときの能力確認である。モデルの生成seedは制御できず、1回ずつの結果から二段階化の因果効果・一般的な成功率は推定しない。

## 初回の基盤障害と修正

初回は7要求を使用し、評価3回と行動3回は成功した。「各種設定 → お知らせ → マイページへ戻る」の後、4回目の評価要求がHTTP400/providerCode=`max_tokens_exceeded`で停止した。実クリック3回、終了理由API_ERROR、比較用成果物はinvalid。この時点では帰還後の切替を判定していない。

原因コードを根拠に、既にclientの画像文脈回復で使っていた `TypeSafe-Danger-Zone-Long-Context` を、明示時は初回から指定できるよう接続した。`jev/client.ts` の任意option、`runner/virtual-beta-evaluator.ts` の引数、wrapperの `--long-context` だけが対象。既定では無効のまま。最大attempts=1を保ち、予算外の自動retryはしない。画像・記憶・質問本文を削減していない。

単位テストと独立テストのREDを確認してから修正し、通常/指定時のstate・questions・imagesのbody完全一致、両段階のheader、1要求1計上、失敗時の安全な記録をGREEN確認した。修正後は新しいcontextから通常runnerを再実行した。保存された入力を直接再送していない。初回の失敗を消さず、[修正条件](../../experiments/virtual-beta/human-comparison/deliberation-transport-repair.json) を別保存した。

## 修正後の実測

全24要求が成功し、評価12＋行動12、各attempt1、全traceにlongContext=true、エラー0だった。12クリック・注視0、主観的doneなし、独立の通知停止判定false、終了理由DECISION_LIMIT、成果物valid=true。ループする行動は観測されたが、LOOPという終了判定が発火したわけではない。

ホームへ帰還した後の判断4・7・10でも「その他」のe5は画像と候補に残っていた。モデルは次のように選んだ。

- 判断4：各種設定e4の生確率0.94、その他e5は0.01。
- 判断7：e4は0.95、e5は0.02。
- 判断10：e4は0.94、e5は0.01。

3回とも評価はe4=`advances`、e5=`unknown`。その評価が当該候補説明にも入り、argmaxがe4を選んで実クリックした。安全フィルタによる候補除外や別行動への差替えはない。丸めによる総和0.99等は既存の正規化で処理し、生分布・正規化・選択を保存している。これは人間の自信や行動頻度ではない。

目的評価の生回答は12回ともunsatisfiedだった。うち11回は根拠画像がnoneなので、既存の受入規則によりuncertainへ補正し、`NO_ADMITTED_EVIDENCE`を保存した。受理後の目的状態はunsatisfied1回・uncertain11回。画像参照があること自体も意味の正しさを保証しない。今回の未達を隠すために根拠規則を緩めていない。

## 確認できた不足

観測事実は、情報不足の評価が届いても、試した入口を継続して有望と判断し、別カテゴリへ移らなかったことである。画像記憶3件の中には直近の設定画面・おすすめ画面・戻ったホームがあるが、状態のoperation outcomeは実行済みを表すperformedで、目的に近づいたかを表さない。

現行の評価は各時点のknowledge/goal/effectsの自己申告で、操作前の予測と操作後の観察を対応付けて、失敗した見立てを更新する部品ではない。これはコードで確認できる構造上の不足であり、それだけが反復の原因だと断定したわけではない。画像記憶容量・argmax・質問方式のどれが決定的かは、この実験では分離していない。

次の対象は、出発画面・選んだ対象・予想結果・実観察を結び付けた経験状態である。対象IDは画面ごとに意味が違うため、e4だけを履歴キーにしない。モデルが実際に見た内容と自分の評価から作り、独立oracle・DOM・人間の感想を学習の答えとして流し込まない。保持上限と根拠の扱いを画像bufferから区別して定義する必要がある。

受入条件は、寄り道後に代替入口を選べることに加え、再訪が必要な課題では再訪できること。単に訪問済み候補を禁止する機能や、直接の正解到達を「行き詰まりからの切替成功」と数える実装にはしない。この経験状態は今回はまだ実装・性能確認していない。

## 検証と予算

新しいprofile/接続はRED→GREEN、初回前に25件成功・build/型チェック成功。転送修正後は既存文脈回復も含む44件が成功（0失敗・0skip、95,730ms）、build/型チェック成功。独立preflightの4件に加え、長文脈接続の1件も同じRED→GREENで確認した。

独立の実測監査はround1/round2を分けて行い、版・source hash・画像・入力hash・評価の受渡し・生分布と実選択・停止理由・台帳を照合した。修正後の24要求は全longContext/attempt1で、66画像参照・13,824,000画素、12評価と12実行が一致した。帰還後の3回も候補e5が残っていることを確認した。旧3台帳と初回7要求の台帳は第2回実行前のhashと不変だった。

今回の合計は初回7＋再実行24＝31要求、自己上限48以内。初回枠の未使用17要求は履歴として残した。過去の13/13、31/32、47/48台帳は変更していない。ユーザーの指示に従い、同じJev検証のAPI利用を以後都度確認しない運用は [api-usage-policy.md](api-usage-policy.md) に記録した。

## 実行・成果物

```powershell
# APIなし：配線確認。スクリプトのdoneは性能の証拠ではない
node --import tsx runner/human-jev-experiment.ts --mode deliberation --mock --out reports/deliberation-mock-new

# APIなし：今回の関連回帰
node --import tsx --test --test-concurrency=1 tests/human-jev-experiment.test.ts tests/human-jev-profiles.test.ts tests/human-jev-review.test.ts tests/human-jev-independent.test.ts tests/human-jev-deliberation-independent.test.ts tests/evaluator-long-context.test.ts tests/image-context-recovery.test.ts tests/completion-frames.test.ts tests/virtual-beta-evaluator.test.ts

# APIなし：保存した評価・画像・分布の監査
npm run replay:virtual-beta -- reports/human-deliberation-2026-10-28/live-round2/exploration
```

実施済みの実モデル実行は以下。出力先や台帳は使用済みのため、削除・リセットして再利用しない。

```powershell
node --import tsx runner/human-jev-experiment.ts --mode deliberation --phase-budget reports/human-deliberation-2026-10-28/api-budget.json --env-file E:/ChatGPT/Ux_test/.env --out reports/human-deliberation-2026-10-28/live-round1
node --import tsx runner/human-jev-experiment.ts --mode deliberation --long-context --phase-budget reports/human-deliberation-2026-10-28/api-budget-round2.json --env-file E:/ChatGPT/Ux_test/.env --out reports/human-deliberation-2026-10-28/live-round2
```

匿名の要約は [deliberation-recovery-results.json](deliberation-recovery-results.json)。PNG・全応答・trace・台帳・独立監査はローカルの `reports/human-deliberation-2026-10-28/` に保持している。基盤修正は実モデルで確認できたが、経路切替と人間の再現という能力は未達である。
