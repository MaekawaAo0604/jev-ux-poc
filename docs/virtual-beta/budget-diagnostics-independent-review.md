# Independent budget diagnostics review — 2026-10-29

Result: PASS for the scoped persistence diagnostics and accounting change. The independent suite completed 16/16 tests, zero failures, skips, cancellations or retries. No blocking defect was found in the tested scope. This is not evidence that the underlying intermittent OS failure has been fixed.

## Source and isolation

- Worktree: C:\Users\Maekawa Ao\.codex\worktrees\virtual-beta\Ux_test.
- Revision: 92e0cf853ea4ac79c35486a60a18291f6ec498d4.
- Frozen product sourceHash before AND after: 1970c415a7c07a8cecf1e0ff258f6f4006109e0e7ff1a1d741b0da18700f6ca6.
- The complete source identity was independently recalculated with sourceIdentity and compared by deep equality against reports/budget-diagnostics-2026-10-29/source-freeze.json before and after execution. Both comparisons passed.
- This verifier added only tests/budget-diagnostics-independent.test.ts, this document and independent-* evidence. No product code, existing tests, dependencies or Git state were edited.
- The plan and all five changed runner modules were read before testing. A read-only diff confirmed the wrapper/core changes concern diagnostics and error accounting; the wire construction, judgment/selection logic and model prompts were not changed.
- A dummy gateway key was set inside the test process; process.loadEnvFile was replaced with a throwing function. All gateway dispatches used an in-process fetch stub. No real provider request, secret/env-file read or participant/human-record read was required.

## Reproduction

From the worktree root in PowerShell (explicit frozen-source audit mode):

    $env:BUDGET_DIAGNOSTIC_SOURCE_FREEZE='reports/budget-diagnostics-2026-10-29/source-freeze.json'
    & '.\node_modules\.bin\tsx.cmd' --test --test-concurrency=1 'tests/budget-diagnostics-independent.test.ts' 2>&1 | Tee-Object -FilePath 'reports/budget-diagnostics-2026-10-29/independent-tests.log'
    exit $LASTEXITCODE

Observed exit code: 0. Duration: 92538.5544 ms. Raw log: reports/budget-diagnostics-2026-10-29/independent-tests.log.

Evidence root: reports/budget-diagnostics-2026-10-29/independent-fixtures-1793206679068/.
The fixtures intentionally retain complete and partial failed temporary snapshots. Browser scenarios preserve result, manifest/comparison, screenshots and trace.zip artifacts.

## Expected and observed behavior

The first six tests independently verified the source freeze, helper behavior, JSON boundaries, adversarial diagnostics and PhaseBudget locks/caps:

- Controlled partial write: one write, zero replace calls; original bytes unchanged; partial temporary bytes retained; write-temp/ENOSPC exposed.
- Controlled replacement failure: one write and one replace call; original bytes unchanged; complete temporary JSON retained; replace-ledger/EBUSY exposed.
- Native replacement against an existing directory: replacement failed with an allowlisted code, directory/sentinel survived, and one complete orphan snapshot remained. This establishes the native failure path without asserting the historical OS cause.
- undefined, function, symbol, bigint, circular and undefined-toJSON roots rejected before either IO operation. Valid null, boolean, number, string, array and object JSON persisted successfully.
- Arbitrary codes, inherited code, newline-containing code, non-string values, a throwing getter and a throwing property-descriptor proxy yielded UNKNOWN. The getter was never invoked. Seven additional allowlisted codes remained intact.
- Serialized errors and wrapped public evidence contained only fixed categories; raw error message, path, stack and cause sentinels did not appear. Details were frozen. Fresh helper Error objects have their own ordinary local Error stack; the raw filesystem error stack is not copied or serialized.
- A second owner failed with EEXIST, per-run and phase caps rejected additional reservations, failed attempted requests remained counted, and reopening preserved the two debits.

Four boundary cases were exercised through each real wrapper, with actual filesystem replacement failure injected only at the selected reservation ordinal. The dispatch counter measures calls to the gateway fetch stub; it does not represent provider network traffic.

Standard CLI, first action request:

- reserve: expected/actual fetch dispatches 0, result.apiCalls 0, comparison.actualAPIRequests 0; BUDGET_ADMISSION_ERROR, boundary reservation.
- deadline-settlement: expected/actual 0/0/0; BUDGET_ADMISSION_ERROR, boundary deadline-settlement. The orphan recorded attempts 0 and DEADLINE_BEFORE_REQUEST.
- settle-response: expected/actual 1/1/1; BUDGET_SETTLEMENT_AFTER_REQUEST, requestOutcome response.
- settle-error: expected/actual 1/1/1 after stub HTTP 503; BUDGET_SETTLEMENT_AFTER_REQUEST, requestOutcome error.

Human experience-reason, action request after one successful assessment:

- The preceding assessment was admitted, settled OK and recorded deliberation.apiCalls 1, without a deliberation error, in all four cases.
- reserve: expected/actual total fetch/result/manifest counts 1/1/1; the failed action added zero.
- deadline-settlement: expected/actual total counts 1/1/1; the failed action added zero, and its orphan recorded attempts 0.
- settle-response: expected/actual total counts 2/2/2; the action was charged once, requestOutcome response.
- settle-error: expected/actual total counts 2/2/2; the action was charged once after stub HTTP 503, requestOutcome error.

All eight wrapper cases terminated API_ERROR and validForComparison false. Each performed exactly one failing persist, exposed replace-ledger plus an allowlisted errno, retained exactly one complete orphan, preserved the blocked directory sentinel and kept the durable original ledger at its last successfully persisted reservation state. Private provider/path sentinels did not appear in the public error/result. The ledger remained RESERVED after failed settlement, as expected for conservative durable accounting.

Every fetch assertion was collected separately and checked outside the client call, preventing a client catch from swallowing a failed test assertion. Expected action-versus-assessment request sequences were also asserted.

Per-case machine-readable observations are in:

- standard-reserve/evidence.json
- standard-deadline-settlement/evidence.json
- standard-settle-response/evidence.json
- standard-settle-error/evidence.json
- human-action-reserve/evidence.json
- human-action-deadline-settlement/evidence.json
- human-action-settle-response/evidence.json
- human-action-settle-error/evidence.json

## Normal behavior

The normal four-condition mock run sent zero gateway fetch calls. All four results remained validForComparison true and reached SUBJECTIVE_DONE with objective success true:

- current: 3 evaluator calls, 2 UI actions, 0 looks.
- vision: 5 evaluator calls, 2 UI actions, 2 looks.
- state: 3 evaluator calls, 2 UI actions, 0 looks.
- combined: 5 evaluator calls, 2 UI actions, 2 looks.

These scripted fixture outcomes check harness compatibility. They do not establish model performance or human fidelity.

## Limits and remaining risk

- This verifier did not run real API/model trials or reproduce human behavior. Those claims remain unverified.
- The historical intermittent OS failure's errno and exact originating operation remain unproven. Deterministic injection/native directory failure validates diagnostic behavior, not root cause or failure rate.
- Wrapper fault injection uses the existing PhaseBudget private runtime seam to redirect a selected persist to a blocked directory. Product defaults remain native wx write followed by one rename.
- This suite tests write-temp at the helper boundary and replace-ledger through both wrappers. It does not simulate every platform/errno combination through every wrapper.
- The independent tests add human action-stage coverage. The parent's existing integration suite covers human assessment-stage failures; its results are separate evidence.
- The parent reported two earlier related-regression failures at initial page.goto(networkidle, timeout 10000), followed by a 7/7 sequential rerun. This independent suite did not reproduce a navigation timeout. Neither result proves why the earlier timeout occurred; it must not be relabeled as a budget persistence failure.
- Type/build and broader related-regression results are maintained by the parent and are not counted as independent assertions in the 16-test result.


## Test portability review and targeted recheck

The initial 16/16 run pinned the historical source-freeze.json directly. Parent review identified a test-harness portability defect: that ignored audit artifact would not exist in a new checkout. This was corrected only in the independent test initialization. By default, the test now takes sourceIdentity() as its starting baseline and compares the final identity with it. Only an explicit BUDGET_DIAGNOSTIC_SOURCE_FREEZE value opts into reading a historical freeze file. There is no default read of that file.

The completed 16-test log and its original fixture evidence were preserved. After this test-only initialization change, these two targeted commands each passed 2/2 source checks with exit code 0; the eight browser scenarios were not needlessly repeated:

    # With BUDGET_DIAGNOSTIC_SOURCE_FREEZE absent:
    & '.\node_modules\.bin\tsx.cmd' --test --test-concurrency=1 '--test-name-pattern=independent source freeze' 'tests/budget-diagnostics-independent.test.ts'

    # With BUDGET_DIAGNOSTIC_SOURCE_FREEZE set to the frozen audit JSON:
    & '.\node_modules\.bin\tsx.cmd' --test --test-concurrency=1 '--test-name-pattern=independent source freeze' 'tests/budget-diagnostics-independent.test.ts'

Logs: reports/budget-diagnostics-2026-10-29/independent-fixture-free-check.log and independent-explicit-pin-check.log. Product source identity remained the same in both modes. This resolves the review finding without requiring a past report in ordinary npm test runs.
