# Persona comparison on the unweighted virtual-beta runner

**Goal:** Run baseline/A/B/C under common UI/charter/profile and compare motion, within-condition variation and persona-consistency evidence, not rank goal success or claim human fidelity.
**Architecture:** Reuse Persona parser/files, runHumanJev/runBeta, user behavior action instructions, current visual extraction/memory, no-reweighting, replay/frame/ledger/safety and motion analysis. Parent owns common runner/profile/contracts/driver; implementation worker owns pure persona-analysis module+tests; fresh independent reviewer audits frozen code then actual raw trials.
**Tech Stack:** Existing TypeScript, Playwright, Jev gateway plus existing OpenAI Responses visual extraction; no dependencies.

Baseline129e452, runtime9f1dc698; isolated linked worktree feature/virtual-beta-information-state. Original E:/ChatGPT/Ux_test dirty worktree untouched.
Existing persona A explicitly permits fixed same viewport; no persona files changed or smartphone viewport claim.

- [ ] Parent: add optional parsed/cloned Persona to existing runHumanJev and CLI; manifest/result/native/assessment/action propagation; baseline absent unchanged; validate before output/API; no oracle or DOM leakage.
- [ ] Parent: common new profile experience-persona-unweighted derives experience-inquiry-policy-off, only common id+behavior=user changed. All4 actor configs identical. Existing goal defaults unchanged.
- [ ] Worker: pure analysis + unit tests. Reuse routeDistance and motion analyzer. All recorded prefixes retained separately from valid complete runs. Exact same-screen candidates/reasons/distributions; within/between path distances; optional exact blocked-label permutation reference using only >=2 complete4-actor replicate blocks, never human-naturalness or definitive causal test. No forced trait/path scoring.
- [ ] Parent: 12 fixed slots workshop/unchanged × baseline,A,B,C ×3reps; rotated order disclosed as partial counterbalance. Fresh browser/state each. Fix persona file hashes/profile/charter/protocol/source and preserve7623prior raw. Max36requests/12judgments/15UI/3looks/300s pertrial, native60s; max432requests/66min, serial1/retry0/no replacements.
- [ ] Isolated invalid model output/timeout -> preserve invalid trial and continue next scheduled slot. Stop auth/quota/accounting/source/UI-input/audit failure immediately;2 consecutive infrastructure/output-invalid trials stopphase. This policy declared before calls; no source/acceptance relaxation after outcomes.
- [ ] Mock/integration/related regression/build; freeze source archive and independent code review/fix/reverify before real.
- [ ] Fresh live12 with ordinary runner, fictionalUI/PERSONA only, no human records/cached-input resends.
- [ ] Seal raw; independent replay/requests/persona/native+assessment+action delivery/state isolation/initial image & non-persona input matching/analysis/manual consistency review; repair demonstrated code faults only and preserve all versions.
- [ ] Report Japanese outcomes including observed difference vs random variation, contradictions/not-exercised/unknown with evidence. No success-based ranking, no human fidelity. Docs/research/tasks, commands, feature push.
