# Jev / OpenAI Decisions 同条件比較 Implementation Plan

> Agentic workers: user authorized parallel provider comparison, subagents, bounded fictional-local-screen API requests, independent review and feature push. No repeated API approval. Existing managed worktree reused; original E tree unchanged except user-managed credentials.

**Goal:** actorを固定し、JevとOpenAI Decisionsの判断だけを差し替えて探索能力を比較する。
**Baseline:** 792289644ca27ed5e6fff4d4aa827741876377b7 / source16ab01b。
**Architecture:** existing runHumanJev/runBeta/PhaseBudget/recovery UI/oracle/replayを流用。wrapperのAPI関数を明示backendで選択し、従来Jev dispatch本体は維持する。新しい候補役割・前提評価は今回は混ぜない。
**Tech:** TypeScript/native fetch、追加依存0。

## 固定条件と上限

同じlibrary/workshop×switch/changed/unchanged×2反復。provider2種、計24枠。各slotは両providerを並列2で実行し、両方が終わってから次slot。r2は逆順。初期画像・初回assessmentの画像/質問/共通JSONを照合する。以後の観察やaction質問は回答によって分岐し得るため一致を要求しない。

方式experience-goal-search-grounded/nullpersona/fullvision/memory3/experience8/argmax seed20261028を維持。各trial24要求・12判断・15UI・3look・180秒、全体576要求・40分・parallel2。HTTP再送0。401/402/403/404/429、台帳障害、source変更で次pairを開始しない。同時進行中の相手は自分の上限内で終わり、その要求も数える。失敗置換なし。2連続基盤障害も停止。

送信は通常runnerが新規観察した架空ローカル画像と目的・制約内記憶のみ。保存済み入力の直接再送、人間ログ、監査oracle、正解経路は送らない。OpenAIキーはユーザーが既存外部.envに追加。値は記録しない。

## 契約と編集範囲

- A: runner/openai-decisions-evaluator.ts、tests/openai-decisions-evaluator.test.ts。ModelRequest→公式Decisions schema→ChoiceAnswers。model gpt-6-luna、fixed endpoint、厳密分布、refusal/HTTP/timeout安全処理、maxAttempts1。
- B: runner/provider-comparison-analysis.ts、tests/provider-comparison-analysis.test.ts。DecisionProvider、ProviderRunRecord、analyzeProviderComparison(records,{mock?})。既存recovery解析をproviderごと再利用、予定24分母を維持。
- 親: runner/decision-backend.ts、human-jev-experiment.ts（明示backend選択のみ）、runner/provider-comparison.ts、protocol/tests/docs。共通core/client/UI/依存/従来actorは変更しない。

## 作業と受入

- [ ] 初期source・旧2851原本をhash保存。共通契約と公式APIスキーマ確認。
- [ ] A/B/親の担当テストRED→最小実装→GREEN。mockに本物のmodel名を付けない。
- [ ] parentがwrapper/孤立した台帳/並列pair/保存queue/上限・停止/manifest/replayを統合。APIキー不足はHTTP前に検出。
- [ ] first assessment等価性、provider独立state、分布の使用、malformed/refusal/401等を実行検証。従来dispatch bytesと旧初期wireの回帰を維持。
- [ ] fresh独立reviewで固定snapshotを確認し、必要最小修正と再検証。型/build/関連tests後にproducer commit。
- [ ] 新規24枠だけ通常runnerで実モデルを実行。結果によるactor変更・API再送・失敗置換なし。
- [ ] 原本・台帳・trace/replay・全現在画像・pair分母とモデル名を独立監査。実成功と主観完了、API障害、上限終了を分離し共有JSON/CSVとfeature push。

## 解釈

2反復の記述比較。別APIへ同じ意味内容を変換するtransport差も記録する。確率較正やconfidenceの人間頻度解釈、一般的安定性、人間一致は主張しない。費用はprovider報告のみ、未提供はunknown。API待ち時間は人間の時間に換算しない。
