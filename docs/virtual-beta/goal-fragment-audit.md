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

## 保存された実行への適用結果

独立指摘を修正した解析版ef280f0、解析コードhashfb81bf88310f7e645883b57be7a64b6864217b4176d4696a622eda58e22e6bdcで、[結果JSON](goal-fragment-audit-results.json) を生成した。元resultのhashはc21153f39b9b7eb301cc70d04d49bef7189df7d1f50f3f3e85a4faae70dbc829。実producerと現行製品のhashは異なると明記している。

分類は10評価、11回目はHTTP402の応答なしである。g1=context10、g2=context10、g3=not_shown10。親AIの監査基準でrequiredとしたg2は10回ともrubric conflict。これは10件の独立した人間評価や、一般的な誤分類率を表さない。同じ試行の系列である。

全10評価でrawからrecordと現在の行動段記憶へのコピー、source、保存入力の全文保持に構造上の不一致はなかった。framesWithIssues=0はこの整合性の結果であり、意味判断が正しいという採点ではない。元の全Goal回答unsatisfied10と受理後uncertain10は別々に残した。11回目に保存されていた8件の過去記憶は、新しい8分類として数えなかった。10stepは両段の応答記録あり、11回目は両段とも応答記録なしと出力する。無応答でも送信の有無をこのfieldだけでは断定しない。

親は初版30/30、独立指摘修正後の開発47＋独立36の統合83/83、既存Goal記憶・完了確認95/95、型検査を含むbuild成功を確認した。元live121ファイルのhash不変を確認した。独立担当は修正版ef280f0で再検証を完了した。初版の独立検証は35件中7件失敗し、3つのP2指摘があった。行動段の出典、同じ不正値がコピーされた記憶の構造、受理後Goalのenumを検出できていなかったため、既存GoalSearch契約の検査を再利用して修正した。元の7反例assertを削除・緩和せず再検証に使う。

## 独立検証と修正

[初回の独立指摘](goal-fragment-audit-independent-round1.json) と [最終の独立再検証](goal-fragment-audit-independent-round2.json) を保存した。3件のP2は修正後に解消し、この監査の受入範囲で未解決指摘0。独立83/83と関連71/71、型検査、通常CLI・replayが成功した。元の実rawのコピーへ同じ7改変を加えた場合も検出した。対象はef280f0と解析hashfb81bf88310f7e645883b57be7a64b6864217b4176d4696a622eda58e22e6bdcで固定した。

実記録がない環境では、主要な純粋関数の反例は自己完結した契約fixtureで実行する。独立テストの --contract-only では34成功、実記録専用2件skip。入力不在で全検証が起動前に落ちる構成を避けた。初版の独立テストにあったcallbackの型不備は検証コードの修正として別に記録し、主要7反例の期待結果は変更していない。

```powershell
node --import tsx --test --test-concurrency=1 tests/goal-fragment-audit.test.ts tests/goal-fragment-audit-independent.test.ts
node --import tsx tests/goal-fragment-audit-independent.test.ts --contract-only
```

前後の製品122ファイルは同一hash。元記録121ファイルと過去台帳を合わせた215ファイルのhashも不変だった。親が作成した今回のrubricは人間の正解評価を受けていない。未解決の意味・因果・人間一致を、この監査の合格で解決済みと扱わない。実モデルの追加要求は0で、次の探索比較はHTTP402の復旧確認待ちである。
