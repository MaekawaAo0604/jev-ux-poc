# Observation bottleneck fix — 2026-09-23

Scope: batch candidate inspection and remove duplicate public observations. No Jev algorithm, visible-text policy, site safety policy, or test-generation behavior was changed. No new paid exploration was run.

## Live measurement

One observation of the same previously visited public page, using the existing guarded public runner. The diagnostic disables credential loading, executes no actions, and intentionally stops before Jev. Initial page loading is outside the observation timer.

- Before: `reports/observation-profile-2026-09-22T18-25-38.343Z.json`, 72,510.6111 ms.
- After: `reports/observation-profile-2026-09-22T18-51-47.992Z.json`, 120.3536 ms.
- Single-sample ratio: 602.48x. This is not an end-to-end exploration speedup or a statistical latency estimate.
- DOM totals match: 1,621 elements, 384 candidate matches, 1,596 text nodes.
- Output totals match: 17 regions, 528 visible characters, 11 visible controls, same warnings.
- Actual output comparison against original exploration step 2: title, text, candidate objects and warnings are identical. Region text, IDs, provenance, fonts and document-space bounds are identical. Viewport scroll position differs by 18 px, and the independent diagnostic has run-local page ID p1 instead of p2.
- New diagnostic: 11 instrumented protocol sends, zero Locator count/evaluate calls, zero browser HTTP requests during observation. Initial page loads still request normal resources.
- The old 1,570 figure counts Locator count/evaluate invocations, not HTTP requests and not the same metric as protocol sends.
- Recorded production-source hashes were checked against the source used for final verification; visible-text and public-control classification source hashes are unchanged from the baseline.

The companion diagnostic result is `reports/2026-09-22T18-51-48.668Z-public/exploration/result.json`: zero steps, zero actions, audit NOT_RUN. Its PAGE_ERROR is the intentional DIAGNOSTIC_COMPLETE exception, not a failed Jev decision.

## Changes

- `pages/control-observation.ts`, `pages/AutoPage.ts`: one browser-local task collects visible labels, candidates, metadata and private public-control classification.
- `pages/AccountPage.ts`, `pages/PublicSitePage.ts`: retain the actual observed element for actions, recheck public action safety, release handles on re-observation/close. DOM reordering cannot redirect the click. Replaced elements/documents reject stale actions; hash/pushState retain connected targets.
- `runner/public-site.ts`: the next fresh decision observation also completes the previous action's history. No duplicate post-action scan, no stale screen reuse. Final permitted actions still get observed and judged.
- New tests: `tests/batch-observation.test.ts`, `tests/public-observation-cycle.test.ts`, `tests/fixtures/observation-counter.mjs`.
- Diagnostic helper: `docs/experiments/2026-09-23-observation-profile.mjs`.

The duplicate-observation test failed before the runner change (3 observations instead of 2 for one action), then passed. Batched discovery red/green evidence and review corrections are recorded in `2026-09-23-batch-observation-worker.md`. The final warmed fixture includes retained-handle disposal: 18 protocol sends with either 0 or 400 irrelevant controls.

## Final verification

- `npm test`: 159 tests, 158 passed, 0 failed, 1 existing real-OCR skip; 98.574 s.
- `npm run build`: TypeScript and Vite passed.
- Raw generated Playwright test: 3/3 passed, workers=1, retries=0; 6.2 s.
- Maintained POM notifications test: 3/3 passed, workers=1, retries=0; 6.6 s.
- Both replay runs used only the local fixture, without Jev. Existing raw trace/spec and maintained test were not changed.
- Final code review: no remaining Critical/Important findings.

## Limits

The museum goal has not been rerun to completion, so its completion quality and public regression generation remain unverified. Browser-local DOM inspection still scales with page size; retained-handle cleanup scales with visible controls. Tests use a private Playwright protocol hook for counting, which may require maintenance after upgrades. Public screenshots/text remain private local artifacts.
