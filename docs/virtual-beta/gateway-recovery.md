# 復旧連絡後のGateway診断（2026-10-29）

復旧連絡を受け、未使用の出力先で通常のgoal-search比較を再開した。実行版6cb8c277e410556435006fc57a2f8a451e06ebc5、製品hash1b8c483b2b89c4f9fea113d2529d902ace425ec1a2a75e207109affa81b084c9。12試行・最大288要求・並列1・各要求再試行なしを上限とした。JST10:03:21の初回評価要求がHTTP402となり、1要求で正常停止した。

## 観測結果

保存先は reports/goal-search-recovered-2026-10-29/live/。終了statusはGATEWAY_HTTP_402、使用数1/ERROR1/未決済RESERVED0。次試行・次台帳は作成していない。resultはAPI_ERROR、UI操作0、正常モデル応答0、validForComparison=false。親replayは評価0・行動0・画像2の保存整合を確認した。有効比較ペアは0で、探索性能の結果として数えない。

認証元は値を表示せずに確認した。継承環境のAI_GATEWAY_API_KEYは存在せず、指定したE:/ChatGPT/Ux_test/.envにはキーがあり、通常runnerではこの明示ファイルが読み込まれる。古い継承キーによる上書きは観測されなかった。

同じ明示ファイルのキーで、公式の読み取り専用APIを調べた。モデル要求は追加せず、metadata GETは計3回（残高1、利用可否2）。残高額・累積金額・キー値・アカウントID・生の本文は保存しない。

- GET /v1/creditsはHTTP200、balanceState=positive。
- GET /v1/models?include_availabilityはHTTP200、HTTPのrequest_context_availabilityはunavailable、reasonはquota_exceeded。
- typesafe-ai/jevとtypesafe-ai/jev-1.14.0のmodel_eligibilityはeligible。

最初の利用可否確認では限定した既知理由リスト外をREDACTし、2回目は公式schemaのmachine-readable reasonに限定して小文字英字とunderscore・64文字以内・認証値と異なることを検査して記録した。自由文messageや入力・headerは記録していない。

## 解釈と必要な対応

今回の観測では残高は正で、モデルはcatalog上eligibleだが、HTTP要求がquota_exceededで拒否される。残高復旧と要求の利用許可は別である。[公式REST仕様](https://vercel.com/docs/ai-gateway/sdks-and-apis/rest-api)では、eligibleに加えてrequest_context_availabilityがavailableであることを利用条件としている。

[公式のBudgets仕様](https://vercel.com/docs/ai-gateway/observability-and-spend/budgets)では、チーム・APIキー・ユーザーの予算が重なって適用される。APIキーの支出はproject予算に帰属しない。今回はどのscopeの上限かは特定していない。過去の全HTTP402も同じ原因だったとは結論しない。

ユーザーへ、同じキー・所属ユーザー・チームの上限確認を依頼した。API利用の再承認ではない。残高追加、budget変更、別キーへの切り替え、課金設定の変更は行っていない。制限解除の確認後、保存入力を再送せず、別の未使用ディレクトリで通常比較を再開する。

[TypeSafe互換APIの公式仕様](https://vercel.com/docs/ai-gateway/sdks-and-apis/typesafe)は、現在の/typesafe経路もAI Gateway認証・課金を使うと説明している。別providerの残高がこの経路へ自動的に適用されるとは扱わない。モデルや経路を変えて制限を迂回していない。

## 未完了

全12試行、Goal表現/記憶の対照、探索切り替えと必要再訪の改善効果は未完了。今回の応答は実モデルの意味判断・人間への一致を検証する証拠ではない。最初の復旧確認について独立監査を完了した。製品122ファイル、旧原本231件、新原本16件のhash不変、1要求での停止、台帳の未決済0、replay整合を確認した。監査担当による追加API・UI操作は0。metadataの値は保存した診断の照合であり、監査担当がアカウントへ再問い合わせしたものではない。

## チーム予算変更後の再開

ユーザー提供画面で、キー個別予算は無効だがチーム予算が上限に達している表示を確認した。ユーザーがチーム予算を変更したと連絡後、同じ認証元から読み取り専用の利用可否を1回確認した。2026-10-29T01:49:20.269ZにHTTP200、HTTP status=available、JevとJev1.14のmodel eligibility=eligibleを記録した。認証情報や課金設定は変更していない。

通常runnerを同じ固定版6cb8/source1b8で再開し、別の reports/goal-search-budget-fixed-2026-10-29/live/ に保存している。再開の上限は12試行、288要求、並列1、要求再試行なし。保存入力の直接再送や人間ログ送信は行わない。metadata利用可否と実モデル応答の確認は別に記録する。全12試行は202要求で完走し、202正常応答・ERROR0・未決済0だった。旧方式5/6、新方式6/6、必要再訪は両方式4/4。詳細と独立検証は [再比較結果](goal-search-resumed.md) に記録する。性能改善・人間一致の確証とは区別する。
