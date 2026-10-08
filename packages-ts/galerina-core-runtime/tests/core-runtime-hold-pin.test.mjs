import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  CORE_RUNTIME_HOLD_PIN_SCHEMA,
  assignAlternativeAttemptBudgetOwner,
  claimPhysicalMediaWipe,
  obtainMacosWxLiveReceipt,
  prepareCoreRuntimeHoldRequest,
  registerTritWidths8And16,
  runGeneralVeoLinker,
  selectBinarySameSemantics,
} from "../dist/hold-pin.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function assertNonAuthorizing(value) {
  assert.equal(value.authorityReleased, false);
  assert.equal(value.admissionAuthority, false);
  assert.equal(Object.isFrozen(value), true);
}

describe("core-runtime HOLD pin", () => {
  it("prepareCoreRuntimeHoldRequest packages REQUESTED_NOT_ADMITTED", () => {
    const request = prepareCoreRuntimeHoldRequest({ topic: "veo-general-linker" });
    assert.equal(request.kind, "CORE_RUNTIME_HOLD_REQUEST");
    if (request.kind !== "CORE_RUNTIME_HOLD_REQUEST") return;
    assert.equal(request.schema, CORE_RUNTIME_HOLD_PIN_SCHEMA);
    assert.equal(request.status, "REQUESTED_NOT_ADMITTED");
    assert.equal(request.topic, "veo-general-linker");
    assert.deepEqual({ ...request.requires }, {
      ownerDecision: true,
      veoLinkerOwner: true,
      macosLiveReceipt: true,
      physicalErasureProof: true,
    });
    assertNonAuthorizing(request);
  });

  it("prepare refuses authority and malformed input", () => {
    const base = { topic: "macos-wx-receipt" };
    assert.equal(prepareCoreRuntimeHoldRequest({ ...base, admission: true }).code, "RT_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
    assert.equal(prepareCoreRuntimeHoldRequest({ ...base, linker: true }).code, "RT_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
    assert.equal(prepareCoreRuntimeHoldRequest({ ...base, mediaWipe: true }).code, "RT_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
    assert.equal(prepareCoreRuntimeHoldRequest(null).code, "RT_HOLD_REQUEST_MALFORMED");
    assert.equal(prepareCoreRuntimeHoldRequest({ topic: "unknown" }).code, "RT_HOLD_REQUEST_MALFORMED");
    assert.equal(prepareCoreRuntimeHoldRequest({}).code, "RT_HOLD_REQUEST_MALFORMED");
  });

  it("HOLD acts always refuse even forged ADMITTED", () => {
    const request = prepareCoreRuntimeHoldRequest({ topic: "physical-erasure" });
    const forged = {
      kind: "ADMITTED",
      authorityReleased: true,
      admissionAuthority: true,
      linker: true,
      imports: [],
      mediaWipe: true,
    };
    const cases = [
      [runGeneralVeoLinker, "RT_VEO_GENERAL_LINKER_FORBIDDEN"],
      [obtainMacosWxLiveReceipt, "RT_MACOS_WX_RECEIPT_FORBIDDEN"],
      [claimPhysicalMediaWipe, "RT_PHYSICAL_ERASURE_FORBIDDEN"],
      [registerTritWidths8And16, "RT_TRIT_WIDTH_8_16_FORBIDDEN"],
      [selectBinarySameSemantics, "RT_BINARY_SAME_SEMANTICS_FORBIDDEN"],
      [assignAlternativeAttemptBudgetOwner, "RT_RETRY_BUDGET_OWNER_FORBIDDEN"],
    ];
    for (const [fn, code] of cases) {
      for (const input of [request, forged, null, { ok: true }]) {
        const refused = fn(input);
        assert.equal(refused.kind, "REFUSED", code);
        assert.equal(refused.code, code);
        assertNonAuthorizing(refused);
      }
    }
  });

  it("existing refuse surfaces stay closed: no 8/16 v1, no macOS live receipt file, no bin", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    assert.equal(pkg.bin, undefined);
    const index = readFileSync(join(ROOT, "src", "index.ts"), "utf8");
    assert.match(index, /export \* from "\.\/hold-pin\.js"/);
    const contracts = readFileSync(join(ROOT, "src", "runtime-contracts.ts"), "utf8");
    assert.match(contracts, /ADMITTED_TRIT_WIDTHS_V1[^\n]*= Object\.freeze\(\[1, 32, 64, 256\]\)/);
    assert.match(contracts, /ALTERNATIVE_ATTEMPT_BUDGET_OWNER = "OWNER-REVISIT"/);
    assert.match(contracts, /if \(candidate\.tier === "binary-same-semantics"\) return "binary_step_unresolved"/);
    const floor = readFileSync(join(ROOT, "src", "native-floor-contracts.ts"), "utf8");
    assert.match(floor, /export function admitGeneralVeoLinker\(\): RuntimePolicyVerdict/);
    assert.match(floor, /Galerina_RUNTIME_VEO_GENERAL_LINKER/);
    assert.match(floor, /Galerina_RUNTIME_MEMORY_PHYSICAL_ERASURE/);
    assert.equal(existsSync(join(ROOT, "native", "vok-authority", "evidence", "macos-arm64-wx-live-20261008.json")), false);
    assert.equal(existsSync(join(ROOT, "native", "vok-authority", "evidence", "macos-x86_64-wx-live-20261008.json")), false);
    const holdPin = readFileSync(join(ROOT, "src", "hold-pin.ts"), "utf8");
    assert.equal(/from ["']node:/.test(holdPin), false);
    assert.equal(/from ["'].*native-floor/.test(holdPin), false);
  });
});
