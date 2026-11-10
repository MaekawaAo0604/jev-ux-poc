# Independent grounded-reason review

Status: accepted mechanically on corrected frozen snapshot after one independently reproduced and verified repair. Final suite: 9 passed, 0 failed; unresolved findings: none within scope.

## Scope and independence

Independent author inspected the actual reason-memory, config, core input/attachment, gateway adapter, replay, profile and comparator implementations. Product edits were prohibited. Only the new independent test, this review and independent-* reports were owned. The original E: checkout was untouched. No real API, environment file, credentials, or participant records were read. A dummy key was installed, process.loadEnvFile rejected reads, and every normal gateway request ended in a fetch stub whose assertions were separately collected and asserted outside client catches.

Initial snapshot: revision a4a741e391c7c23ff56c50f1feb7537c7fdba17f; sourceHash eb12d3d7359a6c79504ed696a5223f2fced97e5a6d4bfe894eea8d46d9ae0277. The complete source identity matched source-freeze.json and remained identical before/after the run.

## Finding returned for repair

Medium — reasonComparisonPlan returns shared mutable mode mappings.

Reproduction: get reasonComparisonPlan('reason-grounding'); mutate returned modes.old; request a second plan. Expected: the second plan retains experience-reason-excursion and has a distinct mapping. Actual: second plan contains the caller mutation and modes reference identity is shared. The same regression also reproduces for the original deferral-reason comparison. It can alter subsequent declared comparison arms within a process.

Evidence: reports/deferral-grounding-2026-10-29/independent-plan-isolation-repro.json and independent-isolation-red.txt. The dedicated regression failed before repair. The mutation ran in a separate process or was restored in finally; no source was changed.

## Initial executed evidence

Command: DEFERRAL_GROUNDING_AUDIT_PIN=reports/deferral-grounding-2026-10-29/source-freeze.json node --import tsx --test tests/deferral-grounding-independent.test.ts. Result before adding isolation regression: 8 passed, 0 failed, exit 0. The test defaults to its current runtime source baseline; historical ignored reports and the audit pin are optional.

Artifact root: reports/deferral-grounding-2026-10-29/independent-1793207827034-264936. Command output: independent-test-output.txt. audit.json records full before/after identity, available 58 predecessor ledgers unchanged and 24 available old raw trial replays verified.

Four actual local browser runs used the normal wrapper and gateway HTTP adapter with fetch interception. They shared the same scripted screen path through o6 and fixed action probabilities e2=.97, e3=.02, stuck=.01.

- Grounded changed_o5: 16 intercepted requests, 8 decisions, 7 UI operations; e2 weight 1, e2 really clicked at o6; next screenshot showed the sharing control and subsequent interaction completed the fictional task.
- Grounded still_blocks: 14 requests, 7 decisions, 6 UI operations; e2 weight .01, e3 really clicked, task incomplete.
- Grounded unknown: same 14/7/6 and retained policy; changed_o5 still had .7 raw probability.
- Legacy basis_changed plus Evidence=none: same 14/7/6, retained policy, no release. Legacy questions remained separate.

For grounded unknown and still_blocks, changed_o5=.7 exceeded their selected-choice probabilities. Neither probability mass nor argmax over review tokens released the reason. In every condition raw deferral remained; only changed_o5 removed the effective matching entry. Raw full distributions were saved unchanged.

At o6, actual assessment body included only reasonReview0Grounded for the grounded review, with unknown, still_blocks, changed_o4 and changed_o5. It reattached o2 original blocker PNG outside recency memory, alongside the same current/recency sources. All delivered image hashes were checked against actual base64 PNG bytes and the original observed o2 bytes. Bounds held: at most four unique images, three recency memory items, one reason image, eight experience transitions and eight reason entries. The assessment/action requests remained two stages per decision. No private oracle, audit screenshot, screen DOM, semantic holdout attributes, or participant data entered the body.

Visual inspection of independent input-2, input-5 and input-7 screenshots confirmed a visible original identity prerequisite, an identity-completion message in cited o5, and the sharing control after the actual o6 click. This is fixture-path evidence, not a model-accuracy measurement.

Pure controls covered unknown original category, missing/substituted original basis, unattached source, generation-end or earlier evidence, future evidence, pixels identical to home/original, conflicting observation IDs, malformed/missing/legacy-only response, NaN/negative/bad-total probabilities and stale generation fields. All fail closed or retain effective deferral as applicable. Absent/explicit separate mode produced equivalent legacy questions and admission output.

All four saved runs replayed. Ten initial tamper cases rejected config review-mode changes, raw token/probability changes, selected assessment token, selected source, generation, effective state, a question changed with a recomputed request hash, an unobserved source with a recomputed request hash, and original PNG byte changes. Artifacts were restored and the final replay passed. Saved replay verifies reconstruction and stored assets; it does not reexecute UI or API operations.

Actual normal comparator mock limit=2 completed the old/new notification pair with zero fetch/API requests, equal initial images and a consistent pair. A basisAdmission mismatch rejected pairing. The declared full schedule has exactly 12 slots, 3 scenarios x 2 replicates x 2 arms, with 24 requests/trial, 288/phase, 20 minutes and parallelism 1. The old comparator declarations remain available.

## Limits

These are deterministic stub and offline checks. Syntactic absence of contradictory changed-plus-none outputs is enforced by the interface and is not evidence of improved semantic understanding. Actual model release accuracy for unchanged or unrelated images, human fidelity, generalization and semantic identity remain unmeasured. Old saved records are never resent to an API. Historical evidence is checked only if locally available; missing records do not fail ordinary portable tests. No intermittent OS persistence or initial-navigation fault occurred in the initial independent run.


## Corrected snapshot and final acceptance

The parent applied the minimal fix after the independent finding: reasonComparisonPlan now returns a shallow copy of the selected mapping. Independent git diff inspection confirmed exactly this single product line changed from the initial frozen snapshot. No product edit was made by the verifier.

Final snapshot: revision 78615827064b790b41515b8037dfe6d3b3479555; sourceHash d6f0f040dbe5710679a1b556f7df3bf30e748b7e96196da62d01bfffa7b0c80d. The new test matched source-freeze-v2.json, then verified identical complete source identity before/after.

Command: DEFERRAL_GROUNDING_AUDIT_PIN=reports/deferral-grounding-2026-10-29/source-freeze-v2.json node --import tsx --test tests/deferral-grounding-independent.test.ts. Result: 9 passed, 0 failed, exit 0 (72.8 seconds). The mode-isolation regression passed for all three comparison kinds. The initial 8-pass result and separate failing isolation reproduction remain preserved; final success does not overwrite that history.

Final output: reports/deferral-grounding-2026-10-29/independent-test-v2-output.txt. Final artifact root: reports/deferral-grounding-2026-10-29/independent-1793208095956-248404. audit.json confirms sourceUnchanged=true, liveAPIRequests=0, 58 unchanged prior ledgers, 24 verified historical trial replays and no missing historical evidence.

The four gateway/browser conditions repeated the same results: changed 16 requests / 8 decisions / 7 UI operations / objective true; still, unknown and legacy-none each 14 / 7 / 6 / false. All 58 gateway requests were intercepted; no request reached a real API. Normal comparator mock connectivity was rerun separately with two arms, zero network requests and consistent pairing.

The final replay matrix includes 12 rejected modifications: the initial ten plus executed click action and selected action candidate changes. Both action modifications failed with EXPERIENCE_CANDIDATE_ACTION_MISMATCH. Config/question changes failed with REASON_QUESTION_MISMATCH; raw record/token/probability/source/generation/effective-state changes with REASON_RECORD_MISMATCH; the recomputed unobserved-source request with REASON_SOURCE_NOT_PREVIOUSLY_OBSERVED; PNG bytes with IMAGE_HASH_MISMATCH. The restored run replayed successfully.

The independent test had one TypeScript narrowing diagnostic during integration; explicit existence assertions for original attached/observed image references resolved it while preserving hash equality checks. tsc --noEmit exited 0; evidence: independent-typecheck.txt. The final full execution also passed these strengthened assertions.

Final disposition: the medium comparison-plan isolation finding is fixed and independently verified after one repair round. No unresolved product finding remains within this audit's scope. Mechanical integration acceptance is granted for the final frozen snapshot. Model semantics, unchanged/unrelated-image release accuracy and human fidelity remain unmeasured by this audit. No infrastructure persistence or navigation fault occurred in either full audit run.


## Read-only independent audit of the twelve live trials

Disposition: saved live artifacts are internally consistent with the fixed implementation and declared budgets. No new product finding was identified. The experiment gives positive evidence for the four intended changed-basis cases; it does not establish overall performance improvement or false-release accuracy.

The verifier independently read all twelve trial manifests, raw result.json files, saved step JSONs, response/question/input objects, delivered PNG assets and fresh request ledgers under reports/deferral-grounding-2026-10-29/live. Parent-generated summary/final-audit output was not used to derive the counts. The independent audit script calls no API, rejects fetch/loadEnvFile, performs no browser actions, and writes only independent-live-* evidence. Product, tests, experiment originals and ledgers were not modified.

Command: node --import tsx reports/deferral-grounding-2026-10-29/independent-live-audit.mjs. Final execution exited 0. Evidence: independent-live-audit.json and independent-live-output.txt. The complete current source identity, phase manifest and every trial source hash/revision matched source-freeze-v2.json (78615827064b790b41515b8037dfe6d3b3479555; d6f0f040dbe5710679a1b556f7df3bf30e748b7e96196da62d01bfffa7b0c80d). Source before/after and 295 tracked source-artifact/ledger files remained unchanged.

All twelve trials replayed. The verifier independently recomputed 490 attached-image references and validated 1,576 individual response choices against saved criteria. Each saved step matched its raw result entry; request input hashes reconstructed; source references matched actual PNG bytes; two requests per decision and all bounded-state/image constraints held. Fresh ledgers, trial manifests and raw request traces agree on 188 requests out of the 288 phase maximum: old arm 96, new arm 92, conservative charges 188. All 188 reservations were OK with attempts=1; responses reported one attempt and no failures. No retry, request overlap or infrastructure-fault termination was recorded. All 58 predecessor ledger bytes still matched their pre-phase SHA256 values.

For all four new revisit trials, raw reasonReview0Grounded chose changed_o5 at o6; the saved full choice/probability distribution matched the raw response. Admission recorded basis_changed with original o2 and new o5, preserved the raw original deferral, and removed only the effective matching entry. The actual chosen click was e2 for alpha and e3 for beta. It was recorded UI_PERFORMED, followed by a different screenshot containing the usable sharing control. The next click produced the disabled-sharing confirmation; final saved oracle value was true with 7 UI operations in each case.

The verifier visually inspected original prerequisite o2, cited completion o5, actual revisited sharing-control o7 and disabled confirmation o8 for both alpha-r1 and beta-r1. For each of those eight images, the matching r2 PNG SHA256 was identical, covering all four positive trials by byte equivalence. Original images visibly required identity verification; o5 explicitly stated that verification was complete and the sharing procedure could continue. These are appropriate positive fixture examples. They supply no unchanged-image or unrelated-image negative-control measurement.

The old four revisit runs had five completed review records and zero reason releases. Two selected basis_changed plus Evidence=none; three selected still_blocks plus Evidence=none. Their eventual needed revisit was enabled by the existing ALTERNATIVES_EXHAUSTED rule. Alpha-r2 made the needed revisit at step 8 and used 9 UI operations versus the new arm's step 6 and 7 operations. The other three paired revisit cases used 7 operations in both arms. Consequently, successful navigation in the old arm must not be misreported as a reason-memory release.

Across the complete phase, objective success was old 5/6 and new 4/6. Revisit success was 4/4 in each arm. Notification success was old 1/2 and new 0/2, and every notification trial had zero reason-review questions/records. Those notification differences cannot be attributed to the new grounded question. All six pairs shared the same initial product PNG, normalized config (excluding only id/reviewMode), charter/persona input and initial assessment input hash. Yet the actual first-assessment answer JSON differed in every pair; the audit preserves answer hashes and differing keys. In the notification pairs, some selected choices differed as well. This is observed model-output variability and unresolved notification behavior, not evidence of review-question benefit.

False-release rate, live unchanged/unrelated-image controls, general semantic reasoning and human fidelity remain unmeasured. The structural removal of changed-without-citation answers follows from the choice interface and is not itself evidence of improved understanding. The four successful positive releases do not support a general release-accuracy claim or a reliability estimate.

Auditor-script note: an initial audit assertion compared an entire raw response (which includes optional confidence) with the derived record (which intentionally stores choice/probabilities). That auditor assertion was corrected to compare the declared stored fields without relaxing choice or full-probability checks. The initial auditor error is preserved as independent-live-initial-auditor-assertion.txt; it is not a product or live infrastructure fault.

