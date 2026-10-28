# 予算台帳の保存失敗診断（2026-10-29）

予算台帳の保存失敗を、送信前後の境界とファイル操作の段階で区別できるようにした。
基準は `92e0cf8`。
製品スナップショットの sourceHash は `1970c415a7c07a8cecf1e0ff258f6f4006109e0e7ff1a1d741b0da18700f6ca6`。

前回の独立検証では、予約時と送信後の保存時に失敗し、完全な一時 JSON が残った。
しかし段階と OS コードが消え、write と rename のどちらが失敗したか確定できなかった。
過去の間欠障害の OS 原因は今も未特定である。

## 実装

`runner/budget-persistence.ts` は排他的な一時ファイル作成から台帳の置換までを 1 回ずつ実行する。
失敗段階を `write-temp` / `replace-ledger`、OS コードを許可リストに限定して保存し、未知のコードは `UNKNOWN` とする。
原エラーの message、path、stack、cause を診断へコピーしない。
失敗した一時ファイルは調査のため保持する。
再試行は追加していない。

予約保存の失敗は `BUDGET_ADMISSION_ERROR`、実送信後の保存失敗は `BUDGET_SETTLEMENT_AFTER_REQUEST` として区別する。
後者は `requestOutcome=response|error` を記録する。
両方とも基盤障害として `API_ERROR` / `validForComparison=false` になり、ユーザーの迷いや離脱に数えない。
API 要求数は予約失敗 0、送信後失敗 1 を維持する。
送信前の期限切れに伴う決済失敗も 0 のままである。

JSON 化が失敗する値、または JSON 化の結果が undefined になる root 値は I/O より前に拒否する。
後者を未検査にすると原台帳を文字列 `undefined` に置換する不具合があり、RED を取得して修正した。
正しい JSON 値の許容と台帳 schema の検査は別の責務として維持する。

Persona / Charter、観察画像、容量制限された記憶、分布と行動選択は変更していない。
新規の実モデル API 要求は 0。
今回の診断テストでは人間再現の性能を評価していない。

## 検証

ローカルの実 FS と fetch stub を使って検証した。
実モデルを使った結果ではない。

- helper 42 件と既存予算 3 件：45/45。`reports/budget-diagnostics-2026-10-29/final-helper-budget.log`
- human wrapper の予約、送信成功後、HTTP 失敗後、送信前期限切れ、および実 FS 置換失敗：5/5。`wrapper-green.log`
- 関連回帰初回：26 件中 24 件成功。2 件は初期 goto の networkidle / 10 秒 timeout で失敗した。API は 0、探索前の障害だった。`regression.log`
- 失敗した 2 ファイルを直列再実行：7/7。`regression-failed-sequential.log`。並列負荷との因果は未確定。初回 trace、result、final 画像も `navigation-timeouts/` に保全した。
- 型検査と Vite build：成功。`build-final.log`、`parent-types-with-independent.log`

新しいコンテキストの独立担当は、別のテスト 16 件を実行し、16/16 が成功した。
標準 CLI と human action 段階それぞれで、予約失敗、送信前期限切れ、応答後の保存失敗、HTTP エラー後の保存失敗を検査した。
human action のテストでは先行する評価要求 1 件を含め、失敗時点の累計が送信前 1、送信後 2 であることも検査した。
正常な 4 条件は mock で全条件が目的達成し、実 HTTP は 0 だった。
これは既知の fixture script による回帰確認であり、自律探索の性能を示す結果ではない。
[独立検証記録](budget-diagnostics-independent-review.md) に証拠と未検証範囲を記載する。

既存 `deferral-admission-integration.test.ts` は、検証対象の操作後に存在しない候補を選んでいた script を done へ進めるよう修正した。
対象操作と解除条件の検査は維持し、全終了の `SUBJECTIVE_DONE` と旧条件の最終目的 false を追加検査した。

## 実行方法

リポジトリのルートで実行する。
テストは新規の出力先を作り、実 API を呼ばない。

```powershell
node --import tsx --test --test-concurrency=1 tests/budget-persistence.test.ts tests/virtual-beta-budget.test.ts tests/budget-diagnostics-integration.test.ts tests/budget-diagnostics-independent.test.ts
node --import tsx --test --test-concurrency=1 tests/virtual-beta-phase-cli.test.ts tests/virtual-beta-phase2-independent.test.ts tests/human-jev-independent.test.ts tests/human-jev-deliberation-independent.test.ts tests/virtual-beta-runner.test.ts tests/deferral-admission-integration.test.ts
npm run build
```

## 残る改善

保存障害が再発した場合、今回の段階、OS コード、原本、一時ファイルを照合する。
初期 navigation timeout は別の観察基盤の問題として追跡する。
原因の証拠なしに自動再試行や timeout 延長は追加しない。

探索側には、理由再評価が「変わった」と判断しながら根拠を none にする不整合、関係のある画面でも hover / scroll で画像同一性を失う問題、preview と保存済み状態の区別が残る。
次は再評価の判断と根拠を組にして扱う変更を、既存の解除ガードを維持して比較する。
正解経路の注入や一律再訪禁止は行わない。
