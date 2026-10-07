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
[x] Add Tri logic benchmark -- src/tri-logic-benchmark.ts runTriLogicBenchmark / scoreTriLogicBenchmark (Grok 2026-10-05; zero-trust defaults, owner may revisit): closed case id logic.tri_match target logic; Tri -1|0|1 Kleene table; FUNGI-BENCH-TRI-001..005; in-process only (no command runner / hardware / Phase 8-9)
[ ] Add Galerina benchmark
[x] Add Result / Option benchmark -- src/result-option-benchmark.ts runResultOptionBenchmark / scoreResultOptionBenchmark (Grok 2026-10-05; zero-trust defaults, owner may revisit): closed case id logic.result_option target logic; Option some|none + Result ok|err match/unwrapOr; FUNGI-BENCH-RO-001..005; in-process only (no command runner / hardware / Phase 8-9)
[x] Add CPU arithmetic benchmark -- src/cpu-arithmetic-benchmark.ts runCpuArithmeticBenchmark / scoreCpuArithmeticBenchmark (Grok 2026-10-05; zero-trust defaults, owner may revisit): closed light ids cpu.integer_loop + cpu.float_loop target cpu; FUNGI-BENCH-CPU-ARITH-001..005; in-process only (no command runner / vector-SIMD / hardware / Phase 8-9)
[x] Add JSON 1MB decode/validate benchmark -- src/json-1mb-benchmark.ts runJsonDecodeValidate1mbBenchmark / buildJson1mbPayload (Grok 2026-10-05; zero-trust defaults, owner may revisit): closed light id json.decode_validate_1mb target json; exact 1 MiB deterministic payload; unknown-field reject; FUNGI-BENCH-JSON-001..005; in-process only (no stream 10MB/1GB / download / command runner)
[x] Add JSON 10MB streaming benchmark -- src/json-stream-10mb-benchmark.ts runJsonStreamValidate10mbBenchmark / createJsonLinesStreamValidator (Grok 2026-10-05; zero-trust defaults, owner may revisit): closed light id json.stream_validate_10mb target json; OWNER-REVISIT picks 10 MiB / JSON Lines / 64 KiB chunks / 4 KiB max line; any invalid/oversize/empty line fails the run; FUNGI-BENCH-JSONS-001..005; no 100MB/1GB / quarantine mode / command runner
[x] Add small vector benchmark -- src/small-vector-benchmark.ts runSmallVectorBenchmark / benchDotFloat32 / benchCosineFloat32 (Grok 2026-10-05; zero-trust defaults, owner may revisit): closed light ids vector.dot_product_small + vector.cosine_batch_small target vector; scalar Float32 only (dim 256, batch 64); zero-norm/non-finite refuse; FUNGI-BENCH-VEC-001..005; no SIMD detection claim / matrix / GPU / command runner
[x] Add SHA-256 byte benchmark -- src/sha256-benchmark.ts runSha256Benchmark / benchSha256Hex (Grok 2026-10-05; zero-trust defaults, owner may revisit): closed light id cpu.hash_sha256_32mb target cpu; deterministic generated 32 MiB; pure FIPS 180-4 (boundary admits no node:crypto; tests cross-check node:crypto); FUNGI-BENCH-SHA-001..005; benchmark only, not a security primitive; no 256MB full-mode / command runner
```

## Phase 4: Target Detection

```text
[x] Detect CPU architecture
[x] Detect logical core count
[x] Detect RAM bucket -- src/target-detection.ts bucketTotalMemory / detectBenchmarkMemory, tests/target-detection.test.mjs (Grok 2026-10-06; zero-trust defaults, owner may revisit): host-injected totalMemoryBytes (e.g. os.totalmem()) -> closed README buckets <8GB|8GB|16GB|32GB|64GB+|unknown; OWNER-REVISIT 7/8 tolerance (firmware/iGPU reservations); exact byte count never echoed; closed probe, accessors/unknown keys refused unread; detectBenchmarkSystem probe unchanged
[x] Detect vector features where possible -- src/target-detection.ts detectBenchmarkVectorFeatures / wasmSimd128ProbeBytes, tests/target-detection.test.mjs (Grok 2026-10-06; zero-trust defaults, owner may revisit): host-injected arch + cpuFlags (Linux /proc/cpuinfo spellings: sse..sse4_2, pni=sse3, avx, avx2, avx512f, asimd/neon, sve, sve2) + wasmSimd128 (host runs WebAssembly.validate on the probe bytes) -> closed feature list + bestVectorBackend; x86-64 SSE/SSE2 and AArch64 NEON baselines; cross-ISA flags ignored; unknown arch reports no CPU feature; hints only: benchmarkVectorBackend stays "scalar" (no SIMD kernel selected or claimed)
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

Phase 4 update (2026-10-06, Grok Bot; zero-trust defaults, owner may revisit):
the RAM bucket and vector features now have their own pure probes in
src/target-detection.ts (`detectBenchmarkMemory`, `detectBenchmarkVectorFeatures`),
so the closed `detectBenchmarkSystem` probe and its tests are unchanged. The
package border is unchanged (`node:util/types` only; a test checks the module
source). Still open: GPU backend availability (owner hold O1 keeps the GPU
target parked post-v1) and low-bit backend availability (galerina-ai-lowbit
defines backend adapter contracts only; no backend implementation exists to
detect, and its gpu/npu kernels fall under O1). Until then the runner keeps
reporting those cases as skipped.

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
[x] Add 100MB JSON streaming test -- src/json-stream-generated-benchmark.ts runJsonStreamValidate100mbBenchmark (Grok 2026-10-06; zero-trust defaults, owner may revisit): full-mode id json.stream_validate_100mb; generated as fed (no payload in memory) through the #127 JSON Lines validator; OWNER-REVISIT 100 MiB + closed `bytes` override for tests; FUNGI-BENCH-JSONG-001..005
[x] Add optional 1GB generated JSON streaming test -- src/json-stream-generated-benchmark.ts runJsonStreamValidate1gbOptionalBenchmark (Grok 2026-10-06; zero-trust defaults, owner may revisit): full-mode id json.stream_validate_1gb_optional; generated as fed; OWNER-REVISIT 1 GiB; never run implicitly or in unit tests; light-mode exclusion belongs to the command runner
[x] Add medium matrix multiply -- src/matrix-medium-benchmark.ts runMatrixMultiplyMediumBenchmark / benchMatMulFloat32 (Grok 2026-10-05; zero-trust defaults, owner may revisit): README full-mode id vector.matrix_multiply_medium target vector; scalar Float32 CPU only; OWNER-REVISIT pick N=128, tol 1e-3; score = M mul-adds/s (ZTF scoreboard size-invariant unit); FUNGI-BENCH-MAT-001..005; no GPU / SIMD claim / mode gating (runner) 
[ ] Add GPU benchmark if available
[ ] Add generic AI accelerator benchmark if available
[ ] Add low-bit AI backend benchmark if available
[ ] Add optical I/O interconnect benchmark if available
[ ] Add fallback tests
```

## Phase 9: External Runtime Comparisons

```text
[ ] Add optional external runtime comparison runner -- open: no runner yet; the report contract below is what it must feed (argv composition is in parked draft #149)
[ ] Add optional external compiled-output comparison runner -- open: needs compiled .fungi benchmark sources and an admitted artifact path (owner/Codex decision); no runner yet
[x] Use same generated input data -- src/comparison-report.ts createBenchmarkComparisonReport, tests/comparison-report.test.mjs (Grok 2026-10-06; zero-trust defaults, owner may revisit): every side carries the SHA-256 of the generated input it fed; any mismatch or malformed digest refuses the report (FUNGI-BENCH-CMP-002), so no comparison is ever made across different inputs. Enforced at the report contract; runners still open
[x] Record runtime version -- src/comparison-report.ts createBenchmarkComparisonReport, tests/comparison-report.test.mjs (Grok 2026-10-06; zero-trust defaults, owner may revisit): each side must record runtime {name, version} as short closed tokens (no spaces/paths), else FUNGI-BENCH-CMP-003
[x] Record compiler version and flags where applicable -- src/comparison-report.ts createBenchmarkComparisonReport, tests/comparison-report.test.mjs (Grok 2026-10-06; zero-trust defaults, owner may revisit): the compiled side must record compiler {name, version, flags[]} (<=32 unique --flag[=value] tokens, no paths/spaces); a compiler on the runtime side is refused (FUNGI-BENCH-CMP-003)
[x] Write comparison report -- src/comparison-report.ts createBenchmarkComparisonReport, tests/comparison-report.test.mjs (Grok 2026-10-06; zero-trust defaults, owner may revisit): closed galerina.tools-benchmark.comparison/v1 report (sides ordered runtime, compiled; sameInput true; runtime/compiled duration ratio only when both passed); shareable always false, authority NON_AUTHORIZING; closed shapes, never throws or echoes; FUNGI-BENCH-CMP-001..005. Report built in memory; --save stays with the in-package runner follow-ups
```

## Notes (Grok 2026-10-05 Bool logic benchmark)
- Closed `src/bool-logic-benchmark.ts`: `runBoolLogicBenchmark` / `scoreBoolLogicBenchmark`.
- README light id `logic.bool_branch`; target `logic`; purpose check no silent Bool conversion (genuine boolean ops only).
- CASE ONLY: does not implement the Galerina benchmark command runner, RAM/vector/GPU detection, or Phase 8-9.
- Never throws; never echoes options/tokens. Owner may revisit score formula / default operations.

## Notes (Grok 2026-10-05 Tri logic benchmark)
- Closed `src/tri-logic-benchmark.ts`: `runTriLogicBenchmark` / `scoreTriLogicBenchmark` / `benchTriAnd|Or|Not`.
- README light id `logic.tri_match`; target `logic`. Tri vocabulary `-1|0|1` matches galerina-core-logic (local closed copy; no package import).
- CASE ONLY: no command runner, RAM/vector/GPU detection, or Phase 8-9.

## Notes (Grok 2026-10-05 Result / Option benchmark)
- Closed `src/result-option-benchmark.ts`: `runResultOptionBenchmark` / `benchMatchResultOption` / `benchUnwrapOr`.
- README light id `logic.result_option`; Option shape matches galerina-data-query QueryOption; Result is closed Ok/Err (local copies; no package import).
- CASE ONLY: no command runner, RAM/vector/GPU detection, or Phase 8-9. Never throws on err/none paths.

## Notes (Grok 2026-10-05 CPU arithmetic benchmark)
- Closed `src/cpu-arithmetic-benchmark.ts`: `runCpuArithmeticBenchmark` returns both `cpu.integer_loop` and `cpu.float_loop`.
- README light ids; float path refuses NaN/Infinity (never collapses non-finite to allow). CASE ONLY.

## Notes (Grok 2026-10-05 JSON 1MB decode/validate)
- Closed `src/json-1mb-benchmark.ts`: `runJsonDecodeValidate1mbBenchmark` / `buildJson1mbPayload` / `validateJson1mbDocument`.
- README light id `json.decode_validate_1mb`; exact `JSON_1MB_BYTES` = 1048576; local closed field allowlists (no data-json import).
- CASE ONLY: no 10MB/100MB/1GB streaming, no network download, no command runner.

## Notes (Grok 2026-10-05 logic.logic5_match PARKED)
- README lists light id `logic.logic5_match` but no closed Logic5 vocabulary exists in-repo (core-logic has Tri 3-state, Decision 4-state, Omni 8-state). Do-not-invent: parked until owner supplies closed vocab. Not tied to TODO "Add Galerina benchmark" (also invent-heavy).

## Notes (Grok 2026-10-05 SHA-256 byte benchmark)
- Closed `src/sha256-benchmark.ts`: `runSha256Benchmark` / `benchSha256Hex` / `buildSha256BenchmarkBuffer`.
- README light id `cpu.hash_sha256_32mb` (README CPU example id `cpu.hash.sha256_64mb` differs; light-list id used). Score = MiB/s capped 10000.
- Pure TS digest because `.graph/boundary-policy.json` admits only `node:util/types`; not a security primitive.

## Notes (Grok 2026-10-05 small vector benchmark)
- Closed `src/small-vector-benchmark.ts`: `runSmallVectorBenchmark` returns `vector.dot_product_small` + `vector.cosine_batch_small`.
- Scalar Float32Array path only (README "generic scalar fallback"); "Detect vector features where possible" stays open (needs hardware probing).
- Closed sizes dim 256 / batch 64 are zero-trust defaults (owner may revisit). Zero-norm cosine and NaN/Infinity refuse (never collapse to pass).
- `cpu.record_validate` (README light id) has no TODO row; not implemented (avoid scope creep / inventing a record shape).

## Notes (Grok 2026-10-05 JSON 10MB streaming)
- Closed `src/json-stream-10mb-benchmark.ts`: `runJsonStreamValidate10mbBenchmark` / `createJsonLinesStreamValidator` / `streamValidateJsonLines`.
- OWNER-REVISIT picks (not in-repo spec): 10 MiB (10485760), JSON Lines framing (mirrors data-json `json_lines` mode), 64 KiB chunks, 4 KiB max line, record shape reused from json.decode_validate_1mb.
- Validator holds at most one partial line; README resilient "quarantine and continue" not implemented here (separate resilient.* family).

## Notes (Grok 2026-10-05 medium matrix multiply)
- Closed `src/matrix-medium-benchmark.ts`: `runMatrixMultiplyMediumBenchmark` / `benchMatMulFloat32` / `verifyMatMulSpotEntries`.
- OWNER-REVISIT picks (not in-repo spec): N = 128 (README says only "medium"), Float32 row-major i-k-j, spot-check tolerance 1e-3 vs Float64 reference.
- Score unit mul-adds/s from the ZTF benchmark scoreboard standard (size-invariant). Light/full gating is the command runner's job; GPU matmul stays HOLD.

## Notes (Grok 2026-10-06 JSON 100MB / 1GB generated streams)
- Closed `src/json-stream-generated-benchmark.ts`: `generateJsonLinesChunks` feeds the #127 validator chunk by chunk; peak memory ~one chunk + one partial line.
- OWNER-REVISIT picks: 100 MiB / 1 GiB; `bytes` override in [64 KiB, case size] (result reports `bytes` + `bytesValidated`); maxDurationMs 60 s/300 s (100MB) and 300 s/1800 s (1GB).
- Unit tests use 256 KiB-8 MiB overrides only; the full sizes are never run in tests.
