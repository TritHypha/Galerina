import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  NATIVE_DIAGNOSTIC_CODES,
  NATIVE_HOLD_PIN_SCHEMA,
  PROPOSED_FUNGI_NATIVE_MAPPING,
  PROPOSED_FUNGI_NATIVE_MAPPING_SCHEMA,
  PROPOSED_FUNGI_NATIVE_STATUS,
  isNativeDiagnosticCode,
  openNativeArtifact,
  prepareNativeOpenRequest,
  promoteNativeDiagnosticsToFungi,
} from "../dist/index.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = join(ROOT, "src");
const DIGEST = "a".repeat(64);

function assertNonAuthorizing(value) {
  assert.equal(value.authorityReleased, false);
  assert.equal(value.admissionAuthority, false);
  assert.equal(Object.isFrozen(value), true);
}

describe("native HOLD pin", () => {
  it("prepareNativeOpenRequest packages REQUESTED_NOT_OPENED", () => {
    const request = prepareNativeOpenRequest({
      path: "out/app",
      digest: DIGEST,
    });
    assert.equal(request.kind, "NATIVE_OPEN_REQUEST");
    if (request.kind !== "NATIVE_OPEN_REQUEST") return;
    assert.equal(request.schema, NATIVE_HOLD_PIN_SCHEMA);
    assert.equal(request.status, "REQUESTED_NOT_OPENED");
    assert.equal(request.locator, "out/app");
    assert.equal(request.digest, DIGEST);
    assert.deepEqual({ ...request.requires }, {
      toctouSafeOpen: true,
      digestMatch: true,
      currentVokReceipt: true,
    });
    assert.match(request.requestDigest, /^sha256:[0-9a-f]{64}$/u);
    assertNonAuthorizing(request);
  });

  it("prepareNativeOpenRequest refuses authority, malformed, and escaping locators", () => {
    const base = { path: "out/app", digest: DIGEST };
    assert.equal(prepareNativeOpenRequest({ ...base, admission: true }).code, "NT_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
    assert.equal(prepareNativeOpenRequest({ ...base, lease: "x" }).code, "NT_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
    assert.equal(prepareNativeOpenRequest({ ...base, receipt: "r" }).code, "NT_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
    assert.equal(prepareNativeOpenRequest({ ...base, vokDecision: {} }).code, "NT_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
    assert.equal(prepareNativeOpenRequest({ ...base, allow: true }).code, "NT_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
    assert.equal(prepareNativeOpenRequest(null).code, "NT_HOLD_REQUEST_MALFORMED");
    assert.equal(prepareNativeOpenRequest({ path: "out/app" }).code, "NT_HOLD_REQUEST_MALFORMED");
    assert.equal(prepareNativeOpenRequest({ path: " ", digest: DIGEST }).code, "NT_HOLD_REQUEST_MALFORMED");
    assert.equal(prepareNativeOpenRequest({ path: "out/app", digest: "not-a-sha256" }).code, "NT_HOLD_REQUEST_MALFORMED");
    assert.equal(prepareNativeOpenRequest({ path: "out/app", digest: DIGEST.toUpperCase() }).code, "NT_HOLD_REQUEST_MALFORMED");
    assert.equal(prepareNativeOpenRequest({ path: "../secret", digest: DIGEST }).code, "NT_HOLD_REQUEST_PATH_ESCAPES");
    assert.equal(prepareNativeOpenRequest({ path: "/abs/app", digest: DIGEST }).code, "NT_HOLD_REQUEST_PATH_ESCAPES");
    assert.equal(prepareNativeOpenRequest({ path: "C:/windows/app", digest: DIGEST }).code, "NT_HOLD_REQUEST_PATH_ESCAPES");
    assert.equal(prepareNativeOpenRequest({ path: "out\\app", digest: DIGEST }).code, "NT_HOLD_REQUEST_PATH_ESCAPES");
  });

  it("openNativeArtifact always NT_PHYSICAL_OPEN_FORBIDDEN", () => {
    const request = prepareNativeOpenRequest({ path: "out/app", digest: DIGEST });
    const forged = {
      kind: "OPENED",
      authorityReleased: true,
      admissionAuthority: true,
      path: "out/app",
      bytes: "00",
    };
    for (const input of [request, forged, null, { path: "out/app", digest: DIGEST }]) {
      const refused = openNativeArtifact(input);
      assert.equal(refused.kind, "REFUSED");
      assert.equal(refused.code, "NT_PHYSICAL_OPEN_FORBIDDEN");
      assertNonAuthorizing(refused);
    }
  });

  it("promoteNativeDiagnosticsToFungi always NT_FUNGI_NATIVE_PROMOTION_FORBIDDEN", () => {
    const forged = {
      kind: "PROMOTED",
      authorityReleased: true,
      codes: ["FUNGI-NATIVE-001"],
    };
    for (const input of [PROPOSED_FUNGI_NATIVE_MAPPING, forged, null, { ownerApproved: true }]) {
      const refused = promoteNativeDiagnosticsToFungi(input);
      assert.equal(refused.kind, "REFUSED");
      assert.equal(refused.code, "NT_FUNGI_NATIVE_PROMOTION_FORBIDDEN");
      assertNonAuthorizing(refused);
    }
  });

  it("proposed FUNGI-NATIVE mapping is frozen 21-row PROPOSED_NOT_ADMITTED", () => {
    assert.equal(PROPOSED_FUNGI_NATIVE_MAPPING_SCHEMA, "galerina.target-native.proposed-fungi-native-mapping.v1");
    assert.equal(PROPOSED_FUNGI_NATIVE_STATUS, "PROPOSED_NOT_ADMITTED");
    assert.equal(Object.isFrozen(PROPOSED_FUNGI_NATIVE_MAPPING), true);
    assert.equal(PROPOSED_FUNGI_NATIVE_MAPPING.length, 21);
    assert.deepEqual(
      PROPOSED_FUNGI_NATIVE_MAPPING.map((row) => row.legacy),
      [...NATIVE_DIAGNOSTIC_CODES],
    );
    assert.deepEqual(
      PROPOSED_FUNGI_NATIVE_MAPPING.map((row) => row.fungi),
      Array.from({ length: 21 }, (_, i) => `FUNGI-NATIVE-${String(i + 1).padStart(3, "0")}`),
    );
    for (const row of PROPOSED_FUNGI_NATIVE_MAPPING) {
      assert.equal(Object.isFrozen(row), true);
      assert.equal(isNativeDiagnosticCode(row.fungi), false);
      assert.equal(isNativeDiagnosticCode(row.legacy), true);
    }
  });

  it("HOLD pin codes are not live diagnostic registry members", () => {
    for (const code of [
      "NT_PHYSICAL_OPEN_FORBIDDEN",
      "NT_FUNGI_NATIVE_PROMOTION_FORBIDDEN",
      "NT_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT",
      "NT_HOLD_REQUEST_MALFORMED",
      "NT_HOLD_REQUEST_PATH_ESCAPES",
      "FUNGI-NATIVE-001",
      "FUNGI-NATIVE-021",
    ]) {
      assert.equal(isNativeDiagnosticCode(code), false, code);
      assert.equal(NATIVE_DIAGNOSTIC_CODES.includes(code), false, code);
    }
  });

  it("src never loads node:fs and index never wires the proposed vocabulary into admission", () => {
    const files = readdirSync(SRC_DIR).filter((name) => name.endsWith(".ts"));
    assert.ok(files.includes("index.ts"));
    assert.ok(files.includes("native-hold-pin.ts"));
    assert.ok(files.includes("proposed-os-arch-vocabulary.ts"));
    assert.ok(files.includes("proposed-fungi-native-mapping.ts"));
    for (const name of files) {
      const source = readFileSync(join(SRC_DIR, name), "utf8");
      assert.equal(/from ["']node:fs["']/.test(source), false, name);
      assert.equal(/from ["']fs["']/.test(source), false, name);
      assert.equal(/\bfs\.open\b/.test(source), false, name);
      assert.equal(/\breadFile(?:Sync)?\b/.test(source), false, name);
    }
    const index = readFileSync(join(SRC_DIR, "index.ts"), "utf8");
    assert.equal(index.includes("proposedNativeVocabularyDiagnostics("), false);
    assert.equal(index.includes("openNativeArtifact("), false);
    assert.equal(/["']FUNGI-NATIVE-/.test(index), false);
  });
});
