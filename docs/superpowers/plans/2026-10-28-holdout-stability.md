# Holdout exploration stability implementation plan — 2026-10-28

User approved proceeding with three task classes: alternate-route recovery, required revisit, direct progress. Existing selection policy is fixed; no tuning on outcomes. Baseline4a67772, previous product5abeef3. Reuse current isolated worktree and normal gateway runner. Original E checkout preserved. No new dependencies, external sites, human records, training, or saved-input API replay.

## Contracts, ownership, acceptance

- UI worker: app/holdout-fixture.ts, app/HoldoutFixture.tsx, tests/holdout-fixture.test.ts. HoldoutFixture={task:switch|revisit|direct,variant:alpha|beta}; query/parser/definition/goal/objective/reference path. Three distinct local fictional tasks, two wordings/layouts. Independent audit-only reference path proves reachability; Jev never receives it. Revisit task must actually require initial attempt, identity step, and return. No hover/animation-induced gratuitous differences.
- Analysis worker: runner/holdout-analysis.ts and its tests. HoldoutRunRecord={id,task,variant,replicate,condition:control|policy,initialImageSha256,result:BetaResult}. analyzeHoldoutRuns -> per-run/cell metrics, pair integrity, actual next-audit URL routes, repeat edges, post-return actual branch changes, corrections/releases/ties. Unknown next observation stays unknown; infrastructure faults excluded from task-failure counts. No human/causal inference.
- Parent: main opt-in mounting, typed core fixture/audit/oracle boundary, existing runHumanJev optional fixture, new bounded batch runner/test, shared source freeze/protocol/docs. No changes to deferral/selection/experience algorithm or thresholds. Source/input/config/initial image tracking and complete ledgers/trace/replay.
- Fresh independent verifier after freeze: run browser fixture certification + runner/malformed/legacy regressions, inspect model boundary, source/config/initial reset equivalence, reference not leaked; audit all real completed runs. Implementation workers do not verify their own code independently.

## Fixed comparison

3tasks ×2variants ×2replicates ×2conditions=24 trials. Pair control/policy within same task/variant/replicate; reverse order in replicate2 and alternate pair order. Same no-persona goal mode, full-viewport image-only crop4096, memory3, experience8/basis, argmax/seed20261028, 12 judgments/24 API requests/15 UI actions/3looks/180seconds. Sequential1. Maximum576 requests, total batch wall-time limit20min, failure requests count, no hidden retries, longContext true, no review requests. One new nonreset24-request ledger per trial, prior ledgers hash preserved. No parameter adjustment based on results. Existing broad API/push authorization persists.

Two repetitions per cell are a bounded cross-task stability check, not a statistical reliability estimate. Report successes and failures separately for each task/variant and faults. For switch, success without failed excursion is direct success, not demonstrated recovery. For revisit, objective achievement requires the UI prerequisite+actual revisit, independently certified. Direct arm checks spurious detours/deferral. Exact-image identity limitation retained, not silently fixed.

## Tasks

- [ ] Worker RED/GREEN fixtures and analyzer; parent RED/GREEN typed integration and batch bounds.
- [ ] Integrate, run related regression/type/build, freeze source and protocol; independently accept before live execution.
- [ ] Execute bounded24 actual trials via normal runner, fresh browser each, no human-derived inputs. Save all inputs/images/weights/actions/termination and ledger.
- [ ] Offline replay every completed run; independently audit source/config/reset/ledgers/timing and metrics. Fix instrumentation only with RED/regression/review; do not tune frozen policy or erase failures.
- [ ] Save anonymous report with counts, actual branch changes/necessary revisits/direct success, limits and next tasks. Commit/push authorized feature branch, remote-check.

## Preflight ruling

The UI fixture used onClick-only prerequisite transitions and did not admit native Back as a legitimate home return. Fix the fixture by observing actual route transitions, add RED native-Back regression, reverify all six fixtures/reset/image identity, then refreeze source before any live request. Policy and parameters remain fixed. The initial integration log140 had139 passes/one mount-heading failure while UI was incomplete; final new26 tests pass and resolve that case. Old126 cases passed. Initial independent frozen-policy blob-vs-worktree equality needed newline normalization, not a policy code change.
