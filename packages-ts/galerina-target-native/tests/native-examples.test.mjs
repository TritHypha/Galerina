import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  NATIVE_ARTIFACT_SCHEMA,
  createNativeTargetReport,
  validateNativeArtifact,
  validateNativeTarget,
} from "../dist/index.js";

const EXAMPLE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "examples");
const readExample = (name) => JSON.parse(readFileSync(join(EXAMPLE_DIR, name), "utf8"));
const codes = (diags) => diags.map((d) => d.code);

describe("checked-in native examples", () => {
  it("validates the target example", () => {
    assert.deepEqual(codes(validateNativeTarget(readExample("target.example.json"))), []);
  });

  it("validates the artifact example, whose digest is the real SHA-256 of its bytes", () => {
    const artifact = readExample("artifact.example.json");
    assert.equal(artifact.schema, NATIVE_ARTIFACT_SCHEMA);
    const digest = createHash("sha256").update(Buffer.from(artifact.bytesHex, "hex")).digest("hex");
    assert.equal(artifact.digest, digest);
    assert.equal(artifact.vok.subjectDigest, digest);
    assert.deepEqual(artifact.target, readExample("target.example.json"));
    assert.deepEqual(codes(validateNativeArtifact(artifact)), []);
  });

  it("builds a clean report from the report-input example", () => {
    const input = readExample("report-input.example.json");
    assert.deepEqual(input.artifacts[0], readExample("artifact.example.json"));
    const { report, diagnostics } = createNativeTargetReport(input);
    assert.deepEqual(codes(diagnostics), []);
    assert.equal(report.schema, NATIVE_ARTIFACT_SCHEMA);
    assert.equal(report.artifacts.length, 1);
    assert.equal(report.machineProfileBridge.selectedAbi, "c");
    assert.ok(Object.isFrozen(report) && Object.isFrozen(report.artifacts[0]));
  });

  it("keeps the examples load-bearing: tampering with them is refused", () => {
    const artifact = readExample("artifact.example.json");
    assert.ok(codes(validateNativeArtifact({ ...artifact, bytesHex: "7f454c4602010101" })).includes("Galerina_NATIVE_DIGEST_MISMATCH"));
    assert.ok(codes(validateNativeArtifact({ ...artifact, path: "../app" })).includes("Galerina_NATIVE_ARTIFACT_PATH_ESCAPES"));
    const input = readExample("report-input.example.json");
    const mismatched = { ...input, machineProfileBridge: { ...input.machineProfileBridge, selectedAbi: "system" } };
    assert.ok(codes(createNativeTargetReport(mismatched).diagnostics).includes("Galerina_NATIVE_ABI_MISMATCH"));
  });
});
