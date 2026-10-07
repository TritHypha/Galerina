import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import * as photonic from "../dist/index.js";
import {
  EXPERIMENTAL_TRANSPORT_REFUSED_CODE,
  EXPERIMENTAL_TRANSPORT_REFUSED_MESSAGE,
  PHOTONIC_CAPABILITIES,
  PHOTONIC_CAPABILITY_REFUSED_CODE,
  PHOTONIC_CAPABILITY_REFUSED_MESSAGE,
  PHOTONIC_DIAGNOSTIC_SCHEMA,
  admitExperimentalTransport,
  createPhotonicReport,
  decodePhotonicDiagnostic,
  defineOpticalSignal,
  isPhotonicCapability,
  refuseCapability,
  refuseExperimentalTransport,
  validateCapability,
  validateOpticalSignal,
  validatePhotonicMapping,
  validatePhotonicPlan,
} from "../dist/index.js";

const FORBIDDEN_EXPORT_NAMES = Object.freeze([
  "OpticalTransportMode",
  "PhotonicRuntimeTarget",
  "PhotonicExecutionPlan",
  "buildPhotonicPlan",
  "estimateOpticalSuitability",
  "resolveFallback",
  "validateIsolation",
  "validatePropagation",
  "validateHybridMode",
  "validateRealtime",
  "runtime",
  "planning",
  "targets",
]);

const FORBIDDEN_EXPORT_RE =
  /^(simulate|buildPhotonicPlan|OpticalTransportMode|PhotonicRuntimeTarget|PhotonicExecutionPlan|estimateOpticalSuitability|resolveFallback|machZehnder|opticalMatmul|wavelengthDivision)/i;

function canonicalPlan() {
  const signal = defineOpticalSignal({
    nanometers: 1550,
    phaseDegrees: 90,
    amplitude: 0.5,
  });
  return {
    name: "o1-determinism",
    mode: "planning",
    channels: [{ name: "positive", signal }],
    mappings: [
      {
        logicPackage: "@galerina/core-logic",
        galeriname: "Tri",
        states: [{ state: "Positive", signal }],
      },
    ],
    report: true,
  };
}

describe("L72 determinism over existing concept functions", () => {
  it("identical invalid signals yield identical diagnostics", () => {
    const input = {
      wavelength: { nanometers: -1 },
      phase: { degrees: Number.NaN },
      amplitude: { value: 2 },
    };
    const a = validateOpticalSignal(input);
    const b = validateOpticalSignal(input);
    assert.deepEqual(a, b);
    assert.equal(JSON.stringify(a), JSON.stringify(b));
    assert.equal(Object.isFrozen(a), true);
    assert.equal(Object.isFrozen(b), true);
  });

  it("identical mappings yield identical diagnostics", () => {
    const signal = defineOpticalSignal({
      nanometers: 1310,
      phaseDegrees: 0,
      amplitude: 1,
    });
    const mapping = {
      logicPackage: "@galerina/core-logic",
      galeriname: "Tri",
      states: [
        { state: "Positive", signal },
        { state: "Positive", signal },
      ],
    };
    assert.deepEqual(
      validatePhotonicMapping(mapping),
      validatePhotonicMapping(mapping),
    );
  });

  it("identical plans yield identical reports and plan diagnostics", () => {
    const plan = canonicalPlan();
    const reportA = createPhotonicReport(plan);
    const reportB = createPhotonicReport(plan);
    assert.deepEqual(reportA, reportB);
    assert.equal(JSON.stringify(reportA), JSON.stringify(reportB));
    assert.deepEqual(validatePhotonicPlan(plan), validatePhotonicPlan(plan));
  });

  it("identical diagnostic records decode identically", () => {
    const record = {
      schema: PHOTONIC_DIAGNOSTIC_SCHEMA,
      code: "Galerina_PHOTONIC_AMPLITUDE_INVALID",
      severity: "error",
      message:
        "Amplitude must be a finite value from 0 to 1, excluding IEEE signed zero.",
      path: "signal.amplitude.value",
    };
    assert.deepEqual(
      decodePhotonicDiagnostic(record),
      decodePhotonicDiagnostic(record),
    );
  });
});

describe("L61 refusal-only capability gate", () => {
  it("refuses every PhotonicCapability label and never grants", () => {
    assert.deepEqual([...PHOTONIC_CAPABILITIES], [
      "OpticalExecution",
      "HybridExecution",
      "ExperimentalRouting",
      "RealtimeScheduling",
    ]);
    for (const capability of PHOTONIC_CAPABILITIES) {
      assert.equal(validateCapability(capability), false);
      assert.equal(isPhotonicCapability(capability), true);
      const diagnostic = refuseCapability(capability);
      assert.equal(diagnostic.schema, PHOTONIC_DIAGNOSTIC_SCHEMA);
      assert.equal(diagnostic.code, PHOTONIC_CAPABILITY_REFUSED_CODE);
      assert.equal(diagnostic.message, PHOTONIC_CAPABILITY_REFUSED_MESSAGE);
      assert.equal(Object.isFrozen(diagnostic), true);
      assert.equal(diagnostic.message.includes(capability), false);
    }
  });

  it("ExperimentalRouting is always refused", () => {
    assert.equal(validateCapability("ExperimentalRouting"), false);
  });

  it("hostile non-labels do not grant and do not echo input", () => {
    const hostiles = ["", "grant-all", 0, null, { OpticalExecution: true }];
    for (const value of hostiles) {
      assert.equal(isPhotonicCapability(value), false);
      assert.equal(validateCapability(/** @type {any} */ (value)), false);
      const diagnostic = refuseCapability(/** @type {any} */ (value));
      assert.equal(diagnostic.code, PHOTONIC_CAPABILITY_REFUSED_CODE);
      assert.equal(diagnostic.message, PHOTONIC_CAPABILITY_REFUSED_MESSAGE);
      if (typeof value === "string" && value.length > 0) {
        assert.equal(diagnostic.message.includes(value), false);
      }
    }
  });
});

describe("L73 experimental transport refusal", () => {
  it("never admits experimental transport and emits a fixed refusal", () => {
    assert.equal(admitExperimentalTransport(), false);
    const diagnostic = refuseExperimentalTransport();
    assert.equal(diagnostic.schema, PHOTONIC_DIAGNOSTIC_SCHEMA);
    assert.equal(diagnostic.code, EXPERIMENTAL_TRANSPORT_REFUSED_CODE);
    assert.equal(diagnostic.message, EXPERIMENTAL_TRANSPORT_REFUSED_MESSAGE);
    assert.equal(diagnostic.severity, "error");
    assert.equal(Object.isFrozen(diagnostic), true);
    assert.equal("authorityReleased" in diagnostic, false);
  });
});

describe("O1 export-surface guard", () => {
  it("does not export parked helpers or planner/runtime surfaces", () => {
    const names = Object.keys(photonic);
    for (const name of names) {
      assert.equal(
        FORBIDDEN_EXPORT_NAMES.includes(name),
        false,
        `parked export present: ${name}`,
      );
      assert.equal(
        FORBIDDEN_EXPORT_RE.test(name),
        false,
        `parked export present: ${name}`,
      );
    }
    assert.equal(names.includes("validateCapability"), true);
    assert.equal(names.includes("refuseExperimentalTransport"), true);
    assert.equal(names.includes("PhotonicMode"), false);
  });

  it("package manifest stays empty of capabilities, effects and production profiles", async () => {
    const pkg = JSON.parse(
      await readFile(
        new URL("../galerina-package.json", import.meta.url),
        "utf8",
      ),
    );
    assert.deepEqual(pkg.capabilities, []);
    assert.deepEqual(pkg.effects.declares, []);
    assert.equal(pkg.effects.evidence, "NOT_OBSERVED");
    assert.deepEqual(pkg.governance.allowedProfiles, ["development"]);
    assert.equal(pkg.signature.status, "UNSIGNED");
    assert.equal(pkg.governance.requiresAudit, false);
  });
});
