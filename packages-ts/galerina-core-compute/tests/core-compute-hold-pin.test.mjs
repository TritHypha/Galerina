import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  CORE_COMPUTE_HOLD_PIN_SCHEMA,
  admitQuantumRuntimeTarget,
  executeQuantumCompute,
  implementQuantumPlanningRules,
  prepareCoreComputeHoldRequest,
} from "../dist/hold-pin.js";
import { ADMITTED_TRIT_WIDTHS_V1 } from "../dist/rd0855-alternative-plan.js";
import { RUNTIME_TARGETS, isRuntimeTarget } from "../dist/workload.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function assertNonAuthorizing(value) {
  assert.equal(value.authorityReleased, false);
  assert.equal(value.admissionAuthority, false);
  assert.equal(Object.isFrozen(value), true);
}

describe("core-compute HOLD pin", () => {
  it("prepareCoreComputeHoldRequest packages REQUESTED_NOT_ADMITTED", () => {
    const request = prepareCoreComputeHoldRequest({ topic: "quantum-target" });
    assert.equal(request.kind, "CORE_COMPUTE_HOLD_REQUEST");
    if (request.kind !== "CORE_COMPUTE_HOLD_REQUEST") return;
    assert.equal(request.schema, CORE_COMPUTE_HOLD_PIN_SCHEMA);
    assert.equal(request.status, "REQUESTED_NOT_ADMITTED");
    assert.equal(request.topic, "quantum-target");
    assert.deepEqual({ ...request.requires }, {
      ownerDecision: true,
      ownerV1ShipDecision: true,
    });
    assertNonAuthorizing(request);
  });

  it("prepare refuses authority and malformed input", () => {
    const base = { topic: "quantum-planning-rules" };
    assert.equal(prepareCoreComputeHoldRequest({ ...base, admission: true }).code, "COMPUTE_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
    assert.equal(prepareCoreComputeHoldRequest({ ...base, quantum: true }).code, "COMPUTE_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
    assert.equal(prepareCoreComputeHoldRequest({ ...base, qubit: 1 }).code, "COMPUTE_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
    assert.equal(prepareCoreComputeHoldRequest({ ...base, qpu: "x" }).code, "COMPUTE_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
    assert.equal(prepareCoreComputeHoldRequest(null).code, "COMPUTE_HOLD_REQUEST_MALFORMED");
    assert.equal(prepareCoreComputeHoldRequest({ topic: "unknown" }).code, "COMPUTE_HOLD_REQUEST_MALFORMED");
    assert.equal(prepareCoreComputeHoldRequest({}).code, "COMPUTE_HOLD_REQUEST_MALFORMED");
  });

  it("HOLD acts always refuse even forged ADMITTED", () => {
    const request = prepareCoreComputeHoldRequest({ topic: "quantum-execution" });
    const forged = {
      kind: "ADMITTED",
      authorityReleased: true,
      admissionAuthority: true,
      quantum: true,
      qpu: "forged",
    };
    const cases = [
      [admitQuantumRuntimeTarget, "COMPUTE_QUANTUM_TARGET_FORBIDDEN"],
      [implementQuantumPlanningRules, "COMPUTE_QUANTUM_PLANNING_FORBIDDEN"],
      [executeQuantumCompute, "COMPUTE_QUANTUM_EXECUTION_FORBIDDEN"],
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

  it("v1 freeze stays 11 RuntimeTargets: no quantum target, no quantum dir, no minted family", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    assert.equal(pkg.bin, undefined);
    assert.equal(pkg.exports, undefined);
    const index = readFileSync(join(ROOT, "src", "index.ts"), "utf8");
    assert.match(index, /export \* from "\.\/hold-pin\.js"/);
    assert.equal(RUNTIME_TARGETS.length, 11);
    assert.deepEqual([...RUNTIME_TARGETS], [
      "cpu", "node", "wasm", "browser-wasm", "wasi", "gpu",
      "optical_io", "photonic", "native", "serverless", "edge",
    ]);
    assert.equal(isRuntimeTarget("quantum"), false);
    assert.equal(isRuntimeTarget("cpu"), true);
    assert.deepEqual([...ADMITTED_TRIT_WIDTHS_V1], [1, 32, 64, 256]);
    const holdPin = readFileSync(join(ROOT, "src", "hold-pin.ts"), "utf8");
    assert.equal(/from ["']node:/.test(holdPin), false);
    assert.equal(/FUNGI-QUANTUM/.test(holdPin), false);
    assert.equal(/FUNGI-COMPUTE-008/.test(holdPin), false);
    assert.equal(existsSync(join(ROOT, "src", "quantum")), false);
    const workload = readFileSync(join(ROOT, "src", "workload.ts"), "utf8");
    assert.equal(/["']quantum["']/.test(workload), false);
  });
});
