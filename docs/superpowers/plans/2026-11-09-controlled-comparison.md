# Controlled Comparison Implementation Plan

> For agentic workers: REQUIRED superpowers:subagent-driven-development. User has approved implementation/execution/push; no repeated approval questions. Shared worktree has explicit file ownership; do not revert other edits.

**Goal:** Implement issues2/3 controlled budget, seed and independent information/memory/vocabulary/policy/selection contrasts.
**Architecture:** Reuse runBeta, PhaseBudget, current fixtures/Persona/evaluator/source/replay/viewer. Optional thin plan runner, pure factor projection; parent integrates shared files. Existing CLI path unchanged.
**Tech Stack:** Existing TypeScript/Playwright/Vite, no dependencies.
**Spec:** docs/superpowers/specs/2026-11-09-controlled-comparison-design.md

## Global Constraints
Preserve old sources/raw; no secret logs; existing48batch/12trial; parallel1/retry0/45min/global360; no saved-input resend; no real production actions; no human-fidelity claims. Parent owns contracts/config/core/replay/legacyCLI/protocol/realruns/docs/Git.

## Review Focus
- Hash-consistent tampering and DOM/text candidate leakage in image-state.
- Memory0 still uses same current observation, expectations, candidates and questions.
- Run accounting errors and partial checkpoint; no infrastructure failure counted as voluntary abandonment.
- Seed pairing vs replicate independence, balanced order, upfront allocations.
- Legacy input/output/config and real adapter with local fetch stub still work.

### Task1: Comparison planning and runner
Worker owns new runner/controlled-comparison-plan.ts, runner/controlled-comparison.ts, tests/controlled-comparison-plan.test.ts, tests/controlled-comparison-runner.test.ts and own reports/module-budget only. Pure plan parser/schedule validates all allocations/seeds/configs before IO, runner executes ordinary runBeta with independent caps and PhaseBudget/checkpoint/summary. Parent adds --comparison-plan CLI hook. No shared file edits or Git/env/real calls by worker.
- [x] RED invalid plan/underfunding/balancedseed/order/censoring/accounting tests.
- [x] GREEN minimal runner, mock and fetchstub realadapter verification.
- [x] Parent integration and independent review.

### Task2: Factor projection
Worker owns new jev/virtual-beta/factors.ts and tests/virtual-beta-factors.test.ts plus own reports/module-factors. Parent adds optional FactorsConfig type and validateConfig hook. Module exports validateFactorControls(config):void, factorUsesDOM(config):boolean, factorVisibleText(config,screenText):string[], factorCandidates(original,vision,config):BetaCandidates, factorModelInput(input,vision,observation,state,config,screen,history):Record<string,unknown>. Preserve exact legacy behavior through hooks only when factors defined. New projection anonymizes with visionCandidates constrained policy even with full pixels, extras explicit. Parent owns core/replay hooks and integration tests.
- [x] RED privacy/vocabulary/memory-orthogonality/invalid switches tests.
- [x] GREEN pure module and tests, no runtime edits by worker.
- [x] Parent runtime+strict replay integration, tamper tests and legacy regression.

### Task3: Preflight, actual runs, final review and publication
Parent persists protocols/freeze/prior raw snapshot, executes API-zero mocks then fixed bounded batches and offline comparisons. Start fresh independent context after implementation workers pause. Repair/retest<=3. Publish exact results/commands/source/limits and feature push, no Issue comments/closing.
- [x] Integrated scoped tests/build, independent preflight and fixed source.
- [x] Execute planned bounded cohorts, preserving failures/missing and raw hashes.
- [x] Independent actual audit and final docs; exact staged credential/commit/push records are retained separately under reports/controlled-comparison-2026-11-09/{parent,independent}. No raw rewrites.
