# Grounded deferral reason review — implementation plan

User approved trying reason memory and model reevaluation instead of per-site release rules. Baselinea106214; work in existing isolated feature branch, originalE checkout untouched. Reuse choice API, two-stage assessment/action, old deferral, image capture, budget, replay. No new dependencies, UI or completion fix. No permission questions: broad gateway/push authorization persists.

## Design and boundaries

Reason worker owns deferral-reason-contracts.ts, deferral-reason.ts and pure tests. Experiment worker owns new bounded comparison runner/schedule tests. Parent owns shared config/profile/core/replay and integration tests/docs. New fresh verifier after source freeze independently exercises browser/adapter/replay and saved live evidence. No concurrent edits to shared sources.

New config deferralReason={enabled:true,capacity:8,maxReasonImages:1}, modeexperience-reason. Oldexperience-defer unchanged. Closed-route reason capture is provisional until the existing algorithm really learns matching raw deferral. Store a generic model-hypothesized blocker category plus actual admitted blocked-image source, tied to exact image/candidate/from/to generation. No task-specific verification/route/label exceptions.

At an applicable later return, attach at most one retained original reason image in addition to existing recency3 images. This deliberately changes both bounded hypothesis memory and information available to assessment; it is not a pure weight-only ablation. Only references actually retained in the bounded reason memory may retrieve a past image; never mine audit history. Model must compare original blocker and later evidence, return still_blocks/basis_changed/unknown and cite later admitted evidence. Valid release needs known reason, old image actually attached, new source strictly after deferral learning and different from unchanged home/oldblocked pixels. Any progress, highest probability, hope, elapsed time or exhaustion alone is insufficient. Semantic relevance is still a model judgment, not independently proven.

Existing raw deferral memory remains intact; record effective memory and the per-generation release separately. A newly failed excursion may create a new generation and defer again. Save context, actually transmitted assets, raw category/review choices, adjustments, retained/released entries and actual sampler/action. Replay reconstructs context/reasons/effective memory from original responses/assets and detects tampering. Oldmodes keep identical input/algorithm behavior; optional module only newmode.

## Acceptance and tasks

- [ ] RED/GREEN pure reason capture/review/caps/isolation/malformed; parent config/profile and actualbrowser scripted changed/stillblocked integration+replay/tamper.
- [ ] Related regression/type/build; old live artifacts remain replayable and old wire unchanged. Fresh independent verifier on frozen source, fix/reverify<=3rounds.
- [ ] Fixed live12 schedule: originalnotificationbad, revisit-alpha, revisit-beta ×old/new ×2repeats, reverse pairedorder. Same goals/UI/personanone/argmaxseed20261028/recency3/deferralweight0.01, new reason basis image max1. Each12judgments/24requests/180sec, total288requests, phase20min, sequential1, longContexttrue, attempts1, UXcalls0. New pertrial24ledger, preserve old34 ledgers. No saved-input API replay or human records.
- [ ] Independently audit all saved live runs, actual source/initial equality/configdiff, capture/review/release basis and actual choices/paths/objective/faults/replay. Distinguish review success, reason never learned, no matching evidence, semantic false release, and merely prompt-induced response differences.
- [ ] Document counts, limits, exact commands, priority of unresolved behavior; commit/push authorized feature branch after checks. No human reproduction/general reliability claim.
