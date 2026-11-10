# Crop Context Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development.

Goal: crop初手STUCKの観察境界を分離し、最小修正と同条件比較を実行する。
Spec: ../specs/2026-11-10-crop-context-design.md
Stack: 既存TypeScript/Jev/Playwright、依存追加なし。

- [x] 基準7f35def・clean、旧3crop+3foveated画像・geometry・bindingの独立診断。
- [x] 親：契約・config RED→GREEN・固定4条件plan。
- [x] A：attention-observation-context.tsと専用テスト、公開観察・候補だけをallowlist。
- [x] B：core/factor replayと専用テスト、gateのみへ接続・既存absence保持。
- [x] 親：比較・集計・保全・freeze、対象回帰とbuild。
- [x] 新独立担当：事前テスト、原本・会計・画像・分布・操作の再計算。
- [x] 親：固定12試行を通常runnerで実行、修正再検証、結果とviewerを保存。
- [ ] 親：独立GOと対象回帰を確認しfeature push、masterへPR統合。

他担当の変更を戻さない。正解場所や人間の過去ログをモデルへ送らない。実行中actorを変えない。失敗を成功として記録しない。
