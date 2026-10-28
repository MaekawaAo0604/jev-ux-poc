# Temporary entry deferral implementation plan

> Agentic workers: use subagent-driven-development and TDD. User explicitly asks implement and actually try the temporary-priority hypothesis.

Goal: When a completed observed excursion supplies grounded non-progress, temporarily lower its entry priority while other model-plausible entries remain, and release when those alternatives are also deferred. Never permanently blacklist revisits or claim human calibration.
Baseline: dfa2360, existing experience-basis. Reuse isolated worktree, Persona/Charter, image inputs, 8-transition experience, 2-stage gateway, seeded sampler, objective audit. No new dependencies/UI or model training.

## Contracts and ownership
- Worker: deferral-contracts.ts, deferral.ts, unit test only. Bounded8 policy memory from actual model experience. Same-image+candidate identity. Closed route>=2, performed first click, at least one grounded neutral/conflicts/not_supported and no grounded advances, whole-goal not satisfied. Return/unknown alone never sufficient. No DOM/oracle/human log.
- Parent: BetaConfig optional deferral, sampler optional positive weights with complete raw/pre-policy/post-policy records and replay, runner coordination, profile experience-defer, integration tests, comparison artifacts.
- Policy memory remains in runner/step, not injected into model input. Same trajectory and evaluator responses yield identical gateway body before/after enabling policy. This isolates selection correction; it is an explicit engineering heuristic, not a model-learned human behavior.
- Independent fresh verifier after source freeze: actual local tests, evidence/safety/malformed/revisit/release/replay/body-equality audit, then actual saved-run audit. No API/env/human files by verifier.

## Fixed settings
capacity8, defer weight0.01 (strictly>0), minimum model-normalized alternative probability0.01. Both are uncalibrated parameters. Plausible alternatives are current click candidates with that probability, non-conflicting effect; no hidden semantics. Defer only if other plausible nondeferred entries exist; otherwise weights1. Non-click and done/stuck weights1. Never inject mass into model-zero probabilities. Raw model probabilities remain untouched; policy before/weights/weightedTotal and final normalized distribution recorded.

## Acceptance and tasks
- [ ] RED sampler correction/replay, RED profile/integration, worker RED pure state cases.
- [ ] Implement finite allowlisted policy memory/cap1..8, exact matching, closed-route evidence requirements, immutable isolation.
- [ ] Preserve old modes byte-for-byte with no policy option; positive deferral weights, release and legal revisit, no route hardcoding, seed replay.
- [ ] Integrate after assessment and before action execution; record state and correction, reconstruct policy in offline replay and reject edits. Model inputs unchanged given same responses/path.
- [ ] Type/build, related regression, independent test/review; fix/reverify up to3 rounds.
- [ ] New two-trial phase maximum48 requests, each maximum12 judgments/24 requests/180sec, sequential. First experience-basis control then experience-defer treatment, fresh contexts, same ordinarybad UI/goal/persona-none/argmax/seed. No extra UX calls, no old ledger resets, no saved-input API replay.
- [ ] Compare raw argmax and actual policy-selected action on each saved distribution; observe actual route changes/objective independently. Different candidate IDs with same destination are not counted as task-branch recovery. Distinguish direct success, alternative exploration, and post-return switching. No significance/human validity claim.
- [ ] Record implementation/results/limits and push existing authorized feature branch; preserve original working tree.

## Limits
Exact image identity can miss the same screen after scroll/render change. Relevant-candidate threshold relies on unvalidated model probabilities, not human action frequency. Grounded judgments still fallible. A successful heuristic path is not evidence of semantic understanding/human behavior prediction. Stop after bounded runs rather than tune to hardcoded correct candidate.
