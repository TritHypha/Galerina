import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  validateNativeTarget,
  validateNativeArtifact,
  createNativeTargetReport,
} from "../dist/index.js";

const codes = (diags) => diags.map((d) => d.code);
const target = {
  triple: "x86_64-unknown-linux-gnu",
  os: "linux",
  architecture: "x86_64",
  abi: "system",
  executionMode: "native-abi-boundary",
};

describe("validateNativeTarget", () => {
  it("accepts a complete target", () => {
    assert.deepEqual(codes(validateNativeTarget(target)), []);
  });

  it("requires triple, os and architecture", () => {
    const diags = validateNativeTarget({ ...target, triple: "", os: " ", architecture: "" });
    assert.deepEqual(codes(diags), [
      "Galerina_NATIVE_TARGET_FIELD_REQUIRED",
      "Galerina_NATIVE_TARGET_FIELD_REQUIRED",
      "Galerina_NATIVE_TARGET_FIELD_REQUIRED",
    ]);
  });

  it("rejects an unknown ABI and execution mode", () => {
    const diags = validateNativeTarget({ ...target, abi: "jvm", executionMode: "interpreted" });
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_NATIVE_TARGET_ABI_INVALID",
      "Galerina_NATIVE_TARGET_EXECUTION_MODE_INVALID",
    ]);
  });
});

describe("validateNativeArtifact", () => {
  it("accepts a valid artifact", () => {
    assert.deepEqual(codes(validateNativeArtifact({ path: "out/app", target, format: "executable" })), []);
  });

  it("rejects an empty path and unknown format, and propagates target errors", () => {
    const diags = validateNativeArtifact({ path: " ", target: { ...target, os: "" }, format: "dll" });
    assert.ok(codes(diags).includes("Galerina_NATIVE_ARTIFACT_PATH_REQUIRED"));
    assert.ok(codes(diags).includes("Galerina_NATIVE_ARTIFACT_FORMAT_INVALID"));
    assert.ok(codes(diags).includes("Galerina_NATIVE_TARGET_FIELD_REQUIRED"));
  });
});

describe("createNativeTargetReport", () => {
  it("warns when the machine-profile bridge is enabled without a profile path", () => {
    const { report, diagnostics } = createNativeTargetReport({
      artifacts: [{ path: "out/app", target, format: "executable" }],
      machineProfileBridge: { enabled: true },
    });
    assert.deepEqual(codes(diagnostics), []);
    assert.equal(report.warnings.length, 1);
    assert.match(report.warnings[0], /no capability profile path/);
  });

  it("is clean when the bridge is disabled", () => {
    const { report } = createNativeTargetReport({
      artifacts: [{ path: "out/app", target, format: "library" }],
      machineProfileBridge: { enabled: false },
    });
    assert.deepEqual(report.warnings, []);
  });
});
