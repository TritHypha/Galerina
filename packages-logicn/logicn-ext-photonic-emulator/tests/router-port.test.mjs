// router-port.test.mjs — createPhotonicRouterPort: the Tower-injection adapter, fail-closed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createPhotonicRouterPort, crossover } from "../dist/index.js";

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
function op(n) {
  let r = 0x2468 >>> 0; const trits = [], acts = [];
  for (let i = 0; i < n; i++) { r ^= r << 13; r >>>= 0; r ^= r >>> 17; r ^= r << 5; r >>>= 0; trits.push((r % 3) - 1); acts.push(((r >>> 3) % 7) - 3); }
  return { opClass: "feedforward", precision: "ternary", correlationId: "rp", weights: packTrits(trits), activations: Int32Array.from(acts), count: n, scale: 1 };
}

test("net-win eligible kernel → returns a tolerance-verified hit from the photonic backend", () => {
  const port = createPhotonicRouterPort();
  const n = Math.ceil(crossover(1) * 8);
  const hit = port.route(op(n), { n, lane: "photonic", tolerance: 0.05 });
  assert.ok(hit !== null, "a net-win kernel returns a hit");
  assert.equal(hit.bridgeId, "photonic-emulator");
  assert.equal(typeof hit.value, "number");
});

test("no net win (tiny kernel) → declines with null", () => {
  const port = createPhotonicRouterPort();
  assert.equal(port.route(op(4), { n: 4, lane: "photonic" }), null);
});

test("crypto / control-flow kernels → decline with null (crypto-on-core)", () => {
  const port = createPhotonicRouterPort();
  const n = Math.ceil(crossover(1) * 8);
  assert.equal(port.route(op(n), { n, lane: "photonic", isCrypto: true }), null);
  assert.equal(port.route(op(n), { n, lane: "photonic", isControlFlow: true }), null);
});

test("a declared-digital lane → declines with null (inert)", () => {
  const port = createPhotonicRouterPort();
  const n = Math.ceil(crossover(1) * 8);
  assert.equal(port.route(op(n), { n, lane: "digital" }), null);
});
