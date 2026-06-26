// #195 — OS/HW-compromised security posture: off | auto | on (default auto, fail-secure).
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  resolvePosture, isSecurityPosture, DEFAULT_SECURITY_POSTURE, SECURITY_POSTURES,
  deriveImportProfile,
} from "../dist/index.js";

test("default posture is auto; the union is off/auto/on", () => {
  assert.equal(DEFAULT_SECURITY_POSTURE, "auto");
  assert.deepEqual([...SECURITY_POSTURES], ["off", "auto", "on"]);
});

test("'on' engages every hostile-host control", () => {
  const r = resolvePosture("on", "development");
  assert.equal(r.effective, "on");
  const c = r.controls;
  assert.ok(c.distrustHostTime && c.requireAttestation && c.distrustHostEntropy && c.sealEgress && c.zeroizeAfterUse);
});

test("'off' trusts the host (no controls), even in production", () => {
  const r = resolvePosture("off", "production");
  assert.equal(r.effective, "off");
  assert.equal(r.controls.requireAttestation, false);
  assert.equal(r.failSecure, false);
});

test("'auto' is fail-secure: production / staging / unknown → on", () => {
  for (const env of ["production", "staging", "unknown"]) {
    const r = resolvePosture("auto", env);
    assert.equal(r.effective, "on", `auto in ${env}`);
    assert.equal(r.failSecure, true);
    assert.equal(r.controls.requireAttestation, true);
  }
});

test("'auto' relaxes to off only in development / test", () => {
  for (const env of ["development", "test"]) {
    const r = resolvePosture("auto", env);
    assert.equal(r.effective, "off", `auto in ${env}`);
    assert.equal(r.failSecure, false);
  }
});

test("missing posture defaults to auto and is fail-secure in unknown env", () => {
  const r = resolvePosture(undefined);
  assert.equal(r.requested, "auto");
  assert.equal(r.effective, "on");
  assert.equal(r.failSecure, true);
});

test("invalid posture → 'on' (fail-secure), never silently trusted", () => {
  const r = resolvePosture("yolo", "development");
  assert.equal(r.effective, "on");
  assert.equal(r.failSecure, true);
  assert.equal(isSecurityPosture("yolo"), false);
});

test("isSecurityPosture guards the union (case-sensitive)", () => {
  assert.ok(isSecurityPosture("off") && isSecurityPosture("auto") && isSecurityPosture("on"));
  assert.equal(isSecurityPosture("ON"), false);
  assert.equal(isSecurityPosture(1), false);
});

// ── R&D 0051 — import-admission profile derived from the posture ──────────────
test("deriveImportProfile: posture 'on' requires a signature (prod/mesh signed-hash)", () => {
  const p = deriveImportProfile(resolvePosture("on"));
  assert.equal(p.requireSignature, true);
  assert.equal(p.allowFilePath, false);
  assert.equal(p.posture, "on");
});

test("deriveImportProfile: posture 'off' allows file-path / unsigned (dev/test only)", () => {
  const p = deriveImportProfile(resolvePosture("off", "development"));
  assert.equal(p.requireSignature, false);
  assert.equal(p.allowFilePath, true);
  assert.equal(p.posture, "off");
});

test("deriveImportProfile: 'auto' is fail-secure — requires a signature except in dev/test", () => {
  assert.equal(deriveImportProfile(resolvePosture("auto", "production")).requireSignature, true);
  assert.equal(deriveImportProfile(resolvePosture("auto", "unknown")).requireSignature, true, "unknown env → signed");
  assert.equal(deriveImportProfile(resolvePosture("auto", "development")).requireSignature, false);
});

test("deriveImportProfile: an invalid posture resolves to require-signature (fail-secure)", () => {
  assert.equal(deriveImportProfile(resolvePosture("nonsense", "development")).requireSignature, true);
});
