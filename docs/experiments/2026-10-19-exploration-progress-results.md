# Image-only exploration progress: matched diagnostic

## Decision

Do not promote the candidate context change to production. The tested numeric
history and guidance did not demonstrate better route switching. No production
behavior was changed for this experiment.

This is a negative result about this candidate representation, not evidence
that a model cannot use history or that the tested website has bad UX.

## Question and constraints

Can Jev avoid unproductive revisits when it receives the ranges previously
displayed and the observed destinations of executed actions?

- Preserve the existing Jev/Playwright execution and frontier machinery.
- Action decisions use exactly one current, numbered screenshot.
- Do not send DOM text, link labels, page titles, URLs, OCR or previous pixels.
- Do not provide an answer location or require the model to finish successfully.
- Allow revisiting a page as necessary transit; do not ban all revisits.

## Source and method

The local source is `reports/2026-10-19T04-26-26.191Z-public/`.
Its original result SHA-256 is
`25c246360b577bcf9c089c989667b4184f5c4c5f326810f883cc614c39a90db7`.
Each probe checks the current screenshot hash against the saved observation and
checks that the original result bytes remain unchanged.

The script `2026-10-19-exploration-progress-probe.ts` reconstructs requests with
the production image-only serializer. For a primary action request, it uses only
the prefix of executed actions and the previous frame's judgment ledger. For a
secondary frontier request, it uses the current ledger, because the primary
request has already evaluated that frame. The primary question batch includes
the normal per-frame image judgment questions. The secondary batch does not
repeat them. There is no browser interaction in these probes.

Three conditions keep Goal, current image bytes, candidate order, image judgment
questions and ledger fixed:

1. Baseline: reconstructed current production input.
2. Instruction: baseline plus guidance to consider unobserved ranges and to
   distinguish movement from acquiring information.
3. Progress: the same instruction plus anonymous page IDs, numeric displayed
   ranges and executed action transitions (source, next observation, result).

Each condition is queried three times, rotating condition order across repeats.
The additional diagnostic context is deliberately local to this experiment; it
is not installed into the product. The model is `jev-1.14.0`, the same as the
source exploration. There are 45 calls in total, with one request attempt per
call and no automatic retry after a failed response.

## Observations

Primary decision at step 6 (home after returning):

- Baseline: `scroll_down` in 3/3.
- Instruction: `scroll_down` in 3/3.
- Progress: `scroll_down` in 2/3; `e4` (contact) in 1/3.
- The original run chose `e8` (cart), so that original choice is not reliably
  reproduced by these small samples.

Primary decision at step 19 (process page during the vertical back-and-forth):

- All three conditions chose `scroll_down` in 3/3.
- The candidate selected the same downward scroll at this frame; the probe did
  not execute a subsequent route.

Primary decision at step 22 (process page at its top again):

- Baseline: `e4` (contact) in 3/3.
- Instruction and progress: `e4` in 2/3 and `scroll_down` in 1/3 each.
- There is no clear incremental benefit from the numeric context over guidance.

Primary decision at step 30 (the final source frame):

- Every condition chose `e10` in 3/3.
- The source run also initially chose `e10`; its ultimate `stuck` was produced
  by the subsequent frontier selection, not that initial action selection.

Secondary frontier selection at step 30:

- Baseline: `f28` in 2/3, `stuck` in 1/3.
- Instruction: `f28` in 1/3, `stuck` in 2/3.
- Progress: `stuck` in 3/3.
- The offered, untried home-page scroll target `f9` was never selected.
- A frontier choice is not an executed action or a successful route; this probe
  does not establish what would happen after following `f28`.

In this final frontier request, input usage increased from about 8.5k tokens
(baseline) to 13.3k (progress), without a demonstrated decision benefit. The
provider did not return a monetary cost for these responses; do not infer one
from token usage alone.

## Local evidence

Generated reports are ignored by Git. They contain no credentials or image
base64; screenshots remain in the existing local source report.

- `reports/exploration-progress-probe-2026-10-19T04-54-52.559Z/diagnostic.json`:
  steps 6 and 22, primary action selection, 18 calls.
- `reports/exploration-progress-probe-2026-10-19T04-56-08.318Z/diagnostic.json`:
  steps 19 and 30, primary action selection, 18 calls.
- `reports/exploration-progress-probe-2026-10-19T04-56-56.424Z/diagnostic.json`:
  step 30, frontier selection, 9 calls.

To repeat a primary probe with saved local source artifacts:

```sh
npx tsx docs/experiments/2026-10-19-exploration-progress-probe.ts SOURCE_REPORT 6,22
```

To repeat the terminal frontier probe:

```sh
npx tsx docs/experiments/2026-10-19-exploration-progress-probe.ts SOURCE_REPORT 30 --frontier
```

These commands make paid model calls using the locally configured credentials,
but never visit the source website. Do not publish the source site's screenshots.

Append `--prepare-only` to serialize all three variant inputs without making any
model calls. Input preparation has been checked at all four primary frames and
the terminal frontier frame. The targeted script rejects a prefix containing
no-ops, failed actions or missing action records instead of silently losing
production history. It records the original primary and final choices separately.

Read-only review independently checked all 45 successful responses, source hashes,
prefix boundaries and the negative conclusion. There were no blocking findings;
the prefix guard and separate choice fields address the two reconstruction nits.

The unchanged production baseline passed the complete serial test suite: 446
tests, 443 passed, 3 explicitly skipped, zero failures (438.5 seconds). `npm run
build`, the diagnostic's standalone TypeScript check, and `git diff --check` also
passed. These checks validate the existing code and diagnostic, not the efficacy
of the rejected candidate.

## Limits and next investigation

This uses four handpicked frames from one source trace. It is a reconstruction,
not a byte-identical recording of the original wire request. Three repeats per
condition are descriptive samples, not a significance
test. Repeated API responses are not known to be statistically independent, and
the provider's caching/sampling internals were not controlled. Neither primary
selection nor frontier selection alone is a full route replay.

The numeric history fixes an input omission, but it does not restore the meaning
of a remote entrance or prove whether information was read. The causal question
left open is whether image-grounded route meaning survives the transition from
the current-image choice to selection of a remote, anonymous frontier. Inspect
that boundary before adding more generic history or asserting a site UX defect.

## Unchanged-production baseline replicate

One additional run used the same literal Goal, URL, model and production flags:

```sh
npx tsx runner/public-site.ts URL GOAL --reviewed --vision --image-only --image-memory --image-memory-proof --max-actions 0 --interval-ms 2000
```

The URL and Goal are retained in the local source/result files, not replaced with
an answer route. No candidate progress context or guidance was installed.

- Result: `JEV_DONE`, 37 executed actions, 38 decision frames, 162.482 seconds
  before the retrospective audit. The prior run was `STUCK`, 29 actions,
  143.058 seconds. The paths differ substantially; this is not a speedup.
- The runner finally returned to home at step 34. Steps 35, 36 and 37 scrolled
  from home top 0 to 700, 1400 and 2100. Step 38 ended exploration.
- Manual inspection of saved v37 and v38 confirms the factory-tour row with its
  price/duration and the weekend/holiday consultation statement. No reservation
  or contact was submitted. This is task-specific evidence, not an objective UX
  quality score or a claim that humans explore identically.
- The final completion check accepted two hash-verified source images (v38/v37).
  The separate existing retrospective audit also returned `RECORDED/supported`
  in 35.957 seconds. The online check participates in the completion decision;
  only the retrospective audit is post hoc and cannot alter the termination.
- The public runner still reports `objectiveSuccess: null` and `UNVERIFIED`.
  Do not silently promote a model verdict into an objective success metric.

Local report: `reports/2026-10-19T05-00-34.481Z-public/index.html`.
Result SHA-256:
`651ddb196468f3fc292307fbb4144695139d9129c2adcea3210b7b0268512804`.

Report QA checked HTTP 200, 117 local references, both completion source hashes,
no browser page errors and no horizontal overflow at 390px. Result bytes were
unchanged by QA. The temporary local-report browser was closed.

This successful baseline replicate does not reverse the rejection of the
candidate. It demonstrates route variability under the unchanged implementation;
it cannot establish the candidate's efficacy, a success rate or a general site
UX conclusion. Investigate the current-image/remote-frontier boundary next,
using repeated end-to-end comparisons before making a product claim.
