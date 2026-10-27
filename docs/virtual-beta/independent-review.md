# Independent verification, round 0

Verifier inspected frozen commit `5b336d4cd93d70a3869444206a6c802a3189e314`, baseline snapshot `f09047e45ab13fe891a3686c58c310b2d03f7f82`, on 2026-10-27. Product code was not edited by the verifier. Synthetic browser fixtures, stubbed gateway fetches, and real local CLI runs were used. No credentials, .env files, saved live request payloads, or external APIs were accessed by the verifier. Parent started round 1 after the evidence below was collected; this report describes the frozen snapshot only until a re-verification addendum is recorded.

## Decision

The foundation has working image transport, a constrained input boundary, independent look actions, bounded fresh memory, actual seeded distribution sampling, and a reproducible four-condition local harness. Round 0 is not accepted yet: six defects affect deadline enforcement, result integrity, or audit evidence. None establishes human behavioral validity.

## Executed checks

- `npx tsc --noEmit`: exit 0, including the independent tests at initial compilation.
- Existing focused beta tests: 33 passed, 0 failed.
- Independent suite on the frozen snapshot: 8 tests, 3 passed, 5 failed. Additional global-call accounting probe: 1 failed. The terminal capture test was subsequently clarified to preserve the known user termination while requiring an explicit observation error and invalid comparison row; it was not weakened to ignore the failure.
- Four-condition actual mock CLI, explicit `experiments/virtual-beta/conditions.json`: all four objective success and subjective done, fresh initial fingerprints match, 16 calls total. `manifest.configs` exactly equals the loaded JSON. Fixed goal, Persona A, seed 20261027, viewport, locale, and timezone are saved.
- A second actual four-condition mock CLI with `--vision crop`: same outcomes and counts. The mock is a fixture script, not autonomous exploration evidence.
- Each of the eight run directories was replayed successfully: 32 saved choices and 52 image references in total. Each directory verifies both payload hashes and PNG hashes.
- Actual gateway-adapter wire inspection with global fetch replaced locally: full, crop, and foveated PNGs arrive in the HTTP body; every attached image has a model-input reference; crop edges reduce delivered size correctly; historical images resolve; constrained title/body/control text, DOM observation, and legacy history do not leak into state or questions.
- Browser integration with 16 fresh seeds and the same nondegenerate distribution: 8 clicked and objectively succeeded, 8 abandoned. The model proposed `done` with zero mass; it was never selected. Every selection started at drawIndex 0 and replayed. This proves integration uses probabilities, not human frequency calibration.
- The final allowed UI click is independently checked: objectiveSuccess true, perceivedDone false, UI_ACTION_LIMIT, one evaluation, final PNG saved. The budget can censor the next subjective judgment, but it does not lose the objective result.
- Independently read the parent's completed whole-suite log: 623 tests, 620 passed, 0 failed, 3 skipped, 521524.7693 ms. No duplicate full suite was launched by the verifier.

CLI evidence: `reports/beta-independent-20261027-foveated` and `reports/beta-independent-20261027-crop`. Reproduction source: `tests/virtual-beta-independent.test.ts`. Retained frozen failing fixtures: `reports/beta-independent-findings-round0`.

## Findings

### F1 — P2: a valid late response starts a UI action after the run deadline

Repro: maxRunMs 1200; evaluator waits `request.timeoutMs + 80` then returns a valid click on the synthetic notification button.

Expected: once the wall-clock deadline has expired, no new UI action starts; TIME_LIMIT is saved.

Actual: TIME_LIMIT is eventually saved, but uiActions is 1 and objectiveSuccess is true. The run took 1378.7478 ms. The deadline is only checked at the next loop boundary, after the click.

Evidence: `reports/beta-independent-findings-round0/deadline/result.json`, step 1 and final PNG. Regression: `late evaluation must not execute UI beyond maxRunMs`. Location: runner/virtual-beta-core.ts, evaluate response to executeBetaAction path.

### F2 — P2: malformed live-adapter distributions become API errors and disappear

Repro: actual evaluateChoices gateway adapter with a local HTTP-200 fetch stub; response has the requested model but only `{done: 1}` probabilities despite multiple offered candidates.

Expected: INVALID_DISTRIBUTION, no action, and inspectable typed raw invalid distribution evidence.

Actual: API_ERROR, error code INVALID_RESPONSE, no saved step.response. The adapter validates and throws before the runner's distribution classification and evidence handling execute. Direct-injected evaluator tests do not cover this production route.

Evidence: `reports/beta-independent-findings-round0/malformed/result.json`. Regression: `malformed gateway distribution must remain INVALID_DISTRIBUTION, not API_ERROR`. Locations: jev/client.ts response validation; runner/virtual-beta-core.ts evaluator catch.

### F3 — P2: zero remaining probability mass loses filter provenance

Repro: maxLooks 0, otherwise valid one-hot look_0 response.

Expected: fail closed, zero look/UI actions, with the original distribution and LOOK_BUDGET_EXHAUSTED exclusion recorded even though no selection is possible.

Actual: INVALID_DISTRIBUTION is saved with raw response, but no normalization/filter/adjustment evidence and no LOOK_BUDGET_EXHAUSTED reason anywhere in the saved step. An analyst cannot distinguish an invalid model distribution from harness removal of all its mass.

Evidence: `reports/beta-independent-findings-round0/filter/result.json`. Regression: `exhausted look probability records filter reason before failure`. Locations: selection.ts validation failure and core distribution catch.

### F4 — P2: requested and returned model identities may disagree silently

Repro: actual gateway adapter requests jev-1.14.0, local fetch returns valid choices with model OTHER_MODEL.

Expected: reject the model mismatch and invalidate the experimental decision while retaining safe identity evidence.

Actual: SUBJECTIVE_DONE, perceivedDone true; the response records OTHER_MODEL but no mismatch error. The CLI manifest would still label the experiment jev-1.14.0.

Evidence: `reports/beta-independent-findings-round0/model/result.json`. Regression: `gateway response model identity mismatch cannot be silently accepted`. Location: gateway response validation / beta evaluator adapter.

### F5 — P2: terminal observation failure is silently swallowed

Repro: a valid done response; only `page.screenshot({path: final.png})` throws.

Expected: preserve the known user event but record terminal observation ERROR with OBSERVATION_ERROR and invalidate the comparison row. Oracle and screenshot statuses must be independently visible.

Actual: ordinary SUBJECTIVE_DONE with perceivedDone true, no error, and no final.png. The empty terminal catch hides the missing evidence.

Evidence: `reports/beta-independent-findings-round0/terminal/result.json`, absent final.png. Regression: `terminal screenshot failure must be recorded as observation failure` (clarified metadata contract). Location: final oracle/screenshot try/catch in core.

### F6 — P2: rejected global API reservation is counted as a request

Repro: the evaluator's aggregate-budget guard immediately throws BetaBudgetError(API_LIMIT), before any gateway request.

Expected: API_LIMIT and apiCalls 0; attempted decisions/reservations may be separately counted.

Actual: API_LIMIT and apiCalls 1, because the core increments before invoking the guard. Aggregating per-run apiCalls can disagree with the CLI's actual totalCalls and misstate inference cost/budget use.

Evidence: `reports/beta-independent-findings-round0/apiCount/result.json`. Regression: `rejected global API reservation must not count as an actual call`. Location: core API counter before evaluate.

## Eleven acceptance areas

1. Inventory/reuse: inspected inventory, research, tasks and source. Existing client, Persona/Charter, POM, numbered screenshots and oracle are reused. Requested older beta documents were absent and are explicitly described as newly created. Frozen diff from f09047e adds beta modules, runner, tests, docs, config and package scripts, rather than modifying the old runner.
2. Fixed user/task versus mutable state: Persona and Charter remain separate inputs; oracle is removed from public model input. Mutable state admits observations, actions/outcomes, fixation and declared expectations. No learned emotion/fatigue/trust model is claimed.
3. Actual vision: full bytes preserve source; crop and foveated pixels differ as configured and reach the gateway adapter. Dimensions, SHA-256 and coordinate offsets are saved. Edge crops are clipped rather than shifted.
4. Constrained information: integration checked model state and question criteria for title/body/control sentinel text, DOM screen and legacy history. Past PNGs are attached with actual references. Screenshot pixels can of course contain visibly rendered words; the exclusion applies to hidden semantic side channels.
5. Looking versus acting: existing executor tests plus independent wire runs verify looks do not click. Budgets are separate counters; zero-look all-mass filtering exposes F3. The main run deadline exposes F1. UI cap intentionally ends the run, so the following subjective judgment can be unobserved.
6. Bounded fresh state: existing copy/allowlist/capacity tests pass; fresh-seed integration and fresh contexts show no previous-run memory or sampler counter. Constrained memory contains transformed past images rather than DOM-derived text.
7. Distribution selection/replay: nondegenerate integration exercises actual click/abandon effects despite a different modelChoice; sorted seeded draws and saved replay work. Invalid values fail closed in component tests. F2/F3 affect production-path invalid evidence and filtering provenance.
8. Four conditions/reset: explicit config JSON is loaded exactly; same goal/persona/date/viewport/seed/locale/timezone and matching reset fingerprints in both CLI runs. State is a bundle of memory, action vocabulary, behavior prompt and sampling changes, not a causal isolation of any one mechanism. --seed/--vision do not override an explicitly loaded --config; the saved configs are authoritative.
9. Audit/reproducibility: manifests, step inputs, questions, assets, distributions and replay hashes exist and were checked. F4/F5/F6 prevent full trust in model identity, terminal audit completeness and API accounting until fixed. Replay verifies stored arithmetic/assets; it does not rerun a model or UI and is not a signature against wholesale rewritten artifacts.
10. Outcomes/limits/timing: final objective success is checked even on the last allowed UI action. False subjective completion, abandon and infrastructure errors are distinct in passing tests. F2/F5 expose classification/evidence gaps. API and UI timing are separate; modeled user time is null by default and is not human hesitation. OBJECTIVE_SUCCESS and LOOK_LIMIT enum values currently have no runner termination branch; objective success remains an independent boolean.
11. Regression/independence/limitations: actual tests, local CLI executions, adapter-wire stubs, replay and final whole-suite log were checked independently. Controlled current arm intentionally lacks legacy frontier/revisit suppression and separate completion checks; this is documented, so it cannot be called an identical legacy-policy benchmark. Live model performance and human behavioral validity were not independently verified in this local-only review. The parent reports separate fresh live runs; those are distinct evidence and should not be presented as verifier-run API tests.

## Remaining verification

Re-run all independent regressions on the next frozen snapshot, then focused beta tests and typecheck. Re-run changed local CLI/replay paths if product changes affect them. Preserve the frozen failing evidence above. No additional external API calls are needed to validate these six local defects. Public sites, invoice oracle adapters, human participants, gaze/recognition calibration, and predictive behavioral accuracy remain outside this v1 verification.
