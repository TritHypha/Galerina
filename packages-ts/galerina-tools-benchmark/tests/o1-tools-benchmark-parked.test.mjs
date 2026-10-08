import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  BENCHMARK_LOW_BIT_BACKENDS,
  BENCHMARK_O1_AVAILABILITY,
  BENCHMARK_RUNNER_REASONS,
  DEFAULT_BENCHMARK_CONFIG,
  detectBenchmarkAiAcceleratorBackend,
  detectBenchmarkGpuBackend,
  detectBenchmarkLowBitBackend,
  detectBenchmarkOpticalIoBackend,
  runLightBenchmark,
  validateBenchmarkReport,
} from "../dist/index.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

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

function counterClock(step = 1) {
  let t = 1000;
  return () => (t += step);
}

function input(overrides = {}) {
  return {
    benchmarkId: "bench_test_001",
    loVersion: "2.0.0",
    system: SYSTEM,
    config: config({ targets: { cpu: false, json: false } }),
    now: counterClock(),
    ...overrides,
  };
}

const GATED = [
  ["gpu", "gpu.vector_small_if_available"],
  ["ai_accelerator", "ai_accelerator.llm_batch_if_available"],
  ["low_bit_ai", "low_bit_ai.reference_small_if_available"],
  ["optical_io", "optical_io.latency_small_if_available"],
];

describe("O1 parked backend detectors stay fail-closed", () => {
  it("freezes availability to unavailable|unknown and never admits available", () => {
    assert.deepEqual([...BENCHMARK_O1_AVAILABILITY], ["unavailable", "unknown"]);
    assert.equal(BENCHMARK_O1_AVAILABILITY.includes("available"), false);
  });

  it("GPU / AI / optical empty probes are unavailable; claimed vendor stays unavailable", () => {
    for (const detect of [
      detectBenchmarkGpuBackend,
      detectBenchmarkAiAcceleratorBackend,
      detectBenchmarkOpticalIoBackend,
    ]) {
      const empty = detect({});
      assert.equal(empty.availability, "unavailable");
      const claimed = detect({ claimed: "cuda" });
      assert.equal(claimed.availability, "unavailable");
      assert.equal(JSON.stringify(claimed).includes("cuda"), false);
      const unknownKey = detect({ vendor: "nvidia" });
      assert.equal(unknownKey.availability, "unavailable");
      assert.ok(unknownKey.diagnostics.some((d) => d.code === "Galerina_BENCHMARK_PROBE_FIELD_UNKNOWN"));
      const hostile = {};
      Object.defineProperty(hostile, "claimed", { enumerable: true, get() { return "cuda"; } });
      const acc = detect(hostile);
      assert.equal(acc.availability, "unknown");
      const bad = detect(null);
      assert.equal(bad.availability, "unknown");
    }
  });

  it("low-bit admits only none or cpu-reference from a host-injected token", () => {
    assert.deepEqual([...BENCHMARK_LOW_BIT_BACKENDS], ["none", "cpu-reference", "unknown"]);
    assert.equal(detectBenchmarkLowBitBackend({}).backend, "none");
    assert.equal(detectBenchmarkLowBitBackend({ backend: "none" }).backend, "none");
    assert.equal(detectBenchmarkLowBitBackend({ backend: "cpu-reference" }).backend, "cpu-reference");
    assert.equal(detectBenchmarkLowBitBackend({ backend: "webgpu" }).backend, "unknown");
    assert.equal(detectBenchmarkLowBitBackend(null).backend, "unknown");
  });

  it("target-detection source stays free of OS, GPU, child-process and network reads", () => {
    const src = readFileSync(join(ROOT, "src", "target-detection.ts"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const banned of [
      /\bnavigator\b/,
      /\bWebGPU\b/,
      /\bchild_process\b/,
      /\bprocess\.env\b/,
      /\bfetch\s*\(/,
      /from ["']node:fs["']/,
      /from ["']node:os["']/,
      /from ["']node:child_process["']/,
    ]) {
      assert.equal(banned.test(code), false, String(banned));
    }
    assert.match(src, /from "node:util\/types"/);
  });
});

describe("parked *_if_available cases stay skipped; required unavailable fails closed", () => {
  it("C72 matrix holds for all four gated targets", () => {
    for (const [target, id] of GATED) {
      const required = runLightBenchmark(input({ config: config({ targets: { cpu: false, json: false, [target]: true } }) }));
      const optional = runLightBenchmark(input({ config: config({ targets: { cpu: false, json: false, [target]: "optional" } }) }));
      const disabled = runLightBenchmark(input({ config: config({ targets: { cpu: false, json: false, [target]: false } }) }));
      for (const r of [required, optional, disabled]) {
        assert.equal(r.ok, true, id);
        assert.deepEqual(validateBenchmarkReport(r.report), []);
      }
      const req = required.report.tests.find((t) => t.id === id);
      const opt = optional.report.tests.find((t) => t.id === id);
      const off = disabled.report.tests.find((t) => t.id === id);
      assert.deepEqual([req.status, req.reason], ["failed", BENCHMARK_RUNNER_REASONS.requiredUnavailable], id);
      assert.deepEqual([opt.status, opt.reason], ["skipped", BENCHMARK_RUNNER_REASONS.detectionPending], id);
      assert.deepEqual([off.status, off.reason], ["skipped", BENCHMARK_RUNNER_REASONS.disabled], id);
    }
  });
});
