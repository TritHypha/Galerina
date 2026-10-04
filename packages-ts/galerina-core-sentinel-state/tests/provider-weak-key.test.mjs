// provider-weak-key.test.mjs — a weak key handed out by an epoch provider is refused on EVERY path.
//
// The constructor always refuses a weak ACTIVE key (LSS-KEY-001), but serialize() and verify() only
// re-checked key strength under `strictKey`. A custody provider that later rotated to (or resolved an
// epoch to) an all-zero or short key therefore signed and accepted snapshots under a key an attacker
// can reproduce — the default, non-strict serializer would forge-verify them. This matches the egress
// rule ("rotating to a weak key is denied regardless of strictKey", EGR-EPOCH-003) and reuses the
// existing LSS-KEY-002 code.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { StateSerializer } from "../dist/index.js";

const STRONG = new Uint8Array(32).fill(0x5a);
const WEAK_KEYS = [
  ["all-zero 32-byte", new Uint8Array(32)],
  ["16-byte (128-bit)", new Uint8Array(16).fill(0x11)],
  ["1-byte", Uint8Array.of(1)],
];

function rotatingProvider(laterKey) {
  let calls = 0;
  return {
    active: () => {
      calls += 1;
      return calls === 1
        ? { epochId: 1, keyId: "k1", key: STRONG }
        : { epochId: 2, keyId: "k2", key: laterKey };
    },
    resolve: (epochId, keyId) =>
      epochId === 1 && keyId === "k1" ? STRONG : epochId === 2 && keyId === "k2" ? laterKey : null,
  };
}

function xorFold32(bytes) {
  let acc = 0;
  for (let i = 0; i < bytes.length; i++) acc ^= bytes[i] << ((i & 3) << 3);
  return acc >>> 0;
}

/** A snapshot MAC'd under `key` for epoch 2 / keyId "k2" — what an attacker holding a weak key can mint. */
function mintUnder(key, payload, logicalTick) {
  const payloadJson = JSON.stringify(payload);
  const xorChecksum = xorFold32(Buffer.from(payloadJson, "utf8"));
  const version = "2.0";
  const hmac = createHmac("sha256", key)
    .update(`${version}|2|k2|${logicalTick}|${xorChecksum}|${payloadJson}`, "utf8")
    .digest("hex");
  return { version, keyEpoch: 2, keyId: "k2", logicalTick, payloadJson, xorChecksum, hmac };
}

for (const [label, weak] of WEAK_KEYS) {
  for (const strictKey of [false, true]) {
    test(`serialize refuses a provider that rotated to a weak key (${label}) (strictKey=${strictKey})`, () => {
      const s = new StateSerializer({ keyProvider: rotatingProvider(weak), strictKey });
      assert.throws(() => s.serialize({ a: 1 }, 3), (e) => e.code === "LSS-KEY-002");
    });

    test(`verify refuses a snapshot whose epoch resolves to a weak key (${label}) (strictKey=${strictKey})`, () => {
      const s = new StateSerializer({ keyProvider: rotatingProvider(weak), strictKey });
      const forged = mintUnder(weak, { admin: true }, 9);
      assert.equal(s.verify(forged), false);
      assert.throws(() => s.deserialize(forged), (e) => e.code === "LSS-INTEGRITY-001");
    });
  }
}

test("control: the same provider shape with a strong rotated key still serializes and verifies", () => {
  const strong2 = new Uint8Array(32).fill(0x77);
  const s = new StateSerializer({ keyProvider: rotatingProvider(strong2) });
  const snap = s.serialize({ a: 1 }, 3);
  assert.equal(snap.keyEpoch, 2);
  assert.equal(s.verify(snap), true);
  assert.equal(s.verify(mintUnder(strong2, { b: 2 }, 4)), true);
});
