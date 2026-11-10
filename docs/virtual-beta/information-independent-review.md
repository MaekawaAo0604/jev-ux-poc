# Independent information-state verification

Status: verified. Final product `6b3c418` / test-only fixture repair `00a4ad07`: fresh build and standalone TypeScript check exit 0; final full regression 752 cases / 749 pass / 0 fail / 3 intentional opt-in skips, exit 0. The initial RED run and its diagnosed fixture failures remain recorded. This verifier made no real API calls and did not read `.env`.

## Review scope

Reviewed the initial candidate `b4d6a36d7228d71c6b2f79e12a250c21a1c0871c` against `a064e98`, then the final optional candidate-level presentation and replay repair at `6b3c418`. The independent expectations are that model hypotheses may inform ordinary choices but cannot manufacture evidence, certify objective success, suppress offered candidates, or execute after a safety stop.

The verifier changed only `tests/information-independent.test.ts`, this report and ignored `reports/information-state-2026-10-28/verification-*` files. Product fixes were made by their implementation owners. Product source paths match the frozen final revision with no diff.

## Finding and repair

**P2 — saved replay accepted historical citations not backed by attached images. Resolved in one repair round.**

On `b4d6a36`, valid categorical answers, regenerated assessment records, correct request hashes and real asset hashes could still produce `verified: true` when a historical citation named an unattached image key, or when its claimed source hash differed from the referenced asset. The positive control reused one attached image for two observation IDs.

Expected: reject either inconsistent historical source and accept the shared-image control. Actual before repair: both negative cases were accepted. Reproduction: `node --import tsx --test --test-name-pattern='independent: replay' tests/information-independent.test.ts`. Evidence: `verification-round1-red.log`, exit 1, 3 cases / 1 pass / 2 fail. This was a saved-artifact provenance gap; it did not demonstrate live runner leakage.

The replay repair binds current and historical image references to verified attached assets, checks source hashes and current observation identity, and rejects conflicting IDs. All three independent provenance cases now pass, including in the final full-suite log. No other product defect was reproduced in this review.

## Independent tests and final commands

The 11 independent cases cover observation-ID reuse with changed bytes, state isolation, non-finite or extra evidence probabilities, safety stop during assessment, action reservation refusal, subjective done despite insufficient/conflicting hypotheses, absent-versus-disabled input equality, the three replay provenance cases, and candidate-level projection.

Projection checks establish that IDs, order and original labels survive; arbitrary response fields do not enter descriptions; assessment requests, action input and image assets remain unchanged by this option; goal/effect categories appear beside the relevant choices; and a nontrivial ordinary action distribution stays 0.6 for done and 0.4 for the offered control. Done remains selectable despite a model goal assessment of unsatisfied.

- Final build: `npm run build -- --outDir <fresh OS temporary directory>`, exit 0. Temporary output avoids repository HTML changes during model collection. Evidence: `verification-final-build.log` and its status JSON.
- Standalone types: `node node_modules/typescript/bin/tsc --noEmit`, exit 0. Evidence: `verification-final-tsc.log` and its status JSON.
- Final full regression: `node --import tsx --test --test-concurrency=1 tests/*.test.ts`, exit 0, 752 cases / 749 pass / 0 fail / 3 skips, duration 685800 ms. Evidence: `verification-final-full2.log`, its status JSON and `verification-final-status.json`. The first full run remains `verification-final-full.log` (exit 1, 747 pass / 2 fixture failures / 3 skips). Live flags/API keys were unset in both runs.

## Saved real-model audit

All 8 trials across four batches passed `verification-actual-final-audit.log` with exit 0. `verification-compact-chain-audit.log` also passed with exit 0 and reconciles the compact `information-results.json` against the original run files. `verification-crop-geometry.json` records independent geometry checks.

The initial baseline/two-stage batches identify `b4d6a36`, source hash `6321583c95843cd5b7da84f1518d24a467668b004cc355ff14653c8658dc2111`. The revised/exposed batches identify `6b3c418`, source hash `c18306347c31b0e511feb619e2e9145d2485d0ff717625c1431d7e2cae5f6641`. Each batch's 102 source hashes match the frozen Git content or its exact existing Windows checkout representation: 85 direct Git byte matches and 17 checkout line-ending representations. The source identity excludes credentials and reports.

The audit verifies every raw/attached image hash, request hash, response distribution, sampler input, assessment-to-action state transfer, replay record and crop pixel. All 18 crop geometries match independent calculations from configuration and fixation; all 5,481,600 delivered crop pixels match their source rectangles. All 6 hidden initial crop images share SHA-256 `7a712fff827ea9f277492fb24d866e54779e1f4b65d010b04667edc5e9b268b8`. Baseline and both hidden variants have the same initial candidate ID sequences within each mapping. No private mapping, audit geometry or objective-oracle key occurs in assessment or action inputs/questions.

There are 18 action responses and 13 assessment responses, exactly matching the 31 ledger entries. All entries are OK with one attempt, all run counts are at most 8, and revision/source/condition metadata matches its run. The new phase used 31/32 requests with 1 remaining; no additional requests were made by this verifier.

The old ledger remains used 47. Every attempt record, including ID/status/metadata, exactly matches the previous phase's `viewport-recheck/phase-budget-after.json`. Its current-to-final byte hash remains `74715fa358ad9243592be5ada54361bf1bce25f52a538202806b253cc0e63a49`. No phase-start byte hash was captured, so preservation is supported by historical record equality and the hash comparison during verification, without a phase-start byte-identity claim.

## Actual behavior and limits

Original baseline A/B used 3/2 calls and ended subjective done with objective false/true. Original two-stage A/B used 4/6 calls and ended subjective done with objective true/false. Both original two-stage first assessments report insufficient knowledge and unknown effects, but select `e1` immediately with zero looks. Mapping B eventually reports goal unsatisfied and still selects done. These original negative diagnostics remain in the record.

Revised A uses 4 calls, clicks `e1` without looking and ends done/objective true. This is a blind correct choice, not acquired cue evidence. Revised B uses 8 calls and follows `look_0 → look_3 → e2 → done`. Independent inspection of the actual images and responses confirms:

1. Initial crop contains both controls, omits the side-effect cue, and the model reports insufficient knowledge/unknown effects.
2. The first look moves to the upper left; its next crop contains no eligible control and the model still reports insufficient knowledge.
3. The second look exposes the complete cue. The model reports sufficient knowledge, predicts `e1` conflicts and `e2` advances, and cites admitted `o3` image bytes. Both controls are available at the click decision.
4. The next action selects `e2`; all recorded raw/filtered weights remain equal with no adjustments and the proposed action equals the executed action at every step. The final assessment is satisfied and the next choice is done.
5. The saved final full screenshot shows mail notifications stopped and display standard; the independent preservation oracle is true. The recorded UI path contains only the one `e2` click, supporting the no-display-change requirement.

This is exactly one recorded hidden observation-to-cue-to-choice chain. The exposed controls each use 2 calls, choose the correct control with the cue initially available, and end `DECISION_LIMIT` with objective true. They do not demonstrate subsequent subjective completion. Original twelve-trial strict scores remain 0/ineligible because these new conditions do not satisfy that fixed protocol; the newly reported cue-supported observation is kept separate.

No open product or regression finding remains from this review. Human behavior validity, internal understanding, reproducible improvement and causal/statistical efficacy remain unverified. One replicate per mapping and the changed prompts/request budgets cannot establish those claims.

## Full-regression failure investigation

The first full run finished with exit 1 (`verification-final-full.log` and its status JSON): 752 cases, 747 pass, 2 fail, 3 skipped, 701943 ms. Both failures were existing `virtual-beta-phase2-independent.test.ts` scenarios intended to expire the run during durable reservation, using a 3000 ms whole-run budget and a 3100 ms reservation delay.

Saved artifacts locate the failures before the intended boundary. The slow-admission case elapsed 3156 ms with zero decisions and zero ledger entries. The settlement case elapsed 3124 ms with `DEADLINE_BEFORE_INFERENCE`, zero ledger entries and zero API calls. Thus browser initialization/capture consumed the test budget before reservation; the expected debit and settlement-failure path were never exercised. The product correctly prevented HTTP. No product timing rule is being relaxed.

An unchanged focused reproduction produced 1 pass / 1 fail, exit 1 (`verification-deadline-reproduction.log`), demonstrating dependence on initialization timing. A scoped Node `performance.now` mock was independently checked to support a deterministic offset and clean restoration. The fixture repair at `00a4ad07b0717682ce3d8652b58b4ac8c5a5330c` retains a realistic whole-run budget, performs the real durable reservation, asserts it was reached exactly once with a durable debit, then advances the scoped monotonic clock beyond the absolute deadline. No-HTTP, zero-actual-call, settlement-status, error-classification and lock-release assertions remain unchanged. The product stays frozen at `6b3c418`; these are test-only repairs. The independent repaired focused run passed 2/2 with exit 0 (`verification-deadline-fixed-focused.log`). Fresh final2 build and standalone TypeScript checks passed with exit 0 (`verification-final2-build*`, `verification-final2-tsc*`). The second full run passed with exit 0: 752 cases / 749 pass / 0 fail / 3 skips (`verification-final-full2*`). Both repaired deadline cases also passed inside that full run; the first RED evidence is retained.

The final rerun is bound to product hash `c18306347c31b0e511feb619e2e9145d2485d0ff717625c1431d7e2cae5f6641` and fixture revision `00a4ad07`. `verification-full2-freeze.json` records that hash and the exact bytes of both the new independent tests and repaired phase2 test file. The four real-model batches remain at their original `b4d6a36`/`6b3c418` snapshots; the test-only commit adds no model data or API requests.

## Final disposition

No unresolved product finding remains. The three skips are explicitly disabled opt-ins: real local OCR (`RUN_OCR_INTEGRATION`), live composite goals (`JEV_LIVE_COMPOSITE`) and live visual semantics (`JEV_LIVE_SEMANTICS`). They were not silently retried or counted as successes. The revised product source hash and both test-file byte hashes remained unchanged throughout full run 2. New31 reservations exactly match the final exposed-batch ledger snapshot; old47 records and the old ledger hash remain unchanged. `verification-final-status.json` preserves final exits, counts, skip lines and ledger checks.

The source, PNG, compact-result and representative-chain audits remain valid. The one observed acquisition chain is distinct from blind correct choices and initially exposed controls. Human behavior validity, repeatable improvement, causal efficacy and internal understanding remain unverified.
