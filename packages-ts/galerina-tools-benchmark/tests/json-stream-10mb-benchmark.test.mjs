import assert from "node:assert/strict";
import test from "node:test";
import {
  FUNGI_BENCH_JSONS_001,
  FUNGI_BENCH_JSONS_002,
  FUNGI_BENCH_JSONS_005,
  JSON_STREAM_VALIDATE_10MB_BENCHMARK_ID,
  JSON_STREAM_VALIDATE_10MB_BENCHMARK_TARGET,
  JSON_STREAM_10MB_BYTES,
  JSON_STREAM_MAX_LINE_BYTES,
  DEFAULT_JSON_STREAM_10MB_OPERATIONS,
  buildJsonStream10mbPayload,
  createJsonLinesStreamValidator,
  streamValidateJsonLines,
  validateJsonStreamRecord,
  runJsonStreamValidate10mbBenchmark,
  scoreJsonStreamBenchmark,
  validateBenchmarkReport,
} from "../dist/index.js";

const codeOf = (r) => (r.ok ? "ok" : r.diagnostics[0]?.code);
const rec = (i) => JSON.stringify({ id: i, name: "n", score: 1, active: true, meta: { tag: "t", n: 0 } });

test("payload is exactly 10 MiB JSON Lines and every line validates", () => {
  const b = buildJsonStream10mbPayload();
  assert.equal(b.ok, true);
  if (!b.ok) return;
  assert.equal(b.bytes, JSON_STREAM_10MB_BYTES);
  assert.equal(b.bytes, 10_485_760);
  assert.equal(new TextEncoder().encode(b.payload).length, JSON_STREAM_10MB_BYTES);
  assert.equal(b.payload.endsWith("\n"), true);
  const s = streamValidateJsonLines(b.payload);
  assert.deepEqual(s, { records: b.lines, invalid: 0, oversize: 0, bytes: JSON_STREAM_10MB_BYTES });
});

test("lines split across arbitrary chunk boundaries are reassembled", () => {
  const payload = [rec(1), rec(2), rec(3), rec(4)].join("\n") + "\n";
  for (const size of [1, 2, 7, 13, 64, 4096]) {
    const s = streamValidateJsonLines(payload, size);
    assert.equal(s.records, 4, `chunk ${size}`);
    assert.equal(s.invalid, 0);
  }
  const noTrailing = streamValidateJsonLines(rec(1) + "\n" + rec(2), 5);
  assert.equal(noTrailing.records, 2);
});

test("invalid, unknown-field, empty and oversize lines are counted, never passed", () => {
  const evil = JSON.stringify({ id: 1, name: "n", score: 1, active: true, meta: { tag: "t", n: 0 }, extra: "sk-live-XYZ" });
  const huge = `{"id":1,"name":"${"z".repeat(JSON_STREAM_MAX_LINE_BYTES)}"}`;
  const payload = [rec(1), "{not json", evil, "", huge, rec(2)].join("\n") + "\n";
  const s = streamValidateJsonLines(payload, 3);
  assert.equal(s.records, 2);
  assert.equal(s.invalid, 3);
  assert.equal(s.oversize, 1);
  assert.equal(JSON.stringify(s).includes("XYZ"), false);
  assert.equal(validateJsonStreamRecord(JSON.parse(evil)), false);
  const v = createJsonLinesStreamValidator();
  assert.equal(v.push(42), false);
  assert.equal(v.end().invalid, 1);
  assert.equal(streamValidateJsonLines(null).invalid, 1);
});

test("runJsonStreamValidate10mbBenchmark passes with README id/target", () => {
  const r = runJsonStreamValidate10mbBenchmark();
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.value.id, JSON_STREAM_VALIDATE_10MB_BENCHMARK_ID);
  assert.equal(r.value.id, "json.stream_validate_10mb");
  assert.equal(r.value.target, JSON_STREAM_VALIDATE_10MB_BENCHMARK_TARGET);
  assert.equal(r.value.status, "passed");
  assert.equal(r.value.operations, DEFAULT_JSON_STREAM_10MB_OPERATIONS);
  assert.equal(r.value.bytes, JSON_STREAM_10MB_BYTES);
  assert.equal(r.value.score, scoreJsonStreamBenchmark(JSON_STREAM_10MB_BYTES, r.value.durationMs));
  assert.equal(Object.isFrozen(r.value), true);
});

test("timeout stops between passes; closed options refuse without echo", () => {
  const t = runJsonStreamValidate10mbBenchmark({ operations: 3, maxDurationMs: 1 });
  assert.equal(t.ok, true);
  if (t.ok) {
    assert.ok(t.value.status === "skipped_timeout" || t.value.status === "passed");
    if (t.value.status === "skipped_timeout") assert.ok(t.value.operations >= 1 && t.value.operations < 3);
  }
  const extra = runJsonStreamValidate10mbBenchmark({ operations: 1, secretTokenXYZ: "sk-live-XYZ" });
  assert.equal(codeOf(extra), FUNGI_BENCH_JSONS_001);
  assert.equal(JSON.stringify(extra).includes("XYZ"), false);
  for (const bad of [null, "x", [], 1, Number.NaN]) assert.equal(codeOf(runJsonStreamValidate10mbBenchmark(bad)), FUNGI_BENCH_JSONS_001);
  assert.equal(codeOf(runJsonStreamValidate10mbBenchmark({ operations: 0 })), FUNGI_BENCH_JSONS_002);
  assert.equal(codeOf(runJsonStreamValidate10mbBenchmark({ operations: 9 })), FUNGI_BENCH_JSONS_002);
  assert.equal(codeOf(runJsonStreamValidate10mbBenchmark({ maxDurationMs: Number.NaN })), FUNGI_BENCH_JSONS_002);
  assert.equal(typeof FUNGI_BENCH_JSONS_005, "string");
});

test("hostile getters and prototypes refuse without running getters or throwing", () => {
  let ran = false;
  const hostile = {};
  Object.defineProperty(hostile, "operations", { get() { ran = true; return 1; }, enumerable: true });
  assert.equal(codeOf(runJsonStreamValidate10mbBenchmark(hostile)), FUNGI_BENCH_JSONS_001);
  const proxy = new Proxy({ operations: 1 }, {
    ownKeys() { throw new Error("boom"); },
    getOwnPropertyDescriptor() { throw new Error("boom"); },
  });
  assert.doesNotThrow(() => runJsonStreamValidate10mbBenchmark(proxy));
  assert.equal(codeOf(runJsonStreamValidate10mbBenchmark(proxy)), FUNGI_BENCH_JSONS_001);
  class Box { constructor() { this.operations = 1; } }
  assert.equal(codeOf(runJsonStreamValidate10mbBenchmark(new Box())), FUNGI_BENCH_JSONS_001);
  assert.equal(ran, false);
});

test("passed result is admissible inside a minimal BenchmarkReport capture shape", () => {
  const r = runJsonStreamValidate10mbBenchmark();
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const report = {
    schema: "Galerina.benchmark.report.v1",
    benchmarkId: "bench_json_stream_case",
    mode: "light",
    trigger: "manual",
    loVersion: "2.0.0",
    system: { osFamily: "linux", architecture: "x64", cpuCoresBucket: "8", memoryBucket: "unknown", gpuBackend: "none", lowBitBackend: "none" },
    durationMs: r.value.durationMs,
    summary: { logic: "skipped", cpu: "skipped", json: "passed", vector: "skipped", gpu: "skipped", ai_accelerator: "skipped", low_bit_ai: "skipped", optical_io: "skipped", recovery: "skipped", compare: "skipped" },
    scores: { overall: r.value.score, json: r.value.score },
    tests: [{ id: r.value.id, target: r.value.target, status: r.value.status, durationMs: r.value.durationMs, operations: r.value.operations, score: r.value.score }],
    privacy: { shareable: false, containsPersonalData: false, machineId: "not_included", hostname: "not_included", username: "not_included", projectPath: "not_included" },
  };
  assert.deepEqual(validateBenchmarkReport(report), []);
});
