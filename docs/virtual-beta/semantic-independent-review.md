# Semantic controls — independent verification

Verifier owns only `tests/semantic-independent.test.ts`, this review and ignored verification artifacts. No product changes, real API requests, credential reads or saved-request sends were performed by the verifier.

## Initial frozen product and review round

Product revision: `e333750a75dfba596bcb80029bd49614c99d6889`; baseline `960ba57`. Product source hash: `5f3e59d19f76f968e35872805171a234530053d5bebf67566d1d7c3e37add276` (99 source files). The preregistered twelve-slot manifest regenerated exactly from seed 313977649. The commit preceded its first recorded reservation (commit 2026-10-28 10:17:13 JST; first reservation 10:18:09 JST).

Six independent tests pass: duplicate/nonfinite ROI fails closed; prompt candidate wording cannot spoof audited control identity; fully observed cue can support a later recropped decision while source mismatch invalidates evidence; infrastructure failure keeps the twelve-trial denominator and disables inference; five sensitive pairs plus one always-A pair give exact mapping p=1/32; and the committed assignment is reproduced exactly.

No critical learner leak or measurement blocker was found in the initial frozen code. One output defect was returned to the parent: semantic CSV rows use `legacy` as their UI because the CSV reads only `uiVersion`; JSON and HTML preserve semantic UI correctly. Parent elected to fix it alongside separately documented follow-up diagnostic conditions. The verifier did not modify product code.

## Actual initial live artifacts — read only

`reports/semantic-controls-2026-10-28/independent-artifact-verification-e333750.json` records the offline checks of the finished `live/` batch:

- Twelve assigned runs, 30 actual requests/choices, 54 attached image references, 30 raw audits and 30 admitted-image pixel comparisons. Initial product PNG hashes, all saved step/result copies, input hashes, asset hashes, raw-source hashes and source/vision hash agreements pass.
- All 99 product-source file hashes match the captured snapshot. Run revision/source identity matches the manifest. Every recorded selected candidate has maximal filtered probability under argmax. No model payload was resent.
- Every UI × replicate pair has identical initial admitted PNG and full model-input fingerprint across reversed mappings, and different full raw image hashes. The six UI × mapping fingerprint groups match across repetitions; raw images are not required to match across reversed mappings.
- All twelve runs have zero looks. Their first A/B choice is B. The six mapping-A runs later also click A. Objective notification stopping succeeds in all twelve, but newly exposed semantic support is absent: strict endpoint 0/12. Mapping statistic 0, exact p=1 over 64 assignments; UI range 0, exact p=1 over 1296 assignments. No invalid, missing, duplicate, censored or no-choice trials are dropped or recoded.
- The finished batch budget snapshot has used30, remaining18, thirty OK reservations. This is separate from the preceding phase's exhausted budget.

The outcome is negative evidence for the preregistered cue-supported endpoint under this condition. It does not show inability to read a cue that was never acquired. Clicking both alternatives can satisfy the original notification-only goal; objective success is therefore not proof of mapping sensitivity. Any subsequent diagnostics must remain separate by condition, protocol, code version and output directory.

The verifier inspected the actual reference-A initial and look-3 admitted PNGs from the fresh independent browser mock. Both labeled control badges are visible initially. The cue is absent initially and plainly readable in the look crop; the same two choices remain visible. Pixel comparisons verify that the complete admitted PNG is the corresponding raw-image crop, rather than trusting rectangles alone. The fixture/browser suite also covers all six fixture assignments, wrong/correct effects, reset, geometry, badges and visible success feedback.

## Fresh browser wiring and recorder checks at e333750

`independent-mock-e333750/` contains a fresh full twelve-trial browser mock: all twelve objective and subjective successes, one look and one UI click per run, 36 scripted evaluations, actual API0. Offline replay/pixel checks cover 36 choices, 72 asset references and 36 raw/admitted crops. Its strict endpoint12 and mapping p=1/64 are expected properties of the mapping-aware script, not model-performance evidence.

`independent-human-smoke-e333750/` records two trusted browser clicks and zero recording errors. It matches fixture, definition, source and unnumbered initial product screenshot. The actor is automation, selfAttested=false and comparison status UNVERIFIED_ACTOR; it is excluded from human evidence. Existing matching tests reject mismatched UI, mapping, version, source, definition and initial image. Human full-browser observation differs from the model's numbered crop; mouse position does not establish gaze. Human measurement remains deferred.

Build and independent tsc passed on this initial frozen version (`pre-diagnostic-build.log`, `pre-diagnostic-typecheck.log`). Its full regression was intentionally interrupted after the parent announced further product changes; `pre-diagnostic-regression-partial.log` is **not a completed full regression**. The six new independent tests were included in that command and also passed separately. Final acceptance remains pending the final frozen revision, complete regression, build/typecheck and required browser smokes after the last product change.

## Follow-up implementation review (before final freeze)

Independent inspection found that the preservation objective predicate had been defined but was not yet called by the per-step and final objective checks. The new independent real-browser integration test reproduced the error: mappingA, wrongB → correctA → done reported objective=true where the preservation objective requires false. `independent-preservation-oracle.log` preserves this RED result. Parent confirmed no follow-up API calls had started (budget remained30/48), and owns the product repair. This does not change the original mail-only results.

The same independent test covers both mappings and zero/one/two wrong clicks, including restoring the display before mail stopping; a historical display change must remain a preservation failure. It also checks that the hidden counter/objective-policy/assignment metadata does not enter learner wire. Final GREEN and final snapshot checks remain pending.

In the original live results, all six UI × mapping repetition groups have identical initial input hashes but different normalized model distributions between repeats. Their selected argmax action is B in every case. Saved-distribution reproducibility therefore does not imply identical distributions from fresh model calls; the actual selected first action happened to agree here.

## Round 2 — follow-ups at 69b55cc

Product revision `69b55cc7fb0e4ce92f5526c97becac2288289cdf`, source hash `614879e509b8b395ed275a180be81b9c4ed102c8a935d7710f34fbbf4b62fea9` (99 source files). The preservation predicate was connected to both objective checks. The unchanged independent test is GREEN: all seven independent tests pass, including all six A/B × wrong-count0/1/2 browser cases (`independent-preservation-oracle-green.log`). CSV semantic UI labels are fixed; new CSVs contain semantic UI identifiers.

The follow-up allocation was amended and committed before follow-up calls: exposed referenceA/B once each, max1 API per run (2 total); preservation referenceA/B twice each, max4 per run (16 maximum). These diagnostics do not replace or pool with the original twelve.

Offline checks of `exposed/` and `preservation/` verify all 99 source bytes against the then-current checkout, saved step/result equality, raw/input/asset hashes, exact PNG crop pixels, jev-1.14.0 response identity, argmax and recorded reservations. Exposed: two calls, two first choices correct with the cue initially visible, both objective mail-success, DECISION_LIMIT, no subjective-completion opportunity. Initial exposed PNGs for both reversed mappings were inspected and show readable routing text. This is limited evidence that the visible cue can affect the chosen control; it is not autonomous acquisition or proof of internal reasoning. Its initially visible cue intentionally fails the original newly acquired cue eligibility requirement.

Preservation: four runs, ten calls, zero looks. First choices are B,B,A,A in assigned slot order: mappingA-r1 B→A fails preservation; mappingB-r1 B succeeds; mappingA-r2 A succeeds; mappingB-r2 A→B fails preservation. FirstA2/B2, and each mapping has one objective success and one failure. Every subjective outcome says done. Recomputing wrong-click counts from actual actions and assigned mapping agrees with the independent objective2/4. Cue-supported first-choice endpoint remains zero. Exact twelve-trial tests are unavailable for these small separate diagnostic batches, as required.

The combined phase ledger is used42/48, remaining6, forty-two OK entries with one actual attempt each. The initial30, exposed2 and preservation10 reconcile exactly. No verifier requests were made.

A fresh `independent-mock-69b55cc/` browser batch passes all twelve scripted runs, 36 evaluations, actualAPI0. Offline checks include36 choices/72 attached image references/36 exact crops. The matching `independent-human-smoke-69b55cc/` has two clicks, no recording errors, matching source and unnumbered image, automation/selfAttested=false and UNVERIFIED_ACTOR.

Round2 build and standalone typecheck pass (`pre-viewport-build.log`, `pre-viewport-typecheck.log`). Its full regression was interrupted after the parent chose the final viewport-coordinate contract correction; `pre-viewport-regression-partial.log` is not a completed final regression.

The parent identified that image dimensions and viewport-coordinate look actions were present but source-viewport dimensions were not explicitly sent. Sending fixed source dimensions and a generic explanation of image-vs-viewport coordinates is a valid input-contract correction; it supplies no private mapping, ROI or answer. The omission is a limitation of the earlier conditions, not an established explanation of their behavior. Final round3 verification remains pending.

Historical snapshot note: after round2 changes, seven modified initial-snapshot sources match their historical Git blobs or CRLF form. Two human-recorder files had mixed line endings that uniform Git LF/CRLF normalization does not reproduce. Their exact initial checkout-byte match was already verified across all99 files before round2 (`independent-artifact-verification-e333750.json`); this earlier check is retained rather than claiming they match the later checkout. These checks establish saved correspondence, not signatures or tamper resistance.


## Round 3 — final viewport contract at e13a3be

Final product revision `e13a3be291452e56b6ce6522248e92e92a2b1ab4`, source hash `7d27ef96406e10e1a28fd32f1fcf29e2ff676c93c33a8bf42c0ef18d9bf1eab9` (99 exact current source-file matches). No product differences from that snapshot were present during independent final checks.

The final product diff adds only `observation.viewport` from `vision.sourceWidth/sourceHeight` and generic instructions distinguishing attached-image bounds, crop transform and original-viewport action coordinates. The new viewport test uses an actual PNG transform and verifies640×480 initial images versus640×465 bottom-right images, both with1280×900 source bounds. Inspection of the actual final wire confirms these fields and instructions, with no assignment, cue ROI, query, private objective policy or answer text added. This correction is not evidence that the earlier omission caused the observed behavior.

`viewport-recheck/` contains two separately recorded final-version mail-only trials, five actual requests (3+2). Both start centrally and make zero looks. MappingA follows B→A→done; mappingB follows B→done. Both independently stop mail and report done, but strict cue-supported first-choice evidence is0/2. This is a two-trial contract recheck, not a rerun of the full twelve-trial UI experiment or a replacement for its results.

`independent-final-artifact-verification.json` now covers all four real batches plus the final fresh mock. All47 real choices,83 actual attached-image references and47 raw/admitted crop pixel comparisons pass saved input/asset/raw hashes, copied step/result consistency, model identity and argmax replay. The final two-trial input pairs remain initially image/wire-identical across reversed mappings and raw-image-different. The three product snapshots remain distinct. Historical sources are checked as described above; the final99 sources match current bytes directly.

All155 asset references across the47 real choices and36 final mock choices are previously admitted `input-N.png` crops; every memory reference points to an earlier admitted image with the same hash. Raw audits and unnumbered full-product screenshots are not attached as memory images.

The phase ledger is used47/48, remaining1,47 OK entries, one actual attempt per entry, and no owner lock remains. It reconciles primary30 + exposed2 + preservation10 + viewport recheck5. There is no additional verifier API use, retry or saved payload send.

`independent-mock-e13a3be/` is a fresh twelve-context final-version scripted browser run: all objective/subjective successes, one look and one click each,36 scripted evaluations and actualAPI0. The independently checked strict12/12 is wiring evidence only. `independent-human-smoke-e13a3be/` has two recorded clicks, zero errors, matching fixture/definition/source and an initial unnumbered PNG whose actual bytes hash matches the model-side product screenshot. actor=automation, selfAttested=false, status=UNVERIFIED_ACTOR; no human results are claimed.

Final `npm run build` and standalone `node node_modules/typescript/bin/tsc --noEmit` both pass (`final-build.log`, `final-typecheck.log`). The complete final regression is running and remains the last pending acceptance check at this point.

## Final acceptance and completed regression

The complete final-snapshot regression finished with exit0: **708 tests,705 pass,0 fail,3 skipped**, duration631977.0249ms (`final-regression.log`). The three optional real OCR/live-model tests were deliberately disabled; they are not counted as passed. The full command includes all seven new independent tests, the actual-PNG viewport test, semantic browser/CLI/recorder tests, existing F1–F6 failure coverage and preceding phase budget/deadline/lock tests. The final allowed-click oracle, nondegenerate sampling, real-adapter stub image delivery and delayed durable-admission cases all pass. Both earlier interrupted regressions remain explicitly partial.

The final build and standalone tsc commands each exited0. The final product source hash remains `7d27ef96406e10e1a28fd32f1fcf29e2ff676c93c33a8bf42c0ef18d9bf1eab9`, and product diff against e13a3be is empty. All completed checks were run with optional live flags and API keys removed from their child shell. The verifier did not read credentials, send saved payloads or make real model API calls.

Acceptance conclusions:

1. Initial cue absence, whole-cue post-look availability, both controls/badges eligible before and after look, unchanged pre-click raw UI, mapping-invariant initial admitted input and mapping-different full source: verified by real browser tests, saved image hashes and exact crop-pixel comparisons.
2. All three UIs and both mappings, wrong/correct effects, reload/fresh-context reset, success feedback visibility and intended-only cue geometry/wording changes: verified locally. Fixed1280×900 remains the tested viewport.
3. Learner wire and memory admission: verified without private assignment/seed/query/ROI/answer/objective-counter metadata. Only declared goal, allowed persona/state, observed crop images, generic choices and final generic viewport contract are admitted.
4. Preregistered assignment, all twelve original cells, strict first-choice measurement, blind/wrong/null/error/no-choice accounting and exact64/1296 enumerations: verified, including hand-computable cases and adversarial independent tests. Invalid or incomplete datasets disable inference rather than being repaired into success.
5. Source/input/PNG/step/result correspondence, argmax, fresh contexts and repetition fingerprints: verified within the documented snapshots. Model distributions still vary across identical repeated inputs. Snapshot hashes are correspondence checks, not cryptographic attestations of a trusted runtime.
6. Durable cumulative budget, pre-HTTP admission, failed-request accounting, per-run controls, deadline rejection and lock release: existing regression passes. All47 real requests reconcile to the ledger; one authorized request remains unused.
7. Human recorder foundation: matching fixture/source/definition/unnumbered initial image and objective policy checks are present; the final automated smoke is excluded. Human observation differs from numbered crop observation, mouse is not gaze, and no actual human comparison is claimed.
8. Evidence reporting: `semantic-verification.md` agrees with the observed paths and limitations. Every compact `semantic-results.json` run and step was independently compared with saved results:20 runs,47 steps,18 initially hidden runs, zero looks. The original12, positive-control2, preservation4 and final-contract2 remain separate.

**Local implementation and recording/analysis checks: PASS. Autonomous hidden-semantic acquisition in the actual model runs: NOT ACHIEVED. Human measurement: DEFERRED by user.** There is no remaining known critical software/measurement blocker in this reviewed scope. The negative behavioral result and the limited two-case visible-cue selection result remain the observed findings.

Reproduction commands for the completed local verification:

```powershell
Remove-Item Env:JEV_LIVE_COMPOSITE,Env:JEV_LIVE_SEMANTICS,Env:RUN_OCR_INTEGRATION,Env:AI_GATEWAY_API_KEY,Env:TYPESAFE_API_KEY -ErrorAction SilentlyContinue
npm run build
node node_modules/typescript/bin/tsc --noEmit
node --import tsx --test --test-concurrency=1 tests/*.test.ts
node --import tsx runner/virtual-beta.ts --semantic --mock --order-seed 313977649 --repeat 2 --conditions semantic-capability --ui reference,position-only,wording-only --config experiments/virtual-beta/semantic-capability.json --charter experiments/persona/charter-semantic.json --max-total-api 48 --out reports/semantic-controls-2026-10-28/NEW-INDEPENDENT-MOCK
node --import tsx runner/persona-human.ts --smoke --compare-to reports/semantic-controls-2026-10-28/independent-mock-e13a3be/semantic-01-reference-a-r1 --out reports/semantic-controls-2026-10-28/NEW-HUMAN-SMOKE
node --import tsx reports/semantic-controls-2026-10-28/independent-final-artifact-verification.mjs
node --import tsx reports/semantic-controls-2026-10-28/independent-compact-verification.mjs
```

The final offline artifact scripts/logs and large PNG/trace assets remain in the ignored reports directory. Use new output directories for browser mocks/recorder smokes. No additional live run is required for this acceptance.
