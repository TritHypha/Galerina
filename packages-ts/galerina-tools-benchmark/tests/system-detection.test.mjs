import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { bucketLogicalCores, detectBenchmarkSystem, validateBenchmarkReport } from "../dist/index.js";

const codes = (diags) => diags.map((d) => d.code);

describe("detectBenchmarkSystem — OS family, architecture, core bucket", () => {
  it("maps known Node platform/arch values to the closed vocabulary", () => {
    const cases = [
      [{ platform: "linux", arch: "arm64", logicalCores: 8 }, ["linux", "arm64", "8"]],
      [{ platform: "darwin", arch: "arm64", logicalCores: 10 }, ["macos", "arm64", "8"]],
      [{ platform: "win32", arch: "x64", logicalCores: 12 }, ["windows", "x64", "8"]],
      [{ platform: "freebsd", arch: "riscv64", logicalCores: 1 }, ["bsd", "riscv64", "1"]],
      [{ platform: "sunos", arch: "mips", logicalCores: 3 }, ["other", "other", "2"]],
    ];
    for (const [probe, [osFamily, architecture, cpuCoresBucket]] of cases) {
      const result = detectBenchmarkSystem(probe);
      assert.deepEqual(
        { osFamily: result.osFamily, architecture: result.architecture, cpuCoresBucket: result.cpuCoresBucket },
        { osFamily, architecture, cpuCoresBucket },
      );
      assert.deepEqual(codes(result.diagnostics), []);
    }
  });

  it("buckets logical cores to a power of two, capped at 128+", () => {
    const expected = [[1, "1"], [2, "2"], [3, "2"], [4, "4"], [7, "4"], [8, "8"], [16, "16"], [31, "16"], [64, "64"], [127, "64"], [128, "128+"], [4096, "128+"]];
    for (const [count, bucket] of expected) assert.equal(bucketLogicalCores(count), bucket, `count ${count}`);
    for (const bad of [0, -1, 1.5, NaN, Infinity, 2 ** 53, "8", 8n, null, undefined, {}]) {
      assert.equal(bucketLogicalCores(bad), "unknown");
    }
  });

  it("never passes a raw or identifying probe string through", () => {
    const result = detectBenchmarkSystem({ platform: "linux-alice-laptop", arch: "Intel(R) Core(TM) i9-13900K", logicalCores: 24 });
    assert.equal(result.osFamily, "unknown");
    assert.equal(result.architecture, "unknown");
    assert.equal(result.cpuCoresBucket, "16");
    const serialised = JSON.stringify(result);
    assert.ok(!serialised.includes("alice") && !serialised.includes("i9-13900K"));
    assert.deepEqual(codes(result.diagnostics), ["Galerina_BENCHMARK_PROBE_OS_UNKNOWN", "Galerina_BENCHMARK_PROBE_ARCH_UNKNOWN"]);
  });

  it("refuses unknown probe keys (hostname, CPU model, memory) unread", () => {
    let touched = false;
    const probe = { platform: "linux", arch: "x64", logicalCores: 4, hostname: "alice-pc", cpuModel: "secret" };
    Object.defineProperty(probe, "totalMemory", { enumerable: true, get() { touched = true; return 1; } });
    const result = detectBenchmarkSystem(probe);
    assert.equal(touched, false, "unknown accessor must not be read");
    assert.equal(result.osFamily, "linux");
    assert.equal(codes(result.diagnostics).filter((c) => c === "Galerina_BENCHMARK_PROBE_FIELD_UNKNOWN").length, 3);
    assert.ok(!JSON.stringify(result).includes("alice-pc"));
    assert.equal("memoryBucket" in result, false, "RAM detection is out of scope");
  });

  it("fails closed on hostile probes: non-records, proxies, accessors, symbols", () => {
    for (const bad of [null, undefined, "linux", 42, [], new Proxy({ platform: "linux" }, {}), Object.create({ platform: "linux" })]) {
      const result = detectBenchmarkSystem(bad);
      assert.deepEqual([result.osFamily, result.architecture, result.cpuCoresBucket], ["unknown", "unknown", "unknown"]);
      assert.ok(codes(result.diagnostics).includes("Galerina_BENCHMARK_PROBE_RECORD_REQUIRED"));
    }
    let read = false;
    const accessor = {};
    Object.defineProperty(accessor, "platform", { enumerable: true, get() { read = true; return "linux"; } });
    const accessorResult = detectBenchmarkSystem(accessor);
    assert.equal(read, false);
    assert.equal(accessorResult.osFamily, "unknown");
    assert.ok(codes(accessorResult.diagnostics).includes("Galerina_BENCHMARK_FIELD_HOSTILE"));

    const symbolic = { platform: "linux", arch: "x64", logicalCores: 2, [Symbol("x")]: 1 };
    assert.ok(codes(detectBenchmarkSystem(symbolic).diagnostics).includes("Galerina_BENCHMARK_PROBE_FIELD_UNKNOWN"));
    assert.equal(detectBenchmarkSystem({ platform: { toString: () => "linux" } }).osFamily, "unknown");
  });

  it("returns frozen results whose fields validate inside a report", () => {
    const result = detectBenchmarkSystem({ platform: "linux", arch: "arm64", logicalCores: 8 });
    assert.ok(Object.isFrozen(result) && Object.isFrozen(result.diagnostics));
    const report = {
      schema: "Galerina.benchmark.report.v1",
      benchmarkId: "bench_detect",
      mode: "light",
      trigger: "manual",
      loVersion: "2.0.0",
      system: {
        osFamily: result.osFamily,
        architecture: result.architecture,
        cpuCoresBucket: result.cpuCoresBucket,
        memoryBucket: "unknown",
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
  });
});
