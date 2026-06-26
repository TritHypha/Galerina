// runner.test.mjs — the fail-closed runtime path (decide → exec → re-verify → fall back).

import { test } from "node:test";
import assert from "node:assert/strict";
import { PhotonicRuntime, PhotonicEmulatorBridge, tmacExact, crossover } from "../dist/index.js";

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
// A reproducible large ternary op of size n.
function bigOp(n) {
  let r = 0x12345 >>> 0;
  const trits = [], acts = [];
  for (let i = 0; i < n; i++) { r ^= r << 13; r >>>= 0; r ^= r >>> 17; r ^= r << 5; r >>>= 0; trits.push((r % 3) - 1); acts.push(((r >>> 3) % 7) - 3); }
  return { opClass: "feedforward", precision: "ternary", correlationId: "k", weights: packTrits(trits), activations: Int32Array.from(acts), count: n, scale: 1, _trits: trits, _acts: acts };
}

test("net-win eligible kernel → routes photonic and the result passes re-verify", () => {
  const rt = new PhotonicRuntime(new PhotonicEmulatorBridge());
  const n = Math.ceil(crossover(1) * 8); // comfortably above n*
  const op = bigOp(n);
  const r = rt.run(op, { n, lane: "photonic", tolerance: 0.05 });
  assert.equal(r.target, "photonic");
  assert.equal(r.verified, true);
  assert.equal(r.fellBack, false);
});

test("sub-crossover (wash-band) kernel → stays on the unchanged digital path", () => {
  const rt = new PhotonicRuntime(new PhotonicEmulatorBridge());
  const n = Math.max(2, Math.round(crossover(1) * 0.5));
  const op = bigOp(n);
  const r = rt.run(op, { n, redundancyN: 1, lane: "photonic" });
  assert.equal(r.target, "digital");
  assert.equal(r.fellBack, false);
  assert.equal(r.value, tmacExact(op._trits, op._acts, n, 1)); // exact digital value committed
});

test("crypto kernel → digital regardless of size (crypto-on-core)", () => {
  const rt = new PhotonicRuntime(new PhotonicEmulatorBridge());
  const n = 100000, op = bigOp(64);
  const r = rt.run(op, { n, lane: "photonic", isCrypto: true });
  assert.equal(r.target, "digital");
});

test("FAIL-CLOSED: a routed-photonic kernel that fails re-verify falls back to the digital value", () => {
  const n = Math.ceil(crossover(1) * 8);
  const op = bigOp(n);
  const exact = tmacExact(op._trits, op._acts, n, 1);
  // A tampering backend: photonic execute returns a wildly out-of-tolerance value;
  // executeExact still returns the true digital value (the cheap re-verify reference).
  const tamper = {
    execute: () => ({ value: exact + 1e6, executedNatively: false, bridgeId: "tamper", technique: "ternary", latencyMs: 0, deterministic: false }),
    executeExact: () => exact,
  };
  const rt = new PhotonicRuntime(tamper);
  const r = rt.run(op, { n, lane: "photonic", tolerance: 0.05 });
  assert.equal(r.decision.target, "photonic", "router DID route photonic (the kernel is a net win)");
  assert.equal(r.target, "digital", "but the out-of-tolerance result was denied → digital");
  assert.equal(r.fellBack, true);
  assert.equal(r.verified, false);
  assert.equal(r.value, exact, "the committed value is the exact digital one, never the corrupted photonic one");
});
