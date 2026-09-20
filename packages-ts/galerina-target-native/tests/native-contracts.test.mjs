import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  validateNativeTarget,
  validateNativeArtifact,
  createNativeTargetReport,
} from "../dist/index.js";

const codes = (diags) => diags.map((d) => d.code);
const RUNTIME_INPUT_CODE = "Galerina_NATIVE_INPUT_INVALID";
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

  it("refuses inherited, accessor, wrong-class, surplus, and proxy-backed targets", () => {
    class TargetRecord {}

    const inherited = Object.create(target);
    const accessor = {};
    Object.defineProperties(accessor, {
      triple: { get() { throw new Error("getter must not run"); }, enumerable: true },
      os: { value: target.os, enumerable: true },
      architecture: { value: target.architecture, enumerable: true },
      abi: { value: target.abi, enumerable: true },
      executionMode: { value: target.executionMode, enumerable: true },
    });
    const wrongClass = Object.assign(new TargetRecord(), target);
    const surplus = { ...target, extra: true };
    const proxied = new Proxy({ ...target }, {});

    for (const hostile of [inherited, accessor, wrongClass, surplus, proxied]) {
      assert.deepEqual(codes(validateNativeTarget(hostile)), [RUNTIME_INPUT_CODE]);
    }
  });

  it("refuses a symbol-keyed target without reading it", () => {
    const symbol = Symbol("surplus");
    const hostile = { ...target, [symbol]: "unexpected" };
    assert.deepEqual(codes(validateNativeTarget(hostile)), [RUNTIME_INPUT_CODE]);
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

  it("refuses sparse, custom, and proxy-backed artifact arrays", () => {
    const sparse = [];
    sparse.length = 1;
    const custom = [{ path: "out/app", target, format: "executable" }];
    custom.extra = "unexpected";
    const proxied = new Proxy([{ path: "out/app", target, format: "executable" }], {});

    for (const artifacts of [sparse, custom, proxied]) {
      const { report, diagnostics } = createNativeTargetReport({
        artifacts,
        machineProfileBridge: { enabled: false },
      });
      assert.deepEqual(codes(diagnostics), [RUNTIME_INPUT_CODE]);
      assert.deepEqual(report.artifacts, []);
    }
  });

  it("refuses malformed report records and non-boolean bridge state", () => {
    const reportInput = { artifacts: [], machineProfileBridge: { enabled: false } };
    const hostileInputs = [
      new Proxy(reportInput, {}),
      { ...reportInput, extra: true },
      { artifacts: [], machineProfileBridge: { enabled: 1 } },
      { artifacts: [], machineProfileBridge: { enabled: false, selectedAbi: "jvm" } },
    ];

    for (const input of hostileInputs) {
      const { report, diagnostics } = createNativeTargetReport(input);
      assert.deepEqual(codes(diagnostics), [RUNTIME_INPUT_CODE]);
      assert.deepEqual(report.artifacts, []);
    }
  });

  it("returns a detached immutable report snapshot", () => {
    const input = {
      artifacts: [{ path: "out/app", target, format: "executable" }],
      machineProfileBridge: { enabled: true, capabilityProfilePath: "profiles/host.json", selectedAbi: "system" },
    };

    const { report, diagnostics } = createNativeTargetReport(input);
    input.artifacts[0].path = "tampered";
    input.artifacts.push({ path: "out/other", target, format: "object" });
    input.machineProfileBridge.capabilityProfilePath = "tampered";

    assert.deepEqual(codes(diagnostics), []);
    assert.equal(report.artifacts[0].path, "out/app");
    assert.equal(report.artifacts.length, 1);
    assert.equal(report.machineProfileBridge.capabilityProfilePath, "profiles/host.json");
    assert.equal(Object.isFrozen(report), true);
    assert.equal(Object.isFrozen(report.artifacts), true);
    assert.equal(Object.isFrozen(report.artifacts[0]), true);
    assert.equal(Object.isFrozen(report.artifacts[0].target), true);
    assert.equal(Object.isFrozen(report.machineProfileBridge), true);
    assert.equal(Object.isFrozen(report.warnings), true);
    assert.equal(Object.isFrozen(diagnostics), true);
  });
});
