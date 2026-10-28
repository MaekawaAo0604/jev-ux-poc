この文書は製品を編集していない独立検証担当の報告です。原画像・ログのリンクはローカル reports ディレクトリを参照します。実モデル実行の監査は後段へ追記します。

# UI-conditional independent verification

Decision: ACCEPTED for the declared controller mechanics at frozen v2, with the image-equality limitation below. No unresolved product blocker was found after repair. This is not an assessment of model improvement or human fidelity.

Frozen product revision: e432f1895aa1ed2c85f8cb322ceb15e190c34c44
Frozen sourceHash: d03ff817a9f40102851d25386e573925923adb93b80aa1c91f349e8563f374a3

Verifier ownership: tests/ui-conditional-independent.test.ts and independent-* reports only. Product files were not modified by this verifier. The test defaults to runtime sourceIdentity; an optional UI_CONDITIONAL_AUDIT_PIN explicitly enables a historical pin. Missing ignored historical reports are not a default prerequisite.

## Evidence and commands

- Final independent command: node --import tsx --test --test-concurrency=1 tests/ui-conditional-independent.test.ts, with optional pin reports/notification-switch-2026-10-29/source-freeze-v2.json.
- Final result: 13 tests, 13 pass, 0 fail, exit 0, 54.7 seconds. [Final test log](../../reports/notification-switch-2026-10-29/independent-v2-recheck-test.log).
- Final npx tsc --noEmit: exit 0.
- [Final audit](../../reports/notification-switch-2026-10-29/independent-1793211233638-265272/audit.json) contains sourceBefore/sourceAfter, sourceUnchanged=true, individual selections, images, tamper cases, archived counterfactuals, and predecessor ledger hashes.
- [Initial v1 rejection](../../reports/notification-switch-2026-10-29/independent-initial-review.md), [v1 exact failure evidence](../../reports/notification-switch-2026-10-29/independent-1793210811288-261224/audit.json).
- [First v2 strict-equality test failure log](../../reports/notification-switch-2026-10-29/independent-v2-test.log) is retained. That run passed 12/13 and failed only the overly broad all-step exact input equality assertion. Its raw evidence was not rewritten.
- [First v2 full JSON/path/pixel difference analysis](../../reports/notification-switch-2026-10-29/independent-1793211003638-261720/input-equality-analysis.json).

## Fixed defect and retest

Severity: medium. At v1 revision 29b3a0b2b70c97820c840d20d58bd65a4e67f646 / sourceHash bbbcdfa30ceeeb6c68a44c45be4a01f2b8ee90e20887370bd4b482a97608b3aa, nine malformed click/scroll/look action shapes were accepted and consumed a draw. Expected: InvalidDistributionError and next valid selection drawIndex 0. Actual: acceptance and next drawIndex 1.

Reproduction: node --import tsx --test --test-name-pattern='independent malformed action shapes' tests/ui-conditional-independent.test.ts. Initial exit 1, 1 failed test; product unchanged. Parent stopped that audit before browsers and repaired the product. The same independent test passes at v2. No product code was changed by the verifier.

The parent also repaired disabled deferral scope handling. The independent runBeta test uses deferral.enabled=false with saved selectionScope='ui-conditional', a real intercepted local browser, and a locally injected evaluator. It ends SUBJECTIVE_DONE with policy undefined and replay succeeds. Thus disabled deferral does not invoke weighted conditional selection.

## Acceptance by requirement

- PASS — Same safe pre-policy baseline and original v1 draw: independent SHA-256/cumulative-distribution oracle checks 512 sample seeds plus two argmax cases. 208 baseline non-UI events and 306 UI events were checked, without adding RNG draws.
- PASS — Non-UI preservation: separate argmax/sample cases cover done, stuck, abandon, look, reread, and wait. Each baseline non-UI outcome remains the selected point mass.
- PASS — UI classification uses actual action.type: deceptive names such as stuck carrying a click and e1 carrying a stuck action classify by action type. Label getters throw if accessed; these tests pass.
- PASS — Distribution contract: independent numerical checks cover before, weightedUIMass, UI total, each non-UI mass, complete marginal, final conditional filtered distribution, baseline, selected, and conditionalDraw. Exact CDF endpoints select the next interval, and subsequent calls use the next original v1 draw.
- PASS — Invalid scope, absent/nonpositive/nonfinite/out-of-range/underflow weights, malformed actions, invalid raw probability, unknown/empty exclusion, and zero surviving mass reject without consuming a sampler counter. An excluded dominant click remains zero in before/marginal/filtered, and the safety reason is recorded.
- PASS — No-UI, zero-UI, all-UI, ties, separate instances, configuration snapshot, record mutation isolation, and modelChoice distinct from sampler selection.
- PASS — Legacy unspecified versus explicit global records match exactly in independent fixtures. Independent formula checks the weighted old distribution. Three complete archived failure SelectionRecords reproduce field-for-field from unchanged raw, weights, seed and drawIndex.
- PASS — Replay re-derives actual audited candidates. Pure replay rejects baseline/class/group/marginal/quantile/draw/selection changes and actual candidate type changes. Saved-directory replay rejects six separate changes: actual action, baseline class, UI group, marginal, config scope, and offered audit candidate. Result bytes are restored after each mutation; final replay succeeds.
- PASS — Profile changes only config id and deferral.selectionScope. Comparator schedule is 12 unique slots: three scenarios, two replicates, both conditions with reversed pair order. Limits remain 24 requests/trial, 288 phase, 12 judgments, 15 UI actions, three looks, 180 seconds, parallel one.
- PASS — Fresh comparator mock runs both conditions via runDeferralReasonExperiment({comparison:'deferral-scope',mock:true,limit:2}). It reports request count 0, scripted done with objective false is never success, and changes to memoryCapacity/maxReasonImages/reviewMode/weight each reject pair consistency. All 70 available predecessor ledger hashes are unchanged.
- PASS — Actual ordinary gateway/client/evaluator/core/browser connectivity with fetch interception: old arm has 14 intercepted requests and STUCK; new arm has 16 intercepted requests, baseline e2, selected Back, actual UI_PERFORMED, changed subsequent observation, then explicit done. Raw e2=.86 and policy weight=.01 are retained. Both objective assessments are false. New done is subjective and does not become success.
- PASS WITH LIMITATION — Input delivery contract is unchanged: current/memory/reason asset hashes are checked against actually attached PNG bytes, no audit DOM/hidden oracle/selectionScope/baseline fields are added to model state, memory stays bounded, asset names/counts and all non-image-reference input/question values compare exactly across 14 paired requests. This is a separate contract comparison after explicit corresponding attached-image SHA mapping; it does not claim exact raw input equality.
- NOT ESTABLISHED — Every later request being pixel/byte identical. Both independent browser attempts matched the first ten paired requests exactly, then differed at o6 and propagated that image reference into o7. The original strict failure is retained and quantified below.

## Actual input and image inequality

Both original o6 image pairs were inspected with view_image (four PNGs total). Text, labels and layout agree; the difference is inside the e4 notice card at x610..904, y271..349. Hover/transition timing is consistent with the observations, but the cause is not established.

First v2 attempt: 716 of 1,152,000 pixels differ (0.0621528%), maximum channel delta 1. Old o6 SHA c08bfe33092136012abad302477702c85a9cbe558b7f7d3c3afb8858dd81e274; new o6 SHA 9e31a25ca2c1c73b0aeecc5d45daa2d0f530e0feddcbe1991739f2b33104c53a. o1..o5 and o7 current PNGs have zero differing pixels.

Final v2 attempt: 21,306 of 1,152,000 pixels differ (1.8494792%), maximum channel delta 7, same bounding box. o1..o5 and o7 current PNGs again have zero differing pixels. Exact requests: 10/14. Four later paired requests are not byte-equal.

Input state differences in the first attempt consist solely of imageSha256 field values. Question differences occur in goalEvidence/evidence_* criteria.o6 descriptions and consist solely of the corresponding image SHA literal; wording and criteria keys otherwise agree. The complete paths for the first strict failure are listed below, with actual old/new values retained in the linked JSON. The final test records raw equality separately from the mapped-reference contract comparison.

## Archived failure counterfactuals

All three prior notification failures reproduced their exact old saved selection; e2 raw probabilities .86/.83/.86 and stuck .04/.05/.04 are unchanged. The old global policy selects stuck, while the new UI-conditional policy selects back with baseline e2. These are offline one-step arithmetic counterfactuals. No following action or goal achievement is inferred from them.

## Scope and unverified claims

External model/API requests by this verifier: 0. Dummy credential only; process.loadEnvFile throws if called. Each ordinary gateway fetch was intercepted and answered locally. The ordinary stub path deliberately uses mock=false, so its synthetic manifests and ledgers count 14/16 attempted evaluator requests; these counters are not external model calls. The two browser-pair executions together made 60 intercepted fetches, all local, plus separate comparator mock and local core fixtures.

No env file, real secret, participant trial file, or human record was read. No implementation deployment or human measurement was performed. Real-model performance, semantic reason accuracy, human intention/fidelity, statistical improvement, screen identity robustness, and stable goal achievement remain unverified by this audit. The model batch is the parent's separate work. Its raw-log audit has not yet been performed.

## Full diff paths from the preserved strict failure

### Request 10 — o6 / assessment

- input.userState.memory.2.imageSha256
- input.userState.lastObservation.imageSha256
- input.userState.experience.transitions.4.result.imageSha256
- input.experienceContext.transitions.4.result.imageSha256
- input.memoryObservations.2.imageSha256
- input.deferralReasonContext.current.imageSha256
- questions.goalEvidence.criteria.o6
- questions.evidence_e1.criteria.o6
- questions.evidence_e2.criteria.o6
- questions.evidence_e3.criteria.o6
- questions.evidence_e4.criteria.o6
- questions.evidence_e5.criteria.o6
- questions.evidence_back.criteria.o6
- images.current

### Request 11 — o6 / action

- input.userState.memory.2.imageSha256
- input.userState.lastObservation.imageSha256
- input.userState.deliberation.assessments.2.imageSha256
- input.userState.deliberation.assessments.2.goalEvidence.imageSha256
- input.userState.deliberation.assessments.2.effects.e1.evidence.imageSha256
- input.userState.deliberation.assessments.2.effects.e2.evidence.imageSha256
- input.userState.deliberation.assessments.2.effects.e3.evidence.imageSha256
- input.userState.deliberation.assessments.2.effects.e4.evidence.imageSha256
- input.userState.deliberation.assessments.2.effects.e5.evidence.imageSha256
- input.userState.deliberation.assessments.2.effects.back.evidence.imageSha256
- input.userState.experience.transitions.4.result.imageSha256
- input.userState.experience.transitions.4.judgment.evidence.imageSha256
- input.experienceContext.transitions.4.result.imageSha256
- input.experienceContext.transitions.4.judgment.evidence.imageSha256
- input.memoryObservations.2.imageSha256
- input.deferralReasonContext.current.imageSha256
- images.current

### Request 12 — o7 / assessment

- input.userState.memory.1.imageSha256
- input.userState.deliberation.assessments.1.imageSha256
- input.userState.deliberation.assessments.1.goalEvidence.imageSha256
- input.userState.deliberation.assessments.1.effects.e1.evidence.imageSha256
- input.userState.deliberation.assessments.1.effects.e2.evidence.imageSha256
- input.userState.deliberation.assessments.1.effects.e3.evidence.imageSha256
- input.userState.deliberation.assessments.1.effects.e4.evidence.imageSha256
- input.userState.deliberation.assessments.1.effects.e5.evidence.imageSha256
- input.userState.deliberation.assessments.1.effects.back.evidence.imageSha256
- input.userState.experience.transitions.4.result.imageSha256
- input.userState.experience.transitions.4.judgment.evidence.imageSha256
- input.userState.experience.transitions.5.intent.source.imageSha256
- input.experienceContext.transitions.4.result.imageSha256
- input.experienceContext.transitions.4.judgment.evidence.imageSha256
- input.experienceContext.transitions.5.intent.source.imageSha256
- input.experienceContext.returnedRoutes.0.path.2.result.imageSha256
- input.experienceContext.returnedRoutes.0.path.2.judgment.evidence.imageSha256
- input.experienceContext.returnedRoutes.0.path.3.source.imageSha256
- input.memoryObservations.1.imageSha256
- input.deferralReasonContext.capture.evidenceCandidates.2.imageSha256
- questions.goalEvidence.criteria.o6
- questions.evidence_e1.criteria.o6
- questions.evidence_e2.criteria.o6
- questions.evidence_e3.criteria.o6
- questions.evidence_back.criteria.o6
- images.memory_1

### Request 13 — o7 / action

- input.userState.memory.1.imageSha256
- input.userState.deliberation.assessments.1.imageSha256
- input.userState.deliberation.assessments.1.goalEvidence.imageSha256
- input.userState.deliberation.assessments.1.effects.e1.evidence.imageSha256
- input.userState.deliberation.assessments.1.effects.e2.evidence.imageSha256
- input.userState.deliberation.assessments.1.effects.e3.evidence.imageSha256
- input.userState.deliberation.assessments.1.effects.e4.evidence.imageSha256
- input.userState.deliberation.assessments.1.effects.e5.evidence.imageSha256
- input.userState.deliberation.assessments.1.effects.back.evidence.imageSha256
- input.userState.experience.transitions.4.result.imageSha256
- input.userState.experience.transitions.4.judgment.evidence.imageSha256
- input.userState.experience.transitions.5.intent.source.imageSha256
- input.experienceContext.transitions.4.result.imageSha256
- input.experienceContext.transitions.4.judgment.evidence.imageSha256
- input.experienceContext.transitions.5.intent.source.imageSha256
- input.experienceContext.returnedRoutes.0.path.2.result.imageSha256
- input.experienceContext.returnedRoutes.0.path.2.judgment.evidence.imageSha256
- input.experienceContext.returnedRoutes.0.path.3.source.imageSha256
- input.memoryObservations.1.imageSha256
- input.deferralReasonContext.capture.evidenceCandidates.2.imageSha256
- images.memory_1


# Final independent live audit

Accepted for saved-data integrity and declared controller mechanics. Goal improvement and human fidelity are not established.

- Producer: e432f1895aa1ed2c85f8cb322ceb15e190c34c44 / d03ff817a9f40102851d25386e573925923adb93b80aa1c91f349e8563f374a3.
- Final manifest: COMPLETED, 12 trials. [Raw audit](independent-live-final-1793212360/audit.json) and [trace audit](independent-live-final-1793212360/trace-audit.json) both exit 0 with failures empty.
- 224 saved responses, recorded client HTTP attempts, ledger entries and manifest requests agree; all attempts are 1 and settled OK. All 224 saved response.model tags are jev-1.14.0. Auditor external API requests: 0.
- All 12 replays pass. All 70 prior ledgers match their pre-run hashes. All 536 original files are unchanged before/after auditing and after image/trace inspection. Product source and HEAD were unchanged during each audit.
- All six pairs match initial PNG/Persona/Charter/config outside id and selectionScope. Initial assessment and action input hashes match in all six pairs. Assessment raw answers differ in all six; action raw answers differ in four. Initial categorical choices agree; probabilities vary.
- Independent arithmetic verifies all 56 new-scope selections using actual audited action types, safe baseline, weights, marginal mass, conditional filtered distribution, original draw/counter and actual action. All four new non-UI baselines are preserved. The live mode is argmax; sample edge cases belong to the earlier independent test audit.

Both arms achieve 4/6 with 112 requests each. All four notification trials remain objective false at DECISION_LIMIT; UI counts are 12,12,12,11. All eight necessary-revisit trials achieve objective true with seven UI operations, eight decisions, one grounded release and a performed revisit.

The old arm actually promotes zero terminal choices. Separately, notifications-r1-reason and notifications-r2-reason step 7 have modelChoice/baseline e2, raw e2 .80/.83 and stuck about .05, with e2 weighted .01. The actual conditional choice is Back/UI_PERFORMED; global recalculation on those identical distributions selects STUCK. Those are one-step arithmetic counterfactuals: the alternate global action and following goal outcome were not executed. A third difference is old notification-r2 global look_0 versus conditional Back.

Six actual delivered images were viewed: notification settings -> campaign -> settings, and revisit identity-verification-required -> verification-complete -> sharing button available. They support visible state changes and returns, not the model's internal understanding. Trace CRC, successful click/scroll calls and main-frame URL sequences agree with raw records. CDP Back calls themselves are absent from trace before-events; Back is supported by saved action/outcome and subsequent frame URL/image.

Reproduction from repository root:

node --import tsx docs/experiments/2026-10-29-deferral-scope-independent-audit.mjs [raw-root] [fresh-output-directory]

The main utility accepts root/output arguments and rejects existing output. Stored producer revisions remain strict. Current sourceHash and all sourceHashes must match; currentRevisionMatchesProducer is separate so a docs/tests-only commit can change HEAD. Before/after HEAD/source equality remains mandatory. The separate Python trace utility takes raw-root and the existing audit-output directory.

Two tooling errors were preserved: a wrapper-string parse error before command execution and a redundant Python parenthesis before trace reading. Both were repaired; fresh raw/trace audits pass and original files remain unchanged. See [full report](independent-live-final-1793212360/report.md), [wrapper error](independent-live-wrapper-failure.json), and [trace parser error](independent-live-trace-failure.json).

No API inputs were resent; no env file, real secret or participant record was read. Remote billing/model internals, broader semantic accuracy, screen-identity robustness, human fidelity and statistical improvement remain unverified. Notification navigation remains unresolved.
