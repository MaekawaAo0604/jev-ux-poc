# 利用上限変更後のGoal探索比較（2026-10-29）

チーム予算の上限変更後、通常runnerで12試行・202要求を完走した。旧方式は5/6、新方式は6/6で客観的に達成した。必要再訪は両方式とも4/4で、全て7回のUI操作だった。各条件2反復の記述的な比較であり、新部品の安定した優位や、人間への一致を実証した結果ではない。

## 固定した版と条件

実行producerは6cb8c277e410556435006fc57a2f8a451e06ebc5、製品sourceHashは1b8c483b2b89c4f9fea113d2529d902ace425ec1a2a75e207109affa81b084c9。122製品ファイルを固定した。今回は実行・監査・記録だけを追加し、探索処理やUIを変更していない。

旧experience-reason-correspondenceと新experience-goal-searchを、通知設定・必要再訪alpha・必要再訪betaで各2反復した。UI、目的、ペルソナ、初期状態、seedを固定し、2回目は各組の実行順を反転した。6組全てで初期画像hashと許可された設定差分の整合を確認した。追加部品は質問・記憶・候補注記をまとめて比較しており、各要素単体の効果は分離していない。モデルの乱数やサービス内部の不変性は保証できない。

上限は12試行、288要求、1試行24要求・12判断・15UI操作・3注視・180秒、phase20分、並列1、要求ごとの再試行なし。実使用は202要求、正常応答202、ERROR0、未決済0。直前の読み取り専用metadata GET1回はモデル要求と別集計した。過去の失敗記録と94旧台帳は保持した。人間の操作・感想は読み込まず、保存入力の直接再送も行っていない。

## 結果

- 旧方式：6試行中5達成。通知は1/2（UI操作6、12）、必要再訪alphaは2/2、betaは2/2（全て7UI）。計102要求。
- 新方式：6試行中6達成。通知は2/2（UI操作6、10）、必要再訪alphaは2/2、betaは2/2（全て7UI）。計100要求。
- 旧通知2回目だけDECISION_LIMITで未達。API障害やユーザーの離脱ではない。主観的な完了誤認は0。
- 同じ条件でも通知の経路と操作数が変わった。新旧の差1件だけで、実行間の変動を超える効果や未知画面での安定性は判断しない。

必要再訪は、共有設定で本人確認が必要と知る→アカウントで確認を完了→共有設定に戻る→リンクを無効化、という実操作が両方式で成立した。正解手順をJevに与えていない。画面が示す案内とその後の実観察を使う課題であり、人間が同様に判断する確率を測ったものではない。

## 切り替えと残る問題

新方式には50件の現在画面の探索記録、136質問と対応する136回答が残った。出典・記憶コピー・容量・候補注記の整合は保存replayで確認した。過去結果の注記17候補のうち5候補は実際に選択された。注記が届いたことと、その意味が判断に使われたことは区別する。

新通知2回目は、step6で過去no-target注記付きの設定入口e4をraw確率.77で再選択した。step8ではホームのその他e5を選び直して達成したが、e5はraw.02、モデルの提案と補正前選択はe4、既存補正後のe5は約.4065だった。新通知1回目も切り替え時のe5はraw.02・モデル提案e4、補正後約.2894。このため、モデルが自発的に意味を理解して切り替えたとは結論しない。旧方式の達成例でも既存補正が切り替えに寄与している。再訪禁止は追加していない。

通知のGoal断片「メール通知を停止し」は新2試行の18判断全てでcontextと分類された。監査専用のAI作成rubricではrequiredとの対立18件であり、人間注釈による精度評価ではない。全Goalは両段階で保持され、2試行とも達成した。従って、当該分類をループの原因や要求の削除と断定しない。次に直す対象は、固定された要求の役割と、現在画面での証拠状態を一つの選択肢に混在させている表現である。

独立監査は、次画面への入口を直接操作targetに分類する例も発見した。新通知r1 step5（input-5.png）のe3は「お知らせの管理」への入口で、次のinput-6.pngに初めて「メール通知を停止する」ボタンが現れる。保存された質問はnavigationをtargetから除外する契約を含むが、モデル回答はtarget_e3だった。親もこの2入力画像を確認した。これは意味分類と契約の対立であり、候補IDの転送やクリック実行の不具合ではない。同種のnavigation/target分類対立は通知2件と再訪12件の合計14提案で、契約が実質問に届いていることも確認した。また再訪課題では要求全体がcontextとなる20判断が残る。観測された14/38提案は個別の契約・rubric対立であり、50全画像を人手で正解付けした精度/再現率ではない。詳細は [独立所見](goal-search-resumed-independent-review.json) と [選択・意味証拠](goal-search-resumed-selection-evidence.json) に記録した。

## 検証と成果物

親の12replayは全件verified、6組の比較条件は一致、94旧台帳は不変。今回の回帰テストは91/91、失敗0・skip0。npm run build（tsc --noEmit＋Vite）もexit0。gateway停止のテストはfetch stubであり、実モデル実験202要求とは別である。独立監査も基盤整合性PASS。12replayと12traceのCRC・click/scroll・URL進行、6組の条件、全122製品source、94旧台帳、旧原本/metadata251件、新raw434件の不変を確認した。30枚の画像（実入力18枚、全12terminal）を目視し、全terminal画像と客観判定の一致を確認した。検証担当のモデル・外部通信・UI再実行は0。意味上の受入条件は未達のまま残す。

- [独立検証JSON](goal-search-resumed-independent-review.json)：受入判定・証拠・限界。基盤PASS、意味判断は未解決、人間一致は未検証。
- [比較結果JSON](goal-search-resumed-results.json)：版、設定上限、要求数、6組、各試行の実経路、raw/補正後/モデル提案/実選択、fragment集計。
- 原本：reports/goal-search-budget-fixed-2026-10-29/live/。各試行のexploration/result.json、モデル入力画像、Playwright trace、要求台帳を保持する。
- 親監査：reports/goal-search-budget-fixed-2026-10-29/parent-audit.json。
- fragment監査：同ディレクトリの各*-fragment-audit.json。rubricは監査専用でJevへ渡していない。
- [Gateway診断と復旧](gateway-recovery.md)。過去の全HTTP402を今回と同じ原因と決めつけない。

## 再実行

既存出力を上書きしない、新しい出力先を指定する。.envのキーを表示・保存しない。

```powershell
node --import tsx runner/deferral-reason-experiment.ts --comparison goal-search --env-file .env --out reports/goal-search-fresh
node --import tsx docs/experiments/2026-10-29-goal-search-audit.mjs reports/goal-search-fresh reports/goal-search-fresh/audit.json
npm run replay:virtual-beta -- reports/goal-search-fresh/notifications-r1-reason/exploration
node --import tsx docs/experiments/2026-10-29-goal-fragment-audit.ts --run reports/goal-search-fresh/notifications-r1-reason/exploration --out reports/goal-search-fresh/fragment-r1.json --rubric docs/experiments/fixtures/goal-search-notifications-role-rubric.json
```

## 次の優先事項

1. P0：有望な入口と目的の状態を直接変える操作の区別を、モデルへ実際に渡した画像と後続の実操作で評価する。navigationをtargetへ混ぜる判断を、画像から正解を固定した対照で再現する。
2. P0：要求の役割と観察状態を分離する表現を、複合Goal・否定・制約を含む監査専用正解付き課題で比較する。特定の文言だけをcontextから書き換えず、全Goal保持・完了誤認・無関係な証拠を検査する。
3. P0：非進展経験がある入口について、モデル自身の分布変化とcontroller補正による切り替えを別々に評価する。補正なし・記憶の有無などの宣言済み対照で、別画面の反復を測る。
4. P1：今回未測定の課題、未学習画面、複数人の操作とペルソナ差を比較する。人間データを判断入力に混ぜず、実行時間とAPI待ち時間も分ける。

今回確認できたのは、既存部品の接続と、この3課題での実モデル探索・必要再訪である。完全な意味理解、人間の再現、UI変更の因果効果、広い製品群での安定性は未検証。

回帰コマンド：

```powershell
node --import tsx --test --test-concurrency=1 tests/goal-fragment-audit.test.ts tests/goal-fragment-audit-independent.test.ts tests/gateway-batch-stop.test.ts tests/gateway-batch-stop-independent.test.ts
npm run build
```

保存原本だけを使う独立監査の再実行（producer6cb8/source1b8を固定、外部通信なし）：

```powershell
node --import tsx docs/experiments/2026-10-29-goal-search-resumed-independent-audit.mjs reports/goal-search-budget-fixed-2026-10-29/live reports/goal-search-budget-fixed-2026-10-29/independent-raw-fresh.json
```

同じファイルを新しい製品版の実験に流用してproducer一致を装わない。新しい製品版の実験は、manifestに記録した全製品hashを確認してから別に監査する。
