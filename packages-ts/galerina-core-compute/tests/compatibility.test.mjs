import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  COMPAT_DIAGNOSTIC_REGISTRY,
  COMPATIBILITY_LEVELS,
  RUNTIME_TARGETS,
  buildCompatibilityReport,
  isRuntimeTarget,
  validateComputeWorkload,
  validateTarget,
} from "../dist/index.js";

const workload = (over = {}) => ({
  id: "resize-images",
  kind: "image",
  dataShape: { rank: 2, dimensions: [1024, 768], elementType: "u8", byteSize: 786432, sensitive: false, streamable: true },
  deployment: { environment: "production", onDevice: false, networkAllowed: false },
  operationCount: 1000,
  memoryMb: 256,
  deterministic: true,
  effects: ["compute.pure"],
  requiredCapabilities: [],
  preferredTargets: ["wasm"],
  fallbackTargets: ["cpu"],
  ...over,
});
const profile = (over = {}) => ({
  target: "wasm",
  supportedEffects: ["compute.pure"],
  forbiddenEffects: ["storage.read", "process.spawn"],
  requiredCapabilities: [],
  memoryLimitMb: 512,
  allowsSensitiveData: false,
  ...over,
});

describe("RuntimeTarget and shared types", () => {
  it("has exactly the 11 planned targets", () => {
    assert.deepEqual([...RUNTIME_TARGETS], ["cpu", "node", "wasm", "browser-wasm", "wasi", "gpu", "optical_io", "photonic", "native", "serverless", "edge"]);
    assert.equal(isRuntimeTarget("cuda"), false);
    assert.ok(Object.isFrozen(RUNTIME_TARGETS));
  });
  it("validates workloads fail-closed", () => {
    assert.deepEqual(validateComputeWorkload(workload()), []);
    assert.ok(validateComputeWorkload(workload({ preferredTargets: ["cuda"] })).some((d) => d.path === "preferredTargets"));
    assert.ok(validateComputeWorkload(workload({ memoryMb: -1 })).some((d) => d.path === "memoryMb"));
    assert.ok(validateComputeWorkload(workload({ dataShape: { ...workload().dataShape, dimensions: [1] } })).some((d) => d.path === "dataShape.dimensions"));
    assert.equal(validateComputeWorkload("x")[0].path, "workload");
  });
});

describe("validateTarget", () => {
  it("full for a clean preferred target, degraded for a fallback", () => {
    assert.equal(validateTarget(workload(), profile()).level, "full");
    const r = validateTarget(workload(), profile({ target: "cpu" }));
    assert.equal(r.level, "degraded");
    assert.equal("fallback" in r, false);
  });
  it("blocks forbidden effects (storage.read in browser WASM) with FUNGI-COMPAT-001", () => {
    const r = validateTarget(workload({ effects: ["storage.read"] }), profile({ target: "browser-wasm" }));
    assert.equal(r.level, "incompatible");
    assert.deepEqual(r.blockers.map((b) => b.diagnosticCode), ["FUNGI-COMPAT-001"]);
    assert.deepEqual(r.fallback, { target: "cpu", reason: "browser-wasm is incompatible; cpu is the workload's declared fallback." });
  });
  it("blocks unknown effects (002), missing capabilities (003), memory over limit (004) and sensitive data (005)", () => {
    assert.equal(validateTarget(workload({ effects: ["net.fetch"] }), profile()).blockers[0].diagnosticCode, "FUNGI-COMPAT-002");
    const cap = validateTarget(workload({ preferredTargets: ["gpu"] }), profile({ target: "gpu", requiredCapabilities: ["GpuRuntime"] }));
    assert.deepEqual([cap.level, cap.blockers[0].diagnosticCode, cap.blockers[0].capability], ["incompatible", "FUNGI-COMPAT-003", "GpuRuntime"]);
    assert.equal(validateTarget(workload({ preferredTargets: ["gpu"], requiredCapabilities: ["GpuRuntime"] }), profile({ target: "gpu", requiredCapabilities: ["GpuRuntime"] })).level, "full");
    assert.equal(validateTarget(workload({ memoryMb: 1024 }), profile()).blockers[0].diagnosticCode, "FUNGI-COMPAT-004");
    const sens = workload({ dataShape: { ...workload().dataShape, sensitive: true } });
    assert.equal(validateTarget(sens, profile()).blockers[0].diagnosticCode, "FUNGI-COMPAT-005");
    assert.equal(validateTarget(sens, profile({ allowsSensitiveData: true })).level, "full");
  });
  it("warns (partial) when no memory limit is declared or the target was not requested", () => {
    const { memoryLimitMb, ...noLimit } = profile();
    assert.equal(memoryLimitMb, 512);
    const r = validateTarget(workload(), noLimit);
    assert.deepEqual([r.level, r.warnings[0].diagnosticCode], ["partial", "FUNGI-COMPAT-004"]);
    assert.equal(validateTarget(workload(), profile({ target: "edge" })).level, "partial");
  });
});

describe("buildCompatibilityReport", () => {
  it("recommends the first compatible requested target in preference order", () => {
    const rep = buildCompatibilityReport(workload({ effects: ["storage.read"] }), [profile(), profile({ target: "cpu", supportedEffects: ["storage.read"], forbiddenEffects: [] })]);
    assert.equal(rep.schemaVersion, "galerina.compatibility.report.v0.2");
    assert.equal(rep.recommendedTarget, "cpu");
    assert.deepEqual(rep.targets.map((t) => t.level), ["incompatible", "degraded"]);
    assert.ok(Object.isFrozen(rep) && Object.isFrozen(rep.targets));
  });
  it("has no implicit CPU default: none when nothing requested is compatible", () => {
    const rep = buildCompatibilityReport(workload({ effects: ["storage.read"] }), [profile()]);
    assert.equal(rep.recommendedTarget, "none");
    assert.ok(rep.diagnostics.some((d) => d.code === "Galerina_COMPAT_NO_COMPATIBLE_TARGET"));
    assert.ok(rep.diagnostics.some((d) => d.code === "Galerina_COMPAT_PROFILE_MISSING"));
  });
  it("rejects duplicate profiles and invalid workloads", () => {
    const dup = buildCompatibilityReport(workload(), [profile(), profile({ allowsSensitiveData: true })]);
    assert.equal(dup.targets.length, 1);
    assert.ok(dup.diagnostics.some((d) => d.code === "Galerina_COMPAT_DUPLICATE_PROFILE"));
    const bad = buildCompatibilityReport(workload({ id: "" }), [profile()]);
    assert.deepEqual([bad.recommendedTarget, bad.targets.length], ["none", 0]);
  });
  it("registers FUNGI-COMPAT-001..005 and the four levels", () => {
    assert.deepEqual(COMPAT_DIAGNOSTIC_REGISTRY.map((e) => e.code), ["FUNGI-COMPAT-001", "FUNGI-COMPAT-002", "FUNGI-COMPAT-003", "FUNGI-COMPAT-004", "FUNGI-COMPAT-005"]);
    assert.deepEqual([...COMPATIBILITY_LEVELS], ["full", "partial", "degraded", "incompatible"]);
  });
});
