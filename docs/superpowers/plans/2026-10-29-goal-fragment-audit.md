# Goal fragment audit implementation plan

> For agentic workers: use subagent-driven-development, RED then GREEN. Existing isolated C worktree, preserve original E changes.

**Goal:** Make the observed Goal-fragment/context concern independently auditable without pretending it deletes the Goal or causes loops.
**Baseline:** b51b26a29d4700900305eb8350bd5a5e1f1ebcdf, productHash1b8c483b2b89c4f9fea113d2529d902ace425ec1a2a75e207109affa81b084c9.
**Architecture:** Read-only TypeScript analyzer under docs/experiments, existing replay and validateChoice reused. No runtime/model/config change, no extra label or penalty. An auditor-authored role rubric is a sidecar, never input to Jev. The provided notification rubric is authored by the parent AI and is not human-validated ground truth. Every conclusion is limited to saved calls and authored rubric; no human fidelity/performance/cause claim.
**Constraints:** HTTP402 restoration unconfirmed: no actual API, saved-input resend, credential/env/human-record access. Never edit original live files. Explicit new output with wx; no default overwrite. No dependency changes.

## Contract and ownership
Parent owns plan, rubric JSON, docs, integration, commit/push. Worker owns docs/experiments/2026-10-29-goal-fragment-audit.ts and tests/goal-fragment-audit.test.ts only. Fresh verifier owns new independent test/report only. Shared C tree, no overlap/reverts.

Exports: auditGoalFragments(result, rubric?) pure; runGoalFragmentAudit({runDirectory,out,rubricPath?}) replay-first, explicit output. CLI --run DIRECTORY --out NEW_JSON [--rubric JSON]. Avoid invoking CLI on import. Module source hash and audited result SHA in CLI output, producer/current source identities distinguished; replay compatibility is not identical producer code.

Rubric: {schemaVersion:1,kind:'authored-goal-role-rubric',goalSha256,fragments:[{id,text,role:'context'|'required'|'undetermined',rationale}]}. Strict goal hash and exact fragment id/text/coverage match for classified frames; roles are authored expectations, not model-generated truth. Invalid rubric fails explicitly. Expected roles never enter model input.

Report preserves actual fragment text/status, original response choice/probabilities and source per frame; raw->record and record->action-memory equality; unchanged full Goal in assessment/action .goal and .exploration.charter.goal; whole-Goal assessment choice; fault/no-response steps separately; explicit recorded-response booleans distinguish stored/prepared inputs from transmission evidence; current classification different from carried memory. Raw distribution validation failures/field mismatches explicit and not normalized. Aggregate per-fragment selections and context probabilities, requested-role/context conflicts by authored rubric, unknowns distinct. No inferred semantic role from regex, no automatic correctness label without rubric or rendered-view labels. Success remains original subjective/objective/termination fields. Compare conflicting context/whole-Goal unsatisfied without treating either as causal proof. Do not copy arbitrary provider fields/errors.

## Acceptance / checks
- [x] Worker RED then GREEN: no rubric, valid rubric, malformed rubric/hash/text/coverage, true context vs required vs undetermined, distribution validity and raw/record mismatch, unchanged Goal in both stages, action-memory copy mismatch, no-response fault, unchanged inputs, output wx/CLI import guard.
- [x] Parent actual raw audit of saved new notifications: 10 classified + HTTP402 step11 without response, 3 literal fragments, required g2 context10/10 with original probabilities, whole Goal unsatisfied10/10, no altered Goal or automatic oracle override. Preserve all original hashes.
- [x] Fresh independent verifier executes normal CLI/replay and adversarial tests; no product edits; fix/retest at most3 rounds.
- [x] Build and regression passed; product sourceHash unchanged. Initial independent35 had7 failures/3P2; fixed and independently reverified83/83 +related71/71, contract-only34pass2skip, raw215unchanged. Final docs/results delivery prepared for feature push. Real12 and semantics improvement remain pending external HTTP402 restoration.
