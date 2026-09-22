import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import {
  PHOTONIC_DIAGNOSTIC_SCHEMA,
  createPhotonicReport,
  decodePhotonicDiagnostic,
  defineOpticalSignal,
  validateOpticalSignal,
  validatePhotonicMapping,
} from "../dist/index.js";

function assertCanonicalDiagnostic(diagnostic, extras = {}) {
  assert.equal(diagnostic.schema, PHOTONIC_DIAGNOSTIC_SCHEMA);
  assert.equal(typeof diagnostic.code, "string");
  assert.ok(diagnostic.code.length > 0);
  assert.ok(diagnostic.severity === "warning" || diagnostic.severity === "error");
  assert.equal(typeof diagnostic.message, "string");
  assert.ok(diagnostic.message.length > 0);
  assert.equal("safeMessage" in diagnostic, false);
  assert.equal(Object.isFrozen(diagnostic), true);
  for (const [key, value] of Object.entries(extras)) {
    assert.equal(diagnostic[key], value);
  }
}

describe("galerina-core-photonic contracts", () => {
  it("defines bounded optical signals", () => {
    assert.deepEqual(defineOpticalSignal({
      nanometers: 1550,
      phaseDegrees: 90,
      amplitude: 0.75,
    }), {
      wavelength: { nanometers: 1550 },
      phase: { degrees: 90 },
      amplitude: { value: 0.75 },
    });
    assert.equal(
      validateOpticalSignal({
        wavelength: { nanometers: -1 },
        phase: { degrees: 0 },
        amplitude: { value: 2 },
      }).length,
      2,
    );
    assert.equal(
      validateOpticalSignal({
        wavelength: { nanometers: 1550 },
        phase: { degrees: 0 },
        amplitude: { value: 0 },
      }).length,
      0,
    );
    assert.equal(
      validateOpticalSignal({
        wavelength: { nanometers: 1550 },
        phase: { degrees: 0 },
        amplitude: { value: -0 },
      }).some((diagnostic) => diagnostic.code === "Galerina_PHOTONIC_AMPLITUDE_INVALID"),
      true,
    );
  });

  it("validates logic-state mappings", () => {
    const signal = defineOpticalSignal({
      nanometers: 1310,
      phaseDegrees: 0,
      amplitude: 1,
    });
    const diagnostics = validatePhotonicMapping({
      logicPackage: "@galerina/core-logic",
      galeriname: "Tri",
      states: [
        { state: "Positive", signal },
        { state: "Positive", signal },
      ],
    });

    assert.equal(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "Galerina_PHOTONIC_MAPPING_STATE_DUPLICATE",
      ),
      true,
    );
  });

  it("creates photonic reports", () => {
    const signal = defineOpticalSignal({
      nanometers: 1550,
      phaseDegrees: 180,
      amplitude: 0.5,
    });
    const report = createPhotonicReport({
      name: "tri-plan",
      mode: "planning",
      channels: [{ name: "positive", signal }],
      mappings: [],
      report: true,
    });

    assert.equal(report.channelCount, 1);
    assert.equal(report.diagnostics.length, 0);
  });

  it("loads the Tri optical mapping example", async () => {
    const plan = JSON.parse(
      await readFile(
        new URL("../examples/tri-optical-mapping-plan.json", import.meta.url),
        "utf8",
      ),
    );
    const report = createPhotonicReport(plan);

    assert.equal(report.diagnostics.length, 0);
    assert.equal(report.channelCount, 3);
    assert.equal(report.plan.mappings[0]?.galeriname, "Tri");
  });
});

describe("decodePhotonicDiagnostic — C10 shared shape", () => {
  const canonical = {
    schema: PHOTONIC_DIAGNOSTIC_SCHEMA,
    code: "Galerina_PHOTONIC_AMPLITUDE_INVALID",
    severity: "error",
    message: "Amplitude must be a finite value from 0 to 1, excluding IEEE signed zero.",
    path: "signal.amplitude.value",
  };

  it("emits fungi.photonic.diagnostic.v1 records from validators", () => {
    const diagnostics = validateOpticalSignal({
      wavelength: { nanometers: 1550 },
      phase: { degrees: 0 },
      amplitude: { value: -0 },
    });
    assert.equal(diagnostics.length, 1);
    assertCanonicalDiagnostic(diagnostics[0], {
      code: "Galerina_PHOTONIC_AMPLITUDE_INVALID",
      severity: "error",
      path: "signal.amplitude.value",
    });
    assert.equal(Object.isFrozen(diagnostics), true);
  });

  it("admits a canonical record and a warning with suggestedFix", () => {
    const admitted = decodePhotonicDiagnostic(canonical);
    assert.equal(admitted.ok, true);
    assertCanonicalDiagnostic(admitted.value, {
      code: canonical.code,
      path: canonical.path,
    });

    const warning = decodePhotonicDiagnostic({
      schema: PHOTONIC_DIAGNOSTIC_SCHEMA,
      code: "Galerina_PHOTONIC_CHANNEL_NAME_REQUIRED",
      severity: "warning",
      message: "Optical channels require names.",
      suggestedFix: "Set plan.channels.0.name to a non-empty value.",
    });
    assert.equal(warning.ok, true);
    assertCanonicalDiagnostic(warning.value, {
      severity: "warning",
      suggestedFix: "Set plan.channels.0.name to a non-empty value.",
    });
  });

  it("refuses legacy safeMessage, missing severity, and unversioned records", () => {
    const legacy = decodePhotonicDiagnostic({
      code: "Galerina_PHOTONIC_AMPLITUDE_INVALID",
      safeMessage: "hidden vendor path /opt/secret",
      suggestedFix: "ignore",
    });
    assert.equal(legacy.ok, false);
    assertCanonicalDiagnostic(legacy.diagnostic, {
      code: "Galerina_PHOTONIC_DIAGNOSTIC_INVALID",
    });

    const unversioned = decodePhotonicDiagnostic({
      code: "Galerina_PHOTONIC_AMPLITUDE_INVALID",
      severity: "error",
      message: "Amplitude must be a finite value from 0 to 1, excluding IEEE signed zero.",
    });
    assert.equal(unversioned.ok, false);

    const info = decodePhotonicDiagnostic({
      ...canonical,
      severity: "info",
    });
    assert.equal(info.ok, false);
  });

  it("refuses accessors, surplus keys, empty message, and empty path", () => {
    const accessor = {
      schema: PHOTONIC_DIAGNOSTIC_SCHEMA,
      code: canonical.code,
      severity: "error",
      message: canonical.message,
    };
    Object.defineProperty(accessor, "message", {
      enumerable: true,
      get() { throw new Error("getter must not run"); },
    });
    assert.equal(decodePhotonicDiagnostic(accessor).ok, false);

    assert.equal(decodePhotonicDiagnostic({ ...canonical, extra: true }).ok, false);
    assert.equal(decodePhotonicDiagnostic({ ...canonical, message: " " }).ok, false);
    assert.equal(decodePhotonicDiagnostic({ ...canonical, path: "" }).ok, false);
  });
});
