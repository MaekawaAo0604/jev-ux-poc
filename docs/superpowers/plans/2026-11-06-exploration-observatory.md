# Exploration observatory and real-site Persona study Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development; preserve scoped ownership and evidence.

**Goal:** Log and inspect complete explorations, then compare Persona action distributions on a real information site with repeated trials.
**Architecture:** Reuse BetaResult, existing vision/state/assessment/selection and PublicSitePage. Add a narrow readonly public snapshot adapter and an offline log normalization/export/viewer. Local fixtures/default modes remain unchanged. No new framework/dependencies.
**Tech Stack:** TypeScript, existing Playwright/Vite, static HTML/CSS/JS viewer, Node readonly localhost server.
**Spec:** User request to run a differentiating site and inspect every motion, plus prior population/distribution objective.

## Fixed boundaries

Start3fd144ccbdeb6229ca5b2c873cc711581e9ee647 in existing isolated worktree. Original E:/ChatGPT/Ux_test stays untouched; credentials read only from its.env; API already authorized, no more permission prompts. No production writes/orders/accounts/login/forms/downloads. Real target GitHub Docs Japanese passkey section (source/robots/policy/license checked before acquisition). Freeze rendered pages/assets in HAR with provenance; repeated trials replay real captured UI offline, not a fabricated replacement, and never silently fall back to live. Snapshot coverage/network faults are infrastructure, not user abandonment. Objective knowledge/understanding cannot be independently determined; public objective must be UNVERIFIED/null rather than false/success. All historical local behavior remains.

Existing baseline/A/B/C unchanged; same goal/UI/snapshot/config per group. No click routes, hardcoded Persona choices, revisit bans, or output repairs. Full flow runs bounded by existing profile12decisions/36requests/15UI/3looks/300s. Driver supports up to100attempts per condition, balanced four-position order, capped concurrency, phase/time/API limits, atomic checkpoints and resume with source/config/snapshot identity. Preserve invalid attempts without replacements. Pilot connectivity is separate from comparison dataset. Confirm site usability/candidate limits before choosing main batch size; do not claim400completed if onlypilotran.

## Viewer contract and acceptance

Every raw BetaStep remains available, including non-UI look/reread/wait/done/abandon and failed/unsent stages. Before model input versus audit pixels versus next delivered input versus terminal audit are labeled separately; prepared images never become delivered simply because a file exists. Show observation, available state, self-reported reason, candidates/raw+filtered+normalized distributions, model/actual choice, execution/outcome/errors and separate API/UI/modelled time. Source hashes/config/Persona/charter/runID and original trace links remain inspectable. No internal full reasoning is invented. Missing evidence is unknown, not false/zero.

Catalog filters site/task/Persona/endclass/validity, selects a run, steps through timeline with keyboard; lazily reads per-run detail. First-decision/action distributions use valid eligible trials and display denominator+missing/invalid separately. Use trials not people/human frequencies. Group comparisons by source/config/goal/site/snapshot/initial identity; do not silently pool incompatible batches. Export normalized JSON+CSV+stepsNDJSON. Preserve raw files; only explicitly selected fictional/source batches are indexed, never scan historical human records.

Local builder/server allow GET/HEAD only on127.0.0.1, path/realpath containment, bounded inputs, local hashverified PNGs, no arbitrary remote image fetch/eval/HTML injection. Safe text rendering and keyboard/responsive UI. Reference metadata may be raw, never API credentials. Tests cover traversal/symlink/missing/hash mismatch/XSS/prepared-vs-sent/terminal-vs-next/error-vs-abandon.

## Ownership and steps

- Parent: common contracts, Beta core and runHumanJev integration, log normalization/builder/server, study driver/checkpoints/config/protocol, docs/freeze/publication.
- UI worker: runner/exploration-viewer-ui.ts and tests/exploration-viewer-ui.test.ts only; contractimports parent.
- Site worker: runner/beta-public-site.ts and tests/beta-public-site.test.ts only; HARcontroller/network/scope adapter, no commonfiles.
- Fresh verifier after integration: dedicated tests/evidence only; execute browser/UI/replay, verify raw fidelity, sampling caps/isolation, source after freeze. Report then parentfix/scopedrecheck, max3rounds.

- [x] 1. Parent contracts+failing log normalization/security tests, minimal exporter/server. Worker UI and readonly site module with red/green tests.
- [x] 2. Parent optional adapter/objectiveUNVERIFIED integration and regressions; acquirebounded real-site snapshot, inspect UI and freezegoal/config/site inputs.
- [x] 3. Cohort CLI balances/repeats/resumes/caps, logs all completed/invalid/pending trials and feeds viewer; actualsmall mock and modelpilot.
- [x] 4. Independent frozen verification, fix/recheck as needed. Execute prespecified repeated cohort when validated, track actual counts. No policy changes midbatch.
- [ ] 5. Generate viewer for old36+newruns, browser verify, export raw provenance/results/commands, independent publicationcheck, commit/pushfeature; report modelvsstub and unverified ranges.

## Rulings

User opted out of repeated design/approval questions; proceed within authorized repo/API scope. Stable human behavior means distributions, not identical paths. Effect estimates/uncertainty are descriptive modeltrial estimates, never human agreement. Existing full npm test was nongreen60 during assembly; run relevant frozen regressions and report broad-suite result honestly. Preserve all9468priorrawfiles before/after; source check eachtrial, no repeated gigabyte bytehash in every individualAPI stage. Sampling100 is configurable; sample size is fixed before main execution, not extended until a desired difference appears.

## Execution outcome

Frozen source696fd78a (186files). Independent round1 found missing unknown-size document body accepted as empty UI; owner fixed it, pending-summary classification, native-invalid streak, with RED→GREEN and no output repair. Round2 78tests/76pass/2Windows symlinkskip, buildpass. Separate local regression102pass. Main planned16, attempted5/89requests, zero valid, stopped by consecutive native-invalid rule;11unattempted. Pre-fix2/41requests retained separate. Newreal total7/130requests/41UIactions/48steps; all48viewerraws/151normalizedsteps and prior9468 hashes independently preserved. Implemented logging/comparison, model exploration stability and Persona effect remain unachieved/unvalidated. No human raw sent, no saved-input resend, no production writes. See docs/virtual-beta/exploration-observatory.md and model-review.
