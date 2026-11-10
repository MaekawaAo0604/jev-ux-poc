# 別課題の探索切替・再訪検証 Implementation Plan

> Agentic workers: use the existing subagent workflow. User authorized implementation, bounded real Jev execution, independent review, and feature push; no additional API approval is needed.

**Goal:** 固定方式が別課題で非進展後に切替え、前提変更後に再訪できるかを、正負対照を分けて測る。
**Baseline:** b7ce1cdc2123d12136a63675f0ee437497f9154d / source 0d6a2476bc592fe9d56afc4436b2737555659129eb2c4b8e4ee8309ef73890d4。既存managed worktreeを再利用する。元E:作業ツリーと73b固定実行treeは変更しない。
**Architecture:** 独立opt-in recovery fixtureを既存normal wrapper/coreへ接続する。画像生成、候補、質問、記憶、方策、確率選択、transport、goal判定の既存動作は変えない。新oracle/監査はモデル入力に含めない。
**Tech:** existing TypeScript/React/Playwright/Jev1.14、追加依存なし。

## 固定する実験

2課題 library（予約図書の受取館変更）/workshop（参加予約の希望回変更）、3条件 switch/changed/unchanged、各2反復の12試行。
全条件は目的の変更画面がblockedの状態から開始する。自力で行き詰まりに到達した実験とは呼ばない。
switchはprimary閲覧専用のまま、別の予約一覧入口で保存できる。
changedはaccountで確認するとeligibleがtrueになり、primaryへ戻って保存できる。
unchangedは同じaccount操作後もeligible=false、recordsで照合するとtrueになりprimaryへ戻って保存できる。account直後の無変更再訪と、その後の変更後再訪を別計数する。
changed/unchangedは同一課題の初期画像・候補・goalが一致し、確認操作後のfeedbackだけが最初の差分となる。条件tokenはopaque。
他の入口を探索した後の再訪を一律に不自然と評価しない。再訪の禁止・強制・結果に合わせた重み変更は行わない。

方式は experience-goal-search-grounded / nullpersona / full viewport crop4096 / memory3 / experience8 / argmax seed20261028 / longContext / HTTP再試行なし / review0。
12試行、最大288要求、各24要求・12判断・15UI・3注視・180秒、全体40分、並列1。HTTP402即停止、連続2基盤障害停止、ERROR/RESERVEDも計上、再送・失敗置換なし。
最短switch3UI+done、changed6UI+done、unchanged9UI+done。無変更の早期再訪1回を加えると24要求に達するため、機会未発生・LIMITを失敗や成功から区別する。
順序はregistryの6条件をr1、逆順をr2。方式やUIは結果を見て変更しない。

## 共通契約と所有

- A所有: app/recovery-fixture.ts、app/RecoveryFixture.tsx、app/recovery-style.css、app/recovery-certification.ts、tests/recovery-fixture.test.ts、tests/recovery-registry.test.ts。
- registry: RecoveryTask=library|workshop、RecoveryCondition=switch|changed|unchanged、RecoveryFixture={version:1,task,condition}、recoveryFixtures/recoveryQuery/parseRecoveryFixture/recoveryDefinition。definitionはgoal/title/itemTitle/originalValue/desiredValue/objectiveTextを持つ。
- UI: RecoveryFixtureView。初期primary。data-recovery-action=home/primary/account/records/alternative/confirm/reconcile/apply。data-recovery-rootとJSON data-recovery-stateは監査専用。data-recovery-field=saved-value は可視保存値、data-recovery-complete=trueは可視status。
- audit snapshot: {schemaVersion:1,route:primary|home|account|records|alternative,eligible:boolean,verificationAttempts:number,recordChecks:number,savedValue:string,complete:boolean}。UIに別の正解判定モジュールはimportしない。
- B所有: runner/recovery-analysis.ts、tests/recovery-analysis.test.ts。snapshotと操作結果から記述集計する。正解手順は参照しない。
- 親所有: 共通core/wrapper型・7selector adapters、新oracle、runner/recovery-evaluation.ts、protocol、統合/transportテスト、docs、実実行と集計。

## 作業と受入

- [ ] 既存source129・旧2428実行原本をsnapshot、旧sentinel/transferの通常mock入力を保存。
- [ ] A/Bは担当テストREDを保存して最小実装、既存ファイルへの無調整編集禁止。共通変更は親へ返す。
- [ ] coreはrecoveryFixture選択・initialmetadata・audit snapshot・oracleだけ追加。audit/condition/referencePathはモデルへ渡さない。
- [ ] 正解経路なしの通常runnerを使い、モデル質問/画像/候補の既存部分が旧入力と同じことを確認。
- [ ] oracleで誤対象・未保存・未確認・確認後まだ未保存を負例検証。native Back/Forward/resetの状態が混ざらない。
- [ ] raw/model distribution/filtered/selection/actualoperation/snapshot/sourceimageを保存。動作意図や理由はモデルの短い自己報告と観測を分ける。
- [ ] 新contextの独立検証を実施。版をfreezeし型/関連回帰/一連mock/到達性を確認後commit、12件だけ実Jev。
- [ ] 実行後raw/ledger/replay/画像/trace/分布と機会分母を独立監査、必要な計測不具合だけ修正→再解析。actorの改善は混ぜない。
- [ ] 新規課題達成、切替機会、前提変更後の再訪機会/完了、無変更再訪、LIMIT、API障害、主観完了と客観結果を別々に報告しfeatureへpush。

## 解釈と次の判断

12件の記述的な実験で広い安定性や人間一致は結論しない。全画面/nullpersonaで探索能力だけを測る。失敗があっても隠さず、基盤欠陥と判断方式の限界を分ける。新研究コード/重み/学習は追加しない。
