# Persona-relevant task comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Track checked steps and evidence below.

**Goal:** Test whether the existing baseline/A/B/C inputs produce reproducible differences on knowledge-, experience- and privacy-relevant choices.
**Architecture:** Add three fictional local task fixtures to the existing runner/oracle adapter. Keep existing image extraction, user state, unweighted selection and models intact. Use a bounded serial comparison and offline evidence analysis.
**Tech Stack:** Existing TypeScript/React/Vite/Playwright; no new dependencies.
**Spec:** User request 2026-11-06 plus this document's fixed protocol.

## Global Constraints

Existing worktree feature/virtual-beta-information-state starts at eada5546173cc5092c089b0d4a7c365d9cc15fba. Preserve original E:/ChatGPT/Ux_test and existing raw evidence. Never send participant logs to models or directly resend saved inputs. No fixed click routes or persona-specific UI/safety rules. API is already authorized. No production operations. Independent reviewer must execute code and inspect evidence. Human agreement remains unmeasured.

## Fixed design

Three tasks: sessions (revoke other device session, retain this login and password); preferences (save compact layout, distinguish preview from persisted setting); privacy (enable reservation reminders with optional basic/extended fictional data access). Every task uses identical goal/UI/initial state for baseline and unchanged existing A/B/C. Whole Persona JSON is the treatment, not individual field attribution. All same viewport1280x900, common experience-persona-unweighted profile, argmax seed20261028, memory3, long context, native60s, per trial300s/12judgments/15UI/3looks/36requests. Three repetitions, rotating four actor order by task/repetition (partial counterbalance). 36 planned slots,1296 requests maximum,120minute phase maximum, serial1, retries0, no replacements. Stop on source/input/Persona/replay/ledger/safety/auth/quota errors; preserve isolated model-invalid/timeout slots, stop after2consecutive invalid.

No expected actor click route is supplied. Hypotheses: A may consult explanations for unfamiliar authentication terms; B may act directly on known authentication/settings concepts; C may inspect/restrict optional information sharing. All are hypotheses, not mandatory behaviors or scoring rules. Equal actions are valid findings. Knowledge unknown in Persona may still leak from the model; cannot certify a knowledge boundary from one action.

Primary: task-specific observable choices, help/detail visits, persisted-vs-preview actions, scoped permission choices, repeat/revisit sequences, and within/between actor route distances per task. Reasons are short self-report only. Do not rank goal outcomes as naturalness. Distances are descriptive; no post-hoc matcher loosening or pooled cross-task paths. Report invalid/censored trajectories separately. Compare actual initial PNG and native input after removing Persona only within each task. Downstream native interpretations may differ. Use stable observed UI control identities distinct from generated explanation text; never claim identical full decision input. No significance or human-fidelity conclusion from3repeats.

## Boundaries and ownership

- Parent: app/persona-task-types.ts, app/main.tsx integration, runner/virtual-beta-core.ts, runner/human-jev-experiment.ts, driver runner/persona-task-comparison.ts, contracts runner/persona-task-contracts.ts, integration tests, protocol/docs and publication.
- Fixture worker: app/persona-task-fixture.ts, app/PersonaTaskFixture.tsx, app/persona-task-style.css, runner/persona-task-oracle.ts, tests/persona-task-fixture.test.ts only.
- Analysis worker: runner/persona-task-analysis.ts and tests/persona-task-analysis.test.ts only. Input PersonaTaskRecord and raw BetaResult; invalidity before distances.
- Fresh independent reviewer: dedicated verification tests/artifacts only; no product edits. Review after integrated frozen source, mock and live execution.

## Review Focus

- Private audit state/fixture truth must never enter user input/candidate labels.
- Preview must not count as saved; extended access is a real recorded choice, not goal failure by definition.
- Persona binding/nonunit corrections or frame errors must invalidate before aggregation.
- Source, initial pixels/inputs, fresh contexts and actual selected actions must be traceable.
- Missing/invalid trials and API errors cannot be counted as user abandonment.

## Tasks

- [x] 1. Fixture worker writes failing browser/oracle tests, verifies failure, implements3tasks, tests reachability/reset/back/state separation and no external writes. No human completion claim.
- [x] 2. Analysis worker writes failing pure regressions, implements valid-only canonical paths/within-between distances and task-specific factual choices, reasons and candidate target identity vs generated annotations.
- [x] 3. Parent integrates adapter/driver with failing tests, runs regression/build and bounded ordinary mock. Freeze/commit code before real execution; archive runtime and all prior raw hashes.
- [x] 4. Fresh reviewer checks frozen code, actual mock/browser behavior and fault invalidation. Fix and reverify issues before live.
- [x] 5. Execute36real slots, preserve failures, audit perstagePersona/frame/ledger/source/unit weights/initial inputs. Independent reviewer verifies live raw and selected images.
- [x] 6. Publish methods/results/images/repro commands and gate evidence, final regression and raw/source preservation, push feature branch.

## Decisions

Ruling: proceed without another design/budget question, per repeated user direction and explicit API authorization. Reuse existing isolated worktree and previous mode without an extra framework. Existing fixed A/B/C kept unchanged; do not tailor Persona to the fixture. Smartphone behavior remains out of scope because comparison viewport is fixed.


## Execution record

Code2c0876b3dc3848b29ff755885192890c891d2d69/runtime8d591fcb/177files frozen before models. Related67tests/buildPASS; fullsuite2692/2629pass60fail3skip remains nongreen (run overlapped finalassembly, then frozenfocused suite passed). Fresh verifier code/mock/live gates PASS, no productblockingfindings. 36real slots/35valid/1nativeinvalid/292requests; no replacements or retries. Cprivacybasic2/3 vs others0/9, default-basic interpretation preserved, knowledge/experience paths equal. Humanmatch/effectcertainty unvalidated. 9468rawfiles sealed; fullraw and failedharness reports retained. Publication and push tracked in parent/final.json after final checks.
