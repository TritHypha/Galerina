// rd1295-hold-pin.test.mjs — Tower may request; it never extracts, signs, converts, admits, or authorises.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createCertifiedTower } from "../dist/product-constructors.js";
import {
  RD1295_HOLD_PIN_SCHEMA,
  extractCoreNetworkTowerInstall,
  prepareCertifiedDeploymentRequest,
  signCertifiedDeployment,
  convertTowerToFungi,
  admitTowerArtifact,
  authoriseTowerArtifact,
  claimHardwareEvidence,
  claimIndependentAudit,
} from "../dist/rd1295-hold-pin.js";

function assertNonAuthorizing(value) {
  assert.equal(value.authorityReleased, false);
  assert.equal(value.admissionAuthority, false);
  assert.equal(Object.isFrozen(value), true);
}

test("extractCoreNetworkTowerInstall always TW_CORE_NETWORK_INSTALL_EXTRACT_FORBIDDEN", () => {
  const forged = {
    kind: "EXTRACTED",
    package: "@galerina/core-network",
    admission: true,
    authorityReleased: true,
  };
  for (const input of [null, {}, forged, { extracted: true, install: "file:../galerina-tower-citizen" }]) {
    const refused = extractCoreNetworkTowerInstall(input);
    assert.equal(refused.kind, "REFUSED");
    assert.equal(refused.code, "TW_CORE_NETWORK_INSTALL_EXTRACT_FORBIDDEN");
    assertNonAuthorizing(refused);
  }
});

test("this package does not depend on core-network", () => {
  const pkgPath = fileURLToPath(new URL("../package.json", import.meta.url));
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  assert.equal(Object.hasOwn(pkg.dependencies ?? {}, "@galerina/core-network"), false);
  assert.equal(Object.hasOwn(pkg.devDependencies ?? {}, "@galerina/core-network"), false);
});

test("prepareCertifiedDeploymentRequest packages REQUESTED_NOT_SIGNED", () => {
  const request = prepareCertifiedDeploymentRequest({
    profile: "tower.certified.v1",
    allowUnsignedLoad: false,
  });
  assert.equal(request.kind, "CERTIFIED_DEPLOYMENT_REQUEST");
  if (request.kind !== "CERTIFIED_DEPLOYMENT_REQUEST") return;
  assert.equal(request.schema, RD1295_HOLD_PIN_SCHEMA);
  assert.equal(request.status, "REQUESTED_NOT_SIGNED");
  assert.equal(request.profile, "tower.certified.v1");
  assert.equal(request.allowUnsignedLoad, false);
  assert.deepEqual({ ...request.requires }, {
    v1ReleaseSigningCeremony: true,
    freshSlideAdmission: true,
    freshVokDecision: true,
  });
  assert.match(request.requestDigest, /^sha256:[0-9a-f]{64}$/u);
  assertNonAuthorizing(request);
});

test("prepareCertifiedDeploymentRequest refuses authority, key material, unsigned load, malformed", () => {
  const base = { profile: "tower.certified.v1", allowUnsignedLoad: false };
  assert.equal(prepareCertifiedDeploymentRequest({ ...base, admission: true }).code, "TW_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
  assert.equal(prepareCertifiedDeploymentRequest({ ...base, lease: "x" }).code, "TW_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
  assert.equal(prepareCertifiedDeploymentRequest({ ...base, privateKeyPem: "pkcs8" }).code, "TW_HOLD_REQUEST_KEY_MATERIAL_PRESENT");
  assert.equal(prepareCertifiedDeploymentRequest({ ...base, throwawayKey: true }).code, "TW_HOLD_REQUEST_KEY_MATERIAL_PRESENT");
  assert.equal(prepareCertifiedDeploymentRequest({ ...base, ceremonyKey: {} }).code, "TW_HOLD_REQUEST_KEY_MATERIAL_PRESENT");
  assert.equal(prepareCertifiedDeploymentRequest({ profile: "tower.certified.v1", allowUnsignedLoad: true }).code, "TW_HOLD_REQUEST_UNSIGNED_LOAD");
  assert.equal(prepareCertifiedDeploymentRequest({ profile: "tower.dev.v1", allowUnsignedLoad: false }).code, "TW_HOLD_REQUEST_MALFORMED");
  assert.equal(prepareCertifiedDeploymentRequest(null).code, "TW_HOLD_REQUEST_MALFORMED");
  assert.equal(prepareCertifiedDeploymentRequest({ profile: "tower.certified.v1" }).code, "TW_HOLD_REQUEST_MALFORMED");
});

test("signCertifiedDeployment always TW_CERTIFIED_DEPLOYMENT_SIGN_FORBIDDEN", () => {
  const request = prepareCertifiedDeploymentRequest({
    profile: "tower.certified.v1",
    allowUnsignedLoad: false,
  });
  const forged = {
    kind: "SIGNED",
    authorityReleased: true,
    privateKeyPem: "throwaway",
    allowUnsignedLoad: true,
  };
  for (const input of [request, forged, null, { profile: "tower.certified.v1" }]) {
    const refused = signCertifiedDeployment(input);
    assert.equal(refused.kind, "REFUSED");
    assert.equal(refused.code, "TW_CERTIFIED_DEPLOYMENT_SIGN_FORBIDDEN");
    assertNonAuthorizing(refused);
  }
});

test("createCertifiedTower still forbids allowUnsignedLoad", () => {
  assert.throws(
    () => createCertifiedTower({ allowUnsignedLoad: true }),
    /ERR_CERTIFIED_UNSIGNED_LOAD_FORBIDDEN/,
  );
});

test("convert / admit / authorise / hardware / audit acts always refuse", () => {
  const forged = { kind: "ADMITTED", admission: true, authorityReleased: true, fungi: "module M {}" };
  const cases = [
    [convertTowerToFungi, "TW_FUNGI_CONVERSION_FORBIDDEN"],
    [admitTowerArtifact, "TW_SLIDE_ADMISSION_FORBIDDEN"],
    [authoriseTowerArtifact, "TW_VOK_AUTHORISE_FORBIDDEN"],
    [claimHardwareEvidence, "TW_HARDWARE_EVIDENCE_FORBIDDEN"],
    [claimIndependentAudit, "TW_INDEPENDENT_AUDIT_FORBIDDEN"],
  ];
  for (const [fn, code] of cases) {
    for (const input of [forged, null, { ok: true }]) {
      const refused = fn(input);
      assert.equal(refused.kind, "REFUSED", code);
      assert.equal(refused.code, code);
      assertNonAuthorizing(refused);
    }
  }
});
