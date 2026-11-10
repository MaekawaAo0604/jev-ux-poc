# Constraint method choice implementation plan

> For agentic workers: use subagent-driven-development; user explicitly requested implementation and independent verification, opted out of further budget/plan permission questions. Reuse isolated C worktree, preserve E working tree. Feature push authorized.

**Goal:** Separate device-constraint sensitivity from common documentation browsing and platform failures.
**Architecture:** Reuse local personaTaskFixture/LocalExplorationPage and ordinary runHumanJev three stages. Add one explicit method-choice fixture and a narrow cohort using existing Persona-set loader/schedule/ledger/replay/viewer helpers. Never append to the legacy three-task default schedule.
**Tech Stack:** Existing TypeScript, React/Vite, Playwright; no dependencies.
**Spec:** User says 切り分けやすいとこ行けよ. Parent choice: four neutral-named Personas in a 2x2 device-constraint comparison; knowledge/experience/expectations identical. Fake local product, no real authentication or email.

## Global constraints

- Same UI/goal/1280x900/model/profile/initial state; only Persona tracking ID/name and two device facts differ. Names are neutral, still an input confound.
- Three equally prominent options: local device credential storage (5 seconds next time), nearby smartphone approval (10 seconds, phone required, no PC credential storage), temporary email code (60 seconds, no phone or saved PC credential needed). Times are fictional product descriptions, not measured user times.
- All options available to all actors; no defaults, recommendations, persona-based UI state, candidate filtering, weights, forced order or model output repair.
- Goal: choose/configure next-login method and verify saved settings. Shared expectation: low future effort among personally usable methods. Persona contains facts, never labels/routes/click instructions.
- 4actors x4replicates=16 planned, cyclic order fully balances four positions; not randomized. maxDecisions3, UI15/look3, per-trial300000ms, native60000ms, ledger allocation36, phase3600000ms, conservative allocation576; effective <=144 new requests from 3x3 stages, parallel1/retry0. No extra replacement trials.
- Freeze source/protocol/set/Persona bytes before real requests. Preserve old raw hashes before/after, no old human contents or direct saved API input resends.
- Native/model-invalid3 consecutive stops; safety/provider/auth/quota/accounting/source faults stop immediately. API timeout is infrastructure, never user abandonment.
- Functional goal oracle is method saved with matching visible confirmation, independent of Persona. Constraint-admissibility is post-run audit: local storage requires PC permission; phone requires phone access; code needs neither. Merely opening an inapplicable option is exploration, not a violation. Wrongly saved method may be functionally complete yet constraint-inconsistent.
- Model probabilities are not human frequencies, generated reasons are self-reports, no human fit claim.

## Contracts and ownership

Parent owns app/persona-task-types.ts (extend PersonaTask union with methods, retain personaTasks legacy3), runner/persona-task-oracle.ts, new runner/constraint-choice-comparison.ts and tests/constraint-choice-comparison.test.ts, protocol/personas, source/raw freeze, real runs, analysis/docs/integration.
Worker owns app/persona-task-fixture.ts, app/PersonaTaskFixture.tsx, new app/MethodChoiceFixture.tsx, app/persona-task-style.css, tests/constraint-choice-fixture.test.ts. New methods query opaque token. No shared runner/types/dependencies edits. Not alone in codebase; preserve others changes.
State: method and savedMethod optional on legacy snapshot; for methods required values none/local/phone/code. Initial none/none; choose changes method and route review, not savedMethod; confirm copies method to savedMethod and complete, change/back do not auto-save. data-persona-method-saved visible output uses fixed labels local=このPCに保存, phone=スマートフォンで承認, code=メールの一時コード. Generic completion status matches definition objectiveText.
Fresh independent verifier owns own tests/reports only; execute local UI/all-three paths, normal mocked pipeline/legacy regressions/source checks, then actual logs/viewer/distributions/accounting/constraints and publication gate. No API/env calls by verifier.

## Review focus

- Legacy three-task default remains36 slots, unique sequence IDs.
- No selected/default method, all3options inside initial viewport; no hidden actor facts sent from DOM/audit to model.
- Confirm state cannot be faked by text-only DOM mutation; saved method/visible summary agree; all3ways functionally valid.
- Fresh run/state isolation and identical initial model pixels/nonpersona native inputs.
- Failure/pending/missing excluded from selection denominator, first exploratory selection distinguished from incompatible saved method.

## Steps

- [x] RED/GREEN method UI/state and private functional oracle; retain old fixture contracts.
- [x] RED/GREEN narrow cohort/analysis using existing ordinary runner, hash-freeze and stop/accounting checks.
- [x] Build, legacy regression, independent preflight; resolve and recheck defects before model execution.
- [x] Freeze and execute16 planned actual trials under bounds/stops; no source/protocol changes during requests.
- [x] Independent actual raw/viewer/CSV/distribution and constraint audit, report valid counts vs unattempted and unresolved.
- [x] Publish commands/results/source snapshot, stage only owned files, credential scan, independent gate, commit/push feature and verify remote.


## Recorded outcome

Actual16/16valid,144requests,48decisions/32UI/0looks,0invalid/0unattempted. Saved methods M0local4,M1code4,M2local4,M3phone4. InitialPNG/native-minusPersona identical,48modelchoices=argmax=actualactions, noPersona actionweights. P1trusted model-invalid stopping fixed before requests; two P2analysisprovenance findings fixed after requests without actor/raw changes,18analysis tests/typecheckPASS. Parentproductregression90/buildPASS; independentpreflight7andactual/export auditsPASS. Bounded synthetic constraint sensitivity confirmed descriptively; human fit/knowledge-experience/complex-site generalization remain unverified. The publication checkbox covers preparation; actual commit/push and remote are recorded separately by final Git verification artifacts.
