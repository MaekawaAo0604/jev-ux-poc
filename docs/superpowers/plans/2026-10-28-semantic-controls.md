# Hidden semantic information and repeated UI comparison

> Execute with parent plus two implementation workers, then a fresh independent verifier. Reuse existing TypeScript runner, page adapter, vision, state, sampler, oracle, budget and human recorder. No product rewrite.

Goal: measure whether newly exposed routing meaning changes choices under counterbalanced A/B mappings, then estimate UI effects against repeated-run variability. Human data collection is explicitly deferred by user; deliver compatible recording and validation.

Baseline:960ba57, productad1d644; preceding final full667tests664pass0fail3skip and build/tsc. Clean tree before new branch. Original E root untouched. New phase API authorization48 total, pertrial<=8; parent only, normal local runner, no saved payload replay. Previous48 exhausted and separate.

## Fixed design

12trials =3UI x2mapping x2replicate; max4API each =48. PersonaA, same goal, viewport1280x900, date/locale/fonts/modeljev1.14 fixed. Controlled capability condition: crop640x480, state enabled memory3, goal behavior, argmax; no sampling change within experiment. This is a new condition, not pooled with Phase2 combined. All trials random order with recorded seed; no outcome-dependent trial exclusion/replacement.

A/B controls and badges both initially eligible and visible, fixed order/geometry. Crop initial[320,960]x[210,690], afterlook3[640,1280]x[435,900]. Controls x660..790 and810..940,y500..580. Routing cue wholly outside initial crop x1000..1250,y720..850; position-only changes y to470 with same size/text; wording-only equivalent note text at reference position. Both note positions are revealed by same freely selected look3. Neither gives action sequence or fixation coordinates in model prompt. Correct A/B click stops mail; wrong changes display only, no mail-success status.

## Contracts / ownership

Parent owns semantic-types.ts (SemanticFixture,SemanticTrial,SemanticRunAudit), core/result optional semantic field, CLI scenario scheduling/audit/neutral public charter/source/budget, human recorder/validation, protocol/settings/reports/integration. Trial assignment is audit-only; public wire contains only goal/persona/admitted image/state and generic candidates.

WorkerA owns app/semantic-fixture.ts pure parser/query/definition, app/SemanticFixture.tsx component and tests/semantic-fixture.test.ts. Parent hooks root app rendering only after worker output. Exports: semanticQuery(fixture):string; parseSemanticFixture(search):SemanticFixture|undefined; semanticDefinition(fixture):plain JSON with cueText and rects.cue/a/b; semanticROIs selectors semantic-cue/semantic-a/semantic-b. Component export SemanticFixtureView({fixture}).

WorkerB owns runner/semantic-analysis.ts, tests/semantic-analysis.test.ts, docs/virtual-beta/semantic-analysis.md. Exports analyzeSemanticRun(BetaResult), compareSemanticRuns(BetaResult[]). Result.semantic?:SemanticRunAudit; existing step.audit.regionsOfInterest ids semantic-cue/a/b. Derive chosen A/B from audit screen control text, not model explanation. Strict cue acquisition+firstmapping-correctchoice only when initial cue wholly absent, A/B candidates initially and later both offered, note wholly visible before first choice. Blind correct guesses never semantic evidence. Save within-pair input hash agreement. Include invalid/no-choice/censored counts; do not drop them silently.

Compare all12 preregistered trials: paired mapping association exact2^6 enumeration; UI omnibus range in cue-supported first-choice success, permutations within each replicate x mapping block (3!^4). State assumptions, sample size, no posthoc endpoint tuning, no human probability interpretation. Missing/invalid/incomplete data means test unavailable rather than an invented result. Enumerations bounded; tests hand-computable.

Parent reuses human recorder with same fixture identity, code source hash and unnumbered initial-product screenshot; validator rejects fixture/mapping/UI/source/initial mismatch, smoke never human, mouse never gaze. New user explicitly chose recording foundation now and human measurement later.

## Acceptance / verification

- [ ] Actual initial model images/questions/public inputs byte-identical across reversed mappings; cue absent, both candidates offered. After look raw screen unchanged, cue pixels observed, both candidates still available.
- [ ] Correct/wrong mappings and all3UI reset/oracle tests; only intended note position/text varies.
- [ ] Pure analysis tests distinguish exposed-correct vs blindguess/candidate-gating/error/censor, exact permutation known cases.
- [ ] No fixture/mapping/query/answer/ROI/audit metadata in learner wire or memory; no sequence/coordinate hints.
- [ ] Real12trial bounded experiment after local tests and frozen product; preserve every error and reservation, do not overrun48. Negative results remain negative.
- [ ] Human recorder smoke tested and excluded; validation mismatch tests, no invented participants.
- [ ] Fresh independent verification on frozen code; fix/reverify<=3rounds; final build/tsc/full regression after last product fix.
- [ ] Report actual semantic sensitivity and UI test results (including null/unavailable), human comparison deferred, commands and artifacts; push feature branch only after checks.

## Diagnostic amendment before follow-up API calls

Initial frozen e333750 experiment completed12trials/30calls: firstB inall12, no looks, mailobjective12/12 butstrictcue-supported0/12, mapping/UItests p=1. Original data/endpoints remainunchanged. An inexpensive wrongdisplayoperationallowedblindtrial-and-error. Remaining18calls allocated to (1) cueinitiallyexposed960675, referenceA/B onecall each (2); (2) referenceA/B×2rep, initial640450, goal neverchangedisplay whilemailstop, max4calls each (16). Separatefiles/configs/manifest/revision, no pooling. Success preservation requires independent DOM display-change-count0 evenafterrestoration. No answer/sequence/fixation instructions enter goalprompt. Initial-exposure control is explicitly exogenous, not autonomously chosen gaze. Extra diagnostics are outcome-motivated but fixed before their own outcomes; not confirmatoryreplication ofprimary. APIaggregate48/pertrial<=8 maintained. CSVsemanticUIlabeldefect also repaired. Newfinalsourcefreeze requires build/tsc/fullsuite afterfix.

### Final coordinate-contract diagnostic (round 3)
At used42/48, a regression test first failed because learner observation omitted source viewport bounds while look coordinates used that coordinate frame. Add fixed viewport width/height from vision source dimensions and generic crop/viewport coordinate guidance, with no cue-specific direction or answer. Run reference A/B once each, mail-only goal, three decisions/calls each (six maximum), separately from primary and earlier diagnostics. Config/protocol fixed before calls in semantic-viewport-recheck.json and semantic-viewport-protocol.json. This omission is not yet an established cause of zero-look behavior. Focused27 tests, build and standalone typecheck pass after correction.
