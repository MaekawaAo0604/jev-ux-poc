# Goal search result memory implementation plan

> For agentic workers: use superpowers:subagent-driven-development. Existing isolated C worktree; preserve original E edits.

**Goal:** Capture what the delivered view established about the literal Goal and visible goal-specific controls, preserve the actual result of explored routes, and allow the model to reconsider repetitions without banning revisits.

**Baseline:** 7fdaa5f044292f3316e050a9e2228453d9ab0ba2 / 6c32976401b2593ea61a233a20c8bc83b73996a386f384c858a4fea1f54d6b09. Prior turn progressed: correspondence implementation+independent fixes+real12/224+raw audit+pushed. Notification loop remained, neutral originated in model, no software loss. Goal remains active.

**Architecture:** Do not stack another penalty or force alternative actions. Reuse existing ImageJudgmentMemory for literal Goal fragments on the actual current image, with a bounded opt-in adapter and a current-view affordance choice. Existing Choice API has no free-text contract. This is structured semantic hypothesis memory, not a transcript or full account of what was read. Goal fragment subdivision is literal, incomplete; whole-Goal/oracle unchanged. Limit8fragments and8entries, no newAPIstage/images/dependency.

**Contracts / ownership:** Parent owns goal-search-contracts, config, UserState/BetaStep, core, replay, profiles and reports. WorkerA owns goal-search.ts + tests/goal-search.test.ts. WorkerB owns existing deferral-reason-experiment.ts + tests/goal-search-experiment.test.ts. Shared C tree, no overlapping edits. Fresh independent verifier after integration.

Config goalSearch={enabled,capacity:1..8}; requires state+deliberation+experience enabled. Profile experience-goal-search clones experience-reason-correspondence except id/config.goalSearch. GoalSearchEntry={kind:'model-goal-search-not-fact',source:ExperienceSource,goalSha256,scope:'delivered-current-view-only',requirements:{id,text,assessment}[],finding:{kind:'target'|'prerequisite'|'guidance'|'no-target-in-view'|'uncertain',candidateId?}}. Memory schemaVersion1 entries chronological max8, goal bound, detached copies.

Module API goalSearchQuestions(goal,current,candidates,sources), admitGoalSearch(response,goal,current,candidates,sources), rememberGoalSearch(memory,entry,config), goalSearchCriteria(criteria,memory,goal,current,experience,correspondence?), goalSearchInstructions. Reuse fresh ImageJudgmentMemory.bind(goal), questions(source,[]) and accept; prefix questions goalSearch_. Never retain its unbounded history or audit page IDs. Limit8 literal fragments, reject oversize, never silently truncate. Existing requirement definitions reused; current image only, prior recollections fallible.

Visible choice: target_eN only actual offered click IDs and only directly task-specific enabled control, not plausible navigation or label; prerequisite explicit visible unmet prerequisite; guidance explicit task guidance (not just related heading/menu); no_target_in_view only inspected current delivered surface lacks target/guidance, not a claim about hidden content, destination impossibility or entirepage; uncertain otherwise. Every known finding is a model hypothesis tied to actually attached current source. No separate confidence score or invented prose.

Action criteria may quote current finding + literal requirement status and historical route results. For actual performed click transitions only, match actual source candidate by exact delivered hash or admitted unchanged correspondence; changed links do not transfer. Source/result IDs and finding source intact; no unsupported/future/unobserved episode or unrelated Goal. Historical no-target is evidence about its own inspected view, never a ban or current truth. Prior prerequisite may have changed; observed new information can justify revisit. Candidate set/order, raw probabilities, sampler, deferral weights, terminal/goal oracle untouched. Current finding is not a forced action. User behavior/persona preserved.

Comparison goal-search: oldcorrespondence/newsearch, existing12slots3scenarios×2rep×2arms, max24/trial288phase,parallel1,no retries,12decisions15UI3looks180s,20min. Preserve94 prior ledgers. Component bundles current question+memory+criteria, not individual causal attribution. Initial model inputs/questions intentionally differ; source/UI/goal/persona/seed/initialconditions fixed.

## Acceptance / execution
- [x] Read-only diagnosis with source paths, existing ImageJudgmentMemory/Choice contract and actual source neutral.
- [x] WorkerA RED→GREEN: existing definitions reused, no labels/DOM, actualclick target validation, no/unseen/future sources, invalidprobabilities/unknownkeys, oversize goal, chronology/goal mismatch/copy/capacity/isolation, changed/unknown/progress-not-fact/revisit preserved.
- [x] Parent RED→GREEN config/profile/core/replay: no extra images/stage, exact question+source+memory+criteria reconstruction; disabled unchanged; no silent malformed normality. Existing correspondence annotation check accounts for the later search decoration.
- [x] WorkerB RED→GREEN pairedcomponent,94prior ledgers,12schedule/reverseorder/caps/fault accounting/actual raw annotation&selection metrics.
- [x] Freeze product commit/hash; fresh independent browser+normalgatewaystub; current4mock and previous60saved replays; types/build; fix/reverify max3rounds.
- [ ] Real12 interrupted by HTTP402 after38 durable requests (34OK/4ERROR), validpair0; remains incomplete. Original manifests/ledgers preserved. Real12 max288 fresh requests through normal runner, no saved input resend/humanrecord/env logging. Trace/actualpixel/input/response/selection/action/outcome audit. Do not count limits/faults as success.
- [x] Independent partial raw/visual audit: 5 replay/trace, 214 raw files and 94 prior ledgers unchanged, zero valid pairs. Docs/results/commands/open tasks prepared.
- [x] HTTP402 operational stop: 12-line runner change, independent assessment/action/500 controls, five fake requests, real0, offline recheck5/5, build success.
- [x] Final reports/test delivery prepared and verified: integrated87/87, independent-code19/19, operational offline5/5, build success. Feature delivery is recorded in Git; full real12 and human fidelity remain unverified. No revisit bans or manufactured success.
