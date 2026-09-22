import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PHOTONIC_DIAGNOSTIC_SCHEMA,
  decodePhotonicActualTarget,
  decodePhotonicDiagnostic,
  validateOpticalChannelLayout,
  validatePhotonicLoweringPlan,
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

const codes = (diags) => diags.map((d) => d.code);

describe("decodePhotonicActualTarget — closed runtime vocabulary", () => {
  it("admits only the six declared runtime target labels", () => {
    for (const value of [
      "photonic_hardware", "photonic_sim", "photonic_plan",
      "optical_io_interconnect", "cpu_fallback", "unsupported",
    ]) {
      assert.deepEqual(decodePhotonicActualTarget(value), { ok: true, value });
    }
  });

  it("refuses unknown, boxed, control and non-string target evidence", () => {
    for (const value of ["photonic", "PHOTONIC_SIM", "photonic_sim\u0000", new String("photonic_sim"), 1, undefined]) {
      const decoded = decodePhotonicActualTarget(value, "plan.actualTarget");
      assert.equal(decoded.ok, false);
      assertCanonicalDiagnostic(decoded.diagnostic, {
        code: "Galerina_PHOTONIC_ACTUAL_TARGET_INVALID",
        severity: "error",
        path: "plan.actualTarget",
      });
      assert.match(decoded.diagnostic.suggestedFix, /plan\.actualTarget/);
    }
  });
});

describe("decodePhotonicDiagnostic — C10 shared shape", () => {
  const canonical = {
    schema: PHOTONIC_DIAGNOSTIC_SCHEMA,
    code: "Galerina_PHOTONIC_AMPLITUDE_INVALID",
    severity: "error",
    message: "An optical channel amplitude, when set, must be a finite value in [0, 1], excluding IEEE signed zero.",
    path: "channel.amplitude",
    suggestedFix: "Set channel.amplitude to a finite value from 0 to 1 that is not signed zero.",
  };

  it("emits fungi.photonic.diagnostic.v1 records from validators", () => {
    const diagnostics = validateOpticalChannelLayout({
      channelId: "c", wavelengthNm: 1550, amplitude: -0,
    });
    assert.equal(diagnostics.length, 1);
    assertCanonicalDiagnostic(diagnostics[0], {
      code: "Galerina_PHOTONIC_AMPLITUDE_INVALID",
      severity: "error",
      path: "channel.amplitude",
    });
    assert.ok(diagnostics[0].suggestedFix);
    assert.equal(Object.isFrozen(diagnostics), true);
  });

  it("admits a canonical record and preserves warning severity", () => {
    const admitted = decodePhotonicDiagnostic(canonical);
    assert.equal(admitted.ok, true);
    assertCanonicalDiagnostic(admitted.value, {
      path: canonical.path,
      suggestedFix: canonical.suggestedFix,
    });

    const warning = decodePhotonicDiagnostic({
      schema: PHOTONIC_DIAGNOSTIC_SCHEMA,
      code: "Galerina_PHOTONIC_STATUS_INVALID",
      severity: "warning",
      message: "A lowering plan status must be one of the known photonic target statuses.",
    });
    assert.equal(warning.ok, true);
    assertCanonicalDiagnostic(warning.value, { severity: "warning" });
  });

  it("refuses legacy safeMessage instead of aliasing it to message", () => {
    const legacy = decodePhotonicDiagnostic({
      code: "Galerina_PHOTONIC_AMPLITUDE_INVALID",
      safeMessage: "vendor=/opt/secret amplitude=-0",
      suggestedFix: "retry",
    });
    assert.equal(legacy.ok, false);
    assertCanonicalDiagnostic(legacy.diagnostic, {
      code: "Galerina_PHOTONIC_DIAGNOSTIC_INVALID",
    });
    assert.equal("safeMessage" in legacy.diagnostic, false);
  });

  it("refuses missing schema, info severity, accessors, and surplus keys", () => {
    assert.equal(decodePhotonicDiagnostic({
      code: canonical.code,
      severity: "error",
      message: canonical.message,
    }).ok, false);
    assert.equal(decodePhotonicDiagnostic({ ...canonical, severity: "info" }).ok, false);

    const accessor = { ...canonical };
    Object.defineProperty(accessor, "message", {
      enumerable: true,
      get() { throw new Error("getter must not run"); },
    });
    assert.equal(decodePhotonicDiagnostic(accessor).ok, false);
    assert.equal(decodePhotonicDiagnostic({ ...canonical, extra: true }).ok, false);
  });
});

describe("validateOpticalChannelLayout — physical validity", () => {
  it("accepts a physical channel", () => {
    const diags = validateOpticalChannelLayout({
      channelId: "c0", wavelengthNm: 1550, phaseDegrees: 90, amplitude: 0.5,
    });
    assert.deepEqual(codes(diags), []);
  });

  it("rejects a non-positive wavelength", () => {
    const diags = validateOpticalChannelLayout({ channelId: "c0", wavelengthNm: 0 });
    assert.deepEqual(codes(diags), ["Galerina_PHOTONIC_WAVELENGTH_INVALID"]);
    assert.ok(diags[0].suggestedFix);
  });

  it("rejects an amplitude outside [0, 1] and IEEE signed zero", () => {
    assert.deepEqual(
      codes(validateOpticalChannelLayout({ channelId: "c", wavelengthNm: 1550, amplitude: 1.5 })),
      ["Galerina_PHOTONIC_AMPLITUDE_INVALID"],
    );
    assert.deepEqual(
      codes(validateOpticalChannelLayout({ channelId: "c", wavelengthNm: 1550, amplitude: -0 })),
      ["Galerina_PHOTONIC_AMPLITUDE_INVALID"],
    );
    assert.deepEqual(
      codes(validateOpticalChannelLayout({ channelId: "c", wavelengthNm: 1550, amplitude: 0 })),
      [],
    );
  });

  it("requires a channel id and finite phase", () => {
    const diags = validateOpticalChannelLayout({
      channelId: "", wavelengthNm: 1550, phaseDegrees: Number.POSITIVE_INFINITY,
    });
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_PHOTONIC_CHANNEL_ID_REQUIRED",
      "Galerina_PHOTONIC_PHASE_INVALID",
    ]);
  });

  it("refuses accessor, inherited, surplus and proxy-shaped records", () => {
    const accessor = { channelId: "c", wavelengthNm: 1550 };
    Object.defineProperty(accessor, "wavelengthNm", {
      enumerable: true,
      get() { return 1550; },
    });
    assert.deepEqual(
      codes(validateOpticalChannelLayout(accessor)),
      ["Galerina_PHOTONIC_CHANNEL_RECORD_INVALID"],
    );

    const inherited = Object.create({ wavelengthNm: 1550 });
    inherited.channelId = "c";
    assert.deepEqual(
      codes(validateOpticalChannelLayout(inherited)),
      ["Galerina_PHOTONIC_CHANNEL_RECORD_INVALID"],
    );

    assert.deepEqual(
      codes(validateOpticalChannelLayout({
        channelId: "c", wavelengthNm: 1550, unexpected: true,
      })),
      ["Galerina_PHOTONIC_CHANNEL_RECORD_INVALID"],
    );

    const throwingProxy = new Proxy(
      { channelId: "c", wavelengthNm: 1550 },
      { ownKeys() { throw new Error("trap"); } },
    );
    assert.deepEqual(
      codes(validateOpticalChannelLayout(throwingProxy)),
      ["Galerina_PHOTONIC_CHANNEL_RECORD_INVALID"],
    );

    assert.deepEqual(
      codes(validateOpticalChannelLayout(new Proxy({
        channelId: "c", wavelengthNm: 1550,
      }, {}))),
      ["Galerina_PHOTONIC_CHANNEL_RECORD_INVALID"],
    );
  });
});

describe("validatePhotonicLoweringPlan — no silent unsupported ops", () => {
  const mapped = [{ operation: "matrix-multiply", sourceOperation: "mm", targetOperation: "photonic-mm", channels: [] }];

  it("accepts a compatible plan that maps an operation", () => {
    const diags = validatePhotonicLoweringPlan({
      flow: "f", targetCapability: "cap", status: "photonic-compatible",
      mappedOperations: mapped, unsupportedOperations: [],
    });
    assert.deepEqual(codes(diags), []);
  });

  it("rejects an unsupported op that lacks a reason or fallback", () => {
    const diags = validatePhotonicLoweringPlan({
      flow: "f", targetCapability: "cap", status: "fallback-required",
      mappedOperations: mapped,
      unsupportedOperations: [{ operation: "signal-routing", reason: "", suggestedFallback: "" }],
    });
    assert.deepEqual(codes(diags), ["Galerina_PHOTONIC_UNSUPPORTED_OP_UNEXPLAINED"]);
  });

  it("flags a compatible plan that still carries unsupported ops (inconsistent)", () => {
    const diags = validatePhotonicLoweringPlan({
      flow: "f", targetCapability: "cap", status: "photonic-compatible",
      mappedOperations: mapped,
      unsupportedOperations: [{ operation: "x", reason: "r", suggestedFallback: "cpu" }],
    });
    assert.deepEqual(codes(diags), ["Galerina_PHOTONIC_STATUS_INCONSISTENT"]);
  });

  it("rejects an unknown status and an empty non-unsupported plan", () => {
    const diags = validatePhotonicLoweringPlan({
      flow: "f", targetCapability: "cap", status: "quantum",
      mappedOperations: [], unsupportedOperations: [],
    });
    assert.ok(codes(diags).includes("Galerina_PHOTONIC_STATUS_INVALID"));
    assert.ok(codes(diags).includes("Galerina_PHOTONIC_PLAN_EMPTY"));
  });

  it("refuses sparse, surplus and malformed nested records", () => {
    const sparse = [];
    sparse.length = 1;
    assert.deepEqual(
      codes(validatePhotonicLoweringPlan({
        flow: "f", targetCapability: "cap", status: "unsupported",
        mappedOperations: sparse, unsupportedOperations: [],
      })),
      ["Galerina_PHOTONIC_PLAN_RECORD_INVALID"],
    );

    assert.deepEqual(
      codes(validatePhotonicLoweringPlan({
        flow: "f", targetCapability: "cap", status: "unsupported",
        mappedOperations: [{
          operation: "matrix-multiply", sourceOperation: "mm",
          targetOperation: "photonic-mm", channels: [{ channelId: "c" }],
          extra: true,
        }],
        unsupportedOperations: [],
      })),
      ["Galerina_PHOTONIC_PLAN_RECORD_INVALID"],
    );

    assert.deepEqual(
      codes(validatePhotonicLoweringPlan({
        flow: "f", targetCapability: "cap", status: "unsupported",
        mappedOperations: [], unsupportedOperations: [{
          operation: "x", reason: "r", suggestedFallback: "cpu", extra: true,
        }],
      })),
      ["Galerina_PHOTONIC_PLAN_RECORD_INVALID"],
    );
  });
});
