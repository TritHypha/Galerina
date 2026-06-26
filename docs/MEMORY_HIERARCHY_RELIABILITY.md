# Memory Hierarchy and Reliability

Galerina should be memory-hierarchy aware, but it must be honest about what a
language can and cannot control.

Galerina should not claim:

```text
Galerina directly controls L2 cache, L3 cache or ECC memory.
```

Better:

```text
Galerina can optimise for CPU cache behaviour.
Galerina can make memory layout and copying visible.
Galerina can detect/report cache and ECC facts where the OS, runtime or hardware exposes them.
Galerina can warn when code is likely to cause poor cache use or unsafe memory reliability assumptions.
```

CPU caches are managed by the CPU and platform. Application code can influence
cache behaviour through data layout, access patterns, batching, copying and
vectorisation, but it does not directly command L1/L2/L3 cache. ECC is also a
deployment property. Galerina cannot turn ECC on if the CPU, motherboard, firmware
and memory modules do not support it.

## Two Separate Concepts

Galerina should split this into two design areas:

```text
1. Cache-aware performance
2. ECC-aware reliability
```

Cache awareness is about helping code work with the CPU memory hierarchy.
ECC awareness is about verifying and reporting whether the deployment
environment satisfies high-integrity memory requirements.

## Cache-Aware Performance

Galerina can support a cache-aware memory model by making data movement and layout
visible to the compiler, IDE and reports.

Goals:

```text
less random memory access
fewer hidden copies
better locality
better batching
better vectorisation
fewer cache misses
fewer memory stalls
```

Galerina should prefer predictable layouts for performance-critical data, such as:

```text
array<UserScore>
```

rather than pointer-heavy object chains:

```text
UserScore object -> pointer -> nested object -> pointer -> value
```

This does not make Galerina automatically faster than mature optimized runtimes. It makes the
performance risks visible and gives developers safer defaults and reports.

## Cache-Aware Features

Galerina could support:

```text
contiguous arrays
fixed-size buffers
read-only memory views
copy-on-write for large values
explicit clone() for expensive copies
hot/cold data separation
cache-line alignment hints
batch processing
chunked processing
streaming data processing
structure-of-arrays layout
array-of-structures layout
false-sharing warnings
large-object copy warnings
memory-layout reports
```

## Layout Examples

For gaming, simulation, AI preprocessing or large JSON processing, Galerina could
allow layout choices:

```Galerina
type Position {
  x: Float32
  y: Float32
  z: Float32
}

memory layout PositionBuffer {
  mode: contiguous
  align: cacheLine
  target: cpu.cache
}
```

For high-performance array processing:

```Galerina
type Particle {
  position: Vec3<Float32>
  velocity: Vec3<Float32>
  mass: Float32
}

memory layout ParticleSystem {
  layout: structureOfArrays
  batchSize: auto
  cacheTarget: L2
}
```

Compiler or IDE warning:

```text
GALERINA-CACHE-002
ParticleSystem is updated every frame, but uses scattered object references.

Suggested layout:
structureOfArrays or contiguous array.
```

## Cache Reports

Galerina could generate:

```text
app.memory-report.json
app.cache-report.json
app.performance-report.json
```

Example:

```json
{
  "cache": {
    "cacheLineSizeBytes": 64,
    "l1DataCacheKb": 48,
    "l2CacheKb": 2048,
    "l3CacheKb": 32768,
    "detected": true,
    "warnings": [
      {
        "file": "physics.spore",
        "line": 42,
        "message": "Large object copied inside hot loop."
      },
      {
        "file": "entities.spore",
        "line": 88,
        "message": "Pointer-heavy entity layout may reduce cache locality."
      }
    ]
  }
}
```

When hardware facts are unavailable:

```json
{
  "cache": {
    "detected": false,
    "reason": "Cache details not exposed by current runtime/container."
  }
}
```

This is important for cloud platforms, containers, virtual machines and managed
hosting where hardware details may be hidden or unreliable.

## IDE Warnings

Cache awareness should be visible in developer tooling.

Example warnings:

```text
This loop scans 4 million records.
Current layout may cause poor cache locality.
Suggested fix: use contiguous array or stream batches.
```

```text
This function copies a 250 MB JSON object.
Use read-only view, stream, or explicit clone().
```

This is a strong Galerina direction because many developers can benefit from
cache guidance without needing to manually inspect CPU-level behaviour.

## ECC-Aware Reliability

ECC should be treated as a deployment reliability property, not a language
feature that Galerina can guarantee in software.

Galerina could support reliability policy:

```Galerina
reliability {
  requireEccMemory true
  failIfEccUnknown true
  reportCorrectedErrors true
}
```

If the environment exposes ECC information, Galerina could include it in:

```text
app.hardware-report.json
app.reliability-report.json
app.memory-report.json
```

Example:

```json
{
  "memoryReliability": {
    "eccRequired": true,
    "eccDetected": true,
    "correctedErrors": 0,
    "uncorrectedErrors": 0,
    "status": "ok"
  }
}
```

If Galerina cannot confirm ECC:

```json
{
  "memoryReliability": {
    "eccRequired": true,
    "eccDetected": "unknown",
    "status": "blocked",
    "reason": "ECC status could not be verified on this platform."
  }
}
```

## Where ECC Matters

ECC-aware deployment policy is useful for:

```text
financial systems
legal/compliance systems
medical systems
scientific computing
AI model training/inference
large data processing
database-style workloads
long-running servers
high-reliability cloud deployments
```

For normal desktop apps or simple scripts, ECC should usually be optional. For
high-integrity Galerina apps, it can be required by deployment policy.

## Package Ownership

Suggested ownership:

```text
galerina-core
  memory model vocabulary: ownership, borrowing, clone, views, layout hints

galerina-core-compiler
  hot-loop analysis, large-copy warnings, layout diagnostics

galerina-core-runtime
  runtime memory reports and hardware fact collection where available

galerina-core-reports
  shared cache, memory and reliability report schemas

galerina-target-cpu
  CPU capability and cache fact detection contracts

galerina-cpu-kernels
  cache-aware kernel tiling/block-size contracts
```

## Galerina Memory Model v2

This belongs in a future `Galerina Memory Model v2` planning area:

```text
safe memory
bounded memory
cache-aware memory
streaming memory
accelerator memory
ECC-aware reliability
hardware reports
IDE warnings
```

## Design Rule

```text
Galerina does not control CPU cache or ECC hardware directly.
Galerina makes memory behaviour visible, typed, reportable and optimisable.
Galerina treats L2/L3 cache as an optimisation target.
Galerina treats ECC as a reliability property of the deployment environment.
```

## References

- Intel cache hierarchy and Cache Allocation Technology white paper:
  <https://www.intel.com/content/dam/www/public/us/en/documents/white-papers/cache-allocation-technology-white-paper.pdf>
- MemTest86 ECC technical details:
  <https://www.memtest86.com/ecc.htm>
