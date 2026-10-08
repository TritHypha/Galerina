import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  CORE_PHOTONIC_HOLD_PIN_SCHEMA,
  addExperimentalPhotonicTransport,
  admitOpticalTransportMode,
  implementPhotonicRuntimePlanner,
  implementPostV1PhotonicSimulation,
  prepareCorePhotonicHoldRequest,
  rewriteFungiPhotonicMeanings,
} from "../dist/hold-pin.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function assertNonAuthorizing(value) {
  assert.equal(value.authorityReleased, false);
  assert.equal(value.admissionAuthority, false);
  assert.equal(Object.isFrozen(value), true);
}

describe("core-photonic HOLD pin", () => {
  it("prepareCorePhotonicHoldRequest packages REQUESTED_NOT_ADMITTED", () => {
    const request = prepareCorePhotonicHoldRequest({ topic: "post-v1-simulation" });
    assert.equal(request.kind, "CORE_PHOTONIC_HOLD_REQUEST");
    if (request.kind !== "CORE_PHOTONIC_HOLD_REQUEST") return;
    assert.equal(request.schema, CORE_PHOTONIC_HOLD_PIN_SCHEMA);
    assert.equal(request.status, "REQUESTED_NOT_ADMITTED");
    assert.equal(request.topic, "post-v1-simulation");
    assert.deepEqual({ ...request.requires }, {
      ownerDecision: true,
      ownerV1ShipDecision: true,
      crossPackageTransportAdjudication: true,
      diagnosticMeaningOwner: true,
    });
    assertNonAuthorizing(request);
  });

  it("prepare refuses authority and malformed input", () => {
    const base = { topic: "optical-transport-mode" };
    assert.equal(prepareCorePhotonicHoldRequest({ ...base, admission: true }).code, "PHOTONIC_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
    assert.equal(prepareCorePhotonicHoldRequest({ ...base, OpticalTransportMode: "hybrid" }).code, "PHOTONIC_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
    assert.equal(prepareCorePhotonicHoldRequest({ ...base, transportMode: "Waveguide" }).code, "PHOTONIC_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
    assert.equal(prepareCorePhotonicHoldRequest(null).code, "PHOTONIC_HOLD_REQUEST_MALFORMED");
    assert.equal(prepareCorePhotonicHoldRequest({ topic: "unknown" }).code, "PHOTONIC_HOLD_REQUEST_MALFORMED");
    assert.equal(prepareCorePhotonicHoldRequest({}).code, "PHOTONIC_HOLD_REQUEST_MALFORMED");
  });

  it("HOLD acts always refuse even forged ADMITTED", () => {
    const request = prepareCorePhotonicHoldRequest({ topic: "v02-runtime-planner" });
    const forged = {
      kind: "ADMITTED",
      authorityReleased: true,
      admissionAuthority: true,
      OpticalTransportMode: "Experimental",
      PhotonicRuntimeTarget: { id: "forged" },
    };
    const cases = [
      [implementPostV1PhotonicSimulation, "PHOTONIC_POST_V1_SIMULATION_FORBIDDEN"],
      [admitOpticalTransportMode, "PHOTONIC_TRANSPORT_MODE_FORBIDDEN"],
      [implementPhotonicRuntimePlanner, "PHOTONIC_RUNTIME_PLANNER_FORBIDDEN"],
      [rewriteFungiPhotonicMeanings, "PHOTONIC_FUNGI_MEANINGS_FORBIDDEN"],
      [addExperimentalPhotonicTransport, "PHOTONIC_EXPERIMENTAL_TRANSPORT_FORBIDDEN"],
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

  it("v1 surface stays concepts-only: no transport enum, no planner dirs, no C10 meaning rewrite", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    assert.equal(pkg.bin, undefined);
    const index = readFileSync(join(ROOT, "src", "index.ts"), "utf8");
    assert.match(index, /export \* from "\.\/hold-pin\.js"/);
    assert.match(index, /export type PhotonicMode/);
    assert.match(index, /export const PHOTONIC_DIAGNOSTIC_SCHEMA = "fungi\.photonic\.diagnostic\.v1"/);
    assert.equal(/OpticalTransportMode/.test(index), false);
    assert.equal(/FUNGI-PHOTONIC/.test(index), false);
    assert.equal(/authorityReleased/.test(index), false);
    assert.equal(/PhotonicRuntimeTarget/.test(index), false);
    assert.equal(/PhotonicExecutionPlan/.test(index), false);
    const holdPinSrc = readFileSync(join(ROOT, "src", "hold-pin.ts"), "utf8");
    assert.equal(/from ["']node:/.test(holdPinSrc), false);
    assert.equal(/FUNGI-PHOTONIC/.test(holdPinSrc), false);
    assert.equal(existsSync(join(ROOT, "src", "runtime")), false);
    assert.equal(existsSync(join(ROOT, "src", "planning")), false);
    assert.equal(existsSync(join(ROOT, "src", "governance")), false);
    assert.equal(existsSync(join(ROOT, "src", "targets")), false);
  });
});
