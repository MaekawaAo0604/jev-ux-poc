# Action relations implementation plan

> For agentic workers: use subagent-driven-development, with parent owning shared runner/config/replay and an independent verifier after integration.

**Goal:** Improve prerequisite/intermediate action judgment using image-grounded model hypotheses, retaining old actor and measuring rather than assuming improvement.
**Architecture:** Optional actionRelations config adds categorical questions to the existing assessment request, admits a source-bound current record, and passes it to the existing action request. No extra API stage, images, forced route, label weighting or revisit ban. Native Choice API remains the decision mechanism.
**Tech Stack:** Existing TypeScript, Playwright, node:test, native Jev backend.
**Spec:** User continuation goal and docs/virtual-beta/provider-comparison.md recorded failures at producer 0d4b450; current baseline d219f84.

## Requirements and contract (parent decisions)
- Config: BetaConfig.actionRelations?: {enabled:boolean}; enabled requires state, deliberation, experience and goalSearch.
- New mode experience-action-relations derives experience-goal-search-grounded; only id and actionRelations differ.
- Module jev/virtual-beta/action-relations.ts exports ActionRelationRecord, actionRelationQuestions(goal,current,candidates,sources), admitActionRelations(response,goal,current,candidates,sources), actionRelationCriteria(criteria,record,goal,current).
- Sources are ExperienceSource[] of actual attached current/history images. UserObservation has id/imageSha256/candidateIds. Never read visibleText, labels, action geometry, audit DOM, oracle, fixture condition.
- Record: schemaVersion:1, kind:'model-action-relations-not-fact', source:{observationId,imageSha256}, goalSha256, availability:{status:'blocked'|'ready'|'completed'|'unknown', evidence?:ExperienceSource}, candidates: Record<current UI id,{role:'execute'|'prerequisite'|'information'|'navigation'|'unrelated'|'unknown', evidence?:ExperienceSource, verify:'goal-change'|'availability-change'|'information'|'navigation'|'no-goal-change'|'unknown'}>, adjustments: {field:string,from:string,to:'unknown',reason:'NO_ADMITTED_EVIDENCE'}[]. Current UI candidates = click/scroll/back, max24. Preserve candidate identity/order. At most5 observation IDs backed by at most4 unique images; reject duplicate IDs/conflicting/future source, malformed hash, mismatch current, invalid choice probabilities. Admit only requested prefix answers but require all requested answers; reject unsolicited actionRelation_ answers. Other assessment answers coexist unchanged.
- Prefix actionRelation_: availability, availabilityEvidence, role_ID, evidence_ID, verify_ID. Evidence choices actual source observation IDs plus none. With none, role, verify, availability become unknown with explicit adjustments (not silently factual). Admission makes no free text from response enter record.
- Questions ask about whole literal Goal including subject/constraints; prerequisite means changes an unmet enabling condition, not repeats any confirmation just because useful-sounding. Navigation changes surface; information obtains missing relevant information. No requested result is inferred from a heading. Completion requires evidence for whole Goal; ready is not completed. Model may choose unknown; likely user behavior/persona remains authoritative in user mode. Expectations are checks to inspect after action, never objective proof. Roles are fallible categorical hypotheses, not generated text describing prerequisite semantics or human mental state.
- actionRelationCriteria validates record provenance/goal/current/candidate subset and appends only admitted record data; no candidate reorder/removal or numeric probability change.
- Parent logs step.actionRelations; assessment wire stays old except questions; action wire.actionRelations stores record; nextAction criteria gets annotations. Record is current-step only, not an added unrestricted history. Existing bounded experience memory carries actual consequences for next assessment. Replay reconstructs questions/admission/annotations and rejects forged/missing/unconfigured fields even after input hashes recomputed.

## Ownership
- Implementation A: only new action-relations.ts and tests/action-relations.test.ts; no shared files/dependencies.
- Implementation B: only new runner/action-relations-comparison.ts, tests/action-relations-comparison.test.ts, experiments/virtual-beta/action-relations-comparison.json. Reuse recoverySchedule, sourceIdentity, runHumanJev, replay, verifyTransferFrames, ledger and failure classifiers. Shared files owned by parent.
- Parent: config/contracts/profile/core/replay/integration tests, baseline evidence, freeze, real execution, docs/push.
- Fresh verification agent: own new tests/audit reports; no product edits; actually run tests/replay/evidence inspection.

## Acceptance and evaluation
- [ ] RED then GREEN tests for role/evidence admission, unknown demotion, probability corruption, no secret label/DOM reads; criteria retains original candidates.
- [ ] New mode differs only optional component and ID; disabled/omitted mode old inputs untouched.
- [ ] Browser integration shows categorical answers enter actual action wire, selected UI operation executes, replay passes and detects forged record/questions/config/source.
- [ ] Comparison 24 planned trials = 2 tasks x 3 conditions x2replicates x2actors; Jev only, max576 requests,24/trial,12 judgments,15 UI,3looks,180s/trial,40min phase,parallel1. Alternate actor order/reverse second block. Fresh paired old runs; no historical results as sole control. No replacement/retries/saved-input resends/human data. New output only.
- [ ] Fixed source/protocol/profile/charter/prior hashes before/after trials. Initial product/current assessment image/goal same; questions intentionally differ. Source may not change during live batch.
- [ ] 401/402/403/404/429/accounting stop next trial; failure and no result retained; missing slots not successes. Charged reservations differ from HTTP attempt/reach evidence where unknown.
- [ ] Independent offline verification before live, then audit raw outputs. Compare success and actual intermediate operation/return opportunities, no human-fidelity claim. Failure of model hypothesis is a result, not a reason to adjust oracle/fixture or hide trial.
- [ ] Relevant regression/build pass, raw preserved, docs include commands and limitations; push feature branch only. Whole suite not implied by targeted checks.

## Review focus
- Bogus evidence reference or zero probability selected choice cannot become a current fact.
- Confirmation/info controls are not assumed to change prerequisite; classify from delivered image/history.
- Parent must prevent unknown component appearing in disabled replay; no unlimited state.
- Distinguish availability change opportunity from failing before reaching it.
- Failure/null result and charged-but-no-HTTP ledgers remain visible in analysis.

## Pre-freeze parent review correction
The existing memory3 + reason1 + correspondence1 can contain5 observation IDs backed by4 unique images. Source admission must count IDs and unique image hashes separately. This corrects the initial proposed cap before real experiments; no trial outcomes informed this change.
