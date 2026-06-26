# Galerina Benchmark TODO

## Phase 1: Package Setup

```text
[x] Create /packages-galerina/galerina-tools-benchmark
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
[ ] Add --light flag
[ ] Add --full flag
[ ] Add --json flag
[ ] Add --save flag
[ ] Add command-line summary output
```

## Phase 3: Light Benchmarks

```text
[ ] Add Bool logic benchmark
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
[ ] Detect CPU architecture
[ ] Detect logical core count
[ ] Detect RAM bucket
[ ] Detect vector features where possible
[ ] Detect GPU backend availability
[ ] Detect low-bit backend availability
```

## Phase 5: Reports

```text
[ ] Write benchmark-report.json
[ ] Add report schema version
[ ] Add privacy section
[ ] Add fallback section
[ ] Add skipped tests section
[ ] Add score section
```

## Phase 6: Major Version Trigger

```text
[ ] Add .spore/benchmark-state.json
[ ] Store last Galerina version
[ ] Detect major version change
[ ] Trigger only in development mode
[ ] Never auto-run in production mode
```

## Phase 7: Privacy and Sharing

```text
[ ] Add shareable-report generator
[ ] Remove hostname
[ ] Remove username
[ ] Remove project path
[ ] Remove environment variables
[ ] Add Galerina benchmark submit placeholder
[ ] Add opt-in confirmation
```

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
