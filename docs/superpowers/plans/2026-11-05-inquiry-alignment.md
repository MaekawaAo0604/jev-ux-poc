# Inquiry question contract alignment

Baseline 3a3dcc7. Existing fictional results: Jev27/32unknown (16basis-only,9basis+mismatch,2mismatch-only); OpenAI22/22unknown (11rawunknown,9basis+mismatch,1mismatch-only,1basis-only). All11Jevmismatches had an unknown prior check after separate working answers conflicted. Do not repair historical records.

Implement opt-in aligned-v1: model chooses a coherent condition/intent/check tuple; outcome choices match that check; clarify that visible negative/limited evidence can be a basis. Preserve native extraction, UI, candidates, shared selection policy, conservative admission and bounded memory. Existing default remains intact. Supplied compound conditions remain a measured limitation, rather than being split with route-specific code.

Parent owns common contracts/config/profiles/runtime/replay/comparison and integrated tests. Implementation worker owns working-inquiry.ts, inquiry-outcome.ts and aligned question tests. A separate verifier tests frozen source and raw evidence without credentials, API calls or earlier participant payloads.

1. Reproduce existing mismatch and basis examples from fictional raw.
2. Capture failing profile/config, question and comparison tests.
3. Implement isolated policy and runtime/replay wiring.
4. Run targeted regressions, build, eight-slot mock and independent review; fix and reverify findings.
5. Freeze runtime and protocol; preserve6947prior raw hashes; commit producer before live.
6. Run two tasks ×twoactors ×tworepeats=8fresh trials, limits in protocol, serial/no replacements.
7. Save raw choices, admitted outcomes, normalization reasons, action input, receipts and objective states. Analyze unknown categories independently from goal success.
8. Independent replay/accounting/semantic spot-check and publication check. Preserve failed trials and audit scope.
9. Commit/push results on feature branch only. Do not claim human reproduction, compound-condition repair or broad stability.
