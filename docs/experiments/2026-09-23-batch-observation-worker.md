# Batched candidate observation verification — 2026-09-23

Scope: candidate discovery/metadata in AccountPage, AutoPage and PublicSitePage. Runner observation deduplication belongs to the root task and is not part of this worker change. No public website or Jev API calls were made; Chromium tests use local fixtures and intercepted `example.test` routes.

## Red evidence

Ran `node --import tsx --test tests/batch-observation.test.ts` before changing production source.

- The literal eight observed elements, labels, font sizes and PublicSite availability matched the fixture.
- Adding 400 hidden/offscreen native controls increased real Playwright protocol sends from 218 to 4,218, failing the bounded-call assertion.
- AutoPage and PublicSitePage both clicked `other` after DOM reordering, although `chosen` was the observed `e1` target.
- Manual POM role/name ordering already passed.
- Result: 1 passed, 3 failed (14.751 s).

The initial implementation exposed a regression in ordinary AutoPage: native links were newly subjected to PublicSite URL classification. Added and ran the focused malformed/relative-link test; it failed with `Failed to construct 'URL': Invalid URL`. Native public classification is now enabled only for PublicSitePage, while both modes retain graphical-disclosure classification.

## Implementation

- AutoPage executes unchanged `visibleText`, candidate visibility filtering, literal-label association, font metadata and optional public classification in one synchronous browser task.
- Browser handles are created only for selected visible controls, in one property-list operation. Hidden/offscreen candidates incur no individual Locator calls.
- AccountPage retains selected ElementHandles and clicks those exact elements. Reordering cannot redirect an anonymous ID to another element; disconnected/replaced targets fail closed. Handles are released at re-observation and page close. Same-document URL changes retain connected targets; true document replacement invalidates their browser execution context.
- Existing `describeTarget` remains unchanged. Trace generation resolves the selected handle's current Locator index and checks identity before/after description; generated raw tests still require the existing unique semantic locator.
- Manual POM role/name matching, declared ordering and direct `control()` support remain intact. Existing visibility rules and all visible-text policy code are unchanged.
- PublicSite observation consumes the batched private classification. Its actions still reclassify the retained element before guarded navigation/disclosure. Network guard code is unchanged.

## Green evidence

- `node --import tsx --test --test-concurrency=1 tests/batch-observation.test.ts tests/observation.test.ts`: 22/22 passed (14.009 s).
- `node --import tsx --test --test-concurrency=1 tests/batch-observation.test.ts tests/action-trace.test.ts tests/public-site.test.ts tests/graphic-disclosure.test.ts tests/browser.test.ts`: 25/25 passed (51.126 s).
- `node node_modules/typescript/bin/tsc --noEmit`: passed.
- The initial batched fixture recorded 10 real protocol sends with zero irrelevant controls and 10 with 400 irrelevant controls, versus 218/4,218 before the change. After the lifecycle correction below, both samples explicitly include disposal of eight previously selected handles: **18 real protocol sends with zero irrelevant controls and 18 with 400 irrelevant controls**. Counting forwards all actual messages to Chromium; no Locator or browser behavior is mocked.
- Dynamic tests verify the selected `#chosen` trace locator and clicked identity after reordering, then reject a replacement with matching attributes without executing its handler.
- Existing tests cover native/ARIA/details/schema disclosures, graphical and CSS-painted triggers, hidden/pseudo/overlay text exclusion, font ablation, network effects, unsupported actions, manual/automatic POM navigation and trace generation.

## Same-document lifecycle correction

Review identified that Playwright's `framenavigated` event includes hash and `history.pushState` changes. Clearing targets on this event wrongly rejected still-connected observed elements.

- Added AutoPage/PublicSitePage tests before the fix. `node --import tsx --test --test-name-pattern='keeps connected targets' tests/batch-observation.test.ts` failed both cases with the false `ACTION_ERROR: observed target was replaced or detached` immediately after changing the hash.
- Removed the navigation-event cleanup. Existing connectivity/context checks reject old-document targets; normal next-observation/page-close cleanup releases handles without adding observation protocol calls.
- `node --import tsx --test tests/batch-observation.test.ts`: 7/7 passed (5.782 s). Both modes preserve actions across hash and pushState changes, reject stale actions after real document replacement, and execute a fresh target after re-observation.
- `node node_modules/typescript/bin/tsc --noEmit`: passed after the correction.

## Limits

The protocol count is a local deterministic fixture measurement, not a new TNM timing measurement. DOM inspection work still scales with page size inside the browser. Selected-element handle disposal scales with the number of visible candidates, not hidden candidates. The manual POM continues its explicit role/name enumeration. The test's protocol counter uses Playwright's private connection method and may need updating if Playwright internals change.

Changed files: `pages/AccountPage.ts`, `pages/AutoPage.ts`, `pages/PublicSitePage.ts`, new `pages/control-observation.ts`, new `tests/batch-observation.test.ts`, and this note. No runner, existing tests, package/config, or git metadata changes were made by this worker.
