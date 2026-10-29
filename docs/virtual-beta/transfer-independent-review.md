# 別課題評価の独立検証

実装担当とは別の検証エージェントが、基準999a7e4＋変更を凍結した319ファイルを検証した。開始・終了の各SHA256は一致した。実行版はその内容をcommitした `73b1ff3603b84c0019332970590b1f0d1406dc91`、製品source hashは `8a5bc5c03daaf99df38795fd218dc5e19e0ed916d390620e602286955c6ee3d7`。

## 実モデル実行前

判定は上限付き実評価への条件付き合格。critical/important指摘は0件だった。

- 独自検証を含む限定テスト31/31成功、skip0。
- 独立ブラウザーで6画面・44項目成功。正しい対象だけでなく、別作品、未保存、別メモ、部分案内、非表示の持ち物、Back/Forward、reloadも確認した。
- 通常wrapperを使ったローカルstubで、実際のcurrent画像2段階を原画像から再構成し、hash・観察ID・全画面範囲・質問と応答を確認した。これは実API0の疎通で、実Jevの探索性能ではない。
- baseline116ファイルと、モデル入力生成・候補・実行・判断loop・dispatchを比較。Git LFとcheckout CRLFの違いを区別した。初回の独自Git生バイト比較の失敗も原本に残し、比較方法を訂正した。
- RESERVEDの再open、別ownerのロック、段階ごとの上限、失敗・無効の分母、未知の遷移先を実行確認した。
- 過去原本1,939ファイルのhashは不変。今回の検証で秘密情報・人間記録の読み取り、実API要求、製品コード・元テストの修正はしていない。

親の関連回帰は199件中198成功・1失敗・skip0。旧holdoutの初回クリック待ち2秒が失敗した。元assertionのまま単独再実行すると12件中10成功・2失敗だった。独立側でparserをGit基準版に置き換えた比較もswitch/alphaのstatus待ちが失敗し、betaは成功した。今回のadapter由来の回帰は確定していない。テストの待ち時間を広げて成功扱いにはせず、既存不安定性として残す。

親の通常HTTP経路stubと旧sentinelの入力・質問・画像の厳密比較は2/2成功。型とbuildも成功。全体npm testは実装サブが開始後に中断したため、全体成功とは報告しない。39分を要した前フェーズの全体実行と混同しない。

原本は `reports/transfer-evaluation-2026-10-29/independent/report.json`、独自テスト・ブラウザー記録・前後snapshotも同じディレクトリにある。親の回帰失敗は `integrated-tests.log` と `holdout-fixture-retest.log` に残る。

## 実モデル実行後

判定は `STOPPED_INCOMPLETE_BATCH_RAW_INTEGRITY_VERIFIED`。21予定・13試行・有効12・未実行8。新規は18予定・11試行・有効10・達成10・基盤障害1。既知は3予定・有効2・達成2。92要求は91 OK・1 ERROR・未決済0で、13試行目のaction HTTP402で予定どおり停止した。再送はない。

独立が13 replay、13 trace ZIPの全member CRC、92 currentフレームのhash・原画像からの再構成・全画面範囲を監査した。応答成功は91で、402の1件は成功配信として計上しない。全選択で分布からのargmaxと実操作が一致し、controllerによる選択変更0・反復エッジ0だった。66 unique PNGをdecode・寸法・役割で分類し、current26画像をcontact sheet5枚で目視、終端7枚を原寸確認した。要求時刻は非重複、各上限内。

実行原本299ファイル、producer129 source、preflight319、過去原本1939、実台帳142、protocolは監査前後で不変。help4件は両情報の画面表示と正常応答current画像への提示を確認した。人間一致・理解・3反復の安定性は評価できない。

原本は `independent-live/report.json`、`raw-before.json`、`raw-after.json`、全PNGのcoverage queueと目視記録に保存した。

## 修正round1と再検証

独立がoptional confirmationの偽陰性6件を発見。文字ノード間の空白でcatalog2・draft4がliteral照合から漏れていた。親が3件REDを作り、元の実装担当が解析moduleだけを修正した。UI、actor、profile、transportは変えていない。

修正後は独立5件＋既存26件の31/31成功、skip0。別対象、誤scope、未保存、部分文、句読点の削除・変更、非空白のzero-width追加、正常応答なし、retained画像、ID・範囲不一致を独自に確認した。独立の最初の追加テストには、literal.includesで疑問形を除外できるという期待と、置換が実際に文字列を変えていなかったテストデータの2誤りがあった。失敗ログを保持して契約とデータを訂正し、製品は追加変更していない。疑問形も包含で一致しうる限界は残し、意味判定には使わない。

独立再集計で `derived-v2/summary.json` とdeepEqual。差は6件のoptional creditだけで、各runの他field、新規/既知の達成・障害・要求数、セル主要値は不変。help4/4も維持。原本299と過去1939/142台帳・protocolは不変だった。API0、UI再実行0。

解析修正版の製品source hashは `0d6a2476bc592fe9d56afc4436b2737555659129eb2c4b8e4ee8309ef73890d4`。実測producer8a5bとの差は解析module1個、他128 sourceは不変。修正前の原本集計は保持し、修正版を別出力にした。独立の `independent-fix/report.json`、`source-before.json`、`source-after.json`、`derived-independent-diff.json` に証拠を保存した。

## 残る項目

- サービス復旧後の未試行8件。402の利用制限・課金側の原因は今回未特定。
- 既存holdoutの短い待機時間による不安定性。全体suiteと3反復の完走は未確認。
- 今回の成功経路には行き詰まりや必要再訪がなく、その転移能力は未検証。
- 対象集団の人間データ、ペルソナ効果、実製品、意味理解と因果的なUI改善効果は未検証。
