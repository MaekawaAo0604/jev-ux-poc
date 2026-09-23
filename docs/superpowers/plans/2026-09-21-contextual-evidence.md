# Contextual Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Make observed evidence subject-aware and incremental, retain exploration progress, and verify real-site behavior.

**Architecture:** Context originates in the visible DOM and survives in observation history. A per-run evidence session reuses successful context-matched judgments and verifies scope plus sufficiency before completion. Navigation choices remain Jev's choices.

**Tech Stack:** TypeScript, Node, Playwright, existing AI SDK native choice evaluation, node:test.

**Spec:** docs/superpowers/specs/2026-09-21-contextual-evidence.md

## Global Constraints

- The goal and its literal excerpt checks remain unchanged. Never inject reference answers, desired routes, hidden/offscreen text, or site-specific rules into Jev.
- Only the opt-in goal-check flow changes its decision strategy. Legacy combined decisions remain available.
- Native Jev choice questions; no additional generative model or OCR dependency.
- Exact observed quotes, source steps, warnings and omissions remain auditable. Equal text with different page/section context is not interchangeable.
- Preserve public navigation safety, the action limit, final post-action observation, and objectiveSuccess:null.
- No form submissions, registration, contact, publishing, or new access permissions.
- Cache raw successful judgments only within a run/explicit matching snapshot. Do not cache a completion decision across changed observations or ignore newly observed exceptions.
- API errors remain technical failures, never evidence of bad site UX or success. Existing bounded transport retries must not be multiplied by hidden outer loops.
- Do not read, print, commit or copy .env or credentials. No Git staging/commits: the repository has no initial commit and all existing files belong to the user.

### Task 1: Visible context and exploration progress

**Ownership:** jev/types.ts, pages/visible-text.ts, pages/AccountPage.ts, jev/history.ts, new jev/progress.ts, tests/context.test.ts, tests/history.test.ts. Do not edit decision/grounding/public runner files; Task 2 integrates them.

**Interfaces:** Add only optional fields to existing types:

```ts
export type RegionContext = {landmark:'main'|'navigation'|'header'|'footer'|'other'; section:string; headings:string[]};
// TextRegion.context?:RegionContext
// Observation.pageId?:string; Observation.viewport?:{top:number;bottom:number;height:number}
// History entry: observedRegions?:TextRegion[]; pageId?:string;
// viewport?:Observation['viewport']; remainingGoalChecks?:string[]
export function explorationProgress(state:State): {
 currentPage?:string; visibleRange?:Observation['viewport'];
 pages:{pageId:string;ranges:NonNullable<Observation['viewport']>[];actions:{step:number;label:string;result:string;remainingGoalChecks?:string[]}[]}[];
};
```

- [ ] RED: browser test a visible section headed `Members` with `All clubs`, another `Students` with `Parent club only`, hidden `SECRET_HEADING` and an offscreen heading. Assert visible heading associations and absence of secret/offscreen strings from serialized context. Assert same-word sections get different section IDs.
- [ ] RED: `rememberObservation` preserves matching regions, warning context and page IDs; trimming never retains text through metadata after removing it from observedText. `explorationProgress` distinguishes pages and records only executed history actions; literal expected current page/ranges and labels.
- [ ] Run focused tests: `node --import tsx --test tests/context.test.ts tests/history.test.ts`; save expected assertion failure before implementation.
- [ ] Implement context in the existing character-visibility pass, using only emitted region text for headings. Deterministic section identity may use opaque DOM position, never expose DOM IDs/classes/selectors. Heading ancestry must not leak across sibling sections. AccountPage maps actual document URL (without fragment) to opaque IDs; do not expose URL in pageId. Keep metadata additive for old logs.
- [ ] Implement immutable history metadata copying and progress derivation; no goal-specific logic or navigation filtering. All context text must be traceable to previously observed text.
- [ ] Run focused tests, then the full suite and `npm.cmd run build`. Self-review and write task report with RED/GREEN evidence. Do not commit.

### Task 2: Incremental, subject-aware decisions and checkpoint integration

**Ownership:** jev/goal-evidence.ts, jev/goal-status.ts, jev/decide.ts, new jev/evidence-session.ts and optionally jev/evidence-blocks.ts, runner/public-site.ts, runner/report.ts, README.md, tests/goal-evidence.test.ts, tests/goal-status.test.ts, tests/report.test.ts, tests/public-cli.test.ts, tests/fixtures/limit-provider.mjs, new tests/evidence-session.test.ts.

**Interfaces:** Consume Task 1's optional context, page IDs and `explorationProgress`. Preserve existing exports with optional session parameters. Export a factory, snapshot type and restore path from `evidence-session.ts`:

```ts
export function createEvidenceSession(options?:{snapshot?:unknown;checkpoint?:(snapshot:EvidenceSessionSnapshot)=>Promise<void>}):EvidenceSession;
// jevDecide(state,candidates,{goalChecks,session?})
// assessGoal(state,checks,session?)
// Snapshot is JSON-safe, validated and namespace-bound to goal/checks/date/model/prompt version.
```

- [ ] RED: returning `present` for sufficiency with a mismatched/uncertain subject never produces done. Empty direct evidence never produces done. Assert raw scope and sufficiency answers survive separately.
- [ ] RED: evaluate an unchanged context twice with one session; observe fewer native evaluation calls and same exact source quotes. Same text under another page/heading must be evaluated separately. Added exception forces final re-evaluation. Prior returned assessments must not mutate when session grows.
- [ ] RED: fail a later request after an earlier success, serialize session, restore it, and re-evaluate same state. Only missing work is requested; failed response is not a cached success. Different goal/check/model/context or malformed snapshot is rejected or safely starts uncached. Credentials/raw exception data never enter snapshot.
- [ ] Run focused tests to observe expected failures, not merely import errors.
- [ ] Build observed blocks with local heading/landmark/page context and exact source occurrences. In old logs without page identity, do not merge across observations. Screen each new block once using native choice and unchanged goal, preserve uncertain blocks. Reuse requests only when their actual semantic inputs match; avoid passing changing global history into a supposedly local cache key. Keep irrelevant output auditable. No dropping evidence solely to meet a top-K limit.
- [ ] Classify quotes only from retained candidate blocks, then explicitly check subject applicability and completeness/contradictions. Cache successful intermediate work with injected persistence. Never reuse final completion for changed observed input. Keep per-request accounting (logical calls, attempts, failures, questions, reused work) without leaking secret SDK data. Use existing bounded retry behavior, no new whole-run loop.
- [ ] Integrate one fresh session per public CLI run, persist `evidence-session.json` inside its exploration directory after successful work, and pass factual explorationProgress to next action decisions. Attach current pending checks to history records. Preserve all action candidates except existing experimental done restriction. Do not change unrelated safety boundaries or legacy default.
- [ ] Report scope, sufficiency, screening/cache statistics and interrupted stages separately. Show warnings and exact quote source links. Update test-only SDK provider to understand new question categories without pretending its answers measure model quality.
- [ ] Run focused tests, then full suite and build. Document changed behavior, resumable immutable-state verification, caveats and total accounting. Write task report with RED/GREEN evidence, no commit.

## Controller validation (after reviewed production tasks)

- [ ] Snapshot baseline source files before changes, never credentials. Record baseline commands/results and prior live batch `reports/goal-check-live-2026-09-21T00-46-13.375Z`.
- [ ] Build read-only replay/summary scripts under docs/experiments while Task 1 runs. Expected labels stay in harness only. Include previous negative cases and generic-member-only subject mismatch.
- [ ] Run real-model replay, preserve errors and mismatches. Review source references and measured question/call reductions; no conclusions from fake provider tests.
- [ ] Freeze production hashes, run highschool twice and tour once with the existing fixed safe public-site batch, including all failures. No production edits during a live batch.
- [ ] Inspect recorded facts, chosen quotes, source screenshots, API attempts and time. Generate and visually inspect an HTML summary without rewriting old results.
- [ ] Final whole-change review and fresh full tests/build; report achieved and remaining behaviors truthfully.
