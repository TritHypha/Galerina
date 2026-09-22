import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import {
  NATIVE_ARTIFACT_SCHEMA,
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

const BYTES = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01]);
const BYTES_HEX = BYTES.toString("hex");
const DIGEST = createHash("sha256").update(BYTES).digest("hex");
const OTHER_BYTES = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x01, 0x01]);
const OTHER_DIGEST = createHash("sha256").update(OTHER_BYTES).digest("hex");

function artifact(overrides = {}) {
  return {
    schema: NATIVE_ARTIFACT_SCHEMA,
    path: "out/app",
    target,
    format: "executable",
    digest: DIGEST,
    bytesHex: BYTES_HEX,
    vok: { receiptId: "vok-receipt-1", subjectDigest: DIGEST, state: "current" },
    ...overrides,
  };
}

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

  it("rejects a triple that is not architecture-vendor-os", () => {
    const diags = validateNativeTarget({ ...target, triple: "x86_64" });
    assert.deepEqual(codes(diags), ["Galerina_NATIVE_TARGET_TRIPLE_INVALID"]);
  });

  it("rejects architecture or os that do not appear as triple tokens", () => {
    const arch = validateNativeTarget({ ...target, architecture: "aarch64" });
    assert.deepEqual(codes(arch), ["Galerina_NATIVE_TARGET_TRIPLE_ARCHITECTURE_MISMATCH"]);
    const osMismatch = validateNativeTarget({ ...target, os: "windows" });
    assert.deepEqual(codes(osMismatch), ["Galerina_NATIVE_TARGET_TRIPLE_OS_MISMATCH"]);
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

describe("validateNativeArtifact — C09 identity", () => {
  it("accepts a digest-and-VOK-bound artifact", () => {
    assert.deepEqual(codes(validateNativeArtifact(artifact())), []);
  });

  it("rejects an empty path and unknown format, and propagates target errors", () => {
    const diags = validateNativeArtifact(artifact({
      path: " ",
      target: { ...target, os: "" },
      format: "dll",
    }));
    assert.ok(codes(diags).includes("Galerina_NATIVE_ARTIFACT_PATH_REQUIRED"));
    assert.ok(codes(diags).includes("Galerina_NATIVE_ARTIFACT_FORMAT_INVALID"));
    assert.ok(codes(diags).includes("Galerina_NATIVE_TARGET_FIELD_REQUIRED"));
  });

  it("refuses traversal, absolute, drive, UNC, backslash, and dot-segment locators", () => {
    for (const path of [
      "../secret",
      "/abs/app",
      "C:app",
      "\\\\server\\share",
      "out\\app",
      ".",
      "out/./app",
      "out//app",
      "out/app/",
    ]) {
      const diags = validateNativeArtifact(artifact({ path }));
      assert.ok(
        codes(diags).includes("Galerina_NATIVE_ARTIFACT_PATH_ESCAPES"),
        `${path} must escape: ${codes(diags).join(",")}`,
      );
    }
  });

  it("refuses empty bytes; path is a locator, not identity", () => {
    const diags = validateNativeArtifact(artifact({ bytesHex: "" }));
    assert.ok(codes(diags).includes("Galerina_NATIVE_BYTES_REQUIRED"));
  });

  it("refuses an empty VOK receipt identifier", () => {
    const diags = validateNativeArtifact(artifact({
      vok: { receiptId: " ", subjectDigest: DIGEST, state: "current" },
    }));
    assert.ok(codes(diags).includes("Galerina_NATIVE_VOK_RECEIPT_REQUIRED"));
  });

  it("refuses a digest that does not match the bound bytes", () => {
    const diags = validateNativeArtifact(artifact({
      digest: OTHER_DIGEST,
      vok: { receiptId: "vok-receipt-1", subjectDigest: OTHER_DIGEST, state: "current" },
    }));
    assert.ok(codes(diags).includes("Galerina_NATIVE_DIGEST_MISMATCH"));
  });

  it("refuses a VOK subject that does not match the artifact digest", () => {
    const diags = validateNativeArtifact(artifact({
      vok: { receiptId: "vok-receipt-1", subjectDigest: OTHER_DIGEST, state: "current" },
    }));
    assert.ok(codes(diags).includes("Galerina_NATIVE_VOK_SUBJECT_MISMATCH"));
  });

  it("refuses a stale VOK state at decode time", () => {
    const diags = validateNativeArtifact(artifact({
      vok: { receiptId: "vok-receipt-1", subjectDigest: DIGEST, state: "stale" },
    }));
    assert.equal(diags[0]?.code, RUNTIME_INPUT_CODE);
  });

  it("refuses legacy metadata-only artifacts", () => {
    const diags = validateNativeArtifact({ path: "out/app", target, format: "executable" });
    assert.equal(diags[0]?.code, RUNTIME_INPUT_CODE);
  });
});

describe("createNativeTargetReport", () => {
  it("refuses an enabled bridge without a profile path", () => {
    const { report, diagnostics } = createNativeTargetReport({
      artifacts: [artifact()],
      machineProfileBridge: { enabled: true },
    });
    assert.ok(codes(diagnostics).includes("Galerina_NATIVE_PROFILE_PATH_REQUIRED"));
    assert.deepEqual(report.artifacts, []);
  });

  it("is clean when the bridge is disabled", () => {
    const { report, diagnostics } = createNativeTargetReport({
      artifacts: [artifact({ format: "library" })],
      machineProfileBridge: { enabled: false },
    });
    assert.deepEqual(codes(diagnostics), []);
    assert.deepEqual(report.warnings, []);
    assert.equal(report.schema, NATIVE_ARTIFACT_SCHEMA);
  });

  it("refuses an escaping capability profile path", () => {
    const { report, diagnostics } = createNativeTargetReport({
      artifacts: [artifact()],
      machineProfileBridge: {
        enabled: true,
        capabilityProfilePath: "../secret.json",
        selectedAbi: "system",
      },
    });
    assert.ok(codes(diagnostics).includes("Galerina_NATIVE_PROFILE_PATH_ESCAPES"));
    assert.equal(report.artifacts.length, 0);
  });

  it("refuses ABI mismatch and profile-path collision", () => {
    const abi = createNativeTargetReport({
      artifacts: [artifact()],
      machineProfileBridge: { enabled: true, capabilityProfilePath: "profiles/host.json", selectedAbi: "c" },
    });
    assert.ok(codes(abi.diagnostics).includes("Galerina_NATIVE_ABI_MISMATCH"));
    assert.equal(abi.report.artifacts.length, 0);

    const collide = createNativeTargetReport({
      artifacts: [artifact()],
      machineProfileBridge: { enabled: true, capabilityProfilePath: "out/app", selectedAbi: "system" },
    });
    assert.ok(codes(collide.diagnostics).includes("Galerina_NATIVE_PROFILE_PATH_COLLIDES"));
  });

  it("refuses duplicate digests", () => {
    const { report, diagnostics } = createNativeTargetReport({
      artifacts: [artifact(), artifact({ path: "out/copy" })],
      machineProfileBridge: { enabled: false },
    });
    assert.equal(report.artifacts.length, 1);
    assert.ok(codes(diagnostics).includes("Galerina_NATIVE_DIGEST_DUPLICATE"));
  });

  it("refuses sparse, custom, and proxy-backed artifact arrays", () => {
    const sparse = [];
    sparse.length = 1;
    const custom = [artifact()];
    custom.extra = "unexpected";
    const proxied = new Proxy([artifact()], {});

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
      artifacts: [artifact()],
      machineProfileBridge: { enabled: true, capabilityProfilePath: "profiles/host.json", selectedAbi: "system" },
    };

    const { report, diagnostics } = createNativeTargetReport(input);
    input.artifacts[0].path = "tampered";
    input.artifacts.push(artifact({ path: "out/other", bytesHex: OTHER_BYTES.toString("hex"), digest: OTHER_DIGEST, vok: { receiptId: "vok-2", subjectDigest: OTHER_DIGEST, state: "current" } }));
    input.machineProfileBridge.capabilityProfilePath = "tampered";

    assert.deepEqual(codes(diagnostics), []);
    assert.equal(report.artifacts[0].path, "out/app");
    assert.equal(report.artifacts.length, 1);
    assert.equal(report.machineProfileBridge.capabilityProfilePath, "profiles/host.json");
    assert.equal(Object.isFrozen(report), true);
    assert.equal(Object.isFrozen(report.artifacts), true);
    assert.equal(Object.isFrozen(report.artifacts[0]), true);
    assert.equal(Object.isFrozen(report.artifacts[0].target), true);
    assert.equal(Object.isFrozen(report.artifacts[0].vok), true);
    assert.equal(Object.isFrozen(report.machineProfileBridge), true);
    assert.equal(Object.isFrozen(report.warnings), true);
    assert.equal(Object.isFrozen(diagnostics), true);
  });
});
