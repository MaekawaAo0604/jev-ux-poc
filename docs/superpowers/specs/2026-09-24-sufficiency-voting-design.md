# Sufficiency voting and a smaller completion contract

Approved in chat on 2026-09-24: stop the completion rate from degrading as a goal is split into more checks, without lowering the bar for completion. Decide an item's sufficiency from a symmetric majority of repeated draws instead of a single cached draw, and drop the two clauses of the completion test that never discriminate.

## Why

Completion is returned by `pendingGoalChecks()`; `done` is removed from the candidate set in goal-check mode, so an item that cannot pass makes the goal unreachable. The evidence session caches by `{namespace, state, questions}`, so an item's `scope-sufficiency` verdict is drawn once and frozen while its accepted evidence is unchanged. In `reports/2026-09-23T19-44-05.620Z-public` that stage was consulted 16 times and issued 3 calls; the `absent` drawn at step 7 was reused through step 12.

The provider is not deterministic at identical input. Replaying the marginal item from `reports/2026-09-23T22-19-24.081Z-public` step 7 eight times per arm (`docs/experiments/2026-09-24-sufficiency-stability-probe.mjs`, results in `reports/sufficiency-stability-2026-09-23T23-28-41.545Z`):

- with `localContext`: present 6 / absent 2, present probability 0.42–0.59
- without `localContext`: absent 8 / present 0, present probability 0.06–0.12

So a single draw mislabels an answerable item about a quarter of the time, and that mislabel is then frozen. With N checks the run needs N independent single draws to land, which is the degradation being fixed. The second arm also establishes that the `localContext` change in 70150d5 moved this item from reliably unanswerable to marginally answerable; it was not a lucky draw.

Across 990 recorded per-step judgements, two clauses of the completion test never discriminated: the coarse `check_i` answer (0 cases where it blocked an item that grounding accepted — `groundGoal` only runs on coarse-present items) and `scope==='match'` (904 to 0 once an assessment exists, because only `match` quotes enter `evidence`).

## Constraints

- Do not lower the bar. Resampling only when the first draw blocks is asymmetric and biases toward `present`; voting must draw and stop symmetrically so both error directions improve.
- Aggregated probabilities are a record of the draws, not a calibrated posterior. No threshold arithmetic on them, and no probability-based completion rule.
- Every draw stays auditable. A verdict that was split must be visible in the report, not hidden behind a majority.
- Accounting reports each draw as a call. Voting must not make a run look cheaper than it is.
- Contradictions keep their single-draw veto for now. Their stability is unmeasured and they issue far more calls than sufficiency.
- The legacy combined decision path (no `--goal-check`) is unchanged, as are the visible-text policy, site safety policy, action limit and `objectiveSuccess:null`.
- No new model, provider, OCR or generative dependency. Native choice questions only.
- Do not read, print or commit `.env` or credentials.

## Design

### Completion contract

`pendingGoalChecks()` keeps its pre-grounding branch: before any grounding has run, an item whose coarse answer is not `present` stays pending. Its post-grounding test drops `c.choice!=='present'` and `proof.scope?.choice!=='match'`, leaving non-empty evidence, `assessment==='present'` and `contradictions==='present'`.

Dropping the coarse clause means a later coarse answer that flips to `absent` no longer reopens an item whose grounded verdict is `present`. That was not observed in 990 samples, and newly observed information that should reopen an item is the contradictions gate's job. The code records both facts where the clauses were removed.

### Voting

`EvidenceSession` gains `vote(stage, state, questions, draws)`:

- Look up the normal cache key first. A hit returns the stored aggregate, so later consultations reuse the aggregate and never a single draw.
- On a miss, issue up to `draws` requests with per-draw caching disabled.
- Stop as soon as any choice reaches `floor(draws/2)+1` votes. The rule does not name a choice, so stopping is symmetric and a clear-cut item costs three draws rather than five.
- The aggregate choice has the most votes. There are three choices, so five draws can split 2-2-1 with no majority: the plurality then wins, ties are broken by the higher mean probability, and a remaining exact tie takes the first draw's choice. The rule never names a choice, so it cannot favour completion.
- Aggregated probabilities are the mean across draws.
- Store the aggregate under the normal key.
- Count every draw in accounting as a logical call and a question. A cache hit reports one reused call and one reused question, as `evaluate` already does.
- Accept exactly one question. Majority across several questions in one request has no unambiguous meaning, and `grounded_i` is already issued one question per call.
- Return the individual draws alongside the aggregate.

`groundGoal` calls `vote` for `scope-sufficiency` with `SUFFICIENCY_DRAWS = 5`, exported from `jev/goal-evidence.ts`. Every other stage keeps `evaluate`.

### Recording

`GroundedCheck` gains `assessmentDraws?: Answer[]`. The report renders the split next to the existing sufficiency label whenever more than one draw was taken, so a 3-2 verdict reads as a 3-2 verdict. `summary.json` and `result.json` carry the draws through the existing grounding structure without a new top-level field.

## Acceptance

- `vote` issues five draws for a 3-2 split and three for a unanimous start; stopping is driven by the count only, and the same early stop occurs whichever choice leads.
- `vote` caches the aggregate, not a draw: a second consultation with unchanged state issues no request and returns the majority.
- Accounting after a five-draw vote reports five logical calls and five questions, and a reused aggregate reports a reuse.
- `vote` rejects a questions object that does not hold exactly one question.
- A 3-2 split resolves to the majority choice, and the mean probabilities are recorded.
- A 2-2-1 split with no majority resolves to the plurality, and a 2-2 tie resolves by the higher mean probability rather than by which choice would complete the goal.
- An item whose coarse answer is `absent` while its grounded assessment is `present` completes; an item whose contradictions are `absent` still does not.
- A non-`match` scope with non-empty evidence no longer blocks completion, which pins the implication that put it there.
- The report shows the draw split for a voted assessment and shows nothing extra for a single-draw one.
- Existing suites pass. Assertions that pin call counts through the sufficiency stage are updated to the voted counts, and no assertion about completion semantics is weakened to accommodate the change.
- `npx tsc --noEmit` and `npm test` pass before the work is called done.

## Limits

- Voting reduces the variance of the decision. It does not make a genuinely marginal item certain: the with-context arm sits near 0.5 and stays there.
- **Measured 2026-09-24 and refuted.** The predicted 0.80 and 0.72 for two and three checks came from treating the 0.75 pass rate as a property of the item. Five runs per arm gave 5/5 for two checks and 1/5 for three. Splitting a compound item made one half unanimously `absent` where the compound passed every time, so decomposition changes whether a part is answerable rather than multiplying a fixed rate. See `docs/experiments/2026-09-24-evidence-pipeline-analysis.md`.
- What voting did change, measured: one run in five. Three of five 2-check runs drew a dissenting `absent`, and in one the dissent was the first draw, which the previous rule would have frozen.
- Contradictions, content classification and quote scope keep single draws. The contradiction veto has since been measured: it blocked 「開館時間」 in two of ten runs on an item that passed in the other eight. Extending the vote to that gate now has evidence behind it.
- Cost rises by roughly four to twelve calls per run against a measured 51 to 71, and rises further on runs that ground more items.
