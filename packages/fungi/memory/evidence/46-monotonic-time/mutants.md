# Mutants

Compiler commit fc7db4db4ba1cb7aed691cfa205ec719746524d4.
galerina build exits 1 with FUNGI-NAME-001 on both c-boundary calls. No WebAssembly module is emitted. A mutant cannot go red under galerina run --invoke. String comparison of the source is not counted as a mutant.

| Id | Claim | Result |
| --- | --- | --- |
| M1 | Wrapping add | NOT_RUN |
| M2 | Clamp on backwards | NOT_RUN |
| M3 | Cross-epoch compare admitted | NOT_RUN |
| M4 | UNKNOWN treated as REMAINING | NOT_RUN |
| M5 | Literal Point constructor admitted | NOT_RUN |
| M6 | Busy-wait loop around a clock read | NOT_RUN |

The structure test in tests/46-monotonic-time/monotonic-time.test.mjs only checks that the source text contains the import, the two calls, and the refusal codes, and that it does not contain while, null, NaN, or mintLiteral. That test passed 2/2. It is not a mutant run.
