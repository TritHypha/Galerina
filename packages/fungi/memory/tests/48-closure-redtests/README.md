# Suite 48: closure-path red tests (RD-1413 / RD-1414 / RD-1415)

Acceptance tests written ahead of code for closure steps S2 and S4-S13. NON_AUTHORIZING. Synthetic data only.
Each test encodes one R&D verdict. Red tests are marked expected-red with node:test `todo`, so this suite
exits 0 and the existing suites stay green. A step is closed only when its tests pass in strict mode:

    GALERINA_REDTESTS_STRICT=1 node --test --test-concurrency=1 packages/fungi/memory/tests/48-closure-redtests/

| step | file | verdict encoded |
|---|---|---|
| S2 | s02-harness.test.mjs | X-H1 unique build names; X-N1 runner arity guard (too few / too many args refuse); X-DUP import-composed run equals flattened; duplicate flow names refuse |
| S4 | s04-parked-ts.test.mjs | queue 20 (#187) and 24 closed with a typed reason; Phillip's PR #187/#190 decision recorded |
| S5 | s05-secret-authority.test.mjs | TS createSecretGate off the kernel decision path; Fungi secret-gate artifact loaded; KG-12 SecretsProvider port import |
| S6 | s06-ingress.test.mjs | KG-06 readForeignSafeInteger reads the integer, readForeignBoundedInteger domain; KG-05 64-bit refusal and tagged buffer; KG-01 RFC 3986 refusal vectors map to UNKNOWN |
| S7 | s07-custody.test.mjs | MLK smaps Locked >= 4 kB after lock (with a green method control); LEASE closed exactly once on every path, close without the capability refused; Q8 no secret bytes in guest linear memory; arena review PASS |
| S8 | s08-release.test.mjs | crash-cell campaign receipt (SQLite WAL FULL, rename+fsync+dir-fsync) with an opt-in green harness control (Q48_CRASHCELL=1, needs strace and python3); reserve/commit/reconcile idempotency; KG-07 DELIVERY_UNKNOWN |
| S9 | s09-residual.test.mjs | KG-10 ML-DSA reports UNKNOWN; KG-04 MB-15 CT evidence harness wired to dudect/ctgrind with leaky controls; MB-15 intrinsic; signed residual UNKNOWN list |
| S10-S13 | s10-s13-gates.test.mjs | composed run receipt + A-E disposition; S11 adjudication + drift; S12 Phillip merge yes; S13 HOLD lift citing S11 |

Interfaces named here (readForeignBoundedInteger, readForeignWide*, native/linux-arena/arena-lock-probe,
*Idempotency* flows, evidence/closure/*, the `linear type Lease` probe syntax) are proposals from the
red-test author. A closing brief may rename an interface or adjust probe syntax, but it must not weaken
an assertion, and it must list every rename in its reply.