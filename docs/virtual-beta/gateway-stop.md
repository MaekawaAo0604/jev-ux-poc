# HTTP 402時の比較バッチ停止

## 問題と修正

Goal探索の実比較は ee8fe221 で開始したが、HTTP402後にも次の試行へ進んだ。親が停止するまで4件のERROR要求となり、強制終了でroot manifestのfinallyが完了せず、集約used0/RUNNINGが残った。個別の永続台帳は38=34OK+4ERRORを正しく保持しており、原本を書き換えず別の中断監査で再計算した。

`runner/deferral-reason-experiment.ts` に、最終終了理由API_ERRORかつ最終stepのerrorがHTTP_ERROR/statusCode402のとき、次試行へ進まない処理を追加した。statusは `GATEWAY_HTTP_402`。実code/statusCode、step、assessment/action、runId、resultPathだけを `gatewayFailure` へ記録する。応答本文、message、cause、認証値は保存しない。HTTP402の外部原因を資金切れなどと断定しない。

失敗した試行、画像、raw error、replay、summaryを保存してからループを終了し、既存finallyで使用数・旧台帳不変検査を確定する。失敗を成功やユーザー離脱へ変えない。HTTP500等を勝手に同じ停止条件へ拡張しない。強制killやあらゆる中断でfinallyを保証する変更ではなく、既知のHTTP402を通常の停止処理へ乗せる修正である。中断後の使用数は個別永続台帳を正とする。

## 版と検証

修正commit `ab71a1508420c4bfc09105e66f62a608fb75c578`、sourceHash `1b8c483b2b89c4f9fea113d2529d902ace425ec1a2a75e207109affa81b084c9`。実モデルのproducer ee8fe221 から、製品差分は比較runnerへの12行追加だけ。GoalSearch/core/replay/UI/画像/分布/正常経路は変更していない。実モデルの部分結果を新しい版で実行したと書き換えない。

実装担当はlimit2の通常runnerと実Chromium、完全に差し替えたgateway fetch応答、dummy credentialで、旧処理2要求継続のREDと新処理1要求停止のGREENを取得した。3テスト、関連pure55、型検査は成功。mock:falseは永続台帳経路を通すためで、実際の外部要求は0。偽のHTTP応答を実モデルの実行結果と扱わない。

独立検証は固定版ab71a150で完了した。評価段402は1要求、行動段402は2要求で停止し、500の対照は2試行まで継続した。偽要求は計5件、実APIは0件。初回は既存の比較状態名missing-conditionをunpairedと誤記した検証コードが2件失敗したため、その名称のみ修正し、保存した同じ結果を追加要求なしで再検証して5/5件成功した。失敗判定・元の記録・製品コードは緩めていない。独立buildも成功し、旧raw214ファイルと94台帳は不変だった。

[独立検証の結果](gateway-stop-independent-review.json) に固定版・各段の要求数・中断した実比較との区別を保存した。通常runnerとstubでの運用検証であり、実サービスの402解消や探索性能改善を確認した結果ではない。

```powershell
npx tsx --test --test-concurrency=1 tests/gateway-batch-stop.test.ts
node --import tsx tests/gateway-batch-stop-independent.test.ts
npx tsc --noEmit
npm run build
```

HTTP402解消前は実モデルを再実行しない。復旧後は [goal-search.md](goal-search.md) のコマンドを未使用の出力先で実施する。API利用の追加承認は不要。中断した原台帳をリセットしたり、失敗を消して成功率へ集計したりしない。

独立検証コードは通常実行時の製品版を固定し、任意の --pin-revision / --pin-source-hash を受け付ける。--offline-root では保存物の元producerを保持し、現行製品の全ファイルhash一致を要求した上で、文書・テストだけのHEAD差を許容する。過去資料が未配置の場合にskipするのは関連する履歴監査だけで、402の2段と500対照の主要検証はskipしない。可搬化後も元artifactを使った5/5件の再検証、型検査が成功し、追加のfake・実API要求は0だった（independent-portability-offline.log）。

## 実サービスでの再確認（2026-10-29）

最後のHTTP402応答（UTC2026-10-28 20:01:58）から約1時間後、2026-10-28T21:05:59.211Zに未使用の出力先で通常のgoal-search比較を一度だけ再開した。実行版は0dba7490a18bda81ff7b441e329202cde45a41bb、製品hash1b8c483b2b89c4f9fea113d2529d902ace425ec1a2a75e207109affa81b084c9。上限は12試行288要求・並列1・要求ごと再試行なし。旧入力の直接再送や人の操作記録の入力はない。

最初の試行notifications-r1-oldの最初の評価要求に実HTTP402が返り、1要求・1試行でGATEWAY_HTTP_402として正常停止した。root集約used1とERROR台帳1件が一致し、未決済RESERVED0、残存lock0、次試行の台帳は未作成。resultはAPI_ERROR/UI操作0/validForComparison=falseで、主観的完了や離脱・ユーザーの探索失敗へ置き換えていない。親のreplayは評価応答0・行動0・画像2の整合を検証し、trace ZIPのCRCも成功した。

この結果は停止・永続会計の実サービス確認であり、モデルからの正常応答や探索の改善を確認したものではない。有効な比較ペアは0。復旧は未確認で、HTTP402の背後の原因は断定しない。以後の実API要求は停止する。

原本は reports/goal-search-recheck-2026-10-29/live/、親の記録は同ディレクトリの外のparent-replay.log。[独立監査結果](gateway-recheck-results.json) に、source前後一致、旧215・新raw16ファイルのhash不変、ERROR1の確定、次試行不在、trace実click/scroll0、replay成功を保存した。rootの既存performanceEvidence=trueはreal実行モードを表す値で、正常なモデル応答や有効な比較結果があることを表さない。独立報告では正常応答0・有効trial0・有効pair0を明記した。全12比較・分類表現の対照・探索切り替えの実確認は未完了のままである。

## 復旧後の再開

GoalSearch全12比較、構文/記憶条件の対照、探索切り替えの効果は未完了。保存済み入力の直接再送や、失敗を消した成功率集計は行わない。これ以上の実API要求は、外部gatewayの復旧を確認するまで止める。API利用の再承認は不要だが、サービス側の状態変更が必要である。原因や請求状態の確認を代行した事実はない。

```powershell
# gateway復旧後、必ず未使用の出力先で通常runnerを開始
node --import tsx runner/deferral-reason-experiment.ts --comparison goal-search --env-file .env --out reports/goal-search-after-recovery/live
```
