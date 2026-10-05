import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BUILD_MANIFEST_SLICE_FIELDS,
  BUILD_MANIFEST_SLICE_SCHEMA,
  FUNGI_VDEPLOY_001,
  FUNGI_VDEPLOY_002,
  FUNGI_VDEPLOY_003,
  FUNGI_VDEPLOY_004,
  RUNNING_VERSION_RECEIPT_FIELDS,
  RUNNING_VERSION_RECEIPT_SCHEMA,
  VDEPLOY_TARGETS,
  VERIFY_DEPLOY_RESULT_FIELDS,
  createVerifyDeployResult,
  isVDeployTarget,
  readBuildManifestSlice,
  readRunningVersionReceipt,
  readVerifyDeployResult,
  verifyDeploy,
} from "../dist/index.js";

const HASH_A = "sha256:" + "a".repeat(64);
const HASH_B = "sha256:" + "b".repeat(64);
const HASH_M = "sha256:" + "c".repeat(64);

function receipt(over = {}) {
  return Object.freeze({
    schema: RUNNING_VERSION_RECEIPT_SCHEMA,
    versionId: "demo.v1",
    buildHash: HASH_A,
    target: "node",
    ...over,
  });
}

function manifest(over = {}) {
  return Object.freeze({
    schema: BUILD_MANIFEST_SLICE_SCHEMA,
    buildHash: HASH_A,
    target: "node",
    ...over,
  });
}

describe("verify-deploy contracts closed shapes", () => {
  it("exposes closed vocabularies and field lists", () => {
    assert.deepEqual([...VDEPLOY_TARGETS], [
      "node", "wasm", "native", "serverless", "edge", "gpu", "photonic",
    ]);
    assert.deepEqual([...RUNNING_VERSION_RECEIPT_FIELDS], [
      "schema", "versionId", "buildHash", "target", "moduleHash",
    ]);
    assert.deepEqual([...BUILD_MANIFEST_SLICE_FIELDS], [
      "schema", "buildHash", "target", "moduleHash",
    ]);
    assert.deepEqual([...VERIFY_DEPLOY_RESULT_FIELDS], [
      "success", "matched", "diagnostics", "receiptVersionId", "reportPath",
    ]);
    assert.equal(isVDeployTarget("node"), true);
    assert.equal(isVDeployTarget("Node"), false);
  });

  it("readRunningVersionReceipt accepts closed receipt and optional moduleHash", () => {
    const a = readRunningVersionReceipt(receipt());
    assert.equal(a.ok, true);
    if (!a.ok) return;
    assert.equal(a.value.versionId, "demo.v1");
    assert.equal(a.value.moduleHash, undefined);

    const b = readRunningVersionReceipt(receipt({ moduleHash: HASH_M }));
    assert.equal(b.ok, true);
    if (!b.ok) return;
    assert.equal(b.value.moduleHash, HASH_M);
  });

  it("readRunningVersionReceipt refuses getters, unknown keys, bad domains", () => {
    const getter = {
      schema: RUNNING_VERSION_RECEIPT_SCHEMA,
      versionId: "demo.v1",
      buildHash: HASH_A,
    };
    Object.defineProperty(getter, "target", { get: () => "node", enumerable: true });
    const g = readRunningVersionReceipt(getter);
    assert.equal(g.ok, false);
    if (!g.ok) assert.equal(g.diagnostics[0]?.code, FUNGI_VDEPLOY_001);

    const unk = readRunningVersionReceipt(receipt({ extra: 1 }));
    assert.equal(unk.ok, false);

    const badHash = readRunningVersionReceipt(receipt({ buildHash: "sha256:ZZ" }));
    assert.equal(badHash.ok, false);
    if (!badHash.ok) assert.equal(badHash.diagnostics[0]?.code, FUNGI_VDEPLOY_002);

    const badTarget = readRunningVersionReceipt(receipt({ target: "jvm" }));
    assert.equal(badTarget.ok, false);
  });

  it("readBuildManifestSlice mirrors receipt refuse rules", () => {
    const ok = readBuildManifestSlice(manifest());
    assert.equal(ok.ok, true);

    const badSchema = readBuildManifestSlice(manifest({ schema: "nope" }));
    assert.equal(badSchema.ok, false);
    if (!badSchema.ok) assert.equal(badSchema.diagnostics[0]?.code, FUNGI_VDEPLOY_002);
  });

  it("verifyDeploy matches equal hashes/targets and mismatches otherwise", () => {
    const match = verifyDeploy(receipt(), manifest());
    assert.equal(match.success, true);
    assert.equal(match.matched, true);
    assert.equal(match.receiptVersionId, "demo.v1");
    assert.equal(match.diagnostics.length, 0);

    const hashMismatch = verifyDeploy(receipt({ buildHash: HASH_B }), manifest());
    assert.equal(hashMismatch.success, false);
    assert.ok(hashMismatch.diagnostics.some((d) => d.code === FUNGI_VDEPLOY_003));

    const targetMismatch = verifyDeploy(receipt({ target: "wasm" }), manifest());
    assert.equal(targetMismatch.success, false);
    assert.ok(targetMismatch.diagnostics.some((d) => d.code === FUNGI_VDEPLOY_003));

    const moduleOk = verifyDeploy(
      receipt({ moduleHash: HASH_M }),
      manifest({ moduleHash: HASH_M }),
    );
    assert.equal(moduleOk.success, true);

    const moduleOneSided = verifyDeploy(receipt({ moduleHash: HASH_M }), manifest());
    assert.equal(moduleOneSided.success, false);
    assert.ok(moduleOneSided.diagnostics.some((d) => d.code === FUNGI_VDEPLOY_003));
  });

  it("verifyDeploy never throws on hostile inputs", () => {
    const a = verifyDeploy(null, null);
    assert.equal(a.success, false);
    assert.ok(a.diagnostics.some((d) => d.code === FUNGI_VDEPLOY_001));

    const proxy = new Proxy({}, { get: () => { throw new Error("boom"); } });
    const b = verifyDeploy(proxy, manifest());
    assert.equal(b.success, false);
  });

  it("createVerifyDeployResult / readVerifyDeployResult recompute success and refuse inconsistency", () => {
    const ok = createVerifyDeployResult({
      matched: true,
      diagnostics: [],
      receiptVersionId: "demo.v1",
    });
    assert.equal(ok.success, true);

    const readOk = readVerifyDeployResult({
      success: true,
      matched: true,
      diagnostics: [],
      receiptVersionId: "demo.v1",
    });
    assert.equal(readOk.ok, true);

    const inconsistent = readVerifyDeployResult({
      success: true,
      matched: true,
      diagnostics: [
        {
          code: FUNGI_VDEPLOY_003,
          severity: "error",
          message: "mismatch",
          field: "buildHash",
        },
      ],
      receiptVersionId: "demo.v1",
    });
    assert.equal(inconsistent.ok, false);
    if (!inconsistent.ok) assert.equal(inconsistent.diagnostics[0]?.code, FUNGI_VDEPLOY_004);

    const nanPath = createVerifyDeployResult({
      matched: true,
      diagnostics: [],
      receiptVersionId: "demo.v1",
      reportPath: "../escape",
    });
    assert.equal(nanPath.success, false);
    assert.ok(nanPath.diagnostics.some((d) => d.code === FUNGI_VDEPLOY_002));
  });
});
