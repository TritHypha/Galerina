// calibrate-witness.test.mjs — R&D 0057-parity-witness: calibration-as-attestation.
//
// Proves the ToleranceWitness is no longer a hardcoded placeholder that "gates nothing":
// calibrate() runs the real bifurcated-parity sweep and binds the MEASURED band into the
// witness, and REFUSES (fail-closed) to attest a non-conformant lane.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PhotonicEmulatorBridge, PHOTONIC, NOISY } from "../dist/index.js";
import { validateManifestShape } from "../../logicn-inference-bridge-contract/dist/index.js";

function packTrits(trits) {
  const words = Math.max(1, Math.ceil(trits.length / 16));
  const out = new Int32Array(words);
  for (let idx = 0; idx < trits.length; idx++) {
    const v = trits[idx] ?? 0;
    const enc = v === -1 ? 0 : v === 0 ? 1 : 2;
    const local = idx % 16, byteIdx = (local / 4) | 0, posInByte = local % 4;
    const shift = byteIdx * 8 + (3 - posInByte) * 2;
    out[(idx / 16) | 0] = (out[(idx / 16) | 0] | (enc << shift)) | 0;
  }
  return out;
}
const op = (trits, acts, corr = "c1") => ({ opClass: "feedforward", precision: "ternary", correlationId: corr, weights: packTrits(trits), activations: Int32Array.from(acts), count: trits.length, scale: 1 });
const CLEAN_CORPUS = [
  op([1, -1, 0, 1], [1, 1, 1, 1], "a"),
  op([1, 1, 1, -1, 0, 1], [1, -1, 1, 1, 1, 1], "b"),
  op([0, 0, 1, -1], [1, 1, -1, 1], "c"),
];

test("an uncalibrated bridge carries the placeholder witness", () => {
  const b = new PhotonicEmulatorBridge();
  assert.equal(b.isCalibrated(), false);
  assert.equal(b.manifest.toleranceWitness.epsilonMeasured, 0.02, "the constructor placeholder");
});

test("calibrate() binds the MEASURED band into the witness (replaces the placeholder)", () => {
  const b = new PhotonicEmulatorBridge();
  const report = b.calibrate(CLEAN_CORPUS);
  assert.equal(report.allConformant, true, "a clean PHOTONIC lane should be bifurcation-conformant");
  assert.equal(b.isCalibrated(), true);
  // the witness now carries the MEASURED residual + stdDev — not the literal 0.02 / 0.01
  assert.equal(b.manifest.toleranceWitness.epsilonMeasured, report.maxRelativeResidual);
  assert.equal(b.manifest.toleranceWitness.stdDev, report.residualStdDev);
  assert.ok(Number.isFinite(report.maxRelativeResidual) && report.maxRelativeResidual >= 0);
  // still admissible under the SHIPPED validator: declared tolerance >= measured epsilon
  assert.deepEqual(validateManifestShape(b.manifest), { ok: true });
  assert.ok(b.manifest.tolerance >= b.manifest.toleranceWitness.epsilonMeasured);
});

test("calibrate() is reproducible (deterministic measurement)", () => {
  const r1 = new PhotonicEmulatorBridge().calibrate(CLEAN_CORPUS);
  const r2 = new PhotonicEmulatorBridge().calibrate(CLEAN_CORPUS);
  assert.equal(r1.maxRelativeResidual, r2.maxRelativeResidual);
  assert.equal(r1.residualStdDev, r2.residualStdDev);
});

test("FAIL-CLOSED: calibrate() REFUSES a non-conformant lane (never attests divergence)", () => {
  // An impossibly tight tolerance makes every non-zero residual out-of-tolerance → not conformant.
  const b = new PhotonicEmulatorBridge({ phys: NOISY, tolerance: 1e-12 });
  const corpus = [
    op([1, -1, 1, -1, 1, -1, 1, -1], [9, 9, 9, 9, 9, 9, 9, 9], "x"),
    op([1, 1, 1, 1, -1, -1, -1, -1], [7, 7, 7, 7, 7, 7, 7, 7], "y"),
  ];
  assert.throws(() => b.calibrate(corpus), /NOT bifurcation-conformant|refusing to calibrate/);
  assert.equal(b.isCalibrated(), false, "a refused calibration leaves the bridge uncalibrated");
});
