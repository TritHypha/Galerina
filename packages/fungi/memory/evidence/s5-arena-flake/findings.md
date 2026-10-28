# S5 arena flake: root cause and fix (OPEN-S5-1 follow-up row)

Date: 2026-10-28. Work driver run gcw-wd-d7ecd6e8. Synthetic data only; test-only change.

## Symptom

Default parallel `node --test tests/*.test.mjs` in `packages-ts/galerina-framework-app-kernel`
failed 2 tests (sometimes 3) while every file passed serially:

- `secret-arena-provider.test.mjs` "linux child-death quarantines without a production test hook"
- `secret-arena-provider.test.mjs` "linux decreasing custodian epoch quarantines and refuses stale authority"
- once `relaxation-report.test.mjs` (file-level failure) and earlier `registry-rotation-cli.test.mjs`

Reproduced before the fix: 3 of 3 parallel runs failed (722/2, 713/3 of 716, 722/2). The file alone
passed serially and under 8 busy-loop CPU hogs (3 of 3), so it is not CPU timing.

## Root cause

Both failures threw `ERR_SECRET_ARENA_QUARANTINED` from `revocationEpoch()`. The shipped code
returns `lastEpoch` after quarantine and cannot throw there. The throwing code is the
**epoch-after-quarantine mutant** from `rd1414-arena-borrow-residual.test.mjs`, which rewrote the
shared `src/secret-arena-provider.ts` and rebuilt the shared `dist/` in place with `tsc`. Any file
that imported `../dist` while that mutant was live loaded the mutant. The mid-`tsc` window also
explains the occasional file-level failures, and the "697 right after a build" count noted in
`s5-app-kernel-census/findings.md`.

A second hazard: if the run was killed between mutate and restore, a tracked source file stayed
mutated in the working tree.

## Fix (tests only, no production code touched)

`rd1414-arena-borrow-residual.test.mjs` now builds each mutant in an isolated copy under
`os.tmpdir()` (`src/`, `tsconfig.json`, `package.json`), points the child scripts at the isolated
`dist/`, and pins the shared `src/` + `dist/` provider and gate files unchanged by sha256 after each
mutant test. `rebuildDist(root)` refuses to target the kernel directory. Each isolated `dist/` must
load as ESM before any mutant runs: without `package.json` NodeNext emits CommonJS and the
epoch-after-quarantine mutant "went red" only because it failed to load. That false red was
caught in this run's first block pass and closed by the preflight.

## Evidence (WSL, node v24.20.0)

| run | tests | pass | fail |
| --- | --- | --- | --- |
| before, parallel 1 | 724 | 722 | 2 |
| before, parallel 2 | 716 | 713 | 3 |
| before, parallel 3 | 724 | 722 | 2 |
| after, rd1414 alone | 5 | 5 | 0 |
| after, parallel 1 | 724 | 724 | 0 |
| after, parallel 2 | 724 | 724 | 0 |
| after, parallel 3 | 724 | 724 | 0 |

No `galerina-rd1414-mutant-*` temp directories remain after the runs.

## Still owed

- A Windows-node census run for the cross-platform diff (linux-only mutants skip there).