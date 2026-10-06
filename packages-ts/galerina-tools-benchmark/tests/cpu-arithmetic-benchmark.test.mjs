import assert from "node:assert/strict";
import test from "node:test";
import {
  FUNGI_BENCH_CPU_ARITH_001,
  FUNGI_BENCH_CPU_ARITH_002,
  FUNGI_BENCH_CPU_ARITH_005,
  CPU_INTEGER_LOOP_BENCHMARK_ID,
  CPU_FLOAT_LOOP_BENCHMARK_ID,
  CPU_ARITHMETIC_BENCHMARK_TARGET,
  DEFAULT_CPU_ARITHMETIC_OPERATIONS,
  benchIntegerStep,
  benchFloatStep,
  runCpuArithmeticBenchmark,
  scoreCpuArithmeticBenchmark,
  validateBenchmarkReport,
} from "../dist/index.js";

const codeOf = (r) => (r.ok ? "ok" : r.diagnostics[0]?.code);

test("closed integer/float steps stay finite / safe-int", () => {
  let seed = 1;
  for (let i = 0; i < 1000; i += 1) {
    const next = benchIntegerStep(seed, i);
    assert.equal(typeof next, "number");
    assert.equal(Number.isSafeInteger(next), true);
    seed = next;
  }
  let f = 1;
  for (let i = 0; i < 1000; i += 1) {
    const next = benchFloatStep(f, i);
    assert.equal(typeof next, "number");
    assert.equal(Number.isFinite(next), true);
    f = next;
  }
  assert.equal(benchIntegerStep(Number.NaN, 0), undefined);
  assert.equal(benchFloatStep(Number.NaN, 0), undefined);
  assert.equal(benchFloatStep(Number.POSITIVE_INFINITY, 0), undefined);
});

test("runCpuArithmeticBenchmark passes both light ids", () => {
  const r = runCpuArithmeticBenchmark({ operations: 10_000 });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.value.length, 2);
  assert.equal(r.value[0].id, CPU_INTEGER_LOOP_BENCHMARK_ID);
  assert.equal(r.value[0].id, "cpu.integer_loop");
  assert.equal(r.value[1].id, CPU_FLOAT_LOOP_BENCHMARK_ID);
  assert.equal(r.value[1].id, "cpu.float_loop");
  for (const row of r.value) {
    assert.equal(row.target, CPU_ARITHMETIC_BENCHMARK_TARGET);
    assert.equal(row.status, "passed");
    assert.equal(row.operations, 10_000);
    assert.ok(Number.isSafeInteger(row.durationMs) && row.durationMs >= 0);
    assert.equal(row.score, scoreCpuArithmeticBenchmark(row.operations, row.durationMs));
    assert.equal(Object.isFrozen(row), true);
  }
});

test("default options use the closed light operations default", () => {
  const r = runCpuArithmeticBenchmark();
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.value[0].operations, DEFAULT_CPU_ARITHMETIC_OPERATIONS);
  assert.equal(r.value[1].operations, DEFAULT_CPU_ARITHMETIC_OPERATIONS);
  assert.equal(r.value[0].status, "passed");
  assert.equal(r.value[1].status, "passed");
});

test("timeout option yields skipped_timeout without throwing", () => {
  const r = runCpuArithmeticBenchmark({ operations: 1_000_000, maxDurationMs: 1 });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  for (const row of r.value) {
    assert.ok(row.status === "skipped_timeout" || row.status === "passed");
    if (row.status === "skipped_timeout") {
      assert.ok(row.operations < 1_000_000);
      assert.ok(row.operations > 0);
    }
  }
});

test("closed options refuse unknown keys, null, NaN and non-objects without echo", () => {
  const extra = runCpuArithmeticBenchmark({ operations: 10, secretTokenXYZ: "sk-live-XYZ" });
  assert.equal(codeOf(extra), FUNGI_BENCH_CPU_ARITH_001);
  assert.equal(JSON.stringify(extra).includes("XYZ"), false);
  for (const bad of [null, "x", [], 1, Number.NaN]) {
    assert.equal(codeOf(runCpuArithmeticBenchmark(bad)), FUNGI_BENCH_CPU_ARITH_001);
  }
  assert.equal(codeOf(runCpuArithmeticBenchmark({ operations: 0 })), FUNGI_BENCH_CPU_ARITH_002);
  assert.equal(codeOf(runCpuArithmeticBenchmark({ operations: Number.NaN })), FUNGI_BENCH_CPU_ARITH_002);
  assert.equal(codeOf(runCpuArithmeticBenchmark({ maxDurationMs: 0 })), FUNGI_BENCH_CPU_ARITH_002);
});

test("hostile getters and prototypes refuse without running getters or throwing", () => {
  let ran = false;
  const hostile = {};
  Object.defineProperty(hostile, "operations", { get() { ran = true; return 10; }, enumerable: true });
  assert.equal(codeOf(runCpuArithmeticBenchmark(hostile)), FUNGI_BENCH_CPU_ARITH_001);
  const proxy = new Proxy({ operations: 10 }, {
    ownKeys() { throw new Error("boom"); },
    getOwnPropertyDescriptor() { throw new Error("boom"); },
  });
  assert.doesNotThrow(() => runCpuArithmeticBenchmark(proxy));
  assert.equal(codeOf(runCpuArithmeticBenchmark(proxy)), FUNGI_BENCH_CPU_ARITH_001);
  class Box { constructor() { this.operations = 10; } }
  assert.equal(codeOf(runCpuArithmeticBenchmark(new Box())), FUNGI_BENCH_CPU_ARITH_001);
  assert.equal(ran, false);
  assert.equal(typeof FUNGI_BENCH_CPU_ARITH_005, "string");
});

test("passed results are admissible inside a minimal BenchmarkReport capture shape", () => {
  const r = runCpuArithmeticBenchmark({ operations: 1000 });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const report = {
    schema: "Galerina.benchmark.report.v1",
    benchmarkId: "bench_cpu_arithmetic_case",
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
    durationMs: r.value[0].durationMs + r.value[1].durationMs,
    summary: {
      logic: "skipped",
      cpu: "passed",
      json: "skipped",
      vector: "skipped",
      gpu: "skipped",
      ai_accelerator: "skipped",
      low_bit_ai: "skipped",
      optical_io: "skipped",
      recovery: "skipped",
      compare: "skipped",
    },
    scores: { overall: r.value[0].score, cpu: r.value[0].score },
    tests: r.value.map((row) => ({
      id: row.id,
      target: row.target,
      status: row.status,
      durationMs: row.durationMs,
      operations: row.operations,
      score: row.score,
    })),
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
