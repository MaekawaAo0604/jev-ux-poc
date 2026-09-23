# Evidence pipeline and measurement analysis — 2026-09-24

Scope: three public-site explorations run with the existing guarded runner, a root-cause investigation of the two defects they exposed, and four changes. The Jev decision contract, the visible-text policy, the site safety policy and the test-generation behavior are unchanged. No new goal, POM or scoring rule was introduced.

## Runs

All three used `npm run explore` with `--goal-check`, unlimited actions, and robots.txt checked before `--reviewed`.

| Site | Goal | Actions | Elapsed | Reason | API calls / questions | API failures |
|---|---|---|---|---|---|---|
| esa.io | 利用料金と無料で試せる期間 | 1 | 32.9 s | JEV_DONE | 52 / 109 | 0 |
| anytimefitness.co.jp | 見学の可否と申込み方法 | 7 | 56.4 s | JEV_DONE | 53 / 111 | 1 |
| kahaku.go.jp | 常設展の入館料と開館時間 | 11 | 93.0 s | ACTION_ERROR | 71 / 158 | 5 |

Reports: `reports/2026-09-23T12-17-47.024Z-public`, `reports/2026-09-23T12-31-11.214Z-public`, `reports/2026-09-23T19-44-05.620Z-public`. All five API failures were 503/529 and recovered on attempt 2, so none of them ended a run.

Two observations about the recorded action counts, which are this PoC's difficulty signal:

- anytimefitness: 「入会する前に施設を見学できるか」 was `present` at step 3 on `/flow/join/`. The evidence that later settled 「どう申し込むか」 (`s8-t4` 店頭入会, `s8-t5`) was below the fold on that same page. Steps 3–7 left the page, visited `/flow/beginner/`, and came back to scroll. The frontier had already selected 下にスクロール at step 5. Five of the seven actions were a scroll-versus-navigate preference, not site depth.
- kahaku: the answer was on screen from step 7. The run still ended at step 12. See below.

## Defect 1 — related evidence cannot reach sufficiency

`groundGoal` runs five stages per checklist item. Completion requires all of them to agree (`jev/goal-status.ts:10-14`): coarse `present`, non-empty `evidence`, `scope=match`, `assessment=present`, `contradictions=present`.

The content stage (`jev/goal-evidence.ts:57`) evaluates one distinct text at a time. Its model input is `{quote, task}` — not the goal, not the block, not the sibling runs. Three outcomes: `direct` becomes a candidate, `related` goes to `relatedEvidence`, `uncertain` to `uncertainEvidence`. Only candidates that then pass quote-scope with `match` enter `evidence`.

`acceptedChecks` (`jev/goal-evidence.ts:95`) was built from `c.evidence` alone and passed to `scope-sufficiency` (`:104`). `relatedEvidence` was recorded and rendered but never fed forward. Once `related`, a quote was permanently invisible to the judgement.

The kahaku page states the answer as a parent list item and its nested children:

```
以下の方は常設展の電子チケット購入は不要です。
 ・入館料が無料になる対象の方        ← s7-t8 / s8-t2 → related
    ○ 65歳以上
    ○ 高校生（高等専門学校生含む）以下  ← s7-t11 / s8-t5 → direct
```

Both were observed. The parent carries 無料; the child carries the category. Split into isolated runs, neither states 高校生の入館料 on its own, so sufficiency reported `absent` (0.69) while the coarse check said `present` (0.94).

This is not an edge case. The atomic unit of judgement is a text run (`frame.text[i]`), but the atomic unit of a displayed fact is often a subtree: price tables, definition lists, eligibility lists — exactly the content these goals target. The asymmetry is that quote-scope already receives the whole block (`:88`), and only the content and sufficiency stages did not.

Severity comes from `jev/decide.ts:44`: in goal-check mode `done` is removed from the candidate set and completion is returned by `pendingGoalChecks()`. Jev has no way to say it is finished. One misclassified quote therefore makes completion unreachable, and the run can only end by stuck, action limit, loop or error. In the kahaku run `stuck` carried 0.18–0.20 from step 7 onward.

Reproduced deterministically, without API calls, in `tests/kahaku-evidence-repro.test.ts`.

## Defect 2 — a disclosure that is not a toggle

`pages/PublicSitePage.ts:160-176` clicks a disclosure and polls for 1.5 s for its `open` state to flip, then throws. The first hypothesis — that the control stops classifying as a disclosure after the click — was wrong. `docs/experiments/2026-09-24-disclosure-toggle-probe.mjs` measured the live control:

```
<span id role="button" aria-expanded="false" aria-haspopup="true">利用案内</span>
pass 1: open=false → click → open=true   (1 poll)
pass 2: open=true  → click → open=true   (30 polls, 1.5 s) → throw
```

The classification stays `disclosure` throughout. The header menu simply opens on click and closes on an outside click. The POM assumed every disclosure is a toggle and converted a no-op into `ACTION_ERROR`.

`panelPath` is only set for the header graphic-trigger branch, so every ARIA disclosure and every `<details>` takes this polling path. The pattern is common, not site-specific.

`runner/public-site.ts` then assigned that code to `reason`, which exits `while(!reason)`. The same loop already tolerates three consecutive `REOBSERVE` rounds; a failed action had no allowance at all.

Probe output: `reports/disclosure-toggle-probe-2026-09-23T21-08-23.795Z/diagnostics.json`.

## Design assessment

What the design is trying to do is right for the stated purpose. A tool that measures UX by watching an agent navigate is destroyed by a false `done`, so the model is not allowed to certify its own success, and every completion must trace to a quoted on-screen string checked for content, subject applicability, sufficiency and contradiction. The provenance kept per quote (id, step, bbox) makes each completion auditable against a screenshot. `--success both` separating 成功したのに認識できない from 未達なのに完了 is implemented, not aspirational.

Three structural costs follow from that choice.

**The unit of judgement does not match the unit of meaning.** Defect 1 is the necessary consequence of judging text runs, not a coding mistake.

**Information is lost in one direction only.** `relatedEvidence` and `uncertainEvidence` were collected, stored and displayed, but never read back. The quotes it discards — topical but not themselves an answer — are precisely the context sufficiency needs.

**Conjunctive stochastic gates with no aggregation.** Five gates per item, each a separate model call, combined with AND. Recorded `probabilities` are deliberately not used as thresholds (the comment at `goal-evidence.ts:69` says why), so a 0.51 `absent` and a 0.99 `absent` are identical. If one gate is right with probability p, one item completes with p⁵ and two items with p¹⁰. Splitting a goal into careful checks — what the design encourages — lowers the completion rate. The three runs are consistent with this: esa passed every gate, anytimefitness passed at `assessment` 0.70 / `scope` 0.66, kahaku failed at `assessment` 0.69.

**The consequence that matters most is measurement contamination.** Every false negative in the verification chain inflates the action count, which is the primary metric. The kahaku run is recorded as 11 actions and `UNCONFIRMED`, which reads as a difficult site; the actual cause was the evidence pipeline. The README guards the false-positive direction carefully and had no symmetric guard here: `UX_FAILURE` and instrument failure both landed in the same bucket. Across the three runs, two had a majority of their recorded actions caused by something other than the site's UX.

Cost scales with the wrong thing as well. Content-stage cost is `distinct text count × active checks`, so a text-dense, well-organised page is charged more than a sparse one.

## Changes

- `runner/report.ts`: new `measurementClass(reason)` — `ux` (SUCCESS, JEV_DONE, DONE_WITHOUT_SUCCESS, STUCK, LOOP, ACTION_LIMIT), `instrument` (ACTION_ERROR, DECISION_ERROR, PAGE_ERROR, GOAL_CONFIG_ERROR, REOBSERVE), `scope` (SAFETY_BOUNDARY, UNSUPPORTED_CONTENT). Each run card carries `data-measurement`, a non-`ux` run states that its action count is not a UX signal, the overview counts how many runs may be aggregated, and `summary.json` records the class per run.
- `jev/goal-evidence.ts`: each quote sent to `scope-sufficiency` carries `localContext`, the visible text of its own block. quote-scope already receives the same block, so no new content is exposed; a quote is simply read where it sits. The instruction states that local context resolves what the quote refers to and is not a separate source of facts. The content stage still receives a bare quote, and per-quote isolation at scope is unchanged.
- `runner/action-recovery.ts` (new): `actionOutcome(code, consecutive)`. `ACTION_NOOP` is never terminal; `ACTION_ERROR` is terminal on the third consecutive occurrence; everything else stays terminal immediately. Safety and scope stops are unaffected.
- `pages/PublicSitePage.ts`: a disclosure whose panel does not change while the URL stays put now throws `ACTION_NOOP`, not `ACTION_ERROR`. It still rejects — expanded state is never manufactured.
- `runner/public-site.ts`: uses `actionOutcome`. A non-terminal failure records the step, marks the choice executed so it is excluded from later candidates, and continues. `ACTION_NOOP` increments the action count because a click that does nothing is a real user action; `ACTION_ERROR` does not, because that is the instrument.

New tests: `tests/kahaku-evidence-repro.test.ts`, `tests/action-recovery.test.ts`, `tests/sticky-disclosure.test.ts`, `tests/fixtures/sticky-disclosure-provider.mjs`, and three cases in `tests/report.test.ts`. `tests/graphic-disclosure.test.ts` now expects `ACTION_NOOP`; it still asserts the panel stayed hidden and that `act()` rejects.

Each test was watched failing first. The sticky-disclosure test reproduced the live failure exactly (`ACTION_ERROR` at step 2) before the change.

## Re-run of the failing exploration

Same site, goal, checks and settings, after the changes. Report: `reports/2026-09-23T22-19-24.081Z-public`.

| | Before | After |
|---|---|---|
| Reason | ACTION_ERROR (step 12) | JEV_DONE (step 7) |
| Actions | 11 | 6 |
| Elapsed | 93.0 s | 54.0 s |
| API | 71 calls / 158 questions, 5 failures | 51 calls / 116 questions, 0 failures |
| `summary.json` measurement | — (field did not exist) | `ux` |

Steps 1–6 are the same route in both runs. The change is at the decision that followed.

The causal attribution is narrow, because the accepted evidence is identical in both runs — `s7-t4` 「大人（一般・大学生） 630円 …」 and `s7-t11` 「高校生（高等専門学校生含む）以下」:

- Before: `assessment` = absent, probabilities `{absent 0.69, uncertain 0.17, present 0.14}`.
- After: `assessment` = present, probabilities `{present 0.53, absent 0.40, uncertain 0.07}`.

Request bodies are not persisted (`RequestTrace` records attempts and failures only), but the session records `inputBytes` per request. The `scope-sufficiency` payload grew from 2,818 bytes to 3,772 bytes, consistent with the added block text and with nothing else in that request having changed.

The margin is thin: 0.53 present against 0.40 absent. The item is now decidable, not confidently decided.

The exploration ended before reaching the header menu, so the disclosure no-op did not recur live. `ACTION_NOOP` and the retry allowance are verified by `tests/sticky-disclosure.test.ts`, which reproduced the live `ACTION_ERROR` at step 2 before the change, not by a second live occurrence.

## Final verification

- `npx tsc --noEmit`: passed.
- `npm test`: 310 tests, 309 passed, 0 failed, 1 existing real-OCR skip.

## Limits

- The four changes address how the pipeline carries information and how a failure ends a run. They do not change the conjunctive gate structure, so completion probability still compounds with checklist length.
- `localContext` is bounded by the block, which is built from observed text grouped by region context (`jev/evidence-blocks.ts`). A fact split across two blocks is still split.
- `relatedEvidence` and `uncertainEvidence` remain outside the judgement. Only the block text around an accepted quote was added.
- The scroll-versus-navigate preference seen at anytimefitness is a Jev decision pattern and was not changed.
- Three runs on three sites plus one re-run, a single attempt each. Nothing here is a repeatability measurement, and none of it is evidence about the sites' UX quality. The re-run's `present` 0.53 against `absent` 0.40 is not a margin that a second attempt is guaranteed to reproduce.
