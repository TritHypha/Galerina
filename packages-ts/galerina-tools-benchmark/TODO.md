# Galerina Benchmark TODO

## Graph integration follow-up — 2026-09-22

- [x] Admitted `node:util/types` on the boundary because `src/index.ts` already
      loads it. Live `--check` PASS. Exact-specifier hostility retained.

## Phase 1: Package Setup

```text
[x] Create /packages-ts/galerina-tools-benchmark
[x] Add README.md
[x] Add TODO.md
[x] Add package metadata
[x] Add initial typed exports
[x] Add benchmark config example
[x] Add benchmark report example
```

## Phase 2: CLI Integration

```text
[x] Add Galerina benchmark command placeholder
[ ] Implement Galerina benchmark command runner
[x] Add --light flag -- src/index.ts parseBenchmarkCliArgs (Grok 2026-10-05; zero-trust defaults, owner may revisit): admits --light; conflicts with --full refused Galerina_BENCHMARK_CLI_002; never echoes refused tokens
[x] Add --full flag -- src/index.ts parseBenchmarkCliArgs (Grok 2026-10-05; zero-trust defaults, owner may revisit): admits --full; mutual exclusion with --light; default mode light when neither set
[x] Add --json flag -- src/index.ts parseBenchmarkCliArgs (Grok 2026-10-05; zero-trust defaults, owner may revisit): admits --json boolean; duplicates/equals-form refused Galerina_BENCHMARK_CLI_001
[x] Add --save flag -- src/index.ts parseBenchmarkCliArgs (Grok 2026-10-05; zero-trust defaults, owner may revisit): admits --save with required --out <rel-dir>; path traversal / refused tokens Galerina_BENCHMARK_CLI_003; --network/--live/--stress refused Galerina_BENCHMARK_CLI_004
[x] Add command-line summary output -- src/index.ts formatBenchmarkSummary (Grok 2026-10-05; zero-trust defaults, owner may revisit): privacy-safe lines from captured report; never includes paths/host/user/raw reasons; invalid report yields fixed unavailable line
```

## Phase 3: Light Benchmarks

```text
[x] Add Bool logic benchmark -- src/bool-logic-benchmark.ts runBoolLogicBenchmark / scoreBoolLogicBenchmark (Grok 2026-10-05; zero-trust defaults, owner may revisit): closed case id logic.bool_branch target logic; FUNGI-BENCH-BOOL-001..005; in-process truth-table microbench only (no command runner / hardware probes / Phase 8-9)
[ ] Add Tri logic benchmark
[ ] Add Galerina benchmark
[ ] Add Result / Option benchmark
[ ] Add CPU arithmetic benchmark
[ ] Add JSON 1MB decode/validate benchmark
[ ] Add JSON 10MB streaming benchmark
[ ] Add small vector benchmark
[ ] Add SHA-256 byte benchmark
```

## Phase 4: Target Detection

```text
[x] Detect CPU architecture
[x] Detect logical core count
[ ] Detect RAM bucket
[ ] Detect vector features where possible
[ ] Detect GPU backend availability
[ ] Detect low-bit backend availability
```

Phase 4 note (2026-09-29, Grok Bot, owner-approved; see AGENTS session-exchange
grok-bot-pkg-todo-work-20260929/LEDGER.md): `detectBenchmarkSystem(probe)` and
`bucketLogicalCores(count)` in src/index.ts are pure and take injected OS facts
(`platform`, `arch`, `logicalCores`). They return closed-vocabulary `osFamily` /
`architecture` and a power-of-two `cpuCoresBucket` (`1`..`64`, `128+`), or
`unknown` plus a warning, and never pass raw probe strings (hostname, CPU model)
through. Unknown probe keys are refused unread. The package border is unchanged
(no `node:os` import); a runner wires in the real probe. Tests:
tests/system-detection.test.mjs. The RAM bucket is left out on purpose
(memory-adjacent), and vector/GPU/low-bit detection needs hardware probing.

## Phase 5: Reports

```text
[x] Write benchmark-report.json -- src/index.ts writeBenchmarkReport / renderBenchmarkReport (Grok 2026-10-05; zero-trust defaults, owner may revisit): exclusive-create BENCHMARK_REPORT_FILE into existing dir via captureBenchmarkReport and a host-supplied BenchmarkReportFileWriter capability (closed CREATED/EXISTS/DIR_INVALID/IO_FAILED result; the package imports no node:fs/node:path, boundary policy unchanged); never overwrites; never throws; never echoes paths/errno; IO_FAILED/REFUSED statuses; tests/benchmark-report-write.test.mjs
[x] Add report schema version
[x] Add privacy section
[x] Add fallback section
[x] Add skipped tests section
[x] Add score section
```

Phase 5 locators (2026-09-29, Grok Bot, owner-approved; see AGENTS
session-exchange grok-bot-pkg-todo-work-20260929/LEDGER.md):

- Schema version: `BenchmarkReport.schema` = `Galerina.benchmark.report.v1`
  (src/index.ts:189), refused otherwise by `validateBenchmarkReport` (:353).
- Privacy section: `BenchmarkReport.privacy` (:199-206); `containsPersonalData`
  must be false and machineId/hostname/username/projectPath `not_included`
  (:419-427).
- Fallback section: per-target `summary` status `fallback` (:196, :378), per-test
  `fallback`/`backend`/`reason` (:162-172, :413-415) and the
  `fallbackReliability` score (:183).
- Skipped tests section: `skipped` / `skipped_timeout` statuses with a bounded
  `reason` (:19-25, :410, :414).
- Score section: `BenchmarkScores` with required `overall` (:174-186, :382-390).
- Update 2026-10-05 (Grok Bot; owner may revisit): `writeBenchmarkReport` exclusive-creates `benchmark-report.json`; Phase 2 flag parse + summary landed. Live runner / hardware probes / Phase 8-9 remain open.

## Phase 6: Major Version Trigger

```text
[x] Add .fungi/benchmark-state.json
[x] Store last Galerina version
[x] Detect major version change
[x] Trigger only in development mode
[x] Never auto-run in production mode
```

Phase 6 note (2026-10-05, Grok Bot, standing permission, owner may revisit):
`BENCHMARK_STATE_PATH` (".fungi/benchmark-state.json"), strict
`serializeBenchmarkState` / `parseBenchmarkState` (exactly {schema,
lastGalerinaVersion}, semver only) and `decideBenchmarkAutoRun` in src/index.ts.
Auto-run happens only in development, only with runOnMajorUpdate, only on a strict
major increase over a valid recorded version. Production never runs; a first run
only records the version; an unreadable state never triggers a run. Pure: the
caller does the file I/O. Tests: tests/benchmark-governance.test.mjs.

## Phase 7: Privacy and Sharing

```text
[x] Add shareable-report generator
[x] Remove hostname
[x] Remove username
[x] Remove project path
[x] Remove environment variables
[x] Add Galerina benchmark submit placeholder
[x] Add opt-in confirmation
```

Phase 7 note (2026-10-05, Grok Bot, standing permission, owner may revisit):
`createShareableBenchmarkReport(report, config)` rebuilds the report from the
closed key allowlists, so hostname, username, project path, env and any unknown
field are dropped by construction (listed in `removedFields`); path-, env-,
e-mail-, assignment-, drive-letter- or IP-like `reason`/`backend` text, or text
containing a hostname/username the input carried, becomes "redacted"; privacy identifiers are
forced to not_included and `shareable` is true only with privacy.allowSubmit.
`prepareBenchmarkSubmission(report, config, confirmation)` is the submit
placeholder: it needs the exact phrase `submit-anonymous-benchmark` plus opt-in,
builds the anonymous payload, and always returns NOT_SUBMITTED_PLACEHOLDER with
networkUsed false (no endpoint exists). Tests: tests/benchmark-governance.test.mjs.

(The 2026-09-29 note that said these rows stay open and that no shareable-report
generator existed is superseded by the 2026-10-05 note above.)

## Phase 8: Full Benchmarks

```text
[ ] Add 100MB JSON streaming test
[ ] Add optional 1GB generated JSON streaming test
[ ] Add medium matrix multiply
[ ] Add GPU benchmark if available
[ ] Add generic AI accelerator benchmark if available
[ ] Add low-bit AI backend benchmark if available
[ ] Add optical I/O interconnect benchmark if available
[ ] Add fallback tests
```

## Phase 9: External Runtime Comparisons

```text
[ ] Add optional external runtime comparison runner
[ ] Add optional external compiled-output comparison runner
[ ] Use same generated input data
[ ] Record runtime version
[ ] Record compiler version and flags where applicable
[ ] Write comparison report
```

## Notes (Grok 2026-10-05 Bool logic benchmark)
- Closed `src/bool-logic-benchmark.ts`: `runBoolLogicBenchmark` / `scoreBoolLogicBenchmark`.
- README light id `logic.bool_branch`; target `logic`; purpose check no silent Bool conversion (genuine boolean ops only).
- CASE ONLY: does not implement the Galerina benchmark command runner, RAM/vector/GPU detection, or Phase 8-9.
- Never throws; never echoes options/tokens. Owner may revisit score formula / default operations.
