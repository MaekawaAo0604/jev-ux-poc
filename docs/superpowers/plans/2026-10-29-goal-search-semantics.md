# Goal role/state and navigation correction implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development. Existing isolated worktree, shared file ownership; no extra checkout or dependency.

**Goal:** Correct two observed semantic contract defects using separate goal-role/current-evidence decisions and navigation/execute alternatives, then measure normal-runner behavior.
**Architecture:** Opt-in interpretation role-state-v2 on existing GoalSearch. Legacy path byte-compatible. Same two API stages/images/candidates/sampler/oracle; no forced correctness or revisit prohibition.
**Tech Stack:** Existing TypeScript, Choice API, Playwright, pngjs.
**Spec:** User repair request and docs/virtual-beta/goal-search-resumed.md (14 navigation/target and 38 action/context conflicts).

## Contract / ownership
Parent owns goal-search-contracts.ts, config.ts, runner core/replay/profiles/experiment and integration tests. Worker owns only goal-search.ts and tests/goal-search-semantics.test.ts. Not alone in shared tree; no reverting other changes.
GoalSearchConfig gains interpretation?:'role-state-v2'. Entry gains same optional discriminator; requirements gain role?:required|context|uncertain (mandatory v2); v2 assessment forbids context and is observed|not_shown|contradicted|uncertain. Finding gains navigation (candidateId required like target). questions/admit gain optional final interpretation argument. Old omitted argument must preserve output and behavior.
V2 uses goalSearch_role_N to classify each literal fragment in full Goal independently of current evidence, plus goalSearch_image_check_N for current evidence excluding context. Required actions need not be independently grammatical. goalSearch_finding has execute_eN and navigate_eN; execute maps target, navigate maps navigation. Prerequisite/guidance/no_target_in_view/uncertain remain. No audit DOM/labels/manual expected role enters model input. Fallible roles may be reconsidered; inconsistencies remain visible, never normalized to an expected answer.
V2 entries/role states are strictly validated and copied through both model stages, bounded to8, source/goal-bound, no mixed legacy/v2 memory. Findings never prove goal completion or force action.

## Acceptance / review focus
- [x] Worker RED then GREEN: independent role/state decisions, required-but-not_shown, honest context, unknown, execute vs navigate, invalid probabilities/roles/mode/state, bounded copy/isolation, historical nav vs target, legacy exact regression.
- [x] Parent RED then GREEN: config rejects unknown modes, v2 profile, core sends interpretation to questions/admit, replay reconstructs and rejects role/finding/question tampering, old disabled/legacy unchanged.
- [x] Parent comparison goal-search-semantics: existing3scenarios x2arms x2reps, old=experience-goal-search/new=experience-goal-search-v2, only id/interpretation excluded from paired config; max12trials/288req,24trial/12decisions/180sec/20min/parallel1, no retry, preserve106 prior ledgers and all saved raw.
- [x] Frozen source159d5bdb: fresh independent20/20,17 savedreplays,60 saved legacy question/record comparisons,106 priorledgers/648 artifact hashes. P2 summary exclusion wording fixed without changing actor. Build/tsc success; newfixture charset fixed and verified separately.
- [x] Real normal-runner12 (210requests,old6/6,new5/6; independentraw/png audit completed), no saved input resend/humaninput/envlogging. Audit actual roles/states/execute-nav images/distributions/choice/routes/termination; separate model-vs-controller effects. No promise semantic fix solely from tests.
- [x] Relevant tests/build and complete project command executed; all1666=1656pass/7fail/3skip preserved. Seven failures repaired without relaxed assertions,42related/13independent pass; actual12-run raw/image audit and docs complete.
- Feature publication target: feature/virtual-beta-information-state; final remote commit verification is reported with delivery.

## Rejected options
No specific string override, no role forced from grammar, no DOM-derived navigation truth supplied to actor, no permanent route ban, no changed deferral weights, no extra reasoning API stage or new framework. Real semantic errors remaining after v2 stay explicitly unresolved.

Engineering evidence: worker RED22fail/13pass then106GREEN. Parent integration RED4 then5GREEN, combined123GREEN, post-review51GREEN and5UTF8 fixtureGREEN. Independentround1 18/19 (known P2), final20/20 plus typecheck. Full npm test concurrency2 was attempted and interrupted after4 browser/bootstrap failures; isolated action-trace/browser5/5 passed, isolated standard budget reserve/settle-response2 fail atinitial OBSERVATION_ERROR/API0. No claim fullsuite green; carry filenames/results in finalreport.

## Follow-up from independent raw review

Observed defect: six contradicted judgments had no earlier observed fragment. Keep v2 roles/nav interpretation and existing images/stages/actions/controller; add optional evidenceMode=source-grounded and exact contradicts:ExperienceSource. The bounded prior admitted memory is the only source of offered contradicted_oN alternatives. Full raw original responses remain immutable; absent choices are validation, not learned semantics.

Parent owns shared contract/context (optional sixth argument {mode,prior}), config/core/replay/profiles and goal-search-evidence comparison (v2 vs grounded, only id/evidenceMode excluded), initial-load timeout regression, docs. Worker owns goal-search.ts and goal-search-evidence.test.ts. Independent owns evidence-independent tests and review artifacts. Same shared tree ownership, no code overlap.

Acceptance: reject unbound/future/wrongGoal/wrongfragment/hash/mode/probability references; preserve earlier admitted source references after eviction without creating a new source; new contradictions require a currently retained observed source at every public admission/storage boundary. Legacy/plain contradicted exact replay stays unchanged. Real Chromium positive source transition and forged/rehash negatives, new comparison uses same3scenarios x2 x2, 12trials/288requests upperbound and118priorledgers. No savedinput resend, humaninput, additional stages/images/weights.

Separate reproducible infrastructure defect: standard initial goto hard10sec defeats maxRunMs90sec; replace with min(30sec,remainingbudget), no retry. RED delayed10.5sec/20sec and delayed600ms/150ms tests; GREEN2/2 plus former failing standard budget2/2. Product2cf initial snapshot archived before independent repair. Independent P2: remember storage boundary permits a new orphan source or a new recitation of an evicted source. Keep two failing assertions, fix current-entry validation separately from legal inherited reference-copy semantics, then independently reverify before real model batch.
