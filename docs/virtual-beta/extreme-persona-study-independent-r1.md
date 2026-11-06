# Independent verification, round 1

Verdict: no blocking defect found in the frozen implementation. The bounded actual probe and flow may start under the predefined protocol. This is a software preflight verdict; actual native model validity, Persona action differences, and downstream analysis remain unverified.

The independently inspected source was revision `7905e324a9167b278493703b1c719cea32d76d19`. The source hash was `bfb1e80ee80308bb84ae6cc9dc8aafd27c69ef72c75a59bd9e7739dd129c7f44` before and after execution, matching all 187 frozen file hashes. Set and protocol bytes also matched the freeze. Product source was not edited by this verifier.

The dedicated opt-in test is `tests/extreme-persona-study-independent.test.ts`. Its first run and strengthened second run each executed 16 ordinary mock trials against the real captured four-page HAR: eight Personas at decision cap 1 and eight at cap 12. All 16 trials in each run were valid. Real model API requests: zero. Both run directories remain preserved under this directory; `latest-r1.json` names the final evidence root and includes exact result paths, raw hashes, Persona bindings, initial input hashes, and viewer groups.

Expected and actual behavior matched:

- Every Persona arrived unchanged at run, native extraction, assessment, and action inputs. Each stage's expectations matched that Persona. First native memories, experience transitions, and continuity entries were empty in every trial; run IDs and directories were unique.
- Native candidates carried only anonymous ID/type fields. Action and assessment observation payloads had no audit, screen, element list, visible text, or URL fields. Initial memory observations referenced only `o1`.
- Initial unnumbered and delivered image hashes and native inputs after removing only Persona matched across all eight actors. For each actor, cap 1 and cap 12 had exactly equal initial native, action, and assessment input payloads, questions, and assets. The cap was absent from those model inputs.
- The ordinary default mock selects subjective done, so these 16 trials ended SUBJECTIVE_DONE after one decision with no UI action. They do not demonstrate Persona behavioral differences. The separately rerun decision-cap fixture selected one real scroll, then ended DECISION_LIMIT with valid comparison, perceivedDone false, and objective UNVERIFIED/null. Its uncapped counterpart continued to a second decision.
- Resume returned the same batch and records without a repeated slot. Summaries retained all eight actors and objective null. The viewer displayed all exact names, kept cap 1 and cap 12 in different comparison groups, and preserved raw JSON byte identity and delivered PNG hashes.
- Existing path, byte-boundary, casefold deduplication, junction containment, raw-byte freeze, resume-tamper, stop classification, accounting, legacy-profile, public readonly, and viewer tests passed as listed in `command-evidence.json`.

Verification exits: build 0; new feature suites 33 passed/0 failed; public site, wiring, profiles and viewer suites 39 passed/0 failed/2 skipped; strengthened independent opt-in test 1 passed/0 failed. The artifact-dependent test skips successfully in ordinary test execution without its explicit environment switch. The build was repeated successfully after the test file was added.

Limitations: Windows file-symlink creation was unavailable, producing two skipped tests and one diagnostic inside the loader suite. Ancestor junction rejection was tested successfully. The global npm test suite was not run by this verifier and is not declared green. No credentials, old human raw contents, saved API requests, or real model endpoints were read or invoked. Actual model ledger settlement, action distributions, partial native failures, publication, and post-model exports still require their later audit. No human causal or human-fit conclusion follows from this preflight.

No severity/reproduction finding was raised in round 1. If product source changes, this verdict must be reevaluated against a new freeze. The verifier remains available for the post-model raw/ledger/analysis/viewer audit.
