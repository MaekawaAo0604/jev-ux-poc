# Deferral weight application and motion comparison

Baseline7df17d7. User explicitly asks correction ON/OFF under same conditions and motion review, not goal optimization. Previous review found four account exits replacing model-confirmation choices, model-origin repetition, and plausible unsuccessful revisits. No human-naturalness rank exists.

Parent owns contracts/config, runtime/replay, profiles/driver, integration tests and execution. Worker owns deferral.ts application helper and dedicated unit tests. Separate fresh verifier audits frozen implementation and later raw trials. Same worktree, nonoverlapping ownership. No dependencies, learned scores or route registration.

Add deferral.applyWeights?:boolean, defaultlegacy unchanged. Explicit ON/OFF both retain proposal learning/reason state. Log application {mode,proposedWeights,appliedWeights} only after successful selection; off uses unit multipliers and preserves safety exclusions. No new actor inputs or APIs. Replay binds setting, proposal, application and actual sampler result.

Run existing comparison runner with --deferral-weights: two unchanged fixtures ×ON/OFF ×two repeats, pair order reversed,8trials/288maxrequests/serial. Primary case review and observable motion measures in protocol. Goal outcomes are context only. Raw actor proposals and sampler baseline are distinguished before attributing policy effects.

Steps: failing profile/helper/driver tests; implement and integrate; normal UI integration +rehashed tamper rejection; related regressions/build/8mock; independent code gate/fix/recheck; freeze commit+source archive; preserve7294prior raw hashes; fresh real8 via ordinary runner (no saved resends); independent raw/accounting/motion review; fix demonstrated code-side faults and reverify; preserve all trials; report and push feature branch. No human-fidelity claim, no blanket retry ban, no extra API approval prompts.
