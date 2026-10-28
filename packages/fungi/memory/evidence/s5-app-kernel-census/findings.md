# OPEN-S5-1: app-kernel test count 685 vs 686 (census, 2026-10-28)

Synthetic data only. Host: WSL Linux, node v24.20.0. Branch grok/s5-all-sites-mutants-20261028 (from ebd2ac318).
Tool: `packages/fungi/memory/tests/s5-secret-authority/s5-app-kernel-test-census.mjs` runs each of the
73 `packages-ts/galerina-framework-app-kernel/tests/*.test.mjs` files on its own (TAP, concurrency 1)
and records per-file counters and leaf test names.

## Results

| Run | tests | pass | fail | skipped |
|---|---|---|---|---|
| Per-file, app-kernel deps built, core-compiler dist NOT built | 723 | 709 | 13 | 1 |
| Per-file, core-compiler and its deps built | 724 | 724 | 0 | 0 |
| `node --test tests/*.test.mjs` (default parallel), first run after build | 697 | 693 | 4 | 0 |
| same, run 1 again | 724 | 721 | 3 | 0 |
| same, run 2 | 724 | 722 | 2 | 0 |
| `node --test --test-concurrency=1 tests/*.test.mjs` | 724 | 724 | 0 | 0 |

## Findings

1. The total is not a fixed number. A test file whose top-level import fails (for example
   `galerina-core-compiler/dist/manifest-generator.js` missing) collapses to one failing test
   instead of registering its N tests, so the count depends on which `packages-ts` dists are built.
   Earlier "clean clone" counts of 685 and the work-tree 686 were taken with different dependency
   build states; neither is the full census. 13 failures across 12 files, all "core-compiler dist
   not built" or ERR_MODULE_NOT_FOUND for that dist.
2. With every dependency built the suite is 724 tests, all green, per file and serially.
3. Default parallel runs are not stable: the first run straight after a build counted 697 (files
   racing on freshly built output) and later parallel runs fail 2 to 3 tests:
   `secret-arena-provider.test.mjs` "linux child-death quarantines without a production test hook"
   and "linux decreasing custodian epoch quarantines and refuses stale authority" (timing under
   load), and once `registry-rotation-cli.test.mjs` self-test. All pass serially.
4. No conditional test registration was found; `t.skip` / `test.skip` gates skip but still count.

## Decision (full auto, logged in LEDGER-002)

- OPEN-S5-1 closed as an environment/ordering effect, not a missing or extra test.
- Canonical app-kernel count is the per-file census with all deps built: 724.
- Pin: `s5-app-kernel-census.test.mjs` S5-1-C01..C07 fails if the parser miscounts, the test file set
  changes without refreshing this evidence, the built census stops being all-green, or count drift
  appears in a file that did not fail to load.
- Follow-up (not done here): the two `secret-arena-provider` linux tests are flaky under parallel
  load; owed as a separate row. A Windows-node census run is still owed for cross-platform diff.