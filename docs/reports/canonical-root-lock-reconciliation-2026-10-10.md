# Canonical package root-lock reconciliation

This is a reference-only tooling repair, not Fungi runtime, deployment or RD
completion evidence. The integration subject is commit
`d3b9f1ce42c16781a9be61060d0fff1fbc2c2bda` plus the scoped collector changes.

## Contract

`scripts/flat-package-root-lock.mjs` derives package identities from stage-0 Git
blobs through `scripts/lib/flat-package-root-lock-collector.mjs`. It also checks
the live checkout: readable regular files, path containment, supported attributes,
matching content and stable observations are mandatory. Dirty content does not
fall back to index-only acceptance. Permitted whole-file CRLF projections and LF
bytes have one identity; mixed representations are not silently normalized.

The deterministic builder uses ordinal ordering. The generated output has one
explicit LF rule in `.gitattributes`; the collector and attributes are registered
in `governance/tooling-policy.json`. No package identity, version, dependency
relationship or released authority was changed by this reconciliation.

## Actual migration

The former lock and the canonical contract differ across all 100 package digest
records. This is not presented as 100 new package implementations. Independent
immutable-blob analysis separated the baseline representation/order migration
from the batch's compiler, runtime-WASM and vault content changes, including the
later vault build-manifest correction. The 138 external dependency records retain
the same set; their ordering is canonicalized.

The approved checkout repair backed up 24 mixed-line-ending files and restored
their exact stage-0 bytes. It did not stage package content. Recovery material is
retained outside this repository; no secret material is included in this report.

The actual guarded collector matches the independently derived candidate root:
`498d09b84d234f4fce853dfbdedde32196f68bbeb624bcc56adac27a8a048287`.
The generated output is byte-identical to the reviewed preview, with SHA-256
`35038566b63ece47e0357d6f321492caddae1a7ee4f7e79684621345facc2507`.
Both owner generation and the subsequent read-only `--check --json` succeeded.
They report 100 packages, 50 internal edges, 138 external bootstrap edges and two
development-version drifts, with `authorityReleased: false`.

## Verification and limits

The 29 focused tests passed in WSL. They cover canonical framing, LF/CRLF parity,
content mutations, unsupported conversions, missing peers, case collisions,
invalid modes, redirected paths, Git binding/configuration drift and exact output
format. The fresh native Windows two-file gate passed all 30 tests, including
the real-checkout integration test accounting for every direct package peer.

Evidence is retained in the coordinator's consolidation review directory:

- `astra-compiler-resume-canonical-root-final-unit-wsl-20261010.json` and log;
  log SHA-256 `2a29e38f61407aa7df3eea6a6cd83c5825ce79efaf2109702f1d6bd540e26622`.
- `astra-compiler-resume-canonical-root-final-preview-20261010.json` and log;
  log SHA-256 `f2c98c47edf399679c86cc93b21e99e45c3609f381c7ed4c255a1c20fcfb222e`.
- `astra-compiler-resume-canonical-root-final-generate-20261010.json` and
  `astra-compiler-resume-canonical-root-final-verify-20261010.json`; both logs
  hash to `97e4fdb748a2462abd54d1db48ac4f509b8204e19d6a4af9f9ffc4729fcbc81a`.
- `canonical-root-output-accounting-20261010.json` preserves the metadata,
  dependency-set and exact preview/output comparisons.
- `astra-compiler-resume-canonical-root-final-gate-native-20261010.json` and log;
  log SHA-256 `3aff0d548649febd3fe07782661caa531e6bf3ff30fd91351c659e27b81d5d2a`.

These are bounded file observations, not an atomic filesystem snapshot or
hostile-host proof. Permission-denial coverage is injected, not a real Windows
ACL experiment. SHA-256 Git repositories, extreme transport/resource faults and
arbitrary change-and-restore races are not claimed tested. Broader package,
compiler-suite and RD acceptance requirements remain separate. No GitHub CI ran.

## Static execution-scan disposition

The staged growth gate is clean. The staged bounded-execution scanner reports
`INVALID_TIMEOUT` and `MISSING_OUTPUT_BOUND` at the collector's Git child because
it does not resolve the expressions and parameter used there. Its result remains
a finding, not a claimed scanner pass.

Coordinator source review confirms `remaining` is the positive remainder of a
90-second overall deadline, and every Git child receives
`timeout: Math.min(10000, remaining)`. The local wrapper's `maxBuffer` defaults to
32 MiB; its sole explicit larger caller is the bounded object batch, capped by
`MAX_TOTAL + MAX_FILES * 128` (256 MiB plus header allowance). The wrapper is not
exported, and all call sites were inspected. Both findings are therefore static
analysis limitations for these exact expressions, not absent runtime limits.
No scanner exception or weaker execution limit was introduced. This disposition
does not claim tested exhaustion behavior or certify unrelated child processes.
