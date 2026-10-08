import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_BENCHMARK_CONFIG, validateBenchmarkConfig, validateBenchmarkReport } from "../dist/index.js";

// C40 follow-up: unknown / symbolic keys must never be echoed in diagnostics
// (message or path). Fixes #112-era validateExactKeys / report key validator.
const SECRET_KEY = "sk-live-XYZsecret";
const SYM = Symbol("symSecretXYZ");
const leaks = (diags) => {
  const text = JSON.stringify(diags);
  return text.includes("XYZsecret") || text.includes("symSecretXYZ");
};

const cleanReport = () => ({
  schema: "Galerina.benchmark.report.v1",
  benchmarkId: "b1",
  mode: "light",
  trigger: "manual",
  loVersion: "1.0.0",
  system: { osFamily: "linux", architecture: "x64", cpuCoresBucket: "8-16", memoryBucket: "16-32", gpuBackend: "none", lowBitBackend: "none" },
  durationMs: 1000,
  summary: { logic: "passed", cpu: "passed", json: "passed", vector: "passed", gpu: "skipped", ai_accelerator: "skipped", low_bit_ai: "skipped", optical_io: "skipped", recovery: "skipped", compare: "skipped" },
  scores: { overall: 42 },
  tests: [{ id: "logic.bool_branch", target: "logic", status: "passed", durationMs: 1, operations: 1, score: 1 }],
  privacy: { shareable: false, containsPersonalData: false, machineId: "not_included", hostname: "not_included", username: "not_included", projectPath: "not_included" },
});

test("validateBenchmarkReport refuses unknown keys at every level without echoing them", () => {
  assert.deepEqual(validateBenchmarkReport(cleanReport()), []);
  const cases = [];
  const top = cleanReport(); top[SECRET_KEY] = 1; cases.push([top, "Galerina_BENCHMARK_FIELD_UNKNOWN"]);
  const sym = cleanReport(); sym[SYM] = 1; cases.push([sym, "Galerina_BENCHMARK_FIELD_UNKNOWN"]);
  const sys = cleanReport(); sys.system[SECRET_KEY] = "x"; cases.push([sys, "Galerina_BENCHMARK_REPORT_FIELD_UNKNOWN"]);
  const sc = cleanReport(); sc.scores[SECRET_KEY] = 1; cases.push([sc, "Galerina_BENCHMARK_REPORT_FIELD_UNKNOWN"]);
  const row = cleanReport(); row.tests[0][SECRET_KEY] = 1; cases.push([row, "Galerina_BENCHMARK_REPORT_FIELD_UNKNOWN"]);
  const priv = cleanReport(); priv.privacy[SYM] = 1; cases.push([priv, "Galerina_BENCHMARK_REPORT_FIELD_UNKNOWN"]);
  for (const [report, code] of cases) {
    const diags = validateBenchmarkReport(report);
    const hit = diags.find((d) => d.code === code);
    assert.ok(hit, code);
    assert.match(hit.path, /\.<unknown>$/);
    assert.equal(leaks(diags), false);
  }
});

test("validateBenchmarkConfig refuses unknown keys without echoing them", () => {
  const top = { ...DEFAULT_BENCHMARK_CONFIG, [SECRET_KEY]: true, [SYM]: true };
  const nested = { ...DEFAULT_BENCHMARK_CONFIG, targets: { ...DEFAULT_BENCHMARK_CONFIG.targets, [SECRET_KEY]: true }, privacy: { ...DEFAULT_BENCHMARK_CONFIG.privacy, [SYM]: false } };
  for (const cfg of [top, nested]) {
    const diags = validateBenchmarkConfig(cfg);
    const unknown = diags.filter((d) => d.code === "Galerina_BENCHMARK_FIELD_UNKNOWN");
    assert.ok(unknown.length >= 1);
    for (const d of unknown) assert.match(d.path, /\.<unknown>$/);
    assert.equal(leaks(diags), false);
  }
});

test("known missing-field paths still name the closed expected key", () => {
  const r = cleanReport(); delete r.durationMs;
  const diags = validateBenchmarkReport(r);
  assert.ok(diags.some((d) => d.path.endsWith(".durationMs")));
});
