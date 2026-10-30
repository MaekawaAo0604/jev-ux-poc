# 最終HTTP待機上限の計測修正

最終的に AbortSignal.timeout へ渡す値を、成功・失敗とも監査へ保存するよう修正した。外側の期限と台帳準備で短縮される値をcoreの計画値から区別する。関連462テスト、独立273テスト、型検査・buildを通過し、実API 4要求の短い疎通でも記録を確認した。これは通信計測の確認であり、探索性能や人間の再現の実証ではない。

[個別結果](final-http-timeout-results.json)、[版と原本照合](final-http-timeout-versions.json)、[独立原本監査](final-http-timeout-review-live.json)を参照。以前の[保持方式比較](condition-retention.md)の2/4未完了と、当時の最終値欠測はそのまま残す。

## 基準・実装

基準e8658a8、最初の修正14a03d6、実API実行版 111f3f3e4a952a676eb7af120dd4add5be7d0d24。実行時155ソースを 8a86d07d95b59e5e27f1469d2b977abd8402663619e641c4b8a338c3bcbea897 とZIPに固定した。Gitの改行正規化と区別し、実行時の実バイトを保存している。元のE:/ChatGPT/Ux_testの既存変更は編集せず、外部.envからキーを読み込んだ。キー値は記録・公開しない。

実装サブは純粋な期限計算・閉じたvalidator・110テストを担当し、親はnative transport、adapter、core、replay、比較runner、統合テストを統合した。別コンテキストの独立担当が実装後・修正後・原本を検証した。追加依存、UI、モデル、生成指示、native本文、effort、行動方針、Persona/Charterは変更していない。正解経路や一律の再訪禁止も追加していない。

extractorの第2引数へ監査callbackを渡す。nativeは単一のconstをAbortSignalとcallbackへ使い、adapterは受領値・外側残時間・予約前後の時計を付加する。監査値はnative本文とJevの両判断入力へ渡さない。最終traceが必須なのに欠ければactorを止め、元のresponse/errorと別欄のmeasurementErrorを保持する。attempt0の拒否には架空のdispatchを作らない。

replayDirectory(dir,{finalVisualHTTP:true})およびCLI --require-final-httpで明示的に計測を必須化する。実モデルのvisual比較runnerはこの指定を使う。既定の旧ログ互換replayは維持するが、外から要件を指定しないログ全体の改変耐性を主張しない。traceはクライアントの設定観測であり、サーバー受領は別のhttpReceivedで区別する。httpReceived=falseは受領未確認で、サーバーが受信しなかった証明ではない。

## 独立検証と修正

[Round1](final-http-timeout-review-round1.json)は2件のP2を指摘した。明示必須のtrace欠測でもcoreが判断を続けることと、別の比較runnerが必須replayを指定せずmarkerと全traceの削除を通すことだった。両方を最小修正し、[Round2](final-http-timeout-review-round2.json)で確認した。変動するgetterからtimeoutを2回読み取る差も単一constで防いだ。

最初の疎通は固定36要求profileと6要求台帳が不一致で、予約・APIとも0のまま停止した。旧manifest・空台帳の2原本は保持した。上限を増やさず、明示maximumRequests（CLI --maximum-requests）を整数1..profile最大に限定して追加し、台帳との完全一致と全段階の消費上限を確認した。省略時の従来要件は維持する。[Round3](final-http-timeout-review-round3.json)は関連240、独自24契約、独自9上限検査、型/buildを実行した。cap1/2/6、review、CLI、不正値・不一致の送信前拒否を含む。

親の修正前RED、VMテストの外側変数不足、独立stubのbaseline選択誤りと修正後の同じassertも保存した。テストや受入条件を削除・緩和していない。親の最終関連15ファイル462/462、独立273/273が通過した。全repository suiteと全外部比較batchを実施したという意味ではない。

## 実APIでの観測

架空ローカル図書サービスの条件不変画面を、通常runHumanJev、retention方式、maximumRequests6、外側35秒、並列1、HTTP再試行0で1回実行した。setup失敗のAPI0は別記録で、保存入力の再送・人間の操作や感想の送信は行っていない。

- 観察 1: core→extractor 30000 ms、外側残り 31174 ms、adapter上限 30000 ms、台帳準備 2.668600000000879 ms、実AbortSignal 29997 ms、制限理由 extractor-timeout、native status completed。
- 観察 2: core→extractor 30000 ms、外側残り 9125 ms、adapter上限 9125 ms、台帳準備 2.012399999999616 ms、実AbortSignal 9122 ms、制限理由 external-deadline、native status TIMEOUT。

外側35秒は各要求のdispatch・AbortSignalへ適用する期限であり、後処理を含む全体35秒以内の保証ではない。outer manifestの開始から終了まで39.399秒、core実行32.271172699999994秒、最終台帳精算は開始から35.016秒だった。

合計4要求、終了理由 API_ERROR、UI操作1、注視0、判断2。required replayはverified。実HTTP待機値は2件、外側期限が直接の制限となったのは1件。短い資源上限の疎通であり、目的判定 OK/false やcore validForComparison=falseを探索成績に用いない。TIMEOUT等の基盤障害をユーザーの迷い・離脱と集計しない。

旧raw5784、setup失敗2、今回17で計5803原本をhash固定した。保護117文書・旧Gate・旧ZIPを保持し、索引は承認された追記だけを後述の公開監査に束縛する。今回4を以前の178へ加え182/288、割当残92と未割当14。過去の別フェーズの成績や要求を合算しない。

## 実行方法と残課題

回帰確認と型・build：

~~~powershell
node --import tsx --test --test-concurrency=1 tests/visual-http-timing.test.ts tests/visual-http-dispatch.test.ts tests/visual-http-integration.test.ts tests/human-jev-request-cap.test.ts
npm run build
~~~

全462のコマンドとログはローカルreports/native-http-timeout-2026-10-30/parentにある。

保存した原本がある環境では、次で再検証する。

~~~powershell
node --import tsx runner/virtual-beta-replay.ts reports/native-http-timeout-2026-10-30/live-after-cap/run/exploration --require-final-http
~~~

実APIの正確な実行scriptは同phaseのparent/smoke-round3.ts。履歴のproducer/source/archiveと6要求ledgerを検証し、新出力先を要求するため、使用済みのscriptや台帳をそのまま再実行して上書きしない。reports/ZIPは非commitなので、新cloneだけでは歴史原本のreplayはできない。

通常CLIでも--maximum-requests 6 --phase-budget 新規台帳.json --env-file 外部.envを指定できる。新規台帳はschemaVersion1/status APPROVED/newMaximum6/perRunMaximum12/used0/attempts[]と固有phaseを持つJSONをUTF-8 BOMなしで作る。既存台帳の消費を初期化しない。

次のP0は条件の同一性と現在根拠の契約、次のP1は記憶が中間操作の選択へ影響するかの別課題・反復比較。保持の優先順位を実装しただけでは誤対応や重複、行動の改善は解決しない。人間集団の比較データ・persona較正・未学習画面への転移は未検証のまま。今回新しい学習モデル、重み、データ、依存は採用していない。
