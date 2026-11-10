# Deferral evidence separation — 2026-10-29

Active goal: continue improving known deficiencies; this is an iteration, not overall completion. Previous iteration made authoritative progress: commit aed3dcd, live12/208 requests, independent verification. Current source and clean tree confirmed. Reproduce the rejected valid o2 from live alpha-r1/beta-r2 offline first; never resubmit saved requests to the API.

## Contract and ownership

Keep default legacy reason admission unchanged and replayable. Add optional DeferralReasonConfig.basisAdmission='negative-evidence'|'excursion-evidence', absent means negative-evidence. New profile experience-reason-excursion clones experience-reason except id and this field. No task-specific event, route, text or prerequisite release rule. Prompts/questions, capacity8, recency3+original reason1, two API stages, sampler and release conditions unchanged.

For excursion mode, accept blocker basis only when (1) existing deferral actually learned identical image/candidate/from/to generation, (2) selected source is actually attached and an interior non-home result in that same contiguous performed excursion, (3) source order/hash is valid. Do not require the blocker image also to be the earlier negative-progress citation. Retain both authorities separately as captureProvenance={kind:'excursion-evidence',negativeEvidence:ExperienceSource[],excursionEvidence:ExperienceSource[]}, bounded8 each, in capture record and reason entry. No invented/later/out-of-route images; no learning when actual matching deferral absent. Release still requires known cause + attached original basis + strictly later changed source; no automatic release just from progress/argmax/time/exhaustion.

Parent owns module contracts, common config/profile/core/replay and integration/docs. Reused reason_memory worker owns reason module and new pure test file only; preserve old22 tests unchanged. Reused reason_experiment worker owns existing comparison runner and new admission comparison tests only; preserve old9 tests unchanged. Both are not alone; no common file overlap. Fresh independent verifier after frozen source, no product edits, actual stub/browser/evidence checks. No environment/human reads by subagents; real gateway only by parent.

## Comparison fixed before live

Reuse same notifications/revisit-alpha/revisit-beta, two paired replicates, reverse order in replicate2, twelve trials. Old=experience-reason, new=experience-reason-excursion. Same Jev1.14.0, no persona, goal/argmax seed20261028, full viewport, recency3, reason8/basis1, deferralweight.01/minAlternative.01, longContext/1attempt. 24requests/12judgments/15UI/3looks/180s each; max288 requests/20min/sequential1/UX0. Fresh output and ledgers; retain old46 ledgers via previous reason manifest. Broad user API/push authorization persists; no renewed permission prompts. No saved input direct API resend.

Separate admission counts, same-generation reason capture, reviews, releases, actual action changes, terminal objective, failures and infrastructure faults. In notification controls, no eligible reason/review means false-release accuracy is untested, not a zero-error claim. No post-result weight/category/prompt tuning. Additional model failures are next iteration items, not hidden by this change.

## Acceptance

- [x] RED proves valid same-excursion o2 rejected by legacy and admitted by opt-in even if negative citation only homeo3; raw deferral unchanged, separate provenance and replay tamper rejection.
- [x] Negative cases: source not attached, out-of-route, future/home/duplicate/conflicting/invalid path, wrong generation, missing actual learning; bounds/isolation, prior release guards and old wire unchanged.
- [x] Scripted actual browser captures under unknown/supported o2 + neutral homeo3, then attaches o2 at review and acts on effective distribution; still_blocks control retains deferral.
- [x] Related regressions/type/build; frozen source; fresh independent validation and <=3 fix rounds.
- [x] Run fixed live12; independently audit requests/images/46 old ledgers/source/config/pairs/replays/capture/review/release; document outcomes without claiming human reproduction or overall goal completion.
- [x] Commit/push feature branch, preserve raw logs, continue next evidence-backed deficiency while goal remains active.
