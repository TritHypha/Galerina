import assert from "node:assert/strict";
import { test } from "node:test";
import { selectManifestAuthSubject, sidecarBindIsInsufficient } from "./manifest-subject-auth.mjs";

const cborSigned = {
  sourceHash: "sha256:aaa",
  schemaVersion: "fungi.manifest.v1",
  flowCount: 1,
  governanceSignature: { algorithm: "Ed25519", keyId: "k1", signature: "cbor-sig", canon: "jcs" },
};

const jsonMatching = {
  sourceHash: "sha256:aaa",
  schemaVersion: "fungi.manifest.v1",
  flowCount: 1,
  governanceSignature: { algorithm: "Ed25519", keyId: "k1", signature: "cbor-sig", canon: "jcs" },
};

test("hostile: sourceHash+schemaVersion bind still matches a tampered CBOR flowCount", () => {
  const tampered = { ...cborSigned, flowCount: 99, governanceSignature: "placeholder" };
  const sidecar = { ...jsonMatching, flowCount: 1 };
  assert.equal(sidecarBindIsInsufficient(tampered, sidecar), true);
});

test("CBOR object signature is the authentication subject", () => {
  const r = selectManifestAuthSubject(cborSigned, jsonMatching);
  assert.equal(r.source, "cbor");
  assert.equal(r.sig.signature, "cbor-sig");
  assert.equal(r.body.flowCount, 1);
  assert.equal("governanceSignature" in r.body, false);
});

test("JSON-only signature is refused as not the checked CBOR subject", () => {
  const cbor = { sourceHash: "sha256:aaa", schemaVersion: "fungi.manifest.v1", flowCount: 99, governanceSignature: "placeholder" };
  const r = selectManifestAuthSubject(cbor, jsonMatching);
  assert.equal(r.refuse.startsWith("FUNGI-MANIFEST-TAMPER: JSON sidecar signature is not the checked CBOR subject"), true);
});

test("split-brain sidecar vs CBOR signatures refuse", () => {
  const sidecar = { ...jsonMatching, governanceSignature: { ...jsonMatching.governanceSignature, signature: "other-sig" } };
  const r = selectManifestAuthSubject(cborSigned, sidecar);
  assert.match(String(r.refuse), /does not match the checked CBOR subject/);
});

test("both unsigned is unsigned, not a sidecar pass", () => {
  const r = selectManifestAuthSubject({ sourceHash: "sha256:aaa", governanceSignature: "placeholder" }, { governanceSignature: "placeholder" });
  assert.equal(r.unsigned, true);
});

test("missing CBOR subject refuses", () => {
  const r = selectManifestAuthSubject(null, jsonMatching);
  assert.match(String(r.refuse), /CBOR subject is missing/);
});
