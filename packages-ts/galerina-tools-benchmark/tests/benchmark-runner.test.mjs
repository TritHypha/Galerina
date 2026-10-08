import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  BENCHMARK_RUNNER_REASONS,
  DEFAULT_BENCHMARK_CONFIG,
  FUNGI_BENCH_RUN_001,
  FUNGI_BENCH_RUN_002,
  FUNGI_BENCH_RUN_003,
  FUNGI_BENCH_RUN_004,
  FUNGI_BENCH_RUN_005,
  FUNGI_BENCH_RUN_006,
  LIGHT_BENCHMARK_CASE_IDS,
  LIGHT_BENCHMARK_RUN_GROUPS,
  createLightBenchmarkRunner,
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

// ---- SuperGrok C72 review gaps (2026-10-06) ----

test("C72 gap 1: an availability-gated target set to \"optional\" behaves differently from one set to true", () => {
  const run = (gpu) => runLightBenchmark(input({ config: config({ targets: { ...FAST, gpu } }) }));
  const required = run(true);
  const optional = run("optional");
  const disabled = run(false);
  for (const r of [required, optional, disabled]) {
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual(validateBenchmarkReport(r.report), []);
  }
  const req = byId(required.report).get("gpu.vector_small_if_available");
  const opt = byId(optional.report).get("gpu.vector_small_if_available");
  const off = byId(disabled.report).get("gpu.vector_small_if_available");
  assert.deepEqual([req.status, req.reason], ["failed", BENCHMARK_RUNNER_REASONS.requiredUnavailable]);
  assert.deepEqual([opt.status, opt.reason], ["skipped", BENCHMARK_RUNNER_REASONS.detectionPending]);
  assert.deepEqual([off.status, off.reason], ["skipped", BENCHMARK_RUNNER_REASONS.disabled]);
  assert.equal(required.report.summary.gpu, "failed");
  assert.equal(optional.report.summary.gpu, "skipped");
  assert.notDeepEqual(required.report.summary, optional.report.summary);
  assert.ok(!("score" in req));
  // Runnable targets: true and "optional" both run the cases.
  const logicOptional = runLightBenchmark(input({ config: config({ targets: { ...FAST, logic: "optional" } }) }));
  assert.equal(byId(logicOptional.report).get("logic.bool_branch").status, "passed");
});

test("C72 gap 2: a case that throws ends failed (refused), never passed, and its message is not echoed", () => {
  const marker = "SECRETBOOM";
  const boom = () => { throw new Error(marker); };
  const single = createLightBenchmarkRunner({ "logic.bool_branch": boom })(input());
  assert.equal(single.ok, true, JSON.stringify(single));
  assert.deepEqual(validateBenchmarkReport(single.report), []);
  const row = byId(single.report).get("logic.bool_branch");
  assert.deepEqual([row.status, row.reason], ["failed", BENCHMARK_RUNNER_REASONS.refused]);
  assert.ok(!("score" in row));
  assert.equal(single.report.summary.logic, "failed");
  assert.equal(byId(single.report).get("logic.tri_match").status, "passed"); // other cases still run
  assert.ok(!JSON.stringify(single).includes(marker));

  const group = createLightBenchmarkRunner({ "vector.dot_product_small": boom })(input());
  for (const id of ["vector.dot_product_small", "vector.cosine_batch_small"]) {
    assert.equal(byId(group.report).get(id).status, "failed", id);
  }
  assert.equal(group.report.summary.vector, "failed");

  // A case that claims "passed" for the wrong id, or returns junk, is not passed either.
  const forged = () => ({ ok: true, value: { id: "logic.tri_match", target: "logic", status: "passed", durationMs: 1, operations: 1, score: 100 } });
  for (const run of [forged, () => undefined, () => ({ ok: false }), () => ({ ok: true, value: { id: "logic.bool_branch", target: "logic", status: "PASSED" } })]) {
    const r = createLightBenchmarkRunner({ "logic.bool_branch": run })(input());
    assert.equal(byId(r.report).get("logic.bool_branch").status, "failed");
  }
});

test("C72 gap 3: the 60-second per-case cap is reached under a fake clock (no real wait)", () => {
  const wallStart = Date.now();
  let t = 0;
  const fakeNow = () => t;
  const seen = [];
  const burnToCap = (id) => ({ maxDurationMs }) => {
    seen.push(maxDurationMs);
    const start = t;
    while (t - start <= maxDurationMs) t += 1_000; // fake time only
    return { ok: true, value: { id, target: "logic", status: "skipped_timeout", durationMs: t - start, operations: 1, score: 0 } };
  };
  const runner = createLightBenchmarkRunner({
    "logic.bool_branch": burnToCap("logic.bool_branch"),
    "logic.tri_match": burnToCap("logic.tri_match"),
    "logic.result_option": burnToCap("logic.result_option"),
  });
  // maxSingleTestSeconds 120 asks for more than the module cap; the runner must clamp to 60 000 ms.
  const r = runner(input({ now: fakeNow, config: config({ maxDurationSeconds: 180, maxSingleTestSeconds: 120, targets: FAST }) }));
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(validateBenchmarkReport(r.report), []);
  assert.deepEqual(seen, [60_000, 60_000, 60_000]);
  const tests = byId(r.report);
  for (const id of ["logic.bool_branch", "logic.tri_match", "logic.result_option"]) {
    assert.equal(tests.get(id).status, "skipped_timeout", id);
    assert.ok(tests.get(id).durationMs > 60_000, id);
  }
  // Three capped cases spend the 180 s total budget, so the vector cases never run.
  for (const id of ["vector.dot_product_small", "vector.cosine_batch_small"]) {
    assert.deepEqual([tests.get(id).status, tests.get(id).reason], ["skipped_timeout", BENCHMARK_RUNNER_REASONS.budget], id);
  }
  assert.ok(r.report.durationMs >= 180_000);
  assert.ok(Date.now() - wallStart < 5_000, "fake clock: no real 60-second wait");

  // A smaller maxSingleTestSeconds is honoured below the cap.
  const small = [];
  createLightBenchmarkRunner({ "logic.bool_branch": ({ maxDurationMs }) => { small.push(maxDurationMs); return { ok: false }; } })(
    input({ config: config({ maxSingleTestSeconds: 20, targets: FAST }) }));
  assert.deepEqual(small, [20_000]);
});

test("createLightBenchmarkRunner refuses an invalid override set without echo", () => {
  const marker = "SECRETKEY";
  for (const cases of [null, [], 5, { [marker]: () => {} }, { "logic.bool_branch": marker }, { "logic.tri_match": undefined }, { "cpu.float_loop": () => {} }]) {
    const r = createLightBenchmarkRunner(cases)(input());
    assert.equal(r.ok, false);
    assert.equal(r.diagnostics[0].code, FUNGI_BENCH_RUN_006);
    assert.ok(!JSON.stringify(r).includes(marker));
  }
  assert.deepEqual([...LIGHT_BENCHMARK_RUN_GROUPS], [
    "logic.bool_branch", "logic.tri_match", "logic.result_option", "cpu.integer_loop", "cpu.hash_sha256_32mb",
    "json.decode_validate_1mb", "json.stream_validate_10mb", "vector.dot_product_small",
  ]);
  assert.equal(createLightBenchmarkRunner(undefined)(input()).ok, true);
});

test("the runner module stays free of filesystem, environment and network access", () => {
  const src = readFileSync(new URL("../dist/benchmark-runner.js", import.meta.url), "utf8");
  const imports = [...src.matchAll(/\bfrom\s+["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']/g)].map((m) => m[1] ?? m[2]);
  assert.ok(imports.length > 0);
  for (const spec of imports) assert.ok(spec.startsWith("./"), spec);
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const banned of [/\bprocess\b/, /\brequire\s*\(/, /\bfetch\s*\(/, /\bglobalThis\b/, /\bDeno\b/, /node:/]) {
    assert.ok(!banned.test(code), String(banned));
  }
});