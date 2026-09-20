import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  decodePhotonicActualTarget,
  validateOpticalChannelLayout,
  validatePhotonicLoweringPlan,
} from "../dist/index.js";

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
      assert.equal(decoded.diagnostic.code, "Galerina_PHOTONIC_ACTUAL_TARGET_INVALID");
      assert.match(decoded.diagnostic.suggestedFix, /plan\.actualTarget/);
    }
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

  it("rejects an amplitude outside (0, 1]", () => {
    assert.deepEqual(
      codes(validateOpticalChannelLayout({ channelId: "c", wavelengthNm: 1550, amplitude: 1.5 })),
      ["Galerina_PHOTONIC_AMPLITUDE_INVALID"],
    );
    assert.deepEqual(
      codes(validateOpticalChannelLayout({ channelId: "c", wavelengthNm: 1550, amplitude: 0 })),
      ["Galerina_PHOTONIC_AMPLITUDE_INVALID"],
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
