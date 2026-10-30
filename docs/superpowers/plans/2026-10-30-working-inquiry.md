# Working inquiry implementation plan

> For agentic workers: use subagent-driven-development; parent owns common integration, independent fresh verifier after freeze.

Goal: Test whether choosing an explicit unresolved working condition and observable check in the existing assessment stage helps intermediate action selection.
Baseline: feature/virtual-beta-information-state a25ab9cb441aeae2387067dd8212a9f445fe3afb, runtime 9ffb0aa77e39c5d8cb4a14837781459f4802e5e20befecf8eff461e379ae5aa3, sealed6270 prior raw.
User opts out of repeated questions and authorizes implementation, bounded API use, subagents and feature push.
Existing linked conditions reach decisions but do not establish behavioral improvement.
Evidence: Jev library o8 gets prior unresolved reconciliation but selects return(.69) over untried reconcile(.20), predicts unknown and no-goal-change; OpenAI library o5 repeats a locally recalled neutral check. Missing or null expected observations remain a model issue, not proven transport failure.

Architecture: One opt-in workingInquiry flag on visualHypotheses, requiring enabled/priorConditionLinks/continuity/candidateChecks and deliberation. Reuse existing native image extraction, memory, sampler and two-stage choice API. Add exactly3 categorical assessment questions: workingInquiry_condition, workingInquiry_intent, workingInquiry_check. No extra API stage, route, role/weight correction, revisit ban or observer-only facts. New profile experience-working-inquiry inherits prior-links; default and native body/schema unchanged.
Model intent distinguishes change_condition/test_condition/find_route/unknown. Check distinguishes condition_changed/condition_status_known/new_route_visible/unknown. Historical condition evidence remains historical and selected working target remains a model hypothesis. Selection receives the record and per-candidate relevance from already validated current/prior links. No hard preference or filtering follows.

Contract:
- Context uses current admitted visual record and revalidated continuity after-memory, plus admitted prior relations. Source and goal tied exactly to current request.
- Current options are non-satisfied c1..c3 hypotheses. Recalled options are after-memory grounded-unmet, not satisfied, whose grounding is historical. IDs current_c1 / recalled_o1_c2. Capacity <=6. Exclude evicted, resolved, unrelated goal and audit-only data. No semantic string matching or invented identity merging.
- Candidate rows use only supplied candidate IDs, existing currentControlEvidence and explicit model conditionIds/prior links. Missing links stay empty.
- Record closed schema/source/goal/contextSha256 plus choices {conditionKey,intent,check}; raw choices kept; unsupported combinations downgrade to unknown with explicit adjustments. No claim of expected outcome actually observed.
- All added questions and both input contexts, action record, criteria and instructions must rederive in replay; rehashed tampering must reject. Partial failures cannot appear successful.

Ownership (shared isolated worktree; do not revert others):
A owns jev/virtual-beta/working-inquiry.ts and tests/working-inquiry.test.ts.
B owns jev/virtual-beta/working-inquiry-projection.ts and tests/working-inquiry-projection.test.ts.
Parent owns working-inquiry-contracts.ts, common config/types/core/replay/profiles/mock/comparison and integration tests.
Workers must return common contract proposals instead of touching parent files.

Acceptance:
- [ ] RED then GREEN tests for eligible options, bounded after-memory, historical scope, closed choices, invalid distributions and source isolation.
- [ ] Closed projection preserves all candidate IDs/order, model hypotheses, unknown cases, no weights or automatic action.
- [ ] Existing native body/request/schema and old decision modes remain unchanged when disabled.
- [ ] New decisions actually receive selected working condition+intention+observable check, with raw and admitted choices auditable.
- [ ] Rehashed record/context/question/criteria/instruction/config mutants reject; actual scripted UI and default regressions pass.
- [ ] Independent fresh reviewer runs code and tests against fixed snapshot; fix/reverify <=3 rounds.
- [ ] Fresh real run: checks prior-links vs working-inquiry on existing library/workshop unchanged fixtures, reversed actor order;12judgments/15UI/3looks/300s/native60s/36requests each; total4trials144requests, parallel1/retry0. Never replay saved inputs or human data. Optional fresh OpenAI functional2 is separate72cap and not causal provider comparison.
- [ ] Goal success, intermediate check, model-output/API errors, subjective completion and limits remain separate. Report failures honestly, no human fidelity or stability claim from one repeat.

Steps:
1. Implement/verify modules independently with RED evidence; parent integration and exact replay.
2. Freeze producer source and sealed raw; independent verification; repair findings.
3. Commit producer, run ordinary bounded comparison, seal outputs, independent raw audit.
4. Publish exact results/commands/remaining tasks and push feature only.
