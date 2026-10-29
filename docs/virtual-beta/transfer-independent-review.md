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

## 初回実モデル実行後（停止時点）

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

- 初回停止時点の未試行8件は、後述の継続で全件試行した。初回402の詳細原因を初回保存ログだけで確定してはいない。
- 既存holdoutの短い待機時間による不安定性。全体suite再完走と全条件3有効反復は未確認。
- 今回の成功経路には行き詰まりや必要再訪がなく、その転移能力は未検証。
- 対象集団の人間データ、ペルソナ効果、実製品、意味理解と因果的なUI改善効果は未検証。

## 継続と最終21枠の監査

独立担当は継続scriptの実装後に、新しい対象snapshotを固定して検証した。
第2フェーズは1件のassessment HTTP402で停止し、14試行、12有効、基盤障害2件、未試行7件を部分停止として監査した。
その原本20ファイルも以後変更していない。
第3フェーズ前は新テスト3/3と通常固定wrapperのmock1件を実行し、先頭セルの初期PNG2種とassessment入力が過去原本と一致することを確認した。
7件全部を新scriptでmock再実行したとは報告せず、既存8件mockの検証と新しい入力guard、通常wrapper1件の確認を分けている。

最終判定は `PASS_WITH_TWO_PRESERVED_INFRASTRUCTURE_FAILURES`。
21予定枠をすべて試行し、有効19件（新規16件、既知3件）が客観達成と主観完了、無効2件は元のHTTP402だった。
catalog/alpha-r2 と catalog/beta-r2 の障害を保持し、再試行による置き換えはない。
147要求は145 OK、2 ERROR、0 RESERVEDで、全147予約IDが一意、HTTP試行は各1回だった。

全21件のreplayとtrace ZIPのCRC、fresh page、逐次実行、上限を照合した。
1,732設問の確率を検証し、72行動選択すべてでargmaxと選択、UI対象が一致した。
controllerによる選択変更は0件。
148個の保存frame metadataから、送信147要求と正常応答current画像145件を区別した。
第2フェーズで準備だけされたaction metadata1個は、実際の送信数や正常応答数に足していない。

第3フェーズのPNG75件をdecodeし、68のunique画像を識別した。
第3フェーズのcurrent画像27件中26件は旧hashと一致し、追加1件のcatalog/alphaの土曜日filter画面を目視確認した。
同条件の初期PNGとconfigは全7条件で一致し、catalog/alphaの有効経路だけが2種類だった。
初回の2操作と第3反復の3操作の違いを保持し、毎回同じ動きになるとは扱わない。
help6件の両情報表示と、正常応答current画像への提示も再確認した。

旧2,258原本、新170原本、固定129 source、旧script/test、新script/test/pendingと3フェーズ集計scriptは監査前後で不変だった。
公開JSONとCSVの21行、3フェーズのmanifest hash、分母、経路、補助確認38フレームは原本とv2再集計に一致した。
監査はAPI0、UI再実行0で、製品コードの修正はない。

最終証拠は `reports/transfer-evaluation-2026-10-29/continuation-independent/final21-audit/report.json` と `gate.json`。
report SHA256は `a3a60e8e99228bc8cd6b27d2c8fd6f3056afdc8a420cd56c5017cec8f16dbf2c`。
第3フェーズmanifest SHA256は `3b9f1a691cc572ee655a25206f4d08cfa224eef6da841d10ced53ca15b2bc877`。
実行前の証拠は `final7-preflight/`、第2フェーズ停止の証拠は `actual-audit/` に保持した。

今回の完了は、固定方式で別3課題の全予定枠を試行し、その原本と集計を検証できたことを指す。
catalogの両版は各2有効反復であり、3有効反復や広い安定性を実証したものではない。
行き詰まりからの回復、必要再訪の一般化、ペルソナ効果、対象集団の人間との一致は未検証。
既存holdoutの短い待機時間の不安定性と、全体suiteを再完走していない制限も残る。
