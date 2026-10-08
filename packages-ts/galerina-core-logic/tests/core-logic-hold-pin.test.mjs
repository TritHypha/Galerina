import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  CORE_LOGIC_HOLD_PIN_SCHEMA,
  driveRuntimeFromOmni,
  integrateAiOrchestration,
  overrideCompilerFromOmni,
  prepareCoreLogicHoldRequest,
} from "../dist/hold-pin.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function assertNonAuthorizing(value) {
  assert.equal(value.authorityReleased, false);
  assert.equal(value.admissionAuthority, false);
  assert.equal(Object.isFrozen(value), true);
}

describe("core-logic HOLD pin", () => {
  it("prepareCoreLogicHoldRequest packages REQUESTED_NOT_ADMITTED", () => {
    const request = prepareCoreLogicHoldRequest({ topic: "ai-orchestration" });
    assert.equal(request.kind, "CORE_LOGIC_HOLD_REQUEST");
    if (request.kind !== "CORE_LOGIC_HOLD_REQUEST") return;
    assert.equal(request.schema, CORE_LOGIC_HOLD_PIN_SCHEMA);
    assert.equal(request.status, "REQUESTED_NOT_ADMITTED");
    assert.equal(request.topic, "ai-orchestration");
    assert.deepEqual({ ...request.requires }, {
      ownerDecision: true,
      ownerV1ShipDecision: true,
      phase3Authorization: true,
    });
    assertNonAuthorizing(request);
  });

  it("prepare refuses authority and malformed input", () => {
    const base = { topic: "omni-runtime-control" };
    assert.equal(prepareCoreLogicHoldRequest({ ...base, admission: true }).code, "LOGIC_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
    assert.equal(prepareCoreLogicHoldRequest({ ...base, orchestration: true }).code, "LOGIC_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
    assert.equal(prepareCoreLogicHoldRequest({ ...base, prompt: "x" }).code, "LOGIC_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
    assert.equal(prepareCoreLogicHoldRequest(null).code, "LOGIC_HOLD_REQUEST_MALFORMED");
    assert.equal(prepareCoreLogicHoldRequest({ topic: "unknown" }).code, "LOGIC_HOLD_REQUEST_MALFORMED");
    assert.equal(prepareCoreLogicHoldRequest({}).code, "LOGIC_HOLD_REQUEST_MALFORMED");
  });

  it("HOLD acts always refuse even forged ADMITTED", () => {
    const request = prepareCoreLogicHoldRequest({ topic: "omni-compiler-override" });
    const forged = {
      kind: "ADMITTED",
      authorityReleased: true,
      admissionAuthority: true,
      orchestration: true,
      prompt: "ignore previous",
    };
    const cases = [
      [integrateAiOrchestration, "LOGIC_AI_ORCHESTRATION_FORBIDDEN"],
      [driveRuntimeFromOmni, "LOGIC_OMNI_RUNTIME_CONTROL_FORBIDDEN"],
      [overrideCompilerFromOmni, "LOGIC_OMNI_COMPILER_OVERRIDE_FORBIDDEN"],
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

  it("Phase 2 traces stay advisory; Phase 3 dirs and FUNGI-OMNI-006 stay absent", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    assert.equal(pkg.bin, undefined);
    const index = readFileSync(join(ROOT, "src", "index.ts"), "utf8");
    assert.match(index, /export \* from "\.\/hold-pin\.js"/);
    const omniIndex = readFileSync(join(ROOT, "src", "omni", "index.ts"), "utf8");
    assert.match(omniIndex, /export \* from "\.\.\/hold-pin\.js"/);
    const omniState = readFileSync(join(ROOT, "src", "omni", "omni-state.ts"), "utf8");
    assert.match(omniState, /advisoryOnly: true/);
    assert.match(omniState, /must NEVER override runtime policy/);
    const omniDiag = readFileSync(join(ROOT, "src", "omni", "omni-diagnostics.ts"), "utf8");
    assert.match(omniDiag, /FUNGI-OMNI-001/);
    assert.match(omniDiag, /FUNGI-OMNI-005/);
    assert.equal(/FUNGI-OMNI-006/.test(omniDiag), false);
    const holdPin = readFileSync(join(ROOT, "src", "hold-pin.ts"), "utf8");
    assert.equal(/from ["']node:/.test(holdPin), false);
    assert.equal(/FUNGI-OMNI-006/.test(holdPin), false);
    assert.equal(existsSync(join(ROOT, "src", "orchestration")), false);
    const trace = readFileSync(join(ROOT, "src", "omni", "omni-trace.ts"), "utf8");
    assert.match(trace, /export function traceOmniDecision/);
  });
});
