# Semantic-control evidence analysis

`runner/semantic-analysis.ts` is a pure, offline projection of recorded `BetaResult` artifacts. It exports `analyzeSemanticRun(result)` and `compareSemanticRuns(results)`. It does not call a model, read screenshots, verify file bytes, reconstruct an omitted observation, or resend a saved request. Trial assignments, correct mappings and ROI audit data belong only to this offline path; they must not enter learner input, state or questions.

## Preregistered endpoint

The endpoint is **cue-supported first-choice correctness**, a behavioral measure. It does not establish that a model read, understood or reasoned about a cue. The first A/B click is the endpoint even if a later click corrects it. Objective success, subjective completion, termination and censoring are reported separately.

The analyzer obtains the A/B control IDs from the recorded screen elements whose literal texts are `設定Aを適用` and `設定Bを適用`. It checks those IDs against `questions.nextAction.criteria` and the recorded selected/action IDs. It does not infer control identity from candidate label wording, probability rankings, model explanations or a control that becomes available only after candidate filtering.

A score of one requires all of the following:

- An infrastructure-valid run, a complete semantic assignment and the fixed goal/argmax, enabled-state memory-3, crop-640×480 condition with at most four API calls.
- Audit ROIs `semantic-cue`, `semantic-a` and `semantic-b`. The whole cue ROI must be outside the initial clear rectangle. Any initial overlap fails this condition.
- Both controls wholly visible and both IDs offered initially and at the first A/B click. Filtering either A/B candidate before that click invalidates the design evidence.
- At least one recorded observation before or at that click with the whole cue ROI inside its clear rectangle. Partial overlap does not count. A prior fully clear observation can support a later choice even when the cue is no longer in the current crop.
- Consistent raw-source hashes throughout those observations, with the same raw screen before the first click. This isolates changed visual access from a changed product screen.
- A selected control matching the executed action and the assigned correct mapping.

A correct blind guess receives zero. An exposed wrong choice receives zero. A complete recorded run without an A/B click receives zero, including abandonment, subjective completion and budget censoring. Absence of a recorded action at an otherwise complete terminal observation does not invent a click. Missing or ambiguous required metadata remains `null`/unknown rather than evidence of cue absence. Infrastructure failure and design invalidity remain explicit classifications; their zero contribution to the planned-trial accounting is not an assertion of an observed behavioral failure.

`cue.acquiredBeforeOrAtFirstChoice` means whole-ROI image availability, not gaze or verified reading. It is false only when the relevant observations are recorded and none wholly contains the cue; a missing observation without any positive exposure record yields unknown. The analyzer trusts recorded rectangles and hashes. Independent artifact verification must check their underlying bytes, selectors and capture provenance.

## Fixed study accounting

There are exactly 12 expected cells: three UIs (`reference`, `position-only`, `wording-only`) × two reversed mappings × two replicates. Every report retains the fixed denominator of 12 overall and four per UI. It lists all submitted trials, missing cells, duplicate cells, infrastructure-invalid runs, unknown/design-invalid runs, no-choice runs and censored runs. No result is replaced or silently dropped. Rates with missing/invalid cells describe verified strict successes per planned trial; they do not impute the unobserved behavioral outcomes.

Six pairs are defined by UI × replicate, each containing mappings A and B. The pair report includes equality of initial `inputSha256`, initial admitted-image hash and raw-source hash. The whole initial wire and admitted image must match across reversed mappings. Raw screenshots must differ because the hidden cue text changes. This raw difference is intended; it must not leak into the admitted initial crop. Equal raw hashes or unequal/missing initial model-input/image hashes make the comparison unavailable. The analyzer reports recorded hash equality; it does not recompute file hashes.

The comparison also checks unique run/trial/pair identities, the factorial cells, and common recorded non-UI settings/input/source. Missing, duplicate, malformed or ineligible data disable both inferential tests, with reasons. Complete blind/no-choice/censored trials are retained at zero and do not by themselves disable inference. There is no outcome-dependent exclusion, change of endpoint, replacement, or selection of a better-looking statistic.

## Exact conditional tests

The one-sided mapping test uses the sum of cue-supported first-choice correct scores. It enumerates all `2^6 = 64` independent A/B label swaps within the six UI × replicate pairs. Cue-support gates and first choices stay fixed; correctness is recomputed after each swap. Its p-value is the fraction of enumerated scores at least as large as observed, including ties and the observed assignment.

The omnibus UI statistic is the range (maximum minus minimum) of the three strict-success rates, each divided by four. Labels are permuted within each replicate × mapping block containing the three UIs. It enumerates `(3!)^4 = 1296` assignments and counts ranges at least as large as observed. This is the preregistered omnibus test; there are no additional selected pairwise UI p-values.

The design must assign the complete factorial cases at random to 12 pre-existing execution slots before outcomes and retain the assignment manifest/seed. The mapping test conditions on UI × replicate, and the UI test on replicate × mapping. These conditional reference distributions require the corresponding sharp null, exchangeability, fresh independent run contexts, no interference/carryover, and fixed measurement. Random order alone cannot establish all of those assumptions. The analyzer does not inspect or certify the external randomization manifest. Time drift and shared model-service effects are not ruled out by a fresh browser context.

This is one small exploratory experiment: 12 trials, six mapping pairs and four UI blocks. P-values do not estimate a probability of internal understanding or human success. No power or population-level human generalization is claimed. The minimum mapping p-value is 1/64; a null or unavailable result must remain so. Within-UI repetition summaries show first-choice and action-path agreement for each mapping, with recorded per-decision distributions available for inspection. Two repeats do not characterize a stable variance distribution.

## Hand-checkable verification

`node --import tsx --test tests/semantic-analysis.test.ts` exercises strict exposure, partial visibility, blind guesses, wrong first choices, candidate gates, missing metadata, infrastructure errors, censoring, malformed assignments, pair hashes and complete/incomplete datasets.

For all 12 exposed first choices correct, only the unchanged mapping assignment achieves 12 successes: mapping p = 1/64. All UI rates equal one, so UI p = 1. Choosing A on every run gives six successes under every paired mapping swap: mapping p = 1. All blind or all complete no-choice runs have strict score zero and both p-values equal one. If only one UI succeeds in every block, the UI range is one; all four block successes align with the same UI in 3 of 3^4 distinct allocations, giving UI p = 1/27. Each allocation has the same multiplicity in the full 1296 enumeration.

Type checking: `npx tsc --noEmit`. These are local checks and spend no model API budget. Human data collection and any human/agent comparison remain deferred.
