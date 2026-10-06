import assert from "node:assert/strict";
import test from "node:test";
import {
  BENCHMARK_RUNNER_REASONS,
  DEFAULT_BENCHMARK_CONFIG,
  FUNGI_BENCH_RUN_001,
  FUNGI_BENCH_RUN_002,
  FUNGI_BENCH_RUN_003,
  FUNGI_BENCH_RUN_004,
  FUNGI_BENCH_RUN_005,
  LIGHT_BENCHMARK_CASE_IDS,
  createShareableBenchmarkReport,
  formatBenchmarkSummary,
  runLightBenchmark,
  validateBenchmarkReport,
} from "../dist/index.js";

const SYSTEM = {
  osFamily: "linux",
  architecture: "x64",
  cpuCoresBucket: "8",
  memoryBucket: "unknown",
  gpuBackend: "none",
  lowBitBackend: "none",
};

function config(overrides = {}) {
  const base = structuredClone(DEFAULT_BENCHMARK_CONFIG);
  return { ...base, ...overrides, targets: { ...base.targets, ...(overrides.targets ?? {}) } };
}

/** Only the fast logic + vector targets enabled. */
const FAST = { cpu: false, json: false };

function counterClock(step = 1) {
  let t = 1000;
  return () => (t += step);
}

function input(overrides = {}) {
  return {
    benchmarkId: "bench_test_001",
    loVersion: "2.0.0",
    system: SYSTEM,
    config: config({ targets: FAST }),
    now: counterClock(),
    ...overrides,
  };
}

const byId = (report) => new Map(report.tests.map((t) => [t.id, t]));

test("fast light run produces a report that passes validateBenchmarkReport", () => {
  const r = runLightBenchmark(input());
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(validateBenchmarkReport(r.report), []);
  assert.equal(r.report.schema, "Galerina.benchmark.report.v1");
  assert.equal(r.report.mode, "light");
  assert.equal(r.report.trigger, "manual");
  assert.deepEqual(r.report.tests.map((t) => t.id), [...LIGHT_BENCHMARK_CASE_IDS]);
  const t = byId(r.report);
  for (const id of ["logic.bool_branch", "logic.tri_match", "logic.result_option", "vector.dot_product_small", "vector.cosine_batch_small"]) {
    assert.equal(t.get(id).status, "passed", id);
    assert.ok(t.get(id).score > 0, id);
  }
  assert.equal(t.get("logic.logic5_match").reason, BENCHMARK_RUNNER_REASONS.parked);
  assert.equal(t.get("cpu.integer_loop").reason, BENCHMARK_RUNNER_REASONS.disabled);
  assert.equal(t.get("gpu.vector_small_if_available").reason, BENCHMARK_RUNNER_REASONS.detectionPending);
  assert.equal(r.report.summary.logic, "partial"); // logic5 parked
  assert.equal(r.report.summary.vector, "passed");
  assert.equal(r.report.summary.cpu, "skipped");
  assert.equal(r.report.summary.gpu, "skipped");
  assert.equal(r.report.summary.recovery, "skipped");
  assert.equal(r.report.summary.compare, "skipped");
  assert.equal(r.report.privacy.shareable, false);
  assert.ok(!("cpu" in r.report.scores));
  assert.equal(r.report.scores.overall, Math.floor((r.report.scores.logic + r.report.scores.vector) / 2));
  assert.ok(!r.report.tests.some((x) => x.id.startsWith("compute.")));
});

test("the report flows through the existing summary and shareable helpers", () => {
  const r = runLightBenchmark(input());
  assert.ok(formatBenchmarkSummary(r.report).length > 0);
  const shared = createShareableBenchmarkReport(r.report, config({ privacy: { ...DEFAULT_BENCHMARK_CONFIG.privacy, allowSubmit: false } }));
  assert.ok(shared);
});

test("full default light run (all CPU/JSON cases) validates", () => {
  const r = runLightBenchmark(input({ config: config() }));
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(validateBenchmarkReport(r.report), []);
  const t = byId(r.report);
  for (const id of ["cpu.integer_loop", "cpu.float_loop", "cpu.hash_sha256_32mb", "json.decode_validate_1mb", "json.stream_validate_10mb"]) {
    assert.ok(["passed", "skipped_timeout"].includes(t.get(id).status), id);
  }
  assert.equal(t.get("cpu.record_validate").reason, BENCHMARK_RUNNER_REASONS.notImplemented);
});

test("a spent total budget skips every remaining runnable case without running it", () => {
  const r = runLightBenchmark(input({ config: config({ maxDurationSeconds: 1, maxSingleTestSeconds: 1, targets: FAST }), now: counterClock(5000) }));
  assert.equal(r.ok, true);
  const t = byId(r.report);
  assert.equal(t.get("logic.bool_branch").status, "passed");
  for (const id of ["logic.tri_match", "logic.result_option", "vector.dot_product_small", "vector.cosine_batch_small"]) {
    assert.equal(t.get(id).status, "skipped_timeout", id);
    assert.equal(t.get(id).reason, BENCHMARK_RUNNER_REASONS.budget);
    assert.ok(!("score" in t.get(id)));
  }
  assert.equal(r.report.summary.vector, "skipped");
  assert.equal(r.report.summary.logic, "partial");
});

test("only light mode is admitted", () => {
  for (const mode of ["full", "stress", "LIGHT", 1]) {
    const r = runLightBenchmark(input({ mode }));
    assert.equal(r.ok, false);
    assert.equal(r.diagnostics[0].code, FUNGI_BENCH_RUN_002);
  }
});

test("refuses malformed input records and fields without echoing values", () => {
  const marker = "SECRETMARKER";
  const cases = [
    undefined, null, [], "x", Object.create({ benchmarkId: "a" }),
    { ...input(), extra: marker },
    input({ benchmarkId: `${marker} has spaces` }),
    input({ benchmarkId: "" }),
    input({ loVersion: "a/b" }),
    input({ trigger: marker }),
    input({ now: 5 }),
  ];
  for (const c of cases) {
    const r = runLightBenchmark(c);
    assert.equal(r.ok, false);
    assert.equal(r.diagnostics[0].code, FUNGI_BENCH_RUN_001);
    assert.ok(!JSON.stringify(r).includes(marker));
  }
  const accessor = input();
  Object.defineProperty(accessor, "benchmarkId", { get() { throw new Error("must not run"); }, enumerable: true });
  assert.equal(runLightBenchmark(accessor).diagnostics[0].code, FUNGI_BENCH_RUN_001);
});

test("refuses an invalid config", () => {
  for (const bad of [{}, config({ maxDurationSeconds: 0 }), config({ maxSingleTestSeconds: 999 })]) {
    const r = runLightBenchmark(input({ config: bad }));
    assert.equal(r.ok, false);
    assert.equal(r.diagnostics[0].code, FUNGI_BENCH_RUN_003);
  }
});

test("refuses a throwing, non-finite or backwards clock", () => {
  let n = 0;
  const backwards = () => (n++ === 0 ? 10_000 : 1);
  for (const now of [() => { throw new Error("x"); }, () => NaN, () => -1, backwards]) {
    const r = runLightBenchmark(input({ now }));
    assert.equal(r.ok, false);
    assert.equal(r.diagnostics[0].code, FUNGI_BENCH_RUN_004);
  }
});

test("refuses when the injected system record fails report validation", () => {
  for (const system of [{}, { ...SYSTEM, hostname: "box" }, { ...SYSTEM, osFamily: "a\u0001b" }, null]) {
    const r = runLightBenchmark(input({ system }));
    assert.equal(r.ok, false);
    assert.equal(r.diagnostics[0].code, FUNGI_BENCH_RUN_005);
  }
});

test("trigger and explicit light mode are carried through", () => {
  const r = runLightBenchmark(input({ mode: "light", trigger: "ci" }));
  assert.equal(r.ok, true);
  assert.equal(r.report.trigger, "ci");
});