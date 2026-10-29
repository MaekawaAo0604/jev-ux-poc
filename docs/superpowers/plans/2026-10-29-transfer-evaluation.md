# Frozen-method transfer evaluation implementation plan

> For agentic workers: use superpowers:subagent-driven-development. Existing isolated worktree; shared files have explicit owners. User authorized execution, subagents, real gateway usage and feature push; do not pause for repeated approval.

**Goal:** Evaluate the current method on newly authored tasks/screens without optimizing exploration against their results.
**Architecture:** Reuse normal human-Jev runner, durable phase budgets, image observations and replay. Add an opt-in transfer UI/oracle adapter, separate fixture type and bounded evaluation runner. Do not change actor questions, memory, sampling, correction weights or transport.
**Tech Stack:** Existing TypeScript, React, Vite, Playwright, pngjs; no new dependency.
**Spec:** User approved the immediately preceding proposal: freeze current method and repeat evaluation on tasks/screens not used for tuning.

## Fixed contract and acceptance

- Baseline: feature/virtual-beta-information-state at 999a7e451917c0ec05c0961d6d417a5ea43a180d, product source f65a0feaef10f31c512b008685ddbc359715dc99bc9c0dd8bd28b49fd9b9f063.
- Actor: humanJevProfile('experience-goal-search-grounded'), persona=null, config exactly unchanged, Jev1.14, longContext=true, maxAttempts=1. No correct paths, participant data, audit DOM or fixture identities in model wire.
- New tasks: catalog (save a Saturday/subtitled screening), draft (save target memo scope as team-only), help (display the named event's meeting-place and belongings information). Each has alpha/beta layouts/content assignments, three repeats: 18 novel trials.
- Existing direct-alpha is a sentinel once per repeat block, three trials separately reported. It is already exposed and is never counted novel.
- Schedule: three deterministic blocks, each sentinel then six novel cells; rotate the six-cell order by two positions per block. No model result changes a later task/config.
- Limits:21 trials,504 total gateway requests,24/trial,12 judgments,15 UI actions,3 looks,180s/trial,45min batch,parallel1. Stop on HTTP402 or two consecutive infrastructure failures, preserving all accounting.
- New TransferFixture={version:1,task:'catalog'|'draft'|'help',variant:'alpha'|'beta'}. app/transfer-fixture.ts defines query/parser and visible content, goals and objective text. Separate certification paths stay out of rendered UI and model input.
- Objective oracle: catalog requires saved qualifying item, draft requires committed team scope (pending state is insufficient), help requires both fields visibly displayed. Help exposure to a successfully answered model request is a separate metric derived from exact delivered current frame; display/access is not reading or understanding.
- Hypotheses and tasks must be frozen in Git before real calls. Fixture/adapter defects may be repaired with separate versions/batches; never tune actor/UI to obtain model success. Preserve incomplete/failed runs.
- Source provenance: pin every baseline file except explicit fixture adapters (app selectors/main, runner core/wrapper). Record exact adapter diff and hash all newly frozen sources. All jev/pages, profile, evaluator, transport, selection and budget modules remain byte-identical.
- Repetition metrics: objective and subjective completion, invalid/infra/API/safety/limits separately; paths and within-cell variation, UI/looks/requests, controller-changed selections, config/initial image consistency. No stability threshold or human-fidelity claim from success count alone.

## Ownership and steps

Parent owns common contracts/registry, app selector wiring, core/wrapper/oracle adapter, protocol, integration tests, freeze, real execution, final docs and feature push.
Worker A owns app/TransferFixture.tsx, app/transfer-style.css, app/transfer-certification.ts and tests/transfer-fixture.test.ts only.
Worker B owns runner/transfer-evaluation.ts, runner/transfer-analysis.ts, tests/transfer-evaluation.test.ts and tests/transfer-analysis.test.ts only.
Workers are not alone, must not revert others, and must request contract changes from parent. No worker reads credentials or calls the real gateway.

- [x] Capture baseline source/config and existing sentinel wire before adapters. Write failing registry/parser tests, then minimal registry contract.
- [x] A: actual-browser RED/GREEN for all six tasks, wrong target/unsaved/partial information/reset/native Back. UI text/layout authored before model runs, no prompt instructions.
- [x] B: RED/GREEN schedule, caps, failures, fresh IDs/ledgers, exact config/initial consistency, accounting and analysis denominators. Reuse runHumanJev without another evaluator.
- [x] Parent: actual wrapper transport stub checks, fixture opt-in conflicts and wire allowlist, old sentinel byte-compatible inputs, objective negatives, bounded transfer metadata and replay.
- [x] Integrate, type/build and relevant regression. New independent reviewer verifies actual tests and outcomes; fix/reverify up to three rounds.
- [x] Commit freeze73b1ff3 before real calls; bounded run stopped HTTP402 at13attempts/92requests; preserve all old/raw sources and independently audit frames/distributions/actions/termination.
- [ ] Finish the8 unattempted slots after service recovery; do not call21planned completed or rerun the failed slot.
- [x] Save protocol, partial results, limitations, commands and raw-fix provenance.
Delivery: feature branch only; parent verifies remote after committing this report. No default-branch push or release.

## Review focus

Unknown/conflicting selectors fail closed; no oracle/correct-label leakage through IDs/candidates; save-preview and wrong-target cannot satisfy oracle; help display vs delivered observation are separate; incomplete/error trials do not improve success denominators. Same cell comparisons require exact config and initial image consistency, not just task labels.

Ruling: use newly authored fictional local UI, not existing exposed holdout fixtures as novel evidence. This preserves authorization and controlled reset; transfer to real products remains unmeasured.
Ruling: retain the full-viewport crop/goal/argmax profile and persona=null. This measures current autonomous capability, not persona prediction or visual-constraint effects.
