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
