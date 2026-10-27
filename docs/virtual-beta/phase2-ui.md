# Phase 2: controlled notification entry comparisons

Implemented against the local GoodUI in the `feature/virtual-beta-ui-diagnostics` worktree, starting at `5f7051d`. The existing React app is reused; notification stopping, its initial state, its destination panel and its objective success text are shared by all variants. These variants do not imply a ranking of human usability.

The opt-in URLs are `/good/?betaUI=r` (reference), `/good/?betaUI=p` (position-only), and `/good/?betaUI=w` (wording-only). Without a supported, unambiguous token, the existing UI is retained. BadUI ignores the option. No variant or debugging labels are rendered.

`app/virtual-beta-ui.ts` is a DOM-free registry using the shared `BetaUIId` and `BetaUIVariant` types. It exports `comparisonUIs`, `comparisonUIFromSearch`, and `roiSelectors`. The registry records each variant's ID, opaque URL token, entry wording and vertical displacement for the parent's audit/manifest integration. No runner, prompt, evaluator or shared contract was changed by this UI work.

Reference retains the existing notification entry pixels. Position-only applies `translateY(110px)` to that entry, preserving DOM order, text, colors, dimensions and behavior. At the controlled 1280×900 viewport, the measured entry rectangle changes from `(x=921, y=540.375, width=295, height=113.796875)` to `(x=921, y=650.375, width=295, height=113.796875)`. All other visible element bounds remain equal; no other control overlaps the moved tile, and both document scroll dimensions remain 1280×900. This geometry is validated for the controlled experiment viewport; it is not a responsive-layout claim for other sizes.

Wording-only changes the entry label and accessible name from `通知設定` to `メール受信設定`, preserving the intent of changing email reception. The description and destination panel stay the same. The label occupies one line; the tile dimensions, all other visible element bounds, computed styles and other visible text remain equal. The inline label's intrinsic width may change with its text.

Only opt-in variants add the audit attributes `data-beta-roi="notification-entry"` to the entry and `data-beta-roi="notification-stop"` to the stop button. The exported selectors use those values. These attributes provide element-client-rect ROI acquisition for the parent; the UI implementation does not transmit them to a model. Actual `LocalExplorationPage` observations preserve the original `eN` control identities and DOM order, and their visible text/control data contain no variant IDs, ROI IDs, quality labels or answer-location labels. The parent's runner remains responsible for keeping audit metadata out of model requests.

## Local verification

Command: `node --import tsx --test tests/virtual-beta-ui.test.ts`.

Result: 6 tests passed, 0 failed, 0 skipped. The tests launch the existing Vite app and headless Chromium locally. Google Fonts stylesheet requests receive empty CSS, matching the controlled runner; other external requests are blocked. No evaluator or external API is used.

Coverage:

- Ordinary link and button clicks stop notifications in each variant, producing the identical `role="status"` text `メール通知を停止しました`.
- Reload and a new browser context independently restore the initial `現在の設定：受信する` state.
- Reference and no-query GoodUI have identical screenshots, visible geometry, styles and text. No-query and BadUI have no ROI attributes.
- Position-only changes just the target subtree's vertical coordinates; viewport, scrolling, other element geometry, wording, dimensions and colors remain equal, without control overlap.
- Wording-only changes just the label/accessibility name, preserving tile bounds and other geometry/styles/text without wrapping.
- Actual local POM observations retain all original control identities; audit labels are absent from visible observations.
- The pure registry accepts `r`, `p`, `w` only, rejecting unknown or duplicate tokens.

Command: `node node_modules/typescript/bin/tsc --noEmit`.

Result: passed after changing the test's `NodeList` conversion to `Array.from` to match the existing TypeScript library configuration. No tsconfig or dependency changes were required.

This is local comparison-fixture validation. It does not establish real Jev performance, human behavior, or a usability difference. The parent's 3-UI × 4-condition integration and final independent review are separate verification steps.

Owned changes: `app/main.tsx`, `app/virtual-beta-ui.ts`, `tests/virtual-beta-ui.test.ts`, and this document. No external API calls, `.env` access, full regression run or commit was performed by this UI subtask.
