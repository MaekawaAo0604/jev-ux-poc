# Goal diversity and selected-image outcomes

This increment preserves the existing Jev + Playwright exploration loop. It
adds a **post-run** classification of literal Goal fragments. It is not a new
agent, an answer-writing model, or an objective UX score.

## Public read-only exploration

After reviewing a site's policy and the intended scope:

```powershell
npm run explore -- https://example.com/ "Your Goal" --reviewed --vision --image-only --image-memory --image-memory-proof
```

With image judgment memory enabled, `result.json` now includes `goalOutcome`.
The same object is included in `summary.json` and the HTML report. Older logs
remain readable; rendering a report does not invoke a model. Existing fields
including `reason`, `objectiveSuccess`, completion gates, and retrospective
audits retain their original meaning. Non-image-memory runs are unchanged.

`goalOutcome` contains:

- `schemaVersion: 1`, `status: RECORDED | ERROR | NOT_RUN`.
- `objectiveVerified: false`, `coverage: selected-images-only`.
- `items`: report-fragment ID (`o1`, etc.)/text, `modelStatus`, guarded `status`, and
  selected `evidence` with image ID, step, file and SHA-256 provenance.
- `observations`, `response` (including probabilities/request usage when
  supplied), `warnings`, `error`, and separate `elapsedMs`.

Item statuses are `confirmed`, `conditional`, `not_achieved`, `unconfirmed`,
`unreadable`, and `context`. Confirmation means a model classifies a concrete
display as answering the item; it does not extract its exact wording/value.
Conditional means a visible consultation/eligibility/other condition leaves
the requested concrete answer unresolved. An explicit negative answer can
answer an information Goal, but a refused operation is not an achieved action.
Unconfirmed does not mean information is absent from the entire website.

The request contains only the literal Goal/date and image references with
anonymous IDs/steps. It does not contain DOM text, URLs, OCR, original verdicts,
old model judgments, or benchmark answers. It reloads each item's latest
effective judgment source plus the actual final image, validating capture
  metadata and image hashes. It does not resend all historical images. Action
selection still receives its current image only. This selected range can miss
contradictions or useful information in excluded pictures.

A positive/conditional/explicit-unachieved classification requires the model
to select specific supporting images. Without support it is downgraded to
unconfirmed, or unreadable when the evidence judgment is uncertain. API errors,
changed/missing sources and malformed replies become audit errors, not negative
site findings. A source link proves provenance, not that the interpretation is
correct. Original model statuses remain available for disagreements.

## Four task families

Run owned controlled fixtures using the existing public and local runners:

```powershell
npx tsx runner/goal-diversity.ts --repeat 2
```

The six cases cover single-fact lookup, multi-page aggregation, choosing and
opening a condition-matching plan, and an actual notification-setting action.
Additional cases exercise a consultation-only answer and a blocked operation.
All repeats start with fresh browser contexts. Expected labels and routes stay
in the evaluator and are never supplied to Jev. Negative outcomes are retained.
Public navigation stays read-only; actual settings changes run only on the
owned local fixture using the existing `notifications` Goal/oracle.

The output is `reports/goal-diversity-<timestamp>/index.html` and
`measurements.json`, with original trial directories linked from the report.
The information evaluator measures necessary displayed content having been in
the viewport, not answer accuracy. The matching evaluator additionally requires
the actual final route. The action evaluator reuses the notification-state
oracle. Consultation availability remains undetermined. Do not pool these as
one success rate or directly compare latency between the public and local
runners: their pacing, safety and termination mechanics differ.

## Remaining limits

- Reporting uses literal punctuation-based fragments, preserving commas between
  digits so a price such as `1,500` is not cut in two. These report item IDs are
  deliberately separate from the original navigation ledger. The latter still
  uses its existing subdivision rules; this increment does not change exploration.
  Neither splitter is a complete semantic requirements parser, and a prohibition
  can be classified inconsistently. Whole-Goal exploration checks remain separate;
  item classifications must not certify whole-Goal success.
- The tests do not cover text entry, select fields, authentication, purchases,
  real form submission or file downloads. Existing public safety restrictions
  are not relaxed to widen this benchmark.
- These are small deterministic fixtures, not evidence of general site or
  human-user performance. A held-out real-site set is still needed.
- Audit time is additional to the existing exploration `elapsedMs`; use
  `goalOutcome.elapsedMs` or the benchmark's `totalMs` for its extra cost.
