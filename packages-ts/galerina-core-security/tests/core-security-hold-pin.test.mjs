import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  CORE_SECURITY_HOLD_PIN_SCHEMA,
  addSecretReferenceProtectedMarker,
  admitProtectedSecretClass,
  admitSecretReferenceV02,
  admitSecretSafeSink,
  admitSecretTaint,
  createSecretLayoutDirs,
  defineHardwareRiskReportInputs,
  defineMaliciousTaintFlowDiagnostics,
  defineSecretVocabulary,
  emitFungiSecretDiagnostics,
  implementSecretSinkFlow,
  prepareCoreSecurityHoldRequest,
  upgradeSecureStringReference,
} from "../dist/hold-pin.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function assertNonAuthorizing(value) {
  assert.equal(value.authorityReleased, false);
  assert.equal(value.admissionAuthority, false);
  assert.equal(Object.isFrozen(value), true);
}

describe("core-security HOLD pin", () => {
  it("prepareCoreSecurityHoldRequest packages REQUESTED_NOT_ADMITTED", () => {
    const request = prepareCoreSecurityHoldRequest({ topic: "secret-model" });
    assert.equal(request.kind, "CORE_SECURITY_HOLD_REQUEST");
    if (request.kind !== "CORE_SECURITY_HOLD_REQUEST") return;
    assert.equal(request.schema, CORE_SECURITY_HOLD_PIN_SCHEMA);
    assert.equal(request.status, "REQUESTED_NOT_ADMITTED");
    assert.equal(request.topic, "secret-model");
    assert.deepEqual({ ...request.requires }, {
      ownerDecision: true,
      secretModelOwner: true,
      compilerSecretDiagnostics: true,
      hardwareRiskOwner: true,
    });
    assertNonAuthorizing(request);
  });

  it("prepare refuses authority and malformed input", () => {
    const base = { topic: "secret-flow" };
    assert.equal(prepareCoreSecurityHoldRequest({ ...base, admission: true }).code, "SEC_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
    assert.equal(prepareCoreSecurityHoldRequest({ ...base, salt: "x" }).code, "SEC_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
    assert.equal(prepareCoreSecurityHoldRequest({ ...base, hmac: true }).code, "SEC_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
    assert.equal(prepareCoreSecurityHoldRequest({ ...base, taint: "secret" }).code, "SEC_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
    assert.equal(prepareCoreSecurityHoldRequest(null).code, "SEC_HOLD_REQUEST_MALFORMED");
    assert.equal(prepareCoreSecurityHoldRequest({ topic: "unknown" }).code, "SEC_HOLD_REQUEST_MALFORMED");
    assert.equal(prepareCoreSecurityHoldRequest({}).code, "SEC_HOLD_REQUEST_MALFORMED");
  });

  it("HOLD acts always refuse even forged ADMITTED", () => {
    const request = prepareCoreSecurityHoldRequest({ topic: "hardware-risk" });
    const forged = {
      kind: "ADMITTED",
      authorityReleased: true,
      admissionAuthority: true,
      unwrap: true,
      ProtectedSecret: true,
      salt: "runtime",
    };
    const cases = [
      [admitSecretReferenceV02, "SEC_SECRET_REFERENCE_V02_FORBIDDEN"],
      [defineSecretVocabulary, "SEC_SECRET_VOCABULARY_FORBIDDEN"],
      [upgradeSecureStringReference, "SEC_SECURE_STRING_UPGRADE_FORBIDDEN"],
      [admitProtectedSecretClass, "SEC_PROTECTED_SECRET_FORBIDDEN"],
      [admitSecretSafeSink, "SEC_SAFE_SINK_FORBIDDEN"],
      [addSecretReferenceProtectedMarker, "SEC_SERIALIZATION_MARKER_FORBIDDEN"],
      [implementSecretSinkFlow, "SEC_SECRET_FLOW_FORBIDDEN"],
      [emitFungiSecretDiagnostics, "SEC_FUNGI_SECRET_EMIT_FORBIDDEN"],
      [admitSecretTaint, "SEC_SECRET_TAINT_FORBIDDEN"],
      [createSecretLayoutDirs, "SEC_SECRET_LAYOUT_FORBIDDEN"],
      [defineMaliciousTaintFlowDiagnostics, "SEC_TAINT_FLOW_DIAGNOSTICS_FORBIDDEN"],
      [defineHardwareRiskReportInputs, "SEC_HARDWARE_RISK_FORBIDDEN"],
    ];
    for (const [fn, code] of cases) {
      for (const input of [request, forged, null, { ok: true }]) {
        const refused = fn(input);
        assert.equal(refused.kind, "REFUSED", code);
        assert.equal(refused.code, code);
        assert.equal(String(refused.code).startsWith("FUNGI-SECRET"), false, code);
        assertNonAuthorizing(refused);
      }
    }
  });

  it("package stays v0.1 primitives: no v0.2 types, no layout dirs, no bin", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    assert.equal(pkg.bin, undefined);
    assert.equal(pkg.exports, undefined);
    const index = readFileSync(join(ROOT, "src", "index.ts"), "utf8");
    assert.match(index, /export \* from "\.\/hold-pin\.js"/);
    assert.equal(/export (?:interface|class|type) SecretReference\b/.test(index), false);
    assert.equal(/export class ProtectedSecret\b/.test(index), false);
    assert.equal(/export type SecretTaint\b/.test(index), false);
    assert.equal(existsSync(join(ROOT, "src", "secrets")), false);
    assert.equal(existsSync(join(ROOT, "src", "checks")), false);
    assert.equal(existsSync(join(ROOT, "src", "runtime")), false);
    const holdPin = readFileSync(join(ROOT, "src", "hold-pin.ts"), "utf8");
    assert.equal(/from ["']node:/.test(holdPin), false);
    assert.equal(/FUNGI-SECRET/.test(holdPin), false);
  });
});
