# Inquiry outcome plan (2026-10-31)

Baseline: feature/virtual-beta-information-state,1f28508656c13b6cdcc92768a5c98d4ceec2a587/runtime ec48493a161files; preserved6546prior raw. Original E checkout remains untouched. Reuse existing isolated C worktree, no default branch push.
Evidence: working inquiry selects a target/check but runBeta carries only global experience intent, not that tuple. In prior real OpenAI workshop steps10/11/12 reconciliation repeats despite native11/12 satisfied, no save. Jev library resolves prerequisite but next global progress neutral. Not evidence of missing history globally or human fidelity.

Scope: opt-in visualHypotheses.inquiryOutcome=true requiring workingInquiry and state/deliberation. New profile experience-inquiry-outcome inherits experience-working-inquiry. Existing API stages, native schema/body, UI, sampler and weights unchanged. Pass selected condition/check/actual execution to next delivered observation. Two categorical judgments in existing assessment (result and current_image/none basis); incompatible check/basis downgrades result to unknown with reason. Keep latest3 model outcome records, separate from overall goal and audit. Unknown remains unknown; no hidden oracle/DOM/history, no extra memory images, no route rule or revisit ban.

Contract in inquiry-outcome-contracts.ts. Pure APIs:
beginInquiryOperation(args:BeginInquiryOperation):PendingInquiryOperation
buildInquiryOutcomeContext(source,goalSha256,pending,memory):InquiryOutcomeContext
inquiryOutcomeQuestions(ctx):Record<string,ChoiceQuestion> (empty first observation)
admitInquiryOutcome(response,ctx):InquiryOutcomeRecord|null
validateInquiryOutcomeRecord(record,ctx):InquiryOutcomeRecord|null
validateInquiryOutcomeMemory(memory):InquiryOutcomeMemory
rememberInquiryOutcome(ctx,record):InquiryOutcomeMemory
All copies closed schemas, no accessors/extras; source chronology/goal consistency; pending type from offered actual chosen action. No pending creation for done/stuck/abandon or failed execution. New memory only advances on an admitted judgment, last3 incl unknown, isolated run-local state. No outcome inferred from terminal audit.

Projection APIs:
inquiryOutcomeUserContext(ctx) and inquiryOutcomeUserMemory(memory): admitted-only model-visible summaries, raw reserved for sidecars. Explicit historical/last-assessed scope, no current-fact promotion.
inquiryOutcomeInstructions:string.
inquiryOutcomeCriteria(criteria,candidateIds,memory):{criteria,annotations}: preserve all IDs/order/nonUI; compact pointer to bounded model outcomes on UI rows, no candidate identity matching across frames, filter or weights.

Ownership: A inquiry-outcome.ts/tests/inquiry-outcome.test.ts; B inquiry-outcome-projection.ts/tests/inquiry-outcome-projection.test.ts. Parent contracts/config/core/replay/profiles/comparison/tests/docs. Shared worktree, do not revert others or edit common files without parent. TDD RED evidence before implementation.

Acceptance: next delivered observation has selected previous tuple and executed action; admission and updated admitted-only memory actually reach next action request; no hidden objective/terminal-only evidence; first step empty; capacity3 and independent trials; old modes unchanged; all questions/inputs/pending/memory/projection rederive in replay; rehashed tamper rejects incl unconfigured/early API/output failures; existing partial error classifications remain. New context freeze, independent reviewer execution after integration, <=3repair rounds.

Predeclared fresh real comparison: existing library/workshop unchanged and changed (necessary revisit) fixtures, working-inquiry vs inquiry-outcome,1repeat each=8trials, reverse order by task/condition,12judgments/15UI/3looks/300s/native60s/36requests pertrial,total288max,parallel1/retry0/phase42min. Stop quota/auth/model-output/accounting errors, no replacements. Source/config/native initial bodies/goals/images fixed; persona null. Primary objective goal with valid/invalid/missing denominators; secondary actual reconciliation counters, repeated checks with actual next-image conditions, raw/adjusted outcomes and selections. New fresh live inputs only, no saved input resends or participant data. No mandatory provider ranking/OpenAI extra batch. No stable causal/human claim from one repeat.
Frame policy first records plus first primary after actual reconciliation; missing remains missing. API latency separate from user behavior.
Plan sequence: module TDD -> parent integration/replay/regressions/build -> freeze and independent review/fix -> commit producer -> normal mock/live comparison -> seal/raw audit -> publish results/limitations/commands -> feature push.
Ruling: do not bundle intent/check pair redesign or quote verification; those remain separate next tasks, preserving one declared behavioral change.

Ruling after independent round1: IO-R1-001 confirmed actor union4 at decision5. Assessment retains before-context; after admission remove that context from action wire and expose only latest3 admitted memory (latest outcome includes prior tuple). IO-R1-002 confirmed action-only outcome questions evade replay; reject that prefix outside assessment even disabled/early-failure cases. Keep FAIL/raw evidence; repair only core wire and replay stage/capacity checks plus regressions. No API/schema/weights/selection changes.
