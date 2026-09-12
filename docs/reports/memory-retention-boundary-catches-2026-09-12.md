# Memory retention and boundary catches

Date: 2026-09-12

This is a bounded implementation and evidence record for the memory-retention
programme. It covers the dedicated CI host, the fail-closed per-commit gate,
and the scheduled dynamic lane. It does not claim that a single allocator or
host can prove the absence of retention everywhere.

## Implemented boundary

- `.github/workflows/retention.yml` installs and builds the pinned
  `galerina-core-compiler` before running `npm run audit:retention`.
- The same workflow schedules `audit-retention-nightly.mjs` on Ubuntu,
  Windows, and macOS, and repeats that lane for published releases.
- The existing build-free `.github/workflows/conventions.yml` is unchanged.
- `scripts/tests/retention-workflow.test.mjs` checks the trigger, runner,
  action-pin, build-order, and dynamic-receipt boundaries.

## Fresh local evidence

The implementation and receipt hardening were checked from the Galerina
checkout at source head `3f046f672e198cc02ac9fe9696d6d7649a5597ed`; the
generated roadmap provenance was then refreshed in `a00d8b4bd36fd1fc0e8cd99ff06335257da5b56e`.

- `npm run audit:retention` — **PASS**. Detector and bound self-tests passed;
  the production execution-graph cache bound at `maxEntries (2048)` under
  pressure; 129 source files were scanned with 0 unowned findings.
- `node --test scripts/tests/retention-workflow.test.mjs` — **1/1 PASS**.
- `node --test scripts/tests/audit-retention-nightly.test.mjs scripts/tests/retention-workflow.test.mjs` — **4/4 PASS**.
  The receipt parser rejects timeouts and unknown exits, missing or duplicate
  markers, missing measurements, non-finite or malformed numbers, wrong units,
  contradictory channel classifications, and verdict/channel-set mismatches.
- `npm run audit:retention:nightly` — **PASS** on `win32/x64`, Node `v24.18.0`.
  Both identical-input and unique-input compiler subjects reported no leak on
  heap, external, or ArrayBuffer channels; the production cache invariant also
  passed.

The Windows result is host-scoped evidence. The scheduled Ubuntu, Windows, and
macOS receipts must be collected and reviewed independently; a missing,
timed-out, or malformed receipt remains a failure rather than a clean result.

## Remaining boundary

The retention controls and their CI routes are now wired. The programme stays
`building` until the hosted scheduler produces its first receipts. Those
receipts are measurements of the exercised workloads and supported runners,
not production-authority or universal leak-freedom claims.
