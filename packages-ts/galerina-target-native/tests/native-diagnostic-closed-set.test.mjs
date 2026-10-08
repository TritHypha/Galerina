import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  NATIVE_ARTIFACT_SCHEMA,
  NATIVE_DIAGNOSTIC_CODES,
  NATIVE_DIAGNOSTIC_REGISTRY,
  createNativeTargetReport,
  isNativeDiagnosticCode,
  validateNativeArtifact,
  validateNativeTarget,
} from "../dist/index.js";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "index.ts");
const codes = (diags) => diags.map((d) => d.code);

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

function emitAll() {
  return {
    Galerina_NATIVE_INPUT_INVALID: codes(validateNativeTarget({ ...target, extra: true })),
    Galerina_NATIVE_TARGET_FIELD_REQUIRED: codes(
      validateNativeTarget({ ...target, triple: "", os: " ", architecture: "" }),
    ),
    Galerina_NATIVE_TARGET_TRIPLE_INVALID: codes(
      validateNativeTarget({ ...target, triple: "x86_64" }),
    ),
    Galerina_NATIVE_TARGET_TRIPLE_ARCHITECTURE_MISMATCH: codes(
      validateNativeTarget({ ...target, architecture: "aarch64" }),
    ),
    Galerina_NATIVE_TARGET_TRIPLE_OS_MISMATCH: codes(
      validateNativeTarget({ ...target, os: "windows" }),
    ),
    Galerina_NATIVE_TARGET_ABI_INVALID: codes(
      validateNativeTarget({ ...target, abi: "jvm" }),
    ),
    Galerina_NATIVE_TARGET_EXECUTION_MODE_INVALID: codes(
      validateNativeTarget({ ...target, executionMode: "interpreted" }),
    ),
    Galerina_NATIVE_SCHEMA_INVALID: codes(
      validateNativeArtifact(artifact({ schema: "fungi.native.artifact.v0" })),
    ),
    Galerina_NATIVE_ARTIFACT_PATH_REQUIRED: codes(
      validateNativeArtifact(artifact({ path: " " })),
    ),
    Galerina_NATIVE_ARTIFACT_PATH_ESCAPES: codes(
      validateNativeArtifact(artifact({ path: "../secret" })),
    ),
    Galerina_NATIVE_ARTIFACT_FORMAT_INVALID: codes(
      validateNativeArtifact(artifact({ format: "dll" })),
    ),
    Galerina_NATIVE_DIGEST_INVALID: codes(
      validateNativeArtifact(artifact({ digest: "not-a-sha256" })),
    ),
    Galerina_NATIVE_BYTES_REQUIRED: codes(
      validateNativeArtifact(artifact({ bytesHex: "" })),
    ),
    Galerina_NATIVE_DIGEST_MISMATCH: codes(
      validateNativeArtifact(artifact({
        digest: OTHER_DIGEST,
        vok: { receiptId: "vok-receipt-1", subjectDigest: OTHER_DIGEST, state: "current" },
      })),
    ),
    Galerina_NATIVE_VOK_RECEIPT_REQUIRED: codes(
      validateNativeArtifact(artifact({
        vok: { receiptId: " ", subjectDigest: DIGEST, state: "current" },
      })),
    ),
    Galerina_NATIVE_VOK_SUBJECT_MISMATCH: codes(
      validateNativeArtifact(artifact({
        vok: { receiptId: "vok-receipt-1", subjectDigest: OTHER_DIGEST, state: "current" },
      })),
    ),
    Galerina_NATIVE_ABI_MISMATCH: codes(createNativeTargetReport({
      artifacts: [artifact()],
      machineProfileBridge: {
        enabled: true,
        capabilityProfilePath: "profiles/host.json",
        selectedAbi: "c",
      },
    }).diagnostics),
    Galerina_NATIVE_PROFILE_PATH_COLLIDES: codes(createNativeTargetReport({
      artifacts: [artifact()],
      machineProfileBridge: {
        enabled: true,
        capabilityProfilePath: "out/app",
        selectedAbi: "system",
      },
    }).diagnostics),
    Galerina_NATIVE_DIGEST_DUPLICATE: codes(createNativeTargetReport({
      artifacts: [artifact(), artifact({ path: "out/copy" })],
      machineProfileBridge: { enabled: false },
    }).diagnostics),
    Galerina_NATIVE_PROFILE_PATH_REQUIRED: codes(createNativeTargetReport({
      artifacts: [artifact()],
      machineProfileBridge: { enabled: true },
    }).diagnostics),
    Galerina_NATIVE_PROFILE_PATH_ESCAPES: codes(createNativeTargetReport({
      artifacts: [artifact()],
      machineProfileBridge: {
        enabled: true,
        capabilityProfilePath: "../secret.json",
        selectedAbi: "system",
      },
    }).diagnostics),
  };
}

describe("native diagnostic closed set", () => {
  it("freezes a 21-code registry in first-emission order", () => {
    assert.equal(Object.isFrozen(NATIVE_DIAGNOSTIC_REGISTRY), true);
    assert.equal(Object.isFrozen(NATIVE_DIAGNOSTIC_CODES), true);
    assert.equal(NATIVE_DIAGNOSTIC_CODES.length, 21);
    assert.deepEqual(NATIVE_DIAGNOSTIC_CODES, [
      "Galerina_NATIVE_INPUT_INVALID",
      "Galerina_NATIVE_TARGET_FIELD_REQUIRED",
      "Galerina_NATIVE_TARGET_TRIPLE_INVALID",
      "Galerina_NATIVE_TARGET_TRIPLE_ARCHITECTURE_MISMATCH",
      "Galerina_NATIVE_TARGET_TRIPLE_OS_MISMATCH",
      "Galerina_NATIVE_TARGET_ABI_INVALID",
      "Galerina_NATIVE_TARGET_EXECUTION_MODE_INVALID",
      "Galerina_NATIVE_SCHEMA_INVALID",
      "Galerina_NATIVE_ARTIFACT_PATH_REQUIRED",
      "Galerina_NATIVE_ARTIFACT_PATH_ESCAPES",
      "Galerina_NATIVE_ARTIFACT_FORMAT_INVALID",
      "Galerina_NATIVE_DIGEST_INVALID",
      "Galerina_NATIVE_BYTES_REQUIRED",
      "Galerina_NATIVE_DIGEST_MISMATCH",
      "Galerina_NATIVE_VOK_RECEIPT_REQUIRED",
      "Galerina_NATIVE_VOK_SUBJECT_MISMATCH",
      "Galerina_NATIVE_ABI_MISMATCH",
      "Galerina_NATIVE_PROFILE_PATH_COLLIDES",
      "Galerina_NATIVE_DIGEST_DUPLICATE",
      "Galerina_NATIVE_PROFILE_PATH_REQUIRED",
      "Galerina_NATIVE_PROFILE_PATH_ESCAPES",
    ]);
    assert.equal(new Set(NATIVE_DIAGNOSTIC_CODES).size, 21);
  });

  it("refuses unknown and proposed-final FUNGI names", () => {
    assert.equal(isNativeDiagnosticCode("Galerina_NATIVE_INPUT_INVALID"), true);
    assert.equal(isNativeDiagnosticCode("Galerina_NATIVE_NOT_A_CODE"), false);
    assert.equal(isNativeDiagnosticCode("FUNGI-NATIVE-001"), false);
    assert.equal(isNativeDiagnosticCode("FUNGI-WASM-001"), false);
  });

  it("matches every Galerina_NATIVE_* literal in src/index.ts", () => {
    const source = readFileSync(SRC, "utf8");
    const found = [...source.matchAll(/Galerina_NATIVE_[A-Z0-9_]+/g)].map((m) => m[0]);
    assert.deepEqual([...new Set(found)], [...NATIVE_DIAGNOSTIC_CODES]);
  });

  it("emits only registry codes and emits each code at least once", () => {
    const emitted = emitAll();
    const seen = new Set();
    for (const [expected, actual] of Object.entries(emitted)) {
      assert.ok(actual.includes(expected), `${expected} missing from ${actual.join(",")}`);
      for (const code of actual) {
        assert.equal(isNativeDiagnosticCode(code), true, `unknown code emitted: ${code}`);
        seen.add(code);
      }
    }
    assert.deepEqual([...seen].sort(), [...NATIVE_DIAGNOSTIC_CODES].sort());
  });

  it("is deterministic across two emit passes", () => {
    assert.deepEqual(JSON.stringify(emitAll()), JSON.stringify(emitAll()));
  });
});
