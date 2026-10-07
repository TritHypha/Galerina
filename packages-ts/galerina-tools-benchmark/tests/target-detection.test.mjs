import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  BENCHMARK_MEMORY_BUCKETS,
  BENCHMARK_VECTOR_FEATURES,
  MAX_BENCHMARK_CPU_FLAGS,
  bucketTotalMemory,
  createShareableBenchmarkReport,
  detectBenchmarkMemory,
  detectBenchmarkSystem,
  detectBenchmarkVectorFeatures,
  validateBenchmarkReport,
  wasmSimd128ProbeBytes,
} from "../dist/index.js";

const codes = (diags) => diags.map((d) => d.code);
const GIB = 1024 ** 3;

describe("bucketTotalMemory / detectBenchmarkMemory - RAM bucket", () => {
  it("maps byte counts to the README buckets with a 7/8 tolerance", () => {
    const cases = [
      [64 * 1024 * 1024, "<8GB"],
      [4 * GIB, "<8GB"],
      [7 * GIB - 1, "<8GB"],
      [7 * GIB, "8GB"],
      [8 * GIB, "8GB"],
      [12 * GIB, "8GB"],
      [14 * GIB - 1, "8GB"],
      [14 * GIB, "16GB"],
      [15.6 * GIB, "16GB"],
      [16 * GIB, "16GB"],
      [28 * GIB, "32GB"],
      [48 * GIB, "32GB"],
      [56 * GIB - 1, "32GB"],
      [56 * GIB, "64GB+"],
      [512 * GIB, "64GB+"],
      [Number.MAX_SAFE_INTEGER, "64GB+"],
    ];
    for (const [bytes, bucket] of cases) assert.equal(bucketTotalMemory(Math.floor(bytes)), bucket, `bytes ${bytes}`);
  });

  it("returns unknown for bad input and never a raw size", () => {
    for (const bad of [0, -1, 1, 64 * 1024 * 1024 - 1, 1.5 * GIB + 0.5, NaN, Infinity, 2 ** 53, "16GB", 16n * 1024n ** 3n, null, undefined, {}]) {
      assert.equal(bucketTotalMemory(bad), "unknown");
    }
    assert.deepEqual([...BENCHMARK_MEMORY_BUCKETS], ["<8GB", "8GB", "16GB", "32GB", "64GB+"]);
    assert.ok(Object.isFrozen(BENCHMARK_MEMORY_BUCKETS));
  });

  it("detects from a closed probe and never echoes the byte count", () => {
    const bytes = 17_179_869_184 + 12_345;
    const result = detectBenchmarkMemory({ totalMemoryBytes: bytes });
    assert.equal(result.memoryBucket, "16GB");
    assert.deepEqual(codes(result.diagnostics), []);
    assert.ok(!JSON.stringify(result).includes(String(bytes)));
    assert.ok(Object.isFrozen(result) && Object.isFrozen(result.diagnostics));
  });

  it("fails closed on hostile or unknown probe fields", () => {
    let touched = false;
    const probe = { totalMemoryBytes: 8 * GIB, hostname: "alice-pc" };
    Object.defineProperty(probe, "freeMemory", { enumerable: true, get() { touched = true; return 1; } });
    const result = detectBenchmarkMemory(probe);
    assert.equal(touched, false);
    assert.equal(result.memoryBucket, "8GB");
    assert.equal(codes(result.diagnostics).filter((c) => c === "Galerina_BENCHMARK_PROBE_FIELD_UNKNOWN").length, 2);
    assert.ok(!JSON.stringify(result).includes("alice-pc"));

    let read = false;
    const accessor = {};
    Object.defineProperty(accessor, "totalMemoryBytes", { enumerable: true, get() { read = true; return 16 * GIB; } });
    const accessorResult = detectBenchmarkMemory(accessor);
    assert.equal(read, false);
    assert.equal(accessorResult.memoryBucket, "unknown");
    assert.deepEqual(codes(accessorResult.diagnostics), ["Galerina_BENCHMARK_FIELD_HOSTILE", "Galerina_BENCHMARK_PROBE_MEMORY_UNKNOWN"]);

    for (const bad of [null, undefined, 16 * GIB, [16 * GIB], new Proxy({ totalMemoryBytes: 16 * GIB }, {}), Object.create({ totalMemoryBytes: 16 * GIB })]) {
      const r = detectBenchmarkMemory(bad);
      assert.equal(r.memoryBucket, "unknown");
      assert.deepEqual(codes(r.diagnostics), ["Galerina_BENCHMARK_PROBE_RECORD_REQUIRED", "Galerina_BENCHMARK_PROBE_MEMORY_UNKNOWN"]);
    }
    assert.deepEqual(codes(detectBenchmarkMemory({}).diagnostics), ["Galerina_BENCHMARK_PROBE_MEMORY_UNKNOWN"]);
  });

  it("leaves detectBenchmarkSystem's closed probe unchanged", () => {
    const result = detectBenchmarkSystem({ platform: "linux", arch: "x64", logicalCores: 4, totalMemoryBytes: 16 * GIB });
    assert.equal("memoryBucket" in result, false);
    assert.ok(codes(result.diagnostics).includes("Galerina_BENCHMARK_PROBE_FIELD_UNKNOWN"));
  });
});

describe("detectBenchmarkVectorFeatures - vector features where possible", () => {
  it("reports architectural baselines without any flags", () => {
    const x64 = detectBenchmarkVectorFeatures({ arch: "x64" });
    assert.deepEqual([...x64.vectorFeatures], ["sse", "sse2"]);
    assert.equal(x64.bestVectorBackend, "sse");
    const arm64 = detectBenchmarkVectorFeatures({ arch: "arm64" });
    assert.deepEqual([...arm64.vectorFeatures], ["neon"]);
    assert.equal(arm64.bestVectorBackend, "neon");
    for (const arch of ["ia32", "arm"]) {
      const r = detectBenchmarkVectorFeatures({ arch });
      assert.deepEqual([...r.vectorFeatures], []);
      assert.equal(r.bestVectorBackend, "scalar");
      assert.deepEqual(codes(r.diagnostics), []);
    }
  });

  it("maps Linux cpuinfo flag spellings to the closed vocabulary in canonical order", () => {
    const x86Flags = ["fpu", "vme", "avx2", "pni", "ssse3", "sse4_1", "sse4_2", "avx", "fma", "avx512f", "avx512bw", "aes"];
    const x86 = detectBenchmarkVectorFeatures({ arch: "x64", cpuFlags: x86Flags, wasmSimd128: true });
    assert.deepEqual([...x86.vectorFeatures], ["sse", "sse2", "sse3", "ssse3", "sse4_1", "sse4_2", "avx", "avx2", "avx512f", "wasm_simd128"]);
    assert.equal(x86.bestVectorBackend, "avx512");
    assert.equal(x86.benchmarkVectorBackend, "scalar");
    assert.deepEqual(codes(x86.diagnostics), []);

    const arm = detectBenchmarkVectorFeatures({ arch: "arm64", cpuFlags: ["fp", "asimd", "evtstrm", "aes", "sve", "sve2"] });
    assert.deepEqual([...arm.vectorFeatures], ["neon", "sve", "sve2"]);
    assert.equal(arm.bestVectorBackend, "sve2");

    const arm32 = detectBenchmarkVectorFeatures({ arch: "arm", cpuFlags: ["half", "thumb", "neon", "vfpv4"] });
    assert.deepEqual([...arm32.vectorFeatures], ["neon"]);

    const avx2Only = detectBenchmarkVectorFeatures({ arch: "x64", cpuFlags: ["avx", "avx2"] });
    assert.equal(avx2Only.bestVectorBackend, "avx2");
  });

  it("never echoes unrecognised flags or raw strings", () => {
    const r = detectBenchmarkVectorFeatures({ arch: "x64", cpuFlags: ["avx2", "hypervisor", "alice_secret_flag"] });
    const s = JSON.stringify(r);
    assert.ok(!s.includes("hypervisor") && !s.includes("alice_secret_flag"));
    for (const f of r.vectorFeatures) assert.ok(BENCHMARK_VECTOR_FEATURES.includes(f));
  });

  it("ignores flags from a different ISA than the reported architecture", () => {
    const r = detectBenchmarkVectorFeatures({ arch: "arm64", cpuFlags: ["avx2", "asimd"] });
    assert.deepEqual([...r.vectorFeatures], ["neon"]);
    assert.deepEqual(codes(r.diagnostics), ["Galerina_BENCHMARK_PROBE_VECTOR_FLAGS_ARCH_MISMATCH"]);
  });

  it("reports no CPU feature without a recognised architecture (fail-closed)", () => {
    for (const arch of [undefined, "riscv64", "Intel(R) Core(TM)", 42]) {
      const probe = arch === undefined ? { cpuFlags: ["avx2"], wasmSimd128: true } : { arch, cpuFlags: ["avx2"], wasmSimd128: true };
      const r = detectBenchmarkVectorFeatures(probe);
      assert.deepEqual([...r.vectorFeatures], ["wasm_simd128"]);
      assert.equal(r.bestVectorBackend, "scalar");
      assert.ok(codes(r.diagnostics).includes("Galerina_BENCHMARK_PROBE_VECTOR_ARCH_UNKNOWN"));
      assert.ok(!JSON.stringify(r).includes("Intel"));
    }
  });

  it("refuses hostile flag lists whole and skips malformed entries", () => {
    let read = false;
    const getterArray = ["avx2"];
    Object.defineProperty(getterArray, 1, { enumerable: true, get() { read = true; return "avx512f"; } });
    const hostileLists = [
      "avx2 avx512f",
      { 0: "avx2", length: 1 },
      new Proxy(["avx2"], {}),
      getterArray,
      Array.from({ length: MAX_BENCHMARK_CPU_FLAGS + 1 }, () => "avx2"),
      // eslint-disable-next-line no-sparse-arrays
      ["avx2", , "avx512f"],
    ];
    for (const cpuFlags of hostileLists) {
      const r = detectBenchmarkVectorFeatures({ arch: "x64", cpuFlags });
      assert.deepEqual([...r.vectorFeatures], ["sse", "sse2"]);
      assert.deepEqual(codes(r.diagnostics), ["Galerina_BENCHMARK_PROBE_VECTOR_FLAGS_INVALID"]);
    }
    assert.equal(read, false);

    const malformed = detectBenchmarkVectorFeatures({ arch: "x64", cpuFlags: ["AVX2", "avx2 ", "", "x".repeat(65), 7, "avx"] });
    assert.deepEqual([...malformed.vectorFeatures], ["sse", "sse2", "avx"]);
    assert.deepEqual(codes(malformed.diagnostics), ["Galerina_BENCHMARK_PROBE_VECTOR_FLAG_MALFORMED"]);
  });

  it("admits wasmSimd128 only as a literal boolean", () => {
    assert.deepEqual([...detectBenchmarkVectorFeatures({ arch: "ia32", wasmSimd128: false }).vectorFeatures], []);
    for (const bad of ["true", 1, null, {}]) {
      const r = detectBenchmarkVectorFeatures({ arch: "ia32", wasmSimd128: bad });
      assert.deepEqual([...r.vectorFeatures], []);
      assert.deepEqual(codes(r.diagnostics), ["Galerina_BENCHMARK_PROBE_WASM_SIMD_INVALID"]);
    }
  });

  it("fails closed on non-record probes, accessors and unknown keys", () => {
    for (const bad of [null, undefined, "x64", [], new Proxy({ arch: "x64" }, {}), Object.create({ arch: "x64" })]) {
      const r = detectBenchmarkVectorFeatures(bad);
      assert.deepEqual([...r.vectorFeatures], []);
      assert.equal(r.bestVectorBackend, "scalar");
      assert.deepEqual(codes(r.diagnostics), ["Galerina_BENCHMARK_PROBE_RECORD_REQUIRED"]);
    }
    let read = false;
    const accessor = { cpuModel: "secret" };
    Object.defineProperty(accessor, "arch", { enumerable: true, get() { read = true; return "x64"; } });
    const r = detectBenchmarkVectorFeatures(accessor);
    assert.equal(read, false);
    assert.deepEqual([...r.vectorFeatures], []);
    assert.deepEqual(codes(r.diagnostics), ["Galerina_BENCHMARK_PROBE_FIELD_UNKNOWN", "Galerina_BENCHMARK_FIELD_HOSTILE", "Galerina_BENCHMARK_PROBE_VECTOR_ARCH_UNKNOWN"]);
    assert.ok(Object.isFrozen(r) && Object.isFrozen(r.vectorFeatures) && Object.isFrozen(r.diagnostics));
  });
});

describe("wasmSimd128ProbeBytes", () => {
  it("validates on this engine and a corrupted copy does not", () => {
    const bytes = wasmSimd128ProbeBytes();
    assert.equal(WebAssembly.validate(bytes), true, "node:20 V8 ships SIMD128");
    const corrupted = wasmSimd128ProbeBytes();
    corrupted[corrupted.length - 18] = 0xff; // break the v128.const opcode
    assert.equal(WebAssembly.validate(corrupted), false);
    bytes[0] = 0x42;
    assert.equal(wasmSimd128ProbeBytes()[0], 0x00, "each call returns a fresh copy");
  });
});

describe("detected fields inside a benchmark report", () => {
  it("validate in a report and survive the shareable rebuild", () => {
    const memory = detectBenchmarkMemory({ totalMemoryBytes: 16 * GIB });
    const report = {
      schema: "Galerina.benchmark.report.v1",
      benchmarkId: "bench_detect",
      mode: "light",
      trigger: "manual",
      loVersion: "2.0.0",
      system: {
        osFamily: "linux",
        architecture: "x64",
        cpuCoresBucket: "8",
        memoryBucket: memory.memoryBucket,
        gpuBackend: "none",
        lowBitBackend: "none",
      },
      durationMs: 1,
      summary: {
        logic: "skipped", cpu: "skipped", json: "skipped", vector: "skipped", gpu: "skipped",
        ai_accelerator: "skipped", low_bit_ai: "skipped", optical_io: "skipped", recovery: "skipped", compare: "skipped",
      },
      scores: { overall: 0 },
      tests: [],
      privacy: {
        shareable: false, containsPersonalData: false, machineId: "not_included",
        hostname: "not_included", username: "not_included", projectPath: "not_included",
      },
    };
    assert.deepEqual(codes(validateBenchmarkReport(report)), []);
    for (const bucket of BENCHMARK_MEMORY_BUCKETS) {
      assert.deepEqual(codes(validateBenchmarkReport({ ...report, system: { ...report.system, memoryBucket: bucket } })), []);
    }
    const shared = createShareableBenchmarkReport(report, { privacy: { allowSubmit: false } });
    assert.notEqual(shared.status, "REFUSED");
    assert.equal(shared.report.system.memoryBucket, "16GB");
  });

  it("module source reads no OS, file, environment or network state", () => {
    const raw = readFileSync(new URL("../src/target-detection.ts", import.meta.url), "utf8");
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const imports = [...src.matchAll(/^import .* from "([^"]+)";$/gm)].map((m) => m[1]);
    assert.deepEqual(imports, ["node:util/types"]);
    for (const banned of ["process.", "require(", "node:os", "node:fs", "fetch(", "globalThis", "WebAssembly."]) {
      assert.equal(src.includes(banned), false, `source must not contain ${banned}`);
    }
  });
});
