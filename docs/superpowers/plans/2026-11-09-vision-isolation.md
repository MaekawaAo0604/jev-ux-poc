# Vision Isolation Implementation Plan

> For agentic workers: use subagent-driven-development and TDD for new analysis; shared source belongs to parent, preserve other edits. User has already approved execution and feature push.

**Goal:** Isolatefull/crop/foveated and boundedmemory while auditing the observed notification/back loop.
**Architecture:** Existing runControlledComparison/runBeta andfixedUI. No actor changes planned. Newfixedprotocol andthin offlineboundaryanalysis.
**Tech Stack:** ExistingTS/Playwright/Vite, no dependencies.
**Spec:** docs/superpowers/specs/2026-11-09-vision-isolation-design.md

## Global Constraints
Nohumanrecordcontent/API; oldlogs hash-onlyexceptselectedsynthetictraces. Noanswerroute/personaweights/fixationreset/revisitban. max18trials/216requests/45min/batch36/10min/pertrial12/parallel1/retry0. Keepoldraw andallstopcases. No modelcalibration or humanfitclaim.

## Review Focus
- Vision-only changes mustnotadd DOM/history/labels orchangevocabulary/questions/memory.
- ButtonoutsideclearRect isnot proofmodelcannotunderstand; offered-butnotselected isonlyan observeddecisionboundary.
- Ambiguous/controlabsent/goalalreadyobserved cannotbeinventedinto a confidentdiagnosis.
- Pendingpaths aren'tread; invalidcensoredmissing aren'taveragedas normalfailures.
- Savedmemoryproof uses deliveredimagebindings, notaudithistory injectedintoagent.

### Task1: Frozen protocol and baseline (parent)
- [x] Save6plans,18slots,one-axisdifferences andbalancedpositions; teststaticcontracts.
- [x] Verifyactor/sourceunchanged, snapshots/preservation andAPIzeroordinarymock.

### Task2: Offline boundarydiagnostics (worker)
Ownscripts/analyze-vision-isolation.ts +tests/vision-isolation-analysis.test.ts +module-analysisreports. ExportvisionBoundaryFacts(result) andanalyzeVisionIsolation({phase,out?}). Readnewstudy/phase only; verifyraw/config/source/inputs/artifacthashes/requestledger/replay with existinghelpers. Outputanalysis.json/trials.csv/timeline.json withsameprovenance anduncertaintyconstraints.
- [x] REDtests andGREEN pureboundaries/pendingnofollow/hashconsistenttamper/accounting.
- [x] Frozenproducerhash, independentreview, repair/recheck.

### Task3: Execution and integration (parent +freshverifier)
- [x] Boundedordinaryrealruns, no actor edits duringphase, failed/missingretained.
- [x] Independentactual+analysisaudit, comparisonbyfixedmemoryandvision, fixonlyprovenimplementationbugs.
- [x] Commands/results/limitations/source/preservation saved. Exact staged credential gate and feature push/remote observations are recorded separately in ignored reports/vision-isolation-2026-11-09/{parent,independent}; do not rewrite earlier gate records.
