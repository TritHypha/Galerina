// serializer.test.mjs — the cryptographic core: serialize/verify/deserialize.

import { test } from "node:test";
import assert from "node:assert/strict";
import { StateSerializer, SecurityTrap } from "../dist/index.js";

test("serialize → verify true; deserialize round-trips an object", () => {
  const s = new StateSerializer();
  const payload = { a: 1, b: [1, 2, 3] };
  const snap = s.serialize(payload, 42);
  assert.equal(s.verify(snap), true);
  assert.equal(snap.logicalTick, 42);
  assert.deepEqual(s.deserialize(snap), payload);
});

test("tampering payloadJson → verify false; deserialize throws SecurityTrap LSS-INTEGRITY-001", () => {
  const s = new StateSerializer();
  const snap = s.serialize({ a: 1, b: [1, 2, 3] }, 7);
  const tampered = { ...snap, payloadJson: snap.payloadJson.replace("1", "9") };
  assert.equal(s.verify(tampered), false);
  const err = caught(() => s.deserialize(tampered));
  assert.ok(err instanceof SecurityTrap);
  assert.equal(err.code, "LSS-INTEGRITY-001");
});

test("tampering xorChecksum → verify false", () => {
  const s = new StateSerializer();
  const snap = s.serialize({ x: "hello" }, 1);
  const tampered = { ...snap, xorChecksum: (snap.xorChecksum ^ 0xff) >>> 0 };
  assert.equal(s.verify(tampered), false);
});

test("tampering hmac → verify false", () => {
  const s = new StateSerializer();
  const snap = s.serialize({ x: "hello" }, 1);
  const flipped = snap.hmac.slice(0, -1) + (snap.hmac.endsWith("a") ? "b" : "a");
  const tampered = { ...snap, hmac: flipped };
  assert.equal(s.verify(tampered), false);
});

test("a snapshot signed with key A fails verify under a serializer with key B", () => {
  const keyA = new Uint8Array(32).fill(0xaa);
  const keyB = new Uint8Array(32).fill(0xbb);
  const sa = new StateSerializer({ hmacKey: keyA });
  const sb = new StateSerializer({ hmacKey: keyB });
  const snap = sa.serialize({ secret: true }, 99);
  assert.equal(sa.verify(snap), true);
  assert.equal(sb.verify(snap), false);
  const err = caught(() => sb.deserialize(snap));
  assert.ok(err instanceof SecurityTrap);
  assert.equal(err.code, "LSS-INTEGRITY-001");
});

function caught(fn) {
  try {
    fn();
    return null;
  } catch (e) {
    return e;
  }
}
