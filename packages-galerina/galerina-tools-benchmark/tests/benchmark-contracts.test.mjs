import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_BENCHMARK_CONFIG,
  validateBenchmarkConfig,
  isBenchmarkReportShareable,
} from "../dist/index.js";

const codes = (diags) => diags.map((d) => d.code);

describe("DEFAULT_BENCHMARK_CONFIG — privacy-preserving, bounded defaults", () => {
  it("never enables PII telemetry and defaults submit to opt-in (false)", () => {
    const p = DEFAULT_BENCHMARK_CONFIG.privacy;
    assert.equal(p.includeHostname, false);
    assert.equal(p.includeUsername, false);
    assert.equal(p.includeProjectPath, false);
    assert.equal(p.allowSubmit, false);
  });

  it("is internally consistent and self-validates clean", () => {
    assert.ok(DEFAULT_BENCHMARK_CONFIG.maxSingleTestSeconds <= DEFAULT_BENCHMARK_CONFIG.maxDurationSeconds);
    assert.deepEqual(codes(validateBenchmarkConfig(DEFAULT_BENCHMARK_CONFIG)), []);
  });
});

describe("validateBenchmarkConfig — bounded, PII-free, non-empty (fail-closed)", () => {
  it("rejects non-positive durations", () => {
    const diags = validateBenchmarkConfig({
      ...DEFAULT_BENCHMARK_CONFIG,
      maxDurationSeconds: 0,
      maxSingleTestSeconds: -1,
    });
    assert.ok(codes(diags).includes("Galerina_BENCHMARK_MAX_DURATION_REQUIRED"));
    assert.ok(codes(diags).includes("Galerina_BENCHMARK_MAX_SINGLE_TEST_REQUIRED"));
  });

  it("rejects a single-test budget that outlasts the whole run", () => {
    const diags = validateBenchmarkConfig({
      ...DEFAULT_BENCHMARK_CONFIG,
      maxDurationSeconds: 60,
      maxSingleTestSeconds: 120,
    });
    assert.deepEqual(codes(diags), ["Galerina_BENCHMARK_SINGLE_TEST_EXCEEDS_TOTAL"]);
  });

  it("rejects any PII telemetry flag being on", () => {
    // untrusted parsed config can carry values the compile-time literal type forbids
    const diags = validateBenchmarkConfig({
      ...DEFAULT_BENCHMARK_CONFIG,
      privacy: { ...DEFAULT_BENCHMARK_CONFIG.privacy, includeHostname: true },
    });
    assert.deepEqual(codes(diags), ["Galerina_BENCHMARK_PRIVACY_PII_FORBIDDEN"]);
  });

  it("rejects a config that enables no targets", () => {
    const noTargets = Object.fromEntries(
      Object.keys(DEFAULT_BENCHMARK_CONFIG.targets).map((k) => [k, false]),
    );
    const diags = validateBenchmarkConfig({ ...DEFAULT_BENCHMARK_CONFIG, targets: noTargets });
    assert.deepEqual(codes(diags), ["Galerina_BENCHMARK_NO_TARGETS"]);
  });
});

describe("isBenchmarkReportShareable — default-deny", () => {
  const cleanReport = {
    schema: "Galerina.benchmark.report.v1",
    benchmarkId: "b1",
    mode: "light",
    trigger: "manual",
    loVersion: "1.0.0",
    system: {
      osFamily: "linux", architecture: "x64", cpuCoresBucket: "8-16",
      memoryBucket: "16-32", gpuBackend: "none", lowBitBackend: "none",
    },
    durationMs: 1000,
    summary: {},
    scores: { overall: 42 },
    tests: [],
    privacy: {
      shareable: true,
      containsPersonalData: false,
      machineId: "not_included",
      hostname: "not_included",
      username: "not_included",
      projectPath: "not_included",
    },
  };

  it("is not shareable when the operator has not opted in", () => {
    assert.equal(isBenchmarkReportShareable(cleanReport, DEFAULT_BENCHMARK_CONFIG), false);
  });

  it("is shareable only with opt-in AND a provably PII-free report", () => {
    const optIn = {
      ...DEFAULT_BENCHMARK_CONFIG,
      privacy: { ...DEFAULT_BENCHMARK_CONFIG.privacy, allowSubmit: true },
    };
    assert.equal(isBenchmarkReportShareable(cleanReport, optIn), true);
  });

  it("stays deny even with opt-in when the report claims personal data", () => {
    const optIn = {
      ...DEFAULT_BENCHMARK_CONFIG,
      privacy: { ...DEFAULT_BENCHMARK_CONFIG.privacy, allowSubmit: true },
    };
    const leaky = { ...cleanReport, privacy: { ...cleanReport.privacy, containsPersonalData: true } };
    assert.equal(isBenchmarkReportShareable(leaky, optIn), false);
  });
});
