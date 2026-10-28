# Goal断片の分類を切り分ける監査

Goal全文、モデルの元回答、受理後の評価、断片の分類、行動選択は別の記録である。通知設定の部分実行で「メール通知を停止し」がcontextになったことを、停止要求の自動削除やLOOPの原因と同一視しないため、読み取り専用の監査を追加する。探索本体の方策・prompt・分布・終了判定は変えない。

## 確認した境界

基準はb51b26a、製品hashは1b8c483b2b89c4f9fea113d2529d902ace425ec1a2a75e207109affa81b084c9。実モデルの元記録はee8fe221/d3e77a5fで生成したもの。互換なreplayを行っても、元の実行版を現行版へ書き換えない。

ImageJudgmentMemoryは読点・句点・英語andなどで文字どおりに分ける。通知のGoalは「初めて利用する暮らしクラウドで」「メール通知を停止し」「停止したことを確認したい」の3断片になる。contextの定義には独立した要求がないという表現があり、接続形の動作を局所的に読む余地がある。ただし、モデルの内部解釈は保存された選択式回答だけからは判定できない。

実行できた10評価で、2番目の断片はcontextだった。初回はGoalSearchの過去記憶が空なので、過去の誤分類への追従だけでは説明できない。応答が記録された10stepでは全文が評価段と行動段の保存入力に保持され、モデルの元の全Goal回答は10回ともunsatisfied。一方、受理後のassessment.goalはNO_ADMITTED_EVIDENCEによって10回ともuncertainとなった。元回答と受理後を同じ値として集計しない。

GoalSearchはfragment評価を記憶・候補説明へコピーするが、ImageJudgmentMemory.completionEvidenceを終了条件に使わない。doneは主観的完了で、客観的成功は別の画面oracle。別の旧image-only経路ではcontextを未解決から除外するが、全文のcompletionCoverageによる再確認が残る。今回のcontext分類だけで要求やoracleが消えた証拠はない。

## 監査専用の要求ラベル

`docs/experiments/fixtures/goal-search-notifications-role-rubric.json` は、全文での要求の役割を親AIが記した採点基準である。人間の付けた正解ラベルではなく、正解性の独立した人間評価もない。1番目はcontext、停止と停止確認はrequiredとした。Goal hash・断片id・文字列・網羅性を照合する。モデルに渡す入力ではなく、分類を正解へ書き換える辞書でもない。

requiredにcontextが選ばれた場合はrubric conflictとする。これはこの採点基準との食い違いを示す。画面を正しく読んだこと、全文を理解したこと、探索失敗の原因、人間の行動との一致を採点した値ではない。unknown/uncertainや応答なしを正解・不正解へ黙って変換しない。画像上の期待結果はこの役割ラベルだけでは採点しない。

## 実行方法

追加API要求・画像の再送・UI操作は行わない。出力は未使用のファイルを指定する。

```powershell
node --import tsx --test tests/goal-fragment-audit.test.ts
node --import tsx docs/experiments/2026-10-29-goal-fragment-audit.ts --run reports/goal-search-2026-10-29/live/notifications-r1-reason/exploration --out reports/goal-semantics-new.json --rubric docs/experiments/fixtures/goal-search-notifications-role-rubric.json
npm run build
```

CLIは保存記録のreplay確認を先に行う。出力に解析コードと入力resultのhash、元producerと現行版を別々に記録する。全文が両段の保存入力に保持されたか、各段の応答が記録されたか、rawからrecordへのコピー、行動段の記憶へのコピー、分布、分類のない障害stepを追跡する。保存入力は準備されたまま送信されないこともあり、入力の存在だけで実送信を証明しない。逆に無応答も未送信とは限らない。rubricなしでは意味的な正解判定を出さない。

## 未解決事項

HTTP402は未解消で、今回の監査に実モデルの追加要求はない。探索切り替え・必要再訪・新部品の改善効果・人間一致は引き続き未検証である。次の実比較では、同じ画面に対する読点接続形と完全文、記憶なしの初回と過去context記憶ありを分け、fragment分類・全Goal回答・実選択を別々に記録する。新しいラベルや再訪禁止を追加して成功扱いにはしない。

検証結果は、実装・独立検証後に追記する。
