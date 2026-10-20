# Mutants

Compiler commit fc7db4db4ba1cb7aed691cfa205ec719746524d4.
galerina build of the landed import+call file exits 1 with FUNGI-NAME-001. Executable mutants run on a flattened copy (c-boundary.fungi body plus this unit with the import line removed) written under os.tmpdir() by tests/46-monotonic-time/harness.mjs. The temp path is never written to evidence. String-only source checks are not counted as mutants.

Command (cwd scratch clone): `node packages/fungi/memory/tests/46-monotonic-time/red-one.mjs <id>`

| Id | Claim | Command | Exit | Result |
| --- | --- | --- | --- | --- |
| M1 | Wrapping add (pointPlusOverflow 21 -> 0) | node packages/fungi/memory/tests/46-monotonic-time/red-one.mjs M1 | 1 | RED |
| M2 | Clamp on backwards (backwardsReading 22 -> 0) | node packages/fungi/memory/tests/46-monotonic-time/red-one.mjs M2 | 1 | RED |
| M3 | Cross-epoch compare admitted (crossEpoch 23 -> 1) | node packages/fungi/memory/tests/46-monotonic-time/red-one.mjs M3 | 1 | RED |
| M4 | UNKNOWN treated as REMAINING (remainingUnknown 23 -> 0) | node packages/fungi/memory/tests/46-monotonic-time/red-one.mjs M4 | 1 | RED |
| M5 | Literal Point constructor admitted (readForeignLength -> readForeignSafeInteger) | node packages/fungi/memory/tests/46-monotonic-time/red-one.mjs M5 | 1 | RED |
| M6 | Busy-wait loop around a clock read | node packages/fungi/memory/tests/46-monotonic-time/red-one.mjs M6 | 1 | RED |

`node --test packages/fungi/memory/tests/46-monotonic-time/monotonic-time.test.mjs` asserts each red-one exit is 1. Flattened pins also cover F2 epoch mismatch 23, F3 negative reading 9, F4 *Ticks refusal -1, and equal-Points success 0.
