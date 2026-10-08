// Target detection, second slice: RAM bucket and vector features (TODO Phase 4,
// Grok 2026-10-06; zero-trust defaults, owner may revisit).
//
// Closes the tools-benchmark TODO rows "Detect RAM bucket" and "Detect vector
// features where possible". Grounded in README "Privacy And Sharing" (RAM size
// bucket, "RAM: 8GB / 16GB / 32GB / 64GB+"), the report `system.memoryBucket`
// field, and README "CPU Vector Benchmarks" (SSE / AVX / AVX2 / AVX-512 on x86,
// NEON / SVE on ARM, generic scalar fallback).
//
// Same rules as detectBenchmarkSystem (src/index.ts):
//  - Pure and injectable. The host supplies raw facts (for example
//    `os.totalmem()`, `process.arch`, the flag list it read from
//    /proc/cpuinfo, and the result of `WebAssembly.validate` over
//    `wasmSimd128ProbeBytes()`). This module reads no OS, file, environment or
//    network state, and the package border stays `node:util/types` only.
//  - Output is a closed vocabulary or a coarse bucket, never a raw probe value:
//    no exact byte count, no unrecognised CPU flag and no CPU model string can
//    pass through.
//  - Fail-closed: a non-record probe, an accessor, an unknown key or a value
//    outside its domain yields "unknown" / no feature plus a diagnostic.
//    Unknown probe keys are refused unread.
//
// Non-claims:
//  - Detected vector features are host-reported hints. The package's vector
//    cases stay scalar Float32 (`benchmarkVectorBackend` is always "scalar");
//    nothing here selects or runs a SIMD kernel.
//  - GPU, AI-accelerator and low-bit backend detection are not here (owner hold
//    O1 keeps GPU / AI-accelerator targets parked post-v1).

import { isProxy } from "node:util/types";

export type TargetDetectionSeverity = "warning" | "error";

/** Same wire shape as the package's BenchmarkDiagnostic. */
export interface TargetDetectionDiagnostic {
  readonly code: string;
  readonly severity: TargetDetectionSeverity;
  readonly message: string;
  readonly path?: string;
}

const diag = (code: string, severity: TargetDetectionSeverity, message: string, path: string): TargetDetectionDiagnostic =>
  Object.freeze({ code, severity, message, path });

type Snapshot =
  | { readonly ok: true; readonly values: ReadonlyMap<string, unknown> }
  | { readonly ok: false };

/**
 * Read an inert plain record. Unknown keys are reported and never read;
 * accessors are reported and never invoked.
 */
function snapshotProbe(
  probe: unknown,
  allowedKeys: readonly string[],
  diagnostics: TargetDetectionDiagnostic[],
): Snapshot {
  let plain = false;
  try {
    plain = typeof probe === "object"
      && probe !== null
      && !Array.isArray(probe)
      && !isProxy(probe)
      && Object.getPrototypeOf(probe) === Object.prototype;
  } catch {
    plain = false;
  }
  if (!plain) {
    diagnostics.push(diag(
      "Galerina_BENCHMARK_PROBE_RECORD_REQUIRED",
      "warning",
      "Benchmark target probe must be a plain data record; fields reported as unknown.",
      "probe",
    ));
    return { ok: false };
  }
  const allowed = new Set(allowedKeys);
  const values = new Map<string, unknown>();
  const record = probe as object;
  for (const key of Reflect.ownKeys(record)) {
    if (typeof key !== "string" || !allowed.has(key)) {
      diagnostics.push(diag(
        "Galerina_BENCHMARK_PROBE_FIELD_UNKNOWN",
        "warning",
        "Benchmark target probe contains an unknown or symbolic field; it was ignored unread.",
        "probe.<unknown>",
      ));
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (descriptor === undefined) continue;
    if (!("value" in descriptor)) {
      diagnostics.push(diag(
        "Galerina_BENCHMARK_FIELD_HOSTILE",
        "error",
        "Benchmark records must contain inert data properties, not accessors.",
        `probe.${key}`,
      ));
      continue;
    }
    values.set(key, descriptor.value);
  }
  return { ok: true, values };
}

// -- RAM bucket ---------------------------------------------------------------

/** Closed RAM buckets (README "RAM: 8GB / 16GB / 32GB / 64GB+", plus a floor bucket). */
export const BENCHMARK_MEMORY_BUCKETS = Object.freeze(["<8GB", "8GB", "16GB", "32GB", "64GB+"] as const);

export type BenchmarkMemoryBucket = (typeof BENCHMARK_MEMORY_BUCKETS)[number] | "unknown";

export const BENCHMARK_MEMORY_PROBE_FIELDS = Object.freeze(["totalMemoryBytes"] as const);

const GIB = 1024 * 1024 * 1024;

/**
 * Tolerance (OWNER-REVISIT pick): a nominal N GiB bucket is reached at 7/8 of
 * N GiB, because firmware, integrated-GPU and kernel reservations make
 * `os.totalmem()` report less than the installed size (a 16 GB laptop often
 * reports 14-15.6 GiB). Thresholds are exact integers: N * 7/8 GiB.
 */
const MEMORY_BUCKET_THRESHOLDS: readonly (readonly [Exclude<BenchmarkMemoryBucket, "unknown" | "<8GB">, number])[] = Object.freeze([
  Object.freeze(["64GB+", 64 * 7 * (GIB / 8)] as const),
  Object.freeze(["32GB", 32 * 7 * (GIB / 8)] as const),
  Object.freeze(["16GB", 16 * 7 * (GIB / 8)] as const),
  Object.freeze(["8GB", 8 * 7 * (GIB / 8)] as const),
]);

/** Smallest admitted total: 64 MiB. Anything lower is treated as a bad probe, not a tiny machine. */
export const MIN_BENCHMARK_TOTAL_MEMORY_BYTES = 64 * 1024 * 1024;

/**
 * Map a total-memory byte count (e.g. `os.totalmem()`) to a coarse bucket.
 * Exposes only the bucket, never the exact size. Non-numbers, non-safe
 * integers and values under 64 MiB give "unknown".
 */
export function bucketTotalMemory(totalBytes: unknown): BenchmarkMemoryBucket {
  if (typeof totalBytes !== "number" || !Number.isSafeInteger(totalBytes) || totalBytes < MIN_BENCHMARK_TOTAL_MEMORY_BYTES) {
    return "unknown";
  }
  for (const [bucket, threshold] of MEMORY_BUCKET_THRESHOLDS) {
    if (totalBytes >= threshold) return bucket;
  }
  return "<8GB";
}

export interface BenchmarkMemoryProbe {
  /** Total physical memory in bytes, e.g. `os.totalmem()`. */
  readonly totalMemoryBytes?: unknown;
}

export interface BenchmarkMemoryDetection {
  readonly memoryBucket: BenchmarkMemoryBucket;
  readonly diagnostics: readonly TargetDetectionDiagnostic[];
}

/** Map an injected memory fact to the report-safe `memoryBucket`. Never echoes the byte count. */
export function detectBenchmarkMemory(probe: unknown): BenchmarkMemoryDetection {
  const diagnostics: TargetDetectionDiagnostic[] = [];
  const snapshot = snapshotProbe(probe, BENCHMARK_MEMORY_PROBE_FIELDS, diagnostics);
  const memoryBucket = snapshot.ok ? bucketTotalMemory(snapshot.values.get("totalMemoryBytes")) : "unknown";
  if (memoryBucket === "unknown") {
    diagnostics.push(diag(
      "Galerina_BENCHMARK_PROBE_MEMORY_UNKNOWN",
      "warning",
      "Total memory must be a safe integer byte count of at least 64 MiB.",
      "probe.totalMemoryBytes",
    ));
  }
  return Object.freeze({ memoryBucket, diagnostics: Object.freeze(diagnostics) });
}

// -- vector features ------------------------------------------------------------

/** Closed vector feature vocabulary, in canonical report order. */
export const BENCHMARK_VECTOR_FEATURES = Object.freeze([
  "sse", "sse2", "sse3", "ssse3", "sse4_1", "sse4_2", "avx", "avx2", "avx512f",
  "neon", "sve", "sve2",
  "wasm_simd128",
] as const);

export type BenchmarkVectorFeature = (typeof BENCHMARK_VECTOR_FEATURES)[number];

/** Best detected vector family (closed). "scalar" when nothing is detected. */
export type BenchmarkVectorBackend = "avx512" | "avx2" | "avx" | "sse" | "sve2" | "sve" | "neon" | "scalar";

export const BENCHMARK_VECTOR_PROBE_FIELDS = Object.freeze(["arch", "cpuFlags", "wasmSimd128"] as const);

/** At most this many host flags are inspected; a longer list is refused whole. */
export const MAX_BENCHMARK_CPU_FLAGS = 1024;
const MAX_CPU_FLAG_LENGTH = 64;
const CPU_FLAG_PATTERN = /^[a-z0-9_.]+$/;

type IsaFamily = "x86" | "arm";

const ISA_BY_ARCH: ReadonlyMap<string, IsaFamily> = new Map([
  ["x64", "x86"],
  ["ia32", "x86"],
  ["arm64", "arm"],
  ["arm", "arm"],
]);

/**
 * Host flag spellings admitted (Linux /proc/cpuinfo `flags` / `Features`
 * names). `pni` is the cpuinfo name for SSE3; `asimd` is AArch64 Advanced SIMD
 * (NEON); 32-bit ARM reports `neon`. Any other flag is ignored and never echoed.
 */
const FEATURE_BY_FLAG: ReadonlyMap<string, readonly [IsaFamily, BenchmarkVectorFeature]> = new Map([
  ["sse", ["x86", "sse"]],
  ["sse2", ["x86", "sse2"]],
  ["pni", ["x86", "sse3"]],
  ["sse3", ["x86", "sse3"]],
  ["ssse3", ["x86", "ssse3"]],
  ["sse4_1", ["x86", "sse4_1"]],
  ["sse4_2", ["x86", "sse4_2"]],
  ["avx", ["x86", "avx"]],
  ["avx2", ["x86", "avx2"]],
  ["avx512f", ["x86", "avx512f"]],
  ["asimd", ["arm", "neon"]],
  ["neon", ["arm", "neon"]],
  ["sve", ["arm", "sve"]],
  ["sve2", ["arm", "sve2"]],
] as const);

/**
 * Architectural baselines: x86-64 always has SSE and SSE2; AArch64 always has
 * Advanced SIMD (NEON). 32-bit x86 and ARM have no vector baseline.
 */
const BASELINE_BY_ARCH: ReadonlyMap<string, readonly BenchmarkVectorFeature[]> = new Map<string, readonly BenchmarkVectorFeature[]>([
  ["x64", Object.freeze<BenchmarkVectorFeature[]>(["sse", "sse2"])],
  ["arm64", Object.freeze<BenchmarkVectorFeature[]>(["neon"])],
]);

const BACKEND_PRIORITY: readonly (readonly [BenchmarkVectorFeature, BenchmarkVectorBackend])[] = Object.freeze([
  ["avx512f", "avx512"],
  ["avx2", "avx2"],
  ["avx", "avx"],
  ["sse4_2", "sse"],
  ["sse4_1", "sse"],
  ["ssse3", "sse"],
  ["sse3", "sse"],
  ["sse2", "sse"],
  ["sse", "sse"],
  ["sve2", "sve2"],
  ["sve", "sve"],
  ["neon", "neon"],
] as const);

export interface BenchmarkVectorProbe {
  /** A Node.js `process.arch` value. */
  readonly arch?: unknown;
  /** CPU flag names the host read (e.g. /proc/cpuinfo); a dense array of short lowercase tokens. */
  readonly cpuFlags?: unknown;
  /** `WebAssembly.validate(wasmSimd128ProbeBytes())` as computed by the host. */
  readonly wasmSimd128?: unknown;
}

export interface BenchmarkVectorDetection {
  readonly vectorFeatures: readonly BenchmarkVectorFeature[];
  readonly bestVectorBackend: BenchmarkVectorBackend;
  /** What the package's vector cases actually run today. Always "scalar". */
  readonly benchmarkVectorBackend: "scalar";
  readonly diagnostics: readonly TargetDetectionDiagnostic[];
}

/** Read a dense, inert array of flag strings. Returns undefined (refused) on any hostile shape. */
function readCpuFlags(value: unknown, diagnostics: TargetDetectionDiagnostic[]): readonly string[] | undefined {
  const refuse = (): undefined => {
    diagnostics.push(diag(
      "Galerina_BENCHMARK_PROBE_VECTOR_FLAGS_INVALID",
      "warning",
      "CPU flags must be a dense array of at most 1024 short lowercase tokens; flags ignored.",
      "probe.cpuFlags",
    ));
    return undefined;
  };
  try {
    if (!Array.isArray(value) || isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype) return refuse();
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    const length: unknown = lengthDescriptor?.value;
    if (typeof length !== "number" || length > MAX_BENCHMARK_CPU_FLAGS) return refuse();
    const flags: string[] = [];
    let malformed = false;
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (descriptor === undefined || !("value" in descriptor)) return refuse();
      const flag: unknown = descriptor.value;
      if (typeof flag !== "string" || flag.length === 0 || flag.length > MAX_CPU_FLAG_LENGTH || !CPU_FLAG_PATTERN.test(flag)) {
        malformed = true;
        continue;
      }
      flags.push(flag);
    }
    if (malformed) {
      diagnostics.push(diag(
        "Galerina_BENCHMARK_PROBE_VECTOR_FLAG_MALFORMED",
        "warning",
        "One or more CPU flags were not short lowercase tokens; they were ignored.",
        "probe.cpuFlags",
      ));
    }
    return flags;
  } catch {
    return refuse();
  }
}

/**
 * Map injected CPU facts to a closed vector feature set. Fail-closed: without
 * a recognised architecture no ISA feature is reported; flags that belong to a
 * different ISA than `arch` are ignored with a warning.
 */
export function detectBenchmarkVectorFeatures(probe: unknown): BenchmarkVectorDetection {
  const diagnostics: TargetDetectionDiagnostic[] = [];
  const snapshot = snapshotProbe(probe, BENCHMARK_VECTOR_PROBE_FIELDS, diagnostics);
  const found = new Set<BenchmarkVectorFeature>();

  if (snapshot.ok) {
    const arch = snapshot.values.get("arch");
    const isa = typeof arch === "string" ? ISA_BY_ARCH.get(arch) : undefined;
    if (isa === undefined) {
      diagnostics.push(diag(
        "Galerina_BENCHMARK_PROBE_VECTOR_ARCH_UNKNOWN",
        "warning",
        "CPU architecture is not a recognised vector ISA; no CPU vector feature is reported.",
        "probe.arch",
      ));
    } else {
      for (const feature of BASELINE_BY_ARCH.get(arch as string) ?? []) found.add(feature);
    }

    if (snapshot.values.has("cpuFlags")) {
      const flags = readCpuFlags(snapshot.values.get("cpuFlags"), diagnostics);
      let mismatch = false;
      for (const flag of flags ?? []) {
        const mapped = FEATURE_BY_FLAG.get(flag);
        if (mapped === undefined) continue;
        if (isa === undefined || mapped[0] !== isa) {
          mismatch = true;
          continue;
        }
        found.add(mapped[1]);
      }
      if (mismatch && isa !== undefined) {
        diagnostics.push(diag(
          "Galerina_BENCHMARK_PROBE_VECTOR_FLAGS_ARCH_MISMATCH",
          "warning",
          "CPU flags for a different instruction set than the reported architecture were ignored.",
          "probe.cpuFlags",
        ));
      }
    }

    if (snapshot.values.has("wasmSimd128")) {
      const wasmSimd128 = snapshot.values.get("wasmSimd128");
      if (wasmSimd128 === true) {
        found.add("wasm_simd128");
      } else if (wasmSimd128 !== false) {
        diagnostics.push(diag(
          "Galerina_BENCHMARK_PROBE_WASM_SIMD_INVALID",
          "warning",
          "wasmSimd128 must be a boolean; WebAssembly SIMD reported as absent.",
          "probe.wasmSimd128",
        ));
      }
    }
  }

  const vectorFeatures = BENCHMARK_VECTOR_FEATURES.filter((feature) => found.has(feature));
  let bestVectorBackend: BenchmarkVectorBackend = "scalar";
  for (const [feature, backend] of BACKEND_PRIORITY) {
    if (found.has(feature)) {
      bestVectorBackend = backend;
      break;
    }
  }

  return Object.freeze({
    vectorFeatures: Object.freeze(vectorFeatures),
    bestVectorBackend,
    benchmarkVectorBackend: "scalar" as const,
    diagnostics: Object.freeze(diagnostics),
  });
}

/**
 * A minimal WebAssembly module whose only function returns a `v128.const`.
 * `WebAssembly.validate(bytes)` is true exactly when the engine accepts SIMD128.
 * Returns a fresh copy each call so callers cannot mutate a shared probe.
 */
export function wasmSimd128ProbeBytes(): Uint8Array {
  return Uint8Array.from([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, // magic, version 1
    0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b, // type: () -> v128
    0x03, 0x02, 0x01, 0x00, // function 0 uses type 0
    0x0a, 0x16, 0x01, 0x14, 0x00, // code: 1 body, 20 bytes, no locals
    0xfd, 0x0c, // v128.const
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x0b, // end
  ]);
}
