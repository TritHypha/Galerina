import assert from "node:assert/strict";
import test from "node:test";
import {
  FUNGI_BENCH_JSON_001,
  FUNGI_BENCH_JSON_002,
  FUNGI_BENCH_JSON_005,
  JSON_DECODE_VALIDATE_1MB_BENCHMARK_ID,
  JSON_DECODE_VALIDATE_1MB_BENCHMARK_TARGET,
  JSON_1MB_BYTES,
  DEFAULT_JSON_1MB_OPERATIONS,
  buildJson1mbPayload,
  validateJson1mbDocument,
  decodeAndValidateJson1mb,
  runJsonDecodeValidate1mbBenchmark,
  scoreJson1mbBenchmark,
  validateBenchmarkReport,
} from "../dist/index.js";

const codeOf = (r) => (r.ok ? "ok" : r.diagnostics[0]?.code);

test("buildJson1mbPayload yields exact 1 MiB that validates", () => {
  const built = buildJson1mbPayload();
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(built.bytes, JSON_1MB_BYTES);
  assert.equal(built.bytes, 1_048_576);
  assert.equal(new TextEncoder().encode(built.payload).length, JSON_1MB_BYTES);
  assert.equal(decodeAndValidateJson1mb(built.payload), true);
  assert.equal(validateJson1mbDocument(JSON.parse(built.payload)), true);
});

test("validateJson1mbDocument refuses unknown fields and wrong kinds", () => {
  assert.equal(validateJson1mbDocument(null), false);
  assert.equal(validateJson1mbDocument({ schema: "galerina.bench.json1mb/v1", count: 0, items: [], extra: 1 }), false);
  assert.equal(validateJson1mbDocument({
    schema: "galerina.bench.json1mb/v1",
    count: 1,
    items: [{ id: 0, name: "a", score: 1, active: true, meta: { tag: "t", n: 1 }, evil: true }],
  }), false);
  assert.equal(decodeAndValidateJson1mb("{not-json"), false);
  assert.equal(decodeAndValidateJson1mb("[]"), false);
});

test("runJsonDecodeValidate1mbBenchmark passes with README id/target", () => {
  const r = runJsonDecodeValidate1mbBenchmark({ operations: 2 });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.value.id, JSON_DECODE_VALIDATE_1MB_BENCHMARK_ID);
  assert.equal(r.value.id, "json.decode_validate_1mb");
  assert.equal(r.value.target, JSON_DECODE_VALIDATE_1MB_BENCHMARK_TARGET);
  assert.equal(r.value.status, "passed");
  assert.equal(r.value.operations, 2);
  assert.equal(r.value.bytes, JSON_1MB_BYTES);
  assert.ok(Number.isSafeInteger(r.value.durationMs) && r.value.durationMs >= 0);
  assert.equal(r.value.score, scoreJson1mbBenchmark(r.value.operations, r.value.durationMs));
  assert.equal(Object.isFrozen(r.value), true);
});

test("default options use the closed light operations default", () => {
  const r = runJsonDecodeValidate1mbBenchmark();
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.value.operations, DEFAULT_JSON_1MB_OPERATIONS);
  assert.equal(r.value.status, "passed");
});

test("timeout option yields skipped_timeout without throwing", () => {
  const r = runJsonDecodeValidate1mbBenchmark({ operations: 64, maxDurationMs: 1 });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.ok(r.value.status === "skipped_timeout" || r.value.status === "passed");
  if (r.value.status === "skipped_timeout") {
    assert.ok(r.value.operations < 64);
    assert.ok(r.value.operations > 0);
  }
});

test("closed options refuse unknown keys, null, NaN and non-objects without echo", () => {
  const extra = runJsonDecodeValidate1mbBenchmark({ operations: 1, secretTokenXYZ: "sk-live-XYZ" });
  assert.equal(codeOf(extra), FUNGI_BENCH_JSON_001);
  assert.equal(JSON.stringify(extra).includes("XYZ"), false);
  for (const bad of [null, "x", [], 1, Number.NaN]) {
    assert.equal(codeOf(runJsonDecodeValidate1mbBenchmark(bad)), FUNGI_BENCH_JSON_001);
  }
  assert.equal(codeOf(runJsonDecodeValidate1mbBenchmark({ operations: 0 })), FUNGI_BENCH_JSON_002);
  assert.equal(codeOf(runJsonDecodeValidate1mbBenchmark({ operations: Number.NaN })), FUNGI_BENCH_JSON_002);
  assert.equal(codeOf(runJsonDecodeValidate1mbBenchmark({ maxDurationMs: 0 })), FUNGI_BENCH_JSON_002);
  assert.equal(typeof FUNGI_BENCH_JSON_005, "string");
});

test("hostile getters and prototypes refuse without running getters or throwing", () => {
  let ran = false;
  const hostile = {};
  Object.defineProperty(hostile, "operations", { get() { ran = true; return 1; }, enumerable: true });
  assert.equal(codeOf(runJsonDecodeValidate1mbBenchmark(hostile)), FUNGI_BENCH_JSON_001);
  const proxy = new Proxy({ operations: 1 }, {
    ownKeys() { throw new Error("boom"); },
    getOwnPropertyDescriptor() { throw new Error("boom"); },
  });
  assert.doesNotThrow(() => runJsonDecodeValidate1mbBenchmark(proxy));
  assert.equal(codeOf(runJsonDecodeValidate1mbBenchmark(proxy)), FUNGI_BENCH_JSON_001);
  class Box { constructor() { this.operations = 1; } }
  assert.equal(codeOf(runJsonDecodeValidate1mbBenchmark(new Box())), FUNGI_BENCH_JSON_001);
  assert.equal(ran, false);
});

test("passed result is admissible inside a minimal BenchmarkReport capture shape", () => {
  const r = runJsonDecodeValidate1mbBenchmark({ operations: 1 });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const report = {
    schema: "Galerina.benchmark.report.v1",
    benchmarkId: "bench_json_1mb_case",
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
      logic: "skipped",
      cpu: "skipped",
      json: "passed",
      vector: "skipped",
      gpu: "skipped",
      ai_accelerator: "skipped",
      low_bit_ai: "skipped",
      optical_io: "skipped",
      recovery: "skipped",
      compare: "skipped",
    },
    scores: { overall: r.value.score, json: r.value.score },
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
