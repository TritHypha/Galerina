# Galerina Benchmark

`galerina-tools-benchmark` is a development and diagnostics package for testing Galerina logic,
compute targets and runtime behaviour across different machines.

The goal is not to find only the fastest computers.

The goal is to understand how Galerina behaves across:

```text
normal laptops
older desktops
cloud CPUs
ARM CPUs
Intel CPUs
AMD CPUs
small VPS machines
machines without GPUs
machines with GPUs
machines with AI/low-bit support
machines with AI accelerator support
future accelerator targets
future optical I/O interconnect targets
```

## Purpose

`galerina-tools-benchmark` should test whether Galerina performs correctly and predictably across
different execution targets.

It should benchmark:

```text
Bool logic
Tri logic
Galerina
Decision matching
Result / Option handling
Confidence / Fuzzy / Distribution handling
CPU scalar execution
CPU vector execution
low-bit AI backend if available
GPU backend if available
AI accelerator backend if available
optical I/O interconnect if available
JSON decode / validation / streaming
TCP latency
HTTP throughput
TLS handshake cost
zero-copy send path where available
streaming upload behavior
WebSocket throughput
packet filtering overhead where available
rate limit overhead
hashing / byte processing
memory pressure behaviour
fallback behaviour
security-safe reports
```

It should generate:

```text
JSON benchmark report
short command-line summary
optional shareable benchmark payload
optional external-runtime comparison output later
```

## When Benchmark Runs

The benchmark should run only in safe situations.

It should run when:

```text
Galerina is in development mode and the Galerina major version changes
the developer runs it manually from the command line
```

It should not run automatically in production.

Production package rule:

```text
galerina-tools-benchmark is disabled by default in production boot/package profiles.
```

If a maintainer needs benchmark support in production, for example for a
one-off hardware validation window, it must be enabled with an explicit
production package override that includes a reason and should include an expiry.
The override must appear in config, build, security or deployment reports.

Example major version trigger:

```text
Galerina version changed from 1.x to 2.x
```

Manual command:

```bash
Galerina benchmark
```

Future config direction:

```Galerina
benchmark {
  run_on_major_update true
  mode "light"
}
```

## CLI Commands

Recommended commands:

```bash
Galerina benchmark
Galerina benchmark --light
Galerina benchmark --full
Galerina benchmark --target cpu
Galerina benchmark --target gpu
Galerina benchmark --target ai_accelerator
Galerina benchmark --target low_bit_ai
Galerina benchmark --target optical_io
Galerina benchmark --network --light
Galerina benchmark --network --full
Galerina benchmark --json
Galerina benchmark --save
Galerina benchmark --compare python
Galerina benchmark --compare cpp
Galerina benchmark submit
```

Default mode:

```bash
Galerina benchmark --light
```

## Benchmark Modes

### Light Mode

Light mode should be the default.

Goal:

```text
finish in under 3 minutes on a normal computer
```

Light mode should:

```text
run small but meaningful tests
avoid extreme workloads
avoid large downloads
avoid huge memory allocation
avoid long GPU warmups
avoid stress-test behaviour
produce useful local results
```

Maximum recommended time:

```text
180 seconds
```

If a task is running too long, the benchmark should stop that task and report:

```text
skipped_timeout
```

### Full Mode

Full mode is optional.

Command:

```bash
Galerina benchmark --full
```

Full mode may include:

```text
larger JSON workloads
larger vector workloads
larger matrix workloads
longer GPU tests
low-bit AI inference tests
streaming 1GB generated JSON test
external runtime comparison
external compiled-output comparison
```

Full mode should clearly warn the user:

```text
Full benchmark may take several minutes and use more memory/CPU/GPU.
```

### Future Extreme Mode

Optional future mode:

```bash
Galerina benchmark --stress
```

This should be separate from normal development benchmarking and should never
run automatically.

## Important Safety Rule

The benchmark should not include anything that looks like password cracking or
malicious brute forcing.

Avoid wording like:

```text
guess a UUID
guess an MD5
crack a hash
brute force a token
```

Better benchmark wording:

```text
UUID generation and parsing
hash throughput on generated test data
checksum validation
byte processing
deterministic hash comparison
```

MD5 can be included only as a legacy checksum benchmark, not as a security
recommendation.

## Package Location

Recommended package:

```text
/packages-galerina/galerina-tools-benchmark
```

Related packages:

```text
/packages-galerina/galerina-core
/packages-galerina/galerina-core-logic
/packages-galerina/galerina-core-vector
/packages-galerina/galerina-core-compute
/packages-galerina/galerina-target-ai-accelerator
/packages-galerina/galerina-ai-lowbit
/packages-galerina/galerina-target-cpu
/packages-galerina/galerina-target-gpu
/packages-galerina/galerina-target-photonic
/packages-galerina/galerina-core-security
```

## What The Benchmark Should Test

### Logic Benchmarks

Test core Galerina logic models:

```text
Bool
Tri
Galerina
Decision
Result<T, E>
Option<T>
match exhaustiveness
Confidence
Fuzzy
Distribution<T>
```

Purpose:

```text
check language-level decision behaviour
check match performance
check policy conversion behaviour
check no silent Bool conversion
```

### CPU Benchmarks

Test normal CPU execution.

Targets:

```text
x86_64
arm64
riscv64 later
```

CPU tests:

```text
integer arithmetic
floating-point arithmetic
branching
typed record allocation
Result / Option handling
JSON validation
small stream processing
hash throughput
safe string processing
```

Example IDs:

```text
cpu.logic.bool_branch
cpu.logic.tri_match
cpu.records.create_validate
cpu.json.decode_validate_10mb
cpu.hash.sha256_64mb
```

### CPU Vector Benchmarks

Test CPU SIMD/vector support where available.

Examples:

```text
Vector<Float32> add
Vector<Float32> dot product
Vector<Float32> cosine similarity
Matrix<Float32> small multiply
batch embedding distance
```

Target features:

```text
SSE / AVX / AVX2 / AVX-512 on x86
NEON / SVE on ARM
generic scalar fallback
```

Example report:

```json
{
  "target": "cpu",
  "architecture": "arm64",
  "vector_backend": "neon",
  "fallback": false
}
```

### GPU Benchmarks

GPU tests should run only if a supported GPU backend is available.

Backends:

```text
nvidia_cuda
amd_rocm
opencl
vulkan_compute
webgpu later
```

GPU tests:

```text
Vector<Float32> add
matrix multiply
batch cosine similarity
small tensor operation
embedding ranking
```

Rules:

```text
GPU test must be optional
GPU test must have CPU fallback
GPU warmup time should be reported separately
GPU test should not dominate light mode
```

### AI Accelerator Benchmarks

AI accelerator benchmarks should stay vendor-neutral at the command level.

Use:

```bash
Galerina benchmark --target ai_accelerator
```

Reports may identify the selected backend profile:

```json
{
  "target": "ai_accelerator",
  "backend": "intel.gaudi3.hl338"
}
```

Possible tests:

```text
LLM token throughput
batch inference throughput
embedding throughput
RAG retrieval plus generation
multimodal batch workload
host-to-accelerator transfer cost
accelerator memory pressure
multi-card scaling where available
precision comparison such as FP8 versus BF16
fallback to GPU or CPU
```

Do not expose permanent vendor-specific benchmark categories such as `gaudi` in
normal Galerina syntax. Keep the category generic and put vendor/device details in the
backend report.

### Optical I/O Benchmarks

Optical I/O tests should run only if a supported optical interconnect backend or
test harness is available.

Public benchmark names should use:

```text
optical_io
interconnect
data_movement
```

Do not describe Intel Silicon Photonics or OCI as a normal CPU or photonic
compute backend.

Possible tests:

```text
small message latency
large tensor transfer
schema-compressed JSON transfer
binary record transfer
streaming throughput
remote memory read
multi-node reduce
fallback performance
```

Example IDs:

```text
optical_io.latency_small_if_available
optical_io.tensor_transfer_if_available
optical_io.schema_compressed_json_if_available
optical_io.fallback_to_network
```

### Low-Bit AI Benchmarks

Low-bit AI should be generic.

Do not hard-code BitNet into normal benchmark names.

Use:

```text
low_bit_ai
ternary_ai
quantized_ai
```

Possible backends:

```text
bitnet
ternary_native
int8_reference
cpu_reference
future_lowbit_standard
```

Rules:

```text
BitNet can be a backend
BitNet should not be the public benchmark category
low_bit_ai should have CPU reference fallback
```

### JSON Benchmarks

JSON is important for Galerina because Galerina focuses on typed API handling.

Light mode:

```text
1MB JSON decode
10MB JSON stream validate
nested object validation
unknown field rejection
duplicate key rejection
typed record conversion
```

Full mode:

```text
100MB generated JSON stream
1GB generated JSON stream optional
large JSON schema validation
large JSON memory report
```

Important:

```text
1GB JSON should not be in light mode.
1GB JSON should be generated locally or streamed.
Do not require downloading a 1GB file.
```

### Hash / Byte Processing Benchmarks

Use generated deterministic data.

Tests:

```text
UUID generation
UUID parse/validate
MD5 legacy checksum throughput
SHA-256 throughput
byte buffer copy
byte buffer scan
safe string escaping
```

Rules:

```text
Do not frame this as cracking or guessing.
MD5 is legacy checksum only.
Security reports should say MD5 is not recommended for secure hashing.
```

### Recovery And Fallback Benchmarks

Galerina should test safe fallback behaviour.

Tests:

```text
GPU unavailable -> CPU fallback
ai_accelerator unavailable -> GPU or CPU fallback
low_bit_ai unavailable -> CPU reference fallback
optical_io unavailable -> PCIe, Ethernet or standard network fallback
memory pressure -> reduce batch size
bad JSON item -> quarantine and continue
timeout -> cancel task group
```

Example IDs:

```text
fallback.gpu_to_cpu
fallback.lowbit_to_cpu
resilient.bad_rows_continue
resilient.timeout_cancel
```

## Light Benchmark Task List

The default benchmark should be short and fair.

Recommended light test set:

```text
logic.bool_branch
logic.tri_match
logic.logic5_match
logic.result_option

cpu.integer_loop
cpu.float_loop
cpu.record_validate
cpu.hash_sha256_32mb

json.decode_validate_1mb
json.stream_validate_10mb

vector.dot_product_small
vector.cosine_batch_small

compute.cpu_fallback_check

gpu.vector_small_if_available
ai_accelerator.llm_batch_if_available
low_bit_ai.reference_small_if_available
optical_io.latency_small_if_available
```

Expected time:

```text
30 seconds to 3 minutes
```

If a test is too slow:

```text
mark partial
stop task
continue benchmark
report timeout
```

## Full Benchmark Task List

Optional full benchmark:

```text
logic.bool_branch_large
logic.tri_match_large
logic.logicN_match_large

cpu.integer_large
cpu.float_large
cpu.hash_sha256_256mb
cpu.hash_md5_legacy_256mb

json.stream_validate_100mb
json.stream_validate_1gb_optional

vector.dot_product_large
vector.matrix_multiply_medium
vector.embedding_rank_large

gpu.matrix_multiply_if_available
gpu.embedding_batch_if_available

ai_accelerator.llm_batch_if_available
ai_accelerator.rag_if_available
ai_accelerator.precision_fp8_bf16_if_available

low_bit_ai.ternary_matmul_if_available
low_bit_ai.inference_small_if_available
optical_io.tensor_transfer_if_available
optical_io.schema_compressed_json_if_available

resilient.import_bad_rows_100k
fallback.gpu_to_cpu
fallback.ai_accelerator_to_gpu_or_cpu
fallback.lowbit_to_cpu
fallback.optical_io_to_network

compare.external_runtime_json_100mb_optional
compare.external_compiled_json_100mb_optional
```

## External Runtime Comparisons

Future benchmark comparison should be optional.

Commands:

```bash
Galerina benchmark --compare runtime
Galerina benchmark --compare compiled
Galerina benchmark --compare runtime,compiled
```

Purpose:

```text
compare Galerina behaviour with selected external runtimes
show where Galerina is faster/slower
show memory usage differences
show safety/reporting differences
```

The comparison must use the same generated input data, record runtime or
compiler versions and remain optional for normal benchmark runs.

## Command-Line Summary

After running, the CLI should show a short summary.

Example:

```text
Galerina Benchmark Summary
Mode: light
Galerina Version: 2.0.0
Duration: 74.2s

System:
  CPU: arm64
  Cores: 8
  RAM: 16GB
  GPU: not available
  Low-bit AI: cpu_reference

Results:
  Logic: passed
  CPU: passed
  JSON: passed
  Vector: passed
  GPU: skipped
  Low-bit AI: fallback cpu_reference

Scores:
  Logic score: 8,240
  CPU score: 6,910
  Vector score: 5,440
  JSON score: 7,120
  Overall class: Balanced laptop / desktop

Report:
  build/reports/benchmark-report.json
```

Avoid language like:

```text
Your computer is slow
```

Use positive categories:

```text
small cloud instance
older laptop
balanced laptop
desktop workstation
GPU workstation
ARM server
developer machine
```

## JSON Report

Main report file:

```text
build/reports/benchmark-report.json
```

Example report shape:

```json
{
  "schema": "Galerina.benchmark.report.v1",
  "benchmark_id": "bench_2026_05_09_001",
  "mode": "light",
  "trigger": "manual",
  "Galerina": {
    "version": "2.0.0",
    "previous_major_version": "1",
    "current_major_version": "2",
    "build": "dev"
  },
  "system": {
    "os": "linux",
    "architecture": "arm64",
    "cpu": {
      "vendor": "unknown",
      "model": "redacted_or_generic",
      "cores_logical": 8
    },
    "memory": {
      "total_gb": 16
    },
    "gpu": {
      "available": false,
      "backend": null
    },
    "low_bit_ai": {
      "available": true,
      "backend": "cpu_reference"
    }
  },
  "duration_ms": 74200,
  "summary": {
    "logic": "passed",
    "cpu": "passed",
    "json": "passed",
    "vector": "passed",
    "gpu": "skipped",
    "low_bit_ai": "fallback"
  },
  "scores": {
    "logic": 8240,
    "cpu": 6910,
    "json": 7120,
    "vector": 5440,
    "gpu": null,
    "low_bit_ai": 1200,
    "overall": 5850
  },
  "privacy": {
    "shareable": true,
    "contains_personal_data": false,
    "machine_id": "not_included",
    "hostname": "not_included",
    "username": "not_included",
    "project_path": "not_included"
  }
}
```

## Privacy And Sharing

Future API sharing must be opt-in.

Command:

```bash
Galerina benchmark submit
```

Do not include:

```text
username
hostname
IP address in report body
project path
file names
environment variables
tokens
secrets
private repo names
raw benchmark input data
```

Allowed shareable data:

```text
Galerina version
benchmark mode
OS family
CPU architecture
generic CPU class
logical core count
RAM size bucket
GPU backend availability
test durations
scores
fallback status
warnings
```

Use buckets where possible:

```text
RAM: 8GB / 16GB / 32GB / 64GB+
CPU cores: 2 / 4 / 8 / 16 / 32+
```

## Benchmark API Payload

Future API payload:

```json
{
  "schema": "Galerina.benchmark.submit.v1",
  "anonymous": true,
  "Galerina_version": "2.0.0",
  "mode": "light",
  "system": {
    "os_family": "linux",
    "architecture": "arm64",
    "cpu_cores_bucket": "8",
    "memory_bucket": "16GB",
    "gpu_backend": "none",
    "low_bit_backend": "cpu_reference"
  },
  "scores": {
    "logic": 8240,
    "cpu": 6910,
    "json": 7120,
    "vector": 5440,
    "overall": 5850
  },
  "fallbacks": [
    {
      "target": "gpu",
      "reason": "unavailable"
    }
  ]
}
```

## Scoring Philosophy

The benchmark should encourage variety. Do not rank only by raw speed.

Use categories:

```text
small cloud instance
ARM cloud instance
older laptop
balanced laptop
desktop workstation
GPU workstation
low-power device
CI runner
```

Scores should be split by category:

```text
logic score
CPU score
JSON score
vector score
GPU score
low-bit AI score
fallback reliability score
memory behaviour score
```

This helps avoid treating GPU workstations as the only good systems.

## Adaptive Runtime Limit

Light mode should protect the user's machine.

Rules:

```text
maximum total time: 180 seconds
maximum single test time: 20 seconds
maximum memory target: safe fraction of available RAM
skip GPU tests if backend setup is slow
skip low-bit test if backend unavailable
continue after skipped tests
write report either way
```

Example:

```json
{
  "id": "vector.matrix_multiply_medium",
  "status": "skipped_timeout",
  "duration_ms": 20000,
  "reason": "Single test exceeded light mode limit"
}
```

## Major Version Update Trigger

The benchmark package should store last benchmark state.

Example file:

```text
.spore/benchmark-state.json
```

When Galerina updates to `2.0.0` in development mode:

```text
previous major = 1
current major = 2
trigger benchmark
```

Trigger behaviour:

```text
development mode:
  prompt or auto-run depending on config

production mode:
  package disabled by default; do not auto-run even when explicitly enabled

CI mode:
  run only if explicitly configured
```

## Config Example

```Galerina
benchmark {
  default_mode "light"
  max_duration 180s
  run_on_major_update true
  allow_submit false

  targets {
    cpu true
    vector true
    gpu optional
    ai_accelerator optional
    low_bit_ai optional
    optical_io optional
  }

  privacy {
    include_hostname false
    include_username false
    include_project_path false
    anonymise_cpu_model true
  }
}
```

## Recommended Folder Structure

```text
/packages-galerina/galerina-tools-benchmark
  README.md
  TODO.md
  package.json
  tsconfig.json

  /src
    index.ts

    /cli
    /config
    /state
    /runner
    /tests
    /targets
    /scoring
    /reports
    /submit
    /compare
    /types

  /examples
    benchmark.config.spore
    benchmark-report.example.json
```

## Minimal Early Structure

First version can be much smaller:

```text
/packages-galerina/galerina-tools-benchmark
  README.md
  TODO.md

  /src
    index.ts
    run-light-benchmark.ts
    logic-benchmarks.ts
    cpu-benchmarks.ts
    json-benchmarks.ts
    vector-benchmarks.ts
    write-report.ts
    print-summary.ts
    types.ts

  /examples
    benchmark-report.example.json
```

## TODO

See `TODO.md` for the package task list.

## Final Principle

`galerina-tools-benchmark` should help Galerina developers understand compatibility and
performance across many different systems.

It should not be an extreme stress test by default.

It should be:

```text
short in light mode
fair to ordinary computers
useful on CPU-only systems
optional for GPU/low-bit systems
safe to share anonymously
clear in command-line output
detailed in JSON reports
```

Final rule:

```text
Benchmark correctness, fallback behaviour and safe execution first.
Benchmark speed second.
Encourage many computer types, not only the fastest machines.
```
