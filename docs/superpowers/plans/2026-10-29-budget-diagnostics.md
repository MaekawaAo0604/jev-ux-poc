# Budget persistence diagnostics — 2026-10-29

Active improvement goal continues. Baseline92e0cf8, clean feature branch pushed/remote verified. Previous reason-admission iteration completed12 trials/204requests and independent audit, preserving46 ledgers. Functional admission fix works; review/evidence inconsistency and opaque persistence failures remain. Do not mark overall goal complete.

## Evidence and scope

Independent followup observed two opaque existing budget failures: settlement-persist with a complete temporary snapshot ending at8OK, reservation-persist with main3OK and complete tmp4RESERVED. Rawerrno and exact writeFile versus rename failure remain unverified. Later final6 and isolated500write/rename probe passed; do not label the OS cause proven or add blind retries. Preserve all raw evidence and orphan files.

Improve the proven diagnostic blind spot first: safe stage+OS code propagation, distinction between failure before actual request and after actual request. Preserve atomic temp-write/replace, owner lock, caps, one HTTP attempt, fail closed. No change to model input/persona/charter/selection/prompts/reason contracts and no filesystem/API retry. No path, message, stack, payload or credentials in public failure evidence.

Parent owns existing common budget/core/human-wrapper/standard-runner code and integration tests/docs. Reused worker owns a new runner/budget-persistence.ts helper plus tests/budget-persistence.test.ts only. Fresh independent verifier after integration. No overlapping product edits; no realAPI/env/human reads by workers.

Helper contract: BudgetPersistenceDetails={stage:'write-temp'|'replace-ledger';fsCode:allowlisted string}. BudgetPersistenceError exposes code='BUDGET_PERSISTENCE_ERROR' and sanitized details only. persistBudgetSnapshot(file,snapshot,io?) creates unique exclusive tmp, writes snapshot, then atomically replaces target; one attempt per operation, no cleanup on failure so evidence survives. Optional narrow IO {write(path,content),replace(from,to)} for deterministic tests; defaults native writeFile(flagwx)/rename. Unknown OS codes mapUNKNOWN, secret messages/paths are not copied. Parent reserve maps helper failure into admission error (no HTTP), actual request settlement maps to separately identified post-request error (API count remains1). Pre-request deadline settlement remains pre-request. Save safe diagnostics with existing result errors and classify as infrastructure fault.

## Acceptance

- [x] RED actual filesystem replacement failure produces only opaque admission error today; desired result preserves safe replace-ledger/OS code and still sends0 requests.
- [x] Helper tests real atomic success, old file preservation on write/replace failure, complete orphan snapshot, safe allowlist/no message/path leakage, no retries.
- [x] Wrapper fetchstub tests reservation failure actualHTTP0/apiCalls0, settlement failure after response actualHTTP1/apiCalls1, transport failure+failed settlement remains infrastructure and charged once, deadline0HTTP semantics preserved.
- [x] Normal path wire/behavior/caps/locks compatible; related regressions/type/build.
- [x] New-context independent verification on fixed source, fix/reverify as needed, no real API necessary to fake FS errors. Exact underlying intermittentOS cause still unverified.
- [x] Commit/push feature branch and continue model review/evidence coherence and observation identity work; do not claim full goal completion.
