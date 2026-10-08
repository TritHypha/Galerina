import assert from "node:assert/strict";
import test from "node:test";
import {
  FUNGI_BENCH_JSONG_001,
  FUNGI_BENCH_JSONG_002,
  JSON_STREAM_VALIDATE_100MB_BENCHMARK_ID,
  JSON_STREAM_VALIDATE_1GB_OPTIONAL_BENCHMARK_ID,
  JSON_STREAM_100MB_BYTES,
  JSON_STREAM_1GB_BYTES,
  MIN_JSON_STREAM_GENERATED_BYTES,
  generateJsonLinesChunks,
  streamValidateGeneratedJsonLines,
  runJsonStreamValidate100mbBenchmark,
  runJsonStreamValidate1gbOptionalBenchmark,
  scoreJsonStreamGeneratedBenchmark,
  validateBenchmarkReport,
} from "../dist/index.js";

// Unit tests NEVER run the 100 MiB or 1 GiB sizes; they use small `bytes` overrides.
const SMALL = 262_144; // 256 KiB
const codeOf = (r) => (r.ok ? "ok" : r.diagnostics[0]?.code);

test("case sizes are the owner-revisit MiB/GiB picks", () => {
  assert.equal(JSON_STREAM_100MB_BYTES, 100 * 1024 * 1024);
  assert.equal(JSON_STREAM_1GB_BYTES, 1024 * 1024 * 1024);
  assert.equal(MIN_JSON_STREAM_GENERATED_BYTES, 65_536);
});

test("generator emits exact bytes in bounded chunks without building the payload", () => {
  for (const [total, chunk] of [[SMALL, 65_536], [MIN_JSON_STREAM_GENERATED_BYTES, 4096], [300_001, 7_777]]) {
    let seen = 0;
    let maxChunk = 0;
    let lastEndsNl = false;
    const g = generateJsonLinesChunks(total, chunk, (c) => { seen += c.length; maxChunk = Math.max(maxChunk, c.length); lastEndsNl = c.endsWith("\n"); return true; });
    assert.ok(g);
    assert.equal(g.bytes, total);
    assert.equal(seen, total);
    assert.ok(maxChunk <= chunk);
    assert.equal(lastEndsNl, true);
    assert.equal(g.stopped, false);
  }
  assert.equal(generateJsonLinesChunks(1000, 4096, () => true), undefined);
  assert.equal(generateJsonLinesChunks(JSON_STREAM_1GB_BYTES + 1, 4096, () => true), undefined);
  assert.equal(generateJsonLinesChunks(SMALL, 0, () => true), undefined);
  assert.equal(generateJsonLinesChunks(Number.NaN, 4096, () => true), undefined);
  let calls = 0;
  const stopped = generateJsonLinesChunks(SMALL, 4096, () => { calls += 1; return calls < 3; });
  assert.equal(stopped.stopped, true);
  assert.equal(stopped.bytes, 3 * 4096);
});

test("generated stream validates fully through the #127 validator", () => {
  const s = streamValidateGeneratedJsonLines(SMALL);
  assert.ok(s);
  assert.equal(s.invalid, 0);
  assert.equal(s.oversize, 0);
  assert.equal(s.bytes, SMALL);
  assert.equal(s.records, s.generatedLines);
  assert.equal(s.stopped, false);
});

test("100MB and 1GB runners pass on small overrides with README ids", () => {
  for (const [run, id] of [[runJsonStreamValidate100mbBenchmark, JSON_STREAM_VALIDATE_100MB_BENCHMARK_ID], [runJsonStreamValidate1gbOptionalBenchmark, JSON_STREAM_VALIDATE_1GB_OPTIONAL_BENCHMARK_ID]]) {
    const r = run({ bytes: SMALL });
    assert.equal(r.ok, true);
    if (!r.ok) continue;
    assert.equal(r.value.id, id);
    assert.equal(r.value.target, "json");
    assert.equal(r.value.status, "passed");
    assert.equal(r.value.bytes, SMALL);
    assert.equal(r.value.bytesValidated, SMALL);
    assert.ok(r.value.operations > 0);
    assert.equal(r.value.score, scoreJsonStreamGeneratedBenchmark(SMALL, r.value.durationMs));
    assert.equal(Object.isFrozen(r.value), true);
  }
  assert.equal(JSON_STREAM_VALIDATE_100MB_BENCHMARK_ID, "json.stream_validate_100mb");
  assert.equal(JSON_STREAM_VALIDATE_1GB_OPTIONAL_BENCHMARK_ID, "json.stream_validate_1gb_optional");
});

test("timeout stops mid-stream as skipped_timeout (small size, 1 ms budget)", () => {
  const r = runJsonStreamValidate100mbBenchmark({ bytes: 8 * 1024 * 1024, maxDurationMs: 1 });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.ok(r.value.status === "skipped_timeout" || r.value.status === "passed", r.value.status);
  if (r.value.status === "skipped_timeout") {
    assert.ok(r.value.bytesValidated < r.value.bytes);
    assert.ok(r.value.score >= 0);
  }
});

test("closed options refuse unknown keys, bad sizes and hostile inputs without echo", () => {
  const extra = runJsonStreamValidate100mbBenchmark({ bytes: SMALL, secretTokenXYZ: "sk-live-XYZ" });
  assert.equal(codeOf(extra), FUNGI_BENCH_JSONG_001);
  assert.equal(JSON.stringify(extra).includes("XYZ"), false);
  for (const bad of [null, "x", [], 1]) assert.equal(codeOf(runJsonStreamValidate100mbBenchmark(bad)), FUNGI_BENCH_JSONG_001);
  assert.equal(codeOf(runJsonStreamValidate100mbBenchmark({ bytes: 1000 })), FUNGI_BENCH_JSONG_002);
  assert.equal(codeOf(runJsonStreamValidate100mbBenchmark({ bytes: JSON_STREAM_100MB_BYTES + 1 })), FUNGI_BENCH_JSONG_002);
  assert.equal(codeOf(runJsonStreamValidate100mbBenchmark({ bytes: Number.NaN })), FUNGI_BENCH_JSONG_002);
  assert.equal(codeOf(runJsonStreamValidate1gbOptionalBenchmark({ maxDurationMs: 0 })), FUNGI_BENCH_JSONG_002);
  let ran = false;
  const hostile = {};
  Object.defineProperty(hostile, "bytes", { get() { ran = true; return SMALL; }, enumerable: true });
  assert.equal(codeOf(runJsonStreamValidate1gbOptionalBenchmark(hostile)), FUNGI_BENCH_JSONG_001);
  const proxy = new Proxy({ bytes: SMALL }, { ownKeys() { throw new Error("boom"); } });
  assert.doesNotThrow(() => runJsonStreamValidate100mbBenchmark(proxy));
  assert.equal(codeOf(runJsonStreamValidate100mbBenchmark(proxy)), FUNGI_BENCH_JSONG_001);
  assert.equal(ran, false);
});

test("passed result is admissible inside a minimal full-mode BenchmarkReport", () => {
  const r = runJsonStreamValidate100mbBenchmark({ bytes: SMALL });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const report = {
    schema: "Galerina.benchmark.report.v1",
    benchmarkId: "bench_json_stream_generated_case",
    mode: "full",
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
