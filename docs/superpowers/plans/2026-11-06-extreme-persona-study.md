# Extreme Persona comparison implementation plan

> For agentic workers: use subagent-driven-development. User approved direct execution and feature pushes; no budget permission prompts.

**Goal:** Execute eight supplied extreme Personas on the same captured real UI and expose recorded choices/paths in the existing observatory.
**Architecture:** Extend existing public cohort to accept a hash-frozen Persona set; keep legacy baseline/A/B/C default. Add a bounded optional decision limit to existing profile/wrapper, not an alternative actor or replayed decision engine. Keep image extraction, state, selection, safety and oracle-unknown behavior unchanged.
**Tech Stack:** Existing TypeScript, Playwright HAR, ordinary Jev/OpenAI native runner; no dependencies.
**Spec:** User: 「それでやってみようぜ」, following eight JSONs in experiments/persona/extreme-passkeys-v1.

## Decisions fixed before new model requests

Start commit7905e32, isolated C:/Users/Maekawa Ao/.codex/worktrees/virtual-beta/Ux_test; original E: working tree unchanged, .env read only. Fixed existing GitHub Docs4page HAR sha2f3ef9f0...61bb6, charter public-passkeys-charter.json, Personas unchanged. Model/profile experience-persona-unweighted, full existing3stage judgement, seed20261028, max300000ms/native60000ms/UI15/look3, one concurrent trial, no retry/output repair.

- Probe phase: eight actors ×4replicates =32 planned trials, maxDecisions1. Same goal and observations; the cap is harness censoring, not supplied as a click instruction or a goal change. Up to3 requests per selected judgement; existing per-trial ledger allocation36 preserved. Global allocation1152, phase2hours. First-action/distribution/reason endpoint is fixed in advance; not completion/human-likeness.
- Flow phase: eight actors ×1replicate =8 planned trials, existing maxDecisions12. Global288requests, phase1hour. Separate from probes and previous A/B/C cohorts. Known native incompletes/continuity failures remain invalid; three consecutive classified model-invalid trials stop. Safety/provider/quota/accounting/source faults stop immediately, without replacing failed trials.
- Actor order cyclic by replicate; partial counterbalance4 of8positions, not randomized/full Latin balance. Persona pairs compare knowledge/experience/priority/devices; IDs/names also differ; not single-attribute human causal proof.
- Preserve all previous raw. Explicit snapshot of old9468 plus prior130-request model evidence used for metadata/hash preservation, no old human contents/models input read. No direct saved-input API resends; each trial starts fresh with a new screenshot.

## Ownership

- Worker: runner/public-persona-comparison.ts; new runner/public-persona-set.ts; tests/public-persona-comparison.test.ts; new tests/public-persona-set.test.ts. Generalize fixed actor list/options/schedule/identity/summary/resume. No shared profile, wrapper, viewer, dependency or protocol changes.
- Parent: runner/human-jev-profiles.ts, runner/human-jev-experiment.ts and scoped tests; common maxDecisions option; fixed protocol; source/raw snapshot, normal runner experiments, analysis, viewer refresh/docs/integration/push.
- Fresh verifier: dedicated tests/reports only; run build/regressions, mock new set normal flow, cap censoring, Persona delivery/input equality, freeze/resume/path/safety/counts, actual model ledger/evidence and display. No model calls or product edits.

## Steps

- [x] RED→GREEN generic set loading/cohort; legacy schedule/default behavior unchanged. Freeze manifest and each Persona bytes; contained relative paths, no outside/symlink/duplicate/casefold collisions; explicit set CLI and bounded list.
- [x] RED→GREEN optional cap1..existing12 in profile and wrapper; default byte-equivalent config; invalid cap before credentials/output; no change to charter/model action input. Unit + normal mock public integration.
- [x] Integrate, source freeze, independent verification; fix/recheck up to3rounds, keep raw/version snapshots.
- [x] Execute probe32 and flow8 through existing ordinary runner, bounded/stopping rules. Preserve invalid/prepared prefixes, unknown objective, all logs. Record actual counts, never claim planned as executed.
- [x] Compare matched initial screenshots/nonPersona native input, chosen initial actions and normalized distributions; within/between descriptive distances, reason/native evidence self-reports. Separate capped probe/flow/model failures; no human agreement claims.
- [x] Existing viewer indexes new explicit batches with old sets separate. Desktop/mobile and raw+export fidelity, final hash audit, docs, commit/pushfeature (not default/release).


## Actual outcome

Probe32/32 valid capped selections,96requests. Flow8planned/4attempted/0full-valid/4invalid/4unattempted,65requests, predefined3consecutive native-incomplete stop after one timeout. Execution cap and parser remained frozen; failed slots were not replaced. Capped trials are not complete user journeys. Analysis-only P2 selected/nonclick action mismatch was reproduced, fixed and independently retested; all32actual selection counts/TV unchanged. See docs/virtual-beta/extreme-persona-study.md and reports/extreme-persona-study-2026-11-06 for full results and limitations. Human agreement not measured. The execution checkpoint covers the predefined attempt-and-stop protocol; it does not claim eight full journeys or stable Persona differences.
