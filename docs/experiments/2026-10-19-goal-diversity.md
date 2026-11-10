# Four Goal families and selected-image result reporting

## Approved scope

Preserve the Jev/Playwright exploration architecture and current-image operation
selection. Add post-run, source-linked item classifications and validate four
task families: single-fact retrieval, multi-page aggregation, condition-matching
navigation, and an actual owned-site setting change. No new QA agent, OCR,
real-site submissions or answer-writing model was introduced.

## Runs and corrections retained

Two complete batches each ran six cases twice using `jev-1.14.0`, fresh browser
contexts and 1440x1000 viewports. Trials were sequential and had no action cap.
Public information cases used the existing read-only runner with a 1000ms action
interval; owned setting cases used the existing local engine and notification
oracle. These runners do not have identical pacing/safety mechanics, so their
latencies are not an apples-to-apples comparison.

The initial batch is `reports/goal-diversity-2026-10-19T05-55-24.461Z/`.
Notification stop succeeded according to the real existing state oracle in both
trials, but the fixture accidentally retained the old receiving-status canvas
beside the new stopped-status message. The post-run classifier called both
unachieved. The inconsistent fixture was visually inspected, reproduced by a
failing browser test and corrected to update its primary canvas on a stop action.
No exploration rules or answers were repaired to force a success.

The second batch is `reports/goal-diversity-2026-10-19T05-58-06.715Z/`.
All twelve raw `result.json` files and initial batch measurements remain intact.
All twelve second-batch classifications were subsequently rechecked from their
saved selected images after protecting numeric commas in the reporting splitter.
The recheck did not navigate a browser or modify original exploration judgments.
Its records are `<case>-<repeat>-outcome-recheck.json`; `evaluations.json` records
source result hashes, corrected evaluator metadata and separate recheck time.
The final HTML/summary display these rechecks and explicitly distinguish them
from original logs.

Evaluator metadata originally called information display coverage
`objectiveSuccess: true`. Offline corrected evaluations use null for single,
split and consultation cases: display exposure does not establish exact answer
accuracy or a human/agent subjective state of knowing. Original measurements
are kept to make that correction inspectable. Expected substantive item status
is not a per-fragment oracle and does not apply to background/prohibition text.

## Observations from the second batch

- Single information: both trials displayed the required information and ended
  `JEV_DONE`, with zero actions. Exact answer wording/value extraction is untested.
- Multi-page: both trials observed the rate and support-hour pages, using two
  actions and ending `JEV_DONE`. Both report items classified confirmed.
- Condition matching: both trials opened B's actual detail page (1200/day and
  weekends available), within the requested 1500/day ceiling. Each used one action
  and ended `JEV_DONE`. The final recheck confirmed the condition and detail items.
- Notification stop: both trials executed one stop action. The existing real
  state oracle was true; exploration and the final outcome classifier agreed.
- Consultation: both trials stopped with no actions; both rechecks classified
  the visible weekend policy as conditional. Exact availability remains unknown.
- Blocked operation: both trials stopped with no actions; real stop state stayed
  false and both rechecks classified the operation as not achieved.

These are eight model completion endings and four model stop endings, **not a
general success rate**. The two consultation outcomes are not instrumentation
failures; the two blocked outcomes are not completed operations. All twelve
post-run rechecks recorded successfully, with no audit API error. Their added
latency was 0.46-1.13 seconds (initial live classification: 0.51-0.83 seconds).
Exploration times were roughly 1.8-7.7 seconds on these small owned fixtures;
original whole-process trial times were roughly 4.5-12.8 seconds. They exclude
the later recheck and cannot be generalized to external complex sites. Cost
data was unavailable, not zero.

## Limits actually exposed

The navigation ledger's existing punctuation splitter cut `1,500` into separate
fragments. The reporting classifier now preserves numeric commas, tested RED to
GREEN, without changing navigation input or its stored source metadata. This
does not solve semantic Goal decomposition. `申し込みはしない` varied between context
and unconfirmed in the live batch, and was unconfirmed in both final rechecks.
No unsupported information can be inferred from this prohibition classification.

The tests are simple deterministic fixtures. They do not prove arbitrary-site
reliability, accurate freeform answers, human UX behavior, input/form support,
time-sensitive Goals, or robustness to contradictions outside selected sources.
Future evaluation needs held-out realistic layouts and separate action support
for input-heavy Goals, not repeated tuning against only these six cases.

## Verification

New regressions cover distinct classification/evidence status, source tampering,
request isolation, API errors, thousands separators, viewport-dependent display
coverage, matching destination, operation fixture rendering and report anchors.
An independent read-only code review found no critical/important issues; both
minor findings (uncertain evidence handling and ambiguous expected-status
metadata) were addressed. The reviewer did not certify live model accuracy or
general product readiness.

The local report was visually inspected at desktop and 390px widths. Initial QA
found twelve cards/outcome sections, 98 valid local references, no broken anchor,
no browser page error and no document-level mobile overflow. Final report QA and
full-suite results are recorded in local logs. Final QA checked 111 references,
no broken anchor, twelve outcome sections, HTTP 200, no browser error and no
390px document overflow.

The sequential full-suite run finished with 459 tests: 456 passed, three skipped,
zero failures (415.8 seconds). The numerical-comma regression was added after
that suite started; all 61 focused tests were rerun successfully on the final
reporting implementation. Two subsequently added CLI subprocess tests verified
that help/invalid options cannot begin paid trials, both RED to GREEN. Final
TypeScript/Vite production build succeeded. No skipped tests are counted as
passes, and these overlapping test counts are not summed into a unique total.
