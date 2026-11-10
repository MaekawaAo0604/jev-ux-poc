# Grounded reason review — 2026-10-29

Baseline dbbae0bdcd74d58687fad571418cfc3eeffce1d2 (pushed, clean). Budget diagnostics are independently verified; underlying intermittent OS cause remains unknown. Continue active improvement goal, do not claim human reproduction.

## Evidence and declared intervention

Previous admission real trials alpha-r2 and beta-r1 at o6 selected basis_changed and Evidence=none independently, so release was correctly rejected and useful revisit was delayed until o8. Another alpha trial selected still_blocks despite attached confirmation. The former is a coherent-output interface defect; the latter is a remaining semantic/model limitation. Do not fabricate a joint distribution from saved marginal distributions or send old inputs to API.

Add config deferralReason.reviewMode?:'separate'|'grounded-choice' (absent/explicit separate keep legacy questions and behavior). New profile experience-reason-grounded clones experience-reason-excursion except config id and reviewMode. Same images, recency3+original1, same two API stages and all budgets. A grounded review is one question reasonReview{index}Grounded: unknown / still_blocks / changed_oN. changed_oN is offered only for actually attached later source after the deferral generation and not after current, with different pixels from home and original blocker, with known original category and original basis actually attached. No site-specific knowledge/oracle enters the choice. Decompose selected choice into existing status/evidence, retain full raw distribution, and still re-run all admission generation/evidence guards. No forced release. A syntactically coherent choice does not establish correct semantic reasoning.

Parent owns shared type/config/profile/core/replay integration, parent tests, freeze and integration/live/reporting. Worker reason_memory owns jev/virtual-beta/deferral-reason.ts and new tests/deferral-grounding.test.ts only; no common edits. Worker reason_experiment owns runner/deferral-reason-experiment.ts and new tests/deferral-grounding-experiment.test.ts only. Same worktree, preserve others. A new-context verifier follows integration; product fixed during verification and live trials.

## Comparison and acceptance

- [x] RED/GREEN for config validation/profile-only difference, actual grounded questions, coherent decomposition, bad/old/unattached/unchanged/unknown/generation cases, legacy equivalence.
- [x] Core and offline replay reconstruct the same declared form; all raw choices and selected actions remain distinct. Bad grounding and tampering must fail closed.
- [x] reason-grounding comparison old=experience-reason-excursion vs new=experience-reason-grounded, same12 schedule (3scenarios x2reps x2conditions), only id/reviewMode excluded from pair config check, old comparisons unchanged. Preserve predecessor58 ledgers if present.
- [x] Independent verification with real browser/fetch stub, legacy/basis unchanged controls, exact actual input and action, no secrets/human/API by verifier. Fix/recheck at most3rounds.
- [x] Related regressions/type/build, legacy saved replay. Freeze source/revision before live. No edits during live.
- [x] Real12 bounded trials: max24requests/trial, max288phase,12judgments/15UI/3looks/180sec pertrial,20minphase,parallel1, oneattempt. Normal runner only with fictional local data, no old inputs or human data sent. Existing unlimited user authorization; caps remain explicit. Compare actual review latency/release/route/UI/success and false-release examples, not structural disappearance of changed+none as evidence of understanding.
- [x] Report exact counts/faults/pair integrity/replay/prior ledger preservation/limits, independent audit, next semantic and identity/preview work. Commit and push feature only. Active goal remains ongoing.
