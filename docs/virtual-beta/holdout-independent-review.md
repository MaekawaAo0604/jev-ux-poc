# Holdout stability independent review — 2026-10-28

Status: engineering verification accepted; 24/24 saved trials audited. Stable task completion was not established.

## Scope and independence

A fresh verifier owned only `tests/holdout-independent.test.ts`, this review, and ignored `reports/holdout-stability-2026-10-28/independent*` evidence. It did not implement or edit the policy, fixture, normal runner, or analyzer. Tests use the actual main entry and ordinary gateway adapter with a process-local fetch replacement, a mock-only credential, and an environment-file read guard. Real API requests: 0. No participant records or stored-input API requests were used.

The original frozen source hash was `54acf81ec95e4fde92458d7129dafb1878624de6cac926b850797f4e04bb938d`; implementation commit `76d687b928039be70ae84db39a34512595119326`. All listed source-file hashes matched that snapshot. Policy, selection, experience, deliberation, and profile contents matched baseline `4a67772b872c8b7893550295072177ea17c8de6a`. Raw Git blob and checkout hashes differ for files whose line endings are converted; the independent baseline comparison normalizes CRLF to LF and does not normalize any other content.

## Findings before live execution

**High — native Back does not satisfy the real revisit prerequisite.** Reproduction: open `/good/?holdout=r1a`, click sharing, call native browser Back, observe the actual initial home pixels, then open account. Verification remains disabled. Expected: the real home return admits verification. The fixture recorded home return only in its link click handler; the ordinary runner offers native Back. This could reject a legitimate exploration route and blocked live execution until repaired. Independent RED evidence: `reports/holdout-stability-2026-10-28/independent-nativeback-red.log`. The fixture was repaired to derive prerequisites from actual rendered route visits. Final independent tests passed for both alpha and beta, including native Back after the request and after verification. Resolved before any live API request.

## Completed preflight evidence

Initial independent run: 7 of 8 tests passed. The only initial failure was the verifier's raw Git-blob-versus-checkout byte assertion; after line-ending-only normalization, that source check passed. Dedicated source/native-Back run: 1 passed, 1 failed with the product finding above. TypeScript checking passed with the added independent tests.

Final preflight: **9/9 passed**, exit 0, 71.9 seconds; independent TypeScript check exit 0. Refrozen implementation commit: `5798717671f7fec7502a225e40ac56db48e1c5e4`; source hash: `dace005dbf214f7df94c6afdd4cf1b4f8085d6ad68bd87f9fd3238adec2a9b91`. Every listed source-file hash matched `frozen-source-round2.json`, and baseline policy contents still matched. Evidence: `independent-preflight-final.log`, `independent-typecheck.log`, and `independent-1793193125209-243936/preflight.json` under `reports/holdout-stability-2026-10-28/`.

Passed checks include:

- All six fixtures through the actual main entry; visible unique objective status; no premature status; reload resets; home-link returns reproduce initial pixels; revisit gates reject direct route bypasses.
- Native browser Back after the initial sharing visit and after verification; both variants then permit completion through the required actual revisits.
- Normal good/bad UI reachability and notification completion; bad routes and ambiguous selectors do not mount holdout.
- Ordinary adapter control/policy direct-success runs, six intercepted requests each, complete request bodies equal, fresh initial images equal, empty initial deferral state, recorded ledger accounting, and offline replay.
- Model state excludes fixture assignment, route query, reference path, DOM screen/audit, oracle, persona record, source identity, and deferral state. Long-context header is present.
- HTTP 503 and malformed assessment each consume one request, perform no UI action, and do not retry. An expired phase deadline consumes zero requests and zero actions.
- Ambiguous completion markers yield objective assessment error; safety stop remains invalid rather than task failure.
- Two-slot mock batch consumes zero API requests, preserves old ledgers, produces a consistent pair and replays; reusing its output is rejected without resetting its manifest.
- Adversarial analysis checks reject pair revision/source/config/persona/initial-image changes; faults do not enter failure counts or means; changed candidate ID with the same audited destination is not recovery; missing next observation stays unknown.

The initial implementation-side selected checks were reported as 152 distinct cases: 126 previous cases plus 26 new cases. The repair added one fixture regression; the final 27 new checks were being rerun by the parent at preflight acceptance. Its earlier integrated run was 139/140 while the UI was still being implemented; the one new mount-heading assertion passed in the later 26/26 run. The independent verifier does not relabel that earlier failed run as passing.

## Interpretation limits

The six fixtures are controlled local fictional screens. Rounded card edges were removed before any live trial after return rendering changed 44 pixels. Home screenshots are stable under this controlled layout, and exact-image identity remains the product mechanism. This does not establish robustness to natural rounded-edge rasterization, hover, animation, or ordinary dynamic screens.

Switch success reached directly through the correct entry is task completion, not evidence of recovery after a failed excursion. Revisit success requires an actual prerequisite and return path. Two repeats per cell are a bounded descriptive screening result, not a statistical reliability estimate, human fit, or causal policy-effect claim.

## Live evidence

The independent GREEN preflight was followed by the completed saved-artifact audit below. All independent evidence paths in this review are under reports/holdout-stability-2026-10-28/. Raw artifacts remain ignored.

## Completed live audit

Independent saved-artifact audit: **accepted**, 24/24 saved runs audited, no API request by the verifier. The execution used commit `5798717671f7fec7502a225e40ac56db48e1c5e4` and source hash `dace005dbf214f7df94c6afdd4cf1b4f8085d6ad68bd87f9fd3238adec2a9b91`. Immediately after the batch and before analysis changes, every one of 113 source-file hashes independently matched the live freeze. Evidence: `independent-live-source-before-analysis.json`.

The batch made 244/576 permitted requests: control 120 and policy 124. All 24 recorded outcomes were valid, with zero infrastructure faults. Each request had one attempt and long-context transfer. Per-trial bounds and sequential execution held. The audit independently checked all 24 ledgers, saved steps, delivered-image hashes and dimensions, trace ZIP entries, model boundaries, offline replays, 12 matched pairs, and all four initial images per fixture. Prior ledgers remained unchanged. The original summary exactly matched recomputation before the analyzer repair. Evidence: `independent-live-audit.json` and `independent-live-audit.log`.

There were seven unique final screenshot hashes across 24 runs. All seven images were visually inspected; their hash groups cover all 24 finals. The four switch-alpha finals show Wednesday as the current setting, an unpressed Saturday apply button, and no completion status. The other 20 finals show the correct new setting and visible completion status. Evidence: `independent-live-visual-review.json`.

### Observed outcomes

- Switch alpha: control 0/2, policy 0/2. All four left the informative delivery page, returned home, and entered the correct order page, then reported done before applying the change. The route switch occurred; goal completion did not.
- Switch beta: control 2/2, policy 2/2. All four used the correct entry directly and applied the change. These runs demonstrate direct success, not recovery after a failed excursion.
- Required revisit, alpha and beta: control 2/2 and policy 2/2 in each variant. All eight successes performed the ordered sharing → home → account verification → home → sharing sequence and applied the change.
- Direct reservation task, alpha and beta: control 2/2 and policy 2/2 in each variant. All eight completed with two UI operations and no policy-induced detour.

Each condition achieved 10/12. The fixed policy did not establish stable completion across this matrix. The model's done flag was true in all 24 trials; its four false completions remain task failures and were not excluded.

At step 6 of each revisit-alpha policy run, the saved pre-policy distribution favored sharing `e2=0.97` over account `e3=0.02` and stuck `0.01`. Weighting sharing by `0.01` changed deterministic selection to account, and the next audited observation confirms that destination. The already verified account caused an extra account/home round trip. Those policy runs used nine UI operations and 20 requests each, versus seven operations and 16 requests in the corresponding control runs. Later release allowed the necessary sharing revisit and both completed. This is a supported local correction effect in the saved decision; it does not establish a general causal effect of the policy. Revisit-beta control replicate 2 also had its own extra round trip, so the aggregate totals must not be reduced to that local mechanism.

### Offline analysis repair

**Medium, resolved — initial empty hash and #home were counted as different home routes.** The independent RED fixture used actual preflight URL/image identities: the same home image at an empty initial hash and at `#home`, with an observed change from primary to alternative, was incorrectly labeled source-mismatch. `independent-alias-red.log` preserves that failure.

After the live batch was completely saved, the analyzer was changed only for a valid opt-in holdout selector under `/good/`: empty hash aliases `#home`. It does not merge arbitrary URLs, images, or other semantic routes. Independent RED→GREEN verification passed. Exactly one source file differed from the live execution snapshot: `runner/holdout-analysis.ts`, SHA-256 `aef3ac1b19fda36404b1a779804a4967bc94b1ac1d238b9a09a7085c191dc0c9`. The post-repair analysis source hash is `bb213993e1006c56fdffef07aac8c80a5d43102838b99505c148386735b5c00e`; it is distinct from the source that generated model actions.

The original summary remains saved. Corrected summary content matched independent recomputation, and its separate provenance matched all 24 result-file hashes. Objectives, validity, requests, UI operations, timing, decisions, distributions, selections, deferral records, and paired identities were unchanged. Only route-derived metrics changed: control/policy post-return destination changes 7/6 → 10/10, and revisits 26/28 → 30/32. These destination-change counts include useful prerequisite navigation and do not themselves prove recovery. No API or UI action was reexecuted. Evidence: `independent-analysis-repair-audit.json`, `independent-analysis-repair-audit-final.log`, and `independent-alias-green.log`.

### Final regression portability

The final independent functional suite passed **9/9**, zero skips, in 71.6 seconds; TypeScript checking exited 0. It no longer requires ignored frozen-source JSON files or a hardcoded current whole-source hash. Instead it captures process-start source identity and verifies the same files and hash at completion. Baseline policy contents are compared to the existing baseline Git blob with line-ending-only normalization; when that historical commit is absent, only that historical proof receives an explicit skip, while functional cases still execute. The execution-specific full freeze remains checked in the independent live audit.

The initial 9/9 preflight result remains separate from this final regression. The first repair-audit script attempt compared a provenance-augmented summary directly to the bare analytical return value and failed on the extra provenance field; the final script verifies summary content and provenance separately. Its diagnostic log was preserved. This was a verifier assertion repair, not a product failure or another model trial.

Engineering acceptance is complete. The capability finding remains negative for stable completion and identifies both premature completion and over-deferral of a necessary revisit.

### Public report cross-check

The published JSON and Japanese report were independently accepted after checking all 24 per-run results and route records, all 12 cells and 12 pairs, both saved policy corrections, original/corrected summary hashes, execution/analysis source identities, and the selected-test count of 126 previous + 47 new + 9 independent = 182. The public records contain no credentials or participant identifiers. README, research, and task notes retain the same negative stability finding and next-step boundaries. Evidence: `independent-public-report-audit.json` and `independent-public-report-audit.log`.

Final functional evidence is `independent-functional-final.log` and `independent-1793194083728-249120/preflight.json`. The earlier preflight evidence remains preserved separately.
