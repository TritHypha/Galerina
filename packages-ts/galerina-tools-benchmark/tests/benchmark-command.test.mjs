import assert from "node:assert/strict";
import test from "node:test";
import {
  BENCHMARK_COMMAND_EXIT,
  BENCHMARK_REPORT_FILE,
  DEFAULT_BENCHMARK_CONFIG,
  FUNGI_BENCH_CMD_001,
  FUNGI_BENCH_RUN_002,
  Galerina_BENCHMARK_CLI_001,
  Galerina_BENCHMARK_CLI_003,
  runBenchmarkCommand,
  validateBenchmarkReport,
} from "../dist/index.js";

const SYSTEM = { osFamily: "linux", architecture: "x64", cpuCoresBucket: "8", memoryBucket: "unknown", gpuBackend: "none", lowBitBackend: "none" };

function fastConfig() {
  const c = structuredClone(DEFAULT_BENCHMARK_CONFIG);
  return { ...c, targets: { ...c.targets, cpu: false, json: false } };
}

function host(extra = {}) {
  let t = 0;
  return { benchmarkId: "bench_cmd_001", loVersion: "2.0.0", system: SYSTEM, config: fastConfig(), now: () => (t += 1), ...extra };
}

function writer(outcome = "CREATED") {
  const calls = [];
  return { calls, w: { createExclusive: async (req) => { calls.push(req); return { outcome }; } } };
}

test("default argv runs the light runner and prints the summary lines", async () => {
  const r = await runBenchmarkCommand([], host());
  assert.equal(r.exitCode, BENCHMARK_COMMAND_EXIT.ok);
  assert.equal(r.lines[0], "galerina benchmark summary");
  assert.ok(r.lines.some((l) => l.startsWith("id=bench_cmd_001 mode=light")));
  assert.deepEqual(validateBenchmarkReport(r.report), []);
  assert.deepEqual(r.diagnostics, []);
});

test("--json prints the rendered report as one line block that parses back", async () => {
  const r = await runBenchmarkCommand(["--json"], host());
  assert.equal(r.exitCode, 0);
  assert.equal(r.lines.length, 1);
  const parsed = JSON.parse(r.lines[0]);
  assert.deepEqual(validateBenchmarkReport(parsed), []);
  assert.equal(parsed.benchmarkId, "bench_cmd_001");
});

test("--full is refused by the light runner (exit 2)", async () => {
  const r = await runBenchmarkCommand(["--full"], host());
  assert.equal(r.exitCode, BENCHMARK_COMMAND_EXIT.refused);
  assert.equal(r.diagnostics[0].code, FUNGI_BENCH_RUN_002);
  assert.equal(r.report, undefined);
});

test("argv parse refusals exit 2 and never echo the token", async () => {
  const marker = "SECRETMARKER";
  for (const argv of [[`--${marker}`], ["--save"], "x", [marker]]) {
    const r = await runBenchmarkCommand(argv, host());
    assert.equal(r.exitCode, 2);
    assert.ok([Galerina_BENCHMARK_CLI_001, Galerina_BENCHMARK_CLI_003].includes(r.diagnostics[0].code), JSON.stringify(r.diagnostics));
    assert.ok(!JSON.stringify(r).includes(marker));
  }
});

test("a malformed host record exits 2 with CMD-001", async () => {
  for (const h of [null, [], "h", { ...host(), extra: 1 }, Object.create(host())]) {
    const r = await runBenchmarkCommand([], h);
    assert.equal(r.exitCode, 2);
    assert.equal(r.diagnostics[0].code, FUNGI_BENCH_CMD_001);
  }
  const accessor = host();
  Object.defineProperty(accessor, "system", { enumerable: true, get() { throw new Error("must not run"); } });
  assert.equal((await runBenchmarkCommand([], accessor)).diagnostics[0].code, FUNGI_BENCH_CMD_001);
});

test("--save --out writes benchmark-report.json through the host writer", async () => {
  const { calls, w } = writer("CREATED");
  const r = await runBenchmarkCommand(["--save", "--out", "reports/bench"], host({ writer: w }));
  assert.equal(r.exitCode, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].outDir, "reports/bench");
  assert.equal(calls[0].fileName, BENCHMARK_REPORT_FILE);
  assert.deepEqual(validateBenchmarkReport(JSON.parse(calls[0].contents)), []);
});

test("--save failures exit 4, keep the report, and never claim a write", async () => {
  for (const outcome of ["EXISTS", "DIR_INVALID", "IO_FAILED", "bogus"]) {
    const { w } = writer(outcome);
    const r = await runBenchmarkCommand(["--save", "--out", "out"], host({ writer: w }));
    assert.equal(r.exitCode, BENCHMARK_COMMAND_EXIT.saveFailed, outcome);
    assert.ok(r.report);
    assert.ok(r.diagnostics.length > 0);
  }
  const missing = await runBenchmarkCommand(["--save", "--out", "out"], host());
  assert.equal(missing.exitCode, 4);
  assert.equal(missing.diagnostics[0].code, "Galerina_BENCHMARK_REPORT_WRITE_WRITER_INVALID");
});

test("runner refusals (bad system) exit 2", async () => {
  const r = await runBenchmarkCommand([], host({ system: {} }));
  assert.equal(r.exitCode, 2);
  assert.equal(r.diagnostics[0].code, "FUNGI-BENCH-RUN-005");
});