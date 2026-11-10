# Attention Repair Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development.

Goal: 継続偏重の境界を切り分け、排他的・階層的な注視判断を実装し固定比較する。
Spec: ../specs/2026-11-10-attention-repair-design.md
Stack: 既存TypeScript/Jev/Playwright、依存追加なし。

- [x] 基準5eb463e・cleanを確認。独立調査で候補の重複と分布・記憶・配送を検査。
- [x] 親：契約・設定・protocol。設定RED→GREEN。
- [x] A：attention.ts／policy専用テスト。既存API出力保持、2新方策、公開情報projection。
- [x] B：core／strict replay／generic replay／専用テスト。排他的分岐・gazeSelection・上限。
- [x] 親：比較driver・集計、統合回帰、ソースと入力freeze。
- [x] 新しい独立検証：事前テスト、実原本・会計・候補・分布・実操作照合、修正再検証。
- [x] 親：通常runnerで固定24試行、原本保全、viewerと文書、公開用成果物を用意。最終公開検査とfeature pushは最終報告の版で確認する。

A/Bは所有外を編集せず、他者の変更を戻さない。正解座標をコードへ追加しない。実行中actorを変更しない。異常は成功として記録しない。モデルの理解・人間頻度は未検証。

- [x] 第1実験の失敗を保存し、sampleのstream相関を修正・再検証。注視目的だけを変える追加18試行を固定・完走。合計42件222要求、総上限288以内。crop未解決とfoveated部分改善を分けて記録。
