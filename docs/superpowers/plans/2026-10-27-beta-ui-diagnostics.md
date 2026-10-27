# Virtual beta UI diagnostics implementation plan

> For agentic workers: use superpowers:subagent-driven-development. Shared worktree ownership is exclusive by file; do not revert another owner's edits.

Goal: trace observed image → fixation move → newly available information → subsequent choice in real Jev, then compare isolated position/wording UI changes.
Architecture: retain the existing beta runner, model adapter, POM, vision transform, state, sampler and replay. Extend only audit, UI variant identity, controlled comparison and aggregate budget where evidence requires it.
Tech stack: current TypeScript, Playwright, Vite/React, pngjs; no dependency changes planned.
Spec: docs/virtual-beta/phase2-request.md (supplied request).

## Global constraints

No real API before new budget approval. Single run <=12, phase <=48 including errors/retries/additional questions/rechecks; baseline tests explicitly disable JEV_LIVE_COMPOSITE/JEV_LIVE_SEMANTICS. Parent alone runs API; no saved-input direct replay. Initial four-arm diagnosis uses foveated, Jev1.14, same A/goal/UI/viewport/date/fixation/seed. API cap12 and decision cap12 are the only planned initial budget setting changes; UI6/look4/time90sec retained. Initial batch cap32 reserves16 of proposed48 for targeted rechecks/changes, without promising all matrix live runs. No hidden DOM/candidate meaning leaks or correct action hints.

## Review focus

1. Initial screenshots equal only within each UI variant; crossvariant functional reset equivalence separately verified.
2. Position-only preserves same text, size/color, viewport scrolling; wording-only fixed geometry and color; labels/function equivalent, no variant metadata to user payload.
3. Censored runs (API/time/action/look/decision limits) never counted as voluntary abandonment; infra invalid rows excluded.
4. Fixation entry/fully sharp target are geometry measures, never proof of comprehension; proposed vs sampled action kept distinct.
5. F1–F6 regression, aggregate API cap across batches including rejected reservations, replay/model/source integrity.

## Tasks and ownership

- [x] Parent inventory latest clean5f7051d and preserved base, create feature/virtual-beta-ui-diagnostics. Read existing beta docs/types/runner and identify optional live tests.
- [x] Parent complete baseline build/full regression before product changes or parallel implementation; resolve any failure first.
- [x] Parent seek one new API authorization for proposed <=48 requests with concrete saved settings, run initial four-arm diagnosis only if approved; else proceed local and label live unverified.
- [x] Then fresh subA owns a dedicated diagnostic analysis module/tests/doc; inspect current saved real logs, classify evidence, propose minimum fixes to parent-owned code (no shared edits). Do not invent a fix if no bug established.
- [x] Then fresh subB owns comparison UI module/CSS + functional/geometry/reset tests and variant specification; add reference/position-only/wording-only preserving same notification oracle. Parent owns app entry routing changes if necessary, common types/runner/API/deps.
- [x] Parent integrates variant identity and audit-only ROIs, timeline report, subset selection, settings/snapshot/source manifests, aggregate budget admission. Never send variant answer labels/ROIs to model.
- [x] Parent browser/mock3UI×4arms, targeted real followups chosen only from remaining approved budget, record every request+version. First fixes/affectedreference, then UI comparisons (current/combined), no unconditional allmatrix.
- [x] Freeze product commit and start NEW independent verifier; whole final regression + build + F1–F6 +12run mock + replay/hash/geometry/leak/log interpretation. No API by verifier; <=3fix rounds, evidence retained.
- [x] Final docs/ledger: distinguish implementation, observed real cases and human unknowns; max3nexttasks, exact commands/counts and artifacts/commits. No release/defaultpush.

Baseline completed before parallel changes: build and640tests(637pass/0fail/3skip),516.1sec. Approval was initially pending, so A/B began using historical logs/local checks under the fallback clause. Approval then arrived for48new calls; ff372ab diagnosis consumed23 and final4c72c3f UI response comparison21. Initial total44 left4; independent P2/F1 reproduced slow durable reservation crossing request deadline. Parent fixed post-reservation deadline/timeout and unsent classification at ad1d644 after RED→GREEN; new independent reviewer reruns final whole suite after the last product change. Final normal-runner reference-combined recheck consumed4, total48/48, no saved payload replay. Product frozenad1d644. Applicable global C:/Users/Maekawa Ao/AGENTS.md and .codex/AGENTS.md read; imported SuperClaude files absent next to entry.

Final validation after last product fixad1d644: build/tscPASS; full667tests664pass0fail3skip574.7sec, includes5independent additions; mock3UIx4arms12success/API0; live48choices77images andmock48choices78images replayed; final93source hashes match. New live48/48 (23+21+4), no further calls. Independent F1 slow durable admission fixed inone correction round, original failing/partial logs preserved. Human cognition/UI-effect significance unverified.
