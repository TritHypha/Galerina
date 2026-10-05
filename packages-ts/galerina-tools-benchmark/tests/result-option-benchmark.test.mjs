import assert from "node:assert/strict";
import test from "node:test";
import {
  FUNGI_BENCH_RO_001,
  FUNGI_BENCH_RO_002,
  FUNGI_BENCH_RO_005,
  RESULT_OPTION_BENCHMARK_ID,
  RESULT_OPTION_BENCHMARK_TARGET,
  DEFAULT_RESULT_OPTION_OPERATIONS,
  benchOptionSome,
  benchOptionNone,
  benchResultOk,
  benchResultErr,
  benchUnwrapOr,
  benchMatchResultOption,
  runResultOptionBenchmark,
  scoreResultOptionBenchmark,
  validateBenchmarkReport,
} from "../dist/index.js";

const codeOf = (r) => (r.ok ? "ok" : r.diagnostics[0]?.code);

test("closed Option/Result helpers match and unwrap without throwing", () => {
  assert.equal(benchUnwrapOr(benchOptionSome(9), 0), 9);
  assert.equal(benchUnwrapOr(benchOptionNone(), 7), 7);
  assert.equal(benchMatchResultOption(benchOptionSome(3), benchResultOk(4)), 7);
  assert.equal(benchMatchResultOption(benchOptionNone(), benchResultOk(5)), 5);
  assert.equal(benchMatchResultOption(benchOptionSome(2), benchResultErr(1)), 1);
  assert.equal(benchMatchResultOption(benchOptionNone(), benchResultErr(2)), -2);
  assert.equal(benchMatchResultOption({ kind: "weird" }, benchResultOk(1)), undefined);
});

test("runResultOptionBenchmark passes with README id/target", () => {
  const r = runResultOptionBenchmark({ operations: 10_000 });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.value.id, RESULT_OPTION_BENCHMARK_ID);
  assert.equal(r.value.id, "logic.result_option");
  assert.equal(r.value.target, RESULT_OPTION_BENCHMARK_TARGET);
  assert.equal(r.value.status, "passed");
  assert.equal(r.value.operations, 10_000);
  assert.ok(Number.isSafeInteger(r.value.durationMs) && r.value.durationMs >= 0);
  assert.equal(r.value.score, scoreResultOptionBenchmark(r.value.operations, r.value.durationMs));
  assert.equal(Object.isFrozen(r.value), true);
});

test("default options use the closed light operations default", () => {
  const r = runResultOptionBenchmark();
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.value.operations, DEFAULT_RESULT_OPTION_OPERATIONS);
  assert.equal(r.value.status, "passed");
});

test("timeout option yields skipped_timeout without throwing", () => {
  const r = runResultOptionBenchmark({ operations: 1_000_000, maxDurationMs: 1 });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.ok(r.value.status === "skipped_timeout" || r.value.status === "passed");
  if (r.value.status === "skipped_timeout") {
    assert.ok(r.value.operations < 1_000_000);
    assert.ok(r.value.operations > 0);
  }
});

test("closed options refuse unknown keys, null, NaN and non-objects without echo", () => {
  const extra = runResultOptionBenchmark({ operations: 10, secretTokenXYZ: "sk-live-XYZ" });
  assert.equal(codeOf(extra), FUNGI_BENCH_RO_001);
  assert.equal(JSON.stringify(extra).includes("XYZ"), false);
  for (const bad of [null, "x", [], 1, Number.NaN]) {
    assert.equal(codeOf(runResultOptionBenchmark(bad)), FUNGI_BENCH_RO_001);
  }
  assert.equal(codeOf(runResultOptionBenchmark({ operations: 0 })), FUNGI_BENCH_RO_002);
  assert.equal(codeOf(runResultOptionBenchmark({ operations: Number.NaN })), FUNGI_BENCH_RO_002);
  assert.equal(codeOf(runResultOptionBenchmark({ maxDurationMs: 0 })), FUNGI_BENCH_RO_002);
});

test("hostile getters and prototypes refuse without running getters or throwing", () => {
  let ran = false;
  const hostile = {};
  Object.defineProperty(hostile, "operations", { get() { ran = true; return 10; }, enumerable: true });
  assert.equal(codeOf(runResultOptionBenchmark(hostile)), FUNGI_BENCH_RO_001);
  const proxy = new Proxy({ operations: 10 }, {
    ownKeys() { throw new Error("boom"); },
    getOwnPropertyDescriptor() { throw new Error("boom"); },
  });
  assert.doesNotThrow(() => runResultOptionBenchmark(proxy));
  assert.equal(codeOf(runResultOptionBenchmark(proxy)), FUNGI_BENCH_RO_001);
  class Box { constructor() { this.operations = 10; } }
  assert.equal(codeOf(runResultOptionBenchmark(new Box())), FUNGI_BENCH_RO_001);
  assert.equal(ran, false);
  assert.equal(typeof FUNGI_BENCH_RO_005, "string");
});

test("passed result is admissible inside a minimal BenchmarkReport capture shape", () => {
  const r = runResultOptionBenchmark({ operations: 1000 });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const report = {
    schema: "Galerina.benchmark.report.v1",
    benchmarkId: "bench_result_option_case",
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
