import assert from "node:assert/strict";
import test from "node:test";
import {
  FUNGI_BENCH_VEC_001,
  FUNGI_BENCH_VEC_002,
  FUNGI_BENCH_VEC_005,
  VECTOR_DOT_PRODUCT_SMALL_BENCHMARK_ID,
  VECTOR_COSINE_BATCH_SMALL_BENCHMARK_ID,
  SMALL_VECTOR_BENCHMARK_TARGET,
  SMALL_VECTOR_DIMENSION,
  SMALL_VECTOR_COSINE_BATCH,
  DEFAULT_SMALL_VECTOR_OPERATIONS,
  benchDotFloat32,
  benchCosineFloat32,
  buildSmallVectorFixtures,
  runSmallVectorBenchmark,
  scoreSmallVectorBenchmark,
  validateBenchmarkReport,
} from "../dist/index.js";

const codeOf = (r) => (r.ok ? "ok" : r.diagnostics[0]?.code);

test("scalar dot/cosine are correct and refuse bad input, zero norm and non-finite", () => {
  const a = new Float32Array([1, 2, 3]);
  const b = new Float32Array([4, -5, 6]);
  assert.equal(benchDotFloat32(a, b), 12);
  assert.ok(Math.abs(benchCosineFloat32(a, a) - 1) < 1e-6);
  assert.ok(Math.abs(benchCosineFloat32(new Float32Array([1, 0]), new Float32Array([0, 1]))) < 1e-9);
  assert.equal(benchCosineFloat32(a, new Float32Array([0, 0, 0])), undefined);
  assert.equal(benchDotFloat32(a, new Float32Array([1, 2])), undefined);
  assert.equal(benchDotFloat32([1, 2, 3], a), undefined);
  assert.equal(benchDotFloat32(new Float32Array(0), new Float32Array(0)), undefined);
  assert.equal(benchDotFloat32(new Float32Array([Number.NaN]), new Float32Array([1])), undefined);
  assert.equal(benchCosineFloat32(new Float32Array([Infinity, 1]), new Float32Array([1, 1])), undefined);
});

test("fixtures are deterministic with closed sizes", () => {
  const fx = buildSmallVectorFixtures();
  assert.equal(fx.a.length, SMALL_VECTOR_DIMENSION);
  assert.equal(fx.batch.length, SMALL_VECTOR_COSINE_BATCH);
  assert.equal(fx.a.length, 256);
  assert.equal(fx.batch.length, 64);
  assert.equal(buildSmallVectorFixtures(), fx);
  for (const x of fx.a) assert.ok(x >= -1 && x < 1);
});

test("runSmallVectorBenchmark passes both light ids", () => {
  const r = runSmallVectorBenchmark({ operations: 200 });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.value.length, 2);
  assert.equal(r.value[0].id, VECTOR_DOT_PRODUCT_SMALL_BENCHMARK_ID);
  assert.equal(r.value[0].id, "vector.dot_product_small");
  assert.equal(r.value[1].id, VECTOR_COSINE_BATCH_SMALL_BENCHMARK_ID);
  assert.equal(r.value[1].id, "vector.cosine_batch_small");
  for (const row of r.value) {
    assert.equal(row.target, SMALL_VECTOR_BENCHMARK_TARGET);
    assert.equal(row.status, "passed");
    assert.equal(row.operations, 200);
    assert.equal(row.score, scoreSmallVectorBenchmark(row.operations, row.durationMs));
    assert.equal(Object.isFrozen(row), true);
  }
});

test("default options and timeout behave without throwing", () => {
  const d = runSmallVectorBenchmark();
  assert.equal(d.ok, true);
  if (d.ok) for (const row of d.value) assert.equal(row.operations, DEFAULT_SMALL_VECTOR_OPERATIONS);
  const t = runSmallVectorBenchmark({ operations: 100_000, maxDurationMs: 1 });
  assert.equal(t.ok, true);
  if (t.ok) for (const row of t.value) {
    assert.ok(row.status === "skipped_timeout" || row.status === "passed");
    if (row.status === "skipped_timeout") assert.ok(row.operations > 0 && row.operations < 100_000);
  }
});

test("closed options refuse unknown keys, null, NaN and out-of-range without echo", () => {
  const extra = runSmallVectorBenchmark({ operations: 1, secretTokenXYZ: "sk-live-XYZ" });
  assert.equal(codeOf(extra), FUNGI_BENCH_VEC_001);
  assert.equal(JSON.stringify(extra).includes("XYZ"), false);
  for (const bad of [null, "x", [], 1, Number.NaN]) assert.equal(codeOf(runSmallVectorBenchmark(bad)), FUNGI_BENCH_VEC_001);
  assert.equal(codeOf(runSmallVectorBenchmark({ operations: 0 })), FUNGI_BENCH_VEC_002);
  assert.equal(codeOf(runSmallVectorBenchmark({ operations: 100_001 })), FUNGI_BENCH_VEC_002);
  assert.equal(codeOf(runSmallVectorBenchmark({ operations: Number.NaN })), FUNGI_BENCH_VEC_002);
  assert.equal(codeOf(runSmallVectorBenchmark({ maxDurationMs: 0 })), FUNGI_BENCH_VEC_002);
  assert.equal(typeof FUNGI_BENCH_VEC_005, "string");
});

test("hostile getters and prototypes refuse without running getters or throwing", () => {
  let ran = false;
  const hostile = {};
  Object.defineProperty(hostile, "operations", { get() { ran = true; return 1; }, enumerable: true });
  assert.equal(codeOf(runSmallVectorBenchmark(hostile)), FUNGI_BENCH_VEC_001);
  const proxy = new Proxy({ operations: 1 }, {
    ownKeys() { throw new Error("boom"); },
    getOwnPropertyDescriptor() { throw new Error("boom"); },
  });
  assert.doesNotThrow(() => runSmallVectorBenchmark(proxy));
  assert.equal(codeOf(runSmallVectorBenchmark(proxy)), FUNGI_BENCH_VEC_001);
  class Box { constructor() { this.operations = 1; } }
  assert.equal(codeOf(runSmallVectorBenchmark(new Box())), FUNGI_BENCH_VEC_001);
  assert.equal(ran, false);
});

test("passed results are admissible inside a minimal BenchmarkReport capture shape", () => {
  const r = runSmallVectorBenchmark({ operations: 50 });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const report = {
    schema: "Galerina.benchmark.report.v1",
    benchmarkId: "bench_small_vector_case",
    mode: "light",
    trigger: "manual",
    loVersion: "2.0.0",
    system: { osFamily: "linux", architecture: "x64", cpuCoresBucket: "8", memoryBucket: "unknown", gpuBackend: "none", lowBitBackend: "none" },
    durationMs: r.value[0].durationMs + r.value[1].durationMs,
    summary: { logic: "skipped", cpu: "skipped", json: "skipped", vector: "passed", gpu: "skipped", ai_accelerator: "skipped", low_bit_ai: "skipped", optical_io: "skipped", recovery: "skipped", compare: "skipped" },
    scores: { overall: r.value[0].score, vector: r.value[0].score },
    tests: r.value.map((row) => ({ id: row.id, target: row.target, status: row.status, durationMs: row.durationMs, operations: row.operations, score: row.score })),
    privacy: { shareable: false, containsPersonalData: false, machineId: "not_included", hostname: "not_included", username: "not_included", projectPath: "not_included" },
  };
  assert.deepEqual(validateBenchmarkReport(report), []);
});
