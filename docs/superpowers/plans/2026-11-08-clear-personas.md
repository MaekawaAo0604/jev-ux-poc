# Clear-site persona comparison plan

> For agentic workers: use subagents for implementation and independent verification. User requests action and has authorized API use and feature pushes; no further budget or plan approval questions.

**Goal:** Test beginner/expert/cautious profiles on a clear, existing notification-settings website, beyond the previous device-only contrast.
**Architecture:** Reuse unchanged privacy fixture, normal runHumanJev and unweighted user profile. New narrow cohort and offline analysis reuse existing ledger/Persona/replay/distribution/viewer helpers. No new UI or actor policy.
**Tech Stack:** Existing TS/React/Vite/Playwright, no dependencies.
**Spec:** User asks ペルソナは？分かりやすいサイトで試せ. Parent chooses existing fictional まちの予約帖 / 予約のお知らせ, goal enabling reminder and confirming result.

## Fixed comparison

baseline(noPersona), A(beginner, explanations), B(experienced, efficiency), C(cautious, data-use/result confirmation), each4replicates=16planned. Same personalPC/device context acrossA/B/C, sharedgoal/UI/initialstate/model/profile. Knowledge/experience/expectations/tendencies vary as full profiles, not a single-trait causal isolation. No mandatoryhelp/correctroute/actionweights. Baseline unfitteduser, not human populationaverage.
Initial details scope basic is an existing UI default. Keep UI unchanged. Reconstruct pendingScope origin from all events: initialbasic; scope-* updates explicit origin; quick-enable-extended updates bothsaved+pending; navigation/disable does not reset pending. Distinguish initialdefault vs explicit selection vs prior-selection carry; never infer understanding from basic saved alone.
maxDecisions6/pertrial18effective stages, existing allocation36, total576allocation/<=288effective requests, trial300s/native60s/phase1hour/parallel1/retry0. Stop3trustedmodel-invalid, immediatelysafety/provider/accounting/source/audit faults. Timeout infrastructure, not abandonment. No replacementtrials.

## Ownership/contracts

Parent: new runner/clear-persona-comparison.ts, tests/clear-persona-comparison.test.ts, new experiments/persona/clear-notifications-v1/{a,b,c,set}.json, protocol, freezes/realrun/docs/integration. Existingactor/UI/type files unchanged.
Worker: new scripts/analyze-clear-personas.ts +tests/clear-persona-analysis.test.ts +ownreports only. Not alone; preserveotherchanges.
Fresh verifier: own tests/reports only, noenv/API/product/Git mutations; actualUI/normalmock/privacy/stopping/accounting/source/replay andfinalactual+publication audit.
Manifest same records/schedule shape as constraintcohort; phase clear-persona-comparison; actors baseline/A/B/C; fixture {version:1,task:privacy}; profile6. record.privacyAudit contains terminal notifications/scope/events/help/details/explicitScopeSelections. No method/capabilitymetadata.
Analysis eligible onlyvalidcompleted rows withSHA/identity/config/Persona+expectations/stagehash/images/ledger/replay checks; baseline persona absent,nullexpected andexpectations[]. Keep failed/pending/missing outsidebehavior denominator, retainprefixes. All6 actorpairs descriptiveTV within6each/cross16 matchinginitialgroups, raw+normalized+filtered and actualchoices separate. Humanfit unmeasured.

## Steps

- [x] RED/GREEN narrowcohort/summary/default-source bounds; baseline null and3profiledelivery; reuse unchangedfixture.
- [x] Independent preflight before real requests and frozen actor code/protocol/set/personas. Offline analysis implemented after real run; independent P2 native-admission gap repaired with full replay, portable regression fixtures and re-verification. Real actor source/raw unchanged; no extra API calls.
- [x] Execute16planned boundedtrials, preserveoldrawbefore/after, no sourcechanges midrun.
- [x] Independentlyauditactualraw/ledger/images/selection/defaultprovenance/viewer; reportno-differencehonestly.
- [x] Publish commands/roles/results/source and preserve the executable snapshot. Exact credential scan, staged gate and feature commit/push/remote evidence are recorded separately under reports/clear-personas-2026-11-08/{parent,independent}; gate execution does not modify experiment raw data.
