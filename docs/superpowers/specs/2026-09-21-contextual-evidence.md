# Contextual, incremental goal evidence

Approved in chat on 2026-09-21: preserve the context of observed text, reuse verified work, expose exploration progress without forcing navigation, and checkpoint successful requests. Implement and test on actual public pages, not just mocked/offline tests.

## Constraints

- The goal and its literal excerpt checks remain unchanged. Never inject reference answers, desired routes, hidden/offscreen text, or site-specific rules into Jev.
- Only the opt-in goal-check flow changes its decision strategy. Legacy combined decisions remain available.
- Native Jev choice questions; no additional generative model or OCR dependency.
- Exact observed quotes, source steps, warnings and omissions remain auditable. Equal text with different page/section context is not interchangeable.
- Preserve public navigation safety, the action limit, final post-action observation, and objectiveSuccess:null.
- No form submissions, registration, contact, publishing, or new access permissions.
- Cache raw successful judgments only within a run/explicit matching snapshot. Do not cache a completion decision across changed observations or ignore newly observed exceptions.
- API errors remain technical failures, never evidence of bad site UX or success. Existing bounded transport retries must not be multiplied by hidden outer loops.
- Do not read, print, commit or copy .env or credentials. No Git staging/commits: the repository has no initial commit and all existing files belong to the user.

## Design

### Observation and progress

Attach context to visible DOM regions: semantic landmark, visible heading lineage, and deterministic section identity. Never use hidden/offscreen heading text. Add an opaque per-POM page ID (no URL/locator hint) and viewport bounds. History retains matching region context for only the text actually retained by its existing memory budget.

Build progress from observations and executed actions: current page/ranges, prior departures and returns, previously selected action labels, and recorded pending checks. Give Jev this factual summary without deleting navigation choices or selecting a route in code. A read range means observed, not understood.

### Incremental evidence

Build context-bearing evidence blocks from visible region groups; old logs without metadata fall back conservatively to one observed frame, with source occurrences preserved. Screen candidate blocks once per matching local context, keeping relevant/uncertain blocks for detailed evaluation. Screening is subject-sensitive and never silently turns unprocessed/uncertain evidence into a negative result. Bundle screening with an existing preliminary goal call where practical; measure total run calls, not just final calls.

Detailed quote judgments are limited to selected blocks, cached by unchanged goal/checks, model/prompt version, observed local context and warnings. Exact quote IDs in the current result always point to actual source occurrences, even when a cached semantic result is reused. Confirm target applicability independently from information sufficiency before allowing done. Final sufficiency sees all retained relevant/uncertain evidence and fresh exceptions, not only previous positive results. Unknown scope, absent direct evidence or incomplete verification cannot finish.

Successful request answers are checkpointed by an injected callback. A restored session validates schema and namespace before reusing them; failed requests are not cached as completed. Re-evaluating the same immutable state resumes missing work without repeating successful stages. No automatic repeated entire-run retry.

### Reporting and validation

Record successful requests, total attempts including failures, question counts, cache hits and screening coverage. Keep coarse checks, scope, grounding, and post-run audit distinct. Tests prove mechanics; real-model saved-log and live experiments evaluate judgment quality. Preserve all failed runs and compare the new live batch with the prior 3-run batch.

## Acceptance

- Browser tests: no hidden/offscreen context leaks; same wording in separate sections stays distinct; history trimming preserves provenance; progress does not restrict actions.
- Decision tests: mismatched subject cannot finish even with present sufficiency; changed exception invalidates final completion; identical contexts reuse successful requests; different contexts do not; restored cache retries only missing stage and is namespace-safe.
- Replay real Jev against full, missing-age, missing-store, missing-hours, generic-member-only and same-words/different-subject observations. Keep expected labels outside model input.
- Fresh public contexts: highschool goal twice, tour once, unchanged goals/checks, max 24 actions, 3 second interval, no OCR. Freeze production code during each batch. Inspect actual text and screenshots.
- Report false completions, incomplete navigation, API failures, total calls/attempts and elapsed time separately. No universal reliability claim from a few examples.
