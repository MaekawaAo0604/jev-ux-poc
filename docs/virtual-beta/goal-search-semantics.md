# Goal役割・観察状態と入口・実行操作の修正

要求をcontextへ混ぜる判定と、navigationを直接targetへ混ぜる判定を分離した。修正版を通常の実Jevで12試行・210要求実行し、当該2分類の誤りは今回のrubric上で減った。ただし目的達成は旧6/6、新5/6で、探索の切り替え・安定性の改善は確認できない。人間の再現は未検証。

## 実装

既存GoalSearchへ interpretation=role-state-v2 を追加した。従来モード・質問・記憶は維持し、新形式はopt-inで切り替える。

- Goal断片の役割はrequired/context/uncertainから選ぶ。画面に現れたかとは独立に、全Goalに含まれる要求かを判断する。接続された文の一部分であっても、独立した文として完結することを要求しない。
- 現在画像の証拠状態はobserved/not_shown/contradicted/uncertainから別に選ぶ。role=requiredかつassessment=not_shownを保存できる。
- findingではexecute_eNとnavigate_eNを分ける。前者はtarget、後者はnavigationとして、候補ID・画像出典・全Goal・役割と共に保持する。選択の確率・raw回答は元のresponseに残す。
- モデルが選んだ役割を特定の文字列・DOM・期待ラベルで正解へ置換しない。候補、操作先、選択重み、サンプラー、成功oracle、再訪可否は変更していない。
- 境界の不正モード、不正確率、欠損role、contextの観察状態、異なる形式の記憶混在を拒否する。両段階へのコピーとreplay再構築を検査する。

API段階と画像は増やさない。既存2段階の評価質問だけを増やし、候補説明へ結果を接続した。外部モデル・依存・学習は導入していない。

## 版・担当・比較条件

実モデルproducerは9c6207adda0d0a746e68d08d75a8a8be8d58f7d9、製品sourceHash159d5bdbb7bb3dd9ebde3cda18126e6904548fb5425fe048673da1047feace4e、全122製品ファイル。工学検証は同じ製品hashのd6acdb9作業snapshotを固定して行い、その後9c6207aへcommitした。解析コードの修正と最終文書は製品hashに含めない。

実装サブはgoal-search.tsと専用単体テスト、親は共通型/config・core・replay・profile・比較runnerと接続テスト、別コンテキストの検証サブは専用テストとraw監査を担当した。

旧experience-goal-search、新experience-goal-search-v2。通知・再訪alpha・再訪betaを各2反復し、条件順を反転した。同じUI、初期画像、全Goal、persona=null、seedと既存補正を使う。除外する設定差分はidとgoalSearch.interpretationだけ。6組全て整合した。新質問・記憶の内容・候補注記は一つの修正部品として比較しており、各要素の単独効果は未分離。

上限は12試行288要求、1試行24要求・12判断・15UI・3注視・180秒、全体20分、並列1、要求再試行なし。実要求210は全て正常応答、ERROR0・未決済0。既存106台帳を保全した。人間の操作・感想は読まず、保存入力を直接再送していない。

## 実測

- 旧：達成6/6、100要求。通知は2/2（10UI、6UI）、再訪は4/4（全7UI）。
- 新：達成5/6、110要求。通知は1/2（12UIでDECISION_LIMIT、10UIで達成）、再訪は4/4（全7UI）。
- 全12試行は基盤障害なしで比較に使用可能。未達はAPI障害・主観的離脱・完了誤認と混同しない。

監査専用rubricは実験前に記録し、モデルへ渡していない。親AIが全Goalと固定fixtureから作成した期待値であり、人間注釈や人間再現の正解ではない。

要求をcontextと扱う対立は、旧37/68の要求断片機会、新0/78だった。新ではcontextを役割の選択肢として残したうえで、101役割判断が今回のrubricと一致し、うち背景23、要求78。観察状態からcontextを削除しただけを意味理解の証拠にはしていない。同じ試行内の繰り返し判断は独立な78人・78課題ではない。

navigation/prerequisiteを直接targetとした対立は、旧target20提案中14、新target5提案中0。新navigation提案は31。全control提案はrubricの既知controlへ照合できた。カードの見出し＋説明は全文を保持したうえで、全文または先頭の表示行を厳密照合した。非提案や少ないtarget提案を高いrecall・完全な意味精度と解釈しない。独立担当は 105 入力画像を全 22 種の厳密 hash 群で、12 最終画面を全 4 種で確認した。

## ループは残る

新通知1回目は役割とnavigation分類を保持したまま、同じ入口を再び選び12判断で未達だった。step10/12では過去no-targetとneutralが候補へ届き、効果予測もunknownだったが、rawのe4は.74/.57だった。記憶を渡せば切り替わるという前提は、この記録だけでは支持できない。

別の接続上の候補として、現在のprincipal findingが全候補の説明へ繰り返され、第一遷移のnavigationと、その先のno-target・帰還が同じ候補の注記にまとまらない場面がある。同じe4でもo1/e4は設定、o2/e4はお知らせで、観察IDを外して同一操作と扱えない。これがループの原因と断定せず、次は候補ごとの出典付き経路比較を独立条件として測る。対応履歴がないことを未試行・有望と推定せず、再訪禁止・正解経路・新しい重みで隠さない。今回はこの追加方策を実装していない。

## 検証

workerの実REDは22失敗/13成功、その後新35＋既存71の106成功。親の接続RED4から5成功、関係する123テストが成功した。説明文修正後51テストとUTF8の接続5テスト、build（tsc＋Vite）が成功した。これらの重複実行を足して独立テスト数とは扱わない。

独立検証では初回19件中18成功、比較説明がgoalSearch全体を除外すると誤記するP2を発見した。実pairはid/interpretationだけを除外しており、説明を修正し同じassertionを維持した再検査20/20、skip0、型検査exit0。実Chromium＋完全fetch stubで8要求・3UI・2段階と、改変後の5種の拒否、findingとは異なるactor選択も確認した。工学検証はモデルの意味精度の証拠と区別する。

独立fixtureと親fixtureのcharset不足を直してUTF8画像を確認した。これは製品の修正ではない。旧17replay、60件の旧実質問/記録の比較、106台帳と648原本hash不変、過去監査の528期待hash一致も確認した。明示pinと通常pinなしの双方で20/20。clean cloneで過去データがない分岐のruntimeは未実行で、該当する歴史データ依存2ケースだけ理由付きskipする設計を残した。

全体npm test（concurrency2）は実行したが、次の4ブラウザー/bootstrap失敗後に中断した。全suite成功とはしない。

- action-traceのengine persists only executed actions、browser boundariesは、隔離実行5/5で通過した。
- budget-diagnostics-independentのstandard reserveとstandard settle-responseは、隔離実行でも初期OBSERVATION_ERROR・step0・API0で失敗した。期待する予算故障注入へ未到達だった。原因は当初未特定で、その後 trace から初期 goto の 10 秒制限と確認した。今回の通常human runnerは準備用ロードを行う別経路で、実12試行の障害0と区別する。

この時点で全体回帰の完了は未達だった。続く修正では trace の page.goto timeout=10000ms を確認し、残り実行予算以内、最大 30 秒へ変更した。10.5 秒の遅延画面と 150ms 予算の RED 2 件を先に確認し、修正後 2/2、既存の予算注入 2/2 も通過した。詳細と全体再実行は [出典参照の追補](goal-search-evidence.md) に記録する。

## 実行方法

既存出力を上書きしない新しいディレクトリを指定する。

```powershell
# 通常runnerの旧/新比較、最大12試行・288要求
node --import tsx runner/deferral-reason-experiment.ts --comparison goal-search-semantics --env-file .env --out reports/goal-semantics-fresh
# 保存記録だけの監査、モデル/API/UIの再実行なし
node --import tsx docs/experiments/2026-10-29-goal-search-semantics-audit.mjs reports/goal-semantics-fresh reports/goal-semantics-fresh/audit.json
npm run replay:virtual-beta -- reports/goal-semantics-fresh/notifications-r1-reason/exploration
# 関係する工学テスト
node --import tsx --test --test-concurrency=1 tests/goal-search.test.ts tests/goal-search-semantics.test.ts tests/goal-search-semantics-integration.test.ts tests/goal-search-semantics-independent.test.ts
npm run build
```

単発の通常human runnerは --mode experience-goal-search-v2 を指定できる。実モデル実行には既存のphase-budgetも指定する。一般の設定JSONでは goalSearch: {enabled:true, capacity:8, interpretation:'role-state-v2'}。通常テストはJEV_SEMANTICS_AUDIT_SNAPSHOT不要、固定版の監査には対応する全source snapshotファイルを明示する。

## 成果物と次の課題

[実結果JSON](goal-search-semantics-results.json)、[工学独立レビュー](goal-search-semantics-engineering-review.json)、実行原本 reports/goal-search-semantics-2026-10-29/live/（入力画像、trace.zip、result.json、台帳）。[実 raw 独立監査](goal-search-semantics-independent-live-review.json) と [否定判定の所見](goal-search-semantics-independent-live-contradiction-concerns.json) も保存した。

P0は、正しくroleを持っても繰り返す判断の接続と、候補の観察ID付き経路比較。標準 runner の初期読み込みは後続修正で回帰を確認した。P1は今回以外のUI/複合Goal/未知画面と、実ユーザー集団での比較。人間の再現を実証したとは結論しない。

## 独立 raw 監査で判明した追加不整合

独立担当は 12 replay、12 trace の CRC、88 click、3 scroll、3 native back、6 pair、旧 106 台帳、旧 raw 648 件、新 raw 446 件の不変を確認した。
要求と入口の 2 分類については親の集計を支持したが、以前の observed がないのに contradicted と答える例を 6 件発見した。
再訪 4 試行の step7 の g1、通知反復 2 の step10 の g2/g3 で、保存履歴には not_shown しかなく、実画像には未完了状態と直接実行できる control があった。
現在の未達と過去証拠の否定は異なるため、出典を持たない否定を受理できる契約を [追補](goal-search-evidence.md) で修正する。

この 9c6207a 版の全 122 製品ファイルは、後続変更前に reports/goal-search-semantics-2026-10-29/producer-source-9c6207a.zip へ保存した。
archive SHA256 は d61614fa8b032d25779fc3c8c2a1806486391c50bc6f127255b7f554977ce9ad。
監査コマンドは対象 producer の全ファイル hash を検査するため、別の製品版から過去実験を監査する場合は、その保存版を別作業領域へ復元する必要がある。

比較で固定した seed は既存選択器の seed であり、モデル出力の乱数を固定できたとは確認していない。
同じ初期画面であっても出力のばらつきが残るため、各条件 2 反復を安定性や因果効果の証明とは扱わない。
