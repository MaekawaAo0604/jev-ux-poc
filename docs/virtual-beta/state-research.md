# Virtual beta state and selection method

Research checked 2026-10-27. The requested virtual-beta source documents were absent from the available repository snapshot (see tasks.md). The implementation below is an explicit engineering model; it does not replace missing empirical specifications.

## State meaning and observation boundary

A fresh `createUserState` starts with an empty memory and copies the persona's expectation strings. These strings mean declared expectations supplied in the persona. They remain fixed across enabled updates; they are not learned beliefs, confidence estimates, or inferred emotions. The only dynamic state is the revision, observed fixation, current observation, and bounded recent observation/action records.

`updateUserState` accepts only the `UserObservation` contract from the caller: observation id, transmitted image hash, user-visible text, observed fixation, and offered candidate ids. It explicitly copies those fields. It never spreads observation, prior-state, action, or memory objects. Extra audit/history/DOM/title fields cannot enter the resulting state through this interface. The runner is responsible for ensuring that admitted text is actually visible in the transmitted vision mode. An observation id or image hash is an artifact reference, not evidence of what a human recognized.

Each enabled update appends one supplied observation, optionally associated with the supplied action and observable outcome (`performed`, `failed`, or `unchanged`), and keeps at most `memoryCapacity` recent records. Callers should provide one update per intended memory entry. Capacity zero retains no past entries but still exposes the current observation. A disabled update retains neither memory nor the current observation nor expectation strings. Re-enabling the same cleared state does not reconstruct removed expectations; start a fresh state for a fresh run. Fixation follows the supplied actual observation, not an assumed successful `look` target. No component executes actions here.

This is a bounded recency buffer, not a validated model of working memory. Capacity, forgetting, recognition, reading comprehension, fatigue, emotion, and human equivalence have not been calibrated. Returning to a control, rereading, waiting, making a mistake, or abandoning is permitted by the action contract. This module does not remove any of them.

## Selection and replay

The caller supplies candidate ids, a model-reported choice, and a probability for exactly every candidate. Values must be finite in [0, 1]. Their total must be positive and within 0.02 of one, matching the existing choice client's tolerance. Missing keys, extra keys, an unknown model choice, invalid values, invalid configuration, or zero surviving probability mass raise `InvalidDistributionError` with code `INVALID_DISTRIBUTION`. Invalid calls do not advance the sampler counter.

The record keeps the original probabilities in `raw`, the divided-by-total probabilities in `normalized`, and the final renormalized distribution in `filtered`. Excluded candidate ids remain in `filtered` with probability zero. `normalization.rawTotal` records the original sum; `normalization.filteredTotal` records the surviving mass of `normalized` before final normalization. `adjustments` records every exclusion and its supplied reason. The caller decides safety exclusions; this module validates their shape and does not invent progress, revisit, or mistake filters.

Keys are sorted by JavaScript string code-unit order for both modes. Argmax chooses the largest surviving probability and resolves ties with the first sorted key. Its draw is null. Sample mode chooses the interval containing the deterministic draw; `modelChoice` is preserved independently and does not determine the sampled action. Each sampler copies its seed/mode and has its own zero-based counter. The counter increases once per successful selection, including argmax selections. Returning records owns copied probability maps and adjustments.

The v1 deterministic draw method is specified completely as follows:

1. Require an unsigned 32-bit integer seed and a nonnegative safe integer draw index.
2. Encode `jev-virtual-beta-selection:v1:<seed>:<drawIndex>` as UTF-8, with unsigned base-10 integer representations and literal colons.
3. Compute SHA-256 using Node's `createHash('sha256')`.
4. Read the first four digest bytes as an unsigned big-endian integer and divide by 4294967296. This yields a draw in [0, 1).
5. Walk the sorted cumulative probability intervals. Use the last positive interval for any floating-point accumulation residue.

For seed 1 and index 0 the draw is 0.8838632628321648. With `{a:0.75,b:0.25}`, sample selects b even if the model-reported choice is a. `replaySelection(record, candidates)` directly reconstructs this index and verifies the entire persisted record, including normalization, filtering, draw, and selected id. It rejects mismatches. It verifies selection arithmetic, not candidate action semantics or external UI state.

This original hash-counter adapter uses no copied third-party sampler source and adds no dependencies. SHA-256 is specified in [NIST FIPS 180-4](https://csrc.nist.gov/pubs/fips/180-4/upd1/final); the Node API is described in the [official crypto documentation](https://nodejs.org/api/crypto.html#cryptocreatehashalgorithm-options). Node's implementation and bundled components retain the licenses in [Node's LICENSE](https://github.com/nodejs/node/blob/main/LICENSE), whose main Node license is MIT. No NIST document text or source implementation is redistributed here. This adapter is a reproducible simulation method, not a claim of NIST-approved random-number generation. Its 32-bit draw grid imposes finite precision; very small intervals may receive no draw. It is not intended for security-sensitive randomness.

## Interpretation limits and verification

The probability distribution comes from a model under a specified prompt. It is not a measurement of human action frequencies, uncertainty, preferences, or internal reasoning. Sampling broadens simulated paths but by itself provides no evidence of human validity. Any reason category remains a short model self-report, not access to internal thoughts. UI latency is not modeled human elapsed time.

Focused tests cover deterministic per-index replay and fresh sampler isolation, sampling versus model choice and argmax, tie ordering, within-tolerance normalization, recorded exclusion and zero filtered mass, invalid configuration/distributions, record tampering, copied/capped/reset state, and audit-field exclusion. These demonstrate the implementation contract only. Human comparisons require a separately designed and consented study with matched tasks and observable outcomes; no such result is asserted here.
