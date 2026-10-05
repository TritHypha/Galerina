import assert from "node:assert/strict";
import test from "node:test";
import {
  FUNGI_BENCH_TRI_001,
  FUNGI_BENCH_TRI_002,
  FUNGI_BENCH_TRI_005,
  TRI_LOGIC_BENCHMARK_ID,
  TRI_LOGIC_BENCHMARK_TARGET,
  TRI_FALSE,
  TRI_UNKNOWN,
  TRI_TRUE,
  DEFAULT_TRI_LOGIC_OPERATIONS,
  benchTriAnd,
  benchTriOr,
  benchTriNot,
  runTriLogicBenchmark,
  scoreTriLogicBenchmark,
  validateBenchmarkReport,
} from "../dist/index.js";

const codeOf = (r) => (r.ok ? "ok" : r.diagnostics[0]?.code);

test("Kleene Tri table matches closed -1|0|1 min/max/unknown-preserving not", () => {
  assert.equal(benchTriAnd(TRI_FALSE, TRI_TRUE), TRI_FALSE);
  assert.equal(benchTriAnd(TRI_UNKNOWN, TRI_TRUE), TRI_UNKNOWN);
  assert.equal(benchTriOr(TRI_FALSE, TRI_TRUE), TRI_TRUE);
  assert.equal(benchTriOr(TRI_UNKNOWN, TRI_FALSE), TRI_UNKNOWN);
  assert.equal(benchTriNot(TRI_TRUE), TRI_FALSE);
  assert.equal(benchTriNot(TRI_FALSE), TRI_TRUE);
  assert.equal(benchTriNot(TRI_UNKNOWN), TRI_UNKNOWN);
});

test("runTriLogicBenchmark passes closed truth-table microbench with README id/target", () => {
  const r = runTriLogicBenchmark({ operations: 10_000 });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.value.id, TRI_LOGIC_BENCHMARK_ID);
  assert.equal(r.value.id, "logic.tri_match");
  assert.equal(r.value.target, TRI_LOGIC_BENCHMARK_TARGET);
  assert.equal(r.value.status, "passed");
  assert.equal(r.value.operations, 10_000);
  assert.ok(Number.isSafeInteger(r.value.durationMs) && r.value.durationMs >= 0);
  assert.equal(r.value.score, scoreTriLogicBenchmark(r.value.operations, r.value.durationMs));
  assert.equal(Object.isFrozen(r.value), true);
});

test("default options use the closed light operations default", () => {
  const r = runTriLogicBenchmark();
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.value.operations, DEFAULT_TRI_LOGIC_OPERATIONS);
  assert.equal(r.value.status, "passed");
});

test("timeout option yields skipped_timeout without throwing", () => {
  const r = runTriLogicBenchmark({ operations: 1_000_000, maxDurationMs: 1 });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.ok(r.value.status === "skipped_timeout" || r.value.status === "passed");
  if (r.value.status === "skipped_timeout") {
    assert.ok(r.value.operations < 1_000_000);
    assert.ok(r.value.operations > 0);
  }
});

test("closed options refuse unknown keys, null, NaN and non-objects without echo", () => {
  const extra = runTriLogicBenchmark({ operations: 10, secretTokenXYZ: "sk-live-XYZ" });
  assert.equal(codeOf(extra), FUNGI_BENCH_TRI_001);
  assert.equal(JSON.stringify(extra).includes("XYZ"), false);
  for (const bad of [null, "x", [], 1, Number.NaN]) {
    assert.equal(codeOf(runTriLogicBenchmark(bad)), FUNGI_BENCH_TRI_001);
  }
  assert.equal(codeOf(runTriLogicBenchmark({ operations: 0 })), FUNGI_BENCH_TRI_002);
  assert.equal(codeOf(runTriLogicBenchmark({ operations: Number.NaN })), FUNGI_BENCH_TRI_002);
  assert.equal(codeOf(runTriLogicBenchmark({ maxDurationMs: 0 })), FUNGI_BENCH_TRI_002);
});

test("hostile getters and prototypes refuse without running getters or throwing", () => {
  let ran = false;
  const hostile = {};
  Object.defineProperty(hostile, "operations", { get() { ran = true; return 10; }, enumerable: true });
  assert.equal(codeOf(runTriLogicBenchmark(hostile)), FUNGI_BENCH_TRI_001);
  const proxy = new Proxy({ operations: 10 }, {
    ownKeys() { throw new Error("boom"); },
    getOwnPropertyDescriptor() { throw new Error("boom"); },
  });
  assert.doesNotThrow(() => runTriLogicBenchmark(proxy));
  assert.equal(codeOf(runTriLogicBenchmark(proxy)), FUNGI_BENCH_TRI_001);
  class Box { constructor() { this.operations = 10; } }
  assert.equal(codeOf(runTriLogicBenchmark(new Box())), FUNGI_BENCH_TRI_001);
  assert.equal(ran, false);
  assert.equal(typeof FUNGI_BENCH_TRI_005, "string");
});

test("passed result is admissible inside a minimal BenchmarkReport capture shape", () => {
  const r = runTriLogicBenchmark({ operations: 1000 });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const report = {
    schema: "Galerina.benchmark.report.v1",
    benchmarkId: "bench_tri_logic_case",
    mode: "light",
    trigger: "manual",
    loVersion: "2.0.0",
    system: {
      osFamily: "linux",
      architecture: "x64",
      cpuCoresBucket: "8",
      memoryBucket: "unknown",
      gpuBackend: "none",
      lowBitBackend: "none",
    },
    durationMs: r.value.durationMs,
    summary: {
      logic: "passed",
      cpu: "skipped",
      json: "skipped",
      vector: "skipped",
      gpu: "skipped",
      ai_accelerator: "skipped",
      low_bit_ai: "skipped",
      optical_io: "skipped",
      recovery: "skipped",
      compare: "skipped",
    },
    scores: { overall: r.value.score, logic: r.value.score },
    tests: [{
      id: r.value.id,
      target: r.value.target,
      status: r.value.status,
      durationMs: r.value.durationMs,
      operations: r.value.operations,
      score: r.value.score,
    }],
    privacy: {
      shareable: false,
      containsPersonalData: false,
      machineId: "not_included",
      hostname: "not_included",
      username: "not_included",
      projectPath: "not_included",
    },
  };
  assert.deepEqual(validateBenchmarkReport(report), []);
});
