# OPEN-S5-3: S5 secret-authority mutants at every site

Base: Galerina branch (clean clone, WSL node v24.20.0, app-kernel dist built with tsc --noCheck).
Runner: `packages/fungi/memory/tests/s5-secret-authority/s5-all-sites-mutants.mjs`. Each site is mutated alone in the built dist JS, the killing set runs file by file until the first red file, then the dist file is restored and its sha256 re-checked.

Baseline over the killing set: pass=139 fail=0.

Result: 15 site mutants, 15 RED, 0 SURVIVED.

| Family | What | RED | SURVIVED |
|---|---|---|---|
| SW2 | widen the i32 cap guard on the classified integer | 1 | 0 |
| SAO | decider check: || becomes && | 1 | 0 |
| SSC | skip a release-authority markUnknown call | 5 | 0 |
| SPU | kernel skips a delivery-unknown note on a spent lease | 6 | 0 |
| SDA | noteUnknown verdict: an UNKNOWN arm becomes no-op | 2 | 0 |

| Mutant | src line | Verdict | Killer file | First failing test |
|---|---|---|---|---|
| SW2-site1of1 | packages-ts/galerina-framework-app-kernel/src/fungi-secret-gate-loader.ts:84 | RED | s5-secret-authority.test.mjs | S5-R7a loader noteUnknownVerdict is the WebAssembly gateNoteUnknown verdict |
| SAO-site1of1 | packages-ts/galerina-framework-app-kernel/src/secret-gate.ts:558 | RED | s5-secret-authority.test.mjs | S5-R10e the release shell needs BOTH decider verdict functions (kills SAO) |
| SSC-site1of5 | packages-ts/galerina-framework-app-kernel/src/secret-gate.ts:423 | RED | s5-all-sites-survivors.test.mjs | SSC secret-gate.ts:423 + SPU kernel.ts:1225 staging revoke after consume: gate and kernel each write |
| SSC-site2of5 | packages-ts/galerina-framework-app-kernel/src/secret-gate.ts:454 | RED | secret-gate.test.mjs | F2: consumer transfer-then-throw keeps original error, wipes gate-owned bytes, runs lease cleanup |
| SSC-site3of5 | packages-ts/galerina-framework-app-kernel/src/secret-gate.ts:486 | RED | s5-all-sites-survivors.test.mjs | SSC secret-gate.ts:486 a failed staged wipe marks the lease delivery-unknown (child process) |
| SSC-site4of5 | packages-ts/galerina-framework-app-kernel/src/secret-gate.ts:507 | RED | rd1415-op-bound-ack.test.mjs | matrix: simulated crash between consume and ACK is status-only; recovery never calls use |
| SSC-site5of5 | packages-ts/galerina-framework-app-kernel/src/secret-gate.ts:591 | RED | s5-secret-authority.test.mjs | S5-R7c createSecretReleaseShell obeys the decider and has no default decider |
| SPU-site1of6 | packages-ts/galerina-framework-app-kernel/src/kernel.ts:1117 | RED | s5-all-sites-survivors.test.mjs | census: success path ends delivery-unknown through finalize (MB-06 baseline) |
| SPU-site2of6 | packages-ts/galerina-framework-app-kernel/src/kernel.ts:1120 | RED | s5-all-sites-survivors.test.mjs | SPU kernel.ts:1120 a lost finalize write is retried once and the lease still ends delivery-unknown |
| SPU-site3of6 | packages-ts/galerina-framework-app-kernel/src/kernel.ts:1211 | RED | s5-all-sites-survivors.test.mjs | SPU kernel.ts:1211 deadline after a spent lease writes delivery-unknown itself, then finalize |
| SPU-site4of6 | packages-ts/galerina-framework-app-kernel/src/kernel.ts:1225 | RED | s5-all-sites-survivors.test.mjs | SSC secret-gate.ts:423 + SPU kernel.ts:1225 staging revoke after consume: gate and kernel each write |
| SPU-site5of6 | packages-ts/galerina-framework-app-kernel/src/kernel.ts:1229 | RED | s5-all-sites-survivors.test.mjs | SPU kernel.ts:1229 handler fault after a spent lease writes delivery-unknown itself, then finalize |
| SPU-site6of6 | packages-ts/galerina-framework-app-kernel/src/kernel.ts:1241 | RED | s5-all-sites-survivors.test.mjs | SPU kernel.ts:1241 handler that swallows a staging refusal: gate, unknownIfSpent and finalize each w |
| SDA-site1of2 | packages-ts/galerina-framework-app-kernel/src/fungi-secret-gate-loader.ts:105 | RED | s5-secret-authority.test.mjs | S5-R10c a trapping noteUnknown export is typed UNKNOWN, never no-op (kills SDA) |
| SDA-site2of2 | packages-ts/galerina-framework-app-kernel/src/fungi-secret-gate-loader.ts:109 | RED | s5-secret-authority.test.mjs | S5-R7a loader noteUnknownVerdict is the WebAssembly gateNoteUnknown verdict |

First run (before s5-all-sites-survivors.test.mjs): 15 site mutants, 8 RED, 7 SURVIVED.

| First-run survivor | src line | Now | Killer file |
|---|---|---|---|
| SSC-site1of5 | 423 | RED | s5-all-sites-survivors.test.mjs |
| SSC-site3of5 | 486 | RED | s5-all-sites-survivors.test.mjs |
| SPU-site2of6 | 1120 | RED | s5-all-sites-survivors.test.mjs |
| SPU-site3of6 | 1211 | RED | s5-all-sites-survivors.test.mjs |
| SPU-site4of6 | 1225 | RED | s5-all-sites-survivors.test.mjs |
| SPU-site5of6 | 1229 | RED | s5-all-sites-survivors.test.mjs |
| SPU-site6of6 | 1241 | RED | s5-all-sites-survivors.test.mjs |

Every site is killed, so the first-of-N gap from the 2026-10-23 merge check is closed.
