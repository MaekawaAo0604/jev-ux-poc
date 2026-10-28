# Experience-linked exploration implementation plan

> For agentic workers: use subagent-driven-development; user explicitly requested implementation and independent verification.

Goal: Connect observed consequences to prior predictions without prescribing a correct path or banning revisits.
Baseline: feature/virtual-beta-information-state @1821317. Existing deliberation trial repeated settings/news/home despite 12 insufficient assessments. Preserve that historical result.
Architecture: bounded (8 transitions) allowlisted experience memory, independent from 3-image buffer. Each actually executed action is anchored to its source observed image and offered candidate. Next observation closes it. Three categorical questions in the existing assessment call compare predicted goal effect to observed result. No new request stage. Exact image recurrence supplies a bounded route, never an automatic failure classification. User-visible input has no DOM/oracle/participant feedback.
Tech stack: existing TypeScript, Jev choice gateway, Playwright and SHA256. No dependencies or trained model.

## Acceptance
- [ ] Source action/prediction/result/assessment linked; e4 on different images not conflated.
- [ ] Experience survives the image buffer but is explicitly bounded, fallible, and never reattaches unseen old image content.
- [ ] Both pre/post images required for a new outcome judgment; none evidence downgrades to unknown and is logged.
- [ ] Existing baseline and deliberation profiles unchanged. Experience is opt-in; all offered candidates/revisit/done retained.
- [ ] Assessment and action use updated experience; raw distributions, normalization, actual action, and termination saved; replay validates new state.
- [ ] State isolated per trial; malformed distributions fail as invalid rather than success/abandonment.
- [ ] Independent verification and current type/build checks completed before actual experiments.
- [ ] Actual model: max two trials, each 12 judgments/24 requests/180 sec, concurrency1. New ledgers; prior ledgers unchanged. Same UI/goal as archived deliberation, long-context on. No separate UX request.
- [ ] Count recovery only when a previously explored route returns and a subsequent different entry is actually selected/executed. Direct success before a stall is a separate result. No claim of human validity.

## Tasks and ownership
1. Implementation worker owns experience-contracts.ts, experience.ts and its unit tests: test RED then bounded pure functions GREEN; no shared edits.
2. Parent owns contracts/config/core/profile/wrapper/replay and integration tests: RED mode absent then connect pending action on actual execution, arrival before next assessment, outcome questions and locally relevant experience.
3. Freeze source commit; fresh independent verifier runs tests and inspect absence of forced path/leaks/stale evidence. Fix at most three rounds, reverify.
4. Parent real runs and offline audit; independently inspect saved inputs/outputs; document counts and actual capability, commit/push feature branch.

## Review focus
Partial observations; image-id changes; same candidate id across pages; evidence expiration versus bounded semantic recollection; no-action/error terminals; API limits after assessment; legitimiate revisits. Full-screen hash equality is sufficient for recurrence, not necessary; changed rendering can miss recurrence. Self-reported progress is unvalidated model inference.

Ruling: reuse isolated existing worktree and worker ownership rather than new checkout; original working tree remains untouched.
Ruling: API permission persists; self-limit new phase48; no approval prompt or old-ledger reset.
