import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  FUNGI_BENCH_SHA_001,
  FUNGI_BENCH_SHA_002,
  FUNGI_BENCH_SHA_005,
  SHA256_32MB_BENCHMARK_ID,
  SHA256_32MB_BENCHMARK_TARGET,
  SHA256_32MB_BYTES,
  DEFAULT_SHA256_32MB_OPERATIONS,
  benchSha256Hex,
  buildSha256BenchmarkBuffer,
  runSha256Benchmark,
  scoreSha256Benchmark,
  validateBenchmarkReport,
} from "../dist/index.js";

const codeOf = (r) => (r.ok ? "ok" : r.diagnostics[0]?.code);
const enc = (s) => new TextEncoder().encode(s);
const ref = (u8) => createHash("sha256").update(u8).digest("hex");

test("pure SHA-256 matches FIPS vectors and node:crypto across padding boundaries", () => {
  assert.equal(benchSha256Hex(enc("")), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(benchSha256Hex(enc("abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(
    benchSha256Hex(enc("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")),
    "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
  );
  for (const n of [1, 55, 56, 57, 63, 64, 65, 119, 120, 128, 1000]) {
    const u8 = new Uint8Array(n).map((_, i) => (i * 7 + 3) & 255);
    assert.equal(benchSha256Hex(u8), ref(u8), `len ${n}`);
  }
  assert.equal(benchSha256Hex("abc"), undefined);
  assert.equal(benchSha256Hex(null), undefined);
});

test("generated 32 MiB buffer is deterministic and digest matches node:crypto", () => {
  const buf = buildSha256BenchmarkBuffer();
  assert.ok(buf instanceof Uint8Array);
  assert.equal(buf.length, SHA256_32MB_BYTES);
  assert.equal(buf.length, 33_554_432);
  assert.equal(benchSha256Hex(buf), ref(buf));
});

test("runSha256Benchmark passes with README id/target", () => {
  const r = runSha256Benchmark({ operations: 1 });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.value.id, SHA256_32MB_BENCHMARK_ID);
  assert.equal(r.value.id, "cpu.hash_sha256_32mb");
  assert.equal(r.value.target, SHA256_32MB_BENCHMARK_TARGET);
  assert.equal(r.value.status, "passed");
  assert.equal(r.value.operations, 1);
  assert.equal(r.value.operations, DEFAULT_SHA256_32MB_OPERATIONS);
  assert.equal(r.value.bytes, SHA256_32MB_BYTES);
  assert.equal(r.value.score, scoreSha256Benchmark(SHA256_32MB_BYTES, r.value.durationMs));
  assert.equal(Object.isFrozen(r.value), true);
});

test("timeout option stops between passes as skipped_timeout without throwing", () => {
  const r = runSha256Benchmark({ operations: 3, maxDurationMs: 1 });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.ok(r.value.status === "skipped_timeout" || r.value.status === "passed");
  if (r.value.status === "skipped_timeout") assert.ok(r.value.operations >= 1 && r.value.operations < 3);
});

test("closed options refuse unknown keys, null, NaN and out-of-range without echo", () => {
  const extra = runSha256Benchmark({ operations: 1, secretTokenXYZ: "sk-live-XYZ" });
  assert.equal(codeOf(extra), FUNGI_BENCH_SHA_001);
  assert.equal(JSON.stringify(extra).includes("XYZ"), false);
  for (const bad of [null, "x", [], 1, Number.NaN]) {
    assert.equal(codeOf(runSha256Benchmark(bad)), FUNGI_BENCH_SHA_001);
  }
  assert.equal(codeOf(runSha256Benchmark({ operations: 0 })), FUNGI_BENCH_SHA_002);
  assert.equal(codeOf(runSha256Benchmark({ operations: 9 })), FUNGI_BENCH_SHA_002);
  assert.equal(codeOf(runSha256Benchmark({ operations: Number.NaN })), FUNGI_BENCH_SHA_002);
  assert.equal(codeOf(runSha256Benchmark({ maxDurationMs: 0 })), FUNGI_BENCH_SHA_002);
  assert.equal(typeof FUNGI_BENCH_SHA_005, "string");
});

test("hostile getters and prototypes refuse without running getters or throwing", () => {
  let ran = false;
  const hostile = {};
  Object.defineProperty(hostile, "operations", { get() { ran = true; return 1; }, enumerable: true });
  assert.equal(codeOf(runSha256Benchmark(hostile)), FUNGI_BENCH_SHA_001);
  const proxy = new Proxy({ operations: 1 }, {
    ownKeys() { throw new Error("boom"); },
    getOwnPropertyDescriptor() { throw new Error("boom"); },
  });
  assert.doesNotThrow(() => runSha256Benchmark(proxy));
  assert.equal(codeOf(runSha256Benchmark(proxy)), FUNGI_BENCH_SHA_001);
  class Box { constructor() { this.operations = 1; } }
  assert.equal(codeOf(runSha256Benchmark(new Box())), FUNGI_BENCH_SHA_001);
  assert.equal(ran, false);
});

test("passed result is admissible inside a minimal BenchmarkReport capture shape", () => {
  const r = runSha256Benchmark();
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const report = {
    schema: "Galerina.benchmark.report.v1",
    benchmarkId: "bench_sha256_case",
    mode: "light",
    trigger: "manual",
    loVersion: "2.0.0",
    system: { osFamily: "linux", architecture: "x64", cpuCoresBucket: "8", memoryBucket: "unknown", gpuBackend: "none", lowBitBackend: "none" },
    durationMs: r.value.durationMs,
    summary: { logic: "skipped", cpu: "passed", json: "skipped", vector: "skipped", gpu: "skipped", ai_accelerator: "skipped", low_bit_ai: "skipped", optical_io: "skipped", recovery: "skipped", compare: "skipped" },
    scores: { overall: r.value.score, cpu: r.value.score },
    tests: [{ id: r.value.id, target: r.value.target, status: r.value.status, durationMs: r.value.durationMs, operations: r.value.operations, score: r.value.score }],
    privacy: { shareable: false, containsPersonalData: false, machineId: "not_included", hostname: "not_included", username: "not_included", projectPath: "not_included" },
  };
  assert.deepEqual(validateBenchmarkReport(report), []);
});
