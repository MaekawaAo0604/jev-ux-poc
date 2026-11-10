# Attention Reselection Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development.

**Goal:** 見る場所の独立判断を実装し、同条件のON/OFF実Jev比較を残す。
**Architecture:** 既存factor入力・画像配送・sampler・runner・strict replay・比較台帳を流用する。
**Tech Stack:** TypeScript、Jev、Playwright、node:test。依存追加なし。
**Spec:** ../specs/2026-11-09-attention-reselection-design.md

- [x] 基準9e403ae・clean・既存孤立worktree確認。既存結果を保存。
- [x] 親：contracts/config、固定study・plan、受入条件。設定テストRED→GREEN。
- [x] A attention_component：attention.ts・専用テスト。公開情報allowlist、continue/look候補、質問。
- [x] B attention_runtime：core・factor replay・generic replay・専用テスト。二段階要求と監査・上限。
- [x] 親：型チェック・対象回帰・モック疎通後にsource/inputをfreeze。過去原本のhash保全。
- [x] 親：固定3batch最大144要求で実行。actorは実行中編集しない。失敗枠を置換しない。
- [x] 新しい検証サブ：コードと実原本を独立検証。問題を修正し再検証。
- [x] 親：比較結果・コマンド・限界・次タスク、viewer、公開物を準備。最終公開検査とfeature commit/pushの版は最終報告で確認する。

Review focus: hidden DOM/監査漏洩、continue後API枠、attention-only時のreplayとcounter、記憶とsamplerの試行分離、旧方式の契約降格。変更所有は重複させない。正解場所をコードへ追加しない。
