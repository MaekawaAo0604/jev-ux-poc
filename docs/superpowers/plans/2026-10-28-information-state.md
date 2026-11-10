# Information-state deliberation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Parent owns integration; module and independent review are delegated. Execute without another planning approval: user explicitly requests implementation.

**Goal:** Make goal-relevant missing information and predicted action side effects available before action selection, without answers, forced gaze, candidate filtering or oracle feedback.
**Architecture:** Opt-in two-stage inference on each normal runner decision: admitted images -> bounded structured model assessment -> normal action distribution/selection. Reuse client, budgets, existing crop/memory, sampler, fixture, oracle and replay. Default absence preserves old one-call decisions.
**Tech Stack:** Existing TypeScript/Node/Playwright/Jev1.14, no new dependencies.
**Spec:** User request to implement the next information-acquisition component; prior semantic-verification.md next task1, inherited safety/evidence constraints.

## Global constraints
- Baseline a064e98, product e13a3be, clean linked worktree, last complete full708/705pass/0fail/3skip.
- New32 requests explicitly approved; perrun8, parent only, no saved payload send. Previous47/48 ledger remains unchanged, new ledger only. No retries beyond one actual attempt.
- No private mapping, audit DOM/ROI/query/oracle in assessment or action input. Assessments are model hypotheses with admitted image references, never certified facts or human cognition.
- No forced look, exact path, removal/reweighting of A/B or done, or objective success reinterpretation. Existing sampler gets the action distribution unchanged except existing safety/look limits.
- Human/user behavior mode may use assessments but receives no automatic goal-optimization override.

## Contracts / ownership
Parent: contracts/config/core/CLI/evaluator/replay/source identity/configuration/experimental budgets/docs/integration.
Worker A: jev/virtual-beta/deliberation.ts, tests/virtual-beta-deliberation.test.ts, docs/virtual-beta/deliberation.md. Parent-owned deliberation-contracts.ts specifies types. build assessmentQuestions(candidates,sources), admitAssessment(response,candidates,current,sources), carryDeliberation(previous,current,config), recordAssessment(state,assessment,config), actionDeliberationInstructions. Sources are observationId/imageSha256 only, all attached admitted crops. Effect questions only current UI-action candidates, max24, fail if exceeded. Citation none downgrades claimed-known prediction/goal to unknown/uncertain with adjustment record. All answer distributions validated. Retain only bounded records whose source and citations still exist in current observation memory.
Worker B (after contract): runner/deliberation-analysis.ts, tests/deliberation-analysis.test.ts. Export analyzeDeliberationRun(BetaResult): accounting/timeline/uncertainty-to-action/constraint contradictions, no internal-understanding claims. Step.deliberation fields modelInput/questions/assetFiles/inputSha256/response?/assessment?/apiCalls/timing?/error?. No product edits elsewhere.
Final fresh verifier: independent tests and report only; actual build, full regression, browser/replay and saved real-model audits. No API or .env access. Fix/reverify<=3rounds.

## Review focus
1. Last-call assessment consumes budget without performing unbudgeted action selection.
2. Evidence citations from expired/other users or unobserved audits never enter state.
3. Unknown effect does not silently remove or reweight any control/action.
4. Assessment API/model/distribution failure stays infrastructure failure, not user abandonment or success.
5. Replay checks assessment input/assets/source provenance as well as normal action selection.

## Task 1: Grounded assessment module
- [ ] Add behavioral RED cases for missing evidence, expiry, state isolation, malformed distribution, unsupported candidates.
- [ ] Implement the declared allowlist parser, question builder and bounded state transfer; test GREEN.
- [ ] Parent reviews interface and focused tests before integration.

## Task 2: Runner integration and comparison
- [ ] Parent RED real-browser contract test: first evaluation assessment only, second action sees assessment, both controls still offered; no objective oracle admitted; gaze updates next actual crop.
- [ ] Add optional deliberation config requiring enabled state and capacity1..8; retain previous state within actual admitted memory. Assessment never executes UI.
- [ ] Account both evaluations through same persistent budget and deadline/model validation path; save nested request/response/assets/hash/timing; distinguish invalid assessment. Action distribution unchanged.
- [ ] Extend offline replay and comparison with assessment audit. Off path stays byte-equivalent to prior model input/questions.
- [ ] Freeze candidate revision after focused regression/build/tsc and scripted/browser tests.

## Task 3: Independent + actual evidence
- [ ] Fresh independent verifier runs final full suite/build/tsc, browser and adversarial checks. Parent fixes and verifier reruns affected tests if needed.
- [ ] New ledger32. Fixed diagnostic: preservation goal, reference A/B, same persona/date/crop/seed, first baseline two runs(max4 calls each), two-stage two runs(max8 each), cue-exposed two-stage positive controls two runs(max4 each) =32 maximum; no replacement/pooling with old12.
- [ ] Every run starts fresh; baseline/new have same initial unmarked/observed image and candidates, differences are declared assessment stage and prompts/state. API8 cap, decisions4 except exposed2, look3/UI4/time90s.
- [ ] Report objective/subjective/exposure/first choice/all errors and counts separately, not human validity; push feature only after verification.

## Evidence-driven amendment before further live calls
Used15/32: baseline5 and two-stage10 calls at b4d6a36. New state was passed, but insufficient/unknown was followed by blind clicks; one unsatisfied goal by done. Add optional candidateEffects projection of the same fallible self-assessment into original candidate descriptions, preserving keys/order/probability selection, no forced look or unknown-action filter. Keep original results. Prioritize revised hidden A/B two trials max8calls/4dec each; if ledger remaining>=4 then run both cue-exposed controls max2calls/1dec each, otherwise record both as budget-not-run. Protocol fixed before further calls in information-state/followup-protocol.json. Offline replay provenance P2 independently reproduced and repaired; no actual recorded input leak found. New freeze/review follows; no fullsuite until final product stable.
