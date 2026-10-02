# Operator notes — three-boundary tests and audit

Owner: Galerina security test/audit lane. Worktree `rd-0873-native-fungi-bootstrap-implementation`.

## Command map

Dependency order. Finite bounds. Exit meanings.

| # | Command | Timeout | Pass | Finding | Refused | Receipt |
|---|---|---|---|---|---|---|
| 1 | `node scripts/audit-three-security-boundaries.mjs --self-test` | 10s | 0 | 1 | 2 | `docs/reports/receipts/three-boundaries-audit-selftest.txt` |
| 2 | `node --test --test-timeout=120000 packages-ts/galerina-core-compiler/tests/q1-secret-return-value.test.mjs` | 120s | 0 all-green | 1 any-fail | n/a | `docs/reports/receipts/three-boundaries-q1.txt` |
| 3 | `node --test --test-timeout=60000 packages-ts/galerina-framework-api-server/tests/q2-durable-replay-admission.test.mjs` | 60s | 0 | 1 | n/a | `docs/reports/receipts/three-boundaries-q2.txt` |
| 4 | `node --test --test-timeout=60000 packages-ts/galerina-core-sentinel-state/tests/q3-fifo-toctou.test.mjs` | 60s | 0 | 1 | n/a | `docs/reports/receipts/three-boundaries-q3.txt` |
| 5 | `node scripts/audit-three-security-boundaries.mjs --json --corpus-manifest docs/reports/security-three-boundaries-corpus-2026-09-22.json` | 15s | 0 | 1 | 2 | `docs/reports/receipts/three-boundaries-corpus.json` |

Historical receipts in `docs/reports/receipts/` from the pre-repair hostile round
recorded FINDING/SIGKILL. Those receipts are retained as history.

On the **current repaired candidate**, commands 2–4 are expected **PASS (exit 0)**
and command 5 is expected **PASS** on the digest-bound enumerated corpus
(not full `.fungi` assurance). A new FINDING is a regression.

Q3 live FIFO requires Linux or WSL `node`+`mkfifo`. Windows-native FIFO open is NOT VERIFIABLE. Timeout/SIGKILL of a supervised child is a FINDING (blocked open), not PASS.

## Audit CLI

```text
node scripts/audit-three-security-boundaries.mjs --self-test
node scripts/audit-three-security-boundaries.mjs --json <file>…
node scripts/audit-three-security-boundaries.mjs --json --corpus-manifest docs/reports/security-three-boundaries-corpus-2026-09-22.json
```

Bounds: 64 files, 8 MiB each. Omitted or unreadable input is REFUSED (exit 2), never an empty green. Mutation controls live in disposable temp fixtures inside `--self-test`.

A G5c comment, a WeakSet brand, or `refuseSnapshotSpecialFile` called in isolation is not a passing discriminator for these three gates.
