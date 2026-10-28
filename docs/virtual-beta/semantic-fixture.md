# Semantic settings fixture

`app/semantic-fixture.ts` exports `semanticQuery`, `parseSemanticFixture`, `semanticDefinition`, and `semanticROIs`. The query uses six opaque tokens under `semanticFixture`; duplicate tokens, unsupported values and mixed legacy `betaUI` assignments fail closed. Assignment and ROI metadata are private audit inputs. The parent runner must keep query, mapping, source definition and ROI identities outside learner input.

`SemanticFixtureView` renders a fixed 1280 × 900 settings screen using system fonts. The only interactive elements, in DOM order, are 「設定Aを適用」 and 「設定Bを適用」. Both remain enabled after every click. The assigned mail control sets the exact status 「メール通知を停止しました」; the other toggles the displayed layout state. Reload resets both states. The success feedback is at `(660,640)` with width 280, so the complete sentence is visible in both the initial crop and the look-3 crop. No persistence or network operation is involved.

A is at `(660,500,130,80)` and B at `(810,500,130,80)`. The cue is at `(1000,720,250,130)`, with position-only moving its y coordinate to 470. Wording-only changes the cue sentence while preserving its box and styles. Reversed mappings change the cue meaning and handler, leaving initial crop pixels and available controls unchanged. The cue does not name a fixation, sequence, score or correct answer.

Focused verification:

```powershell
.\node_modules\.bin\tsx.cmd --test tests/semantic-fixture.test.ts
.\node_modules\.bin\tsx.cmd --test tests/virtual-beta-ui.test.ts
.\node_modules\.bin\tsc.cmd --noEmit
```

The fixture tests use a real Vite route and Playwright browser. They compare actual numbered crop PNG bytes, verify both control and badge rectangles against the initial and look-3 crops, verify the newly revealed crop differs between mappings, verify all success-sentence pixels survive both actual crop transforms, test click behavior across all six assignments, and compare geometry/styles of all visible fixture elements. These are software checks, not human observations or measures of participant performance.
