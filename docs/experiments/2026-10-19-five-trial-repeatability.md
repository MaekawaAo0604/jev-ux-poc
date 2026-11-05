# Five fresh image-only exploration trials

## Protocol

Five new trials used the same factory-tour information Goal, starting site,
`jev-1.14.0`, 1440x1000 viewport and unchanged production code at
`163a2b1d2242bfd0da641d61b07addf9302fe5ca`. Each trial started a new process and
browser. Execution was sequential, with a two-second action interval and no
action-count cap. The earlier handpicked pilots were not pooled into this batch.

Flags were `--reviewed --vision --image-only --image-memory
--image-memory-proof --max-actions 0 --interval-ms 2000`. No OCR, DOM text,
expected answers or hand-authored correct routes were supplied to the model. Past source images were
used only for completion checks. Public-page navigation was read-only: no
reservation, form submission, login, purchase or contact with the operator.

## Observed endings, not an objective success rate

- Trial 1: 11 actions / 54.1 seconds; `JEV_DONE`; online completion `complete`;
  retrospective audit `RECORDED/insufficient`.
- Trial 2: 24 actions / 107.2 seconds; `STUCK`; retrospective audit
  `RECORDED/insufficient`.
- Trial 3: 9 actions / 49.0 seconds; `STUCK`; online completion `incomplete`;
  retrospective audit `RECORDED/insufficient`.
- Trial 4: 13 actions / 66.2 seconds; `STUCK`; online completion `incomplete`;
  retrospective audit `RECORDED/insufficient`.
- Trial 5: 19 actions / 94.5 seconds; `STUCK`; retrospective audit
  `ERROR/uncertain`, HTTP 400 at its completion request.

Times are exploration only, excluding post-exploration auditing. The median is
13 actions / 66.2 seconds **until termination**, not time to a verified success.
All five processes exited normally and all exploration actions reported OK.
One audit error is not another negative site observation. `objectiveSuccess`
remains null in all five original results.

## Important correction after inspecting the actual pictures

All five terminal images visibly contain factory-tour pricing, a one-hour
duration and a weekend/holiday consultation instruction. Trials 2 and 5 reached
those displays on the booking-list page even though they did not scroll home.
Therefore, **no home scroll does not mean failure to reach relevant displays**.
An earlier interim interpretation that two trials had not reached the information
was corrected after visual inspection. The recorded metrics themselves were not
changed to fit a conclusion.

The home and booking pages show different levels of pricing detail; the latter
includes a group-size discount. This does not by itself establish a pricing error.
The consultation statement does not prove that a particular weekend visit is
available. It is conditional information and a next contact step, not a definite
yes/no availability answer.

## Where decisions diverged

Trials 1, 3 and 4 ended on byte-identical numbered PNGs, SHA-256
`60dbdbf5f52966e47c53ea474cf949f3aa8e3a004ff8a76ca08424bbc1e6aa5f`.
All three initially proposed `done`. The online completion gate accepted trial 1
but rejected trials 3 and 4; those trials then selected `stuck`, followed by a
frontier stop. Their histories and request contexts differ: these are identical
pixels, not identical model inputs or a causal experiment.

Trials 2 and 5 ended on the same booking-list PNG, SHA-256
`69e99350c99980cd020c80f34435fdb459580d83530436e87ecd6fa1c0f2d1e1`.
Both initially selected the visible contact control `e10`; the subsequent
frontier choice selected `stuck`. That does not establish that the initial click
would have yielded a useful answer.

Page reentries were 4/5/3/5/7. Consecutive scroll reversals were 1/7/0/1/2.
Repeated exact scroll transitions were 0/3/0/0/1. These counts include necessary
transit and are not automatically wasted effort or human UX defect measurements.

## Interpretation and next isolated probe

This batch exposes variability in navigation and in whole-Goal sufficiency
judgments. It does **not** establish a 20% success rate, five objective failures,
or a bad website. A `not_shown` requirement judgment cannot safely be read as
proof that consultation text was absent: the question asks whether the requested
answer is established, not merely whether particular words are visible.

Before adding navigation rules, freeze a saved image and its complete request
and separately measure (a) recognition of the displayed consultation policy and
(b) whether that conditional policy satisfies the literal Goal. Only then vary
history, judgment context or wording one at a time. The possibility that
"consult first" is treated inconsistently is a hypothesis, not an established
explanation. Do not force completion or use best-of-five as the reported result.

## Local evidence and validation

The local batch directory is
`reports/repeatability-2026-10-19T05-14-15.523Z/`. It contains the five console
logs, `repeatability.json`, a combined `index.html`, source hashes, report QA,
and a one-off offline analysis script. Original per-trial reports remain separate.
Screenshots and raw site logs remain local and are not committed or published.

Aggregation verified matching settings/model, action accounting, selected image
hashes, five distinct report directories and unchanged original result bytes.
The original HEAD and tracked working/index state stayed unchanged throughout
execution and analysis. Three hand-derived metric checks and a separate review
checked operation counts, route metrics, decision lineage and interpretation.
Both representative images were separately inspected in the review context.

The combined report was checked locally for HTTP 200, five rows/trials, 259 local
references, no browser page errors and no horizontal overflow at 390px. Report
generation and QA made no additional model calls. No production behavior was
changed, and no new claim about the full software test suite is made here.
