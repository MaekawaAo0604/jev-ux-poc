# Completion-only evidence images Implementation Plan

> **For agentic workers:** Execute inline using superpowers:executing-plans and test-driven-development. The user has approved this bounded design and requested implementation and live verification.

**Goal:** Resolve loss of previously observed answer content without resending old images during action selection.

**Architecture:** Keep the existing Choice ledger and exploration loop. Resolve only the effective observed requirement sources from saved step PNGs during completionCoverage, verify SHA-256, and attach them alongside the current image. Keep only metadata between observations.

**Tech Stack:** TypeScript, existing Jev Choice client, Playwright, node:test.

**Spec:** User approval in this conversation: completion checks only; no OCR, DOM text, or all-history pixels.

## Global Constraints

- Preserve all existing dirty changes and the current branch; no commit or worktree migration for this continuation.
- Public navigation remains read-only, same-origin, spaced 2000 ms, with max-actions 0.
- No completion by status ledger alone, no silent evidence omission, no route/answer hints.
- Explicit --image-memory-proof retains the current-image-only baseline for comparison.

## Review Focus

- Cancellation/uncertainty must not resurrect older observed sources.
- Changed, missing, or unregistered image bytes must fail closed before inference.
- Completion images must not leak into subsequent action requests.
- Current operation state must override old evidence.
- Every transmitted historical image must have verifiable provenance and no DOM/URL/filename leakage.

### Task 1: Proof selection and model boundary

Files: jev/image-judgments.ts, jev/image-only-input.ts, jev/visual-context.ts; tests/completion-proof.test.ts.

- [x] Write real-boundary tests for effective source selection, current-only action calls, completion-only old assets, deduplication and invalidation, and missing/changed evidence rejection.
- [x] Run `npx tsx --test tests/completion-proof.test.ts`; six failures for missing behavior observed.
- [x] Add completionSources(), optional saved-image loader, metadata registry, hash checks, proof manifest and completion-specific instructions. Preserve legacy constructor behavior.
- [x] Run new tests and existing image-judgments/image-only tests; 22/22 pass.

### Task 2: Runner integration and verification

Files: runner/public-options.ts, runner/public-site.ts, runner/engine.ts, runner/run.ts, runner/report.ts; tests/public-vision.test.ts and fixture; experiment helper and documentation.

- [x] Add CLI/config dependency tests and a real-browser public CLI proof test; observed DECISION_ERROR before loader wiring, then pass after wiring.
- [x] Wire rooted saved-image loaders and settings; report completion-only resend accurately.
- [x] Relevant integration tests 18/18; final build and diff check pass; serial full suite 446 total, 443 pass, 3 skip, 0 fail, 534328.0662ms, exit 0. Log: reports/completion-proof-suite-2026-10-18.log.
- [x] Run actual Jev on controlled positive/partial/cancelled cases, then one scoped NDL exploration; raw outcomes and counts retained. NDL: 13 actions / 70.28s / JEV_DONE; independent full-history retrospective audit still HTTP 400.
- [x] Obtain one independent static review: no Critical/Important findings; one minor coverage gap deferred below.

## Progress / rulings

- Ruling: Continue in the existing dirty feature checkout, without committing unrelated accumulated changes; moving worktrees would drop the implementation this task extends.
- Pre-flight: completionSources returns ImageSource[]; VisualDecisionContext consumes these through its private source registry and optional loader. Runners supply only a rooted PNG loader. Legacy three-argument construction stays unchanged.
- Final: minor (deferred): unregistered-source and reused observation-ID/changed-bytes guards lack dedicated mutation tests. Existing missing/changed file/path and current dedup tests pass; reviewer found the guards present before inference.
- Final review unjudged behaviors: live model comprehension/readability judged separately by controlled calls and live trial, not static review; older full-history retrospective audit is unchanged and its HTTP 400 remains disclosed. No objective-success claim is made.
- Final verification: report QA verified 14 source hashes and 45 local links; no page error or 390px overflow; original result SHA-256 369a5bf6c7c93c1115a7a8538df4f5147e28c14db4cc999ba55a8c2a036d510c unchanged. Separate selected-source audit (steps 9/14/final15) supported, 4919ms; original full-history audit error retained. No user tabs or existing server changed.
