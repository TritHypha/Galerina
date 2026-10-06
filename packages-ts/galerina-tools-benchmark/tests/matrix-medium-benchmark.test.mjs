import assert from "node:assert/strict";
import test from "node:test";
import {
  FUNGI_BENCH_MAT_001,
  FUNGI_BENCH_MAT_002,
  FUNGI_BENCH_MAT_005,
  MATRIX_MULTIPLY_MEDIUM_BENCHMARK_ID,
  MATRIX_MULTIPLY_MEDIUM_BENCHMARK_TARGET,
  MATRIX_MULTIPLY_MEDIUM_N,
  MATRIX_MULTIPLY_MEDIUM_MUL_ADDS,
  DEFAULT_MATRIX_MULTIPLY_MEDIUM_OPERATIONS,
  benchMatMulFloat32,
  buildMatrixMediumFixtures,
  verifyMatMulSpotEntries,
  runMatrixMultiplyMediumBenchmark,
  scoreMatrixBenchmark,
  validateBenchmarkReport,
} from "../dist/index.js";

const codeOf = (r) => (r.ok ? "ok" : r.diagnostics[0]?.code);

test("matmul is correct on a known 2x2 and refuses bad input / non-finite", () => {
  const c = benchMatMulFloat32(new Float32Array([1, 2, 3, 4]), new Float32Array([5, 6, 7, 8]), 2);
  assert.deepEqual(Array.from(c), [19, 22, 43, 50]);
  const id = new Float32Array([1, 0, 0, 1]);
  assert.deepEqual(Array.from(benchMatMulFloat32(id, new Float32Array([9, 8, 7, 6]), 2)), [9, 8, 7, 6]);
  assert.equal(benchMatMulFloat32(new Float32Array(4), new Float32Array(9), 2), undefined);
  assert.equal(benchMatMulFloat32([1, 2, 3, 4], id, 2), undefined);
  assert.equal(benchMatMulFloat32(id, id, 0), undefined);
  assert.equal(benchMatMulFloat32(id, id, Number.NaN), undefined);
  assert.equal(benchMatMulFloat32(new Float32Array([Number.NaN, 0, 0, 1]), id, 2), undefined);
  assert.equal(benchMatMulFloat32(new Float32Array([3e38, 0, 0, 1]), new Float32Array([3e38, 0, 0, 1]), 2), undefined);
});

test("fixtures are deterministic N x N and spot entries match a Float64 reference", () => {
  const { a, b } = buildMatrixMediumFixtures();
  assert.equal(MATRIX_MULTIPLY_MEDIUM_N, 128);
  assert.equal(MATRIX_MULTIPLY_MEDIUM_MUL_ADDS, 128 ** 3);
  assert.equal(a.length, 128 * 128);
  assert.equal(buildMatrixMediumFixtures().a, a);
  const c = benchMatMulFloat32(a, b, 128);
  assert.ok(c instanceof Float32Array);
  assert.equal(verifyMatMulSpotEntries(a, b, c, 128), true);
  const bad = new Float32Array(c); bad[0] += 1;
  assert.equal(verifyMatMulSpotEntries(a, b, bad, 128), false);
});

test("runMatrixMultiplyMediumBenchmark passes with README id/target and mul-adds score", () => {
  const r = runMatrixMultiplyMediumBenchmark({ operations: 3 });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.value.id, MATRIX_MULTIPLY_MEDIUM_BENCHMARK_ID);
  assert.equal(r.value.id, "vector.matrix_multiply_medium");
  assert.equal(r.value.target, MATRIX_MULTIPLY_MEDIUM_BENCHMARK_TARGET);
  assert.equal(r.value.status, "passed");
  assert.equal(r.value.operations, 3);
  assert.equal(r.value.score, scoreMatrixBenchmark(3, r.value.durationMs));
  assert.equal(scoreMatrixBenchmark(1000, 1000), Math.min(10_000, Math.floor(1000 * 128 ** 3 / 1e6)));
  assert.equal(Object.isFrozen(r.value), true);
});

test("default options and timeout behave without throwing", () => {
  const d = runMatrixMultiplyMediumBenchmark();
  assert.equal(d.ok, true);
  if (d.ok) assert.equal(d.value.operations, DEFAULT_MATRIX_MULTIPLY_MEDIUM_OPERATIONS);
  const t = runMatrixMultiplyMediumBenchmark({ operations: 200, maxDurationMs: 1 });
  assert.equal(t.ok, true);
  if (t.ok) {
    assert.ok(t.value.status === "skipped_timeout" || t.value.status === "passed");
    if (t.value.status === "skipped_timeout") assert.ok(t.value.operations >= 1 && t.value.operations < 200);
  }
});

test("closed options refuse unknown keys, null, NaN and out-of-range without echo", () => {
  const extra = runMatrixMultiplyMediumBenchmark({ operations: 1, secretTokenXYZ: "sk-live-XYZ" });
  assert.equal(codeOf(extra), FUNGI_BENCH_MAT_001);
  assert.equal(JSON.stringify(extra).includes("XYZ"), false);
  for (const bad of [null, "x", [], 1, Number.NaN]) assert.equal(codeOf(runMatrixMultiplyMediumBenchmark(bad)), FUNGI_BENCH_MAT_001);
  assert.equal(codeOf(runMatrixMultiplyMediumBenchmark({ operations: 0 })), FUNGI_BENCH_MAT_002);
  assert.equal(codeOf(runMatrixMultiplyMediumBenchmark({ operations: 201 })), FUNGI_BENCH_MAT_002);
  assert.equal(codeOf(runMatrixMultiplyMediumBenchmark({ maxDurationMs: Number.NaN })), FUNGI_BENCH_MAT_002);
  assert.equal(typeof FUNGI_BENCH_MAT_005, "string");
});

test("hostile getters and prototypes refuse without running getters or throwing", () => {
  let ran = false;
  const hostile = {};
  Object.defineProperty(hostile, "operations", { get() { ran = true; return 1; }, enumerable: true });
  assert.equal(codeOf(runMatrixMultiplyMediumBenchmark(hostile)), FUNGI_BENCH_MAT_001);
  const proxy = new Proxy({ operations: 1 }, {
    ownKeys() { throw new Error("boom"); },
    getOwnPropertyDescriptor() { throw new Error("boom"); },
  });
  assert.doesNotThrow(() => runMatrixMultiplyMediumBenchmark(proxy));
  assert.equal(codeOf(runMatrixMultiplyMediumBenchmark(proxy)), FUNGI_BENCH_MAT_001);
  class Box { constructor() { this.operations = 1; } }
  assert.equal(codeOf(runMatrixMultiplyMediumBenchmark(new Box())), FUNGI_BENCH_MAT_001);
  assert.equal(ran, false);
});

test("passed result is admissible inside a minimal BenchmarkReport capture shape", () => {
  const r = runMatrixMultiplyMediumBenchmark({ operations: 1 });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const report = {
    schema: "Galerina.benchmark.report.v1",
    benchmarkId: "bench_matrix_medium_case",
    mode: "full",
    trigger: "manual",
    loVersion: "2.0.0",
    system: { osFamily: "linux", architecture: "x64", cpuCoresBucket: "8", memoryBucket: "unknown", gpuBackend: "none", lowBitBackend: "none" },
    durationMs: r.value.durationMs,
    summary: { logic: "skipped", cpu: "skipped", json: "skipped", vector: "passed", gpu: "skipped", ai_accelerator: "skipped", low_bit_ai: "skipped", optical_io: "skipped", recovery: "skipped", compare: "skipped" },
    scores: { overall: r.value.score, vector: r.value.score },
    tests: [{ id: r.value.id, target: r.value.target, status: r.value.status, durationMs: r.value.durationMs, operations: r.value.operations, score: r.value.score }],
    privacy: { shareable: false, containsPersonalData: false, machineId: "not_included", hostname: "not_included", username: "not_included", projectPath: "not_included" },
  };
  assert.deepEqual(validateBenchmarkReport(report), []);
});
