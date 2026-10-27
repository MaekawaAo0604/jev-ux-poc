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
- [ ] Parent seek one new API authorization for proposed <=48 requests with concrete saved settings, run initial four-arm diagnosis only if approved; else proceed local and label live unverified.
- [ ] Then fresh subA owns a dedicated diagnostic analysis module/tests/doc; inspect current saved real logs, classify evidence, propose minimum fixes to parent-owned code (no shared edits). Do not invent a fix if no bug established.
- [ ] Then fresh subB owns comparison UI module/CSS + functional/geometry/reset tests and variant specification; add reference/position-only/wording-only preserving same notification oracle. Parent owns app entry routing changes if necessary, common types/runner/API/deps.
- [ ] Parent integrates variant identity and audit-only ROIs, timeline report, subset selection, settings/snapshot/source manifests, aggregate budget admission. Never send variant answer labels/ROIs to model.
- [ ] Parent browser/mock3UI×4arms, targeted real followups chosen only from remaining approved budget, record every request+version. First fixes/affectedreference, then UI comparisons (current/combined), no unconditional allmatrix.
- [ ] Freeze product commit and start NEW independent verifier; whole final regression + build + F1–F6 +12run mock + replay/hash/geometry/leak/log interpretation. No API by verifier; <=3fix rounds, evidence retained.
- [ ] Final docs/ledger: distinguish implementation, observed real cases and human unknowns; max3nexttasks, exact commands/counts and artifacts/commits. No release/defaultpush.

Baseline complete: build and640tests(637pass/0fail/3skip),516.1sec. New API authorization pending, zero new requests. Proceeding with historical5b logs and local checks per fallback clause, never labeling them current live diagnosis. Applicable global C:/Users/Maekawa Ao/AGENTS.md and .codex/AGENTS.md read; imported SuperClaude files absent next to entry.
